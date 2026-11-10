# Security Policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Instead, use GitHub's
private vulnerability reporting: go to the **Security** tab of this repository
and choose **Report a vulnerability**.

## Scope

This is a static site with one serverless function. The function calls the
[OpenWeather API](https://openweathermap.org/api) using a key stored as a Netlify
environment variable, so the key is never sent to the browser. The site has no
user accounts; your units and last searched place are stored only in your own
browser (`localStorage`). If you use "Use my location", your coordinates are
sent to the function only to look up the weather and are not stored.
