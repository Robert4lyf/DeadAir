// Boots dist/game.js in an isolated VM context with a minimal DOM, so tests can drive the
// real game loop (update, interact, pause, finish, restart) without a browser.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';

const dist = path.resolve(import.meta.dirname, '../../dist');
const source = fs.readFileSync(path.join(dist, 'game.js'), 'utf8');
const importPattern = /^import\s*\{([^}]*)\}\s*from\s*'([^']+)';/gm;

// Resolve `import { a, b as c } from './x.js'` into sandbox bindings, honouring aliases.
async function bindings() {
  // Every module export is available to test code; game.js's own (possibly aliased)
  // import names are layered on top.
  const out = {};
  for (const file of fs.readdirSync(dist).filter((f) => f.endsWith('.js') && f !== 'game.js'))
    Object.assign(out, await import(path.join(dist, file)));
  for (const [, list, from] of source.matchAll(importPattern)) {
    const mod = await import(path.join(dist, from));
    for (const spec of list
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)) {
      const [name, alias = name] = spec.split(/\s+as\s+/);
      assert(name in mod, `${from} does not export ${name}`);
      out[alias] = mod[name];
    }
  }
  return out;
}

// Elements that start hidden in index.html.
const hiddenAtStart = [
  '#hud',
  '#modal',
  '#decision',
  '#ending',
  '#error',
  '#touch',
  '#interaction',
];
const gradient = { addColorStop() {} };
const ctx2d = new Proxy(
  { createRadialGradient: () => gradient, createLinearGradient: () => gradient },
  { get: (o, k) => o[k] || (() => {}) },
);

function makeNode(selector) {
  const classes = new Set(),
    listeners = {};
  return {
    listeners,
    hidden: hiddenAtStart.includes(selector),
    disabled: false,
    style: { setProperty() {} },
    dataset: {},
    innerHTML: '',
    textContent: '',
    className: '',
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, on = !classes.has(c)) => (on ? classes.add(c) : classes.delete(c), on),
      contains: (c) => classes.has(c),
    },
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
    setAttribute() {},
    removeAttribute() {},
    focus() {},
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    isConnected: true,
    getContext: () => ctx2d,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  };
}

const helpers = `
function step(seconds, dt = 1 / 60) {
  for (let t = 0; t < seconds - 1e-9; t += dt) update(dt);
}
function until(predicate, n = 6000) {
  for (let i = 0; i < n && !predicate(); i++) update(1 / 60);
  assert(
    predicate(),
    'Timed out at scene ' + sceneIndex + ', mode ' + mode + ', broadcast ' + broadcast.phase +
      ', position ' + player.x.toFixed(2) + ',' + player.z.toFixed(2),
  );
}
function walkTo(x, z) {
  path = route(scenes[sceneIndex], player, { x, z });
  assert(path.length, 'No route to ' + x + ',' + z);
  queuedAction = null;
  until(() => !path.length);
}
function use(id, predicate) {
  const o = interactables.find((o) => o.id === id);
  path = route(scenes[sceneIndex], player, o);
  assert(path.length, 'Object must be reachable: ' + id);
  queuedAction = id;
  until(predicate);
}
// Display frames through the real gate (tick), as the browser's frame loop would.
function frames(seconds, dt = 1 / 60) {
  for (let t = 0; t < seconds - 1e-9; t += dt) tick(dt);
}
function goToScene(index) {
  changeScene(index);
  until(() => mode === 'play' && sceneIndex === index);
}
`;

export async function bootGame() {
  const nodes = new Map(),
    windowListeners = {},
    documentListeners = {};
  const document = {
    hidden: false,
    blurred: false,
    hasFocus: () => !document.hidden && !document.blurred,
    activeElement: null,
    querySelector(s) {
      if (!nodes.has(s)) nodes.set(s, makeNode(s));
      return nodes.get(s);
    },
    createElement: () => makeNode('canvas'),
    addEventListener: (type, fn) => (documentListeners[type] ??= []).push(fn),
  };
  const sandbox = {
    ...(await bindings()),
    // Sprite extraction needs a real canvas; the loop only needs something drawable.
    SpriteActor: class {
      draw() {}
    },
    assert,
    document,
    window: {},
    location: { reload() {} },
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener: (type, fn) => (windowListeners[type] ??= []).push(fn),
    requestAnimationFrame() {},
    performance,
    console,
    Image: class {
      set src(v) {
        queueMicrotask(() => this.onload());
      }
    },
    Math,
  };
  vm.createContext(sandbox);
  vm.runInContext(source.replace(importPattern, '') + helpers, sandbox, {
    filename: 'game.js',
  });
  const run = (code) => vm.runInContext(code, sandbox, { timeout: 20000 });
  run('ready = true; enter();');
  const el = (s) => document.querySelector(s),
    tapScreen = (u, v) =>
      el('#scene').listeners.pointerdown?.forEach((fn) =>
        fn({ clientX: u * 1280, clientY: v * 720, pointerType: 'touch' }),
      );
  return {
    run,
    document,
    // A finger tap on the scene at scene coordinates (u, v): converted to the screen through
    // the current camera, so it lands where that point is actually drawn.
    tap: (u, v) => tapScreen(u - vm.runInContext('camU', sandbox), v),
    // A finger tap at a position on the visible frame (0-1 across the screen).
    tapScreen,
    click: (s) => el(s).onclick?.(),
    // Leaving and returning to the page, as the browser reports it.
    hide() {
      document.hidden = true;
      documentListeners.visibilitychange?.forEach((fn) => fn({}));
    },
    show() {
      document.hidden = false;
      documentListeners.visibilitychange?.forEach((fn) => fn({}));
    },
    blur() {
      document.blurred = true;
      windowListeners.blur?.forEach((fn) => fn({}));
    },
    focus() {
      document.blurred = false;
      windowListeners.focus?.forEach((fn) => fn({}));
    },
    el: (s) => document.querySelector(s),
    fireWindow: (type, event = {}) => windowListeners[type]?.forEach((fn) => fn(event)),
    fireDocument: (type, event = {}) => documentListeners[type]?.forEach((fn) => fn(event)),
  };
}
