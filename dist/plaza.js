// The plaza's one staged beat: the studio doors answer before the player reaches them.
//
// dormant ──z ≥ ANTICIPATE──▶ anticipation ──z ≥ TRIGGER──▶ opening ──OPENING s──▶ open
//                               (PA crackle,                 (lock, doors slide,    (doors stay
//                                lights flicker)              red light, PA greets)  open, red)
//
// It triggers once per playthrough. Leaving the plaza during anticipation resets it (the line
// is not repeated); leaving while the doors are opening completes it silently.

export const ANTICIPATE = 8.5,
  TRIGGER = 14,
  ANNOUNCE = 2.2, // seconds into the opening when the PA greets the player
  OPENING = 4;

export function createPlazaEvent() {
  return { phase: 'dormant', clock: 0, anticipated: false, announced: false };
}

export function updatePlazaEvent(state, dt, player) {
  const events = [];
  if (state.phase === 'dormant' && player.z >= ANTICIPATE) {
    state.phase = 'anticipation';
    state.clock = 0;
    if (!state.anticipated) events.push('anticipate');
    state.anticipated = true;
  }
  if (state.phase === 'anticipation') {
    state.clock += dt;
    if (player.z >= TRIGGER) {
      state.phase = 'opening';
      state.clock = 0;
      events.push('unlock');
    }
  } else if (state.phase === 'opening') {
    state.clock += dt;
    if (!state.announced && state.clock >= ANNOUNCE) {
      state.announced = true;
      events.push('announce');
    }
    if (state.clock >= OPENING) {
      state.phase = 'open';
      events.push('settled');
    }
  }
  return events;
}

export function leavePlaza(state) {
  if (state.phase === 'anticipation') {
    state.phase = 'dormant';
    state.clock = 0;
  } else if (state.phase === 'opening') {
    state.phase = 'open';
    state.announced = true;
  }
}

// 0 = shut, 1 = fully open.
export function doorOpenness(state) {
  if (state.phase === 'open') return 1;
  if (state.phase !== 'opening') return 0;
  const t = Math.min(1, Math.max(0, (state.clock - 0.5) / 1.8));
  return t * t * (3 - 2 * t);
}

export function doorsOpen(state) {
  return state.phase === 'open';
}
