// Hiding or leaving the page freezes every timeline; returning resumes the exact same moment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGame } from './support/harness.mjs';

async function studio() {
  const g = await bootGame();
  g.run(`goToScene(2); walkTo(VIEW.x, VIEW.z); interact('monitor');`);
  return g;
}

test('hiding during the preview freezes it behind the pause menu; resuming continues it', async () => {
  const g = await studio();
  g.run(`frames(1.5);`);
  const clock = g.run('prediction.clock');
  g.hide();
  g.run(`frames(20);`);
  assert.equal(g.run('mode'), 'pause');
  assert.equal(g.run('prediction.clock'), clock);
  g.show();
  g.run(`pause(false); frames(0.5);`);
  assert.equal(g.run('prediction.phase'), 'preview');
  assert(Math.abs(g.run('prediction.clock') - clock - 0.5) < 0.02, 'Continues from where it was');
});

test('hiding during the countdown freezes the deadline', async () => {
  const g = await studio();
  g.run(`until(() => prediction.phase === 'countdown'); frames(2);`);
  const left = g.run('predictionRemaining(prediction)');
  g.blur();
  g.run(`frames(30);`);
  assert.equal(g.run('predictionRemaining(prediction)'), left);
  g.focus();
  assert.equal(g.run('mode'), 'pause', 'Ordinary play returns to the pause menu');
  g.run(`pause(false); frames(1);`);
  assert(g.run('predictionRemaining(prediction)') < left);
});

test('hiding during the picture skip freezes the recovery and keeps input held', async () => {
  const g = await bootGame();
  g.run(`walkTo(-0.5, 13.6); until(() => recovering(broadcast)); frames(0.3);`);
  const recovery = g.run('broadcast.recovery');
  g.hide();
  g.run(`frames(10);`);
  assert.equal(g.run('broadcast.recovery'), recovery);
  g.show();
  g.run(`pause(false);`);
  assert(g.run('controlLocked()'), 'Still mid-skip: input stays held');
  g.run(`frames(2);`);
  assert(!g.run('recovering(broadcast)'));
});

test('hiding during a scene transition freezes it and resumes into the transition', async () => {
  const g = await bootGame();
  g.run(`cutBroadcast(broadcast); changeScene(1); frames(0.2);`);
  const clock = g.run('transitionClock');
  g.hide();
  g.run(`frames(5);`);
  assert.equal(g.run('mode'), 'transition', 'Not turned into a pause or play');
  assert.equal(g.run('transitionClock'), clock);
  g.show();
  g.run(`frames(1);`);
  assert.equal(g.run('mode'), 'play');
  assert.equal(g.run('sceneIndex'), 1);
});

test('hiding during the ending freezes it; the card still waits for the whole resolution', async () => {
  const g = await bootGame();
  g.run(`
goToScene(2);
Object.assign(prediction, { phase: 'resolved', outcome: 'resisted', ready: true, clock: 10 });
walkTo(MARK.x, MARK.z);
interact('microphone');
var cues = [];
const originalCue = endingCue;
endingCue = (id) => (cues.push([id, Math.round(ending.clock * 10) / 10]), originalCue(id));
finish('speak');
frames(3);
`);
  g.blur();
  g.hide();
  g.run(`frames(30);`);
  assert.equal(g.run('mode'), 'ending', 'Still the ending, not play or the card');
  assert(Math.abs(g.run('ending.clock') - 3) < 0.05);
  g.show();
  g.run(`frames(2);`);
  assert(Math.abs(g.run('ending.clock') - 3) < 0.05, 'Still suspended until focus returns');
  g.focus();
  g.run(`frames(3);`);
  assert(Math.abs(g.run('ending.clock') - 6) < 0.05, 'Resumes from the same moment');
  g.run(`until(() => mode === 'end');`);
  assert.equal(
    g.run('JSON.stringify(cues)'),
    JSON.stringify([
      ['early-broadcast', 0],
      ['late-broadcast', 7],
    ]),
    'Each cue exactly once, the late one still seven seconds in',
  );
});

test('duplicate blur and visibility events suspend and wake once', async () => {
  const g = await studio();
  g.run(`
var opened = 0;
const originalOpen = openDialog;
openDialog = (s) => (s === '#modal' && opened++, originalOpen(s));
`);
  g.blur();
  g.hide();
  g.blur();
  g.hide();
  assert.equal(g.run('opened'), 1, 'One pause menu');
  assert.equal(g.run('suspended'), true);
  g.show();
  g.focus();
  g.show();
  g.focus();
  assert.equal(g.run('suspended'), false);
  assert.equal(g.run('mode'), 'pause');
});

test('keys and taps are ignored while suspended', async () => {
  const g = await bootGame();
  g.run('goToScene(1);');
  g.blur();
  g.run(`pause(false);`); // even if play were somehow resumed underneath
  g.tap(0.5, 0.8);
  assert.equal(g.run('path.length'), 0);
});
