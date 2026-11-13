import test from 'node:test';
import assert from 'node:assert/strict';
import { composeEnding, SILENCE_DURATION } from '../dist/ending.js';

const base = { outcome: 'followed', caught: false, cut: false };

test('the two choices resolve differently in sound, picture and words', () => {
  const speak = composeEnding({ ...base, choice: 'speak' }),
    silence = composeEnding({ ...base, choice: 'silence' });
  assert.notEqual(speak.title, silence.title);
  assert.equal(speak.tower, 'blazing');
  assert.equal(silence.tower, 'dark');
  assert.equal(speak.rain, 'heavier');
  assert.equal(silence.rain, 'silent');
  assert.equal(silence.duration, SILENCE_DURATION, 'Seven seconds of dead air');
  assert.match(silence.weather, /silent/);
  assert.match(speak.weather, /harder/);
});

test('the prediction outcome resolves the seven-second motif', () => {
  const followed = composeEnding({ ...base, choice: 'speak' }),
    resisted = composeEnding({ ...base, choice: 'speak', outcome: 'resisted' });
  assert.match(followed.motif, /seven seconds are gone/);
  assert.match(resisted.motif, /seven seconds late/);
  assert.equal(resisted.echo, true, 'Resisting makes the broadcast echo');
  assert.equal(followed.echo, false);
  assert.match(
    composeEnding({ ...base, choice: 'silence', outcome: 'resisted' }).motif,
    /other you/,
  );
});

test('being caught changes the final shot and the lamp, not only a sentence', () => {
  const caught = composeEnding({ ...base, choice: 'silence', caught: true, cut: true }),
    clean = composeEnding({ ...base, choice: 'silence' });
  assert.equal(caught.shot, 'street');
  assert.equal(clean.shot, 'plaza');
  assert.equal(caught.lamp, 'red-to-dark');
  assert.match(caught.street, /red lamp that caught you/);
  assert.equal(composeEnding({ ...base, choice: 'speak', caught: true }).lamp, 'red');
});

test('cutting the feed is answered in the ending', () => {
  const speak = composeEnding({ ...base, choice: 'speak', cut: true });
  assert.equal(speak.shot, 'street');
  assert.equal(speak.lamp, 'relight');
  assert.match(speak.street, /lamp you put out/);
  const silence = composeEnding({ ...base, choice: 'silence', cut: true });
  assert.match(silence.street, /cut the feed/);
  assert.equal(silence.shot, 'plaza');
});

test('no ending exposes internal flags', () => {
  for (const choice of ['speak', 'silence'])
    for (const outcome of ['followed', 'resisted'])
      for (const [caught, cut] of [
        [false, false],
        [false, true],
        [true, true],
      ]) {
        const e = composeEnding({ choice, outcome, caught, cut });
        for (const text of [e.title, e.motif, e.street, e.weather])
          assert.doesNotMatch(text, /undefined|true|false|followed|resisted|caught:/);
      }
});
