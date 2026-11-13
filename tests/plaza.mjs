import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlazaEvent,
  updatePlazaEvent,
  leavePlaza,
  doorOpenness,
  doorsOpen,
  ANTICIPATE,
  TRIGGER,
  OPENING,
} from '../dist/plaza.js';

function run(state, seconds, player, dt = 0.05) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += dt) events.push(...updatePlazaEvent(state, dt, player));
  return events;
}

test('anticipation, trigger, announcement and aftermath happen once, in order', () => {
  const s = createPlazaEvent();
  assert.deepEqual(run(s, 5, { x: 0, z: 5 }), []);
  assert.deepEqual(run(s, 1, { x: 0, z: ANTICIPATE }), ['anticipate']);
  assert.equal(doorOpenness(s), 0);
  assert.deepEqual(run(s, OPENING + 0.2, { x: 0, z: TRIGGER }), ['unlock', 'announce', 'settled']);
  assert(doorsOpen(s));
  assert.equal(doorOpenness(s), 1);
  assert.deepEqual(run(s, 10, { x: 0, z: 26 }), [], 'Nothing re-triggers');
  leavePlaza(s);
  assert.deepEqual(run(s, 10, { x: 0, z: 5 }), [], 'Coming back keeps the doors open');
  assert(doorsOpen(s));
});

test('backtracking during anticipation resets it without repeating the line', () => {
  const s = createPlazaEvent();
  assert.deepEqual(run(s, 1, { x: 0, z: 10 }), ['anticipate']);
  leavePlaza(s);
  assert.equal(s.phase, 'dormant');
  assert.deepEqual(run(s, 1, { x: 0, z: 10 }), [], 'The PA line is not repeated');
  assert.equal(s.phase, 'anticipation');
  assert.deepEqual(run(s, OPENING + 0.2, { x: 0, z: 16 }), ['unlock', 'announce', 'settled']);
});

test('leaving while the doors open completes the event silently', () => {
  const s = createPlazaEvent();
  run(s, 1, { x: 0, z: TRIGGER });
  assert.equal(s.phase, 'opening');
  leavePlaza(s);
  assert(doorsOpen(s));
  assert.deepEqual(run(s, 10, { x: 0, z: 20 }), []);
});
