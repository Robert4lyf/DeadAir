// The side-street broadcast: a finite, readable encounter on the gameplay clock.
//
// dormant ──player passes TRIGGER_Z─▶ warning ──WARNING s──▶ live ──LIVE s in shelter──▶ clear
//                                                           │       (resolution: sheltered)
//                                       exposed > EXPOSURE s│
//                                                           ▼
//                       caught: a RECOVERY s "picture skip" holds the player, then the
//                       transmission HOLDS on them. It no longer passes by itself; cutting
//                       the service feed (reachable from inside the shelter) ends it.
//
// cutBroadcast() ends any phase (resolution: cut).

export const WARNING = 4.5,
  LIVE = 8,
  EXPOSURE = 0.55, // seconds in the open before the tower catches the player
  RECOVERY = 1.4, // the picture skip; input is held and no catch can fire
  GRACE = 1.5; // after recovery, extra time before exposure starts counting again

// Counts a timer down, snapping floating-point dust to zero.
const tick = (value, dt) => (value - dt < 1e-6 ? 0 : value - dt);

export function createBroadcast() {
  return {
    phase: 'dormant',
    remaining: 0,
    exposure: 0,
    recovery: 0,
    attempts: 0,
    caught: false, // the tower has caught the player at least once
    holding: false, // after a catch, the transmission waits for the feed to be cut
    resolution: null, // 'sheltered' | 'cut'
    breaker: false,
    inside: false,
    warned: false,
  };
}

// The shop awning on the street: it shelters the back of the pavement along its length.
export const SHELTER = { x0: 0.6, x1: 2.75, z0: 12.6, z1: 19.1 },
  SHELTER_SPOT = { x: 1.8, z: 14.2 }, // where a picture skip lands the player
  TRIGGER_Z = 13; // passing the street lamp into the awning's reach starts the warning
export function inShelter(player) {
  return (
    player.x >= SHELTER.x0 &&
    player.x <= SHELTER.x1 &&
    player.z >= SHELTER.z0 &&
    player.z <= SHELTER.z1
  );
}

export function recovering(state) {
  return state.recovery > 0;
}

export function updateBroadcast(state, dt, player, scene) {
  const events = [];
  if (scene !== 0 || state.phase === 'clear') return events;
  if (state.recovery > 0) {
    state.recovery = tick(state.recovery, dt);
    if (!state.recovery) {
      state.exposure = -GRACE;
      events.push('recovered');
    }
    return events;
  }
  state.inside = inShelter(player);
  if (state.phase === 'dormant') {
    if (player.z >= TRIGGER_Z) {
      state.phase = 'warning';
      state.remaining = WARNING;
      state.warned = true;
      events.push('warning');
    }
    return events;
  }
  if (state.phase === 'warning') {
    state.remaining = tick(state.remaining, dt);
    if (!state.remaining) {
      state.phase = 'live';
      state.remaining = LIVE;
      state.exposure = 0;
      events.push('live');
    }
    return events;
  }
  // live
  if (!state.holding) state.remaining = tick(state.remaining, dt);
  state.exposure = state.inside ? Math.min(0, state.exposure + dt) : state.exposure + dt;
  if (state.exposure > EXPOSURE) {
    state.attempts++;
    state.caught = true;
    state.holding = true;
    state.recovery = RECOVERY;
    state.exposure = 0;
    events.push('caught');
    return events;
  }
  if (!state.holding && !state.remaining) {
    state.phase = 'clear';
    state.resolution = 'sheltered';
    events.push('clear');
  }
  return events;
}

export function cutBroadcast(state) {
  state.breaker = true;
  state.phase = 'clear';
  state.remaining = 0;
  state.recovery = 0;
  state.holding = false;
  state.resolution = 'cut';
  return 'cut';
}

export function crossingOpen(state) {
  return state.phase === 'clear';
}
