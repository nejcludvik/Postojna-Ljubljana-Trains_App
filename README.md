# Postojna ↔ Ljubljana Trains

Mobile-first PWA for checking rail departures between **Postojna** and **Ljubljana** in both directions.

## Data sources

- **Scheduled timetable:** official DUJPP GTFS dataset, distributed under CC BY-SA 4.0 and downloaded through MobilityDatabase's daily mirror of the official feed.
- **Realtime delay/cancellation updates:** public IJPP GTFS-Realtime feed exposed by oJPP/DERP.
- **Official timetable catalogue:** https://nap.si/en/datasets
- **Official DUJPP feed producer URL:** https://b2b.nap.si/data/b2b.gtfs (registration/OAuth required).

The application no longer scrapes `potniski.sz.si`, because SŽ blocks Render server requests with HTTP 403.

## Features

- Postojna → Ljubljana and Ljubljana → Postojna
- Today, tomorrow and +2 days
- Scheduled train times from GTFS
- Realtime delay/cancellation matching when GTFS-RT data is available
- Next train card
- Leave-for-station calculation
- Favourite/usual trains stored locally in the browser
- Mobile-first PWA
- Automatic refresh every ~2 minutes

## Local development

Requires Node.js 20+.

```bash
npm install
npm start
```

Open `http://localhost:3000`.

The first timetable request after a fresh server start can take longer because the server downloads and indexes the current national GTFS package. The index is then kept in memory and refreshed approximately every 12 hours.

## Render

Use the GitHub `main` branch.

- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check: `/health`

No environment variables are required.

### Optional fixed GTFS URL

If MobilityDatabase's page format ever changes, set a Render environment variable named `GTFS_URL` to a direct ZIP URL containing the official DUJPP GTFS package. Normally this is not required.

## Attribution

DUJPP timetable dataset: CC BY-SA 4.0. Realtime data is obtained from the public oJPP/DERP GTFS-RT gateway. Always check official operator information when a disruption is critical to your journey.
