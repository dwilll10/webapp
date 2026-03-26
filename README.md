# Bogeys and Bunkers

A browser-based golf league website with:

- league standings
- handicap tracking
- weekly score entry by player and hole
- season schedule and matchup views
- an admin drawer for editing teams, players, points, and schedule data

## Run It

Open [index.html](/C:/Users/DiedrichWillers/Documents/codex/index.html) in a browser, or serve the folder locally:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Data

The site stores league data in browser `localStorage`, including:

- teams
- player names
- standings points
- schedule edits
- weekly hole-by-hole scores

## Schedule Notes

- The standard schedule generator creates an 18-round double round robin for the active teams.
- The extra Monday on August 31, 2026 is left open as a flexible league night.
- You can edit any week or matchup from the admin drawer.
