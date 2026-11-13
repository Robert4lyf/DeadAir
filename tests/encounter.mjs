import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBroadcast,
  updateBroadcast,
  cutBroadcast,
  crossingOpen,
  inShelter,
  recovering,
  WARNING,
  LIVE,
  RECOVERY,
  GRACE,
} from '../dist/encounter.js';

const shelter = { x: 1.4, z: 13.3 },
  open = { x: 0, z: 14 };
function run(b, seconds, p, scene = 0, dt = 0.05) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += dt) events.push(...updateBroadcast(b, dt, p, scene));
  return events;
}
function live() {
  const b = createBroadcast();
  run(b, 1, { x: 0, z: 10 });
  assert.deepEqual(updateBroadcast(b, 0.05, shelter, 0), ['warning']);
  run(b, WARNING, shelter);
  assert.equal(b.phase, 'live');
  return b;
}

test('a clear warning, then sheltering waits the transmission out', () => {
  const b = createBroadcast();
  assert.deepEqual(run(b, 1, { x: 0, z: 10 }), []);
  assert.deepEqual(updateBroadcast(b, 0.05, { x: 0, z: 13.3 }, 0), ['warning']);
  assert.equal(b.remaining, WARNING);
  assert(!crossingOpen(b));
  assert(inShelter(shelter));
  const events = run(b, WARNING + LIVE + 1, shelter);
  assert.deepEqual(events, ['live', 'clear']);
  assert.equal(b.resolution, 'sheltered');
  assert.equal(b.caught, false);
  assert(crossingOpen(b));
});

test('exposure triggers one controlled catch, and no repeat during recovery', () => {
  const b = live();
  let events = [];
  while (!events.length) events = updateBroadcast(b, 0.05, open, 0);
  assert.deepEqual(events, ['caught']);
  assert(b.caught && b.holding && recovering(b));
  // Still standing in the open: the picture skip must not fire again.
  events = run(b, RECOVERY - 0.1, open);
  assert.deepEqual(events, []);
  events = run(b, 0.2, open);
  assert.deepEqual(events, ['recovered']);
  // The grace period also protects against an immediate second catch.
  assert.deepEqual(run(b, GRACE, open), []);
  assert.deepEqual(run(b, 1, open), ['caught']);
  assert.equal(b.attempts, 2);
});

test('after a catch the transmission holds until the feed is cut', () => {
  const b = live();
  run(b, 0.7, open);
  run(b, RECOVERY + 0.1, shelter);
  const remaining = b.remaining;
  assert.deepEqual(run(b, LIVE * 3, shelter), [], 'Waiting no longer resolves it');
  assert.equal(b.remaining, remaining, 'The countdown is frozen while holding');
  assert.equal(b.phase, 'live');
  cutBroadcast(b);
  assert(crossingOpen(b));
  assert.equal(b.resolution, 'cut');
  assert(b.caught, 'The catch is still remembered');
  assert(!b.holding && !recovering(b));
});

test('cutting the feed directly resolves as cut, uncaught', () => {
  const b = live();
  run(b, 2, shelter);
  cutBroadcast(b);
  assert.equal(b.resolution, 'cut');
  assert.equal(b.caught, false);
  assert.equal(b.remaining, 0);
});

test('the broadcast only runs in the street', () => {
  const b = createBroadcast();
  updateBroadcast(b, 100, { x: 0, z: 20 }, 1);
  assert.equal(b.phase, 'dormant');
});
