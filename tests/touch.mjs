// Touch-only play: every interaction reachable by tapping the picture and on-screen buttons.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bootGame } from './support/harness.mjs';
import { scenes, screenPoint, interactables } from '../dist/navigation.js';

const centre = (id) => {
  const r = interactables.find((o) => o.id === id).rect;
  return [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
};
const ground = (scene, x, z) => {
  const p = screenPoint(scenes[scene], x, z);
  return [p.u, p.v];
};

test('a touch-only player can finish the game, including every new interaction', async () => {
  const g = await bootGame();
  const until = (code) => g.run(`until(() => ${code})`);
  // Street: the camera pans as the player walks. Tap ahead along the street, shelter under the
  // awning, then tap the crossing once it is in view.
  g.tap(...ground(0, 1.0, 9.5));
  until('!path.length');
  g.tap(...ground(0, 1.8, 15));
  until("broadcast.phase === 'clear'");
  g.run('step(2)'); // the camera leads toward the opened crossing
  const [cu, cv] = centre('crossing');
  assert(cu - g.run('camU') < 0.97, 'The crossing is on screen once it opens');
  g.tap(cu, cv);
  until('sceneIndex === 1 && mode === "play"');
  // Plaza: tap toward the doors; the beat plays; tap the doors once open.
  g.tap(...ground(1, 0, 18));
  until('doorsOpen(plazaEvent)');
  g.tap(...centre('doors'));
  until('sceneIndex === 2 && mode === "play"');
  // Studio: tap the monitor, then tap the microphone during the countdown.
  g.tap(...centre('monitor'));
  until("prediction.phase === 'countdown'");
  g.tap(...centre('microphone'));
  until("prediction.phase === 'resolved'");
  assert.equal(g.run('prediction.outcome'), 'followed', 'Tapping the microphone is enough time');
  until('prediction.ready');
  g.tap(...centre('microphone'));
  until("mode === 'choice'");
  g.click('#speak');
  until("mode === 'end'");
});

test('the on-screen prompt uses whatever is nearby', async () => {
  const g = await bootGame();
  g.run(`walkTo(2.4, 4.6); update(1 / 60); assert.equal(interaction.id, 'notice');`);
  g.click('#interaction');
  assert.equal(g.run('facts.notice'), true);
});

test('padded touch areas pick the nearest object and never overlap', () => {
  for (let scene = 0; scene < 3; scene++) {
    const rects = interactables.filter((o) => o.scene === scene && o.rect);
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) {
        const [a, b] = [rects[i].rect, rects[j].rect];
        const overlap = a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
        assert(!overlap, `${rects[i].id} and ${rects[j].id} hotspots overlap`);
      }
  }
});

test('a near-miss tap still finds a small object', async () => {
  const g = await bootGame();
  const r = interactables.find((o) => o.id === 'intercom').rect;
  g.tap(r[2] + 0.012, (r[1] + r[3]) / 2); // ~15 px to the right of the panel
  assert.equal(g.run('queuedAction'), 'intercom');
});

test('taps are ignored behind dialogs and during held sequences', async () => {
  const g = await bootGame();
  g.run('pause(true)');
  g.tap(0.5, 0.8);
  assert.equal(g.run('path.length'), 0, 'No walking behind the pause dialog');
  g.run('pause(false)');
  g.tap(0.5, 0.8);
  assert.equal(g.run('path.length'), 0, 'The tap that closed the dialog does not walk');
});

test('text the player asks for is never dropped behind an ambient line', async () => {
  const g = await bootGame();
  g.run(`
say('The lamps begin to hum.', 7, 4);
tell('CURFEW NOTICE: shelter beneath the awnings.', 3);
assert.equal(document.querySelector('#subtitle').textContent, 'CURFEW NOTICE: shelter beneath the awnings.');
step(3.1);
assert.equal(document.querySelector('#subtitle').textContent, 'The lamps begin to hum.', 'The interrupted line resumes');
say('A quieter line.', 3, 1);
assert.equal(document.querySelector('#subtitle').textContent, 'The lamps begin to hum.');
step(7.2); // the resumed line keeps its remaining seven seconds
assert.equal(document.querySelector('#subtitle').textContent, 'A quieter line.', 'Queued, not discarded');
`);
});
