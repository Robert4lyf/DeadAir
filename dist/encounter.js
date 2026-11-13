// A finite, readable encounter. Pause and inspection never advance its clock.
export function createBroadcast() {
  return {
    phase: 'dormant',
    remaining: 0,
    elapsed: 0,
    attempts: 0,
    breaker: false,
    inside: false,
    warned: false,
  };
}
export function inShelter(player) {
  return player.x >= 0.65 && player.x <= 2.35 && player.z >= 11.1 && player.z <= 16.1;
}
export function updateBroadcast(state, dt, player, scene) {
  const events = [];
  if (scene !== 0 || state.phase === 'clear') return events;
  state.inside = inShelter(player);
  if (state.phase === 'dormant' && player.z >= 13.2) {
    state.phase = 'warning';
    state.remaining = 4.5;
    state.warned = true;
    events.push('warning');
    return events;
  }
  if (state.phase === 'warning') {
    state.remaining = Math.max(0, state.remaining - dt);
    if (!state.remaining) {
      state.phase = 'live';
      state.remaining = 8;
      state.elapsed = 0;
      events.push('live');
    }
    return events;
  }
  if (state.phase === 'live') {
    state.remaining = Math.max(0, state.remaining - dt);
    state.elapsed += dt;
    if (!state.inside && state.elapsed > 0.55) {
      state.attempts++;
      state.elapsed = -1.5;
      events.push('caught');
    }
    if (!state.remaining) {
      state.phase = 'clear';
      events.push('clear');
    }
  }
  return events;
}
export function cutBroadcast(state) {
  state.breaker = true;
  state.phase = 'clear';
  state.remaining = 0;
  return 'cut';
}
export function crossingOpen(state) {
  return state.phase === 'clear';
}
