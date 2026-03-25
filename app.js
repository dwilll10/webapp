const STORAGE_KEY = "bogeys-and-bunkers-state";
const PAR = 35;

const state = loadState();

const standingsMeta = document.querySelector("#standingsMeta");
const standingsTableBody = document.querySelector("#standingsTableBody");
const handicapTableBody = document.querySelector("#handicapTableBody");
const scoreWeekSelect = document.querySelector("#scoreWeekSelect");
const scoresWeekLabel = document.querySelector("#scoresWeekLabel");
const scoresContainer = document.querySelector("#scoresContainer");
const scheduleContainer = document.querySelector("#scheduleContainer");
const nextMatchupsContainer = document.querySelector("#nextMatchupsContainer");
const matchupMeta = document.querySelector("#matchupMeta");
const teamAdminContainer = document.querySelector("#teamAdminContainer");
const scheduleAdminContainer = document.querySelector("#scheduleAdminContainer");
const addTeamBtn = document.querySelector("#addTeamBtn");
const regenerateScheduleBtn = document.querySelector("#regenerateScheduleBtn");

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindGlobalActions();
  renderWeekOptions();
  renderAll();
});

function loadState() {
  const saved = loadJson(STORAGE_KEY, null);

  if (saved) {
    return normalizeState(saved);
  }

  const teams = createDefaultTeams();
  const schedule = createStandardSchedule(teams, seasonDates());
  return normalizeState({
    teams,
    schedule,
    scores: {},
    selectedWeekId: schedule.find((week) => week.matches.length)?.id || schedule[0]?.id || "",
  });
}

function normalizeState(rawState) {
  const teams = Array.isArray(rawState.teams) ? rawState.teams : createDefaultTeams();
  const schedule = Array.isArray(rawState.schedule) && rawState.schedule.length
    ? rawState.schedule
    : createStandardSchedule(teams, seasonDates());

  const selectedWeekId = rawState.selectedWeekId && schedule.some((week) => week.id === rawState.selectedWeekId)
    ? rawState.selectedWeekId
    : schedule.find((week) => week.matches.length)?.id || schedule[0]?.id || "";

  return {
    teams: teams.map((team) => ({
      id: team.id || crypto.randomUUID(),
      name: team.name || "New Team",
      points: Number(team.points) || 0,
      players: Array.isArray(team.players) && team.players.length
        ? team.players.slice(0, 2).map((player, index) => ({
          id: player.id || crypto.randomUUID(),
          name: player.name || `Player ${index + 1}`,
        }))
        : [
          { id: crypto.randomUUID(), name: "Player 1" },
          { id: crypto.randomUUID(), name: "Player 2" },
        ],
    })),
    schedule: schedule.map((week, weekIndex) => ({
      id: week.id || `week-${weekIndex + 1}`,
      label: week.label || `Week ${weekIndex + 1}`,
      date: week.date || seasonDates()[weekIndex] || "",
      matches: Array.isArray(week.matches)
        ? week.matches.map((match, matchIndex) => ({
          id: match.id || `match-${weekIndex + 1}-${matchIndex + 1}`,
          teamAId: match.teamAId || "",
          teamBId: match.teamBId || "",
        }))
        : [],
    })),
    scores: rawState.scores || {},
    selectedWeekId,
  };
}

function bindNavigation() {
  window.addEventListener("hashchange", renderPageFromHash);
  renderPageFromHash();
}

function bindGlobalActions() {
  scoreWeekSelect.addEventListener("change", (event) => {
    state.selectedWeekId = event.target.value;
    saveState();
    renderScores();
  });

  addTeamBtn.addEventListener("click", () => {
    state.teams.push(createTeam(state.teams.length + 1));
    saveState();
    renderWeekOptions();
    renderAll();
  });

  regenerateScheduleBtn.addEventListener("click", () => {
    state.schedule = createStandardSchedule(state.teams, seasonDates());
    state.selectedWeekId = state.schedule.find((week) => week.matches.length)?.id || state.schedule[0]?.id || "";
    saveState();
    renderWeekOptions();
    renderAll();
  });
}

function renderAll() {
  renderStandings();
  renderHandicaps();
  renderScores();
  renderSchedule();
  renderNextMatchups();
  renderTeamAdmin();
  renderScheduleAdmin();
}

function renderPageFromHash() {
  const requested = window.location.hash.replace("#", "") || "home";
  const pages = [...document.querySelectorAll("[data-page]")];
  const activePage = pages.find((page) => page.dataset.page === requested) ? requested : "home";

  pages.forEach((page) => {
    page.classList.toggle("is-active", page.dataset.page === activePage);
  });
}

function renderStandings() {
  const standings = [...state.teams].sort((left, right) => right.points - left.points || left.name.localeCompare(right.name));
  standingsMeta.textContent = `${standings.length} teams`;
  standingsTableBody.innerHTML = standings.map((team, index) => `
    <tr>
      <td class="rank-cell">${index + 1}</td>
      <td class="team-cell">${escapeHtml(team.name)}</td>
      <td><span class="points-pill">${team.points}</span></td>
    </tr>
  `).join("");
}

function renderHandicaps() {
  const playerRows = getPlayerRows();
  handicapTableBody.innerHTML = playerRows.map((row) => {
    const handicap = calculateHandicap(row.playerId);
    const scoreList = getPlayerRounds(row.playerId)
      .map((round) => `${round.weekLabel}: ${round.total}`)
      .join(" | ") || "No scores yet";

    return `
      <tr>
        <td class="team-cell">${escapeHtml(row.playerName)}</td>
        <td>${escapeHtml(row.teamName)}</td>
        <td>${escapeHtml(scoreList)}</td>
        <td>${formatHandicap(handicap)}</td>
      </tr>
    `;
  }).join("");
}

function renderWeekOptions() {
  scoreWeekSelect.innerHTML = state.schedule.map((week) => `
    <option value="${week.id}">${escapeHtml(week.label)} - ${formatDate(week.date)}</option>
  `).join("");

  if (state.selectedWeekId) {
    scoreWeekSelect.value = state.selectedWeekId;
  }
}

function renderScores() {
  const week = getSelectedWeek();

  if (!week) {
    scoresWeekLabel.textContent = "";
    scoresContainer.innerHTML = `<div class="empty-state">No week selected.</div>`;
    return;
  }

  scoresWeekLabel.textContent = `${week.label} | ${formatDate(week.date)}`;

  if (!week.matches.length) {
    scoresContainer.innerHTML = `<div class="empty-state">No matches scheduled for this week.</div>`;
    return;
  }

  scoresContainer.innerHTML = week.matches.map((match) => renderScoreMatchCard(week, match)).join("");
  bindScoreInputs();
}

function renderScoreMatchCard(week, match) {
  const teamA = getTeam(match.teamAId);
  const teamB = getTeam(match.teamBId);

  if (!teamA || !teamB) {
    return `<div class="match-card"><div class="empty-state">This matchup has missing teams. Update it in the admin schedule editor.</div></div>`;
  }

  return `
    <article class="match-card">
      <div class="match-header">
        <div>
          <p class="section-kicker">Match</p>
          <div class="match-title">${escapeHtml(teamA.name)} vs ${escapeHtml(teamB.name)}</div>
        </div>
        <div class="score-note">${formatDate(week.date)}</div>
      </div>
      <div class="score-grid">
        ${teamA.players.map((player) => renderPlayerScoreCard(week.id, match.id, teamA.name, player)).join("")}
        ${teamB.players.map((player) => renderPlayerScoreCard(week.id, match.id, teamB.name, player)).join("")}
      </div>
    </article>
  `;
}

function renderPlayerScoreCard(weekId, matchId, teamName, player) {
  const scoreEntry = getScoreEntry(weekId, matchId, player.id);
  const total = calculateRoundTotal(scoreEntry.holes);

  return `
    <section class="player-score-card">
      <h4>${escapeHtml(player.name)}</h4>
      <div class="score-summary"><strong>${escapeHtml(teamName)}</strong> | Total: ${total ?? "--"}</div>
      <div class="hole-grid">
        ${Array.from({ length: 9 }, (_, index) => `
          <label class="hole-field">
            <span>H${index + 1}</span>
            <input type="number" min="1" max="15" value="${scoreEntry.holes[index] ?? ""}" data-week-id="${weekId}" data-match-id="${matchId}" data-player-id="${player.id}" data-hole-index="${index}">
          </label>
        `).join("")}
      </div>
    </section>
  `;
}

function bindScoreInputs() {
  document.querySelectorAll("[data-hole-index]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const { weekId, matchId, playerId, holeIndex } = event.target.dataset;
      const numericValue = event.target.value === "" ? null : Number(event.target.value);
      setScoreHole(weekId, matchId, playerId, Number(holeIndex), numericValue);
      saveState();
      renderHandicaps();
      renderScores();
      renderNextMatchups();
    });
  });
}

function renderSchedule() {
  scheduleContainer.innerHTML = state.schedule.map((week) => `
    <article class="week-card">
      <div class="week-card-header">
        <div>
          <p class="section-kicker">${escapeHtml(week.label)}</p>
          <div class="week-label">${formatDate(week.date)}</div>
        </div>
        <div class="week-date">${week.matches.length} matches</div>
      </div>
      ${week.matches.length ? `
        <div class="stack-md">
          ${week.matches.map((match) => {
            const teamA = getTeam(match.teamAId);
            const teamB = getTeam(match.teamBId);
            return `<div class="team-matchup"><div class="team-name">${escapeHtml(teamA?.name || "TBD")} vs ${escapeHtml(teamB?.name || "TBD")}</div></div>`;
          }).join("")}
        </div>
      ` : `<div class="empty-state">Open league night. Use this date for a makeup match, position round, or bye week.</div>`}
    </article>
  `).join("");
}

function renderNextMatchups() {
  const nextWeek = getNextMatchupWeek();

  if (!nextWeek) {
    matchupMeta.textContent = "";
    nextMatchupsContainer.innerHTML = `<div class="empty-state">No upcoming matchups are scheduled.</div>`;
    return;
  }

  matchupMeta.textContent = `${nextWeek.label} | ${formatDate(nextWeek.date)}`;
  nextMatchupsContainer.innerHTML = nextWeek.matches.map((match) => {
    const teamA = getTeam(match.teamAId);
    const teamB = getTeam(match.teamBId);

    return `
      <article class="match-card">
        <div class="match-header">
          <div class="match-title">${escapeHtml(teamA?.name || "TBD")} vs ${escapeHtml(teamB?.name || "TBD")}</div>
        </div>
        <div class="match-grid">
          ${renderMatchupTeam(teamA)}
          ${renderMatchupTeam(teamB)}
        </div>
      </article>
    `;
  }).join("");
}

function renderMatchupTeam(team) {
  if (!team) {
    return `<div class="team-matchup"><div class="team-name">TBD</div></div>`;
  }

  return `
    <div class="team-matchup">
      <div class="team-name">${escapeHtml(team.name)}</div>
      ${team.players.map((player) => `<p class="player-line"><strong>${escapeHtml(player.name)}</strong> | Handicap ${formatHandicap(calculateHandicap(player.id))}</p>`).join("")}
    </div>
  `;
}

function renderTeamAdmin() {
  teamAdminContainer.innerHTML = state.teams.map((team) => `
    <article class="team-admin-card">
      <div class="team-admin-header">
        <h4>${escapeHtml(team.name || "Unnamed Team")}</h4>
        <button class="btn btn-danger" type="button" data-remove-team-id="${team.id}">Remove</button>
      </div>
      <div class="team-player-grid">
        <label class="compact-field">
          <span>Team Name</span>
          <input type="text" value="${escapeHtml(team.name)}" data-team-field="name" data-team-id="${team.id}">
        </label>
        <label class="compact-field">
          <span>Points</span>
          <input type="number" value="${team.points}" data-team-field="points" data-team-id="${team.id}">
        </label>
        <div></div>
        ${team.players.map((player, index) => `
          <label class="compact-field">
            <span>Player ${index + 1}</span>
            <input type="text" value="${escapeHtml(player.name)}" data-player-id="${player.id}" data-team-id="${team.id}">
          </label>
        `).join("")}
      </div>
    </article>
  `).join("");

  document.querySelectorAll("[data-team-field]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const team = getTeam(event.target.dataset.teamId);
      if (!team) {
        return;
      }

      if (event.target.dataset.teamField === "points") {
        team.points = Number(event.target.value) || 0;
      } else {
        team.name = event.target.value.trim() || "Unnamed Team";
      }

      saveState();
      renderAll();
    });
  });

  document.querySelectorAll("[data-player-id]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const team = getTeam(event.target.dataset.teamId);
      const player = team?.players.find((entry) => entry.id === event.target.dataset.playerId);

      if (!player) {
        return;
      }

      player.name = event.target.value.trim() || player.name;
      saveState();
      renderAll();
    });
  });

  document.querySelectorAll("[data-remove-team-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const teamId = event.target.dataset.removeTeamId;
      state.teams = state.teams.filter((team) => team.id !== teamId);
      state.schedule.forEach((week) => {
        week.matches = week.matches.filter((match) => match.teamAId !== teamId && match.teamBId !== teamId);
      });
      saveState();
      renderWeekOptions();
      renderAll();
    });
  });
}

function renderScheduleAdmin() {
  scheduleAdminContainer.innerHTML = state.schedule.map((week) => `
    <article class="schedule-edit-card">
      <div class="week-card-header">
        <div>
          <p class="section-kicker">${escapeHtml(week.label)}</p>
          <div class="week-label">${formatDate(week.date)}</div>
        </div>
        <button class="btn btn-ghost" type="button" data-add-match-week-id="${week.id}">Add Match</button>
      </div>
      <label class="compact-field">
        <span>Week Date</span>
        <input type="date" value="${week.date}" data-week-date-id="${week.id}">
      </label>
      <div class="stack-md">
        ${week.matches.map((match) => `
          <div class="match-row">
            <select data-match-team="teamAId" data-week-id="${week.id}" data-match-id="${match.id}">${renderTeamOptions(match.teamAId)}</select>
            <span>vs</span>
            <select data-match-team="teamBId" data-week-id="${week.id}" data-match-id="${match.id}">${renderTeamOptions(match.teamBId)}</select>
            <button class="btn btn-danger" type="button" data-remove-match-id="${match.id}" data-week-id="${week.id}">Remove</button>
          </div>
        `).join("")}
      </div>
    </article>
  `).join("");

  document.querySelectorAll("[data-week-date-id]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const week = state.schedule.find((entry) => entry.id === event.target.dataset.weekDateId);
      if (!week) {
        return;
      }

      week.date = event.target.value;
      saveState();
      renderAll();
    });
  });

  document.querySelectorAll("[data-match-team]").forEach((select) => {
    select.addEventListener("change", (event) => {
      const week = state.schedule.find((entry) => entry.id === event.target.dataset.weekId);
      const match = week?.matches.find((entry) => entry.id === event.target.dataset.matchId);
      if (!match) {
        return;
      }

      match[event.target.dataset.matchTeam] = event.target.value;
      saveState();
      renderAll();
    });
  });

  document.querySelectorAll("[data-remove-match-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const week = state.schedule.find((entry) => entry.id === event.target.dataset.weekId);
      if (!week) {
        return;
      }

      week.matches = week.matches.filter((match) => match.id !== event.target.dataset.removeMatchId);
      saveState();
      renderAll();
    });
  });

  document.querySelectorAll("[data-add-match-week-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const week = state.schedule.find((entry) => entry.id === event.target.dataset.addMatchWeekId);
      if (!week) {
        return;
      }

      week.matches.push({
        id: crypto.randomUUID(),
        teamAId: state.teams[0]?.id || "",
        teamBId: state.teams[1]?.id || "",
      });
      saveState();
      renderAll();
    });
  });
}

function getSelectedWeek() {
  return state.schedule.find((week) => week.id === state.selectedWeekId) || state.schedule[0];
}

function getNextMatchupWeek() {
  const today = new Date();
  const sorted = [...state.schedule].sort((left, right) => left.date.localeCompare(right.date));
  return sorted.find((week) => week.matches.length && new Date(`${week.date}T00:00:00`) >= today)
    || sorted.find((week) => week.matches.length)
    || null;
}

function getPlayerRows() {
  return state.teams.flatMap((team) => team.players.map((player) => ({
    playerId: player.id,
    playerName: player.name,
    teamName: team.name,
  })));
}

function calculateHandicap(playerId) {
  const recentRounds = getPlayerRounds(playerId).slice(-3);
  if (!recentRounds.length) {
    return null;
  }

  const overPar = recentRounds.map((round) => round.total - PAR);
  return overPar.reduce((sum, entry) => sum + entry, 0) / overPar.length;
}

function getPlayerRounds(playerId) {
  const rounds = [];

  state.schedule.forEach((week) => {
    week.matches.forEach((match) => {
      const entry = getScoreEntry(week.id, match.id, playerId);
      const total = calculateRoundTotal(entry.holes);

      if (total !== null) {
        rounds.push({
          weekId: week.id,
          weekLabel: week.label,
          weekDate: week.date,
          total,
        });
      }
    });
  });

  return rounds.sort((left, right) => left.weekDate.localeCompare(right.weekDate));
}

function getScoreEntry(weekId, matchId, playerId) {
  const weekScores = state.scores[weekId] || {};
  const matchScores = weekScores[matchId] || {};
  const holes = Array.isArray(matchScores[playerId]?.holes) ? matchScores[playerId].holes.slice(0, 9) : Array(9).fill(null);

  return {
    holes: holes.map((value) => Number.isFinite(value) ? value : null),
  };
}

function setScoreHole(weekId, matchId, playerId, holeIndex, value) {
  state.scores[weekId] ||= {};
  state.scores[weekId][matchId] ||= {};
  state.scores[weekId][matchId][playerId] ||= { holes: Array(9).fill(null) };
  state.scores[weekId][matchId][playerId].holes[holeIndex] = Number.isFinite(value) ? value : null;
}

function calculateRoundTotal(holes) {
  if (!Array.isArray(holes) || holes.some((hole) => !Number.isFinite(hole))) {
    return null;
  }

  return holes.reduce((sum, hole) => sum + hole, 0);
}

function createDefaultTeams() {
  return Array.from({ length: 10 }, (_, index) => createTeam(index + 1));
}

function createTeam(teamNumber) {
  return {
    id: crypto.randomUUID(),
    name: `Team ${teamNumber}`,
    points: 0,
    players: [
      { id: crypto.randomUUID(), name: `Player ${teamNumber}A` },
      { id: crypto.randomUUID(), name: `Player ${teamNumber}B` },
    ],
  };
}

function createStandardSchedule(teams, dates) {
  if (teams.length < 2 || teams.length % 2 !== 0) {
    return dates.map((date, index) => ({
      id: `week-${index + 1}`,
      label: `Week ${index + 1}`,
      date,
      matches: [],
    }));
  }

  const rounds = buildDoubleRoundRobin(teams.map((team) => team.id));
  return dates.map((date, index) => ({
    id: `week-${index + 1}`,
    label: `Week ${index + 1}`,
    date,
    matches: (rounds[index] || []).map((pairing, pairingIndex) => ({
      id: `match-${index + 1}-${pairingIndex + 1}`,
      teamAId: pairing[0],
      teamBId: pairing[1],
    })),
  }));
}

function buildDoubleRoundRobin(teamIds) {
  const rotation = [...teamIds];
  const rounds = [];
  const half = rotation.length / 2;

  for (let roundIndex = 0; roundIndex < rotation.length - 1; roundIndex += 1) {
    const pairings = [];
    for (let index = 0; index < half; index += 1) {
      const home = rotation[index];
      const away = rotation[rotation.length - 1 - index];
      pairings.push(roundIndex % 2 === 0 ? [home, away] : [away, home]);
    }

    rounds.push(pairings);
    rotation.splice(1, 0, rotation.pop());
  }

  const reverseRounds = rounds.map((round) => round.map(([teamAId, teamBId]) => [teamBId, teamAId]));
  return [...rounds, ...reverseRounds];
}

function seasonDates() {
  return [
    "2026-04-27",
    "2026-05-04",
    "2026-05-11",
    "2026-05-18",
    "2026-05-25",
    "2026-06-01",
    "2026-06-08",
    "2026-06-15",
    "2026-06-22",
    "2026-06-29",
    "2026-07-06",
    "2026-07-13",
    "2026-07-20",
    "2026-07-27",
    "2026-08-03",
    "2026-08-10",
    "2026-08-17",
    "2026-08-24",
    "2026-08-31",
  ];
}

function getTeam(teamId) {
  return state.teams.find((team) => team.id === teamId) || null;
}

function renderTeamOptions(selectedId) {
  return state.teams.map((team) => `
    <option value="${team.id}" ${team.id === selectedId ? "selected" : ""}>${escapeHtml(team.name)}</option>
  `).join("");
}

function formatHandicap(value) {
  if (value === null) {
    return "--";
  }

  return value >= 0 ? `+${value.toFixed(1)}` : value.toFixed(1);
}

function formatDate(dateString) {
  if (!dateString) {
    return "No date";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${dateString}T00:00:00`));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadJson(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}
