# Deploy Postojna ↔ Ljubljana Trains on Render

This app must be deployed as a **Web Service**, not a Static Site, because `server.js` fetches Slovenske železnice data and sends Web Push notifications.

## 1. Upload this repository to GitHub

Use the repository:

`Postojna-Ljubljana-Trains_App`

Recommended branch:

`main`

Keep the folder structure exactly as supplied. In particular, keep the `public/` folder. Do not move `index.html` to the repository root when deploying to Render.

## 2. Generate VAPID keys

On any computer with Node.js installed, run inside the project folder:

```bash
npm install
npx web-push generate-vapid-keys
```

Copy the generated **Public Key** and **Private Key** somewhere safe. Never commit the private key to GitHub.

## 3. Create a Render Web Service

1. Sign in to Render.
2. Choose **New → Web Service**.
3. Connect GitHub if needed.
4. Select `Postojna-Ljubljana-Trains_App`.
5. Configure:

| Render field | Value |
|---|---|
| Name | `postojna-ljubljana-trains` |
| Region | Frankfurt (recommended for Slovenia) |
| Branch | `main` |
| Root Directory | leave blank |
| Runtime / Language | `Node` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Health Check Path | `/health` |
| Auto-Deploy | Yes / On Commit |

The free instance is sufficient for initial testing. Be aware that free Render services can spin down and do not provide persistent local disks.

## 4. Add environment variables

Add these under Render → Environment:

```text
VAPID_PUBLIC_KEY=<your generated public key>
VAPID_PRIVATE_KEY=<your generated private key>
VAPID_SUBJECT=mailto:<your email address>
```

Do not add `PORT`; Render supplies it automatically.

`NODE_VERSION=20` is optional because the repository already requests Node 20+ in `package.json`; `render.yaml` also specifies it.

## 5. Create the service

Click **Create Web Service**. Render will install dependencies and run `npm start`.

After a successful deployment Render provides an HTTPS URL similar to:

`https://postojna-ljubljana-trains.onrender.com`

Open that URL on your phone. HTTPS is required for production Web Push and service workers.

## 6. Enable notifications

1. Open the deployed app.
2. Save at least one usual train with the star button.
3. Open Settings.
4. Enable notifications.
5. Allow the browser notification permission.
6. For the best PWA behavior, add/install the app on the phone home screen.

## 7. Persistent push subscriptions

By default the app stores push subscriptions under `.data/`. Render's free web-service filesystem is ephemeral, so subscriptions can be lost after a restart or redeploy.

For testing, this is acceptable: simply reopen the app and re-enable notifications if needed.

For reliable long-term use, choose one of these later:

- **Render paid service + Persistent Disk**: set `DATA_DIR=/var/data` and mount a Render disk at `/var/data`.
- **Supabase/PostgreSQL**: recommended if you want durable subscriptions while keeping the web service architecture independent of a local disk.

## 8. Updating the app later

With Auto-Deploy enabled, your workflow is simply:

1. edit files;
2. commit to GitHub;
3. push to `main`;
4. Render automatically builds and deploys the new commit.

No GitHub Pages configuration is required.
