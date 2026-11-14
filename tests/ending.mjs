import test from 'node:test';
import assert from 'node:assert/strict';
import { composeEnding, LATE, INTRUSION } from '../dist/ending.js';

const SILENCE_SECONDS = 7;

const base = { outcome: 'followed', caught: false, cut: false };

test('the two choices resolve differently in sound, picture and words', () => {
  const speak = composeEnding({ ...base, choice: 'speak' }),
    silence = composeEnding({ ...base, choice: 'silence' });
  assert.notEqual(speak.title, silence.title);
  assert.equal(speak.tower, 'blazing');
  assert.equal(silence.tower, 'dark');
  assert.equal(speak.rain, 'heavier');
  assert.equal(silence.rain, 'silent');
  assert.equal(silence.duration, SILENCE_SECONDS, 'Seven seconds of dead air');
  assert.match(silence.weather, /silent/);
  assert.match(speak.weather, /harder/);
});

test('every combination has its own timeline, and claims match their timing', () => {
  const at = (e, id) => e.cues.find((c) => c.id === id)?.at;
  const speakFollowed = composeEnding({ ...base, choice: 'speak' });
  assert.deepEqual(
    speakFollowed.cues.map((c) => c.id),
    ['broadcast'],
  );
  assert.match(speakFollowed.motif, /seven seconds are gone/);

  const speakResisted = composeEnding({ ...base, choice: 'speak', outcome: 'resisted' });
  assert.equal(at(speakResisted, 'early-broadcast'), 0);
  assert.equal(
    at(speakResisted, 'late-broadcast'),
    LATE,
    'The late voice really is seven seconds late',
  );
  assert.equal(LATE, 7);
  assert(speakResisted.duration >= LATE + 2, 'Time to hear the late voice before the card');
  assert.match(speakResisted.motif, /seven seconds later/);

  const silenceFollowed = composeEnding({ ...base, choice: 'silence' });
  assert.deepEqual(
    silenceFollowed.cues.map((c) => c.id),
    ['dead-air'],
    'Uninterrupted dead air',
  );
  assert.equal(silenceFollowed.duration, SILENCE_SECONDS);
  assert.equal(silenceFollowed.intrusion, null);

  const silenceResisted = composeEnding({ ...base, choice: 'silence', outcome: 'resisted' });
  assert.deepEqual(
    silenceResisted.cues.map((c) => c.id),
    ['dead-air', 'intrusion'],
  );
  assert.equal(at(silenceResisted, 'intrusion'), INTRUSION.from);
  assert(silenceResisted.intrusion.to < silenceResisted.duration - 2, 'Silence returns after it');
  assert.doesNotMatch(silenceResisted.motif, /\bsaid\b.*"|“/, 'No quoted, intelligible dialogue');

  for (const e of [speakFollowed, speakResisted, silenceFollowed, silenceResisted]) {
    assert(
      e.captions.length >= e.cues.filter((c) => c.at > 0).length,
      'Each later cue is captioned',
    );
    assert(Math.max(...e.cues.map((c) => c.at)) < e.duration, 'Every cue lands before the card');
  }
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
