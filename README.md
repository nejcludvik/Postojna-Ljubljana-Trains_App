# Postojna ↔ Ljubljana Trains

Mobile-first installable PWA for checking trains between **Postojna** and **Ljubljana** in both directions using official Slovenske železnice public timetable and traffic information.

## Features

- Postojna → Ljubljana and Ljubljana → Postojna
- Today / Tomorrow / +2 days
- Current SŽ delay information
- Relevant route notices
- Saved usual trains
- Configurable travel time to each station
- “Leave in X min” commuter guidance
- Installable PWA / home-screen app
- Background Web Push alerts for saved trains
- Cancellation and changed-delay alerts
- Automatic refresh approximately every 6 minutes

## Repository structure

```text
Postojna-Ljubljana-Trains_App/
├── .env.example
├── .gitignore
├── DEPLOY_RENDER.md
├── README.md
├── package.json
├── render.yaml
├── server.js
└── public/
    ├── app.js
    ├── icon.svg
    ├── index.html
    ├── manifest.json
    ├── styles.css
    └── sw.js
```

`server.js` serves both the API and the files in `public/`, so the entire application is deployed as one Node web service.

## Requirements

- Node.js 20+
- HTTPS in production (Render provides HTTPS automatically)

## Local setup

```bash
npm install
npm start
```

Open:

`http://localhost:3000`

## Generate Web Push keys

Run once:

```bash
npx web-push generate-vapid-keys
```

Set the generated keys as environment variables:

```text
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:your-email@example.com
```

Never commit your private VAPID key.

See **DEPLOY_RENDER.md** for the complete Render deployment walkthrough.

## Storage

Push subscriptions default to:

`.data/push-subscriptions.json`

You can override the storage location with:

```text
DATA_DIR=/path/to/persistent/storage
```

This is useful with a Render Persistent Disk. On Render's free web-service tier the local filesystem is ephemeral, so this storage is suitable for testing but not durable production subscriptions.

## Health check

The server exposes:

`GET /health`

Render can use this endpoint as its health-check path.

## Data sources

The application reads public timetable and travel-update information from Slovenske železnice – Potniški promet. The backend normalizes that data for the PWA and limits its refresh rate to approximately the cadence used by the official delay information.
