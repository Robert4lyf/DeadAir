// End-to-end progression through the real game loop (no rendering, no audio).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGame } from './support/harness.mjs';

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
assert.equal(mode, 'ending');
assert.equal(ending.shot, 'plaza', 'Uncaught breaker route ends on the plaza');
until(() => mode === 'end');
assert.equal(document.querySelector('#ending').hidden, false);
assert.equal(document.querySelector('#endingTitle').textContent, 'Dead air.');
assert.match(document.querySelector('#endWeather').textContent, /silent/);
`);
});

test('caught, resisted and speaking: the ending remembers all three', async () => {
  const g = await bootGame();
  g.run(`
walkTo(-0.5, 13.6);
until(() => recovering(broadcast));
until(() => !recovering(broadcast));
use('breaker', () => facts.breaker);
use('crossing', () => sceneIndex === 1);
until(() => mode === 'play');
until(() => doorsOpen(plazaEvent) || (walkTo(0, 18), doorsOpen(plazaEvent)));
use('doors', () => sceneIndex === 2);
until(() => mode === 'play');
use('monitor', () => prediction.phase === 'preview');
until(() => prediction.phase === 'resolved');
assert.equal(prediction.outcome, 'resisted');
until(() => prediction.ready);
use('microphone', () => mode === 'choice');
finish('speak');
assert.equal(ending.shot, 'street', 'The ending returns to where the tower caught you');
assert.equal(ending.lamp, 'red');
until(() => mode === 'end');
assert.match(document.querySelector('#endLine').textContent, /seven seconds later/);
assert.match(document.querySelector('#endStreet').textContent, /red lamp that caught you/);
`);
});

test('restart clears every sequence and consequence', async () => {
  const g = await bootGame();
  g.run(`
walkTo(-0.5, 13.6);
until(() => recovering(broadcast));
until(() => !recovering(broadcast));
use('breaker', () => facts.breaker);
broadcast.attempts = 2;
plazaEvent.phase = 'open';
goToScene(2);
walkTo(VIEW.x, VIEW.z);
interact('monitor');
until(() => prediction.ready);
use('microphone', () => mode === 'choice');
finish('silence');
until(() => mode === 'end');
restart();
assert.equal(mode, 'play');
assert.equal(sceneIndex, 0);
assert.equal(JSON.stringify(broadcast), JSON.stringify(createBroadcast()));
assert.equal(JSON.stringify(prediction), JSON.stringify(createPrediction()));
assert.equal(JSON.stringify(plazaEvent), JSON.stringify(createPlazaEvent()));
assert.equal(
  JSON.stringify(facts),
  JSON.stringify({ notice: false, intercom: false, breaker: false, monitor: false }),
);
assert.equal(ending, null);
assert.equal(player.x, scenes[0].spawn.x);
assert.equal(player.z, scenes[0].spawn.z);
assert.equal(path.length, 0);
assert.equal(subtitleQueue.length, 0);
assert.equal(document.querySelector('#ending').hidden, true);
assert.equal(document.querySelector('#hud').hidden, false);
assert(!controlLocked());
// And the fresh run plays normally.
walkTo(1.4, 13.4);
until(() => broadcast.phase === 'clear');
assert.equal(broadcast.resolution, 'sheltered');
`);
});

test('the shelter route: wait the transmission out under the awning', async () => {
  const g = await bootGame();
  g.run(`
walkTo(1.4, 13.4);
until(() => broadcast.phase === 'clear');
assert.equal(broadcast.resolution, 'sheltered');
assert.equal(broadcast.caught, false);
use('crossing', () => sceneIndex === 1);
`);
});

test('getting caught: a held picture skip, then the tower holds until the feed is cut', async () => {
  const g = await bootGame();
  g.run(`
walkTo(-0.5, 13.6);
until(() => broadcast.phase === 'live');
assert(!inShelter(player));
until(() => recovering(broadcast));
assert(controlLocked(), 'Input is held during the picture skip');
assert(inShelter(player), 'The skip lands the player in shelter');
assert.equal(path.length, 0);
keys.add('KeyA');
const at = { x: player.x, z: player.z };
step(0.5);
assert.deepEqual({ x: player.x, z: player.z }, at, 'No movement during the skip');
keys.clear();
until(() => !recovering(broadcast));
assert.equal(broadcast.attempts, 1, 'Exactly one catch');
assert(broadcast.holding);
step(20);
assert.equal(broadcast.phase, 'live', 'Waiting no longer clears the transmission');
assert(!interact('crossing') && sceneIndex === 0);
use('breaker', () => facts.breaker);
assert(inShelter(player), 'The breaker is reachable from cover');
assert.equal(broadcast.resolution, 'cut');
assert(broadcast.caught, 'The catch is remembered after the cut');
use('crossing', () => sceneIndex === 1);
`);
});

test('the plaza beat triggers once and survives backtracking', async () => {
  const g = await bootGame();
  g.run(`
cutBroadcast(broadcast); // the street is already resolved
goToScene(1);
walkTo(-1.4, 10);
assert.equal(plazaEvent.phase, 'anticipation');
use('backStreet', () => sceneIndex === 0);
until(() => mode === 'play');
assert.equal(plazaEvent.phase, 'dormant', 'Leaving before the trigger resets it');
use('crossing', () => sceneIndex === 1);
until(() => mode === 'play');
walkTo(0, 15);
assert.equal(plazaEvent.phase, 'opening');
let unlocks = 0;
const original = plazaBeat;
plazaBeat = (e) => (e === 'unlock' && unlocks++, original(e));
assert(!interact('doors') || sceneIndex === 1);
until(() => doorsOpen(plazaEvent));
use('doors', () => sceneIndex === 2);
until(() => mode === 'play');
use('backPlaza', () => sceneIndex === 1);
until(() => mode === 'play');
walkTo(0, 10);
walkTo(0, 18);
step(5);
assert.equal(unlocks, 0, 'The doors do not open a second time');
assert(doorsOpen(plazaEvent));
use('doors', () => sceneIndex === 2);
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

for (const [choice, outcome, expected] of [
  ['speak', 'followed', [['broadcast', 0]]],
  [
    'speak',
    'resisted',
    [
      ['early-broadcast', 0],
      ['late-broadcast', 7],
    ],
  ],
  ['silence', 'followed', [['dead-air', 0]]],
  [
    'silence',
    'resisted',
    [
      ['dead-air', 0],
      ['intrusion', 3],
    ],
  ],
])
  test(`ending ${choice} after ${outcome}: cues fire once, in order, on time, before the card`, async () => {
    const g = await bootGame();
    g.run(`
goToScene(2);
prediction.phase = 'resolved';
prediction.outcome = '${outcome}';
prediction.ready = true;
prediction.clock = 10; // past the resisted close-up
walkTo(MARK.x, MARK.z);
interact('microphone');
var cues = [], captions = [];
const originalCue = endingCue;
endingCue = (id) => (cues.push([id, Math.round(ending.clock * 10) / 10]), originalCue(id));
finish('${choice}');
let cardAt = null;
until(() => {
  if (subtitle && !captions.includes(subtitle.text)) captions.push(subtitle.text);
  if (mode === 'end' && cardAt === null) cardAt = ending.clock;
  return mode === 'end';
});
assert.deepEqual(cues, ${JSON.stringify(expected)});
assert(cardAt >= ending.duration - 0.05, 'The card waits for the whole resolution');
assert.equal(captions.length, ending.captions.length, 'Every caption was shown');
step(2);
assert.equal(cues.length, ${expected.length}, 'Nothing fires again after the card');
`);
  });
