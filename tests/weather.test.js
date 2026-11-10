// Run with: npm test   (uses Node's built-in test runner, no dependencies)
const test = require('node:test');
const assert = require('node:assert');
const { handler, summarizeDays, parseLocation } = require('../netlify/functions/weather.js')._internal;

const TZ = -5 * 3600; // New York in November
const START = Date.UTC(2026, 10, 10, 15, 0, 0) / 1000; // 10:00 local

function slot(hoursFromStart, { min, max, id = 800, pop = 0 }) {
  return {
    dt: START + hoursFromStart * 3600,
    main: { temp_min: min, temp_max: max },
    weather: [{ id, description: `code ${id}` }],
    pop,
  };
}

// 40 three-hour slots, like the real /forecast response
const forecastList = Array.from({ length: 40 }, (_, i) =>
  slot(i * 3, { min: 40 + (i % 8), max: 45 + (i % 8), id: i === 1 ? 500 : 800, pop: i === 1 ? 0.65 : 0.05 }));

const currentBody = {
  name: 'Yonkers', dt: START, timezone: TZ,
  sys: { country: 'US', sunrise: START - 10000, sunset: START + 20000 },
  main: { temp: 47.6, feels_like: 44.2, humidity: 71 },
  wind: { speed: 9.2 },
  weather: [{ id: 500, description: 'light rain', icon: '10d' }],
};

function mockFetch(status = 200) {
  const calls = [];
  const fn = async url => {
    calls.push(url);
    const body = status !== 200 ? { cod: String(status), message: 'city not found' }
      : url.includes('/forecast?') ? { list: forecastList } : currentBody;
    return { status, json: async () => body };
  };
  fn.calls = calls;
  return fn;
}

test('summarizeDays groups 3-hour slots into 5 local days', () => {
  const days = summarizeDays(forecastList, TZ);
  assert.strictEqual(days.length, 5);
  assert.strictEqual(days[0].date, '2026-11-10');
  assert.strictEqual(days[1].date, '2026-11-11');
  // Slot 1 (13:00 local today) is the representative, rainy, 65% chance
  assert.strictEqual(days[0].conditionId, 500);
  assert.strictEqual(days[0].pop, 65);
  for (const d of days) assert.ok(d.max >= d.min);
});

test('parseLocation validates input', () => {
  assert.deepStrictEqual(parseLocation({ city: '  Paris, FR ' }).query, { q: 'Paris, FR' });
  assert.ok(parseLocation({ city: 'x'.repeat(101) }).error);
  assert.deepStrictEqual(parseLocation({ lat: '40.9312', lon: '-73.8988' }).query, { lat: '40.9312', lon: '-73.8988' });
  assert.ok(parseLocation({ lat: '200', lon: '0' }).error);
  assert.ok(parseLocation({}).error);
});

test('handler returns a trimmed payload and keeps the key server-side', async () => {
  process.env.API_KEY = 'secret-key';
  const fetchImpl = mockFetch();
  const res = await handler({ queryStringParameters: { city: 'Yonkers&appid=evil', units: 'imperial' } }, {}, fetchImpl);
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.current.temp, 48);
  assert.strictEqual(body.current.isDay, true);
  assert.strictEqual(body.daily.length, 5);
  assert.ok(!res.body.includes('secret-key'));
  // City text is URL-encoded, so it can't inject extra query parameters
  assert.ok(fetchImpl.calls.every(u => u.includes('q=Yonkers%26appid%3Devil')));
});

test('handler maps errors to friendly messages', async () => {
  process.env.API_KEY = 'secret-key';
  const notFound = await handler({ queryStringParameters: { city: 'Nowhereville' } }, {}, mockFetch(404));
  assert.strictEqual(notFound.statusCode, 404);
  const down = await handler({ queryStringParameters: { city: 'Yonkers' } }, {}, mockFetch(500));
  assert.strictEqual(down.statusCode, 502);
  const bad = await handler({ queryStringParameters: {} }, {}, mockFetch());
  assert.strictEqual(bad.statusCode, 400);
  delete process.env.API_KEY;
  const noKey = await handler({ queryStringParameters: { city: 'Yonkers' } }, {}, mockFetch());
  assert.strictEqual(noKey.statusCode, 500);
});
