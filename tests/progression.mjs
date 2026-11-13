// End-to-end progression through the real game loop (no rendering, no audio).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGame } from './support/harness.mjs';
import { turnToward } from '../dist/sprites.js';

test('street to studio via the breaker, then the prediction and an ending', async () => {
  const g = await bootGame();
  g.run(`
assert.equal(mode, 'play');
assert.equal(interact('monitor'), false, 'Cannot use an object in another scene');
use('notice', () => facts.notice);
use('intercom', () => facts.intercom);

// The forecast interrupts automatic walking and gives a fair warning.
path = route(scenes[0], player, { x: 1.4, z: 14 });
until(() => broadcast.phase === 'warning');
assert.equal(path.length, 0);
assert(broadcast.remaining > 4);

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

use('monitor', () => prediction.phase === 'preview');
until(() => prediction.phase === 'countdown');
use('microphone', () => prediction.phase === 'resolved');
assert.equal(prediction.outcome, 'followed');
until(() => prediction.ready);
use('microphone', () => mode === 'choice');
assert.equal(document.querySelector('#decision').hidden, false);
finish('silence');
assert.equal(mode, 'end');
`);
});

test('the prediction holds input during the preview, then resolves as followed', async () => {
  const g = await bootGame();
  g.run(`
goToScene(2);
walkTo(VIEW.x, VIEW.z);
assert(interact('monitor'));
assert.equal(prediction.phase, 'preview');
assert(controlLocked(), 'The insert shot holds the player');
keys.add('KeyW');
const before = { x: player.x, z: player.z };
step(1);
assert.deepEqual({ x: player.x, z: player.z }, before, 'No movement while the future plays');
keys.clear();
assert.equal(interact('monitor'), false, 'No interaction during the insert shot');
until(() => prediction.phase === 'countdown');
assert(!controlLocked());
use('microphone', () => atMark(player));
until(() => prediction.phase === 'resolved');
assert.equal(prediction.outcome, 'followed');
`);
});

test('standing still resists the prediction and still reaches the decision', async () => {
  const g = await bootGame();
  g.run(`
goToScene(2);
walkTo(VIEW.x, VIEW.z);
interact('monitor');
until(() => prediction.phase === 'countdown');
assert(!atMark(player), 'The viewing spot is off the mark');
until(() => prediction.phase === 'resolved');
assert.equal(prediction.outcome, 'resisted');
until(() => prediction.ready);
use('microphone', () => mode === 'choice');
assert(document.querySelector('#decisionText').textContent.includes('other you'));
`);
});

test('repeated monitor use never restarts or duplicates the sequence', async () => {
  const g = await bootGame();
  g.run(`
goToScene(2);
walkTo(VIEW.x, VIEW.z);
interact('monitor');
until(() => prediction.phase === 'countdown');
step(2);
const clock = prediction.clock;
assert(interact('monitor'));
assert.equal(prediction.phase, 'countdown');
assert.equal(prediction.clock, clock, 'Interacting again must not reset the deadline');
until(() => prediction.phase === 'resolved');
const outcome = prediction.outcome;
interact('monitor');
step(1);
assert.equal(prediction.outcome, outcome);
`);
});

test('pause and a hidden tab freeze the prediction deadline', async () => {
  const g = await bootGame();
  g.run(`
goToScene(2);
walkTo(VIEW.x, VIEW.z);
interact('monitor');
until(() => prediction.phase === 'countdown');
step(1.5);
var left = predictionRemaining(prediction);
pause(true);
update(30);
assert.equal(predictionRemaining(prediction), left, 'Pause freezes the deadline');
pause(false);
`);
  g.document.hidden = true;
  g.fireDocument('visibilitychange');
  g.run(`
assert.equal(mode, 'pause', 'Hiding the tab pauses');
update(30);
assert.equal(predictionRemaining(prediction), left, 'A hidden tab freezes the deadline');
assert.equal(prediction.phase, 'countdown');
`);
  g.fireWindow('blur');
  g.run(`assert.equal(mode, 'pause');`);
});

test('turns take the shortest path', () => {
  assert(Math.abs(turnToward(Math.PI - 0.1, -Math.PI + 0.1, 0.1) - (Math.PI + 0.1)) < 0.001);
});
