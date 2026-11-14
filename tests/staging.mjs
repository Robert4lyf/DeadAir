// The prediction must always be staged from the monitor's viewing point, clear of the tape mark.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGame } from './support/harness.mjs';
import { interactables } from '../dist/navigation.js';
import { MARK, MARK_RADIUS, VIEW, LEAD } from '../dist/prediction.js';

const monitorRect = interactables.find((o) => o.id === 'monitor').rect,
  micRect = interactables.find((o) => o.id === 'microphone').rect,
  centre = (r) => [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];

test('the viewing point is clearly outside the tape mark', () => {
  assert(Math.hypot(VIEW.x - MARK.x, VIEW.z - MARK.z) > MARK_RADIUS * 1.8);
});

test('using the monitor from inside the tape mark walks to the viewing point first', async () => {
  const g = await bootGame();
  g.run(`
goToScene(2);
walkTo(0.8, 15.9);
assert(atMark(player), 'Setup: standing on the tape mark');
assert(interact('monitor'));
assert.equal(prediction.phase, 'idle', 'Nothing starts before the approach');
assert(path.length, 'The player is routed to the viewing point');
until(() => prediction.phase === 'preview');
assert(Math.hypot(prediction.from.x - VIEW.x, prediction.from.z - VIEW.z) < 0.15, 'Starts at the viewing point');
assert(!atMark(prediction.from), 'Never starts on the mark');
until(() => prediction.phase === 'resolved');
assert.equal(prediction.outcome, 'resisted', 'Standing still at the viewing point is resisting');
`);
});

test('keyboard use near the monitor also approaches before starting', async () => {
  const g = await bootGame();
  g.run(`
goToScene(2);
walkTo(1.4, 15.6);
update(1 / 60);
assert.equal(interaction.id, 'monitor');
interact();
assert.equal(prediction.phase, 'idle');
until(() => prediction.phase === 'preview');
assert(Math.hypot(player.x - VIEW.x, player.z - VIEW.z) < 0.15);
`);
});

test('tapping the monitor from across the room, then the microphone, follows at walking speed', async () => {
  const g = await bootGame();
  g.run('goToScene(2);');
  g.tap(...centre(monitorRect));
  g.run(`
until(() => prediction.phase === 'preview');
assert(Math.hypot(prediction.from.x - VIEW.x, prediction.from.z - VIEW.z) < 0.15);
until(() => prediction.phase === 'countdown');
`);
  g.tap(...centre(micRect));
  g.run(`
var reachedAt = null;
until(() => {
  if (reachedAt === null && atMark(player)) reachedAt = prediction.clock;
  return prediction.phase === 'resolved';
});
assert(!player.running, 'Walking, not running');
assert(reachedAt !== null && reachedAt < ${LEAD} - 3, 'Reached the mark with seconds to spare: ' + reachedAt);
assert.equal(prediction.outcome, 'followed');
`);
});

test('repeated monitor use during the approach and preview starts the sequence once', async () => {
  const g = await bootGame();
  g.run(`
goToScene(2);
walkTo(-1, 12);
let starts = 0;
const originalStart = startPrediction;
startPrediction = (...a) => {
  const ok = originalStart(...a);
  if (ok) starts++;
  return ok;
};
interact('monitor') || use('monitor', () => path.length > 0);
for (let i = 0; i < 40; i++) {
  update(1 / 20);
  if (Math.hypot(player.x - VIEW.x, player.z - VIEW.z) < 1.5) interact('monitor');
}
until(() => prediction.phase === 'preview');
const clock = prediction.clock;
assert.equal(interact('monitor'), false, 'Locked during the preview');
update(1 / 60);
assert(prediction.clock > clock, 'The preview was not restarted');
until(() => prediction.phase === 'countdown');
assert.equal(starts, 1);
`);
});

test('moving away during the approach cancels it without starting', async () => {
  const g = await bootGame();
  g.run(`
goToScene(2);
walkTo(0, 10);
use('monitor', () => path.length > 0);
keys.add('KeyS');
step(0.5);
keys.clear();
step(3);
assert.equal(prediction.phase, 'idle');
assert.equal(queuedAction, null);
`);
});
