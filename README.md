# Bogeys and Bunkers

A web app for managing a Monday Night Golf League — built with vanilla HTML, CSS, and JavaScript, backed by Firebase Firestore.

**Live site:** https://golfleagueapp-74095.web.app

---

## Features

- **Standings** — live team points calculated from all scored rounds
- **Handicaps** — auto-calculated from each player's last 3 rounds; updates weekly
- **Score Entry** — hole-by-hole score cards with net scoring, stroke allocation, and live point totals
- **Schedule** — full season schedule with front/back nine assignments and match pairings
- **Matchups** — week-by-week match previews with handicap-adjusted pairings
- **Stats** — per-player season totals (rounds, avg score, birdies, pars, points, etc.)
- **Substitute Players** — global sub roster; subs inherit handicap history across seasons
- **Admin Drawer** — manage teams, players, schedule, substitutes, and course settings
- **PWA** — installable on iPhone via Safari → Add to Home Screen; works offline

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | Vanilla HTML / CSS / JavaScript (no framework, no build step) |
| Database | Firebase Firestore (real-time sync) |
| Auth | Firebase Authentication (email/password) |
| Hosting | Firebase Hosting |
| Fonts | Google Fonts — Barlow, Fraunces, Chewy |

---

## Project Structure

```
webapp/
├── index.html              # App shell, routing, Firebase SDK tags
├── app.js                  # All application logic
├── styles.css              # Design system (CSS custom properties)
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker (offline cache)
├── firestore.rules         # Firestore security rules
├── firebase.json           # Firebase Hosting + Firestore config
├── icons/                  # PWA icons (192px, 512px, SVG)
└── capacitor-setup-plan.txt  # Plan for native iOS/Android app (future)
```

---

## Data Model

Each season lives in a single Firestore document at `league/{year}`:

```
teams        — team names, players, starting handicaps
schedule     — weeks, dates, front/back nine, match pairings
scores       — hole-by-hole scores keyed by week → match → player
subAssignments — substitute player assignments per match slot
courseData   — par and hole handicap for all 18 holes
```

A separate global document at `league/subs` stores the substitute player roster (shared across all seasons).

---

## Deploying

No build step — deploy root files directly to Firebase Hosting:

```bash
~/.npm-global/bin/firebase deploy --only hosting
```

**Always bump the service worker cache version in `sw.js` before deploying** (`bogeys-v9` → `bogeys-v10`, etc.) so users get fresh files.

---

## Admin Access

An admin account is managed in Firebase Console → Authentication → Users. Logging in via the Sign In button reveals the admin drawer for editing all league data.

---

## Planned: Native iOS & Android App

A Capacitor wrapper is planned to publish the app on the Apple App Store and Google Play Store — same codebase, zero rewrite. See `capacitor-setup-plan.txt` for the full implementation plan.
