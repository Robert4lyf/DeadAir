import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as navigation from '../dist/navigation.js';
import * as encounter from '../dist/encounter.js';
import { turnToward } from '../dist/sprites.js';
let nodes = new Map(),
  gradient = { addColorStop() {} };
const ctx = new Proxy(
  { createRadialGradient: () => gradient },
  { get: (o, k) => o[k] || (() => {}) },
);
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
function node(selector) {
  return {
    hidden: hiddenAtStart.includes(selector),
    disabled: false,
    style: {},
    dataset: {},
    innerHTML: '',
    textContent: '',
    addEventListener() {},
    setAttribute() {},
    focus() {},
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    isConnected: true,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  };
}
const document = {
  querySelector(s) {
    if (!nodes.has(s)) nodes.set(s, node(s));
    return nodes.get(s);
  },
  activeElement: null,
  addEventListener() {},
};
const sandbox = {
  ...navigation,
  ...encounter,
  turnToward,
  SpriteActor: class {
    draw() {}
  },
  assert,
  document,
  window: {},
  devicePixelRatio: 1,
  matchMedia: () => ({ matches: false }),
  addEventListener() {},
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
const source = fs.readFileSync('dist/game.js', 'utf8').replace(/^import\b[^;]*;/gm, '');
vm.runInContext(
  source +
    `
ready = true;
enter();
assert.equal(mode, 'play');

function until(predicate, n = 4000) {
  for (let i = 0; i < n && !predicate(); i++) update(1 / 60);
  assert(
    predicate(),
    'Journey timed out at scene ' + sceneIndex + ' phase ' + broadcast.phase +
      ' position ' + player.x + ',' + player.z,
  );
}

function use(id, predicate) {
  const o = interactables.find((o) => o.id === id);
  path = route(scenes[sceneIndex], player, o);
  assert(path.length, 'Object must be reachable: ' + id);
  queuedAction = id;
  until(predicate);
}

assert.equal(interact('monitor'), false, 'Cannot use an object in another scene');
use('notice', () => facts.notice);
use('intercom', () => facts.intercom);

// The forecast interrupts automatic walking and gives a fair warning.
path = route(scenes[0], player, { x: 1.4, z: 14 });
until(() => broadcast.phase === 'warning');
assert.equal(path.length, 0);
assert(broadcast.remaining > 4);
assert.equal(mode, 'play');

const remaining = broadcast.remaining;
pause(true);
update(10);
assert.equal(broadcast.remaining, remaining, 'Pause freezes the encounter');
pause(false);

use('breaker', () => facts.breaker);
assert.equal(broadcast.phase, 'clear');
assert(inShelter(player), 'Breaker must be usable from cover');

use('crossing', () => sceneIndex === 1);
until(() => mode === 'play');
assert(player.z >= 4, 'Plaza spawn must clear the bottom HUD');

use('doors', () => sceneIndex === 2);
until(() => mode === 'play');
update(1 / 60);
assert.equal(interaction, null, 'The exit just used must not prompt on arrival');

use('monitor', () => facts.monitor);
for (let i = 0; i < 300; i++) update(1 / 60);
assert(interact('monitor'));
assert.equal(mode, 'choice');
assert.equal(document.querySelector('#decision').hidden, false);

finish('silence');
assert.equal(mode, 'end');
assert.equal(document.querySelector('#ending').hidden, false);
assert(document.querySelector('#endLine').textContent.includes('remember'));

console.log(
  'PASS: notice, intercom, broadcast interruption, pause, breaker, both camera cuts, monitor and ending choice',
);
`,
  sandbox,
  { timeout: 20000 },
);
assert(
  Math.abs(turnToward(Math.PI - 0.1, -Math.PI + 0.1, 0.1) - (Math.PI + 0.1)) < 0.001,
  'Turns take the shortest path',
);
