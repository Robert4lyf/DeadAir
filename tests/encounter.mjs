import assert from 'node:assert/strict';
import {
  createBroadcast,
  updateBroadcast,
  cutBroadcast,
  crossingOpen,
  inShelter,
} from '../dist/encounter.js';
let b = createBroadcast(),
  p = { x: 0, z: 10 };
assert.deepEqual(updateBroadcast(b, 1, p, 0), []);
p.z = 13.3;
assert.deepEqual(updateBroadcast(b, 0.05, p, 0), ['warning']);
assert.equal(b.remaining, 4.5);
assert(!crossingOpen(b));
p = { x: 1.4, z: 13.3 };
assert(inShelter(p));
for (let i = 0; i < 300; i++) updateBroadcast(b, 0.05, p, 0);
assert.equal(b.phase, 'clear');
assert.equal(b.attempts, 0);
assert(crossingOpen(b));
b = createBroadcast();
p = { x: 0, z: 14 };
updateBroadcast(b, 0.05, p, 0);
let events = [];
for (let i = 0; i < 110; i++) events.push(...updateBroadcast(b, 0.05, p, 0));
assert(events.includes('caught'));
assert(b.attempts > 0);
cutBroadcast(b);
assert(crossingOpen(b));
assert.equal(b.remaining, 0);
b = createBroadcast();
updateBroadcast(b, 100, { x: 0, z: 20 }, 1);
assert.equal(b.phase, 'dormant');
cutBroadcast(b);
updateBroadcast(b, 50, { x: 0, z: 20 }, 0);
assert.equal(b.phase, 'clear');
console.log('PASS: warning, shelter survival, exposed catch, breaker bypass and scene isolation');
