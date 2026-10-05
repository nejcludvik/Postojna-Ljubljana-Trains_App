# Postojna ↔ Ljubljana Trains

Mobile-first PWA for checking trains between Postojna and Ljubljana in both directions.

## Features
- Postojna → Ljubljana and Ljubljana → Postojna
- Today / Tomorrow / +2 days
- Official Slovenske železnice timetable data
- Current delay information and relevant travel alerts
- Automatic refresh approximately every 6 minutes
- Save usual trains locally on the device
- Configurable travel time to each station and "leave for station" guidance
- Installable PWA

## Run locally
Requires Node.js 20+.

```bash
npm install
npm start
```

Then open `http://localhost:3000`.

## Deploy
See `DEPLOY_RENDER.md`.

No database, account, VAPID keys, or push-notification configuration is required.
