# Nimontron — Event, Invite & Plate Manager

নিমন্ত্রণ (*nimontron*, Bengali for "invitation") — invitations, RSVPs, and food-plate tracking for an event, in one place.

A single-file, no-build web app for running the guest-facing and operational side of an event (designed with weddings in mind, but generic enough for any plated event). Each event gets its own isolated guest list and three access codes that gate four different views of the same live data.

**Live demo / your deployment:** once deployed (see below), the app is reachable at `https://<your-github-username>.github.io/<repo-name>/`.

## What it does

- **Event picker** — open an existing event by its event code, or create a new one (auto-generates an event code, organizer code, and client code).
- **Counter view** (organizer-gated) — type or scan a guest's short code to mark a plate served. Once a guest's allotment is used up, a second serve is blocked unless a manager enters the override PIN and a reason. Includes name lookup for guests who lost their code, and a recent-activity feed.
- **Organizer view** (organizer-gated) — add guests one at a time or via bulk paste (`name, phone, group, side, meal type, plates allotted`), search/filter the guest list, edit event details (couple's names, fun facts, meal/side options), upload one shared invite image/GIF/MP4, set the override PIN, manage the three access codes, and reset all guest/serving data.
- **Client view** (client-gated, read-only) — live dashboard: invites sent vs. responded, confirmed headcount, RSVP breakdown (attending/declined/maybe/pending), accommodation room requests, plates served by meal type, and a transparency log of every override (who approved it, why, when).
- **RSVP / guest view** (public) — guests find their own pass by name (last 4 phone digits to disambiguate), see their invite card and a generated "plate pass" with a random doodle, fun fact, and tagline, RSVP with a party size, request accommodation, and print their pass.
- **Invite sending** — builds a per-guest invite message (with their code and the event code) and sends it via the Web Share API or a WhatsApp deep link; tracks sent/follow-up status per guest.
- **Printable passes** — single pass or a full print run of every guest's pass, styled for a grid print layout.

## How it's built

- Single HTML file (`index.html`) — no dependencies to install, no build step, no package.json. Open it in a browser to run it.
- Styling is hand-rolled CSS (custom properties for an "ink/brass/paper" theme) plus Google Fonts (Fraunces, IBM Plex Sans, IBM Plex Mono).
- All app logic is plain JS in one `<script>` block: state is a single `{ meta, guests[] }` object per event, re-fetched and re-rendered on every mutation, on Firebase realtime change events, and on a 15s poll as a fallback — so multiple devices/roles see near-live updates.
- **Persistence** goes through a small `window.storage` shim (`get(key, shared)` / `set(key, value, shared)`, both async), defined near the top of the main `<script>` block:
  - `shared:true` (event data — guest list, meta, invite media, the events index) is read/written to **Firebase Realtime Database**, so every device sees the same live data.
  - `shared:false` ("this browser already unlocked organizer/client mode") is kept in **`localStorage`** — intentionally per-device, so unlocking on one phone doesn't unlock it everywhere.
- Each guest record carries: code, contact/group/side/meal info, plate allotment & served count, a served/override log, RSVP status, accommodation needs, and invite-sent tracking.

## Deploying

> **This repo is already wired up.** `index.html` points at a live Firebase Realtime Database (project `nimontron-events`) with rules scoped to this app's `nimontron/` path, so it works as-is once published — no setup needed unless you're forking this into your own Firebase project. The steps below are for that fork case.

You need two things: a free Firebase Realtime Database (for cross-device sync), and a static host for the HTML file (GitHub Pages).

### 1. Create a Firebase Realtime Database

1. Go to the [Firebase console](https://console.firebase.google.com/) and create a project (no billing needed — the free Spark plan is enough for this).
2. In the project, open **Build → Realtime Database** and click **Create Database**. Pick a region; start in **test mode** for now (you'll lock it down in step 3).
3. Go to **Project settings → General → Your apps**, click the `</>` (Web) icon to register a new web app (no Hosting needed), and copy the `firebaseConfig` object it gives you.
4. Open `index.html` and paste your values into the `firebaseConfig` block near the top of the `<script>` section (search for `YOUR_API_KEY`):
   ```js
   const firebaseConfig = {
     apiKey: "...",
     authDomain: "...",
     databaseURL: "...",
     projectId: "...",
   };
   ```
5. In the Realtime Database console, go to the **Rules** tab and set:
   ```json
   {
     "rules": {
       "nimontron": {
         ".read": true,
         ".write": true
       }
     }
   }
   ```
   This matches the app's existing security model (event/access codes are a light gate, not auth — see the note below). Anyone who can reach your database URL can read/write any event's data, so don't put sensitive information into an event.

### 2. Publish with GitHub Pages

1. Push this repo to GitHub (if it isn't already).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch", branch `main`, folder `/ (root)`. Save.
4. GitHub will publish the site at `https://<your-username>.github.io/<repo-name>/` within a minute or two — `index.html` is served automatically at that root URL.

After that, anyone with the link can open the app, create an event, and share the event/organizer/client codes with their counter staff, clients, and guests.

## Running it locally

Fill in `firebaseConfig` first (see above), then just open `index.html` in a browser — no server or build step required. Without a valid Firebase config, storage calls will fail and the app will show its "not syncing" banner.

## Security note (by design, stated in-app)

Access codes are a light gate to keep casual visitors out of an event's data — explicitly **not** intended as strong security. Don't use this for sensitive data. Event data is shared with everyone holding that event's codes; that's what lets the counter, client, and guest views stay in sync.
