# Postojna ↔ Ljubljana Trains

Mobile-first PWA for checking trains in both directions between Postojna and Ljubljana.

## Features
- Postojna → Ljubljana and Ljubljana → Postojna with one-tap direction switching.
- Today, tomorrow and +2 day timetable views.
- Current delay information from official Slovenske železnice pages.
- Replacement-bus and relevant route notice display.
- **Usual trains:** tap ★ on any departure and it is saved locally on that device.
- **Leave-for-station countdown:** configure how many minutes you need to reach Postojna and Ljubljana stations. The next-train card calculates when to leave, including a currently reported delay.
- **Usual-train notifications:** after permission is granted, the PWA notifies you when a saved train's reported delay changes or the source marks it cancelled.
- Automatic refresh approximately every 6 minutes plus refresh whenever the PWA returns to the foreground.
- Installable PWA for mobile home screens.

## Notification behaviour
The current version uses the browser/PWA Notification API. Alerts are checked whenever the app refreshes, including its six-minute refresh cycle while open and when you return to the app.

Reliable notifications while the PWA is completely closed require a server-side Web Push service (push subscription + VAPID keys + scheduled SŽ checks). That is best added when the project is deployed, because it needs a persistent public backend and secure environment variables. The current architecture is ready for that later upgrade.

## Data source
The server retrieves two official Slovenske železnice – Potniški promet pages:
1. Timetable results, using station IDs Postojna `44009` and Ljubljana `42300`.
2. Help and Travel Updates, used for current delay information and route notices.

Data is cached on the server for 5 minutes. The app refreshes approximately every 6 minutes.

## Privacy
Usual trains, station travel times and the notification preference are stored only in browser `localStorage`. No account is required and these preferences are not transmitted to Slovenske železnice.

## Run
Requires Node.js 20+ (no npm dependencies).

```bash
npm start
```

Then open http://localhost:3000

## GitHub / deployment later
The repository is already structured for GitHub:

```text
/
  package.json
  server.js
  README.md
  public/
    index.html
    app.js
    styles.css
    sw.js
    manifest.json
    icon.svg
```

Because live SŽ retrieval runs on the server, deploy the whole Node project rather than only the `public` folder. A static GitHub Pages deployment alone cannot run `server.js`; use GitHub for source control and connect the repository to a Node-capable host such as Render, Railway, Fly.io or another server/VPS.

## Notes
- This is an independent convenience app and is not affiliated with Slovenske železnice.
- SŽ can change its webpage markup. The parsing logic is intentionally isolated in `server.js` so it can be updated without changing the mobile UI.
- Before public/commercial distribution, confirm that your intended automated-access frequency and use complies with SŽ website terms/robots/policies.
