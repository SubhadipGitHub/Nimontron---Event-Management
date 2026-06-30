# Nimontron — Event, Invite & Plate Manager

নিমন্ত্রণ (*nimontron*, Bengali for "invitation") — invitations, RSVPs, and food-plate tracking for an event, in one place.

A no-build, static web app for running the guest-facing and operational side of an event (designed with weddings in mind, but generic enough for any plated event). Each event gets its own isolated guest list and three access codes — and each role gets **its own page**, so nobody needs more access than their job requires.

**Live demo / your deployment:** once deployed (see below), the app is reachable at `https://<your-github-username>.github.io/<repo-name>/`.

## Pages, one per role

| Page | Who it's for | Access |
|---|---|---|
| [`index.html`](index.html) | Everyone — landing page, picks a role | none (just navigation) |
| [`guest.html`](guest.html) | Guests | event code only |
| [`counter.html`](counter.html) | Plate-serving staff | event code + **counter** code |
| [`organizer.html`](organizer.html) | Event organizer | event code + **organizer** code (also where new events are created) |
| [`client.html`](client.html) | The couple/family — read-only | event code + **client** code |

Every staff page works as a **standalone, bookmarkable link**: `organizer.html` has a "Share with your team & guests" panel that prints out each page's direct link (`…/guest.html?event=<id>`, etc.) with a copy button, so people never have to go through `index.html` or guess a code from a generic page — they get exactly the link for their role. A counter-code holder can't load organizer or client functionality at all (the page simply doesn't ship that JS), and each role's access code is independent of the others.

## What it does

- **Counter page** — type or scan a guest's short code to mark a plate served. Once a guest's allotment is used up, a second serve is blocked unless a manager enters the override PIN and a reason. Includes name lookup for guests who lost their code, and a recent-activity feed.
- **Organizer page** — add guests one at a time or via bulk paste (`name, phone, group, side, meal type, plates allotted`), search/filter the guest list, edit event details (couple's names, fun facts, meal/side options), upload one shared invite image/GIF/MP4, set the override PIN, manage all three access codes, copy direct share links per role, and reset all guest/serving data. Also where new events are created — right after creation (and any time after, from Settings), an **"Email me these details"** button opens a pre-filled draft in the organizer's own mail app with the event name, all three access codes, and all four role links, for safekeeping.
- **Client page** — read-only live dashboard: invites sent vs. responded, confirmed headcount, RSVP breakdown (attending/declined/maybe/pending), accommodation room requests, plates served by meal type, and a transparency log of every override (who approved it, why, when).
- **Guest page** — guests find their own pass by name (last 4 phone digits to disambiguate), see their invite card and a generated "plate pass" with a random doodle, fun fact, and tagline, RSVP with a party size, request accommodation, and print their pass.
- **Invite sending** (organizer) — builds a per-guest invite message (with their code and the event code) and sends it via the Web Share API or a WhatsApp deep link; tracks sent/follow-up status per guest.
- **Printable passes** — single pass or a full print run of every guest's pass, styled for a grid print layout.

## How it's built

- Five static HTML pages, no dependencies to install, no build step, no package.json. Open any of them in a browser to run it.
- **`styles.css`** — one shared jewel-tone wedding theme (deep wine/maroon, emerald, foil gold, ruby, ivory paper) used by every page, so the look can't drift between roles.
- **`app.js`** — shared logic loaded before each page's own script: Firebase init + storage shim, state helpers, the pass-card/invite-text builders, RSVP logic, and the generic boot sequence every page runs (resolve the event from `?event=<id>` or an inline code-entry panel, then — for counter/organizer/client — gate on that role's own access code, remembered per-device via `localStorage`).
- **`guest.js` / `counter.js` / `organizer.js` / `client.js`** — each page's own logic. A guest's browser never downloads organizer/counter code and vice versa.
- State per event is a single `{ meta, guests[] }` object, re-fetched and re-rendered on every mutation, on Firebase realtime change events, and on a 15s poll as a fallback — so multiple devices/roles see near-live updates.
- **Persistence**: `window.storage.get(key, shared)` / `.set(key, value, shared)` (both async), defined in `app.js`:
  - `shared:true` (event data — guest list, meta, invite media, the events index) is read/written to **Firebase Realtime Database**, so every device sees the same live data.
  - `shared:false` ("this browser already unlocked organizer/counter/client mode") is kept in **`localStorage`** — intentionally per-device, so unlocking on one phone doesn't unlock it everywhere.
- Each guest record carries: code, contact/group/side/meal info, plate allotment & served count, a served/override log, RSVP status, accommodation needs, and invite-sent tracking.

## Deploying

> **This repo is already wired up.** Every page points at a live Firebase Realtime Database (project `nimontron-events`) with rules scoped to this app's `nimontron/` path, so it works as-is once published — no setup needed unless you're forking this into your own Firebase project. The steps below are for that fork case.

You need two things: a free Firebase Realtime Database (for cross-device sync), and a static host for the HTML files (GitHub Pages).

### 1. Create a Firebase Realtime Database

1. Go to the [Firebase console](https://console.firebase.google.com/) and create a project (no billing needed — the free Spark plan is enough for this).
2. In the project, open **Build → Realtime Database** and click **Create Database**. Pick a region; start in **test mode** for now (you'll lock it down in step 3).
3. Go to **Project settings → General → Your apps**, click the `</>` (Web) icon to register a new web app (no Hosting needed), and copy the `firebaseConfig` object it gives you.
4. Open `app.js` and paste your values into the `firebaseConfig` block near the top (search for `YOUR_API_KEY` if you've reset it back to a placeholder):
   ```js
   const firebaseConfig = {
     apiKey: "...",
     authDomain: "...",
     databaseURL: "...",
     projectId: "...",
   };
   ```
   Because all five pages load `app.js`, this only needs to be set in one place.
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
4. GitHub will publish the site at `https://<your-username>.github.io/<repo-name>/` within a minute or two. All five HTML files at the repo root are served automatically — `index.html` at the root URL, the others at `/guest.html`, `/counter.html`, `/organizer.html`, `/client.html`.

After that, anyone with the link can open `organizer.html`, create an event, and use its "Share with your team & guests" panel to hand out the right link + code to counter staff, the client, and guests.

## Running it locally

Fill in `firebaseConfig` in `app.js` first (see above), then just open any of the HTML files in a browser — no server or build step required. Without a valid Firebase config, storage calls will fail and the app will show its "not syncing" banner.

## Security note (by design, stated in-app)

Access codes are a light gate to keep casual visitors out of an event's data — explicitly **not** intended as strong security. Splitting each role onto its own page with its own code (instead of one shared "staff" code) meaningfully separates *what each role's browser can even attempt* — a counter-code holder's page never loads guest-list-editing or settings code, and can't derive the organizer code from it. It is still not cryptographic access control: the Firebase rules above stay open at the `nimontron/` path, so anyone who inspects network traffic is still talking to an open database underneath the code gates. Don't use this for sensitive data. True enforcement would require adding Firebase Authentication, which this project doesn't currently do.
