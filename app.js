// ---------------------------------------------------------------------------
// Firebase initialisation
// Replace the placeholder values below with your project's config object
// from: Firebase Console → Project Settings → Your apps → SDK setup
// ---------------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyD6bG9_cV5zqq_wdEFSwx7LoSEI5btUbzE",
  authDomain: "golfleagueapp-74095.firebaseapp.com",
  projectId: "golfleagueapp-74095",
  storageBucket: "golfleagueapp-74095.firebasestorage.app",
  messagingSenderId: "534713793932",
  appId: "1:534713793932:web:6554dcf8d6d1097ad86aa9",
  measurementId: "G-J6WH31K3Q3",
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const DOC_REF = db.collection("league").doc("state");

// ---------------------------------------------------------------------------

const FRONT_NINE_PARS = [5, 5, 3, 4, 3, 4, 3, 4, 5]; // total: 36
const BACK_NINE_PARS  = [5, 4, 3, 5, 3, 4, 3, 4, 4]; // total: 35

// Stroke index (1 = hardest, 18 = easiest) for holes 1–18
const FRONT_NINE_HOLE_HANDICAPS = [13, 3, 9, 15, 17, 4, 12, 11, 1];
const BACK_NINE_HOLE_HANDICAPS  = [6, 7, 10, 2, 16, 8, 5, 18, 14];

let state = {};
let adminSelectedWeekId = null;
let adminSelectedTeamId = null;
let statsSort = { col: null, dir: 1 }; // dir: 1 = asc, -1 = desc

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
const subAdminContainer = document.querySelector("#subAdminContainer");
const addSubBtn = document.querySelector("#addSubBtn");
const statsTableBody = document.querySelector("#statsTableBody");
const adminDrawer = document.querySelector("#adminDrawer");
const loginBtn = document.querySelector("#loginBtn");
const logoutBtn = document.querySelector("#logoutBtn");
const loginModal = document.querySelector("#loginModal");
const loginSubmitBtn = document.querySelector("#loginSubmitBtn");
const loginCancelBtn = document.querySelector("#loginCancelBtn");
const loginError = document.querySelector("#loginError");

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindGlobalActions();
  bindAuthActions();
  bindStatsSort();
  subscribeToAuthState();
  subscribeToState();
});

// ---------------------------------------------------------------------------
// Firestore state sync
// ---------------------------------------------------------------------------

function subscribeToState() {
  DOC_REF.onSnapshot((snap) => {
    if (snap.exists) {
      state = normalizeState(snap.data());
    } else {
      // First-ever load: seed Firestore with defaults (only succeeds when logged in)
      state = normalizeState({});
      if (auth.currentUser) {
        DOC_REF.set(state).catch((err) => console.error("Seed failed:", err));
      }
    }
    renderWeekOptions();
    renderAll();
  }, (err) => {
    console.error("Firestore listener error:", err);
  });
}

function saveState() {
  DOC_REF.set(state).catch((err) => console.error("Save failed:", err));
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function subscribeToAuthState() {
  auth.onAuthStateChanged((user) => {
    if (user) {
      adminDrawer.removeAttribute("hidden");
      logoutBtn.removeAttribute("hidden");
      loginBtn.setAttribute("hidden", "");
    } else {
      adminDrawer.setAttribute("hidden", "");
      logoutBtn.setAttribute("hidden", "");
      loginBtn.removeAttribute("hidden");
    }
    // Re-render scores so inputs enable/disable correctly
    renderScores();
  });
}

function bindAuthActions() {
  loginBtn.addEventListener("click", () => {
    loginModal.removeAttribute("hidden");
    loginError.setAttribute("hidden", "");
    loginError.textContent = "";
    document.querySelector("#loginEmail").value = "";
    document.querySelector("#loginPassword").value = "";
  });

  loginCancelBtn.addEventListener("click", () => {
    loginModal.setAttribute("hidden", "");
  });

  loginModal.addEventListener("click", (event) => {
    if (event.target === loginModal) {
      loginModal.setAttribute("hidden", "");
    }
  });

  loginSubmitBtn.addEventListener("click", handleLogin);

  document.querySelector("#loginPassword").addEventListener("keydown", (event) => {
    if (event.key === "Enter") handleLogin();
  });

  logoutBtn.addEventListener("click", () => {
    auth.signOut();
  });
}

function bindStatsSort() {
  document.querySelector("#statsTable thead").addEventListener("click", (event) => {
    const th = event.target.closest("th[data-col]");
    if (!th) return;
    const col = th.dataset.col;
    statsSort.dir = statsSort.col === col ? statsSort.dir * -1 : 1;
    statsSort.col = col;
    renderStats();
  });
}

async function handleLogin() {
  const email = document.querySelector("#loginEmail").value.trim();
  const password = document.querySelector("#loginPassword").value;

  loginSubmitBtn.disabled = true;
  loginError.setAttribute("hidden", "");

  try {
    await auth.signInWithEmailAndPassword(email, password);
    loginModal.setAttribute("hidden", "");
  } catch {
    loginError.textContent = "Incorrect email or password.";
    loginError.removeAttribute("hidden");
  } finally {
    loginSubmitBtn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// State normalisation
// ---------------------------------------------------------------------------

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
          startingHandicap: Number.isFinite(player.startingHandicap) ? player.startingHandicap : null,
        }))
        : [
          { id: crypto.randomUUID(), name: "Player 1", startingHandicap: null },
          { id: crypto.randomUUID(), name: "Player 2", startingHandicap: null },
        ],
    })),
    schedule: schedule.map((week, weekIndex) => ({
      id: week.id || `week-${weekIndex + 1}`,
      label: week.label || `Week ${weekIndex + 1}`,
      date: week.date || seasonDates()[weekIndex] || "",
      nines: week.nines === "back" ? "back" : "front",
      matches: Array.isArray(week.matches)
        ? week.matches.map((match, matchIndex) => ({
          id: match.id || `match-${weekIndex + 1}-${matchIndex + 1}`,
          teamAId: match.teamAId || "",
          teamBId: match.teamBId || "",
        }))
        : [],
    })),
    scores: rawState.scores || {},
    subPlayers: Array.isArray(rawState.subPlayers)
      ? rawState.subPlayers.map((s) => ({
        id: s.id || crypto.randomUUID(),
        name: s.name || "Sub Player",
        startingHandicap: Number.isFinite(s.startingHandicap) ? s.startingHandicap : null,
      }))
      : [],
    subAssignments: rawState.subAssignments || {},
    selectedWeekId,
  };
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

function bindNavigation() {
  window.addEventListener("hashchange", renderPageFromHash);
  renderPageFromHash();
}

function renderPageFromHash() {
  const requested = window.location.hash.replace("#", "") || "home";
  const pages = [...document.querySelectorAll("[data-page]")];
  const activePage = pages.find((page) => page.dataset.page === requested) ? requested : "home";

  pages.forEach((page) => {
    page.classList.toggle("is-active", page.dataset.page === activePage);
  });
}

// ---------------------------------------------------------------------------
// Global action bindings
// ---------------------------------------------------------------------------

function bindGlobalActions() {
  scoreWeekSelect.addEventListener("change", (event) => {
    state.selectedWeekId = event.target.value;
    saveState();
    renderScores();
  });

  addTeamBtn.addEventListener("click", () => {
    const newTeam = createTeam(state.teams.length + 1);
    state.teams.push(newTeam);
    adminSelectedTeamId = newTeam.id;
    saveState();
    renderWeekOptions();
    renderAll();
  });

  addSubBtn.addEventListener("click", () => {
    state.subPlayers = [...(state.subPlayers || []), {
      id: crypto.randomUUID(),
      name: "New Sub",
      startingHandicap: null,
    }];
    saveState();
    renderSubAdmin();
    renderScores();
  });

  regenerateScheduleBtn.addEventListener("click", () => {
    state.schedule = createStandardSchedule(state.teams, seasonDates());
    state.selectedWeekId = state.schedule.find((week) => week.matches.length)?.id || state.schedule[0]?.id || "";
    saveState();
    renderWeekOptions();
    renderAll();
  });
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderAll() {
  renderStandings();
  renderHandicaps();
  renderScores();
  renderSchedule();
  renderNextMatchups();
  renderStats();
  renderTeamAdmin();
  renderScheduleAdmin();
  renderSubAdmin();
}

// Returns { teamA: 0|1|2, teamB: 0|1|2 } or null if scores incomplete
function calculateTeamNetPoints(week, match) {
  const teamA = getTeam(match.teamAId);
  const teamB = getTeam(match.teamBId);
  if (!teamA || !teamB) return null;

  const totals = [teamA, teamB].map((team) =>
    team.players.map((p) => calculateRoundTotal(getScoreEntry(week.id, match.id, p.id).holes))
  );
  if (totals.flat().some((t) => t === null)) return null;

  const net = [teamA, teamB].map((team, ti) =>
    totals[ti].reduce((s, t) => s + t, 0)
    - team.players.reduce((s, p) => s + (getEffectiveHandicap(week.id, match.id, p.id) ?? 0), 0)
  );

  if (net[0] < net[1]) return { teamA: 2, teamB: 0 };
  if (net[1] < net[0]) return { teamA: 0, teamB: 2 };
  return { teamA: 1, teamB: 1 };
}

function computeTeamPoints(teamId) {
  let total = 0;
  for (const week of state.schedule || []) {
    const holeHandicaps = week.nines === "back" ? BACK_NINE_HOLE_HANDICAPS : FRONT_NINE_HOLE_HANDICAPS;
    for (const match of week.matches) {
      const isA = match.teamAId === teamId;
      const isB = match.teamBId === teamId;
      if (!isA && !isB) continue;

      const teamA = getTeam(match.teamAId);
      const teamB = getTeam(match.teamBId);
      if (!teamA || !teamB) continue;

      // Individual hole points
      for (let i = 0; i < 2; i++) {
        const { pointsA, pointsB } = calculateMatchPoints(
          getScoreEntry(week.id, match.id, teamA.players[i].id).holes,
          getScoreEntry(week.id, match.id, teamB.players[i].id).holes,
          getEffectiveHandicap(week.id, match.id, teamA.players[i].id),
          getEffectiveHandicap(week.id, match.id, teamB.players[i].id),
          holeHandicaps,
        );
        const pts = isA ? pointsA : pointsB;
        total += pts.filter((p) => p !== null).reduce((s, p) => s + p, 0);
      }

      // Team net points
      const teamPts = calculateTeamNetPoints(week, match);
      if (teamPts) total += isA ? teamPts.teamA : teamPts.teamB;
    }
  }
  return total;
}

function renderStandings() {
  const standings = [...state.teams]
    .map((team) => ({ ...team, computed: computeTeamPoints(team.id) }))
    .sort((a, b) => b.computed - a.computed || a.name.localeCompare(b.name));
  standingsMeta.textContent = `${standings.length} teams`;
  standingsTableBody.innerHTML = standings.map((team, index) => {
    const playerNames = team.players.map((p) => escapeHtml(p.name)).join(" and ");
    return `
      <tr>
        <td class="rank-cell">${index + 1}</td>
        <td class="team-cell">
          ${escapeHtml(team.name)}
          <span class="standings-players">${playerNames}</span>
        </td>
        <td><span class="points-pill">${team.computed % 1 === 0 ? team.computed : team.computed.toFixed(1)}</span></td>
      </tr>
    `;
  }).join("");
}

function renderHandicaps() {
  const playerRows = getPlayerRows().map((row) => {
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
  });

  const subRows = (state.subPlayers || []).map((sub) => {
    const handicap = calculateSubHandicap(sub.id);
    const rounds = getSubRounds(sub.id);
    const scoreList = rounds.map((r) => `${r.weekLabel}: ${r.total}`).join(" | ") || "No scores yet";
    return `
      <tr>
        <td class="team-cell">${escapeHtml(sub.name)}</td>
        <td><em>Substitute</em></td>
        <td>${escapeHtml(scoreList)}</td>
        <td>${formatHandicap(handicap)}</td>
      </tr>
    `;
  });

  handicapTableBody.innerHTML = [...playerRows, ...subRows].join("");
}

function renderWeekOptions() {
  scoreWeekSelect.innerHTML = state.schedule
    ? state.schedule.map((week) => `
        <option value="${week.id}">${escapeHtml(week.label)} - ${formatDate(week.date)} (${week.nines === "back" ? "Back 9" : "Front 9"})</option>
      `).join("")
    : "";

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

  scoresWeekLabel.textContent = `${week.label} | ${formatDate(week.date)} | ${week.nines === "back" ? "Back 9" : "Front 9"}`;

  if (!week.matches.length) {
    scoresContainer.innerHTML = `<div class="empty-state">No matches scheduled for this week.</div>`;
    return;
  }

  scoresContainer.innerHTML = week.matches.map((match) => renderScoreMatchCard(week, match)).join("");
  bindScoreInputs();
}

function calculateMatchPoints(holesA, holesB, hcpA, hcpB, holeHandicaps) {
  const roundedA = hcpA ?? 0;
  const roundedB = hcpB ?? 0;
  const diff = roundedA - roundedB;
  const strokesForA = diff > 0 ? Math.min(diff, 9) : 0;
  const strokesForB = diff < 0 ? Math.min(-diff, 9) : 0;

  // Sort hole indices hardest-first (lowest SI number = hardest)
  const hardestFirst = holeHandicaps
    .map((si, idx) => ({ idx, si }))
    .sort((a, b) => a.si - b.si)
    .map(({ idx }) => idx);

  const strokeHolesA = new Set(hardestFirst.slice(0, strokesForA));
  const strokeHolesB = new Set(hardestFirst.slice(0, strokesForB));

  const pointsA = Array(9).fill(null);
  const pointsB = Array(9).fill(null);

  for (let i = 0; i < 9; i++) {
    if (!Number.isFinite(holesA[i]) || !Number.isFinite(holesB[i])) continue;
    const adjA = holesA[i] - (strokeHolesA.has(i) ? 1 : 0);
    const adjB = holesB[i] - (strokeHolesB.has(i) ? 1 : 0);
    if (adjA < adjB)      { pointsA[i] = 1;   pointsB[i] = 0;   }
    else if (adjB < adjA) { pointsA[i] = 0;   pointsB[i] = 1;   }
    else                  { pointsA[i] = 0.5; pointsB[i] = 0.5; }
  }

  return { pointsA, pointsB, strokeHolesA, strokeHolesB };
}

function renderScoreMatchCard(week, match) {
  const teamA = getTeam(match.teamAId);
  const teamB = getTeam(match.teamBId);

  if (!teamA || !teamB) {
    return `<div class="match-card"><div class="empty-state">This matchup has missing teams. Update it in the admin schedule editor.</div></div>`;
  }

  const holeHandicaps = week.nines === "back" ? BACK_NINE_HOLE_HANDICAPS : FRONT_NINE_HOLE_HANDICAPS;

  // Pair A[0] vs B[0] and A[1] vs B[1]
  const pairs = [0, 1].map((i) => {
    const pA = teamA.players[i];
    const pB = teamB.players[i];
    return calculateMatchPoints(
      getScoreEntry(week.id, match.id, pA.id).holes,
      getScoreEntry(week.id, match.id, pB.id).holes,
      getEffectiveHandicap(week.id, match.id, pA.id),
      getEffectiveHandicap(week.id, match.id, pB.id),
      holeHandicaps,
    );
  });

  const sumPts = (ptsArr) => ptsArr.filter((p) => p !== null).reduce((s, p) => s + p, 0);
  const indivA = sumPts(pairs[0].pointsA) + sumPts(pairs[1].pointsA);
  const indivB = sumPts(pairs[0].pointsB) + sumPts(pairs[1].pointsB);
  const teamPts = calculateTeamNetPoints(week, match);
  const fmtPts = (n) => n % 1 === 0 ? `${n}` : n.toFixed(1);

  const summaryRow = (teamName, indiv, teamNet, total) => `
    <div class="match-summary-row">
      <span class="match-summary-team">${escapeHtml(teamName)}</span>
      <span class="match-summary-detail">
        ${fmtPts(indiv)} individual
        + ${teamNet !== null ? teamNet : "—"} team
        = <strong>${teamNet !== null ? fmtPts(total) : "—"} pts</strong>
      </span>
    </div>
  `;

  return `
    <article class="match-card">
      <div class="match-header">
        <div>
          <p class="section-kicker">Match</p>
          <div class="match-title">${escapeHtml(teamA.name)} vs ${escapeHtml(teamB.name)}</div>
        </div>
        <div class="score-note">${formatDate(week.date)} · ${week.nines === "back" ? "Back 9" : "Front 9"}</div>
      </div>
      <div class="score-grid">
        ${renderPlayerScoreCard(week.id, match.id, teamA.name, teamA.players[0], week.nines, pairs[0].pointsA, pairs[0].strokeHolesA)}
        ${renderPlayerScoreCard(week.id, match.id, teamA.name, teamA.players[1], week.nines, pairs[1].pointsA, pairs[1].strokeHolesA)}
        ${renderPlayerScoreCard(week.id, match.id, teamB.name, teamB.players[0], week.nines, pairs[0].pointsB, pairs[0].strokeHolesB)}
        ${renderPlayerScoreCard(week.id, match.id, teamB.name, teamB.players[1], week.nines, pairs[1].pointsB, pairs[1].strokeHolesB)}
      </div>
      <div class="match-summary">
        ${summaryRow(teamA.name, indivA, teamPts ? teamPts.teamA : null, indivA + (teamPts?.teamA ?? 0))}
        ${summaryRow(teamB.name, indivB, teamPts ? teamPts.teamB : null, indivB + (teamPts?.teamB ?? 0))}
      </div>
    </article>
  `;
}

function renderPlayerScoreCard(weekId, matchId, teamName, player, nines, points, strokeHoles) {
  const scoreEntry = getScoreEntry(weekId, matchId, player.id);
  const total = calculateRoundTotal(scoreEntry.holes);
  const isAdmin = !!auth.currentUser;
  const pars = nines === "back" ? BACK_NINE_PARS : FRONT_NINE_PARS;
  const holeHandicaps = nines === "back" ? BACK_NINE_HOLE_HANDICAPS : FRONT_NINE_HOLE_HANDICAPS;

  const totalPoints = points ? points.filter((p) => p !== null).reduce((s, p) => s + p, 0) : null;
  const hasPoints = points && points.some((p) => p !== null);
  const subId = getSubAssignment(weekId, matchId, player.id);
  const sub = subId ? getSubPlayer(subId) : null;
  const handicap = getEffectiveHandicap(weekId, matchId, player.id);
  const displayName = sub ? sub.name : player.name;
  const subPlayers = state.subPlayers || [];

  return `
    <section class="player-score-card">
      <div class="player-card-header">
        <h4>
          ${escapeHtml(displayName)}
          ${sub ? `<span class="sub-badge">SUB for ${escapeHtml(player.name)}</span>` : ""}
        </h4>
        ${hasPoints ? `<span class="points-badge">${Number.isInteger(totalPoints) ? totalPoints : totalPoints.toFixed(1)} pts</span>` : ""}
      </div>
      ${isAdmin ? `
        <div class="sub-row">
          <label class="compact-field">
            <span>Player</span>
            <select data-sub-toggle data-week-id="${weekId}" data-match-id="${matchId}" data-player-id="${player.id}">
              <option value="">Regular — ${escapeHtml(player.name)}</option>
              ${subPlayers.map((s) => `<option value="${s.id}" ${s.id === subId ? "selected" : ""}>${escapeHtml(s.name)}</option>`).join("")}
            </select>
          </label>
          ${sub ? `<span class="sub-hcp-note">Hcp: ${formatHandicap(handicap)}</span>` : ""}
        </div>
      ` : ""}
      <div class="score-summary">
        <strong>${escapeHtml(teamName)}</strong>
        <span>Hcp: ${formatHandicap(handicap)}${strokeHoles && strokeHoles.size > 0 ? ` · ${strokeHoles.size} strokes` : ""}</span>
      </div>
      <div class="hole-grid">
        ${Array.from({ length: 9 }, (_, index) => {
          const hasStroke = strokeHoles && strokeHoles.has(index);
          const pt = points ? points[index] : null;
          const holeClass = pt === 1 ? " hole-win" : pt === 0.5 ? " hole-tie" : "";
          return `
            <label class="hole-field${holeClass}">
              <span class="hole-label-row">${index + 1}${hasStroke ? `<span class="stroke-dot">+1</span>` : ""}</span>
              <span class="hole-par">P${pars[index]} · h${holeHandicaps[index]}</span>
              <input type="number" min="1" max="15" value="${scoreEntry.holes[index] ?? ""}"
                data-week-id="${weekId}" data-match-id="${matchId}"
                data-player-id="${player.id}" data-hole-index="${index}"
                ${isAdmin ? "" : "disabled"}>
            </label>
          `;
        }).join("")}
        <label class="hole-field hole-total">
          <span>Total</span>
          <span class="hole-par">P${pars.reduce((s, p) => s + p, 0)}</span>
          <input type="number" readonly tabindex="-1" value="${total ?? ""}" data-player-total="${player.id}">
        </label>
      </div>
    </section>
  `;
}

function bindScoreInputs() {
  if (!auth.currentUser) return;

  document.querySelectorAll("[data-sub-toggle]").forEach((select) => {
    select.addEventListener("change", (event) => {
      const { weekId, matchId, playerId } = event.target.dataset;
      setSubAssignment(weekId, matchId, playerId, event.target.value || null);
      renderScores();
      renderHandicaps();
      saveState();
    });
  });

  document.querySelectorAll("[data-hole-index]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const { playerId } = event.target.dataset;
      const holeInputs = [...document.querySelectorAll(`[data-player-id="${playerId}"][data-hole-index]`)];
      const values = holeInputs.map((el) => el.value === "" ? null : Number(el.value));
      const allFilled = values.every((v) => Number.isFinite(v));
      const totalField = document.querySelector(`[data-player-total="${playerId}"]`);
      if (totalField) {
        totalField.value = allFilled ? values.reduce((sum, v) => sum + v, 0) : "";
      }
    });

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
        <div class="week-date">${week.nines === "back" ? "Back 9" : "Front 9"} · ${week.matches.length} matches</div>
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

  matchupMeta.textContent = `${nextWeek.label} | ${formatDate(nextWeek.date)} | ${nextWeek.nines === "back" ? "Back 9" : "Front 9"}`;
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
  if (!adminSelectedTeamId || !state.teams.find((t) => t.id === adminSelectedTeamId)) {
    adminSelectedTeamId = state.teams[0]?.id || null;
  }

  const team = state.teams.find((t) => t.id === adminSelectedTeamId);

  teamAdminContainer.innerHTML = `
    <div class="schedule-admin-top">
      <label class="compact-field">
        <span>Team</span>
        <select id="adminTeamSelect">
          ${state.teams.map((t) => `
            <option value="${t.id}" ${t.id === adminSelectedTeamId ? "selected" : ""}>
              ${escapeHtml(t.name)}
            </option>
          `).join("")}
        </select>
      </label>
    </div>

    ${team ? `
      <article class="team-admin-card">
        <div class="team-admin-header">
          <h4>${escapeHtml(team.name || "Unnamed Team")}</h4>
          <button class="btn btn-danger" type="button" data-remove-team-id="${team.id}">Remove</button>
        </div>
        <div class="team-top-fields">
          <label class="compact-field">
            <span>Team Name</span>
            <input type="text" value="${escapeHtml(team.name)}" data-team-field="name" data-team-id="${team.id}">
          </label>
          <label class="compact-field">
            <span>Points</span>
            <input type="number" value="${team.points}" data-team-field="points" data-team-id="${team.id}">
          </label>
        </div>
        ${team.players.map((player, index) => `
          <div class="player-admin-row">
            <label class="compact-field">
              <span>Player ${index + 1}</span>
              <input type="text" value="${escapeHtml(player.name)}" data-player-name="${player.id}" data-team-id="${team.id}">
            </label>
            <label class="compact-field">
              <span>Starting Hcp</span>
              <input type="number" value="${player.startingHandicap ?? ""}" placeholder="—" data-player-hcp="${player.id}" data-team-id="${team.id}">
            </label>
          </div>
        `).join("")}
      </article>
    ` : ""}
  `;

  document.getElementById("adminTeamSelect").addEventListener("change", (event) => {
    adminSelectedTeamId = event.target.value;
    renderTeamAdmin();
  });

  const nameInput = teamAdminContainer.querySelector("[data-team-field='name']");
  if (nameInput) {
    nameInput.addEventListener("change", (event) => {
      const t = getTeam(event.target.dataset.teamId);
      if (!t) return;
      t.name = event.target.value.trim() || "Unnamed Team";
      saveState();
      renderAll();
    });
  }

  const pointsInput = teamAdminContainer.querySelector("[data-team-field='points']");
  if (pointsInput) {
    pointsInput.addEventListener("change", (event) => {
      const t = getTeam(event.target.dataset.teamId);
      if (!t) return;
      t.points = Number(event.target.value) || 0;
      saveState();
      renderAll();
    });
  }

  teamAdminContainer.querySelectorAll("[data-player-name]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const t = getTeam(event.target.dataset.teamId);
      const player = t?.players.find((p) => p.id === event.target.dataset.playerName);
      if (!player) return;
      player.name = event.target.value.trim() || player.name;
      saveState();
      renderAll();
    });
  });

  teamAdminContainer.querySelectorAll("[data-player-hcp]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const t = getTeam(event.target.dataset.teamId);
      const player = t?.players.find((p) => p.id === event.target.dataset.playerHcp);
      if (!player) return;
      player.startingHandicap = event.target.value === "" ? null : Number(event.target.value);
      saveState();
      renderAll();
    });
  });

  const removeBtn = teamAdminContainer.querySelector("[data-remove-team-id]");
  if (removeBtn) {
    removeBtn.addEventListener("click", (event) => {
      const teamId = event.target.dataset.removeTeamId;
      state.teams = state.teams.filter((t) => t.id !== teamId);
      state.schedule.forEach((week) => {
        week.matches = week.matches.filter((match) => match.teamAId !== teamId && match.teamBId !== teamId);
      });
      adminSelectedTeamId = null;
      saveState();
      renderWeekOptions();
      renderAll();
    });
  }
}

function renderScheduleAdmin() {
  // Default to first week if nothing selected or selection no longer valid
  if (!adminSelectedWeekId || !state.schedule.find((w) => w.id === adminSelectedWeekId)) {
    adminSelectedWeekId = state.schedule[0]?.id || null;
  }

  const week = state.schedule.find((w) => w.id === adminSelectedWeekId);

  scheduleAdminContainer.innerHTML = `
    <label class="compact-field">
      <span>Week</span>
      <select id="adminWeekSelect">
        ${state.schedule.map((w) => `
          <option value="${w.id}" ${w.id === adminSelectedWeekId ? "selected" : ""}>
            ${escapeHtml(w.label)} — ${formatDate(w.date)}
          </option>
        `).join("")}
      </select>
    </label>

    ${week ? `
      <article class="schedule-edit-card">
        <div class="week-admin-fields">
          <label class="compact-field">
            <span>Week Date</span>
            <input type="date" value="${week.date}" data-week-date-id="${week.id}">
          </label>
          <label class="compact-field">
            <span>Nine</span>
            <select data-week-nines-id="${week.id}">
              <option value="front" ${week.nines !== "back" ? "selected" : ""}>Front 9</option>
              <option value="back" ${week.nines === "back" ? "selected" : ""}>Back 9</option>
            </select>
          </label>
        </div>
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
        <button class="btn btn-ghost" type="button" data-add-match-week-id="${week.id}" style="margin-top:10px">Add Match</button>
      </article>
    ` : ""}
  `;

  document.getElementById("adminWeekSelect").addEventListener("change", (event) => {
    adminSelectedWeekId = event.target.value;
    renderScheduleAdmin();
  });

  const weekDateInput = scheduleAdminContainer.querySelector("[data-week-date-id]");
  if (weekDateInput) {
    weekDateInput.addEventListener("change", (event) => {
      const w = state.schedule.find((entry) => entry.id === event.target.dataset.weekDateId);
      if (!w) return;

      const diffDays = Math.round(
        (new Date(`${event.target.value}T00:00:00`) - new Date(`${w.date}T00:00:00`))
        / 86400000
      );
      const weekIndex = state.schedule.indexOf(w);
      w.date = event.target.value;

      state.schedule.slice(weekIndex + 1).forEach((subsequent) => {
        const d = new Date(`${subsequent.date}T00:00:00`);
        d.setDate(d.getDate() + diffDays);
        subsequent.date = d.toISOString().split("T")[0];
      });

      saveState();
      renderAll();
    });
  }

  const weekNinesSelect = scheduleAdminContainer.querySelector("[data-week-nines-id]");
  if (weekNinesSelect) {
    weekNinesSelect.addEventListener("change", (event) => {
      const w = state.schedule.find((entry) => entry.id === event.target.dataset.weekNinesId);
      if (!w) return;
      w.nines = event.target.value;
      saveState();
      renderAll();
    });
  }

  scheduleAdminContainer.querySelectorAll("[data-match-team]").forEach((select) => {
    select.addEventListener("change", (event) => {
      const w = state.schedule.find((entry) => entry.id === event.target.dataset.weekId);
      const match = w?.matches.find((entry) => entry.id === event.target.dataset.matchId);
      if (!match) return;
      match[event.target.dataset.matchTeam] = event.target.value;
      saveState();
      renderAll();
    });
  });

  scheduleAdminContainer.querySelectorAll("[data-remove-match-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const w = state.schedule.find((entry) => entry.id === event.target.dataset.weekId);
      if (!w) return;
      w.matches = w.matches.filter((match) => match.id !== event.target.dataset.removeMatchId);
      saveState();
      renderAll();
    });
  });

  const addMatchBtn = scheduleAdminContainer.querySelector("[data-add-match-week-id]");
  if (addMatchBtn) {
    addMatchBtn.addEventListener("click", (event) => {
      const w = state.schedule.find((entry) => entry.id === event.target.dataset.addMatchWeekId);
      if (!w) return;
      w.matches.push({
        id: crypto.randomUUID(),
        teamAId: state.teams[0]?.id || "",
        teamBId: state.teams[1]?.id || "",
      });
      saveState();
      renderAll();
    });
  }
}

function renderSubAdmin() {
  const subPlayers = state.subPlayers || [];

  if (!subPlayers.length) {
    subAdminContainer.innerHTML = `<div class="empty-state">No substitutes registered. Click "Add Sub" to get started.</div>`;
    return;
  }

  subAdminContainer.innerHTML = subPlayers.map((sub) => `
    <article class="team-admin-card">
      <div class="team-admin-header">
        <h4>${escapeHtml(sub.name)}</h4>
        <button class="btn btn-danger" type="button" data-remove-sub-id="${sub.id}">Remove</button>
      </div>
      <div class="team-top-fields">
        <label class="compact-field">
          <span>Name</span>
          <input type="text" value="${escapeHtml(sub.name)}" data-sub-player-name="${sub.id}">
        </label>
        <label class="compact-field">
          <span>Starting Hcp</span>
          <input type="number" value="${sub.startingHandicap ?? ""}" placeholder="—" data-sub-player-hcp="${sub.id}">
        </label>
      </div>
    </article>
  `).join("");

  subAdminContainer.querySelectorAll("[data-sub-player-name]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const sub = getSubPlayer(event.target.dataset.subPlayerName);
      if (!sub) return;
      sub.name = event.target.value.trim() || sub.name;
      saveState();
      renderAll();
    });
  });

  subAdminContainer.querySelectorAll("[data-sub-player-hcp]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const sub = getSubPlayer(event.target.dataset.subPlayerHcp);
      if (!sub) return;
      sub.startingHandicap = event.target.value === "" ? null : Number(event.target.value);
      saveState();
      renderHandicaps();
      renderScores();
    });
  });

  subAdminContainer.querySelectorAll("[data-remove-sub-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const subId = event.target.dataset.removeSubId;
      state.subPlayers = state.subPlayers.filter((s) => s.id !== subId);
      // Remove any active assignments for this sub
      Object.values(state.subAssignments || {}).forEach((weekAssign) => {
        Object.values(weekAssign).forEach((matchAssign) => {
          Object.keys(matchAssign).forEach((pid) => {
            if (matchAssign[pid] === subId) delete matchAssign[pid];
          });
        });
      });
      saveState();
      renderAll();
    });
  });
}

// ---------------------------------------------------------------------------
// Data queries
// ---------------------------------------------------------------------------

function getSelectedWeek() {
  return state.schedule?.find((week) => week.id === state.selectedWeekId) || state.schedule?.[0];
}

function getNextMatchupWeek() {
  const today = new Date();
  const sorted = [...(state.schedule || [])].sort((left, right) => left.date.localeCompare(right.date));
  return sorted.find((week) => week.matches.length && new Date(`${week.date}T00:00:00`) >= today)
    || sorted.find((week) => week.matches.length)
    || null;
}

function getPlayerRows() {
  return (state.teams || []).flatMap((team) => team.players.map((player) => ({
    playerId: player.id,
    playerName: player.name,
    teamName: team.name,
  })));
}

function calculateHandicap(playerId, beforeWeekId = null) {
  const player = (state.teams || []).flatMap((t) => t.players).find((p) => p.id === playerId);
  const startingHandicap = player?.startingHandicap ?? null;

  const allRounds = getPlayerRounds(playerId);
  const actualRounds = beforeWeekId
    ? allRounds.filter((r) => r.weekId !== beforeWeekId)
    : allRounds;

  // Starting handicap counts as two prior rounds; they drop off as real rounds accumulate
  const overParValues = [
    ...(startingHandicap !== null ? [startingHandicap, startingHandicap] : []),
    ...actualRounds.map((r) => r.total - r.par),
  ].slice(-3);

  if (!overParValues.length) return null;
  return Math.round(overParValues.reduce((sum, v) => sum + v, 0) / overParValues.length);
}

function getPlayerRounds(playerId) {
  const rounds = [];

  (state.schedule || []).forEach((week) => {
    const pars = week.nines === "back" ? BACK_NINE_PARS : FRONT_NINE_PARS;
    const par = pars.reduce((s, p) => s + p, 0);

    week.matches.forEach((match) => {
      const entry = getScoreEntry(week.id, match.id, playerId);
      const total = calculateRoundTotal(entry.holes);

      if (total !== null) {
        rounds.push({
          weekId: week.id,
          weekLabel: week.label,
          weekDate: week.date,
          total,
          par,
        });
      }
    });
  });

  return rounds.sort((left, right) => left.weekDate.localeCompare(right.weekDate));
}

function getScoreEntry(weekId, matchId, playerId) {
  const weekScores = (state.scores || {})[weekId] || {};
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
  if (!Array.isArray(holes) || holes.some((hole) => !Number.isFinite(hole))) return null;
  return holes.reduce((sum, hole) => sum + hole, 0);
}

function getTeam(teamId) {
  return (state.teams || []).find((team) => team.id === teamId) || null;
}

function getSubPlayer(subId) {
  return (state.subPlayers || []).find((s) => s.id === subId) || null;
}

function getSubAssignment(weekId, matchId, playerId) {
  return state.subAssignments?.[weekId]?.[matchId]?.[playerId] || null;
}

function setSubAssignment(weekId, matchId, playerId, subId) {
  state.subAssignments ||= {};
  state.subAssignments[weekId] ||= {};
  state.subAssignments[weekId][matchId] ||= {};
  if (subId === null) {
    delete state.subAssignments[weekId][matchId][playerId];
  } else {
    state.subAssignments[weekId][matchId][playerId] = subId;
  }
}

function getSubRounds(subId) {
  const rounds = [];
  (state.schedule || []).forEach((week) => {
    const pars = week.nines === "back" ? BACK_NINE_PARS : FRONT_NINE_PARS;
    const par = pars.reduce((s, p) => s + p, 0);
    week.matches.forEach((match) => {
      const assignments = state.subAssignments?.[week.id]?.[match.id] || {};
      const regularPlayerId = Object.keys(assignments).find((pid) => assignments[pid] === subId);
      if (!regularPlayerId) return;
      const entry = getScoreEntry(week.id, match.id, regularPlayerId);
      const total = calculateRoundTotal(entry.holes);
      if (total !== null) {
        rounds.push({ weekId: week.id, weekLabel: week.label, weekDate: week.date, total, par });
      }
    });
  });
  return rounds.sort((a, b) => a.weekDate.localeCompare(b.weekDate));
}

function calculateSubHandicap(subId, beforeWeekId = null) {
  const sub = getSubPlayer(subId);
  const startingHandicap = sub?.startingHandicap ?? null;

  const allRounds = getSubRounds(subId);
  const actualRounds = beforeWeekId
    ? allRounds.filter((r) => r.weekId !== beforeWeekId)
    : allRounds;

  const overParValues = [
    ...(startingHandicap !== null ? [startingHandicap, startingHandicap] : []),
    ...actualRounds.map((r) => r.total - r.par),
  ].slice(-3);

  if (!overParValues.length) return null;
  return Math.round(overParValues.reduce((s, v) => s + v, 0) / overParValues.length);
}

function getEffectiveHandicap(weekId, matchId, playerId) {
  const subId = getSubAssignment(weekId, matchId, playerId);
  if (subId) return calculateSubHandicap(subId, weekId);
  return calculateHandicap(playerId, weekId);
}

function renderStats() {
  const rows = [];

  for (const team of (state.teams || [])) {
    for (const player of team.players) {
      rows.push({ name: player.name, teamName: team.name, teamLabel: escapeHtml(team.name), stats: collectPlayerStats(player.id) });
    }
  }
  for (const sub of (state.subPlayers || [])) {
    rows.push({ name: sub.name, teamName: "Substitute", teamLabel: "<em>Substitute</em>", stats: collectSubStats(sub.id) });
  }

  if (statsSort.col) {
    rows.sort((a, b) => {
      const va = statSortValue(a, statsSort.col);
      const vb = statSortValue(b, statsSort.col);
      if (va === vb) return 0;
      return (va < vb ? -1 : 1) * statsSort.dir;
    });
  }

  const fmtPts = (n) => n % 1 === 0 ? `${n}` : n.toFixed(1);

  statsTableBody.innerHTML = rows.map(({ name, teamLabel, stats }) => {
    if (!stats) {
      return `
        <tr>
          <td class="team-cell">${escapeHtml(name)}</td>
          <td>${teamLabel}</td>
          <td colspan="10" class="score-note">No rounds played</td>
        </tr>`;
    }
    return `
      <tr>
        <td class="team-cell">${escapeHtml(name)}</td>
        <td>${teamLabel}</td>
        <td>${stats.roundsPlayed}</td>
        <td>${stats.avgScore.toFixed(1)}</td>
        <td>${stats.pars}</td>
        <td>${stats.birdies}</td>
        <td>${stats.eagles}</td>
        <td>${stats.bogeys}</td>
        <td>${stats.doubles}</td>
        <td>${stats.other}</td>
        <td>${stats.bestRound}</td>
        <td><span class="points-pill">${fmtPts(stats.points)}</span></td>
      </tr>`;
  }).join("");

  // Update sort indicators on headers
  document.querySelectorAll("#statsTable th[data-col]").forEach((th) => {
    th.classList.toggle("sort-active", th.dataset.col === statsSort.col);
    if (th.dataset.col === statsSort.col) {
      th.dataset.dir = statsSort.dir > 0 ? "asc" : "desc";
    } else {
      delete th.dataset.dir;
    }
  });
}

function statSortValue(row, col) {
  const { stats, name, teamName } = row;
  switch (col) {
    case "name":    return name.toLowerCase();
    case "team":    return teamName.toLowerCase();
    case "rounds":  return stats?.roundsPlayed ?? -1;
    case "avg":     return stats?.avgScore ?? Infinity;
    case "pars":    return stats?.pars ?? -1;
    case "birdies": return stats?.birdies ?? -1;
    case "eagles":  return stats?.eagles ?? -1;
    case "bogeys":  return stats?.bogeys ?? -1;
    case "doubles": return stats?.doubles ?? -1;
    case "other":   return stats?.other ?? -1;
    case "best":    return stats?.bestRound ?? Infinity;
    case "points":  return stats?.points ?? -1;
    default:        return 0;
  }
}

function collectPlayerStats(playerId) {
  const rounds = [];
  let points = 0;
  (state.schedule || []).forEach((week) => {
    const holePars = week.nines === "back" ? BACK_NINE_PARS : FRONT_NINE_PARS;
    const holeHandicaps = week.nines === "back" ? BACK_NINE_HOLE_HANDICAPS : FRONT_NINE_HOLE_HANDICAPS;
    week.matches.forEach((match) => {
      if (getSubAssignment(week.id, match.id, playerId)) return;
      const entry = getScoreEntry(week.id, match.id, playerId);
      if (!entry.holes.every(Number.isFinite)) return;
      rounds.push({ holes: entry.holes, holePars });

      const teamA = getTeam(match.teamAId);
      const teamB = getTeam(match.teamBId);
      if (!teamA || !teamB) return;
      for (let i = 0; i < 2; i++) {
        const pA = teamA.players[i];
        const pB = teamB.players[i];
        if (pA.id !== playerId && pB.id !== playerId) continue;
        const { pointsA, pointsB } = calculateMatchPoints(
          getScoreEntry(week.id, match.id, pA.id).holes,
          getScoreEntry(week.id, match.id, pB.id).holes,
          getEffectiveHandicap(week.id, match.id, pA.id),
          getEffectiveHandicap(week.id, match.id, pB.id),
          holeHandicaps,
        );
        const pts = pA.id === playerId ? pointsA : pointsB;
        points += pts.filter((p) => p !== null).reduce((s, p) => s + p, 0);
      }
    });
  });
  return rounds.length ? { ...aggregateStats(rounds), points } : null;
}

function collectSubStats(subId) {
  const rounds = [];
  let points = 0;
  (state.schedule || []).forEach((week) => {
    const holePars = week.nines === "back" ? BACK_NINE_PARS : FRONT_NINE_PARS;
    const holeHandicaps = week.nines === "back" ? BACK_NINE_HOLE_HANDICAPS : FRONT_NINE_HOLE_HANDICAPS;
    week.matches.forEach((match) => {
      const assignments = state.subAssignments?.[week.id]?.[match.id] || {};
      const regularPlayerId = Object.keys(assignments).find((pid) => assignments[pid] === subId);
      if (!regularPlayerId) return;
      const entry = getScoreEntry(week.id, match.id, regularPlayerId);
      if (!entry.holes.every(Number.isFinite)) return;
      rounds.push({ holes: entry.holes, holePars });

      const teamA = getTeam(match.teamAId);
      const teamB = getTeam(match.teamBId);
      if (!teamA || !teamB) return;
      for (let i = 0; i < 2; i++) {
        const pA = teamA.players[i];
        const pB = teamB.players[i];
        if (pA.id !== regularPlayerId && pB.id !== regularPlayerId) continue;
        const { pointsA, pointsB } = calculateMatchPoints(
          getScoreEntry(week.id, match.id, pA.id).holes,
          getScoreEntry(week.id, match.id, pB.id).holes,
          getEffectiveHandicap(week.id, match.id, pA.id),
          getEffectiveHandicap(week.id, match.id, pB.id),
          holeHandicaps,
        );
        const pts = pA.id === regularPlayerId ? pointsA : pointsB;
        points += pts.filter((p) => p !== null).reduce((s, p) => s + p, 0);
      }
    });
  });
  return rounds.length ? { ...aggregateStats(rounds), points } : null;
}

function aggregateStats(rounds) {
  let totalScore = 0, bestRound = null;
  let eagles = 0, birdies = 0, pars = 0, bogeys = 0, doubles = 0, other = 0;

  for (const { holes, holePars } of rounds) {
    const total = holes.reduce((s, h) => s + h, 0);
    totalScore += total;
    if (bestRound === null || total < bestRound) bestRound = total;
    holes.forEach((score, i) => {
      const diff = score - holePars[i];
      if (diff <= -2)       eagles++;
      else if (diff === -1) birdies++;
      else if (diff === 0)  pars++;
      else if (diff === 1)  bogeys++;
      else if (diff === 2)  doubles++;
      else                  other++;
    });
  }

  return {
    roundsPlayed: rounds.length,
    avgScore: totalScore / rounds.length,
    bestRound,
    eagles,
    birdies,
    pars,
    bogeys,
    doubles,
    other,
  };
}

// ---------------------------------------------------------------------------
// Schedule generation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Formatting & utilities
// ---------------------------------------------------------------------------

function renderTeamOptions(selectedId) {
  return (state.teams || []).map((team) => `
    <option value="${team.id}" ${team.id === selectedId ? "selected" : ""}>${escapeHtml(team.name)}</option>
  `).join("");
}

function formatHandicap(value) {
  if (value === null) return "--";
  return value >= 0 ? `+${value}` : `${value}`;
}

function formatDate(dateString) {
  if (!dateString) return "No date";
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
