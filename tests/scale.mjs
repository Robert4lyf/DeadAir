// The character's size in each scene is calibrated against objects painted into the
// backgrounds. Each reference gives its floor contact (u, v) and top edge in frame fractions,
// measured from dist/art; with the figure as a 1.75 m person, the implied real size of each
// object must be plausible. (Before calibration the studio desk came out at 2.35 m.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { scenes, groundPoint, screenPoint, actorHeightUnits } from '../dist/navigation.js';

const PERSON = 1.75;
const references = [
  { scene: 0, name: 'street bin', u: 0.8, v: 0.875, top: 0.8, range: [0.6, 0.95] },
  { scene: 0, name: 'street roller shutter', u: 0.9, v: 0.89, top: 0.6, range: [2.2, 3.1] },
  { scene: 1, name: 'studio doors (top step)', x: 0, z: 27.9, px: 63, range: [2.1, 2.8] },
  { scene: 2, name: 'studio desk', u: 0.58, v: 0.595, top: 0.465, range: [0.7, 0.85] },
  { scene: 2, name: 'office chair', u: 0.76, v: 0.668, top: 0.468, range: [0.85, 1.15] },
  { scene: 2, name: 'filing cabinet', u: 0.27, v: 0.865, top: 0.475, range: [1.2, 1.45] },
];

// Figure height in 720p pixels at a floor point, exactly as the game draws it.
function figurePx(s, x, z) {
  const a = screenPoint(s, x - 0.5, z),
    b = screenPoint(s, x + 0.5, z);
  return actorHeightUnits(s) * Math.hypot((b.u - a.u) * 1280, (b.v - a.v) * 720);
}

for (const r of references)
  test(`${scenes[r.scene].id}: a 1.75 m figure makes the ${r.name} a plausible size`, () => {
    const s = scenes[r.scene],
      p = r.x === undefined ? groundPoint(s, r.u, r.v) : { x: r.x, z: r.z },
      objectPx = r.px ?? (r.v - r.top) * 720,
      implied = (PERSON * objectPx) / figurePx(s, p.x, p.z);
    assert(
      implied >= r.range[0] && implied <= r.range[1],
      `${r.name} implies ${implied.toFixed(2)} m (expected ${r.range[0]}-${r.range[1]} m)`,
    );
  });

test('walking pace is the same in every scene, measured in body heights per second', async () => {
  const { bootGame } = await import('./support/harness.mjs');
  const g = await bootGame();
  const paces = g.run(`
cutBroadcast(broadcast);
const starts = [[0, 0, 4], [1, 0, 6], [2, 0, 4]];
starts.map(([scene, x, z]) => {
  sceneIndex = scene;
  player = makePlayer({ x, z });
  keys.clear();
  keys.add('KeyW');
  step(0.5);
  keys.clear();
  return Math.hypot(player.x - x, player.z - z) / 0.5 / scenes[scene].bodyUnits;
});
`);
  for (const p of paces) assert(Math.abs(p - paces[0]) < 0.05, `Paces differ: ${paces}`);
  assert(paces[0] > 0.7 && paces[0] < 1.1, `About a body height per second: ${paces[0]}`);
});
