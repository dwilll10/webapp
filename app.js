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

// Capacitor haptics — graceful no-op on web
const { Haptics, ImpactStyle } = window.Capacitor?.Plugins || {};
function triggerHaptic() {
  try { if (Haptics) Haptics.impact({ style: ImpactStyle?.Light || 'LIGHT' }); }
  catch (e) {}
}

function getDocRef(year) {
  return db.collection("league").doc(String(year));
}

// ---------------------------------------------------------------------------

// Default course data — Pine Grove
const DEFAULT_FRONT_PARS      = [5, 5, 3, 4, 3, 4, 3, 4, 5];
const DEFAULT_BACK_PARS       = [5, 4, 3, 5, 3, 4, 3, 4, 4];
const DEFAULT_FRONT_HANDICAPS = [13, 3, 9, 15, 17, 4, 12, 11, 1];
const DEFAULT_BACK_HANDICAPS  = [6, 7, 10, 2, 16, 8, 5, 18, 14];

function normalizeCourseData(raw) {
  return {
    name: raw?.name || "Pine Grove",
    pars: Array.isArray(raw?.pars) && raw.pars.length === 18 ? raw.pars : [...DEFAULT_FRONT_PARS, ...DEFAULT_BACK_PARS],
    handicaps: Array.isArray(raw?.handicaps) && raw.handicaps.length === 18 ? raw.handicaps : [...DEFAULT_FRONT_HANDICAPS, ...DEFAULT_BACK_HANDICAPS],
  };
}

function getNinePars(nines) {
  return nines === "back" ? state.courseData.pars.slice(9) : state.courseData.pars.slice(0, 9);
}

function getNineHandicaps(nines) {
  return nines === "back" ? state.courseData.handicaps.slice(9) : state.courseData.handicaps.slice(0, 9);
}

let state = {};
let subPlayers = [];
let selectedYear = new Date().getFullYear();
let availableYears = [];
let stateUnsubscribe = null;
let adminSelectedWeekId = null;
let adminSelectedTeamId = null;
let statsSort = { col: null, dir: 1 }; // dir: 1 = asc, -1 = desc

const yearSelect = document.querySelector("#yearSelect");
const heroEyebrow = document.querySelector("#heroEyebrow");
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
const generateScheduleBtn = document.querySelector("#generateScheduleBtn");
const scheduleStartDateInput = document.querySelector("#scheduleStartDate");
const scheduleNumWeeksInput = document.querySelector("#scheduleNumWeeks");
const subAdminContainer = document.querySelector("#subAdminContainer");
const courseAdminContainer = document.querySelector("#courseAdminContainer");
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
  bindStatsStickyColumn();
  subscribeToAuthState();
  subscribeToSubs();
  loadAvailableYears();
});

// ---------------------------------------------------------------------------
// Firestore state sync
// ---------------------------------------------------------------------------

function subscribeToState() {
  if (stateUnsubscribe) stateUnsubscribe();
  stateUnsubscribe = getDocRef(selectedYear).onSnapshot(async (snap) => {
    if (snap.exists) {
      state = normalizeState(snap.data());
    } else if (selectedYear === 2026) {
      // One-time migration from legacy 'league/state' doc
      const legacy = await db.collection("league").doc("state").get();
      if (legacy.exists) {
        state = normalizeState(legacy.data());
        if (auth.currentUser) getDocRef(2026).set(state).catch(console.error);
        renderWeekOptions();
        renderAll();
        return;
      } else {
        state = emptyYearState();
      }
    } else {
      state = emptyYearState();
    }
    renderWeekOptions();
    renderAll();
  }, (err) => {
    console.error("Firestore listener error:", err);
  });
}

function emptyYearState() {
  return { teams: [], schedule: [], scores: {}, subAssignments: {}, selectedWeekId: "", courseData: normalizeCourseData({}) };
}


function subscribeToSubs() {
  db.collection("league").doc("subs").onSnapshot(async (snap) => {
    if (snap.exists) {
      subPlayers = snap.data().subPlayers || [];
    } else {
      // One-time migration: pull subs from legacy 'league/state' doc
      const legacy = await db.collection("league").doc("state").get();
      const legacySubs = legacy.exists ? (legacy.data().subPlayers || []) : [];
      subPlayers = legacySubs;
      if (auth.currentUser && legacySubs.length) {
        db.collection("league").doc("subs").set({ subPlayers }).catch(console.error);
      }
    }
    renderAll();
  });
}

function saveSubState() {
  db.collection("league").doc("subs").set({ subPlayers }).catch((err) => console.error("Sub save failed:", err));
}

function saveState() {
  getDocRef(selectedYear).set(state).catch((err) => console.error("Save failed:", err));
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
    renderYearSelector();
    renderAll();
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

function bindStatsStickyColumn() {
  const wrap = document.querySelector("#stats .table-wrap");
  if (!wrap) return;
  wrap.addEventListener("scroll", () => {
    const x = wrap.scrollLeft;
    document.querySelectorAll("#statsTable th:first-child, #statsTable td:first-child").forEach((cell) => {
      cell.style.transform = `translateX(${x}px)`;
    });
  }, { passive: true });
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
    : createStandardSchedule(teams, generateScheduleDates(lastMondayOfApril(selectedYear), 19));

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
      date: week.date || "",
      nines: week.nines === "back" || week.nines === "front" ? week.nines : (weekIndex % 2 === 0 ? "front" : "back"),
      matches: Array.isArray(week.matches)
        ? week.matches.map((match, matchIndex) => ({
          id: match.id || `match-${weekIndex + 1}-${matchIndex + 1}`,
          teamAId: match.teamAId || "",
          teamBId: match.teamBId || "",
        }))
        : [],
    })),
    scores: rawState.scores || {},
    subAssignments: rawState.subAssignments || {},
    selectedWeekId,
    courseData: normalizeCourseData(rawState.courseData),
  };
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

function bindNavigation() {
  window.addEventListener("hashchange", renderPageFromHash);
  renderPageFromHash();
}

function getDefaultScoresWeekId() {
  const schedule = state.schedule || [];
  if (!schedule.length) return "";
  const today = new Date().toISOString().split("T")[0];
  const completed = schedule.filter((w) => w.date && w.date <= today);
  if (!completed.length) return schedule[0].id;
  return completed[completed.length - 1].id;
}

function renderPageFromHash() {
  const requested = window.location.hash.replace("#", "") || "home";
  const pages = [...document.querySelectorAll("[data-page]")];
  const activePage = pages.find((page) => page.dataset.page === requested) ? requested : "home";

  pages.forEach((page) => {
    page.classList.toggle("is-active", page.dataset.page === activePage);
  });

  if (activePage === "scores") {
    state.selectedWeekId = getDefaultScoresWeekId();
    renderWeekOptions();
    renderScores();
  }
}

// ---------------------------------------------------------------------------
// Global action bindings
// ---------------------------------------------------------------------------

function bindGlobalActions() {
  scoreWeekSelect.addEventListener("change", (event) => {
    state.selectedWeekId = event.target.value;
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
    subPlayers = [...subPlayers, {
      id: crypto.randomUUID(),
      name: "New Sub",
      startingHandicap: null,
    }];
    saveSubState();
    renderSubAdmin();
    renderScores();
  });

  generateScheduleBtn.addEventListener("click", () => {
    const startDate = scheduleStartDateInput.value;
    const numWeeks = parseInt(scheduleNumWeeksInput.value, 10);
    if (!startDate || !numWeeks || numWeeks < 1) return;
    const dates = generateScheduleDates(startDate, numWeeks);
    state.schedule = createStandardSchedule(state.teams, dates);
    state.selectedWeekId = state.schedule.find((week) => week.matches.length)?.id || state.schedule[0]?.id || "";
    adminSelectedWeekId = state.schedule[0]?.id || null;
    saveState();
    renderWeekOptions();
    renderAll();
  });
}

// ---------------------------------------------------------------------------
// Year management
// ---------------------------------------------------------------------------

async function loadAvailableYears() {
  const snapshot = await db.collection("league").get();
  availableYears = snapshot.docs
    .map((doc) => parseInt(doc.id, 10))
    .filter((y) => Number.isFinite(y));

  // Legacy 'league/state' doc counts as the current year's data
  const currentCal = new Date().getFullYear();
  if (!availableYears.includes(currentCal) && snapshot.docs.some((d) => d.id === "state")) {
    availableYears = [...availableYears, currentCal];
  }

  renderYearSelector();
  subscribeToState();
}

function renderYearSelector() {
  const currentCal = new Date().getFullYear();
  const isAdmin = !!auth.currentUser;
  const maxYear = isAdmin ? currentCal + 1 : currentCal;

  const years = [...new Set([
    ...availableYears.filter((y) => y <= maxYear),
    currentCal,
    ...(isAdmin ? [currentCal + 1] : []),
  ])].sort((a, b) => b - a);

  // Clamp selectedYear to current year if it's not in the visible list
  if (!years.includes(selectedYear)) {
    selectedYear = currentCal;
  }

  yearSelect.innerHTML = years.map((y) =>
    `<option value="${y}">${y} Season</option>`
  ).join("");

  yearSelect.value = String(selectedYear);
}

yearSelect.addEventListener("change", (event) => {
  selectedYear = parseInt(event.target.value, 10);
  adminSelectedWeekId = null;
  adminSelectedTeamId = null;
  if (scheduleStartDateInput) scheduleStartDateInput.value = "";
  subscribeToState();
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function renderAll() {
  heroEyebrow.textContent = `Monday Night Golf League — ${state.courseData?.name || "Pine Grove"}`;
  renderStandings();
  renderHandicaps();
  renderScores();
  renderSchedule();
  renderNextMatchups();
  renderStats();
  if (auth.currentUser && state.teams.length === 0) {
    renderInitYearPanel();
  } else {
    renderTeamAdmin();
    renderScheduleAdmin();
    renderSubAdmin();
  }
  renderCourseAdmin();
}

function renderInitYearPanel() {
  const priorYear = [...availableYears].filter((y) => y < selectedYear).sort((a, b) => b - a)[0] || null;

  teamAdminContainer.innerHTML = `
    <section class="init-year-panel">
      <h3>Initialize ${selectedYear} Season</h3>
      <p class="admin-note">No data exists for ${selectedYear} yet. Choose how to set it up.</p>
      <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center">
        ${priorYear ? `<button class="btn btn-primary" id="initFromPriorBtn">Copy teams from ${priorYear}</button>` : ""}
        <button class="btn btn-secondary" id="initFreshBtn">Start from scratch</button>
      </div>
    </section>
  `;
  scheduleAdminContainer.innerHTML = "";
  subAdminContainer.innerHTML = "";

  if (priorYear) {
    document.getElementById("initFromPriorBtn")?.addEventListener("click", async () => {
      let priorSnap = await getDocRef(priorYear).get();
      if (!priorSnap.exists) {
        priorSnap = await db.collection("league").doc("state").get();
      }
      const priorData = priorSnap.exists ? priorSnap.data() : {};
      const priorTeams = priorData.teams || [];
      const newTeams = priorTeams.map((team) => ({
        id: crypto.randomUUID(),
        name: team.name || "New Team",
        points: 0,
        players: (team.players || []).slice(0, 2).map((p) => ({
          id: crypto.randomUUID(),
          name: p.name || "Player",
          startingHandicap: calculateHandicapFromData(p.id, priorData),
        })),
      }));
      const newSubs = (priorData.subPlayers || []).map((s) => ({
        id: crypto.randomUUID(),
        name: s.name || "Sub Player",
        startingHandicap: calculateSubHandicapFromData(s.id, priorData),
      }));
      state.teams = newTeams;
      state.schedule = createStandardSchedule(newTeams, generateScheduleDates(lastMondayOfApril(selectedYear), 19));
      state.scores = {};
      state.courseData = normalizeCourseData(priorData.courseData);
      subPlayers = newSubs;
      saveSubState();
      state.subAssignments = {};
      state.selectedWeekId = state.schedule[0]?.id || "";
      saveState();
      availableYears = [...new Set([...availableYears, selectedYear])];
      renderYearSelector();
      renderWeekOptions();
      renderAll();
    });
  }

  document.getElementById("initFreshBtn")?.addEventListener("click", () => {
    const newTeams = createDefaultTeams();
    state.teams = newTeams;
    state.schedule = createStandardSchedule(newTeams, generateScheduleDates(lastMondayOfApril(selectedYear), 19));
    state.scores = {};
    state.subAssignments = {};
    state.selectedWeekId = state.schedule[0]?.id || "";
    saveState();
    availableYears = [...new Set([...availableYears, selectedYear])];
    renderYearSelector();
    renderWeekOptions();
    renderAll();
  });
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

  const pts = net[0] < net[1] ? { teamA: 2, teamB: 0 }
            : net[1] < net[0] ? { teamA: 0, teamB: 2 }
            : { teamA: 1, teamB: 1 };
  return { ...pts, netA: net[0], netB: net[1] };
}

function computeTeamPoints(teamId) {
  let total = 0;
  for (const week of state.schedule || []) {
    const holeHandicaps = getNineHandicaps(week.nines);
    for (const match of week.matches) {
      const isA = match.teamAId === teamId;
      const isB = match.teamBId === teamId;
      if (!isA && !isB) continue;

      const teamA = getTeam(match.teamAId);
      const teamB = getTeam(match.teamBId);
      if (!teamA || !teamB) continue;

      const sortedA = getSortedPlayers(week.id, match.id, teamA);
      const sortedB = getSortedPlayers(week.id, match.id, teamB);

      // Individual hole points
      for (let i = 0; i < 2; i++) {
        const { pointsA, pointsB } = calculateMatchPoints(
          getScoreEntry(week.id, match.id, sortedA[i].id).holes,
          getScoreEntry(week.id, match.id, sortedB[i].id).holes,
          getEffectiveHandicap(week.id, match.id, sortedA[i].id),
          getEffectiveHandicap(week.id, match.id, sortedB[i].id),
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
      .slice(-3)
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

  const subRows = subPlayers.map((sub) => {
    const handicap = calculateSubHandicap(sub.id);
    const rounds = getSubRounds(sub.id);
    const scoreList = rounds.slice(-3).map((r) => `${r.weekLabel}: ${r.total}`).join(" | ") || "No scores yet";
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

  const holeHandicaps = getNineHandicaps(week.nines);

  // Sort each team by handicap so lowest-hcp player is always "player A"
  const sortedA = getSortedPlayers(week.id, match.id, teamA);
  const sortedB = getSortedPlayers(week.id, match.id, teamB);

  // Pair lowest-hcp vs lowest-hcp, higher vs higher
  const pairs = [0, 1].map((i) => {
    const pA = sortedA[i];
    const pB = sortedB[i];
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

  const summaryRow = (teamName, indiv, teamNet, total, netScore) => `
    <div class="match-summary-row">
      <span class="match-summary-team">${escapeHtml(teamName)}</span>
      <span class="match-summary-detail">
        ${fmtPts(indiv)} individual
        + ${teamNet !== null ? `${teamNet} team <span class="net-score">(net ${netScore})</span>` : "—"}
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
        ${renderPlayerScoreCard(week.id, match.id, teamA.name, sortedA[0], week.nines, pairs[0].pointsA, pairs[0].strokeHolesA)}
        ${renderPlayerScoreCard(week.id, match.id, teamA.name, sortedA[1], week.nines, pairs[1].pointsA, pairs[1].strokeHolesA)}
        ${renderPlayerScoreCard(week.id, match.id, teamB.name, sortedB[0], week.nines, pairs[0].pointsB, pairs[0].strokeHolesB)}
        ${renderPlayerScoreCard(week.id, match.id, teamB.name, sortedB[1], week.nines, pairs[1].pointsB, pairs[1].strokeHolesB)}
      </div>
      <div class="match-summary">
        ${summaryRow(teamA.name, indivA, teamPts ? teamPts.teamA : null, indivA + (teamPts?.teamA ?? 0), teamPts?.netA)}
        ${summaryRow(teamB.name, indivB, teamPts ? teamPts.teamB : null, indivB + (teamPts?.teamB ?? 0), teamPts?.netB)}
      </div>
    </article>
  `;
}

function renderPlayerScoreCard(weekId, matchId, teamName, player, nines, points, strokeHoles) {
  const scoreEntry = getScoreEntry(weekId, matchId, player.id);
  const total = calculateRoundTotal(scoreEntry.holes);
  const isAdmin = !!auth.currentUser;
  const pars = getNinePars(nines);
  const holeHandicaps = getNineHandicaps(nines);

  const totalPoints = points ? points.filter((p) => p !== null).reduce((s, p) => s + p, 0) : null;
  const hasPoints = points && points.some((p) => p !== null);
  const subId = getSubAssignment(weekId, matchId, player.id);
  const sub = subId ? getSubPlayer(subId) : null;
  const handicap = getEffectiveHandicap(weekId, matchId, player.id);
  const displayName = sub ? sub.name : player.name;
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
              <span class="hole-label-row">${index + 1}${hasStroke ? `<span class="stroke-dot">1</span>` : ""}</span>
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
      triggerHaptic();
      renderHandicaps();
      renderScores();
      renderNextMatchups();
    });
  });
}

function renderSchedule() {
  const scheduleMeta = document.querySelector("#scheduleMeta");
  if (scheduleMeta) {
    const first = state.schedule[0]?.date;
    const last = state.schedule[state.schedule.length - 1]?.date;
    scheduleMeta.textContent = first && last && state.schedule.length
      ? `${state.schedule.length} weeks · ${formatDate(first)} – ${formatDate(last)}`
      : "";
  }

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
  // Set default Week 1 date for this year if not already set
  if (scheduleStartDateInput && !scheduleStartDateInput.value) {
    scheduleStartDateInput.value = lastMondayOfApril(selectedYear);
  }

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
      saveSubState();
      renderAll();
    });
  });

  subAdminContainer.querySelectorAll("[data-sub-player-hcp]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const sub = getSubPlayer(event.target.dataset.subPlayerHcp);
      if (!sub) return;
      sub.startingHandicap = event.target.value === "" ? null : Number(event.target.value);
      saveSubState();
      renderHandicaps();
      renderScores();
    });
  });

  subAdminContainer.querySelectorAll("[data-remove-sub-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      const subId = event.target.dataset.removeSubId;
      subPlayers = subPlayers.filter((s) => s.id !== subId);
      saveSubState();
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

function renderCourseAdmin() {
  if (!courseAdminContainer) return;

  const holeRow = (holeNum) => {
    const i = holeNum - 1;
    return `
      <div class="course-hole-row">
        <span class="course-hole-num">${holeNum}</span>
        <input type="number" min="3" max="6" value="${state.courseData.pars[i]}" data-course-par="${i}" aria-label="Hole ${holeNum} par">
        <input type="number" min="1" max="18" value="${state.courseData.handicaps[i]}" data-course-si="${i}" aria-label="Hole ${holeNum} stroke index">
      </div>
    `;
  };

  courseAdminContainer.innerHTML = `
    <label class="compact-field" style="max-width:320px">
      <span>Course Name</span>
      <input type="text" id="courseNameInput" value="${escapeHtml(state.courseData.name)}">
    </label>
    <div class="course-hole-grid">
      <div class="course-nine-section">
        <p class="section-kicker" style="margin-bottom:6px">Front Nine (Holes 1–9)</p>
        <div class="course-hole-header">
          <span>Hole</span><span>Par</span><span>Handicap</span>
        </div>
        ${Array.from({ length: 9 }, (_, i) => holeRow(i + 1)).join("")}
      </div>
      <div class="course-nine-section">
        <p class="section-kicker" style="margin-bottom:6px">Back Nine (Holes 10–18)</p>
        <div class="course-hole-header">
          <span>Hole</span><span>Par</span><span>Handicap</span>
        </div>
        ${Array.from({ length: 9 }, (_, i) => holeRow(i + 10)).join("")}
      </div>
    </div>
  `;

  courseAdminContainer.querySelector("#courseNameInput").addEventListener("change", (e) => {
    state.courseData.name = e.target.value.trim() || "Pine Grove";
    saveState();
  });

  courseAdminContainer.querySelectorAll("[data-course-par]").forEach((input) => {
    input.addEventListener("change", (e) => {
      const i = parseInt(e.target.dataset.coursePar, 10);
      state.courseData.pars[i] = parseInt(e.target.value, 10) || state.courseData.pars[i];
      saveState();
    });
  });

  courseAdminContainer.querySelectorAll("[data-course-si]").forEach((input) => {
    input.addEventListener("change", (e) => {
      const i = parseInt(e.target.dataset.courseSi, 10);
      state.courseData.handicaps[i] = parseInt(e.target.value, 10) || state.courseData.handicaps[i];
      saveState();
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

// Calculates a player's handicap from a raw prior-year data object (no module state used)
function calculateHandicapFromData(playerId, data) {
  const player = (data.teams || []).flatMap((t) => t.players).find((p) => p.id === playerId);
  const startingHandicap = player?.startingHandicap ?? null;
  const cd = normalizeCourseData(data.courseData);

  const rounds = [];
  (data.schedule || []).forEach((week) => {
    const ninePars = week.nines === "back" ? cd.pars.slice(9) : cd.pars.slice(0, 9);
    const par = ninePars.reduce((s, p) => s + p, 0);
    (week.matches || []).forEach((match) => {
      const holes = ((data.scores || {})[week.id]?.[match.id]?.[playerId]?.holes || [])
        .slice(0, 9)
        .map((v) => (Number.isFinite(v) ? v : null));
      if (holes.length === 9 && holes.every((h) => h !== null)) {
        rounds.push({ total: holes.reduce((s, h) => s + h, 0), par });
      }
    });
  });

  const overParValues = [
    ...(startingHandicap !== null ? [startingHandicap, startingHandicap] : []),
    ...rounds.map((r) => r.total - r.par),
  ].slice(-3);

  if (!overParValues.length) return null;
  return Math.round(overParValues.reduce((sum, v) => sum + v, 0) / overParValues.length);
}

function calculateSubHandicapFromData(subId, data) {
  const sub = (data.subPlayers || []).find((s) => s.id === subId);
  const startingHandicap = sub?.startingHandicap ?? null;
  const cd = normalizeCourseData(data.courseData);

  const rounds = [];
  (data.schedule || []).forEach((week) => {
    const ninePars = week.nines === "back" ? cd.pars.slice(9) : cd.pars.slice(0, 9);
    const par = ninePars.reduce((s, p) => s + p, 0);
    (week.matches || []).forEach((match) => {
      const assignments = (data.subAssignments || {})[week.id]?.[match.id] || {};
      const regularPlayerId = Object.keys(assignments).find((pid) => assignments[pid] === subId);
      if (!regularPlayerId) return;
      const holes = ((data.scores || {})[week.id]?.[match.id]?.[regularPlayerId]?.holes || [])
        .slice(0, 9)
        .map((v) => (Number.isFinite(v) ? v : null));
      if (holes.length === 9 && holes.every((h) => h !== null)) {
        rounds.push({ total: holes.reduce((s, h) => s + h, 0), par });
      }
    });
  });

  const overParValues = [
    ...(startingHandicap !== null ? [startingHandicap, startingHandicap] : []),
    ...rounds.map((r) => r.total - r.par),
  ].slice(-3);

  if (!overParValues.length) return null;
  return Math.round(overParValues.reduce((sum, v) => sum + v, 0) / overParValues.length);
}

function calculateHandicap(playerId, beforeWeekId = null) {
  const player = (state.teams || []).flatMap((t) => t.players).find((p) => p.id === playerId);
  const startingHandicap = player?.startingHandicap ?? null;

  const allRounds = getPlayerRounds(playerId);
  const actualRounds = beforeWeekId
    ? (() => {
        const week = (state.schedule || []).find((w) => w.id === beforeWeekId);
        return week ? allRounds.filter((r) => r.weekDate < week.date) : allRounds;
      })()
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
    const pars = getNinePars(week.nines);
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
  return subPlayers.find((s) => s.id === subId) || null;
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
    const pars = getNinePars(week.nines);
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
    ? (() => {
        const week = (state.schedule || []).find((w) => w.id === beforeWeekId);
        return week ? allRounds.filter((r) => r.weekDate < week.date) : allRounds;
      })()
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

// Returns team's players sorted ascending by effective handicap (lowest hcp = "player A")
function getSortedPlayers(weekId, matchId, team) {
  return [...team.players].sort((a, b) => {
    const hA = getEffectiveHandicap(weekId, matchId, a.id) ?? 0;
    const hB = getEffectiveHandicap(weekId, matchId, b.id) ?? 0;
    return hA - hB;
  });
}

function renderStats() {
  const rows = [];

  for (const team of (state.teams || [])) {
    for (const player of team.players) {
      rows.push({ name: player.name, teamName: team.name, teamLabel: escapeHtml(team.name), stats: collectPlayerStats(player.id) });
    }
  }
  for (const sub of subPlayers) {
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
    const holePars = getNinePars(week.nines);
    const holeHandicaps = getNineHandicaps(week.nines);
    week.matches.forEach((match) => {
      if (getSubAssignment(week.id, match.id, playerId)) return;
      const entry = getScoreEntry(week.id, match.id, playerId);
      if (!entry.holes.every(Number.isFinite)) return;
      rounds.push({ holes: entry.holes, holePars });

      const teamA = getTeam(match.teamAId);
      const teamB = getTeam(match.teamBId);
      if (!teamA || !teamB) return;
      const sortedA = getSortedPlayers(week.id, match.id, teamA);
      const sortedB = getSortedPlayers(week.id, match.id, teamB);
      for (let i = 0; i < 2; i++) {
        const pA = sortedA[i];
        const pB = sortedB[i];
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
    const holePars = getNinePars(week.nines);
    const holeHandicaps = getNineHandicaps(week.nines);
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
      const sortedA = getSortedPlayers(week.id, match.id, teamA);
      const sortedB = getSortedPlayers(week.id, match.id, teamB);
      for (let i = 0; i < 2; i++) {
        const pA = sortedA[i];
        const pB = sortedB[i];
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
    nines: index % 2 === 0 ? "front" : "back",
    matches: (rounds[index % rounds.length] || []).map((pairing, pairingIndex) => ({
      id: `match-${index + 1}-${pairingIndex + 1}`,
      teamAId: pairing[0],
      teamBId: pairing[1],
    })),
  }));
}

function lastMondayOfApril(year) {
  const d = new Date(year, 3, 30); // April 30
  while (d.getDay() !== 1) d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function generateScheduleDates(startDate, numWeeks) {
  const dates = [];
  const start = new Date(`${startDate}T00:00:00`);
  for (let i = 0; i < numWeeks; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i * 7);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
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
