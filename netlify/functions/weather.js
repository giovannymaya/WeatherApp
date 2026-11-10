// Netlify function: proxies OpenWeatherMap so the API key never reaches the browser.
// Returns current conditions plus a 5-day daily forecast in one trimmed response.
//
//   GET /.netlify/functions/weather?city=Yonkers&units=imperial
//   GET /.netlify/functions/weather?lat=40.93&lon=-73.89&units=metric

const OWM_BASE = 'https://api.openweathermap.org/data/2.5';
const UNITS = new Set(['metric', 'imperial']);
const MAX_CITY_LENGTH = 100;
const FORECAST_DAYS = 5;

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
    body: JSON.stringify(body),
  };
}

// Build the location part of the query from validated input, or return an error message.
function parseLocation(params) {
  const city = (params.city || '').trim();
  if (city) {
    if (city.length > MAX_CITY_LENGTH) return { error: 'City name is too long.' };
    return { query: { q: city } };
  }
  const lat = Number(params.lat);
  const lon = Number(params.lon);
  if (params.lat !== undefined && params.lon !== undefined &&
      Number.isFinite(lat) && Number.isFinite(lon) &&
      Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    return { query: { lat: lat.toFixed(4), lon: lon.toFixed(4) } };
  }
  return { error: 'Enter a city name or allow location access.' };
}

function round(n) {
  return Math.round(n);
}

// "YYYY-MM-DD" and hour for a UTC timestamp shifted into the city's local time.
function localParts(unixSeconds, tzOffsetSeconds) {
  const d = new Date((unixSeconds + tzOffsetSeconds) * 1000);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

// The 5-day forecast endpoint returns 3-hour slots. Collapse them into one entry per
// local day: high/low across the day, the highest chance of precipitation, and the
// condition from the slot closest to early afternoon (what people mean by "the day's weather").
function summarizeDays(list, tzOffsetSeconds) {
  const days = new Map();
  for (const slot of list) {
    const { date, hour } = localParts(slot.dt, tzOffsetSeconds);
    if (!days.has(date)) days.set(date, { date, min: Infinity, max: -Infinity, pop: 0, rep: null, repDistance: Infinity });
    const day = days.get(date);
    day.min = Math.min(day.min, slot.main.temp_min);
    day.max = Math.max(day.max, slot.main.temp_max);
    day.pop = Math.max(day.pop, slot.pop || 0);
    const distance = Math.abs(hour - 13);
    if (distance < day.repDistance) {
      day.rep = slot;
      day.repDistance = distance;
    }
  }
  return [...days.values()].slice(0, FORECAST_DAYS).map(day => ({
    date: day.date,
    min: round(day.min),
    max: round(day.max),
    pop: Math.round(day.pop * 100),
    conditionId: day.rep.weather[0].id,
    description: day.rep.weather[0].description,
  }));
}

function shapeResponse(current, forecast, units) {
  const tz = current.timezone || 0;
  return {
    units,
    location: {
      name: current.name,
      country: current.sys && current.sys.country,
      timezoneOffset: tz,
    },
    current: {
      dt: current.dt,
      temp: round(current.main.temp),
      feelsLike: round(current.main.feels_like),
      humidity: current.main.humidity,
      windSpeed: current.wind.speed, // m/s (metric) or mph (imperial); the page formats it
      conditionId: current.weather[0].id,
      description: current.weather[0].description,
      isDay: current.weather[0].icon.endsWith('d'),
      sunrise: current.sys.sunrise,
      sunset: current.sys.sunset,
    },
    daily: summarizeDays(forecast.list, tz),
  };
}

async function owm(path, query, fetchImpl) {
  const url = `${OWM_BASE}/${path}?${new URLSearchParams(query)}`;
  const res = await fetchImpl(url);
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function handler(event, _context, fetchImpl = fetch) {
  const params = event.queryStringParameters || {};
  const units = UNITS.has(params.units) ? params.units : 'metric';

  const apiKey = process.env.API_KEY;
  if (!apiKey) return json(500, { message: 'The weather service is not configured.' });

  const location = parseLocation(params);
  if (location.error) return json(400, { message: location.error });

  const query = { ...location.query, units, appid: apiKey };

  try {
    const [current, forecast] = await Promise.all([
      owm('weather', query, fetchImpl),
      owm('forecast', query, fetchImpl),
    ]);

    if (current.status === 404 || forecast.status === 404) {
      return json(404, { message: 'We couldn’t find that city. Check the spelling, or add a country code like "Paris, FR".' });
    }
    if (current.status !== 200 || forecast.status !== 200) {
      return json(502, { message: 'The weather service didn’t respond. Try again in a minute.' });
    }

    return json(200, shapeResponse(current.data, forecast.data, units), {
      // Weather changes slowly; let the CDN and browser reuse a result for 10 minutes.
      'Cache-Control': 'public, max-age=600',
    });
  } catch (err) {
    console.error('Weather lookup failed:', err);
    return json(502, { message: 'The weather service didn’t respond. Try again in a minute.' });
  }
}

exports.handler = (event, context) => handler(event, context);
// Exposed for tests.
exports._internal = { handler, summarizeDays, parseLocation };
