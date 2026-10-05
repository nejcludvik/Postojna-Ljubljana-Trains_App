# Postojna ↔ Ljubljana Trains

Mobile-first PWA for checking trains between Postojna and Ljubljana in both directions using official Slovenske železnice public timetable / traffic information.

## Features

- Postojna → Ljubljana and Ljubljana → Postojna
- Today / Tomorrow / +2 days
- Current SŽ delay information
- Route notices
- Saved usual trains
- Configurable travel time to each station
- “Leave in X min” commuter guidance
- PWA / home-screen installation
- Background Web Push alerts for saved trains, including when the app is closed

## Requirements

- Node.js 20+
- HTTPS in production (required by Web Push; localhost is allowed for development)

## Install

```bash
npm install
```

## Create VAPID keys

Run once locally:

```bash
npx web-push generate-vapid-keys
```

Keep the private key secret. Do **not** commit it to GitHub.

Set these environment variables on your deployment service:

```text
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:your-email@example.com
```

## Run

```bash
npm start
```

Open `http://localhost:3000`.

## Deployment

The GitHub repository can contain the full source, but GitHub Pages alone is not enough for background notifications because the app needs a running Node backend that:

1. checks SŽ roughly every 6 minutes;
2. stores Web Push subscriptions;
3. sends push messages when a saved train's delay changes or it is cancelled.

Deploy the repository as a Node web service (for example Render, Railway or Fly.io), set the VAPID environment variables there, and use the generated HTTPS URL as the installed PWA.

### Persistent subscription storage

This version stores subscriptions in `.data/push-subscriptions.json`. That is intentionally excluded from Git.

For a small personal always-on server with persistent disk this is sufficient. If the host has an ephemeral filesystem or multiple instances, move subscription storage to a persistent database (for example PostgreSQL/Supabase) before relying on it long-term.
