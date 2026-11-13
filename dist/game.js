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
} from './encounter.js';
import { SpriteActor, turnToward } from './sprites.js';
const $ = (s) => document.querySelector(s),
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
  footTime = 0,
  marker = null,
  transitionClock = 0,
  transitionTarget = 1,
  transitionFrom = 0,
  transitionApplied = false,
  subtitleUntil = 0,
  subtitlePriority = 0,
  statusUntil = 0,
  flashUntil = 0,
  monitorAt = -1;
let player = makePlayer(scenes[0].spawn),
  broadcast = createBroadcast(),
  facts = { notice: false, intercom: false, breaker: false, monitor: false },
  history = [],
  historyAt = 0;
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
    $('#error').hidden = true;
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
    $('#error').hidden = false;
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
function say(text, seconds = 5, priority = 1) {
  if (time < subtitleUntil && priority < subtitlePriority) return;
  $('#subtitle').textContent = text;
  subtitleUntil = time + seconds;
  subtitlePriority = priority;
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
  $('#objectiveLead').textContent = sceneIndex === 2 ? 'STUDIO' : 'REACH';
  $('#objectiveTitle').textContent =
    sceneIndex === 2 ? (facts.monitor ? 'THE MICROPHONE' : 'THE MONITOR') : 'STUDIO 001';
  $('#distance').textContent =
    sceneIndex === 2
      ? facts.monitor
        ? 'THE PICTURE IS SEVEN SECONDS AHEAD'
        : 'LOOK AT THE LIVE PICTURE'
      : sceneIndex === 1
        ? 'CYAN DOORS / STUDIO 001'
        : crossingOpen(broadcast)
          ? 'CROSSING OPEN / FOLLOW THE TOWER'
          : broadcast.phase === 'dormant'
            ? 'FOLLOW THE TOWER / INSPECT THE STREET'
            : 'FIND COVER OR CUT THE SERVICE FEED';
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
  $('#modal').hidden = !show;
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
    return facts.monitor ? 'Take the microphone' : 'Examine the studio monitor';
  return o.label;
}
function interact(id = interaction?.id) {
  if (mode !== 'play' || !id) return false;
  let object = interactables.find((o) => o.id === id);
  if (
    !object ||
    object.scene !== sceneIndex ||
    Math.hypot(player.x - object.x, player.z - object.z) > object.reach + 0.08
  )
    return false;
  if (id === 'notice') {
    facts.notice = true;
    say(
      'CURFEW NOTICE: During live transmission, shelter beneath the shop awnings. Service breakers isolate the signal.',
      8,
    );
    noise(0.02, 0.2, 0.6);
  } else if (id === 'intercom') {
    facts.intercom = true;
    say('INTERCOM: “At the crossing, you will run. You will not reach the light.”', 7, 2);
    noise(0.11, 1.5, 0.65, 1300);
  } else if (id === 'breaker') {
    if (!facts.breaker) {
      facts.breaker = true;
      cutBroadcast(broadcast);
      path = [];
      queuedAction = null;
      noise(0.12, 0.35, 0.7, 220);
      say(
        'The service feed is cut. The crossing unlocks. Something in the speaker keeps breathing.',
        7,
        3,
      );
    } else say('The breaker is off. The crossing is open.');
  } else if (id === 'crossing') {
    if (!crossingOpen(broadcast)) {
      say(
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
    if (!facts.monitor) {
      facts.monitor = true;
      monitorAt = time;
      noise(0.065, 1.2, -0.3, 1800);
      say('The monitor shows you at this desk. The timestamp is seven seconds ahead.', 7, 2);
    } else if (time - monitorAt < 4) {
      say('On the monitor, you reach for the microphone before you move.', 4, 2);
    } else {
      mode = 'choice';
      keys.clear();
      path = [];
      $('#decision').hidden = false;
    }
  }
  updateObjective();
  return true;
}
function finish(choice) {
  mode = 'end';
  $('#decision').hidden = true;
  $('#hud').hidden = true;
  $('#touch').hidden = true;
  $('#ending').hidden = false;
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
  else $('#modal').hidden = true;
};
$('#help').onclick = () => {
  if (mode === 'play') pause(true);
  else if (mode === 'title') $('#modal').hidden = false;
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
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code))
    e.preventDefault();
  if (e.code === 'Escape' && !e.repeat) {
    pause(mode !== 'pause');
    return;
  }
  if (!['play', 'transition'].includes(mode)) return;
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
addEventListener('keyup', (e) => keys.delete(e.code));
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
  if (mode !== 'play') return;
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
    player.x = 1.4;
    player.z = 13.3;
    player.moving = false;
    keys.clear();
    path = [];
    queuedAction = null;
    flashUntil = time + 0.6;
    say(
      'The picture skips. You are back beneath the awning. Wait for the transmission to pass.',
      6,
      4,
    );
    noise(0.16, 0.6, 0, 1200);
  } else if (event === 'clear') {
    say('The speaker falls silent. The crossing signal changes. You can go.', 5, 4);
    note(320, 0.25, 0.04);
  }
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
  if (time > subtitleUntil) {
    $('#subtitle').textContent = '';
    subtitlePriority = 0;
  }
  if (time > statusUntil)
    $('#status').textContent =
      sceneIndex === 2
        ? 'STUDIO / LIVE'
        : broadcast.phase === 'live'
          ? 'TRANSMITTING'
          : 'SIGNAL DETECTED';
  player.running = keys.has('ShiftLeft') || keys.has('ShiftRight');
  let speed = player.running ? 3.9 : 2.35,
    mx =
      (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) -
      (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
    my =
      (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) -
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
  interaction = nearby();
  let hoverObject = interactables.find((o) => o.id === hovered && o.scene === sceneIndex);
  $('#hoverHint').textContent =
    hoverObject && hoverObject.id !== interaction?.id ? label(hoverObject) : '';
  $('#interaction').hidden = !interaction;
  if (interaction) $('#interaction span').textContent = label(interaction);
  let danger = sceneIndex === 0 && ['warning', 'live'].includes(broadcast.phase);
  $('#broadcastPanel').hidden = !danger;
  if (danger) {
    $('#broadcastTimer').textContent =
      broadcast.phase === 'warning'
        ? 'TRANSMISSION IN ' + Math.ceil(broadcast.remaining)
        : 'ON AIR / ' + Math.ceil(broadcast.remaining);
    $('#broadcastHelp').textContent = inShelter(player)
      ? 'IN SHADOW / STAY HERE'
      : 'RIGHT-HAND AWNING OR SERVICE BREAKER';
  }
  updateObjective();
  if (time - historyAt > 0.15) {
    historyAt = time;
    history.push({ scene: sceneIndex, x: player.x, z: player.z, facing: player.facing });
    if (history.length > 80) history.shift();
  }
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
  if (['warning', 'live'].includes(broadcast.phase) && !reduced) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    let amount = 0.05 + Math.max(0, Math.sin(time * 5)) * 0.07;
    softLight(0.404, 0.449, 0.08, '225,156,83', amount);
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
function drawMonitor() {
  // The CRT picture is clipped to the physical glass in the background.
  ctx.save();
  polygon([
    [0.719, 0.364],
    [0.777, 0.37],
    [0.776, 0.447],
    [0.719, 0.443],
  ]);
  ctx.clip();
  let x = 0.716 * W,
    y = 0.36 * H,
    w = 0.065 * W,
    h = 0.091 * H;
  ctx.drawImage(assets.studio, x, y, w, h);
  if (actor) {
    let future = { ...player, x: 0, z: 14.8, facing: Math.PI * 0.25, moving: false };
    actor.draw(ctx, future, x + w * 0.57, y + h * 0.95, h * 0.55, 'warm', time + 7);
  }
  ctx.fillStyle = 'rgba(20,72,40,.28)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#a9c8a2';
  ctx.font = Math.max(4, H * 0.006) + 'px monospace';
  ctx.fillText('+00:07', x + w * 0.04, y + h * 0.13);
  ctx.strokeStyle = '#061a0990';
  for (let i = 0; i < 15; i++) {
    let yy = y + (i / 15) * h;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + w, yy);
    ctx.stroke();
  }
  ctx.restore();
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
  if (sceneIndex === 2) {
    drawMonitor();
    if (facts.monitor) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      softLight(0.787, 0.144, 0.075, '187,47,28', 0.06);
      ctx.restore();
    }
  }
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
    canvas.dataset.camera = s.id;
    canvas.dataset.mode = mode;
    canvas.dataset.position = player.x.toFixed(2) + ',' + player.z.toFixed(2);
    canvas.dataset.broadcast = broadcast.phase;
    canvas.dataset.facts = Object.keys(facts)
      .filter((k) => facts[k])
      .join(',');
    ctx.drawImage(assets[s.id], 0, 0, W, H);
    environment();
    if (mode !== 'title') drawActor();
    drawMarker();
    weather();
    if (time < flashUntil && !reduced) {
      ctx.fillStyle = 'rgba(158,171,161,.10)';
      ctx.fillRect(0, 0, W, H);
    }
    if (sceneIndex === 0 && broadcast.phase === 'live' && !reduced) {
      ctx.fillStyle = 'rgba(65,24,17,.035)';
      ctx.fillRect(0, 0, W, H);
    }
  }
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
window.deadAirInfo = () => ({
  mode,
  scene: scenes[sceneIndex].id,
  player: { x: player.x, z: player.z },
  broadcast: { ...broadcast },
  facts: { ...facts },
  interaction: interaction?.id,
  pathLength: path.length,
  ready,
});
