# Bogeys and Bunkers

A web app for managing a Monday Night Golf League — built with vanilla HTML, CSS, and JavaScript, backed by Firebase Firestore.

**Live site:** https://golfleagueapp-74095.web.app

---

## Features

- **Standings** — three live columns (1st Half / 2nd Half / Total). Sort order shifts with the season: weeks 1–9 sort by 1st Half, weeks 10–18 by 2nd Half, week 19+ by Total. A champion banner appears once the championship match is decided.
- **Two-half + championship season (19 weeks)** — two 9-week round-robins each crown a half winner; week 19 is a championship match between those winners. Half-winner tiebreakers: head-to-head record → team-net total → name.
- **Handicaps** — auto-calculated from each player's last 3 rounds; updates weekly
- **Score Entry** — hole-by-hole score cards with net scoring, stroke allocation, and live point totals
- **Schedule** — full season schedule with front/back nine assignments and match pairings; week 19 displays a "Championship" pairing once both half winners are decided
- **Matchups** — week-by-week match previews with handicap-adjusted pairings
- **Stats** — per-player season totals (rounds, avg score, birdies, pars, points, etc.)
- **Substitute Players** — global sub roster; subs inherit handicap history across seasons
- **Admin Drawer** — manage teams, players, schedule, substitutes, and course settings
- **PWA** — installable on iPhone via Safari → Add to Home Screen; works offline
- **Native iOS + Android** — Capacitor wrappers around the same web app (in-progress for App Store / Play Store submission)

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

**Always bump the service worker cache version in `sw.js` before deploying** (`bogeys-v12` → `bogeys-v13`, etc.) so users get fresh files.

For native iOS/Android, also run `npm run sync` after `firebase deploy` to push the updated web assets into the Capacitor projects.

---

## Admin Access

An admin account is managed in Firebase Console → Authentication → Users. Logging in via the Sign In button reveals the admin drawer for editing all league data.

---

## Native iOS & Android (Capacitor)

The webapp is wrapped with Capacitor for native iOS and Android — same codebase, same Firebase backend. The web PWA, iOS app, and Android app coexist. Phases 1–3 of the wrapper are complete and tested in simulators / emulators; App Store and Play Store submission is pending developer accounts. See `CLAUDE.md` (Capacitor section) for the full setup notes.
