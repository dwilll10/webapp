# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Bogeys and Bunkers

A vanilla HTML/CSS/JS single-page application for managing a Monday Night Golf League. No build step, no framework — Firebase is loaded via CDN script tags.

**Live site:** https://golfleagueapp-74095.web.app

## Deploying

```bash
~/.npm-global/bin/firebase deploy --only hosting
```

No build step. Firebase CLI was installed to `~/.npm-global/bin/firebase` (no npm/sudo needed). The deploy serves files directly from the repo root.

## Architecture

Five files in the repo root:

- **`index.html`** — App shell; hash-based routing (`#home`, `#handicaps`, `#scores`, `#schedule`, `#matchups`); login modal HTML; Firebase SDK script tags
- **`app.js`** — All application logic: Firebase init, state sync, auth, routing, rendering, scheduling, handicap calculation
- **`styles.css`** — Design system via CSS custom properties; responsive at 980px breakpoint
- **`firestore.rules`** — Public read, authenticated write
- **`firebase.json`** — Hosting (public dir = `.`) + Firestore config; location `northamerica-northeast1`

## Firebase Setup

- **Project:** `golfleagueapp-74095`
- **Auth:** Email/Password. One admin account exists. Admin credentials are managed in Firebase Console → Authentication → Users.
- **Firestore:** Single document at `league/state` holds the entire app state as one JSON object.
- **Security:** `allow read: if true` / `allow write: if request.auth != null`

## State Model

`normalizeState()` is the source of truth for the data schema and runs on every Firestore snapshot. State is one Firestore document (`league/state`):

```js
{
  teams: [{ id, name, points, players: [{ id, name, startingHandicap }] }],
  schedule: [{ id, label, date, nines, matches: [{ id, teamAId, teamBId }] }],
  scores: { [weekId]: { [matchId]: { [playerId]: { holes: [×9] } } } },
  subPlayers: [{ id, name, startingHandicap }],
  subAssignments: { [weekId]: { [matchId]: { [playerId]: subPlayerId } } },
  selectedWeekId: string
}
```

## Key Patterns

**State sync:** `subscribeToState()` opens a Firestore `onSnapshot` listener on app init. All writes go through `saveState()` → `DOC_REF.set(state)`. No other persistence mechanism.

**Render-before-save rule:** When a user action updates state and requires an immediate UI update, call the render functions BEFORE `saveState()`. Firestore's `onSnapshot` can fire synchronously during `saveState()` and replace `state`, so rendering first guarantees the correct in-memory state is used. Score hole entry is an exception (saves first, then re-renders — acceptable since the input value is already reflected in the DOM).

**Auth gating:** `auth.onAuthStateChanged` shows/hides the admin drawer. Score entry inputs and sub-player dropdowns are rendered with `disabled`/omitted when `auth.currentUser` is null; `bindScoreInputs()` early-returns for non-admins.

**Routing:** Hash changes call `renderPageFromHash()` which toggles `is-active` on `<section data-page="...">` elements.

**Scheduling:** `buildDoubleRoundRobin()` generates an 18-round double round-robin. Season dates are hardcoded in `seasonDates()` (19 Mondays, Apr 27 – Aug 31, 2026). Changing the season requires editing that function. Date cascade: changing a week's date in admin shifts all subsequent weeks by the same delta.

**Handicap (regular players):** `calculateHandicap(playerId)` — last 3 rounds, average strokes over par, rounded to nearest integer. Falls back to `player.startingHandicap`, then null. Par is per-nine (front: 36, back: 35).

**Handicap (substitutes):** `calculateSubHandicap(subId)` — same logic as regular players but sources rounds from `getSubRounds(subId)`, which scans `subAssignments` to find matches where the sub played and pulls scores from the regular player's score slot. Falls back to `sub.startingHandicap`.

**Effective handicap:** `getEffectiveHandicap(weekId, matchId, playerId)` — returns the sub's handicap if one is assigned for that slot, otherwise returns the regular player's handicap. Used everywhere points and strokes are calculated.

## Points System

- **Individual:** 1pt per hole (lower net score wins), 0.5 each on ties. Net score = actual score minus stroke(s) on hardest holes by SI.
- **Stroke allocation:** Handicap difference between paired players; strokes go to the higher-handicap player on the hardest holes (lowest SI number first). Max 9 strokes.
- **Team net:** Sum of both players' actual scores minus sum of their handicaps. Lower net = 2pts, tie = 1pt each.
- **Total per team:** sum of individual hole points (both players) + team net points, across all weeks.
- **Standings** use `computeTeamPoints(teamId)` — live-calculated, ignores the `team.points` field.

## Course Data (constants at top of app.js)

```js
FRONT_NINE_PARS              = [5,5,3,4,3,4,3,4,5]   // total 36
BACK_NINE_PARS               = [5,4,3,5,3,4,3,4,4]   // total 35
FRONT_NINE_HOLE_HANDICAPS    = [13,3,9,15,17,4,12,11,1]
BACK_NINE_HOLE_HANDICAPS     = [6,7,10,2,16,8,5,18,14]
```

## Scores Page

Each player card shows:
- Admin-only **Player** dropdown — select "Regular" or any registered substitute
- **Sub badge** on the h4 when a sub is active ("SUB for [original name]")
- 9 hole inputs + read-only **Total** field (total updates live on `input`; saves on `change`)
- Hole highlights: green = won hole, amber = tied hole; stroke-dot (+1) on stroke holes
- `Hcp:` and stroke count in the score-summary row

## Substitute Players

- **Roster:** `state.subPlayers` — a global list managed in the "Substitute Players" admin panel.
- **Assignment:** `state.subAssignments[weekId][matchId][playerId]` = subPlayerId. The sub fills in for the regular player in that specific match slot.
- **Scores:** Stored under the regular player's ID in `state.scores` regardless of whether a sub is playing.
- **Handicap page:** Sub players appear at the bottom of the table with team shown as *Substitute*. Their handicap is calculated from actual rounds played (via `getSubRounds`) or falls back to `startingHandicap`.
- **Key helpers:** `getSubAssignment`, `getSubPlayer`, `setSubAssignment`, `getSubRounds`, `calculateSubHandicap`, `getEffectiveHandicap`.

## Admin Panels

All inside `#adminDrawer` (hidden until logged in). Three panels:

1. **Teams and Players** — dropdown to select a team; edit name, points, player names, and starting handicaps per player.
2. **Schedule Editor** — dropdown to select a week; edit date (cascades to subsequent weeks), front/back nine, and match pairings.
3. **Substitute Players** — list of registered subs; add/remove subs and set their name and starting handicap.

Module-level vars `adminSelectedTeamId` and `adminSelectedWeekId` survive `renderAll()` calls to preserve dropdown selections.

## Key Constraints

- **`app.js` is one file** — keep additions in the same file
- **No tests** — verify scoring/handicap logic manually against known inputs
- **Firestore first-load seeding** — if `league/state` doesn't exist, the app seeds defaults only when an admin is logged in
