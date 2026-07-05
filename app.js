const STORAGE_KEY = "repriser_state_v3";
const DEFAULT_REST_COUNTDOWN_MS = 2 * 60 * 1000;

const appScreen = document.getElementById("appScreen");
const resetAllBtn = document.getElementById("resetAllBtn");
let deferredInstallPrompt = null;
let restTimerIntervalId = null;
let breathPhaseTimeoutId = null;
let breathInhalePhase = true;
let breathCycleCount = 0;

const state = loadState();

function defaultState() {
  return {
    view: "main",
    draftName: "",
    draftWeight: 50,
    currentWeight: 135,
    currentReps: 10,
    nextDefaultReps: 10,
    exercises: [],
    activeExerciseIndex: 0,
    activeSetIndex: 0,
    warmupChecks: [false, false, false, false],
    sessionStartedAt: null,
    history: [],
    lastFeedback: null,
    workoutReadyForNext: false,
    pendingRemoveExerciseIndex: null,
    installHelpOpen: false,
    restTimerEndsAt: null,
    restTimerDurationMs: DEFAULT_REST_COUNTDOWN_MS,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const loaded = { ...defaultState(), ...JSON.parse(raw) };
    return {
      ...loaded,
      view: "main",
      sessionStartedAt: null,
      activeExerciseIndex: 0,
      activeSetIndex: 0,
      lastFeedback: null,
      pendingRemoveExerciseIndex: null,
      installHelpOpen: false,
    };
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clampWeight(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value * 100) / 100);
}

function formatWeight(value) {
  return String(clampWeight(value));
}

function getRestRemainingMs() {
  if (typeof state.restTimerEndsAt !== "number") return 0;
  return Math.max(0, state.restTimerEndsAt - Date.now());
}

function formatCountdown(ms) {
  const wholeSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const mins = Math.floor(wholeSeconds / 60);
  const secs = wholeSeconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function clearRestTimerInterval() {
  if (restTimerIntervalId) {
    clearInterval(restTimerIntervalId);
    restTimerIntervalId = null;
  }
}

function clearBreathPhaseTimeout() {
  if (breathPhaseTimeoutId) {
    clearTimeout(breathPhaseTimeoutId);
    breathPhaseTimeoutId = null;
  }
}

function getBreathPhaseDurationsMs() {
  const inhaleMs = 2000;
  const exhaleMs = Math.min(3800, 2000 + breathCycleCount * 120);
  return { inhaleMs, exhaleMs };
}

function scheduleBreathPhase() {
  const orb = appScreen?.querySelector(".breath-orb");
  if (!orb || state.view !== "feedback") {
    clearBreathPhaseTimeout();
    return;
  }

  const { inhaleMs, exhaleMs } = getBreathPhaseDurationsMs();
  const isInhalePhase = breathInhalePhase;
  const phaseMs = isInhalePhase ? inhaleMs : exhaleMs;
  orb.style.setProperty("--breath-phase-ms", `${Math.round(phaseMs)}ms`);

  if (isInhalePhase) {
    orb.classList.add("is-expanded");
  } else {
    orb.classList.remove("is-expanded");
    breathCycleCount += 1;
  }

  breathInhalePhase = !breathInhalePhase;
  breathPhaseTimeoutId = window.setTimeout(scheduleBreathPhase, phaseMs);
}

function startBreathingAnimation() {
  clearBreathPhaseTimeout();
  breathInhalePhase = true;
  breathCycleCount = 0;
  const orb = appScreen?.querySelector(".breath-orb");
  if (orb) {
    orb.classList.remove("is-expanded");
    orb.style.setProperty("--breath-phase-ms", "2000ms");
  }

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      scheduleBreathPhase();
    });
  });
}

function stopBreathingAnimation() {
  clearBreathPhaseTimeout();
  breathInhalePhase = true;
  breathCycleCount = 0;
}

function updateFeedbackRestTime(remainingMs) {
  const restTimeEl = appScreen?.querySelector("[data-rest-time]");
  if (!restTimeEl) return false;
  restTimeEl.textContent = formatCountdown(remainingMs);
  return true;
}

function ensureRestTimerInterval() {
  if (restTimerIntervalId) return;

  restTimerIntervalId = window.setInterval(() => {
    const remaining = getRestRemainingMs();
    if (remaining <= 0) {
      state.restTimerEndsAt = null;
      clearRestTimerInterval();
    }

    if (state.view === "feedback") {
      if (!updateFeedbackRestTime(remaining)) {
        render();
      }
    } else {
      saveState();
    }
  }, 1000);
}

function startRestCountdown() {
  state.restTimerEndsAt = Date.now() + state.restTimerDurationMs;
  ensureRestTimerInterval();
}

function calculateDynamicRest(rangeMin, rangeMax, repsAchieved) {
  let baseRest;

  if (rangeMax <= 6) {
    baseRest = 210;
  } else if (rangeMax <= 10) {
    baseRest = 180;
  } else if (rangeMax <= 15) {
    baseRest = 120;
  } else {
    baseRest = 90;
  }

  if (repsAchieved < rangeMin) {
    return {
      totalSeconds: baseRest + 60,
      baseSeconds: baseRest,
      bonusSeconds: 60,
      bonusType: "missedRange",
      rangeMin,
      rangeMax,
    };
  }

  if (repsAchieved >= rangeMax) {
    return {
      totalSeconds: baseRest + 90,
      baseSeconds: baseRest,
      bonusSeconds: 90,
      bonusType: "topRange",
      rangeMin,
      rangeMax,
    };
  }

  const extraReps = repsAchieved - rangeMin;
  return {
    totalSeconds: baseRest + extraReps * 10,
    baseSeconds: baseRest,
    bonusSeconds: extraReps * 10,
    bonusType: "inRange",
    rangeMin,
    rangeMax,
  };
}

function activeExercise() {
  return state.exercises[state.activeExerciseIndex] || null;
}

function removeExerciseAt(exerciseIndex) {
  const picked = state.exercises[exerciseIndex];
  if (!picked) return;

  state.exercises.splice(exerciseIndex, 1);
  state.history = state.history.filter((entry) => entry.exercise !== picked.name);

  if (state.activeExerciseIndex > exerciseIndex) {
    state.activeExerciseIndex -= 1;
  } else if (state.activeExerciseIndex === exerciseIndex) {
    state.activeExerciseIndex = Math.max(0, state.activeExerciseIndex - 1);
    state.activeSetIndex = 0;
    state.lastFeedback = null;
  }

  if (state.exercises.length === 0) {
    state.activeExerciseIndex = 0;
    state.activeSetIndex = 0;
    state.lastFeedback = null;
    state.sessionStartedAt = null;
  }

  state.pendingRemoveExerciseIndex = null;
  state.view = "main";
}

function renderRemoveExerciseModal() {
  if (!Number.isInteger(state.pendingRemoveExerciseIndex)) return "";

  const picked = state.exercises[state.pendingRemoveExerciseIndex];
  if (!picked) return "";

  return `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Remove exercise confirmation">
      <div class="modal-card">
        <p class="line-title" style="margin-bottom:6px;">Remove exercise</p>
        <h3 style="margin:0 0 8px;">${esc(picked.name)}</h3>
        <p class="sub" style="margin:0 0 8px;">This will clear its logged sets in this workout.</p>
        <div class="modal-actions">
          <button data-act="cancel-remove-exercise" class="btn btn-outline" type="button">Cancel</button>
          <button data-act="confirm-remove-exercise" class="btn btn-danger" type="button">Remove</button>
        </div>
      </div>
    </div>
  `;
}

function isInstalledStandalone() {
  const iosStandalone = window.navigator.standalone === true;
  const displayModeStandalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  return iosStandalone || displayModeStandalone;
}

function renderInstallHelpModal() {
  if (!state.installHelpOpen) return "";

  return `
    <div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add to Home Screen help">
      <div class="modal-card">
        <p class="line-title" style="margin-bottom:6px;">Add to Home Screen</p>
        <p class="sub" style="margin:0 0 8px;">If the install prompt is unavailable, use your browser menu and select Add to Home Screen.</p>
        <div class="modal-actions">
          <button data-act="close-install-help" class="btn btn-secondary" type="button">Got it</button>
        </div>
      </div>
    </div>
  `;
}

function launchAddToHomeScreen() {
  if (isInstalledStandalone()) {
    state.installHelpOpen = false;
    render();
    return;
  }

  if (!deferredInstallPrompt) {
    state.installHelpOpen = true;
    render();
    return;
  }

  const promptEvent = deferredInstallPrompt;
  deferredInstallPrompt = null;

  promptEvent.prompt();
  promptEvent.userChoice.finally(() => {
    state.installHelpOpen = false;
    render();
  });
}

function render() {
  if (!appScreen) return;

  if (state.view !== "feedback") {
    stopBreathingAnimation();
  }

  if (state.view === "main") renderMain();
  if (state.view === "add") renderAddExercise();
  if (state.view === "warmup") renderWarmup();
  if (state.view === "set") renderSetInput();
  if (state.view === "feedback") renderFeedback();
  if (state.view === "exerciseDone") renderExerciseDone();
  if (state.view === "complete") renderComplete();

  renderIdeaButton();

  wireEvents();
  saveState();
}

function renderIdeaButton() {
  appScreen.insertAdjacentHTML(
    "beforeend",
    `
      <button
        class="idea-fab"
        data-act="open-feedback-form"
        type="button"
        aria-label="Share feedback"
        title="Share feedback"
      >💡</button>
    `,
  );
}

function renderMain() {
  const list = state.exercises.length
    ? `<ul class="exercise-list">${state.exercises
        .map((exercise, idx) => {
          const doneSets = exercise.sets.length;
          const isActive = idx === state.activeExerciseIndex && state.sessionStartedAt;
          const canLog = doneSets < 3;
          return `<li class="exercise-item ${isActive ? "is-active" : ""}">
              <div>
                <strong>${esc(exercise.name)}</strong>
                <p class="small">${doneSets}/3 sets logged</p>
              </div>
              <div class="exercise-actions">
                <button
                  class="mini-btn"
                  data-act="log-exercise"
                  data-exercise-index="${idx}"
                  type="button"
                  ${canLog ? "" : "disabled"}
                >${canLog ? "Log set" : "Done"}</button>
                <button
                  class="remove-btn"
                  data-act="ask-remove-exercise"
                  data-exercise-index="${idx}"
                  type="button"
                  aria-label="Remove ${esc(exercise.name)}"
                >x</button>
              </div>
            </li>`;
        })
        .join("")}</ul>`
    : `<div class="card center"><p class="small">No exercises yet. Add at least one to start.</p></div>`;

  appScreen.innerHTML = `
    <div class="center">
      <div class="logo-wrap">
        <img
          class="hero-logo"
          src="isp-arrow.png"
          alt="Isolated Set Protocol logo"
          onerror="this.style.display='none'; this.parentElement.classList.add('is-fallback');"
        />
        <div class="icon-circle logo-fallback" aria-label="Isolated Set Protocol mark">🏋</div>
      </div>
      <h2 class="hero hero-white" style="font-size:2.9rem;">ISP</h2>
      <p class="badge">Isolated Set Protocol</p>
    </div>
    <div class="card">
      ${list}
      <button data-act="go-add" class="btn btn-outline" type="button">+ Add exercise</button>
      <button data-act="${state.workoutReadyForNext ? "start-next-workout" : "start-workout"}" class="btn btn-primary" type="button" ${state.exercises.length ? "" : "disabled"}>${state.workoutReadyForNext ? "Next workout" : "Start workout"}</button>
    </div>
    ${renderRemoveExerciseModal()}
  `;
}

function renderAddExercise() {
  appScreen.innerHTML = `
    <div class="top-bar">
      <button data-act="go-main" class="mini" type="button">x</button>
      <strong>ISP</strong>
      <span></span>
    </div>
    <h2 class="hero hero-white" style="font-size:2.4rem;margin-bottom:10px;">Exercise Creation</h2>
    <div class="card glow-green">
      <label class="line-title" for="draftName">Exercise name</label>
      <input id="draftName" class="text-input" value="${esc(state.draftName)}" placeholder="e.g. Barbell Back Squat" />

      <div class="input-row">
        <label class="line-title" for="draftWeight">Starting weight (lbs)</label>
        <div class="control">
          <button class="mini" data-act="draft-weight-down" type="button">-</button>
          <input id="draftWeightInput" class="metric metric-input" type="number" min="0" step="0.01" value="${formatWeight(state.draftWeight)}" />
          <button class="mini" data-act="draft-weight-up" type="button">+</button>
        </div>
      </div>
      <button data-act="save-exercise" class="btn btn-primary" type="button">Add exercise</button>
    </div>
  `;
}

function renderWarmup() {
  const exercise = activeExercise();
  if (!exercise) {
    state.view = "main";
    render();
    return;
  }

  const referenceWeight = Math.max(0, exercise.baseWeight || 0);
  const warmupWeight = (percent) => {
    const raw = Math.max(0, (referenceWeight * percent) / 100);
    if (raw === 0) return 0;
    return Math.floor(raw / 5) * 5;
  };

  const tiers = [
    { label: "Potentiation", value: `1 Rep @ ${warmupWeight(110)} lbs`, className: "tier-1" },
    { label: "", value: `3 Reps @ ${warmupWeight(75)} lbs`, className: "tier-2" },
    { label: "", value: `5 Reps @ ${warmupWeight(50)} lbs`, className: "tier-3" },
    { label: "", value: `10 Reps @ ${warmupWeight(20)} lbs`, className: "tier-4 active" },
  ];

  appScreen.innerHTML = `
    <div class="top-bar">
      <button data-act="go-main" class="mini" type="button">x</button>
      <strong>ISP</strong>
      <span></span>
    </div>
    <p class="line-title" style="color:#45df7d;">Preparation phase</p>
    <h2 class="hero hero-white" style="font-size:2.7rem;margin-bottom:8px;">Warm-up Sets</h2>
    <div class="card glow-green">
      <h3>${esc(exercise.name)}</h3>
      <p class="small warmup-subtitle">Warm-up pyramid</p>
      <p class="small" style="margin:4px 0 10px;color:#b9c4da;">No rest needed between warm-up sets.</p>
      <div class="warmup-pyramid">
        ${tiers
          .map((tier, idx) => {
            const checked = state.warmupChecks[idx];
            return `<button class="pyramid-tier ${tier.className} ${checked ? "checked" : ""}" data-act="toggle-warmup-tier" data-tier-index="${idx}" type="button">
                ${tier.label ? `<span class="tier-label">${tier.label}</span>` : ""}
                <span class="tier-value">${tier.value}</span>
                <span class="tier-check">${checked ? "✓" : "○"}</span>
              </button>`;
          })
          .join("")}
      </div>
      <button data-act="start-first-set" class="btn btn-primary" type="button">Log warm-up & start first set</button>
    </div>
  `;
}

function renderSetInput() {
  const exercise = activeExercise();
  if (!exercise) {
    state.view = "main";
    render();
    return;
  }

  const goal = getGoalFromDefaultReps(state.nextDefaultReps);

  appScreen.innerHTML = `
    <div class="top-bar">
      <button data-act="go-main" class="mini" type="button">x</button>
      <strong>ISP</strong>
      <span></span>
    </div>
    <p class="line-title" style="margin:0 0 8px;color:#d2dcf8;">Set ${state.activeSetIndex + 1} of 3</p>
    <h2 class="hero hero-white" style="font-size:2.2rem;margin-bottom:0;">${esc(exercise.name)}</h2>
    <div class="goal-banner">
      <p class="goal-label">Rep Goal</p>
      <p class="goal-value">${goal.label}</p>
    </div>
    <section class="field">
      <label>Weight (lbs)</label>
      <div class="control">
        <button class="mini" data-act="weight-down" type="button">-</button>
        <input id="currentWeightInput" class="metric metric-input" type="number" min="0" step="0.01" value="${formatWeight(state.currentWeight)}" />
        <button class="mini" data-act="weight-up" type="button">+</button>
      </div>
    </section>
    <div class="spacer"></div>
    <section class="field">
      <label>Reps</label>
      <div class="control">
        <button class="mini" data-act="reps-down" type="button">-</button>
        <div class="metric">${state.currentReps}</div>
        <button class="mini" data-act="reps-up" type="button">+</button>
      </div>
    </section>
    <button data-act="submit-set" class="btn btn-primary" type="button">Log set ${state.activeSetIndex + 1}</button>
  `;
}

function getGoalFromDefaultReps(defaultReps) {
  const minGoal = Math.max(1, Math.min(15, defaultReps));
  const maxGoal = 15;
  const label = minGoal >= maxGoal ? `${maxGoal} reps` : `${minGoal}-${maxGoal} reps`;
  return { min: minGoal, max: maxGoal, label };
}

function getNextDefaultReps(repsCompleted) {
  if (repsCompleted >= 10 && repsCompleted <= 14) {
    return repsCompleted + 1;
  }

  if (repsCompleted >= 15) {
    return 15;
  }

  return 10;
}

function prepareNextWorkoutCarryOver() {
  for (const exercise of state.exercises) {
    const lastSet = exercise.sets.length ? exercise.sets[exercise.sets.length - 1] : null;
    if (lastSet) {
      exercise.baseWeight = lastSet.weight;
      exercise.defaultReps = getNextDefaultReps(lastSet.reps);
    } else {
      exercise.defaultReps = Math.max(1, Math.min(15, exercise.defaultReps || 10));
    }
    exercise.sets = [];
  }

  state.history = [];
}

function renderFeedback() {
  const feedback = state.lastFeedback || { kind: "steady", message: "Set logged." };
  const isGold = feedback.kind === "celebrate15" || feedback.kind === "underTen";
  const restRemainingMs = getRestRemainingMs();
  const fallbackRestMs =
    typeof state.restTimerDurationMs === "number" ? state.restTimerDurationMs : DEFAULT_REST_COUNTDOWN_MS;
  const restDisplayMs = restRemainingMs > 0 ? restRemainingMs : fallbackRestMs;
  const restLabel = formatCountdown(restDisplayMs);
  const titleMap = {
    celebrate15: "15 Reps!",
    underTen: "Less Than 10",
    up: "Great Work",
    down: "Cleared 10",
    steady: "Set Logged",
  };

  const subtitleMap = {
    celebrate15: "Target achieved",
    underTen: "Rep threshold not met",
    up: "Current effort",
    down: "Above threshold check-in",
    steady: "Progression nudge",
  };

  appScreen.innerHTML = `
    <div class="center">
      <p class="badge">${subtitleMap[feedback.kind] || subtitleMap.steady}</p>
      <h2 class="hero ${isGold ? "gold" : "hero-white"}" style="font-size:4rem;">${titleMap[feedback.kind] || titleMap.steady}</h2>
      <div class="card ${isGold ? "glow-gold" : ""}">
        <p class="sub" style="margin-bottom:0;">${esc(feedback.message)}</p>
      </div>
      <div class="rest-panel" aria-live="polite" aria-label="Rest countdown">
        <div class="rest-timer-row">
          <p class="line-title" style="margin:0;">Rest timer</p>
          <p class="rest-time" data-rest-time>${restLabel}</p>
        </div>
        ${feedback.missedRangeBonusMessage ? `<p class="small" style="margin:0 0 8px;color:#f2cb05;">${esc(feedback.missedRangeBonusMessage)}</p>` : ""}
        <div class="breath-wrap" aria-hidden="true">
          <div class="breath-orb"></div>
        </div>
      </div>
      <p class="small" style="margin:4px 0 8px;color:#b9c9ee;">💧 Hydration tip: sip water during this rest.</p>
      <button data-act="continue-next-set" class="btn ${isGold ? "btn-gold" : "btn-secondary"}" type="button">Start set ${state.activeSetIndex + 1} of 3</button>
      <button data-act="use-feedback-adjustment" class="btn btn-outline" type="button">${feedback.adjustLabel || "Keep current weight"}</button>
    </div>
  `;

  startBreathingAnimation();
}

function renderExerciseDone() {
  const exercise = activeExercise();
  if (!exercise) {
    state.view = "main";
    render();
    return;
  }

  appScreen.innerHTML = `
    <div class="center">
      <div class="icon-circle" style="color:#45df7d;border-color:#2f6542;">✔</div>
      <p class="badge">Exercise complete</p>
      <h2 class="hero hero-white" style="font-size:3.2rem;">${esc(exercise.name)}</h2>
      <p class="sub">Three sets logged. Move to the next exercise in your workout.</p>
    </div>
    <div class="card">
      <p class="line-title">Set summary</p>
      <ul class="exercise-list">${exercise.sets
        .map((set, idx) => `<li class="exercise-item"><div><strong>Set ${idx + 1}</strong></div><div class="exercise-meta"><span>${formatWeight(set.weight)} lbs x ${set.reps}</span></div></li>`)
        .join("")}</ul>
      <button data-act="next-exercise" class="btn btn-primary" type="button">Start next exercise</button>
    </div>
  `;
}

function renderComplete() {
  const volumeLbs = state.exercises.reduce(
    (sum, exercise) => sum + exercise.sets.reduce((setSum, set) => setSum + set.weight * set.reps, 0),
    0,
  );
  const tons = (volumeLbs / 2000).toFixed(2);
  const duration = Math.max(1, Math.ceil((Date.now() - (state.sessionStartedAt || Date.now())) / 60000));
  const best = findMostImproved();

  appScreen.innerHTML = `
    <div class="center">
      <div class="icon-circle" style="color:#45df7d;border-color:#2f6542;">🎉</div>
      <h2 class="hero hero-white" style="font-size:4.3rem;">Workout<br/>Complete</h2>
      <p class="sub">Great session. You completed every exercise and all planned sets.</p>
    </div>
    <div class="stats">
      <div class="stat"><small class="small">Duration</small><strong>${duration}</strong><span class="small">min</span></div>
      <div class="stat"><small class="small">Volume</small><strong>${tons}</strong><span class="small">tons</span></div>
    </div>
    <div class="card">
      <small class="small">Most improved</small>
      <h3 style="margin-top:3px;">${esc(best.name)}</h3>
      <strong style="color:#45df7d;font-size:2rem;">+${best.unit === "lbs" ? formatWeight(best.amount) : best.amount} ${best.unit}</strong>
    </div>
    <div class="card">
      <p class="line-title">Recovery suggestions</p>
      <div class="suggestion-list">
        <div class="suggestion-item">💧 Hydrate well after training.</div>
        <div class="suggestion-item">🥩 Eat protein for muscle repair.</div>
        <div class="suggestion-item">🍚 Add carbs to refill glycogen.</div>
        <div class="suggestion-item">😴 Get quality sleep tonight.</div>
      </div>
    </div>
    <button data-act="open-feedback-form" class="btn btn-outline" type="button">Give feedback</button>
    <button data-act="finish-workout" class="btn btn-primary" type="button">Back to main screen</button>
    ${renderInstallHelpModal()}
  `;
}

function wireEvents() {
  appScreen.querySelectorAll("[data-act]").forEach((el) => {
    el.addEventListener("click", () => {
      const action = el.getAttribute("data-act");
      const idxRaw = el.getAttribute("data-exercise-index");
      const exerciseIndex = idxRaw === null ? null : Number(idxRaw);
      const tierRaw = el.getAttribute("data-tier-index");
      const tierIndex = tierRaw === null ? null : Number(tierRaw);
      handleAction(action, exerciseIndex, tierIndex);
    });
  });

  const nameInput = document.getElementById("draftName");
  if (nameInput) {
    nameInput.addEventListener("input", () => {
      state.draftName = nameInput.value.slice(0, 40);
      saveState();
    });
    nameInput.focus();
  }

  const draftWeightInput = document.getElementById("draftWeightInput");
  if (draftWeightInput) {
    draftWeightInput.addEventListener("input", () => {
      const next = Number(draftWeightInput.value);
      if (Number.isFinite(next)) {
        state.draftWeight = clampWeight(next);
        saveState();
      }
    });
    draftWeightInput.addEventListener("blur", () => {
      draftWeightInput.value = formatWeight(state.draftWeight);
    });
  }

  const currentWeightInput = document.getElementById("currentWeightInput");
  if (currentWeightInput) {
    currentWeightInput.addEventListener("input", () => {
      const next = Number(currentWeightInput.value);
      if (Number.isFinite(next)) {
        state.currentWeight = clampWeight(next);
        saveState();
      }
    });
    currentWeightInput.addEventListener("blur", () => {
      currentWeightInput.value = formatWeight(state.currentWeight);
    });
  }
}

function handleAction(action, exerciseIndex = null, tierIndex = null) {
  if (action === "go-main") state.view = "main";
  if (action === "go-add") state.view = "add";

  if (action === "toggle-warmup-tier" && Number.isInteger(tierIndex) && tierIndex >= 0 && tierIndex < state.warmupChecks.length) {
    state.warmupChecks[tierIndex] = !state.warmupChecks[tierIndex];
  }

  if (action === "log-exercise" && Number.isInteger(exerciseIndex)) {
    const picked = state.exercises[exerciseIndex];
    if (picked) {
      state.activeExerciseIndex = exerciseIndex;
      state.sessionStartedAt = state.sessionStartedAt || Date.now();

      if (picked.sets.length === 0) {
        state.activeSetIndex = 0;
        state.currentWeight = picked.baseWeight;
        state.nextDefaultReps = Math.max(1, Math.min(15, picked.defaultReps || 10));
        state.currentReps = state.nextDefaultReps;
        state.lastFeedback = null;
        if (exerciseIndex === 0) {
          state.warmupChecks = [false, false, false, false];
          state.view = "warmup";
        } else {
          state.view = "set";
        }
      } else {
        state.activeSetIndex = Math.min(2, picked.sets.length);
        state.currentWeight = picked.sets[picked.sets.length - 1].weight;
        state.nextDefaultReps = getNextDefaultReps(picked.sets[picked.sets.length - 1].reps);
        state.currentReps = state.nextDefaultReps;
        state.lastFeedback = null;
        state.view = "set";
      }
    }
  }

  if (action === "ask-remove-exercise" && Number.isInteger(exerciseIndex)) {
    if (state.exercises[exerciseIndex]) {
      state.pendingRemoveExerciseIndex = exerciseIndex;
      state.view = "main";
    }
  }

  if (action === "cancel-remove-exercise") {
    state.pendingRemoveExerciseIndex = null;
    state.view = "main";
  }

  if (action === "confirm-remove-exercise" && Number.isInteger(state.pendingRemoveExerciseIndex)) {
    removeExerciseAt(state.pendingRemoveExerciseIndex);
  }

  if (action === "draft-weight-up") state.draftWeight = clampWeight(state.draftWeight + 5);
  if (action === "draft-weight-down") state.draftWeight = clampWeight(state.draftWeight - 5);

  if (action === "save-exercise") {
    const draftWeightInput = document.getElementById("draftWeightInput");
    if (draftWeightInput) {
      const liveValue = Number(draftWeightInput.value);
      if (Number.isFinite(liveValue)) {
        state.draftWeight = clampWeight(liveValue);
      }
    }

    const name = state.draftName.trim();
    if (!name) {
      state.draftName = "Barbell Squat";
      render();
      return;
    }

    state.exercises.push({
      name,
      baseWeight: state.draftWeight,
      defaultReps: 10,
      sets: [],
    });
    state.draftName = "";
    state.draftWeight = 50;
    state.view = "main";
  }

  if (action === "start-workout") {
    if (!state.exercises.length) {
      state.view = "add";
      render();
      return;
    }

    state.exercises.forEach((exercise) => {
      exercise.sets = [];
    });
    state.history = [];
    state.activeExerciseIndex = 0;
    state.activeSetIndex = 0;
    state.warmupChecks = [false, false, false, false];
    state.sessionStartedAt = Date.now();
    state.currentWeight = state.exercises[0].baseWeight;
    state.nextDefaultReps = Math.max(1, Math.min(15, state.exercises[0].defaultReps || 10));
    state.currentReps = state.nextDefaultReps;
    state.lastFeedback = null;
    state.workoutReadyForNext = false;
    state.pendingRemoveExerciseIndex = null;
    state.view = "warmup";
  }

  if (action === "start-next-workout") {
    if (!state.exercises.length) {
      state.view = "add";
      render();
      return;
    }

    prepareNextWorkoutCarryOver();
    state.activeExerciseIndex = 0;
    state.activeSetIndex = 0;
    state.warmupChecks = [false, false, false, false];
    state.sessionStartedAt = Date.now();
    state.currentWeight = state.exercises[0].baseWeight;
    state.nextDefaultReps = Math.max(1, Math.min(15, state.exercises[0].defaultReps || 10));
    state.currentReps = state.nextDefaultReps;
    state.lastFeedback = null;
    state.workoutReadyForNext = false;
    state.pendingRemoveExerciseIndex = null;
    state.view = "warmup";
  }

  if (action === "start-first-set") {
    state.activeSetIndex = 0;
    state.currentReps = state.nextDefaultReps;
    state.view = "set";
  }

  if (action === "weight-up") state.currentWeight = clampWeight(state.currentWeight + 5);
  if (action === "weight-down") state.currentWeight = clampWeight(state.currentWeight - 5);
  if (action === "reps-up") state.currentReps = Math.min(25, state.currentReps + 1);
  if (action === "reps-down") state.currentReps = Math.max(1, state.currentReps - 1);

  if (action === "submit-set") {
    submitSet();
    return;
  }

  if (action === "continue-next-set") {
    state.view = "set";
  }

  if (action === "use-feedback-adjustment") {
    applyFeedbackAdjustment();
    state.view = "set";
  }

  if (action === "next-exercise") {
    state.activeExerciseIndex += 1;
    state.activeSetIndex = 0;
    const next = activeExercise();
    if (!next) {
      state.view = "complete";
    } else {
      state.currentWeight = next.baseWeight;
      state.nextDefaultReps = Math.max(1, Math.min(15, next.defaultReps || 10));
      state.currentReps = state.nextDefaultReps;
      state.lastFeedback = null;
      state.view = "set";
    }
  }

  if (action === "skip-to-complete") {
    state.view = "complete";
  }

  if (action === "finish-workout") {
    state.view = "main";
    state.sessionStartedAt = null;
    state.activeExerciseIndex = 0;
    state.activeSetIndex = 0;
    state.lastFeedback = null;
    state.workoutReadyForNext = true;
    state.installHelpOpen = false;
  }

  if (action === "close-install-help") {
    state.installHelpOpen = false;
  }

  if (action === "open-feedback-form") {
    const formUrl = "https://forms.gle/9hJMH3bbTNL8d5nu6";
    window.open(formUrl, "_blank", "noopener,noreferrer");
  }

  render();
}

function submitSet() {
  const exercise = activeExercise();
  if (!exercise) {
    state.view = "main";
    render();
    return;
  }

  const currentWeightInput = document.getElementById("currentWeightInput");
  if (currentWeightInput) {
    const liveValue = Number(currentWeightInput.value);
    if (Number.isFinite(liveValue)) {
      state.currentWeight = clampWeight(liveValue);
    }
  }

  const previousReps = exercise.sets.length ? exercise.sets[exercise.sets.length - 1].reps : null;
  const goal = getGoalFromDefaultReps(state.nextDefaultReps);
  const setEntry = {
    setNumber: state.activeSetIndex + 1,
    weight: clampWeight(state.currentWeight),
    reps: state.currentReps,
    timestamp: Date.now(),
  };

  exercise.sets.push(setEntry);
  state.history.push({
    exercise: exercise.name,
    weight: setEntry.weight,
    reps: setEntry.reps,
    loggedAt: setEntry.timestamp,
  });

  const dynamicRestSeconds = calculateDynamicRest(goal.min, goal.max, setEntry.reps);
  state.restTimerDurationMs = dynamicRestSeconds.totalSeconds * 1000;
  startRestCountdown();

  state.lastFeedback = buildFeedback(previousReps, setEntry.reps, setEntry.weight, dynamicRestSeconds);
  state.nextDefaultReps = getNextDefaultReps(setEntry.reps);
  state.currentReps = state.nextDefaultReps;

  if (state.activeSetIndex < 2) {
    state.activeSetIndex += 1;
    state.view = "feedback";
  } else if (state.activeExerciseIndex < state.exercises.length - 1) {
    state.view = "exerciseDone";
  } else {
    state.view = "complete";
  }

  render();
}

function buildFeedback(previousReps, currentReps, currentWeight, restInfo = null) {
  const missedRangeBonusMessage =
    restInfo && restInfo.bonusType === "missedRange"
      ? `Recovery bonus rest: +${restInfo.bonusSeconds}s because you were below ${restInfo.rangeMin} reps.`
      : null;

  if (currentReps === 15) {
    return {
      kind: "celebrate15",
      message: "Target achieved. Select level up to add 5 lbs and reset default reps to 10.",
      suggestedWeight: currentWeight + 5,
      adjustLabel: "Level up +5 lbs",
      missedRangeBonusMessage,
    };
  }

  if (currentReps < 10) {
    return {
      kind: "underTen",
      message: "Rep threshold not met. Drop 5 lbs to protect form quality.",
      suggestedWeight: Math.max(0, currentWeight - 5),
      adjustLabel: "Lower by 5 lbs",
      missedRangeBonusMessage,
    };
  }

  if (typeof previousReps === "number" && currentReps >= previousReps + 1) {
    return {
      kind: "up",
      message: "Great work. You added reps compared with your last set.",
      suggestedWeight: currentWeight,
      adjustLabel: "Keep current weight",
      missedRangeBonusMessage,
    };
  }

  if (typeof previousReps === "number" && currentReps <= previousReps - 1) {
    return {
      kind: "down",
      message: "Reps slipped. Consider a bit more rest before the next set.",
      suggestedWeight: currentWeight,
      adjustLabel: "Keep current weight",
      missedRangeBonusMessage,
    };
  }

  return {
    kind: "steady",
    message: "Rest as long as you need or have time for.",
    suggestedWeight: currentWeight,
    adjustLabel: "Keep current weight",
    missedRangeBonusMessage,
  };
}

function applyFeedbackAdjustment() {
  if (!state.lastFeedback || typeof state.lastFeedback.suggestedWeight !== "number") {
    return;
  }
  state.currentWeight = clampWeight(state.lastFeedback.suggestedWeight);

  if (state.lastFeedback.kind === "celebrate15") {
    state.nextDefaultReps = 10;
    state.currentReps = state.nextDefaultReps;
  }
}

function findMostImproved() {
  if (state.exercises.length === 0) {
    return { name: "N/A", amount: 0, unit: "reps" };
  }

  let winner = state.exercises[0].name;
  let bestAmount = 0;
  let bestUnit = "reps";

  for (const exercise of state.exercises) {
    if (exercise.sets.length < 2) continue;
    const firstSet = exercise.sets[0];
    const lastSet = exercise.sets[exercise.sets.length - 1];
    const repGain = Math.max(0, lastSet.reps - firstSet.reps);
    const weightGain = Math.max(0, lastSet.weight - firstSet.weight);
    let candidateUnit = "reps";
    let candidateAmount = 0;

    if (repGain >= 1 && repGain <= 5) {
      candidateUnit = "reps";
      candidateAmount = repGain;
    } else if (weightGain >= 5) {
      candidateUnit = "lbs";
      candidateAmount = weightGain;
    } else if (repGain > 5) {
      candidateUnit = "reps";
      candidateAmount = repGain;
    } else if (weightGain > 0) {
      candidateUnit = "lbs";
      candidateAmount = weightGain;
    }

    if (candidateAmount > bestAmount) {
      bestAmount = candidateAmount;
      bestUnit = candidateUnit;
      winner = exercise.name;
    }
  }

  return { name: winner, amount: bestAmount, unit: bestUnit };
}

if (resetAllBtn) {
  resetAllBtn.addEventListener("click", () => {
    clearRestTimerInterval();
    Object.assign(state, defaultState());
    render();
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  render();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  state.installHelpOpen = false;
  render();
});

render();
