# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Bogeys and Bunkers

A vanilla HTML/CSS/JS single-page application for managing a Monday Night Golf League. No build step, no framework — Firebase is loaded via CDN script tags.

**Live site:** https://golfleagueapp-74095.web.app
**Git repo:** https://github.com/dwilll10/webapp

## Deploying

```bash
~/.npm-global/bin/firebase deploy --only hosting
```

No build step. Firebase CLI was installed to `~/.npm-global/bin/firebase` (no npm/sudo needed). The deploy serves files directly from the repo root.

## Architecture

Five files in the repo root:

- **`index.html`** — App shell; hash-based routing (`#home`, `#handicaps`, `#scores`, `#schedule`, `#matchups`, `#stats`); login modal HTML; Firebase SDK script tags; Google Fonts (Barlow + Fraunces loaded together, Chewy loaded via a separate `<link>` tag — must stay separate or it silently fails)
- **`app.js`** — All application logic: Firebase init, state sync, auth, routing, rendering, scheduling, handicap calculation
- **`styles.css`** — Design system via CSS custom properties; responsive at 980px breakpoint. Fonts: body uses Barlow, headings use Fraunces, `h1` uses Chewy (weight 400, color `#a45526` to match the flag in the hero illustration)
- **`firestore.rules`** — Public read, authenticated write
- **`firebase.json`** — Hosting (public dir = `.`) + Firestore config; location `northamerica-northeast1`

## Firebase Setup

- **Project:** `golfleagueapp-74095`
- **Auth:** Email/Password. One admin account exists. Admin credentials are managed in Firebase Console → Authentication → Users.
- **Firestore:** Per-year docs at `league/{year}` (e.g. `league/2026`). Global docs: `league/subs` (substitute player roster). Legacy `league/state` doc auto-migrates to `league/2026` on first admin load.
- **Security:** `allow read: if true` / `allow write: if request.auth != null`

## State Model

`normalizeState()` is the source of truth for the data schema and runs on every Firestore snapshot. Each year's state is one Firestore document (`league/{year}`):

```js
{
  teams: [{ id, name, points, players: [{ id, name, startingHandicap }] }],
  schedule: [{ id, label, date, nines, matches: [{ id, teamAId, teamBId }] }],
  scores: { [weekId]: { [matchId]: { [playerId]: { holes: [×9] } } } },
  subAssignments: { [weekId]: { [matchId]: { [playerId]: subPlayerId } } },
  selectedWeekId: string,
  courseData: { name: string, pars: [×18], handicaps: [×18] }
}
```

Global substitute roster is stored separately at `league/subs` as `{ subPlayers: [...] }` and held in the module-level `subPlayers` array (not in `state`). `saveSubState()` writes to `league/subs`.

## Key Patterns

**Multi-year:** `selectedYear` (module-level var, defaults to current calendar year) controls which `league/{year}` doc is active. `getDocRef(year)` returns the Firestore ref. `loadAvailableYears()` queries the collection on init. `renderYearSelector()` populates the year `<select>` — non-admins see current year and past; admins also see `currentYear + 1`. Year changes call `subscribeToState()` which manages the `onSnapshot` listener lifecycle via `stateUnsubscribe`.

**State sync:** `subscribeToState()` opens a Firestore `onSnapshot` listener on app init. All writes go through `saveState()` → `getDocRef(selectedYear).set(state)`. No other persistence mechanism.

**Render-before-save rule:** When a user action updates state and requires an immediate UI update, call the render functions BEFORE `saveState()`. Firestore's `onSnapshot` can fire synchronously during `saveState()` and replace `state`, so rendering first guarantees the correct in-memory state is used. Score hole entry is an exception (saves first, then re-renders — acceptable since the input value is already reflected in the DOM). The scores page week selector does NOT call `saveState()` at all — selected week is pure UI state to prevent the onSnapshot revert.

**Auth gating:** `auth.onAuthStateChanged` shows/hides the admin drawer. Score entry inputs and sub-player dropdowns are rendered with `disabled`/omitted when `auth.currentUser` is null; `bindScoreInputs()` early-returns for non-admins.

**Routing:** Hash changes call `renderPageFromHash()` which toggles `is-active` on `<section data-page="...">` elements. When navigating to `#scores`, it also calls `getDefaultScoresWeekId()` to set `state.selectedWeekId` before rendering — defaults to the most recently completed week (last week whose date ≤ today), or week 1 if the season hasn't started yet.

**Scheduling:** `buildDoubleRoundRobin()` generates an 18-round double round-robin. `lastMondayOfApril(year)` computes the default Week 1 date (replaces old hardcoded `seasonDates()`). Admin schedule editor has "Number of Weeks" and "Week 1 Date" inputs; `generateScheduleBtn` regenerates from those. Date cascade: changing a week's date in admin shifts all subsequent weeks by the same delta. New/regenerated schedules default to alternating Front 9 / Back 9 starting with Front 9 (odd-indexed weeks = front, even-indexed = back).

**Handicap (regular players):** `calculateHandicap(playerId, beforeWeekId)` — treats `startingHandicap` as two phantom prior rounds (prepends `[sh, sh]` before actual over-par values), then slices to the last 3, averages, and rounds. This means the starting handicap decays naturally as real rounds accumulate and drops out after 3 rounds. Accepts optional `beforeWeekId` to freeze handicaps at pre-week values: only rounds with a `weekDate` strictly before the given week's date are included. Week 1 always returns `startingHandicap` (no prior rounds). The active/current week on the scores page matches the handicaps page exactly. Par is per-nine from `getNinePars(nines)`.

**Handicap (substitutes):** `calculateSubHandicap(subId, beforeWeekId)` — same logic as regular players but sources rounds from `getSubRounds(subId)`, which scans `subAssignments` to find matches where the sub played and pulls scores from the regular player's score slot. Also filters by date when `beforeWeekId` is provided. Falls back to `sub.startingHandicap`.

**Effective handicap:** `getEffectiveHandicap(weekId, matchId, playerId)` — returns the sub's handicap (via `calculateSubHandicap(subId, weekId)`) if one is assigned for that slot, otherwise returns the regular player's handicap (via `calculateHandicap(playerId, weekId)`). Both calls pass `weekId` as `beforeWeekId`, filtering to rounds with dates strictly before that week — freezing handicaps at true pre-week values. Used everywhere points and strokes are calculated.

**Player pairing:** `getSortedPlayers(weekId, matchId, team)` — returns a team's players sorted ascending by effective handicap. The lowest-handicap player is always "player A" and plays against the other team's lowest-handicap player. Used consistently in `renderScoreMatchCard`, `computeTeamPoints`, `collectPlayerStats`, and `collectSubStats`.

## Points System

- **Individual:** 1pt per hole (lower net score wins), 0.5 each on ties. Net score = actual score minus stroke(s) on hardest holes by SI.
- **Stroke allocation:** Handicap difference between paired players; strokes go to the higher-handicap player on the hardest holes (lowest SI number first). Max 9 strokes.
- **Team net:** Sum of both players' actual scores minus sum of their handicaps. Lower net = 2pts, tie = 1pt each.
- **Total per team:** sum of individual hole points (both players) + team net points, across all weeks.
- **Standings** use `computeTeamPoints(teamId)` — live-calculated, ignores the `team.points` field.

## Course Data

Stored per-year in `state.courseData`. `normalizeCourseData(raw)` normalizes it with Pine Grove defaults:

```js
DEFAULT_FRONT_PARS      = [5,5,3,4,3,4,3,4,5]   // total 36
DEFAULT_BACK_PARS       = [5,4,3,5,3,4,3,4,4]   // total 35
DEFAULT_FRONT_HANDICAPS = [13,3,9,15,17,4,12,11,1]
DEFAULT_BACK_HANDICAPS  = [6,7,10,2,16,8,5,18,14]
```

`getNinePars(nines)` and `getNineHandicaps(nines)` read from `state.courseData` (not the constants directly). `calculateHandicapFromData()` and `calculateSubHandicapFromData()` use `normalizeCourseData(data.courseData)` so prior-year handicap calculations use that year's course, not the current year's. Course settings are edited in the admin Course Settings panel and saved via `saveState()`.

## Stats Page

`renderStats()` builds a table with one row per player (all regular players + all subs). Columns: Rounds, Avg Score, Pars, Birdies, Eagles, Bogeys, Doubles, Other, Best Round, Points.

- **Points** = sum of individual hole points earned across all rounds, computed by calling `calculateMatchPoints` with pre-week effective handicaps.
- `collectPlayerStats(playerId)` skips matches where a sub was assigned to that slot (those points belong to the sub).
- `collectSubStats(subId)` finds matches via `subAssignments` and reads scores from the regular player's score slot.
- **Sortable columns:** `statsSort = { col, dir }` module-level var tracks sort state. `bindStatsSort()` delegates clicks on `#statsTable thead`. Each `<th>` has a `data-col` attribute; the active column gets class `sort-active` and a `data-dir` attribute for the CSS ▲/▼ indicator.

## Scores Page

Each player card shows:
- Admin-only **Player** dropdown — select "Regular" or any registered substitute
- **Sub badge** on the h4 when a sub is active ("SUB for [original name]")
- 9 hole inputs + read-only **Total** field (total updates live on `input`; saves on `change`)
- Hole highlights: green = won hole, amber = tied hole; stroke-dot (1) on stroke holes
- `Hcp:` and stroke count in the score-summary row

Match summary at the bottom of each match card shows individual points + team net points per team. Team net score (sum of actual scores minus handicaps) is displayed inline as `(net N)` so players can see the values being compared.

The **week selector** (`#scoreWeekSelect`) uses the `.year-select` pill style with a green tint. It does NOT call `saveState()` on change — the selected week is pure local UI state. This prevents `onSnapshot` from reverting the selection. On each navigation to the scores page, `state.selectedWeekId` is reset to the smart default (most recently completed week, or week 1 before season start).

## Handicaps Page

The **Latest Scores** column shows the last 3 rounds used for handicap calculation (`.slice(-3)` on `getPlayerRounds` / `getSubRounds`). This matches exactly the scores feeding into `calculateHandicap`.

## Substitute Players

- **Roster:** `subPlayers` module-level array, sourced from `league/subs` Firestore doc. Global across all years — the list accrues over time and is not tied to any season.
- **Assignment:** `state.subAssignments[weekId][matchId][playerId]` = subPlayerId. The sub fills in for the regular player in that specific match slot.
- **Scores:** Stored under the regular player's ID in `state.scores` regardless of whether a sub is playing.
- **Handicap page:** Sub players appear at the bottom of the table with team shown as *Substitute*. Their handicap is calculated from actual rounds played (via `getSubRounds`) or falls back to `startingHandicap`.
- **Key helpers:** `getSubAssignment`, `getSubPlayer`, `setSubAssignment`, `getSubRounds`, `calculateSubHandicap`, `getEffectiveHandicap`.

## Admin Panels

All inside `#adminDrawer` (hidden until logged in). Four panels:

1. **Teams and Players** — dropdown to select a team; edit name, points, player names, and starting handicaps per player.
2. **Schedule Editor** — number of weeks + Week 1 date inputs, generate button; dropdown to select a week; edit date (cascades to subsequent weeks), front/back nine, and match pairings.
3. **Substitute Players** — global list of registered subs (persists across all years); add/remove subs and set their name and starting handicap.
4. **Course Settings** — per-year; course name + par and hole handicap for all 18 holes. Defaults to Pine Grove values. Saved to `state.courseData` via `saveState()`.

When a year has no data yet, an **Initialize Season** panel appears instead of the normal admin UI, with options to copy teams from the prior year (including latest handicaps as starting handicaps) or start from scratch.

Module-level vars `adminSelectedTeamId` and `adminSelectedWeekId` survive `renderAll()` calls to preserve dropdown selections.

## Header

`renderAll()` updates `#heroEyebrow` to `"Monday Night Golf League — {state.courseData.name}"` so the current year's course name always appears in the banner.

## Page Notes

`.page-note` CSS class adds bold text with `margin: 20px 0 28px` for informational notes on public pages. Currently used on:
- **Schedule** — tee times start at 5 PM, first come first served
- **Matchups** — same tee time note
- **Handicaps** — handicaps use three most recent rounds

## iOS / Mobile

The app is shipped as a **PWA**. Users add it to their iPhone home screen from Safari (Share → Add to Home Screen). No App Store, no Apple Developer account needed. The web app in the browser and the home screen app co-exist — both point to the same Firebase backend.

### PWA files
- **`manifest.json`** — app name, theme color (`#4a7a52`), icons
- **`sw.js`** — service worker; caches `/`, `index.html`, `app.js`, `styles.css` for offline use. Firebase/CDN requests pass through to the network.
- **`icons/icon-192.png`** and **`icons/icon-512.png`** — home screen icons (generated from `icons/icon.svg`)
- **`index.html`** — manifest link, Apple meta tags, SW registration script
- **`firebase.json`** — `/sw.js` gets its own `no-cache` + `Service-Worker-Allowed: /` header rule

### ⚠️ Cache version — bump on every deploy
Every time `app.js` or `styles.css` changes, increment the cache version in `sw.js`:
```js
const CACHE = 'bogeys-v9'; // bump to v10, v11, etc. on each deploy
```
Without this, users (including the home screen app) will be served stale files from the old cache.

### Mobile layout (≤980px and ≤480px breakpoints in `styles.css`)
- Hero illustration is restored on mobile at a compact size, beside the "Bogeys and Bunkers" h1
- Eyebrow ("Monday Night Golf League — Pine Grove") sits on its own full-width row above the h1
- Hero tagline paragraph is hidden on mobile
- Card/panel/grid padding and gaps are tightened at ≤480px
- `body` and `html` have `overflow-x: hidden` to prevent horizontal page scroll
- `min-width: 0` on `.page-section` prevents CSS Grid blowout from wide tables

### Stats page sticky first column
`position: sticky` on `<td>` is broken in iOS Safari inside `overflow-x: auto` containers. The fix uses JavaScript instead:
- `bindStatsStickyColumn()` in `app.js` — listens to scroll on `#stats .table-wrap` and applies `translateX(scrollLeft)` to each first-column cell
- `#statsTable` uses `width: max-content; min-width: 100%` so the table genuinely overflows its container and `.table-wrap` becomes the scroll container (not the page)

---

## Planned Feature: Player-Linked User Accounts

Goal: each player gets their own Firebase login and can only enter their own scores. Admin retains full access.

### New Firestore doc: `league/userAccess`
```js
{
  adminUid: "firebase-uid-of-admin",
  players: { "firebase-uid": "player-id", ... }
}
```
Create manually in Firebase Console on first deploy — set `adminUid` to the admin's UID, `players` to `{}`.

### Key `app.js` changes
- **New module-level vars:** `userAccess` (cached doc) and `currentPlayerId` (linked player for signed-in user; `null` for admin)
- **`isAdmin()` helper** replaces all `!!auth.currentUser` checks:
  ```js
  function isAdmin() {
    return !!auth.currentUser && userAccess?.adminUid === auth.currentUser.uid;
  }
  ```
- **`subscribeToAuthState()`** — make `async`; fetch `league/userAccess` after login before rendering. Admin gets drawer + `currentPlayerId = null`. Player gets `currentPlayerId` set to their linked playerId; drawer stays hidden.
- **`renderPlayerScoreCard()`** — add `canEnterScores = isAdmin() || currentPlayerId === player.id`. Use as the disabled condition on hole inputs (was `isAdmin`). Sub dropdown stays admin-only.
- **`bindScoreInputs()`** — wrap sub-toggle binding in `if (isAdmin())`. Add save guard in `change` handler: `if (!isAdmin() && currentPlayerId !== playerId) return;`.
- **`renderAll()`** — call `renderPlayerAccountsAdmin()` when `isAdmin()`.

### New admin panel: "Player Accounts"
- Renders a row per player with a UID text input and Unlink button
- `savePlayerLink(playerId, uid)` — writes `players[uid] = playerId` to `league/userAccess` with merge
- `removePlayerLink(playerId)` — deletes that player's entry, saves with merge
- Add `<div id="playerAccountsContainer">` panel to `index.html` admin drawer (after Course Settings)

### `index.html` UX change
- Rename "Admin Login" button and modal title → "Sign In" (players will use this too)

### `firestore.rules` changes
```
function isAdmin() {
  return request.auth != null
    && get(/databases/$(database)/documents/league/userAccess).data.adminUid == request.auth.uid;
}
match /league/userAccess { allow write: if isAdmin(); }
match /league/subs       { allow write: if isAdmin(); }
match /league/{year} {
  allow write: if isAdmin();
  allow update: if request.auth != null
    && get(/databases/$(database)/documents/league/userAccess).data.players[request.auth.uid] != null;
}
```
> Note: `league/{year}` is a single large doc — Firestore can't enforce field-level writes on it. Players could theoretically overwrite the whole doc via the SDK. Acceptable for a small private league; full enforcement requires splitting scores into a subcollection.

### How to create player accounts
1. Firebase Console → Authentication → Add user (email + temp password)
2. Copy the generated User UID
3. In the app as admin → Player Accounts panel → paste UID next to player name

---

## Key Constraints

- **`app.js` is one file** — keep additions in the same file
- **No tests** — verify scoring/handicap logic manually against known inputs
- **Firestore first-load seeding** — if `league/{year}` doesn't exist, the app seeds defaults only when an admin is logged in
