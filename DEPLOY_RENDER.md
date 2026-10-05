# Deploy to Render

1. Push this repository to GitHub on the `main` branch.
2. Open Render and select **New > Web Service**.
3. Connect the GitHub repository `Postojna-Ljubljana-Trains_App`.
4. Use:
   - Branch: `main`
   - Root Directory: leave blank
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Health Check Path: `/health`
   - Plan: Free is sufficient for initial use
5. No environment variables are required.
6. Deploy. Render will provide an HTTPS `onrender.com` URL.

The app frontend is served from `public/` by `server.js`. Do not configure this repository as a Render Static Site or GitHub Pages site because `/api/trains` requires the Node server.
