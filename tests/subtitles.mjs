// Subtitles are phase-aware: instructions disappear when their phase ends, even if queued.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGame } from './support/harness.mjs';

const shown = (g) => g.el('#subtitle').textContent;

test('a countdown instruction interrupted by requested text does not return after its phase', async () => {
  const g = await bootGame();
  g.run(`
goToScene(2);
walkTo(VIEW.x, VIEW.z);
interact('monitor');
until(() => prediction.phase === 'countdown');
`);
  assert.match(shown(g), /seven seconds ahead/, 'The countdown instruction is showing');
  g.run(`tell('A long line the player asked for.', 8);`);
  assert.equal(shown(g), 'A long line the player asked for.', 'Requested text shows at once');
  g.run(`until(() => prediction.phase === 'resolved'); step(0.1);`);
  assert.doesNotMatch(shown(g), /seven seconds ahead/);
  g.run(`step(8);`);
  assert.doesNotMatch(shown(g), /seven seconds ahead|Go to it, or stay/, 'Never resumes');
});

test('the warning does not replay once the feed is cut', async () => {
  const g = await bootGame();
  g.run(`walkTo(1.4, 15.9); until(() => broadcast.phase === 'warning');`);
  assert.match(shown(g), /lamps begin to hum/);
  g.run(`interact('breaker'); step(8);`);
  assert.doesNotMatch(shown(g), /lamps begin to hum|Shelter beneath/);
});

test('the holding instruction ends with the hold', async () => {
  const g = await bootGame();
  g.run(`
walkTo(-0.5, 13.6);
until(() => recovering(broadcast));
until(() => !recovering(broadcast));
step(0.1);
`);
  assert.match(shown(g), /breaker is at the far end/);
  g.run(`use('breaker', () => facts.breaker); step(9);`);
  assert.doesNotMatch(shown(g), /breaker is at the far end|picture skips/);
});

test('narrative lines still resume after an interruption', async () => {
  const g = await bootGame();
  g.run(`
say('The speaker falls silent somewhere above you.', 6, 4);
tell('You check the notice.', 2);
step(2.2);
`);
  assert.equal(shown(g), 'The speaker falls silent somewhere above you.');
});

test('scene changes drop lines from the scene left behind', async () => {
  const g = await bootGame();
  g.run(`
say('A line that belongs to the street.', 6, 4);
say('Another street line, queued.', 6, 1);
cutBroadcast(broadcast);
goToScene(1);
step(0.1);
assert(!subtitleQueue.some((e) => e.text.includes('street')), 'Queue cleared of the street');
`);
  assert.doesNotMatch(shown(g), /street/);
});

test('restart and the ending clear stale instructions', async () => {
  const g = await bootGame();
  g.run(`
walkTo(-0.5, 13.6);
until(() => recovering(broadcast));
restart();
`);
  assert.equal(g.run('subtitleQueue.length'), 0);
  assert.match(shown(g), /Find the crossing/, 'Only the fresh intro remains');
  g.run(`
goToScene(2);
walkTo(VIEW.x, VIEW.z);
interact('monitor');
until(() => prediction.ready);
say('A queued studio line.', 6, 1);
use('microphone', () => mode === 'choice');
finish('silence');
`);
  assert.doesNotMatch(shown(g), /studio line|microphone/);
  assert.equal(g.run('subtitleQueue.length'), 0);
});
