# Gio's Weather App ⛅

Current weather and a 5-day forecast for any city. The whole background is a live sky that matches the conditions: rain falls when it's raining, snow drifts when it's snowing, storms flash with lightning, and clear nights fill with stars.

### ✨ Features

- 🌦️ Animated skies for clear, partly cloudy, cloudy, drizzle, rain, thunderstorm, snow and fog, with separate day and night looks
- 📅 5-day forecast with daily highs and lows drawn on a shared temperature scale, plus chance of precipitation
- 📍 "Use my location" button, or search any city (add a country code like `Paris, FR` to be specific)
- 🌡️ °F / °C toggle; your units and last city are remembered in your browser
- 🕒 Local time, sunrise and sunset shown in the city's own time zone
- 📱 Responsive layout for phones and desktops
- ♿ Keyboard friendly, screen-reader labels on the forecast, and the animations freeze for people who turn on "reduce motion"

### 🛠️ Technologies Used

- HTML5, CSS3 (custom animations, no images) and vanilla JavaScript
- [OpenWeather](https://openweathermap.org/api) current weather and 5-day / 3-hour forecast APIs
- A Netlify Function (`netlify/functions/weather.js`) that keeps the API key on the server and combines both API calls into one small response
- Netlify for hosting

### 🚀 Running it

1. Get a free API key from [OpenWeather](https://home.openweathermap.org/api_keys).
2. In Netlify, add it as an environment variable named `API_KEY` (Site configuration → Environment variables).
3. Deploy. `netlify.toml` already points Netlify at the site and the function.

To run locally with the [Netlify CLI](https://docs.netlify.com/cli/get-started/):

```bash
API_KEY=your_key netlify dev
```

Run the function tests (Node 18+, no dependencies):

```bash
npm test
```
