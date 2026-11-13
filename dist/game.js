import {
  project,
  screenPoint,
  groundPoint,
  blocked,
  route,
  scenes,
  interactables,
} from './navigation.js';
import {
  createBroadcast,
  updateBroadcast,
  cutBroadcast,
  crossingOpen,
  inShelter,
  recovering,
  RECOVERY,
} from './encounter.js';
import { SpriteActor, turnToward } from './sprites.js';
import {
  createPrediction,
  startPrediction,
  updatePrediction,
  controlHeld,
  insertShot,
  remaining as predictionRemaining,
  feedFigure,
  atMark,
  MARK,
  PREVIEW,
  LEAD,
  RESIST_INSERT,
} from './prediction.js';
const elements = new Map(),
  $ = (s) => {
    if (!elements.has(s)) elements.set(s, document.querySelector(s));
    return elements.get(s);
  },
  canvas = $('#scene'),
  ctx = canvas.getContext('2d', { alpha: false }),
  frame = $('#frame'),
  reduced = matchMedia('(prefers-reduced-motion: reduce)').matches,
  touch = matchMedia('(pointer:coarse)').matches;
let W = 1280,
  H = 720,
  assets = {},
  actor,
  ready = false,
  mode = 'title',
  sceneIndex = 0,
  time = 0,
  elapsed = 0,
  keys = new Set(),
  path = [],
  queuedAction = null,
  interaction = null,
  hovered = null,
  torch = true,
  muted = false,
  marker = null,
  transitionClock = 0,
  transitionTarget = 1,
  transitionFrom = 0,
  transitionApplied = false,
  statusUntil = 0,
  skipAt = -10, // when the last picture skip (broadcast catch) began
  feedTearUntil = 0,
  arrivalGuard = null; // the exit just used; it gets no prompt until the player steps away
let player = makePlayer(scenes[0].spawn),
  broadcast = createBroadcast(),
  facts = { notice: false, intercom: false, breaker: false, monitor: false },
  prediction = createPrediction();
// The figure on the studio monitor. Reused every frame and never aliased to the real player.
const feedActor = makePlayer({ x: 0, z: 0 });
// Per-frame HUD updates only touch the DOM when a value actually changes.
function setText(selector, text) {
  const el = $(selector);
  if (el.textContent !== text) el.textContent = text;
}
function setHidden(selector, hidden) {
  const el = $(selector);
  if (el.hidden !== hidden) el.hidden = hidden;
}
// Dialogs take focus when they open, keep Tab inside, and hand focus back on close.
const dialogs = ['#modal', '#decision', '#ending', '#error'];
let dialogReturn = null;
function openDialog(selector) {
  const el = $(selector);
  if (!el.hidden) return;
  dialogReturn = document.activeElement;
  el.hidden = false;
  el.querySelector('button')?.focus();
}
function closeDialog(selector) {
  const el = $(selector);
  if (el.hidden) return;
  el.hidden = true;
  if (dialogReturn?.isConnected && !dialogReturn.closest('[hidden]')) dialogReturn.focus();
  dialogReturn = null;
}
function trapFocus(e) {
  const open = dialogs.map($).find((el) => !el.hidden);
  if (!open) return;
  const buttons = [...open.querySelectorAll('button')],
    first = buttons[0],
    last = buttons[buttons.length - 1];
  if (!buttons.includes(document.activeElement)) {
    e.preventDefault();
    first.focus();
  } else if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
function makePlayer(p, facing = 0) {
  return { x: p.x, z: p.z, facing, desiredFacing: facing, phase: 0, moving: false, running: false };
}
function resize() {
  let r = frame.getBoundingClientRect(),
    scale = Math.min(devicePixelRatio || 1, 1.5);
  W = Math.round(r.width * scale);
  H = Math.round(r.height * scale);
  canvas.width = W;
  canvas.height = H;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
}
addEventListener('resize', resize);
resize();
function loadImage(src) {
  return new Promise((resolve, reject) => {
    let image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}
async function load() {
  try {
    closeDialog('#error');
    $('#loading').hidden = false;
    const names = ['street', 'plaza', 'studio', 'idle', 'walk', 'run'];
    let images = await Promise.all(names.map((n) => loadImage('./art/' + n + '.webp')));
    names.forEach((n, i) => (assets[n] = images[i]));
    actor = new SpriteActor({ idle: assets.idle, walk: assets.walk, run: assets.run });
    ready = true;
    $('#loading').hidden = true;
    $('#start').disabled = false;
    $('#start').innerHTML = 'ENTER THE CITY <span>↗</span>';
  } catch (error) {
    console.error('Picture loading failed', error);
    $('#loading').hidden = true;
    openDialog('#error');
  }
}
$('#retry').onclick = load;
load();
let audio, master, rainGain, humGain, noiseBuffer;
function makeAudio() {
  try {
    if (audio) {
      audio.resume();
      return;
    }
    audio = new (window.AudioContext || window.webkitAudioContext)();
    master = audio.createGain();
    master.gain.value = muted ? 0 : 0.42;
    master.connect(audio.destination);
    noiseBuffer = audio.createBuffer(1, audio.sampleRate * 4, audio.sampleRate);
    let a = noiseBuffer.getChannelData(0);
    for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1;
    let n = audio.createBufferSource(),
      f = audio.createBiquadFilter();
    n.buffer = noiseBuffer;
    n.loop = true;
    f.type = 'lowpass';
    f.frequency.value = 2000;
    rainGain = audio.createGain();
    rainGain.gain.value = 0.11;
    n.connect(f).connect(rainGain).connect(master);
    n.start();
    let o = audio.createOscillator();
    o.frequency.value = 48;
    humGain = audio.createGain();
    humGain.gain.value = 0.04;
    o.connect(humGain).connect(master);
    o.start();
  } catch {
    audio = null;
  }
}
function note(freq, duration = 0.15, gain = 0.07, type = 'sine') {
  if (!audio) return;
  let o = audio.createOscillator(),
    g = audio.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
  o.connect(g).connect(master);
  o.start();
  o.stop(audio.currentTime + duration);
}
function noise(gain = 0.08, duration = 0.5, pan = 0, freq = 900) {
  if (!audio) return;
  let n = audio.createBufferSource(),
    f = audio.createBiquadFilter(),
    g = audio.createGain(),
    p = audio.createStereoPanner();
  n.buffer = noiseBuffer;
  f.type = 'lowpass';
  f.frequency.value = freq;
  p.pan.value = pan;
  g.gain.setValueAtTime(gain, audio.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
  n.connect(f).connect(g).connect(p).connect(master);
  n.start();
  n.stop(audio.currentTime + duration);
}
// Subtitles: lower-priority lines wait their turn instead of being dropped, and text the
// player asked for (by interacting) always shows at once. Important lines it interrupts resume.
let subtitle = null;
const subtitleQueue = [];
function showSubtitle(entry) {
  subtitle = entry;
  entry.until = time + entry.seconds;
  setText('#subtitle', entry.text);
}
function say(text, seconds = 5, priority = 1, requested = false) {
  const entry = { text, seconds, priority, until: 0, expires: time + seconds + 6 },
    active = subtitle && time < subtitle.until;
  if (active && subtitle.text === text) return;
  if (!active || requested || priority >= subtitle.priority) {
    if (active && subtitle.priority >= 3 && subtitle.priority > priority) {
      subtitle.seconds = Math.max(1.5, subtitle.until - time);
      subtitle.expires = time + subtitle.seconds + 6;
      subtitleQueue.unshift(subtitle);
    }
    showSubtitle(entry);
  } else {
    subtitleQueue.push(entry);
    if (subtitleQueue.length > 3) subtitleQueue.shift();
  }
}
// Text that answers a player's own action.
function tell(text, seconds = 5, priority = 2) {
  say(text, seconds, priority, true);
}
function advanceSubtitles() {
  if (!subtitle || time < subtitle.until) return;
  subtitle = null;
  while (subtitleQueue.length) {
    const next = subtitleQueue.shift();
    if (time < next.expires) return showSubtitle(next);
  }
  setText('#subtitle', '');
}
function status(text, seconds = 2) {
  $('#status').textContent = text;
  statusUntil = time + seconds;
}
function setChapter() {
  $('#chapterNum').textContent = '0' + (sceneIndex + 1);
  $('#district').textContent = scenes[sceneIndex].district;
  $('#location').textContent = scenes[sceneIndex].name;
  updateObjective();
}
function updateObjective() {
  const studio = sceneIndex === 2,
    ahead = prediction.phase === 'preview' || prediction.phase === 'countdown';
  setText('#objectiveLead', studio ? 'STUDIO' : 'REACH');
  setText(
    '#objectiveTitle',
    !studio
      ? 'STUDIO 001'
      : prediction.phase === 'idle'
        ? 'THE MONITOR'
        : ahead
          ? 'THE TAPE MARK'
          : 'THE MICROPHONE',
  );
  setText(
    '#distance',
    studio
      ? prediction.phase === 'idle'
        ? 'LOOK AT THE LIVE PICTURE'
        : ahead
          ? 'THE PICTURE IS SEVEN SECONDS AHEAD'
          : prediction.outcome === 'followed'
            ? 'THE PICTURE HAS CAUGHT UP'
            : 'THE OTHER YOU IS STILL ON THE MONITOR'
      : sceneIndex === 1
        ? 'CYAN DOORS / STUDIO 001'
        : crossingOpen(broadcast)
          ? 'CROSSING OPEN / FOLLOW THE TOWER'
          : broadcast.phase === 'dormant'
            ? 'FOLLOW THE TOWER / INSPECT THE STREET'
            : broadcast.holding
              ? 'THE TOWER IS HOLDING ON YOU / CUT THE SERVICE FEED'
              : 'FIND COVER OR CUT THE SERVICE FEED',
  );
}
function enter() {
  if (!ready) return;
  makeAudio();
  mode = 'play';
  $('#title').hidden = true;
  $('#hud').hidden = false;
  $('#touch').hidden = !touch;
  setChapter();
  say('Find the crossing at the end of the street. The studio is still on air.', 6);
}
function pause(show = true) {
  if (!['play', 'pause'].includes(mode)) return;
  mode = show ? 'pause' : 'play';
  keys.clear();
  if (show) openDialog('#modal');
  else closeDialog('#modal');
  if (audio) master.gain.setTargetAtTime(show || muted ? 0 : 0.42, audio.currentTime, 0.1);
}
function changeScene(next) {
  mode = 'transition';
  transitionTarget = next;
  transitionFrom = sceneIndex;
  transitionApplied = false;
  transitionClock = 0;
  path = [];
  queuedAction = null;
  hovered = null;
  $('#hoverHint').textContent = '';
  $('#interaction').hidden = true;
  $('#fade').style.opacity = '1';
  noise(0.04, 0.4, 0);
}
function applyTransition() {
  sceneIndex = transitionTarget;
  let spawn =
    sceneIndex === 0
      ? { x: 0, z: 22.1 }
      : sceneIndex === 1 && transitionFrom === 2
        ? { x: 0, z: 24 }
        : scenes[sceneIndex].spawn;
  let p = screenPoint(scenes[sceneIndex], spawn.x, spawn.z),
    q = screenPoint(scenes[sceneIndex], spawn.x, spawn.z + (transitionFrom > sceneIndex ? -1 : 1));
  player = makePlayer(spawn, Math.atan2(q.u - p.u, -(q.v - p.v)));
  arrivalGuard =
    sceneIndex === 0
      ? 'crossing'
      : sceneIndex === 2
        ? 'backPlaza'
        : transitionFrom === 2
          ? 'doors'
          : 'backStreet';
  setChapter();
  if (audio) {
    rainGain.gain.setTargetAtTime(sceneIndex === 2 ? 0.012 : 0.11, audio.currentTime, 0.8);
    humGain.gain.setTargetAtTime(
      sceneIndex === 2 ? 0.045 : sceneIndex === 1 ? 0.085 : 0.04,
      audio.currentTime,
      0.8,
    );
  }
}
function nearby() {
  let best = null,
    distance = 2;
  for (let o of interactables) {
    if (o.scene !== sceneIndex) continue;
    let d = Math.hypot(player.x - o.x, player.z - o.z);
    if (o.id === arrivalGuard) {
      if (d < o.reach) continue;
      arrivalGuard = null;
    }
    if (d < o.reach && d < distance) {
      distance = d;
      best = o;
    }
  }
  return best;
}
function label(o) {
  if (o.id === 'breaker' && facts.breaker) return 'Service feed isolated';
  if (o.id === 'crossing' && !crossingOpen(broadcast)) return 'Crossing signal red';
  if (o.id === 'monitor')
    return prediction.phase === 'idle' || prediction.phase === 'resolved'
      ? 'Watch the studio monitor'
      : 'The picture is ahead of you';
  if (o.id === 'microphone')
    return prediction.ready
      ? 'Take the microphone'
      : prediction.phase === 'countdown'
        ? 'Step up to the microphone'
        : 'The boom microphone';
  return o.label;
}
function interact(id = interaction?.id) {
  if (mode !== 'play' || !id || controlLocked()) return false;
  let object = interactables.find((o) => o.id === id);
  if (
    !object ||
    object.scene !== sceneIndex ||
    Math.hypot(player.x - object.x, player.z - object.z) > object.reach + 0.08
  )
    return false;
  if (id === 'notice') {
    facts.notice = true;
    tell(
      'CURFEW NOTICE: During live transmission, shelter beneath the shop awnings. Service breakers isolate the signal.',
      8,
    );
    noise(0.02, 0.2, 0.6);
  } else if (id === 'intercom') {
    facts.intercom = true;
    tell('INTERCOM: “At the crossing, you will run. You will not reach the light.”', 7);
    noise(0.11, 1.5, 0.65, 1300);
  } else if (id === 'breaker') {
    if (!facts.breaker) {
      facts.breaker = true;
      cutBroadcast(broadcast);
      path = [];
      queuedAction = null;
      noise(0.12, 0.35, 0.7, 220);
      if (audio) humGain.gain.setTargetAtTime(0.008, audio.currentTime, 0.3);
      tell(
        broadcast.caught
          ? 'You pull the breaker. The transmission drops mid-word, but the red lamp stays lit. Somewhere, the tower kept your picture.'
          : 'You pull the breaker. The speaker dies mid-word and the street lamp goes out. The crossing unlocks.',
        7,
        5,
      );
    } else tell('The breaker is off. The crossing is open.');
  } else if (id === 'crossing') {
    if (!crossingOpen(broadcast)) {
      tell(
        broadcast.phase === 'dormant'
          ? 'The crossing is locked to the broadcast. Look for the service breaker.'
          : 'The crossing is locked while the tower transmits. Shelter under the awning or cut the service feed.',
        6,
        3,
      );
      return false;
    }
    changeScene(1);
  } else if (id === 'backStreet') changeScene(0);
  else if (id === 'doors') changeScene(2);
  else if (id === 'backPlaza') changeScene(1);
  else if (id === 'monitor') {
    if (startPrediction(prediction, player)) {
      facts.monitor = true;
      keys.clear();
      path = [];
      queuedAction = null;
      player.moving = false;
      noise(0.065, 1.2, -0.3, 1800);
      tell(
        'The picture jumps. On the monitor, the studio is seven seconds ahead of you.',
        PREVIEW,
        4,
      );
    } else if (prediction.phase === 'countdown')
      tell('On the monitor, you are already standing at the microphone.', 3);
    else if (prediction.phase === 'resolved')
      tell(
        prediction.outcome === 'followed'
          ? 'The picture and the room agree now. There is no delay.'
          : 'On the monitor, you are still at the microphone, looking out at yourself.',
        4,
      );
  } else if (id === 'microphone') {
    if (prediction.ready) {
      mode = 'choice';
      keys.clear();
      path = [];
      $('#decisionText').textContent =
        prediction.outcome === 'followed'
          ? 'The monitor and the room agree. Your hand is already on the microphone.'
          : 'On the monitor, the other you is still at the microphone, waiting to hear what you will do.';
      openDialog('#decision');
    } else if (prediction.phase === 'idle')
      tell('The microphone is cold. On the monitor, the room is moving.', 4);
    else if (prediction.phase === 'countdown') {
      // Step the last half-metre onto the tape, so the room matches the picture.
      if (!atMark(player) || Math.hypot(player.x - MARK.x, player.z - MARK.z) > 0.2)
        path = route(scenes[2], player, MARK);
      tell(
        'You step onto the tape mark and reach for the microphone. On the monitor, you already have.',
        3,
      );
    } else if (prediction.phase === 'resolved') tell('The picture is still settling.', 2);
  }
  updateObjective();
  return true;
}
function finish(choice) {
  mode = 'end';
  closeDialog('#decision');
  $('#hud').hidden = true;
  $('#touch').hidden = true;
  openDialog('#ending');
  $('#endLine').textContent =
    choice === 'speak'
      ? 'The speakers answer before your lips move. Your voice: “You never left the studio.”'
      : 'You say nothing. The microphone speaks in your voice. “Good. You remember this time.”';
  note(144, 2, 0.07);
  noise(0.04, 1, 0, 600);
}
function toggleTorch() {
  torch = !torch;
  status(torch ? 'TORCH ON' : 'TORCH OFF');
  note(180, 0.04, 0.035);
}
$('#start').onclick = enter;
$('#resume').onclick = () => {
  if (mode === 'pause') pause(false);
  else closeDialog('#modal');
};
$('#help').onclick = () => {
  if (mode === 'play') pause(true);
  else if (mode === 'title') openDialog('#modal');
};
$('#sound').onclick = () => {
  muted = !muted;
  $('#sound').textContent = muted ? 'SOUND OFF' : 'SOUND ON';
  $('#sound').setAttribute('aria-pressed', String(!muted));
  if (audio)
    master.gain.setTargetAtTime(muted || mode === 'pause' ? 0 : 0.42, audio.currentTime, 0.1);
};
$('#restart').onclick = () => location.reload();
$('#touchAction').onclick = () => interact();
$('#touchTorch').onclick = toggleTorch;
$('#speak').onclick = () => finish('speak');
$('#silence').onclick = () => finish('silence');
const gameKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
// Outside play, keys keep their normal meaning so Space and Enter activate focused buttons.
const playing = () => mode === 'play' || mode === 'transition';
addEventListener('keydown', (e) => {
  if (e.key === 'Tab') trapFocus(e);
  if (playing() && gameKeys.includes(e.code)) e.preventDefault();
  if (e.code === 'Escape' && !e.repeat) {
    if (mode === 'title') closeDialog('#modal');
    else pause(mode !== 'pause');
    return;
  }
  if (!playing()) return;
  if (
    [
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'ShiftLeft',
      'ShiftRight',
    ].includes(e.code)
  )
    keys.add(e.code);
  if (e.repeat || mode !== 'play') return;
  if (e.code === 'KeyE' || e.code === 'Space') interact();
  if (e.code === 'KeyF') toggleTorch();
});
addEventListener('keyup', (e) => {
  keys.delete(e.code);
  // Space activates a focused button on keyup; during play it means Interact instead.
  if (playing() && e.code === 'Space') e.preventDefault();
});
addEventListener('blur', () => {
  keys.clear();
  if (mode === 'play') pause(true);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'play') pause(true);
});
function pointer(e) {
  let r = canvas.getBoundingClientRect();
  return { u: (e.clientX - r.left) / r.width, v: (e.clientY - r.top) / r.height };
}
function objectAt(u, v) {
  return interactables.find(
    (o) =>
      o.scene === sceneIndex &&
      o.rect &&
      u >= o.rect[0] &&
      u <= o.rect[2] &&
      v >= o.rect[1] &&
      v <= o.rect[3],
  );
}
canvas.addEventListener('pointermove', (e) => {
  if (mode !== 'play') return;
  let { u, v } = pointer(e),
    o = objectAt(u, v),
    p = groundPoint(scenes[sceneIndex], u, v);
  hovered = o?.id ?? null;
  canvas.className = o
    ? 'interact-cursor'
    : p && !blocked(scenes[sceneIndex], p.x, p.z)
      ? 'walk-cursor'
      : 'blocked-cursor';
  $('#hoverHint').textContent = o && o.id !== interaction?.id ? label(o) : '';
});
canvas.addEventListener('pointerleave', () => {
  hovered = null;
  $('#hoverHint').textContent = '';
});
canvas.addEventListener('pointerdown', (e) => {
  if (mode !== 'play' || controlLocked()) return;
  let { u, v } = pointer(e),
    o = objectAt(u, v),
    s = scenes[sceneIndex],
    p = o ? { x: o.x, z: o.z } : groundPoint(s, u, v);
  if (!p || blocked(s, p.x, p.z)) {
    marker = { u, v, t: time, bad: true };
    status('NO CLEAR PATH');
    return;
  }
  let next = route(s, player, p);
  if (!next.length) {
    marker = { u, v, t: time, bad: true };
    status('NO CLEAR PATH');
    return;
  }
  path = next;
  queuedAction = o?.id ?? null;
  marker = { u, v, t: time, bad: false };
});
function move(dx, dz, dt) {
  const old = screenPoint(scenes[sceneIndex], player.x, player.z),
    start = { x: player.x, z: player.z },
    s = scenes[sceneIndex];
  if (!blocked(s, player.x + dx, player.z)) player.x += dx;
  if (!blocked(s, player.x, player.z + dz)) player.z += dz;
  const p = screenPoint(s, player.x, player.z),
    distance = Math.hypot(player.x - start.x, player.z - start.z);
  player.moving = distance > 0.0001;
  if (player.moving) {
    player.desiredFacing = Math.atan2(p.u - old.u, -(p.v - old.v));
    let previous = player.phase;
    player.phase += distance / (player.running ? 1.8 : 1.3);
    if (Math.floor(previous * 2) !== Math.floor(player.phase * 2)) {
      noise(
        sceneIndex === 2 ? 0.035 : 0.06,
        0.1,
        Math.floor(player.phase * 2) % 2 ? 0.07 : -0.07,
        sceneIndex === 2 ? 450 : 800,
      );
      note(sceneIndex === 2 ? 83 : 65, 0.06, 0.025, 'triangle');
    }
  }
  player.facing = turnToward(player.facing, player.desiredFacing, dt);
}
function encounterEvent(event) {
  if (event === 'warning') {
    say(
      'The lamps begin to hum. Shelter beneath the right-hand awning, or cut the service feed ahead.',
      7,
      4,
    );
    noise(0.13, 1.5, 0.6, 1200);
    path = [];
    queuedAction = null;
  } else if (event === 'live') {
    say('ON AIR. Stay beneath the awning. The open crossing is listening.', 4, 4);
    note(54, 0.8, 0.12, 'sawtooth');
  } else if (event === 'caught') {
    // The picture skips: input is held while the frame rolls, and the player lands in shelter.
    player.x = 1.4;
    player.z = 13.3;
    player.moving = false;
    keys.clear();
    path = [];
    queuedAction = null;
    skipAt = time;
    say('The picture skips.', RECOVERY, 5);
    noise(0.16, 0.6, 0, 1200);
    note(110, RECOVERY, 0.06, 'sawtooth');
  } else if (event === 'recovered') {
    say(
      broadcast.attempts > 1
        ? 'Back under the awning again. The tower is holding on you. The breaker is at the far end of this awning.'
        : 'You are back under the awning, and the street lamp has turned red. The tower has your picture now; it will not pass on its own. Cut the service feed: the breaker is at the far end of this awning.',
      9,
      5,
    );
  } else if (event === 'clear') {
    say(
      'The transmission passes over the awning. The speaker clicks: “Thank you for listening.” The crossing signal changes.',
      6,
      4,
    );
    note(392, 0.3, 0.04);
    note(294, 0.5, 0.035);
  }
  updateObjective();
}
// While a sequence holds the player (the monitor insert shot), input is ignored.
function controlLocked() {
  return (
    (sceneIndex === 2 && controlHeld(prediction)) || (sceneIndex === 0 && recovering(broadcast))
  );
}
function predictionEvent(event) {
  const here = sceneIndex === 2;
  if (event === 'released') {
    say(
      'The picture is seven seconds ahead. On it, you are standing on the tape mark at the microphone. Go to it, or stay where you are.',
      LEAD,
      5,
    );
    noise(0.05, 0.25, 0.3, 2400);
  } else if (event === 'tick') {
    note(620 + prediction.lastTick * 45, 0.05, 0.05, 'square');
  } else if (event === 'followed') {
    say(
      'The picture catches up with you. On the monitor and in the room, your hand is on the microphone.',
      6,
      5,
    );
    for (const f of [220, 277, 330]) note(f, 2.6, 0.04);
  } else if (event === 'resisted') {
    say(
      here
        ? 'You stay where you are. On the monitor, you take the microphone anyway. Then the figure on the screen turns and looks at you.'
        : 'Behind you, in Studio 001, a microphone switches on without you.',
      7,
      5,
    );
    noise(0.14, 1.1, -0.3, 3200);
    note(49, 2.5, 0.08, 'sawtooth');
    feedTearUntil = time + 1.2;
  } else if (event === 'ready' && here) {
    say(
      prediction.outcome === 'followed'
        ? 'The microphone is live. It is waiting for you.'
        : 'The microphone is waiting for you.',
      5,
      2,
    );
  }
  updateObjective();
}
function update(dt) {
  if (mode === 'transition') {
    transitionClock += dt;
    if (transitionClock >= 0.35 && !transitionApplied) {
      transitionApplied = true;
      applyTransition();
    }
    if (transitionClock >= 0.72) {
      $('#fade').style.opacity = '0';
      mode = 'play';
      say(
        sceneIndex === 2
          ? 'The door closes behind you. An empty studio. A live picture.'
          : sceneIndex === 1
            ? 'The studio doors are lit. The rain sounds further away.'
            : 'The awning is still dark.',
        5,
        1,
      );
    }
    return;
  }
  if (mode !== 'play') return;
  time += dt;
  advanceSubtitles();
  if (time > statusUntil)
    setText(
      '#status',
      sceneIndex === 2
        ? 'STUDIO / LIVE'
        : broadcast.holding
          ? 'HOLDING'
          : broadcast.phase === 'live'
            ? 'TRANSMITTING'
            : 'SIGNAL DETECTED',
    );
  const locked = controlLocked();
  if (locked) {
    path = [];
    queuedAction = null;
  }
  player.running = !locked && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
  let speed = player.running ? 3.9 : 2.35,
    mx = locked
      ? 0
      : (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
        (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
    my = locked
      ? 0
      : (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
        (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
  player.moving = false;
  if (queuedAction && !mx && !my) {
    let object = interactables.find((o) => o.id === queuedAction);
    if (object && Math.hypot(player.x - object.x, player.z - object.z) < object.reach * 0.85) {
      let action = queuedAction;
      queuedAction = null;
      path = [];
      interact(action);
      if (mode !== 'play') return;
    }
  }
  if (mx || my) {
    path = [];
    queuedAction = null;
    let s = scenes[sceneIndex],
      p = screenPoint(s, player.x, player.z),
      x = screenPoint(s, player.x + 0.01, player.z),
      z = screenPoint(s, player.x, player.z + 0.01),
      a = (x.u - p.u) / 0.01,
      b = (z.u - p.u) / 0.01,
      c = (x.v - p.v) / 0.01,
      d = (z.v - p.v) / 0.01,
      q = a * d - b * c;
    if (Math.abs(q) > 1e-10) {
      let dx = (mx * d - b * my) / q,
        dz = (a * my - mx * c) / q,
        l = Math.hypot(dx, dz);
      move((dx / l) * speed * dt, (dz / l) * speed * dt, dt);
    }
  } else if (path.length) {
    let p = path[0],
      dx = p.x - player.x,
      dz = p.z - player.z,
      d = Math.hypot(dx, dz);
    if (d < 0.08) {
      path.shift();
      if (!path.length && queuedAction) {
        let action = queuedAction;
        queuedAction = null;
        interact(action);
      }
    } else move((dx / d) * Math.min(d, speed * dt), (dz / d) * Math.min(d, speed * dt), dt);
  } else player.facing = turnToward(player.facing, player.desiredFacing, dt);
  for (let event of updateBroadcast(broadcast, dt, player, sceneIndex)) encounterEvent(event);
  for (const event of updatePrediction(prediction, dt, player, sceneIndex === 2))
    predictionEvent(event);
  if (mode !== 'play') return;
  interaction = controlLocked() ? null : nearby();
  let hoverObject = interactables.find((o) => o.id === hovered && o.scene === sceneIndex);
  setText(
    '#hoverHint',
    hoverObject && hoverObject.id !== interaction?.id ? label(hoverObject) : '',
  );
  setHidden('#interaction', !interaction);
  if (interaction) setText('#interaction span', label(interaction));
  let danger = sceneIndex === 0 && ['warning', 'live'].includes(broadcast.phase),
    forecast = sceneIndex === 2 && prediction.phase === 'countdown';
  setHidden('#broadcastPanel', !danger && !forecast);
  if (forecast) {
    setText(
      '#broadcastTimer',
      'SEVEN SECONDS AHEAD / ' + Math.ceil(predictionRemaining(prediction)),
    );
    setText(
      '#broadcastHelp',
      atMark(player) ? 'YOU ARE ON THE TAPE MARK' : 'THE MONITOR SHOWS YOU AT THE MICROPHONE',
    );
  } else if (danger) {
    setText(
      '#broadcastTimer',
      broadcast.phase === 'warning'
        ? 'TRANSMISSION IN ' + Math.ceil(broadcast.remaining)
        : broadcast.holding
          ? 'ON AIR / HOLDING ON YOU'
          : 'ON AIR / ' + Math.ceil(broadcast.remaining),
    );
    setText(
      '#broadcastHelp',
      broadcast.holding
        ? 'CUT THE FEED: BREAKER AT THE END OF THIS AWNING'
        : inShelter(player)
          ? 'IN SHADOW / STAY HERE'
          : 'RIGHT-HAND AWNING OR SERVICE BREAKER',
    );
  }
  updateObjective();
}
function polygon(points) {
  ctx.beginPath();
  for (let i = 0; i < points.length; i++) {
    let [x, y] = points[i];
    i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H);
  }
  ctx.closePath();
}
function groundClip(s) {
  if (s.id === 'plaza')
    polygon([
      [0.22, 1.05],
      [0.91, 1.05],
      [0.85, 0.675],
      [0.82, 0.572],
      [0.64, 0.572],
      [0.42, 0.675],
    ]);
  else polygon(s.floor);
  ctx.clip();
}
function softLight(u, v, r, color, strength = 1) {
  let gradient = ctx.createRadialGradient(u * W, v * H, 0, u * W, v * H, r * H);
  gradient.addColorStop(0, `rgba(${color},${strength})`);
  gradient.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(u * W - r * H, v * H - r * H, r * H * 2, r * H * 2);
}
function lightingTone(s, p) {
  if (s.id === 'studio') return p.u > 0.57 ? 'warm' : 'shadow';
  if (s.id === 'plaza') return player.z > 17 ? 'cool' : player.x < -3 ? 'warm' : 'neutral';
  if (inShelter(player)) return 'shadow';
  if (player.z < 8) return 'warm';
  return player.z > 19 ? 'cool' : 'neutral';
}
function drawActor() {
  let s = scenes[sceneIndex],
    p = screenPoint(s, player.x, player.z),
    depth = project(s.h, player.x, player.z).d,
    height = (s.nearHeight * H) / depth,
    tone = lightingTone(s, p);
  ctx.save();
  groundClip(s);
  if (s.id !== 'studio')
    actor.draw(ctx, player, p.u * W, p.v * H, height, tone, time, { reflection: true });
  ctx.restore();
  // A tight contact shadow stays with the boots, separate from the wet reflection.
  ctx.save();
  ctx.translate(p.u * W, p.v * H);
  ctx.scale(1, 0.25);
  let r = height * 0.17,
    g = ctx.createRadialGradient(0, 0, 1, 0, 0, r);
  g.addColorStop(0, 'rgba(0,0,0,.68)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
  if (torch) {
    let dx = Math.sin(player.facing),
      dy = -Math.cos(player.facing);
    ctx.save();
    groundClip(s);
    ctx.globalCompositeOperation = 'screen';
    let x = p.u * W,
      y = p.v * H,
      endX = x + dx * height * 1.2,
      endY = y + dy * height * 0.45,
      g = ctx.createRadialGradient(endX, endY, 1, endX, endY, height * 0.55);
    g.addColorStop(0, 'rgba(233,218,170,.13)');
    g.addColorStop(1, 'rgba(233,218,170,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y - height * 0.12);
    ctx.lineTo(endX - dy * height * 0.35, endY + dx * height * 0.15);
    ctx.lineTo(endX + dy * height * 0.35, endY - dx * height * 0.15);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  actor.draw(ctx, player, p.u * W, p.v * H, height, tone, time);
  for (let mask of s.masks || []) {
    if (p.v > mask.depth) continue;
    ctx.save();
    polygon(mask.polygon);
    ctx.clip();
    ctx.drawImage(assets[s.id], 0, 0, W, H);
    ctx.restore();
  }
}
function panel(u, v, w, h, { breaker = false } = {}) {
  let x = u * W,
    y = v * H,
    bw = w * W,
    bh = h * H;
  ctx.fillStyle = '#101415';
  ctx.fillRect(x + 2, y + 2, bw, bh);
  ctx.fillStyle = breaker ? '#494136' : '#3b423f';
  ctx.fillRect(x, y, bw, bh);
  ctx.strokeStyle = '#73756c';
  ctx.lineWidth = Math.max(1, W / 1600);
  ctx.strokeRect(x, y, bw, bh);
  ctx.fillStyle = '#898779';
  for (let sx of [0.1, 0.88])
    for (let sy of [0.08, 0.9])
      ctx.fillRect(x + bw * sx, y + bh * sy, Math.max(0.6, bw * 0.025), Math.max(0.6, bh * 0.025));
  ctx.fillStyle = '#0a1110';
  ctx.fillRect(x + bw * 0.12, y + bh * 0.16, bw * 0.76, bh * 0.43);
  if (breaker) {
    ctx.fillStyle = facts.breaker ? '#5c9d81' : '#b9915b';
    ctx.fillRect(x + bw * 0.32, y + bh * 0.27, bw * 0.36, bh * 0.17);
    ctx.fillStyle = '#b9b3a0';
    ctx.fillRect(x + bw * 0.41, y + bh * (facts.breaker ? 0.68 : 0.55), bw * 0.18, bh * 0.19);
  } else {
    ctx.fillStyle = '#78978b';
    for (let i = 0; i < 7; i++)
      ctx.fillRect(
        x + bw * 0.18,
        y + bh * (0.24 + i * 0.035),
        bw * (0.3 + Math.sin(time * 13 + i) * 0.13),
        Math.max(1, bh * 0.012),
      );
    ctx.fillStyle = '#aba79a';
    ctx.fillRect(x + bw * 0.2, y + bh * 0.72, bw * 0.2, bh * 0.07);
    ctx.fillRect(x + bw * 0.61, y + bh * 0.72, bw * 0.2, bh * 0.07);
  }
}
function drawStreetProps() {
  panel(0.698, 0.67, 0.022, 0.038);
  panel(0.657, 0.604, 0.02, 0.034, { breaker: true });
  let gateOpen = crossingOpen(broadcast);
  ctx.fillStyle = gateOpen ? '#99c3a6' : '#bb6552';
  ctx.fillRect(0.603 * W, 0.575 * H, 0.004 * W, 0.008 * H);
  ctx.fillStyle = '#17211e';
  ctx.fillRect(0.604 * W, 0.582 * H, 0.0014 * W, 0.045 * H);
  if (!gateOpen) {
    ctx.strokeStyle = '#5b655d';
    ctx.lineWidth = Math.max(1, W * 0.001);
    ctx.beginPath();
    ctx.moveTo(0.582 * W, 0.623 * H);
    ctx.lineTo(0.643 * W, 0.623 * H);
    ctx.stroke();
  }
  // The street lamp records how the broadcast ended: red if it caught the player (for the
  // rest of the game), dark if the feed was cut, humming while the transmission runs.
  if (broadcast.caught) {
    // Multiply first so the near-white lamp actually turns red, then let it glow.
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    softLight(0.402, 0.392, 0.05, '255,52,40', 1);
    ctx.globalCompositeOperation = 'screen';
    softLight(0.402, 0.392, 0.028, '255,40,24', reduced ? 0.55 : 0.45 + Math.sin(time * 1.3) * 0.1);
    softLight(0.4, 0.46, 0.13, '200,40,24', 0.09);
    ctx.restore();
  } else if (broadcast.resolution === 'cut') {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    softLight(0.402, 0.392, 0.055, '22,25,30', 0.92);
    softLight(0.4, 0.46, 0.12, '60,64,72', 0.5);
    ctx.restore();
  }
  if (['warning', 'live'].includes(broadcast.phase) && !reduced) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    let amount = 0.05 + Math.max(0, Math.sin(time * 5)) * 0.07;
    softLight(0.404, 0.449, 0.08, '225,156,83', amount);
    ctx.restore();
  }
  if (broadcast.holding && !recovering(broadcast)) {
    // Point at the way out: the breaker panel pulses at the far end of the awning.
    ctx.save();
    ctx.strokeStyle = `rgba(230,180,110,${reduced ? 0.8 : 0.45 + Math.sin(time * 4) * 0.35})`;
    ctx.lineWidth = Math.max(1.5, W / 800);
    ctx.strokeRect(0.651 * W, 0.598 * H, 0.032 * W, 0.046 * H);
    ctx.restore();
  }
  if (facts.breaker) {
    ctx.save();
    ctx.globalAlpha = 0.13;
    ctx.fillStyle = '#081018';
    polygon([
      [0.63, 0.6],
      [0.7, 0.6],
      [0.72, 0.77],
      [0.62, 0.77],
    ]);
    ctx.fill();
    ctx.restore();
  }
  if (['warning', 'live'].includes(broadcast.phase)) {
    let a = screenPoint(scenes[0], 0.65, 11.1),
      b = screenPoint(scenes[0], 2.35, 11.1),
      c = screenPoint(scenes[0], 2.35, 16.1),
      d = screenPoint(scenes[0], 0.65, 16.1);
    ctx.strokeStyle = inShelter(player) ? '#a8c2b366' : '#d5c09355';
    ctx.lineWidth = 1;
    polygon([
      [a.u, a.v],
      [b.u, b.v],
      [c.u, c.v],
      [d.u, d.v],
    ]);
    ctx.stroke();
  }
}
// The studio monitor is a CCTV feed of this room, framed on the desk. It shows the present
// until the player examines it; then it runs seven seconds ahead (see prediction.js).
const GLASS = [
    [0.719, 0.364],
    [0.777, 0.37],
    [0.776, 0.447],
    [0.719, 0.443],
  ],
  FEED_BOX = { x: 0.716, y: 0.36, w: 0.065, h: 0.091 },
  FEED_VIEW = { u0: 0.53, v0: 0.4, u1: 0.83, v1: 0.82 }; // same 1.28 aspect as the glass
function facingTo(a, b) {
  const s = scenes[2],
    p = screenPoint(s, a.x, a.z),
    q = screenPoint(s, b.x, b.z);
  return Math.atan2(q.u - p.u, -(q.v - p.v));
}
// Tape cross on the studio floor. `map` converts frame coordinates to canvas pixels.
function drawTapeMark(map, glow) {
  const s = scenes[2],
    r = 0.32;
  ctx.save();
  ctx.lineCap = 'round';
  for (const [ax, az, bx, bz] of [
    [-r, -r, r, r],
    [-r, r, r, -r],
  ]) {
    const a = screenPoint(s, MARK.x + ax, MARK.z + az),
      b = screenPoint(s, MARK.x + bx, MARK.z + bz),
      [x0, y0] = map(a.u, a.v),
      [x1, y1] = map(b.u, b.v);
    ctx.strokeStyle = `rgba(222,204,146,${0.55 + glow * 0.45})`;
    ctx.lineWidth = Math.max(1.5, Math.hypot(x1 - x0, y1 - y0) * 0.09);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.restore();
}
const roomMap = (u, v) => [u * W, v * H];
function drawMonitor() {
  const x = FEED_BOX.x * W,
    y = FEED_BOX.y * H,
    w = FEED_BOX.w * W,
    h = FEED_BOX.h * H,
    fv = FEED_VIEW,
    sx = w / ((fv.u1 - fv.u0) * W),
    sy = h / ((fv.v1 - fv.v0) * H),
    img = assets.studio,
    s = scenes[2],
    synced = prediction.phase === 'resolved' && prediction.outcome === 'followed',
    resisted = prediction.outcome === 'resisted';
  ctx.save();
  polygon(GLASS);
  ctx.clip();
  ctx.drawImage(
    img,
    fv.u0 * img.width,
    fv.v0 * img.height,
    (fv.u1 - fv.u0) * img.width,
    (fv.v1 - fv.v0) * img.height,
    x,
    y,
    w,
    h,
  );
  drawTapeMark((u, v) => [x + (u - fv.u0) * W * sx, y + (v - fv.v0) * H * sy], 0.3);
  if (actor) {
    feedFigure(prediction, player, feedActor, facingTo);
    const p = screenPoint(s, feedActor.x, feedActor.z),
      d = project(s.h, feedActor.x, feedActor.z).d;
    actor.draw(
      ctx,
      feedActor,
      x + (p.u - fv.u0) * W * sx,
      y + (p.v - fv.v0) * H * sy,
      ((s.nearHeight * H) / d) * sy,
      'neutral',
      time,
    );
  }
  ctx.fillStyle = synced ? 'rgba(122,62,24,.24)' : 'rgba(20,72,40,.32)';
  ctx.fillRect(x, y, w, h);
  if (time < feedTearUntil || (resisted && !reduced && Math.sin(time * 2.3) > 0.985)) {
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = `rgba(205,222,205,${0.12 + random() * 0.3})`;
      ctx.fillRect(x + (random() - 0.5) * w * 0.2, y + random() * h, w, Math.max(1, h * 0.02));
    }
  }
  ctx.strokeStyle = '#061a0990';
  ctx.lineWidth = Math.max(0.5, h / 90);
  for (let i = 0; i < 15; i++) {
    const yy = y + (i / 15) * h;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + w, yy);
    ctx.stroke();
  }
  ctx.fillStyle = synced ? '#f0c9a0' : '#cfe3c8';
  ctx.font = `${Math.max(5, h * 0.13)}px monospace`;
  ctx.fillText(
    prediction.phase === 'idle' ? 'LIVE' : synced ? '+00:00' : '+00:07',
    x + w * 0.05,
    y + h * 0.17,
  );
  if (Math.floor(time * 2) % 2 === 0) {
    ctx.fillStyle = '#d5523c';
    ctx.beginPath();
    ctx.arc(x + w * 0.9, y + h * 0.12, h * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
// How strongly the studio's ON AIR sign burns, from the state of the prediction.
function onAirLevel() {
  const pr = prediction;
  if (pr.phase === 'idle') return 0;
  if (pr.phase === 'preview') return 0.05;
  if (pr.phase === 'countdown')
    return reduced ? 0.08 : 0.03 + 0.1 * Math.max(0, 1 - (pr.clock % 1) * 3);
  if (pr.outcome === 'followed') return 0.14;
  return reduced ? 0.04 : Math.sin(time * 17) * Math.sin(time * 5.3) > 0.2 ? 0.1 : 0.01;
}
function drawStudio() {
  drawTapeMark(roomMap, prediction.phase === 'countdown' ? onAirLevel() * 5 : 0);
  drawMonitor();
  const level = onAirLevel();
  if (level > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    softLight(0.787, 0.144, 0.075, '187,47,28', level);
    // Followed: the microphone's tally lamp and the desk light answer the player.
    if (prediction.outcome === 'followed') {
      softLight(0.648, 0.352, 0.012, '235,60,40', 0.9);
      softLight(0.64, 0.5, 0.2, '226,150,90', 0.07);
    }
    ctx.restore();
  }
}
// Insert shot: while the monitor shows the future, the camera cuts in close on the screen.
function drawInsertShot() {
  const Z = 3.3,
    t = prediction.clock,
    length = prediction.phase === 'preview' ? PREVIEW : RESIST_INSERT;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(Z, Z);
  ctx.translate(-0.748 * W, -0.405 * H);
  ctx.drawImage(assets.studio, 0, 0, W, H);
  drawMonitor();
  ctx.restore();
  ctx.fillStyle = '#020304';
  ctx.fillRect(0, 0, W, H * 0.08);
  ctx.fillRect(0, H * 0.92, W, H * 0.08);
  const fade = Math.max(0, 1 - t / 0.3, 1 - (length - t) / 0.3);
  if (fade > 0) {
    ctx.fillStyle = `rgba(2,3,4,${Math.min(1, fade)})`;
    ctx.fillRect(0, 0, W, H);
  }
}
function environment() {
  if (sceneIndex === 0) {
    drawStreetProps();
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    softLight(
      0.589,
      0.148,
      0.034,
      '170,39,24',
      reduced ? 0.025 : 0.02 + (Math.sin(time * 0.8) > 0.8 ? 0.04 : 0),
    );
    ctx.restore();
  }
  if (sceneIndex === 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    softLight(0.744, 0.5, 0.11, '74,158,171', 0.025);
    ctx.restore();
  }
  if (sceneIndex === 2) drawStudio();
  if (!reduced && sceneIndex === 0) {
    ctx.save();
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 3; i++) {
      let phase = (time * 0.18 + i * 0.33) % 1;
      softLight(
        0.699 + Math.sin(time * 0.3 + i) * 0.006,
        0.716 - phase * 0.075,
        0.018 + phase * 0.035,
        '171,187,186',
        0.028 * (1 - phase),
      );
    }
    ctx.restore();
  }
}
let seed = 19;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
const rain = Array.from({ length: 80 }, () => [random(), random(), random()]);
function weather() {
  if (reduced || sceneIndex === 2) return;
  ctx.lineWidth = Math.max(0.5, W / 1900);
  for (let [x, y, z] of rain) {
    let u = (((x - elapsed * 0.013) % 1) + 1) % 1,
      v = (y + elapsed * (0.28 + z * 0.16)) % 1;
    ctx.strokeStyle = `rgba(175,193,204,${0.025 + z * 0.07})`;
    ctx.beginPath();
    ctx.moveTo(u * W, v * H);
    ctx.lineTo((u - 0.002) * W, (v + 0.014 + z * 0.01) * H);
    ctx.stroke();
  }
}
// Broadcast catch: the frame loses vertical hold for a moment and drains of colour. One
// controlled roll, no flashing; reduced motion gets only the desaturation.
function drawPictureSkip() {
  const k = (time - skipAt) / RECOVERY;
  if (k < 0 || k >= 1) return;
  const strength = Math.sin(k * Math.PI);
  if (!reduced) {
    const roll = Math.round(H * 0.6 * (1 - (1 - k) ** 3)) % H;
    ctx.drawImage(canvas, 0, 0, W, H - roll, 0, roll, W, H - roll);
    ctx.drawImage(canvas, 0, H - roll, W, roll, 0, 0, W, roll);
    ctx.fillStyle = '#030405';
    ctx.fillRect(0, roll - H * 0.012, W, H * 0.024);
    for (let i = 0; i < 3; i++) {
      const y = ((k * 2.3 + i * 0.31) % 1) * H,
        band = H * 0.03;
      ctx.drawImage(canvas, 0, y, W, band, (random() - 0.5) * W * 0.04 * strength, y, W, band);
    }
  }
  ctx.save();
  ctx.globalCompositeOperation = 'saturation';
  ctx.fillStyle = `rgba(128,128,128,${0.85 * strength})`;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  ctx.fillStyle = `rgba(4,6,8,${0.35 * strength})`;
  ctx.fillRect(0, 0, W, H);
}
function drawMarker() {
  if (!marker || time - marker.t > 1.8 || mode !== 'play') return;
  ctx.save();
  ctx.globalAlpha = 1 - (time - marker.t) / 1.8;
  ctx.strokeStyle = marker.bad ? '#e09b79' : '#b7d1c7';
  ctx.lineWidth = 1.4;
  let x = marker.u * W,
    y = marker.v * H;
  if (marker.bad) {
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 4);
    ctx.lineTo(x + 4, y + 4);
    ctx.moveTo(x + 4, y - 4);
    ctx.lineTo(x - 4, y + 4);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.ellipse(x, y, 8, 3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
let last = performance.now();
function render(now) {
  let dt = Math.min(0.15, (now - last) / 1000);
  last = now;
  if (mode !== 'pause' && mode !== 'choice') {
    elapsed += dt;
    let count = Math.ceil(dt / 0.05);
    for (let i = 0; i < count; i++) update(dt / count);
  }
  if (ready) {
    const s = scenes[sceneIndex];
    const cinematic = sceneIndex === 2 && insertShot(prediction);
    $('#hud').classList.toggle('cinematic', cinematic);
    if (cinematic) drawInsertShot();
    else {
      ctx.drawImage(assets[s.id], 0, 0, W, H);
      environment();
      if (mode !== 'title') drawActor();
      drawMarker();
      weather();
    }
    drawPictureSkip();
    if (sceneIndex === 0 && broadcast.phase === 'live' && !reduced) {
      ctx.fillStyle = 'rgba(65,24,17,.035)';
      ctx.fillRect(0, 0, W, H);
    }
  }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
