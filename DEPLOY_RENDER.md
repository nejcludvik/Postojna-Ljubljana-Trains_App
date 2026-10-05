# Deploy to Render

This version replaces direct SŽ webpage scraping with GTFS data, so the previous SŽ HTTP 403 issue should no longer apply.

## Update GitHub

Replace the files in the `Postojna-Ljubljana-Trains_App` repository with this version and commit to `main`.

Render Auto-Deploy should detect the commit automatically.

If you need to check the service settings:

- Service type: Web Service
- Branch: `main`
- Root directory: blank
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/health`

No environment variables are required.

## After deployment

Open:

`https://postojna-ljubljana-trains.onrender.com/health`

Expected response contains:

```json
{"ok":true,"service":"postojna-ljubljana-trains","version":"1.4.0"}
```

Then open:

`https://postojna-ljubljana-trains.onrender.com`

The first timetable load after a brand-new deployment may take noticeably longer because the national GTFS ZIP is around 90 MB and must be indexed once. Subsequent calls are much faster.

## Render logs

On a successful first load you should see log messages similar to:

```text
Downloading DUJPP GTFS…
GTFS downloaded: ... MB
GTFS indexed: ... rail journeys touching both stations
```

If the GTFS-Realtime service is temporarily unavailable, scheduled trains should still display; they will show `SCHEDULED` rather than falsely claiming they are on time.
