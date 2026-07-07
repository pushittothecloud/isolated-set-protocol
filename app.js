const STORAGE_KEY = "repriser_state_v4";
const DEFAULT_REST_COUNTDOWN_MS = 2 * 60 * 1000;
const DEFAULT_FATIGUE_TIER_KEY = "solid";
const FATIGUE_TIERS = [
  {
    key: "smoked",
    label: "Dead",
    alt: "Smoked",
    description: "Near failure. Full reset needed.",
    restRangeLabel: "3:00-3:30",
    minRestSeconds: 180,
    maxRestSeconds: 210,
    defaultRestSeconds: 195,
    breathProfile: {
      startInhaleSec: 2.0,
      startExhaleSec: 2.0,
      endInhaleSec: 5.0,
      endExhaleSec: 5.0,
    },
  },
  {
    key: "winded",
    label: "Winded",
    alt: "Pushing It",
    description: "Hard effort. Breathing still elevated.",
    restRangeLabel: "2:00-2:30",
    minRestSeconds: 120,
    maxRestSeconds: 150,
    defaultRestSeconds: 135,
    breathProfile: {
      startInhaleSec: 2.5,
      startExhaleSec: 2.5,
      endInhaleSec: 5.0,
      endExhaleSec: 5.0,
    },
  },
  {
    key: "solid",
    label: "Solid",
    alt: "Locked In",
    description: "Standard exertion. Stay smooth.",
    restRangeLabel: "1:30-2:00",
    minRestSeconds: 90,
    maxRestSeconds: 120,
    defaultRestSeconds: 105,
    breathProfile: {
      startInhaleSec: 3.0,
      startExhaleSec: 3.0,
      endInhaleSec: 5.0,
      endExhaleSec: 5.0,
    },
  },
  {
    key: "fresh",
    label: "Easy",
    alt: "Fresh",
    description: "Plenty left in the tank.",
    restRangeLabel: "1:00-1:15",
    minRestSeconds: 60,
    maxRestSeconds: 75,
    defaultRestSeconds: 60,
    breathProfile: {
      startInhaleSec: 4.5,
      startExhaleSec: 4.5,
      endInhaleSec: 5.0,
      endExhaleSec: 5.0,
    },
  },
];
const REP_RANGE_OPTIONS = [
  { value: "1-5", min: 1, max: 5 },
  { value: "5-10", min: 5, max: 10 },
  { value: "10-15", min: 10, max: 15 },
  { value: "15-20", min: 15, max: 20 },
  { value: "20-25", min: 20, max: 25 },
  { value: "25-30", min: 25, max: 30 },
];
const EXERCISE_LIBRARY = [
  {
    muscleGroup: "Delt",
    exercises: ["Shoulder Press"],
  },
  {
    muscleGroup: "Pecs",
    exercises: ["Fly machine", "DB Bench", "Incline bench", "Bench"],
  },
  {
    muscleGroup: "Bicep",
    exercises: ["EZ bar reverse curl", "Preacher curl", "DB hammer curl"],
  },
  {
    muscleGroup: "Quad",
    exercises: ["Leg extension machine"],
  },
  {
    muscleGroup: "Glute",
    exercises: ["Abduction", "Hip thrust", "Squat"],
  },
  {
    muscleGroup: "Lats",
    exercises: ["Pullup", "Pulldown", "Row"],
  },
  {
    muscleGroup: "Tricep",
    exercises: ["Tri pulldown", "Kickback", "Skullcrusher"],
  },
  {
    muscleGroup: "Abs",
    exercises: ["Crunch machine"],
  },
  {
    muscleGroup: "Lower back",
    exercises: ["Back extension machine"],
  },
  {
    muscleGroup: "Hamstrings",
    exercises: ["Ham curl machine"],
  },
];
const DEFAULT_REP_RANGE = "10-15";
const DEFAULT_SET_COUNT = 3;
const MIN_SET_COUNT = 1;
const MAX_SET_COUNT = 8;

const appScreen = document.getElementById("appScreen");
const resetAllBtn = document.getElementById("resetAllBtn");
let deferredInstallPrompt = null;
let restTimerIntervalId = null;
let breathPhaseTimeoutId = null;
let breathInhalePhase = true;
let breathCycleCount = 0;
let breathAudioContext = null;
let breathMasterGain = null;
let breathAudioEnabled = true;
let breathLastFrequency = 180;
let breathAudioUnlockBound = false;
let wakeLockSentinel = null;

const state = loadState();

function defaultState() {
  return {
    view: "main",
    routines: [],
    activeRoutineId: null,
    inProgressSession: null,
    draftName: "",
    draftWeight: 50,
    draftRepRange: DEFAULT_REP_RANGE,
    draftSetCount: DEFAULT_SET_COUNT,
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
    breathAudioMuted: false,
    selectedFatigueTierKey: null,
    restTimerEndsAt: null,
    restTimerDurationMs: DEFAULT_REST_COUNTDOWN_MS,
    restTimerCompletedAt: null,
  };
}

function createRoutineId() {
  return `routine_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

function normalizeExerciseShape(exercise, keepSets = false) {
  const repRange = getValidRepRange(exercise?.repRange);
  const plannedSetCount = getValidSetCount(exercise?.plannedSetCount ?? exercise?.setCount);
  const sets = keepSets && Array.isArray(exercise?.sets)
    ? exercise.sets.map((setEntry, setIdx) => ({
        setNumber: Number.isInteger(setEntry?.setNumber) ? setEntry.setNumber : setIdx + 1,
        weight: clampWeight(Number(setEntry?.weight) || 0),
        reps: Math.max(1, Number(setEntry?.reps) || 1),
        timestamp: Number(setEntry?.timestamp) || Date.now(),
      }))
    : [];

  return {
    name: String(exercise?.name || "Exercise").slice(0, 40),
    baseWeight: clampWeight(Number(exercise?.baseWeight ?? exercise?.weight ?? 0) || 0),
    repRange,
    defaultReps: repRangeToGoal(repRange).min,
    plannedSetCount,
    sets,
  };
}

function normalizeRoutineShape(routine) {
  const exercises = Array.isArray(routine?.exercises)
    ? routine.exercises.map((exercise) => normalizeExerciseShape(exercise, false))
    : [];

  return {
    id: String(routine?.id || createRoutineId()),
    name: String(routine?.name || "Routine").slice(0, 40),
    exercises,
    lastPerformedAt: Number(routine?.lastPerformedAt) || null,
  };
}

function cloneSessionExercises(exercises) {
  return Array.isArray(exercises)
    ? exercises.map((exercise) => normalizeExerciseShape(exercise, true))
    : [];
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const loaded = { ...defaultState(), ...JSON.parse(raw) };
    const normalizedExercises = Array.isArray(loaded.exercises)
      ? loaded.exercises.map((exercise) => normalizeExerciseShape(exercise, true))
      : [];
    const normalizedRoutines = Array.isArray(loaded.routines)
      ? loaded.routines.map((routine) => normalizeRoutineShape(routine))
      : [];

    if (!normalizedRoutines.length && normalizedExercises.length) {
      normalizedRoutines.push({
        id: createRoutineId(),
        name: "My Routine",
        exercises: normalizedExercises.map((exercise) => normalizeExerciseShape(exercise, false)),
        lastPerformedAt: null,
      });
    }

    const activeRoutineId = normalizedRoutines.some((routine) => routine.id === loaded.activeRoutineId)
      ? loaded.activeRoutineId
      : normalizedRoutines[0]?.id || null;

    const restoredSession = loaded.inProgressSession && loaded.inProgressSession.snapshot
      ? {
          routineId: loaded.inProgressSession.routineId || activeRoutineId,
          routineName: String(loaded.inProgressSession.routineName || "Routine").slice(0, 40),
          savedAt: Number(loaded.inProgressSession.savedAt) || Date.now(),
          snapshot: {
            ...loaded.inProgressSession.snapshot,
            exercises: cloneSessionExercises(loaded.inProgressSession.snapshot.exercises),
          },
        }
      : null;

    return {
      ...loaded,
      routines: normalizedRoutines,
      activeRoutineId,
      inProgressSession: restoredSession,
      draftRepRange: getValidRepRange(loaded.draftRepRange),
      draftSetCount: getValidSetCount(loaded.draftSetCount),
      selectedFatigueTierKey: FATIGUE_TIERS.some((tier) => tier.key === loaded.selectedFatigueTierKey)
        ? loaded.selectedFatigueTierKey
        : null,
      exercises: normalizedExercises,
      view: "main",
      pendingRemoveExerciseIndex: null,
      installHelpOpen: false,
    };
  } catch {
    return defaultState();
  }
}

function getFatigueTierKey(value) {
  return FATIGUE_TIERS.some((tier) => tier.key === value) ? value : DEFAULT_FATIGUE_TIER_KEY;
}

function getFatigueTier(value) {
  const safeKey = getFatigueTierKey(value);
  return FATIGUE_TIERS.find((tier) => tier.key === safeKey) || FATIGUE_TIERS[2];
}

function applyFatigueRestTier(tierKey) {
  const tier = getFatigueTier(tierKey);
  state.selectedFatigueTierKey = tier.key;
  state.restTimerDurationMs = tier.defaultRestSeconds * 1000;
  startRestCountdown();
  return tier;
}

function saveState() {
  const shouldPersistDraft = ["warmup", "set", "feedback", "rest", "adjustment", "exerciseDone"].includes(state.view);
  if (shouldPersistDraft && state.sessionStartedAt && state.exercises.length) {
    const activeRoutine = getActiveRoutine();
    state.inProgressSession = {
      routineId: state.activeRoutineId,
      routineName: activeRoutine?.name || "Routine",
      savedAt: Date.now(),
      snapshot: {
        view: state.view,
        exercises: cloneSessionExercises(state.exercises),
        activeExerciseIndex: state.activeExerciseIndex,
        activeSetIndex: state.activeSetIndex,
        warmupChecks: [...state.warmupChecks],
        sessionStartedAt: state.sessionStartedAt,
        history: Array.isArray(state.history) ? [...state.history] : [],
        lastFeedback: state.lastFeedback ? { ...state.lastFeedback } : null,
        currentWeight: state.currentWeight,
        currentReps: state.currentReps,
        nextDefaultReps: state.nextDefaultReps,
        selectedFatigueTierKey: state.selectedFatigueTierKey,
        restTimerEndsAt: state.restTimerEndsAt,
        restTimerDurationMs: state.restTimerDurationMs,
        restTimerCompletedAt: state.restTimerCompletedAt,
      },
    };
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getRoutineById(routineId) {
  if (!routineId) return null;
  return state.routines.find((routine) => routine.id === routineId) || null;
}

function getActiveRoutine() {
  return getRoutineById(state.activeRoutineId);
}

function describeLastPerformed(lastPerformedAt) {
  if (!lastPerformedAt) return "Never performed";
  const days = Math.max(0, Math.floor((Date.now() - lastPerformedAt) / (24 * 60 * 60 * 1000)));
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function restoreInProgressSession() {
  const draft = state.inProgressSession;
  const snapshot = draft?.snapshot;
  if (!snapshot) return;

  state.activeRoutineId = draft.routineId || state.activeRoutineId;
  state.exercises = cloneSessionExercises(snapshot.exercises);
  state.activeExerciseIndex = Math.max(0, Number(snapshot.activeExerciseIndex) || 0);
  state.activeSetIndex = Math.max(0, Number(snapshot.activeSetIndex) || 0);
  state.warmupChecks = Array.isArray(snapshot.warmupChecks) && snapshot.warmupChecks.length === 4
    ? snapshot.warmupChecks.map(Boolean)
    : [false, false, false, false];
  state.sessionStartedAt = Number(snapshot.sessionStartedAt) || Date.now();
  state.history = Array.isArray(snapshot.history) ? [...snapshot.history] : [];
  state.lastFeedback = snapshot.lastFeedback ? { ...snapshot.lastFeedback } : null;
  state.currentWeight = clampWeight(Number(snapshot.currentWeight) || 0);
  state.currentReps = Math.max(1, Number(snapshot.currentReps) || 1);
  state.nextDefaultReps = Math.max(1, Number(snapshot.nextDefaultReps) || 1);
  state.selectedFatigueTierKey = FATIGUE_TIERS.some((tier) => tier.key === snapshot.selectedFatigueTierKey)
    ? snapshot.selectedFatigueTierKey
    : null;
  state.restTimerEndsAt = Number(snapshot.restTimerEndsAt) || null;
  state.restTimerDurationMs = Number(snapshot.restTimerDurationMs) || DEFAULT_REST_COUNTDOWN_MS;
  state.restTimerCompletedAt = Number(snapshot.restTimerCompletedAt) || null;
  state.view = ["warmup", "set", "feedback", "rest", "adjustment", "exerciseDone"].includes(snapshot.view)
    ? snapshot.view
    : "set";
}

function startWorkoutFromRoutine(routine) {
  if (!routine || !routine.exercises.length) {
    state.view = "add";
    return;
  }

  state.activeRoutineId = routine.id;
  state.exercises = routine.exercises.map((exercise) => normalizeExerciseShape(exercise, false));
  state.history = [];
  state.activeExerciseIndex = 0;
  state.activeSetIndex = 0;
  state.warmupChecks = [false, false, false, false];
  state.sessionStartedAt = Date.now();
  state.currentWeight = state.exercises[0].baseWeight;
  state.nextDefaultReps = getGoalFromExercise(state.exercises[0]).min;
  state.currentReps = state.nextDefaultReps;
  state.lastFeedback = null;
  state.workoutReadyForNext = false;
  state.pendingRemoveExerciseIndex = null;
  state.selectedFatigueTierKey = null;
  state.restTimerEndsAt = null;
  state.restTimerDurationMs = DEFAULT_REST_COUNTDOWN_MS;
  state.restTimerCompletedAt = null;
  state.inProgressSession = null;
  state.view = "warmup";
}

function openExerciseLogger(exerciseIndex) {
  const picked = state.exercises[exerciseIndex];
  if (!picked) return;

  state.activeExerciseIndex = exerciseIndex;
  state.sessionStartedAt = state.sessionStartedAt || Date.now();

  if (picked.sets.length === 0) {
    state.activeSetIndex = 0;
    state.currentWeight = picked.baseWeight;
    state.nextDefaultReps = getGoalFromExercise(picked).min;
    state.currentReps = state.nextDefaultReps;
    state.lastFeedback = null;
    if (exerciseIndex === 0) {
      state.warmupChecks = [false, false, false, false];
      state.view = "warmup";
    } else {
      state.view = "set";
    }
  } else {
    const plannedSetCount = getPlannedSetCount(picked);
    state.activeSetIndex = Math.min(plannedSetCount - 1, picked.sets.length);
    state.currentWeight = picked.sets[picked.sets.length - 1].weight;
    state.nextDefaultReps = getGoalFromExercise(picked).min;
    state.currentReps = state.nextDefaultReps;
    state.lastFeedback = null;
    state.view = "set";
  }
}

function getValidRepRange(value) {
  return REP_RANGE_OPTIONS.some((option) => option.value === value) ? value : DEFAULT_REP_RANGE;
}

function repRangeToGoal(repRange) {
  const picked =
    REP_RANGE_OPTIONS.find((option) => option.value === repRange) ||
    REP_RANGE_OPTIONS.find((option) => option.value === DEFAULT_REP_RANGE);

  if (!picked) {
    return { min: 10, max: 15, label: "10-15 reps" };
  }

  return {
    min: picked.min,
    max: picked.max,
    label: `${picked.min}-${picked.max} reps`,
  };
}

function getGoalFromExercise(exercise) {
  if (!exercise) {
    return repRangeToGoal(DEFAULT_REP_RANGE);
  }

  if (exercise.repRange) {
    return repRangeToGoal(getValidRepRange(exercise.repRange));
  }

  return getGoalFromDefaultReps(exercise.defaultReps || 10);
}

function getValidSetCount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_SET_COUNT;
  return Math.max(MIN_SET_COUNT, Math.min(MAX_SET_COUNT, Math.round(parsed)));
}

function getPlannedSetCount(exercise) {
  return getValidSetCount(exercise?.plannedSetCount ?? exercise?.setCount);
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

function shouldHoldWakeLock() {
  return state.view === "rest" && typeof state.restTimerEndsAt === "number" && getRestRemainingMs() > 0;
}

async function requestScreenWakeLock() {
  if (!("wakeLock" in navigator) || wakeLockSentinel) return;

  try {
    wakeLockSentinel = await navigator.wakeLock.request("screen");
    wakeLockSentinel.addEventListener("release", () => {
      wakeLockSentinel = null;
    });
  } catch {
    // Wake lock can fail from OS battery policies or unsupported browser contexts.
  }
}

function releaseScreenWakeLock() {
  if (!wakeLockSentinel) return;
  const activeLock = wakeLockSentinel;
  wakeLockSentinel = null;
  activeLock.release().catch(() => {});
}

function syncScreenWakeLock() {
  if (shouldHoldWakeLock()) {
    requestScreenWakeLock();
    return;
  }

  releaseScreenWakeLock();
}

function triggerRestCompletionCue() {
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate([140, 70, 180]);
  }

  playBreathTestChime();
  window.setTimeout(() => {
    playBreathTestChime();
  }, 240);
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function getRestProgress() {
  const totalMs = Math.max(1, Number(state.restTimerDurationMs) || DEFAULT_REST_COUNTDOWN_MS);
  const remainingMs = getRestRemainingMs();
  const elapsedMs = Math.max(0, totalMs - remainingMs);
  return Math.max(0, Math.min(1, elapsedMs / totalMs));
}

function getBreathPhaseDurationsMs() {
  const tier = getFatigueTier(state.selectedFatigueTierKey);
  const profile = tier.breathProfile;
  const progress = getRestProgress();
  const inhaleSec = lerp(profile.startInhaleSec, profile.endInhaleSec, progress);
  const exhaleSec = lerp(profile.startExhaleSec, profile.endExhaleSec, progress);
  const inhaleMs = Math.round(inhaleSec * 1000);
  const exhaleMs = Math.round(exhaleSec * 1000);
  return { inhaleMs, exhaleMs };
}

function ensureBreathAudioReady() {
  if (state.breathAudioMuted) return false;
  if (!breathAudioEnabled) return false;

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    breathAudioEnabled = false;
    return false;
  }

  if (!breathAudioContext) {
    breathAudioContext = new AudioContextCtor();
    breathMasterGain = breathAudioContext.createGain();
    breathMasterGain.gain.value = 0.2;
    breathMasterGain.connect(breathAudioContext.destination);
  }

  if (breathAudioContext.state === "suspended") {
    breathAudioContext.resume().catch(() => {
      // Keep retrying on future user gestures instead of permanently disabling.
    });
  }

  return true;
}

function primeBreathAudioFromGesture() {
  if (breathAudioUnlockBound) return;
  breathAudioUnlockBound = true;

  const unlock = () => {
    if (!state.breathAudioMuted) {
      ensureBreathAudioReady();
    }
  };

  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("touchstart", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
}

function playBowlStrike(baseFreq = 200, detuneHz = 4, overtoneRatio = 2.76, attackTime = 0.1, releaseTime = 4.0) {
  if (!breathAudioContext || !breathMasterGain) {
    return;
  }

  const now = breathAudioContext.currentTime;
  const safeAttack = Math.max(0.02, attackTime);
  const safeRelease = Math.max(0.25, releaseTime);

  const masterGain = breathAudioContext.createGain();
  const overtoneGain = breathAudioContext.createGain();

  const oscBase = breathAudioContext.createOscillator();
  const oscWobble = breathAudioContext.createOscillator();
  const oscOvertone = breathAudioContext.createOscillator();

  oscBase.type = "sine";
  oscWobble.type = "sine";
  oscOvertone.type = "sine";

  oscBase.frequency.setValueAtTime(baseFreq, now);
  oscWobble.frequency.setValueAtTime(baseFreq + detuneHz, now);
  oscOvertone.frequency.setValueAtTime(baseFreq * overtoneRatio, now);

  masterGain.gain.setValueAtTime(0.0001, now);
  masterGain.gain.linearRampToValueAtTime(0.22, now + safeAttack);
  masterGain.gain.exponentialRampToValueAtTime(0.001, now + safeAttack + safeRelease);

  overtoneGain.gain.setValueAtTime(0.0001, now);
  overtoneGain.gain.linearRampToValueAtTime(0.16, now + Math.min(0.08, safeAttack));
  overtoneGain.gain.exponentialRampToValueAtTime(0.001, now + safeAttack + safeRelease / 2);

  oscBase.connect(masterGain);
  oscWobble.connect(masterGain);
  oscOvertone.connect(overtoneGain);
  overtoneGain.connect(masterGain);
  masterGain.connect(breathMasterGain);

  oscBase.start(now);
  oscWobble.start(now);
  oscOvertone.start(now);

  const totalDuration = now + safeAttack + safeRelease + 0.1;
  oscBase.stop(totalDuration);
  oscWobble.stop(totalDuration);
  oscOvertone.stop(totalDuration);

  oscBase.onended = () => {
    oscBase.disconnect();
    oscWobble.disconnect();
    oscOvertone.disconnect();
    overtoneGain.disconnect();
    masterGain.disconnect();
  };
}

function playBreathTone(isInhalePhase, phaseMs) {
  if (state.breathAudioMuted) {
    return;
  }

  if (!ensureBreathAudioReady() || !breathAudioContext || !breathMasterGain) {
    return;
  }

  if (breathAudioContext.state === "suspended") {
    breathAudioContext
      .resume()
      .then(() => {
        playBreathTone(isInhalePhase, phaseMs);
      })
      .catch(() => {});
    return;
  }

  const now = breathAudioContext.currentTime;
  const minPhaseMs = 1800;
  const maxPhaseMs = 4200;
  const clampedPhaseMs = Math.max(minPhaseMs, Math.min(maxPhaseMs, phaseMs));
  const speed = (maxPhaseMs - clampedPhaseMs) / (maxPhaseMs - minPhaseMs);
  const anchorFreq = 170 + speed * 70;
  const inhaleBaseFreq = Math.max(170, Math.min(340, anchorFreq * 1.08));
  const exhaleBaseFreq = Math.max(130, Math.min(300, anchorFreq * 0.86));
  const baseFreq = isInhalePhase ? inhaleBaseFreq : exhaleBaseFreq;

  const detuneHz = 2 + speed * 4;
  const overtoneRatio = isInhalePhase ? 2.76 : 5.4;
  const attackSec = isInhalePhase ? 0.06 : 0.08;
  const phaseSec = clampedPhaseMs / 1000;
  const phaseGuardSec = 0.045;
  const releaseSec = Math.max(0.3, phaseSec - attackSec - phaseGuardSec);

  playBowlStrike(baseFreq, detuneHz, overtoneRatio, attackSec, releaseSec);
  breathLastFrequency = baseFreq;
}

function playBreathTestChime() {
  if (!ensureBreathAudioReady() || !breathAudioContext || !breathMasterGain) {
    return;
  }

  if (breathAudioContext.state === "suspended") {
    breathAudioContext
      .resume()
      .then(() => {
        playBreathTestChime();
      })
      .catch(() => {});
    return;
  }

  const now = breathAudioContext.currentTime;
  const osc = breathAudioContext.createOscillator();
  const gain = breathAudioContext.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(440, now);
  osc.frequency.exponentialRampToValueAtTime(660, now + 0.28);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.09, now + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

  osc.connect(gain);
  gain.connect(breathMasterGain);

  osc.start(now);
  osc.stop(now + 0.38);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

function scheduleBreathPhase() {
  const orb = appScreen?.querySelector(".breath-orb");
  if (!orb || state.view !== "rest") {
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
  breathLastFrequency = 180;
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

  if (breathAudioContext && breathAudioContext.state === "running") {
    breathAudioContext.suspend().catch(() => {});
  }
}

function updateVisibleRestTime(remainingMs) {
  const restTimeEl = appScreen?.querySelector("[data-rest-time]");
  if (!restTimeEl) return false;
  restTimeEl.textContent = formatCountdown(remainingMs);

  const restStatusEl = appScreen?.querySelector("[data-rest-status]");
  if (restStatusEl) {
    restStatusEl.textContent =
      remainingMs <= 0
        ? "Rest complete. Continue when ready."
        : "Follow the breathing orb. Inhale as it expands, exhale as it contracts.";
  }

  const restPanelEl = appScreen?.querySelector("[data-rest-panel]");
  if (restPanelEl) {
    restPanelEl.classList.toggle("is-complete", remainingMs <= 0);
  }

  const continueBtn = appScreen?.querySelector("[data-act='continue-next-set']");
  if (continueBtn) {
    continueBtn.textContent = remainingMs <= 0 ? "Rest complete - continue" : "See next-set suggestion";
  }

  return true;
}

function recommendFatigueTier(goal, repsAchieved) {
  if (!goal) return DEFAULT_FATIGUE_TIER_KEY;
  if (repsAchieved < goal.min) return "smoked";
  if (repsAchieved >= goal.max) return "fresh";

  const midpoint = Math.floor((goal.min + goal.max) / 2);
  if (repsAchieved <= midpoint - 1) return "winded";
  return "solid";
}

function ensureRestTimerInterval() {
  if (restTimerIntervalId) return;

  restTimerIntervalId = window.setInterval(() => {
    const hadActiveTimer = typeof state.restTimerEndsAt === "number";
    const remaining = getRestRemainingMs();

    if (state.view === "feedback" || state.view === "rest") {
      if (!updateVisibleRestTime(remaining)) {
        render();
      }
    } else {
      saveState();
    }

    if (remaining <= 0 && hadActiveTimer) {
      state.restTimerEndsAt = null;
      if (!state.restTimerCompletedAt) {
        state.restTimerCompletedAt = Date.now();
        triggerRestCompletionCue();
      }
      clearRestTimerInterval();
      stopBreathingAnimation();
      syncScreenWakeLock();

      if (state.view === "rest") {
        render();
        return;
      }
    }
  }, 1000);
}

function startRestCountdown() {
  state.restTimerEndsAt = Date.now() + state.restTimerDurationMs;
  state.restTimerCompletedAt = null;
  ensureRestTimerInterval();
  syncScreenWakeLock();
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
      totalSeconds: baseRest + 30,
      baseSeconds: baseRest,
      bonusSeconds: 30,
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

  if (state.view !== "rest") {
    stopBreathingAnimation();
  }

  if (state.view === "main") renderMain();
  if (state.view === "preflight") renderPreFlight();
  if (state.view === "add") renderAddExercise();
  if (state.view === "warmup") renderWarmup();
  if (state.view === "set") renderSetInput();
  if (state.view === "feedback") renderFeedback();
  if (state.view === "rest") renderRest();
  if (state.view === "adjustment") renderAdjustment();
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
  const draft = state.inProgressSession;
  const resumeButton = draft
    ? `<button data-act="resume-workout" class="btn btn-resume" type="button">Resume ${esc(draft.routineName)} In Progress</button>`
    : "";

  const routineCards = state.routines.length
    ? `<ul class="exercise-list">${state.routines
        .map((routine) => {
          const exercisePreview = routine.exercises.slice(0, 3).map((exercise) => exercise.name).join(" • ");
          const moreCount = Math.max(0, routine.exercises.length - 3);
          const previewLabel = routine.exercises.length
            ? `${esc(exercisePreview)}${moreCount ? ` • +${moreCount} more` : ""}`
            : "No exercises yet";
          return `<li class="exercise-item routine-item">
              <div>
                <strong>${esc(routine.name)}</strong>
                <p class="small">${previewLabel}</p>
                <p class="small">Last performed: ${esc(describeLastPerformed(routine.lastPerformedAt))}</p>
              </div>
              <div class="exercise-actions">
                <button
                  class="mini-btn"
                  data-act="open-routine"
                  data-routine-id="${esc(routine.id)}"
                  type="button"
                >Open</button>
              </div>
            </li>`;
        })
        .join("")}</ul>`
    : `<div class="card center"><p class="small">No routines yet. Create your first workout routine.</p></div>`;

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
      <p class="line-title" style="margin-top:0;">Routine Library</p>
      ${routineCards}
      <button data-act="create-routine" class="btn btn-outline" type="button">+ Create routine</button>
      ${resumeButton}
    </div>
    ${renderRemoveExerciseModal()}
  `;
}

function renderPreFlight() {
  const routine = getActiveRoutine();
  if (!routine) {
    state.view = "main";
    render();
    return;
  }

  const hasActiveSession = Boolean(state.sessionStartedAt) && state.exercises.length > 0;
  const sourceExercises = hasActiveSession ? state.exercises : routine.exercises;

  const exerciseList = sourceExercises.length
    ? sourceExercises
        .map((exercise, idx) => {
          const goal = getGoalFromExercise(exercise);
          const doneSets = Array.isArray(exercise.sets) ? exercise.sets.length : 0;
          const plannedSetCount = getPlannedSetCount(exercise);
          const canLog = doneSets < plannedSetCount;
          const ctaLabel = doneSets === 0 ? "Log set" : doneSets < plannedSetCount ? "Continue" : "Done";
          return `<li class="exercise-item">
            <div>
              <strong>${esc(exercise.name)}</strong>
              <p class="small">Target: ${goal.label} @ ${formatWeight(exercise.baseWeight)} lbs</p>
              <p class="small">${doneSets}/${plannedSetCount} sets logged</p>
            </div>
            <div class="exercise-actions">
              <button
                class="mini-btn"
                data-act="log-routine-exercise"
                data-exercise-index="${idx}"
                type="button"
                ${canLog ? "" : "disabled"}
              >${ctaLabel}</button>
            </div>
          </li>`;
        })
        .join("")
    : '<li class="exercise-item"><div><strong>No exercises yet</strong><p class="small">Add at least one exercise to this routine.</p></div></li>';

  appScreen.innerHTML = `
    <div class="top-bar">
      <button data-act="go-main" class="mini" type="button">x</button>
      <strong>ISP</strong>
      <span></span>
    </div>
    <p class="line-title" style="color:#9fb2e8;">Pre-Flight</p>
    <h2 class="hero hero-white" style="font-size:2.4rem;margin-bottom:8px;">${esc(routine.name)}</h2>
    <p class="sub">Review today's targets before you start.</p>
    <div class="card glow-green">
      <ul class="exercise-list">${exerciseList}</ul>
      <button data-act="go-add" class="btn btn-outline" type="button">+ Add exercise</button>
      <button data-act="start-routine" class="btn btn-primary" type="button" ${routine.exercises.length ? "" : "disabled"}>Start workout</button>
    </div>
  `;
}

function renderAddExercise() {
  const routine = getActiveRoutine();
  const routineLabel = routine ? `Add to ${routine.name}` : "Exercise Creation";
  const repRangeOptions = REP_RANGE_OPTIONS
    .map((option) => `<option value="${option.value}" ${state.draftRepRange === option.value ? "selected" : ""}>${option.value}</option>`)
    .join("");
  const libraryGroups = EXERCISE_LIBRARY.map((group) => {
    const chips = group.exercises
      .map(
        (exerciseName) =>
          `<button data-act="pick-library-exercise" data-library-exercise="${esc(exerciseName)}" class="library-chip" type="button">${esc(exerciseName)}</button>`,
      )
      .join("");

    return `
      <section class="library-group" aria-label="${esc(group.muscleGroup)} exercises">
        <p class="library-group-title">${esc(group.muscleGroup)}</p>
        <div class="library-chip-grid">${chips}</div>
      </section>
    `;
  }).join("");
  const setCountOptions = Array.from(
    { length: MAX_SET_COUNT - MIN_SET_COUNT + 1 },
    (_, idx) => MIN_SET_COUNT + idx,
  )
    .map((count) => `<option value="${count}" ${state.draftSetCount === count ? "selected" : ""}>${count} set${count === 1 ? "" : "s"}</option>`)
    .join("");

  appScreen.innerHTML = `
    <div class="top-bar">
      <button data-act="go-preflight" class="mini" type="button">x</button>
      <strong>ISP</strong>
      <span></span>
    </div>
    <h2 class="hero hero-white" style="font-size:2.4rem;margin-bottom:10px;">${esc(routineLabel)}</h2>
    <div class="card glow-green">
      <label class="line-title" for="draftName">Exercise name</label>
      <input id="draftName" class="text-input" value="${esc(state.draftName)}" placeholder="e.g. Barbell Back Squat" />

      <details class="exercise-library">
        <summary class="library-toggle">Browse exercise library by muscle group</summary>
        <div class="exercise-library-content">
          ${libraryGroups}
        </div>
      </details>

      <div class="input-row">
        <label class="line-title" for="draftWeight">Starting weight (lbs)</label>
        <div class="control">
          <button class="mini" data-act="draft-weight-down" type="button">-</button>
          <input id="draftWeightInput" class="metric metric-input" type="number" min="0" step="0.01" value="${formatWeight(state.draftWeight)}" />
          <button class="mini" data-act="draft-weight-up" type="button">+</button>
        </div>
      </div>
      <div class="input-row">
        <label class="line-title" for="draftRepRange">Rep range</label>
        <select id="draftRepRange" class="text-input">${repRangeOptions}</select>
      </div>
      <div class="input-row">
        <label class="line-title" for="draftSetCount">Sets</label>
        <select id="draftSetCount" class="text-input">${setCountOptions}</select>
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
      <button data-act="go-preflight" class="mini" type="button">x</button>
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

  const goal = getGoalFromExercise(exercise);
  const plannedSetCount = getPlannedSetCount(exercise);

  appScreen.innerHTML = `
    <div class="top-bar">
      <button data-act="go-preflight" class="mini" type="button">x</button>
      <strong>ISP</strong>
      <span></span>
    </div>
    <p class="line-title" style="margin:0 0 8px;color:#d2dcf8;">Set ${state.activeSetIndex + 1} of ${plannedSetCount}</p>
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

function getNextTargetReps(goal, repsCompleted) {
  if (!goal || typeof goal.max !== "number") {
    return Math.max(1, repsCompleted + 1);
  }

  if (repsCompleted >= goal.max) {
    return goal.max;
  }

  return Math.max(1, Math.min(goal.max, repsCompleted + 1));
}

function prepareNextWorkoutCarryOver() {
  for (const exercise of state.exercises) {
    const goal = getGoalFromExercise(exercise);
    const lastSet = exercise.sets.length ? exercise.sets[exercise.sets.length - 1] : null;
    if (lastSet) {
      exercise.baseWeight = lastSet.weight;
      exercise.defaultReps = goal.min;
    } else {
      exercise.defaultReps = goal.min;
    }
    exercise.sets = [];
  }

  state.history = [];
}

function renderFeedback() {
  const feedback = state.lastFeedback || {
    kind: "steady",
    title: "Set Logged",
    subtitle: "Progression nudge",
    message: "Set logged.",
  };
  const isGold = feedback.kind === "topRange" || feedback.kind === "belowRange";
  const selectedTierKey = state.selectedFatigueTierKey;
  const fatigueOptions = FATIGUE_TIERS.map((tier) => {
    const selected = tier.key === selectedTierKey;
    return `
      <button
        data-act="set-fatigue-tier"
        data-fatigue-key="${tier.key}"
        class="fatigue-btn ${selected ? "is-selected" : ""}"
        type="button"
        aria-pressed="${selected ? "true" : "false"}"
      >
        <span class="fatigue-emoji" aria-hidden="true">${tier.key === "smoked" ? "💀" : tier.key === "winded" ? "🥵" : tier.key === "solid" ? "💪" : "🤏"}</span>
        <span class="fatigue-main">${esc(tier.label)}</span>
      </button>
    `;
  }).join("");

  appScreen.innerHTML = `
    <div class="center">
      <p class="badge">Fatigue check-in</p>
      <h2 class="hero ${isGold ? "gold" : "hero-white"}" style="font-size:4rem;">How did that set feel?</h2>
      <div class="card">
        <p class="sub" style="margin-bottom:0;">Choose your fatigue level to set your rest timing.</p>
      </div>
      <div class="rest-panel" aria-label="Fatigue check-in">
        <p class="line-title" style="margin:0 0 8px;">How are you feeling?</p>
        <p class="fatigue-rank-label" style="margin:0 0 6px;">Highest fatigue</p>
        <div class="fatigue-grid" role="radiogroup" aria-label="Fatigue tier quick tap">
          ${fatigueOptions}
        </div>
        <p class="fatigue-rank-label fatigue-rank-low" style="margin:6px 0 0;">Lowest fatigue</p>
      </div>
      <p class="small" style="margin:8px 0 0;color:#b9c4da;">Pick your fatigue level to begin rest.</p>
    </div>
  `;
}

function renderRest() {
  const feedback = state.lastFeedback || {
    kind: "steady",
    title: "Set Logged",
    subtitle: "Progression nudge",
    message: "Set logged.",
  };
  const isGold = feedback.kind === "topRange" || feedback.kind === "belowRange";
  const selectedTier = getFatigueTier(state.selectedFatigueTierKey);
  const restRemainingMs = getRestRemainingMs();
  const restDisplayMs = typeof state.restTimerEndsAt === "number" ? restRemainingMs : state.restTimerDurationMs;
  const restLabel = formatCountdown(restDisplayMs);
  const restComplete = !state.restTimerEndsAt && Boolean(state.restTimerCompletedAt);

  appScreen.innerHTML = `
    <div class="center">
      <p class="badge">${esc(selectedTier.label)} • ${esc(selectedTier.alt)}</p>
      <h2 class="hero ${isGold ? "gold" : "hero-white"}" style="font-size:3.2rem;">Rest</h2>
      <div class="rest-panel ${restComplete ? "is-complete" : ""}" aria-live="polite" aria-label="Rest countdown" data-rest-panel>
        <div class="rest-timer-row">
          <p class="line-title" style="margin:0;">Rest timer</p>
          <p class="rest-time" data-rest-time>${restLabel}</p>
        </div>
        <p class="small" style="margin:0 0 8px;color:#b9c4da;">${esc(selectedTier.description)} Window: ${esc(selectedTier.restRangeLabel)}.</p>
        <p class="rest-status" data-rest-status>${
          restComplete
            ? "Rest complete. Continue when ready."
            : "Follow the breathing orb. Inhale as it expands, exhale as it contracts."
        }</p>
        <div class="breath-wrap" aria-hidden="true">
          <div class="breath-orb"></div>
        </div>
      </div>
      <button data-act="continue-next-set" class="btn ${isGold ? "btn-gold" : "btn-secondary"}" type="button">${
        restComplete ? "Rest complete - continue" : "See next-set suggestion"
      }</button>
      <button data-act="go-feedback" class="btn btn-outline" type="button">Change fatigue rating</button>
    </div>
  `;

  if (restComplete) {
    stopBreathingAnimation();
  } else {
    startBreathingAnimation();
  }

  syncScreenWakeLock();
}

function renderAdjustment() {
  const exercise = activeExercise();
  const lastSet = exercise && exercise.sets.length ? exercise.sets[exercise.sets.length - 1] : null;
  const feedback = state.lastFeedback || {
    kind: "steady",
    title: "Set Logged",
    subtitle: "Progression nudge",
    message: "Set logged.",
    adjustLabel: "Keep current weight",
  };
  const isGold = feedback.kind === "topRange" || feedback.kind === "belowRange";

  appScreen.innerHTML = `
    <div class="center">
      <p class="badge">Next-set adjustment</p>
      <h2 class="hero ${isGold ? "gold" : "hero-white"}" style="font-size:3rem;">Suggestion</h2>
      <div class="card ${isGold ? "glow-gold" : ""}">
        ${
          lastSet
            ? `<p class="line-title" style="margin:0 0 6px;">You hit: ${formatWeight(lastSet.weight)} lbs x ${lastSet.reps} reps (Set ${lastSet.setNumber || state.activeSetIndex})</p>`
            : ""
        }
        <p class="sub" style="margin-bottom:0;">${esc(feedback.message || "Set logged.")}</p>
      </div>
      <button data-act="use-feedback-adjustment" class="btn btn-primary" type="button">${esc(feedback.adjustLabel || "Keep current weight")}</button>
      <button data-act="skip-feedback-adjustment" class="btn btn-outline" type="button">Keep current setup</button>
    </div>
  `;
}

function renderExerciseDone() {
  const exercise = activeExercise();
  if (!exercise) {
    state.view = "main";
    render();
    return;
  }

  const plannedSetCount = getPlannedSetCount(exercise);

  appScreen.innerHTML = `
    <div class="center">
      <div class="icon-circle" style="color:#45df7d;border-color:#2f6542;">✔</div>
      <p class="badge">Exercise complete</p>
      <h2 class="hero hero-white" style="font-size:3.2rem;">${esc(exercise.name)}</h2>
      <p class="sub">${plannedSetCount} sets logged. Move to the next exercise in your workout.</p>
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
      const fatigueKey = el.getAttribute("data-fatigue-key");
      const routineId = el.getAttribute("data-routine-id");
      const libraryExerciseName = el.getAttribute("data-library-exercise");
      handleAction(action, exerciseIndex, tierIndex, fatigueKey, routineId, libraryExerciseName);
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

  const draftRepRangeInput = document.getElementById("draftRepRange");
  if (draftRepRangeInput) {
    draftRepRangeInput.addEventListener("change", () => {
      state.draftRepRange = getValidRepRange(draftRepRangeInput.value);
      saveState();
    });
  }

  const draftSetCountInput = document.getElementById("draftSetCount");
  if (draftSetCountInput) {
    draftSetCountInput.addEventListener("change", () => {
      state.draftSetCount = getValidSetCount(draftSetCountInput.value);
      saveState();
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

function handleAction(
  action,
  exerciseIndex = null,
  tierIndex = null,
  fatigueKey = null,
  routineId = null,
  libraryExerciseName = null,
) {
  if (action === "go-main") state.view = "main";
  if (action === "go-add") state.view = "add";
  if (action === "go-preflight") state.view = state.activeRoutineId ? "preflight" : "main";
  if (action === "go-feedback") state.view = "feedback";

  if (action === "create-routine") {
    const routine = {
      id: createRoutineId(),
      name: `Routine ${state.routines.length + 1}`,
      exercises: [],
      lastPerformedAt: null,
    };
    state.routines.push(routine);
    state.activeRoutineId = routine.id;
    state.view = "preflight";
  }

  if (action === "open-routine" && routineId) {
    const routine = getRoutineById(routineId);
    if (routine) {
      state.activeRoutineId = routine.id;
      state.view = "preflight";
    }
  }

  if (action === "start-routine") {
    const routine = getActiveRoutine();
    startWorkoutFromRoutine(routine);
  }

  if (action === "resume-workout") {
    restoreInProgressSession();
  }

  if (action === "log-routine-exercise" && Number.isInteger(exerciseIndex)) {
    const routine = getActiveRoutine();
    if (routine) {
      if (!state.sessionStartedAt || !state.exercises.length) {
        state.exercises = routine.exercises.map((exercise) => normalizeExerciseShape(exercise, false));
        state.activeExerciseIndex = 0;
        state.activeSetIndex = 0;
        state.warmupChecks = [false, false, false, false];
        state.sessionStartedAt = Date.now();
        state.history = [];
        state.lastFeedback = null;
        state.selectedFatigueTierKey = null;
        state.restTimerEndsAt = null;
        state.restTimerDurationMs = DEFAULT_REST_COUNTDOWN_MS;
        state.restTimerCompletedAt = null;
      }

      openExerciseLogger(exerciseIndex);
    }
  }

  if (action === "toggle-warmup-tier" && Number.isInteger(tierIndex) && tierIndex >= 0 && tierIndex < state.warmupChecks.length) {
    state.warmupChecks[tierIndex] = !state.warmupChecks[tierIndex];
  }

  if (action === "log-exercise" && Number.isInteger(exerciseIndex)) {
    openExerciseLogger(exerciseIndex);
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

  if (action === "pick-library-exercise" && libraryExerciseName) {
    state.draftName = String(libraryExerciseName).slice(0, 40);
  }

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

    const routine = getActiveRoutine();
    if (!routine) {
      state.view = "main";
      render();
      return;
    }

    routine.exercises.push({
      name,
      baseWeight: state.draftWeight,
      repRange: getValidRepRange(state.draftRepRange),
      defaultReps: repRangeToGoal(getValidRepRange(state.draftRepRange)).min,
      plannedSetCount: getValidSetCount(state.draftSetCount),
      sets: [],
    });
    state.draftName = "";
    state.draftWeight = 50;
    state.draftRepRange = DEFAULT_REP_RANGE;
    state.draftSetCount = DEFAULT_SET_COUNT;
    state.view = "preflight";
  }

  if (action === "start-workout") {
    const routine = getActiveRoutine();
    if (!routine) {
      state.view = "main";
      render();
      return;
    }
    startWorkoutFromRoutine(routine);
  }

  if (action === "start-next-workout") {
    const routine = getActiveRoutine();
    if (!routine) {
      state.view = "main";
      render();
      return;
    }
    startWorkoutFromRoutine(routine);
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

  if (action === "set-fatigue-tier" && fatigueKey) {
    applyFatigueRestTier(fatigueKey);
    state.view = "rest";
  }

  if (action === "continue-next-set") {
    state.view = "adjustment";
  }

  if (action === "use-feedback-adjustment") {
    applyFeedbackAdjustment();
    state.view = "set";
  }

  if (action === "skip-feedback-adjustment") {
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
      state.nextDefaultReps = getGoalFromExercise(next).min;
      state.currentReps = state.nextDefaultReps;
      state.lastFeedback = null;
      state.view = "set";
    }
  }

  if (action === "skip-to-complete") {
    state.view = "complete";
  }

  if (action === "finish-workout") {
    const routine = getActiveRoutine();
    if (routine) {
      routine.lastPerformedAt = Date.now();
    }
    state.view = "main";
    state.sessionStartedAt = null;
    state.activeExerciseIndex = 0;
    state.activeSetIndex = 0;
    state.lastFeedback = null;
    state.workoutReadyForNext = true;
    state.inProgressSession = null;
    state.installHelpOpen = false;
    state.restTimerEndsAt = null;
    state.restTimerCompletedAt = null;
    releaseScreenWakeLock();
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
  const goal = getGoalFromExercise(exercise);
  const plannedSetCount = getPlannedSetCount(exercise);
  const setEntry = {
    setNumber: exercise.sets.length + 1,
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

  state.selectedFatigueTierKey = null;
  state.restTimerEndsAt = null;
  state.restTimerDurationMs = DEFAULT_REST_COUNTDOWN_MS;
  state.restTimerCompletedAt = null;

  state.lastFeedback = buildFeedback(previousReps, setEntry.reps, setEntry.weight, null, goal);
  state.nextDefaultReps = getNextTargetReps(goal, setEntry.reps);
  state.currentReps = state.nextDefaultReps;

  if (exercise.sets.length < plannedSetCount) {
    state.activeSetIndex = exercise.sets.length;
    state.view = "feedback";
  } else if (state.activeExerciseIndex < state.exercises.length - 1) {
    state.view = "exerciseDone";
  } else {
    const routine = getActiveRoutine();
    if (routine) {
      routine.lastPerformedAt = Date.now();
    }
    state.inProgressSession = null;
    state.view = "complete";
  }

  render();
}

function buildFeedback(previousReps, currentReps, currentWeight, restInfo = null, goal = null) {
  const minGoal = goal?.min || 10;
  const maxGoal = goal?.max || 15;
  const rangeLabel = `${minGoal}-${maxGoal}`;
  const nextTargetReps = getNextTargetReps({ min: minGoal, max: maxGoal }, currentReps);
  const missedRangeBonusMessage =
    restInfo && restInfo.bonusType === "missedRange"
      ? `Recovery bonus rest: +${restInfo.bonusSeconds}s because you were below ${restInfo.rangeMin} reps.`
      : null;

  if (currentReps >= maxGoal) {
    return {
      kind: "topRange",
      title: `${maxGoal} Reps!`,
      subtitle: "Target achieved",
      message: `Top of your ${rangeLabel} range hit. Select level up to add 5 lbs and reset target reps to ${minGoal}.`,
      suggestedWeight: currentWeight + 5,
      adjustLabel: "Level up +5 lbs",
      resetTargetReps: minGoal,
      missedRangeBonusMessage,
    };
  }

  if (currentReps < minGoal) {
    return {
      kind: "belowRange",
      title: `Below ${minGoal}`,
      subtitle: "Rep threshold not met",
      message: `Below your ${rangeLabel} range. Consider dropping 5 lbs, then aim for ${nextTargetReps} reps next set.`,
      suggestedWeight: Math.max(0, currentWeight - 5),
      adjustLabel: "Lower by 5 lbs",
      missedRangeBonusMessage,
    };
  }

  if (typeof previousReps === "number" && currentReps >= previousReps + 1) {
    return {
      kind: "up",
      title: "Great Work",
      subtitle: "Current effort",
      message: `Great work. You added reps compared with your last set. Next target: ${nextTargetReps} reps.`,
      suggestedWeight: currentWeight,
      adjustLabel: "Keep current weight",
      missedRangeBonusMessage,
    };
  }

  if (typeof previousReps === "number" && currentReps <= previousReps - 1) {
    return {
      kind: "down",
      title: "Check-In",
      subtitle: "Above threshold check-in",
      message: `Reps slipped. Consider a bit more rest before the next set. Next target: ${nextTargetReps} reps.`,
      suggestedWeight: currentWeight,
      adjustLabel: "Keep current weight",
      missedRangeBonusMessage,
    };
  }

  return {
    kind: "steady",
    title: "Set Logged",
    subtitle: "Progression nudge",
    message: "Set logged.",
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

  if (Number.isInteger(state.lastFeedback.resetTargetReps)) {
    state.nextDefaultReps = state.lastFeedback.resetTargetReps;
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
    releaseScreenWakeLock();
    Object.assign(state, defaultState());
    render();
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    syncScreenWakeLock();
  }
});

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
