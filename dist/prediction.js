// The studio's seven-second prediction: an explicit state machine driven by gameplay time.
//
// idle ──examine monitor──▶ preview ──PREVIEW s──▶ countdown ──LEAD s──▶ resolved
//                                                   (deadline: where is the player?)
//
// The monitor is a CCTV feed of the room. Examining it makes the feed jump ahead: during
// `preview` the player watches their own figure walk to the microphone. Control returns in
// `countdown`, and when the deadline arrives the outcome is decided purely by where the
// player actually stands: on the tape mark ("followed") or anywhere else ("resisted").

export const PREVIEW = 4.6; // insert shot of the monitor; player input is held
export const LEAD = 7; // the picture is seven seconds ahead of the room
export const AFTERMATH = 3.2; // reaction plays out before the microphone can be taken
export const RESIST_INSERT = 2.6; // resisted: the camera cuts back in to show the figure turning
export const MARK = { x: 0.15, z: 15.9 }; // tape mark under the boom microphone
export const MARK_RADIUS = 1.4; // about half a metre at the studio's scale
// Where the player stands to watch the monitor: a step back from the desk, just left of the
// screen so the standing figure does not hide it, and about 1.4 m from the tape mark.
export const VIEW = { x: 1.3, z: 12 };

// Within the preview, the figure starts walking after a beat and arrives before the cut back.
const EPS = 1e-6; // gameplay time accumulates in floating point steps
const WALK_START = 1.2,
  WALK_END = PREVIEW - 2; // the figure then stands at the microphone until the cut

export function createPrediction() {
  return {
    phase: 'idle',
    clock: 0,
    outcome: null, // 'followed' | 'resisted'
    ready: false, // aftermath finished; the microphone can be taken
    from: { x: 0, z: 0 },
    lastTick: 0,
  };
}

export function atMark(p) {
  return Math.hypot(p.x - MARK.x, p.z - MARK.z) <= MARK_RADIUS;
}

// Begins the sequence once. Repeated interaction never restarts it.
export function startPrediction(state, player) {
  if (state.phase !== 'idle') return false;
  state.phase = 'preview';
  state.clock = 0;
  state.from.x = player.x;
  state.from.z = player.z;
  return true;
}

// The camera cuts in on the monitor (and input is held) during the preview, and again
// briefly when the player resists, so the figure turning to look at them is visible.
export function insertShot(state) {
  return (
    state.phase === 'preview' ||
    (state.phase === 'resolved' && state.outcome === 'resisted' && state.clock < RESIST_INSERT)
  );
}
export function controlHeld(state) {
  return insertShot(state);
}

export function remaining(state) {
  return state.phase === 'countdown' ? Math.max(0, LEAD - state.clock) : 0;
}

// Returns the events that happened during this step, in order. `inRoom` is false while the
// player is in another scene: leaving the studio before the deadline counts as resisting.
export function updatePrediction(state, dt, player, inRoom = true) {
  const events = [];
  if (state.phase === 'preview') {
    state.clock += dt;
    if (state.clock >= PREVIEW - EPS) {
      state.phase = 'countdown';
      state.clock = 0;
      state.lastTick = 0;
      events.push('released');
    }
  } else if (state.phase === 'countdown') {
    state.clock = Math.min(LEAD, state.clock + dt);
    if (LEAD - state.clock < EPS) state.clock = LEAD;
    const whole = Math.floor(state.clock + EPS);
    if (whole > state.lastTick && whole < LEAD) {
      state.lastTick = whole;
      events.push('tick');
    }
    if (state.clock >= LEAD) {
      state.phase = 'resolved';
      state.clock = 0;
      state.outcome = inRoom && atMark(player) ? 'followed' : 'resisted';
      events.push(state.outcome);
    }
  } else if (state.phase === 'resolved' && !state.ready) {
    state.clock += dt;
    if (state.clock >= AFTERMATH - EPS) {
      state.ready = true;
      events.push('ready');
    }
  }
  return events;
}

const ease = (t) => t * t * (3 - 2 * t);

// Writes the figure shown on the monitor into `out` without touching the real player.
// `facingTo(a, b)` converts a world-space step into the sprite facing used by the game.
// Returns false when the feed should simply show the room live.
// `stride` is the studio's walk-cycle length in world units, so the figure's legs match its pace.
export function feedFigure(state, player, out, facingTo, stride = 5) {
  out.running = false;
  out.moving = false;
  if (state.phase === 'idle' || (state.phase === 'resolved' && state.outcome === 'followed')) {
    // Live feed: the room as it is now.
    out.x = player.x;
    out.z = player.z;
    out.facing = player.facing;
    out.moving = player.moving;
    out.running = player.running;
    out.phase = player.phase;
    return false;
  }
  if (state.phase === 'preview') {
    const t = Math.min(1, Math.max(0, (state.clock - WALK_START) / (WALK_END - WALK_START))),
      k = ease(t);
    out.x = state.from.x + (MARK.x - state.from.x) * k;
    out.z = state.from.z + (MARK.z - state.from.z) * k;
    out.moving = t > 0 && t < 1;
    out.phase = Math.hypot(out.x - state.from.x, out.z - state.from.z) / stride;
    out.facing = out.moving ? facingTo(state.from, MARK) : FACING_DESK;
    return true;
  }
  out.x = MARK.x;
  out.z = MARK.z;
  out.phase = 0;
  // Resisted: the figure that kept the appointment turns to look into the camera.
  out.facing = state.phase === 'resolved' && state.clock > 1.1 ? FACING_CAMERA : FACING_DESK;
  return true;
}

export const FACING_DESK = 0; // back to the camera, facing the boom microphone
export const FACING_CAMERA = Math.PI; // facing out of the screen
