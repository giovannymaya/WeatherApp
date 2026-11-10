'use strict';

const API_URL = '/.netlify/functions/weather';
const PREFS_KEY = 'gioWeatherPrefs';

// How many animated particles each scene gets. Fewer on small screens.
const PARTICLES = {
    rain: 110,
    drizzle: 55,
    storm: 140,
    snow: 80,
    stars: 90,
};
const CLOUDS = { partly: 3, cloudy: 7, drizzle: 6, rain: 7, storm: 8, snow: 6, fog: 4 };

const $ = id => document.getElementById(id);

const els = {
    body: document.body,
    sky: $('sky'),
    form: $('search-form'),
    city: $('city'),
    locate: $('locate'),
    unitButtons: [...document.querySelectorAll('.unit')],
    status: $('status'),
    welcome: $('welcome'),
    report: $('report'),
    place: $('place'),
    localTime: $('local-time'),
    temp: $('temp'),
    tempUnit: $('temp-unit'),
    condition: $('condition'),
    feels: $('feels'),
    humidity: $('humidity'),
    wind: $('wind'),
    sunrise: $('sunrise'),
    sunset: $('sunset'),
    forecastList: $('forecast-list'),
    themeColor: document.querySelector('meta[name="theme-color"]'),
};

const state = {
    units: 'imperial',
    query: null, // last place that loaded: { city } or { lat, lon }
    requestId: 0,
};

/* --------------------------------------------------------------------------
   Preferences (last search + units), kept in this browser only
   -------------------------------------------------------------------------- */
function loadPrefs() {
    try {
        return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
    } catch {
        return {};
    }
}

function savePrefs() {
    try {
        localStorage.setItem(PREFS_KEY, JSON.stringify({ units: state.units, query: state.query }));
    } catch {
        // Storage can be unavailable (private mode); the app works without it.
    }
}

/* --------------------------------------------------------------------------
   Weather condition → scene / icon
   OpenWeather condition codes: https://openweathermap.org/weather-conditions
   -------------------------------------------------------------------------- */
function sceneFor(conditionId) {
    if (conditionId >= 200 && conditionId < 300) return 'storm';
    if (conditionId >= 300 && conditionId < 400) return 'drizzle';
    if (conditionId === 511) return 'snow'; // freezing rain
    if (conditionId >= 500 && conditionId < 600) return 'rain';
    if (conditionId >= 600 && conditionId < 700) return 'snow';
    if (conditionId >= 700 && conditionId < 800) return 'fog';
    if (conditionId === 800) return 'clear';
    if (conditionId === 801 || conditionId === 802) return 'partly';
    return 'cloudy';
}

// Small icons for the forecast rows. These are fixed strings written here,
// never built from API data, so inserting them as markup is safe.
const CLOUD_PATH = 'M10 26h17a6 6 0 0 0 .6-12A8 8 0 0 0 12.4 12 7 7 0 0 0 10 26z';
const ICONS = {
    clear: `<circle class="i-sun" cx="20" cy="20" r="7"/>
        <g class="i-ray">${[0, 45, 90, 135, 180, 225, 270, 315].map(a =>
            `<line x1="20" y1="5" x2="20" y2="9" transform="rotate(${a} 20 20)"/>`).join('')}</g>`,
    clearNight: '<path class="i-moon" d="M25 6a12 12 0 1 0 9 19A10 10 0 0 1 25 6z"/>',
    partly: `<circle class="i-sun" cx="14" cy="13" r="6"/>
        <g class="i-ray">${[0, 60, 120, 180, 270, 315].map(a =>
            `<line x1="14" y1="2.5" x2="14" y2="5" transform="rotate(${a} 14 13)"/>`).join('')}</g>
        <path class="i-cloud" transform="translate(3 6)" d="${CLOUD_PATH}"/>`,
    partlyNight: `<path class="i-moon" d="M15 5a8 8 0 1 0 7 12A7 7 0 0 1 15 5z"/>
        <path class="i-cloud" transform="translate(3 6)" d="${CLOUD_PATH}"/>`,
    cloudy: `<path class="i-cloud-dark" transform="translate(-4 -4) scale(.9)" d="${CLOUD_PATH}"/>
        <path class="i-cloud" transform="translate(2 4)" d="${CLOUD_PATH}"/>`,
    drizzle: `<path class="i-cloud" transform="translate(0 -4)" d="${CLOUD_PATH}"/>
        <g class="i-drop"><line x1="14" y1="27" x2="13" y2="30"/><line x1="22" y1="27" x2="21" y2="30"/></g>`,
    rain: `<path class="i-cloud-dark" transform="translate(0 -4)" d="${CLOUD_PATH}"/>
        <g class="i-drop"><line x1="12" y1="26" x2="10" y2="32"/><line x1="19" y1="26" x2="17" y2="34"/><line x1="26" y1="26" x2="24" y2="32"/></g>`,
    storm: `<path class="i-cloud-dark" transform="translate(0 -5)" d="${CLOUD_PATH}"/>
        <path class="i-bolt" d="M20 21l-5 8h4l-2 7 7-10h-4l2-5z"/>`,
    snow: `<path class="i-cloud" transform="translate(0 -4)" d="${CLOUD_PATH}"/>
        <g class="i-flake"><circle cx="12" cy="29" r="1.8"/><circle cx="20" cy="32" r="1.8"/><circle cx="28" cy="29" r="1.8"/></g>`,
    fog: `<path class="i-cloud" transform="translate(0 -7)" d="${CLOUD_PATH}"/>
        <g class="i-fog"><line x1="7" y1="25" x2="31" y2="25"/><line x1="10" y1="30" x2="34" y2="30"/></g>`,
};

function iconSvg(scene, isDay = true) {
    let key = scene;
    if (!isDay && scene === 'clear') key = 'clearNight';
    if (!isDay && scene === 'partly') key = 'partlyNight';
    return `<svg class="icon" viewBox="0 0 40 40" aria-hidden="true">${ICONS[key]}</svg>`;
}

/* --------------------------------------------------------------------------
   Sky scene
   -------------------------------------------------------------------------- */
const rand = (min, max) => min + Math.random() * (max - min);

function particle(className, vars) {
    const node = document.createElement('span');
    node.className = className;
    for (const [name, value] of Object.entries(vars)) node.style.setProperty(name, value);
    return node;
}

function fill(container, count, make) {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) frag.appendChild(make(i));
    container.replaceChildren(frag);
}

const lastScene = { key: '' };

function setScene(scene, isDay) {
    const time = isDay ? 'day' : 'night';
    els.sky.dataset.scene = scene;
    els.sky.dataset.time = time;

    // Only rebuild particles when the scene actually changes.
    const key = `${scene}-${time}`;
    if (key === lastScene.key) return;
    lastScene.key = key;

    const density = window.innerWidth < 600 ? 0.5 : 1;
    const precip = els.sky.querySelector('.sky-precip');
    const clouds = els.sky.querySelector('.sky-clouds');
    const stars = els.sky.querySelector('.sky-stars');

    // Rain, drizzle and storms: thin falling streaks. Negative delays start
    // each drop part-way through its fall so the sky is full immediately.
    if (scene === 'rain' || scene === 'drizzle' || scene === 'storm') {
        const light = scene === 'drizzle';
        fill(precip, Math.round(PARTICLES[scene] * density), () => {
            const dur = light ? rand(1.1, 1.8) : rand(0.45, 0.8);
            return particle('drop', {
                '--x': `${rand(-10, 110)}%`,
                '--len': `${light ? rand(8, 14) : rand(14, 26)}vh`,
                '--o': (light ? rand(0.25, 0.45) : rand(0.35, 0.7)).toFixed(2),
                '--width': light ? '1px' : '1.5px',
                '--dur': `${dur.toFixed(2)}s`,
                '--delay': `${(-rand(0, dur)).toFixed(2)}s`,
            });
        });
    } else if (scene === 'snow') {
        fill(precip, Math.round(PARTICLES.snow * density), () => {
            const size = rand(3, 9);
            const dur = rand(9, 18);
            return particle('flake', {
                '--x': `${rand(-5, 105)}%`,
                '--size': `${size.toFixed(1)}px`,
                '--o': rand(0.55, 0.95).toFixed(2),
                '--blur': size > 7 ? '1px' : '0px',
                '--sway': `${rand(15, 45).toFixed(0)}px`,
                '--dur': `${dur.toFixed(1)}s`,
                '--delay': `${(-rand(0, dur)).toFixed(1)}s`,
            });
        });
    } else {
        precip.replaceChildren();
    }

    // Clouds drift slowly; bigger, slower ones feel further away.
    fill(clouds, CLOUDS[scene] || 0, i => {
        const w = rand(180, 420);
        const dur = rand(70, 140) * (w / 300);
        return particle('cloud', {
            '--y': `${rand(-4, scene === 'partly' ? 30 : 55).toFixed(0)}vh`,
            '--w': `${w.toFixed(0)}px`,
            '--o': rand(0.55, 0.95).toFixed(2),
            '--dur': `${dur.toFixed(0)}s`,
            '--delay': `${(-rand(0, dur) - i).toFixed(0)}s`,
        });
    });

    if (!isDay) {
        fill(stars, Math.round(PARTICLES.stars * density), () => particle('star', {
            '--x': `${rand(0, 100)}%`,
            '--y': `${rand(0, 70)}%`,
            '--size': `${rand(1, 2.6).toFixed(1)}px`,
            '--dur': `${rand(2, 5).toFixed(1)}s`,
            '--delay': `${(-rand(0, 5)).toFixed(1)}s`,
        }));
    } else {
        stars.replaceChildren();
    }

    // Tint the mobile browser bar to match the sky once its colour fade has finished.
    clearTimeout(setScene.tintTimer);
    setScene.tintTimer = setTimeout(() => {
        const top = getComputedStyle(els.sky).getPropertyValue('--sky-top').trim();
        if (top) els.themeColor.setAttribute('content', top);
    }, 1300);
}

/* --------------------------------------------------------------------------
   Formatting (times are shown in the city's own local time)
   -------------------------------------------------------------------------- */
function cityTime(unixSeconds, tzOffset, options) {
    return new Date((unixSeconds + tzOffset) * 1000)
        .toLocaleString(undefined, { ...options, timeZone: 'UTC' });
}

function dayLabel(isoDate, todayIso) {
    if (isoDate === todayIso) return 'Today';
    return new Date(`${isoDate}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });
}

function formatWind(speed, units) {
    // OpenWeather sends m/s for metric; km/h is what most people read.
    return units === 'metric' ? `${Math.round(speed * 3.6)} km/h` : `${Math.round(speed)} mph`;
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/* --------------------------------------------------------------------------
   Rendering
   -------------------------------------------------------------------------- */
function renderForecast(daily, todayIso) {
    const lows = Math.min(...daily.map(d => d.min));
    const highs = Math.max(...daily.map(d => d.max));
    const span = Math.max(highs - lows, 1);

    const rows = daily.map(day => {
        const scene = sceneFor(day.conditionId);
        const li = el('li', 'day');
        const name = dayLabel(day.date, todayIso);

        const icon = el('span', 'day-icon');
        icon.innerHTML = iconSvg(scene, true); // trusted constant markup
        icon.title = day.description;

        const pop = el('span', 'day-pop', day.pop >= 20 ? `${day.pop}%` : '');
        if (day.pop >= 20) pop.title = 'Chance of precipitation';

        const range = el('span', 'range');
        const fillBar = el('span', 'range-fill');
        fillBar.style.setProperty('--from', `${((day.min - lows) / span) * 100}%`);
        fillBar.style.setProperty('--to', `${((highs - day.max) / span) * 100}%`);
        range.appendChild(fillBar);

        li.append(
            el('span', 'day-name', name),
            icon,
            pop,
            el('span', 'day-low', `${day.min}°`),
            range,
            el('span', 'day-high', `${day.max}°`),
        );
        li.setAttribute('aria-label',
            `${name}: ${day.description}, low ${day.min}°, high ${day.max}°` +
            (day.pop >= 20 ? `, ${day.pop}% chance of precipitation` : ''));
        return li;
    });

    els.forecastList.replaceChildren(...rows);
}

function render(data) {
    const { location, current, daily, units } = data;
    const tz = location.timezoneOffset;
    const unitLabel = units === 'metric' ? 'C' : 'F';
    const timeOpts = { hour: 'numeric', minute: '2-digit' };

    els.place.textContent = location.country ? `${location.name}, ${location.country}` : location.name;
    els.localTime.textContent = `${cityTime(Math.floor(Date.now() / 1000), tz, { weekday: 'long', ...timeOpts })} local time`;
    els.temp.textContent = current.temp;
    els.tempUnit.textContent = `°${unitLabel}`;
    els.condition.textContent = current.description;
    els.feels.textContent = `Feels like ${current.feelsLike}°`;
    els.humidity.textContent = `${current.humidity}%`;
    els.wind.textContent = formatWind(current.windSpeed, units);
    els.sunrise.textContent = cityTime(current.sunrise, tz, timeOpts);
    els.sunset.textContent = cityTime(current.sunset, tz, timeOpts);

    const todayIso = new Date((current.dt + tz) * 1000).toISOString().slice(0, 10);
    renderForecast(daily, todayIso);

    setScene(sceneFor(current.conditionId), current.isDay);
    document.title = `${current.temp}° ${location.name} · Gio's Weather App`;

    els.welcome.classList.add('hidden');
    els.report.classList.remove('hidden');
}

function setStatus(message, isError = false) {
    els.status.textContent = message;
    els.status.classList.toggle('is-error', isError);
}

/* --------------------------------------------------------------------------
   Data
   -------------------------------------------------------------------------- */
async function loadWeather(query) {
    const requestId = ++state.requestId; // ignore responses from older searches
    const params = new URLSearchParams({ ...query, units: state.units });

    els.body.classList.add('is-loading');
    setStatus(els.report.classList.contains('hidden') ? 'Checking the sky…' : '');

    try {
        const res = await fetch(`${API_URL}?${params}`);
        const data = await res.json().catch(() => ({}));
        if (requestId !== state.requestId) return;

        if (!res.ok) {
            setStatus(data.message || 'Something went wrong getting the weather. Try again.', true);
            return;
        }
        // Only remember a place once it has loaded, so a typo doesn't replace
        // the last good city (and the °F/°C toggle keeps working on it).
        state.query = query;
        savePrefs();
        setStatus('');
        render(data);
        if (query.city) els.city.value = query.city;
    } catch {
        if (requestId !== state.requestId) return;
        setStatus('You seem to be offline. Check your connection and try again.', true);
    } finally {
        if (requestId === state.requestId) els.body.classList.remove('is-loading');
    }
}

function setUnits(units) {
    state.units = units;
    els.unitButtons.forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.units === units)));
}

/* --------------------------------------------------------------------------
   Events
   -------------------------------------------------------------------------- */
els.form.addEventListener('submit', event => {
    event.preventDefault();
    const city = els.city.value.trim();
    if (!city) {
        setStatus('Type a city name first.', true);
        els.city.focus();
        return;
    }
    loadWeather({ city });
});

els.locate.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
        setStatus('This browser can’t share your location. Search for a city instead.', true);
        return;
    }
    els.locate.classList.add('is-busy');
    navigator.geolocation.getCurrentPosition(
        pos => {
            els.locate.classList.remove('is-busy');
            els.city.value = '';
            loadWeather({ lat: pos.coords.latitude.toFixed(4), lon: pos.coords.longitude.toFixed(4) });
        },
        () => {
            els.locate.classList.remove('is-busy');
            setStatus('Location access was blocked. Search for a city instead.', true);
        },
        { timeout: 10000, maximumAge: 600000 },
    );
});

els.unitButtons.forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.units === state.units) return;
    setUnits(btn.dataset.units);
    savePrefs();
    if (state.query) loadWeather(state.query);
}));

/* --------------------------------------------------------------------------
   Start
   -------------------------------------------------------------------------- */
(function init() {
    const prefs = loadPrefs();
    const defaultUnits = /^en-US\b/.test(navigator.language || '') ? 'imperial' : 'metric';
    setUnits(prefs.units === 'metric' || prefs.units === 'imperial' ? prefs.units : defaultUnits);

    const hour = new Date().getHours();
    setScene('clear', hour >= 6 && hour < 19);

    if (prefs.query && (prefs.query.city || (prefs.query.lat && prefs.query.lon))) {
        loadWeather(prefs.query);
    }
})();
