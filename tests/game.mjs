import assert from 'node:assert/strict';
import {
  scenes,
  project,
  unproject,
  screenPoint,
  groundPoint,
  blocked,
  lineClear,
  route,
} from '../dist/navigation.js';
for (let scene of scenes) {
  for (let z = 0.3; z < scene.length - 0.3; z += 1.1)
    for (let x = scene.bounds[0] + 0.3; x < scene.bounds[1] - 0.3; x += 0.7) {
      let p = screenPoint(scene, x, z),
        q = groundPoint(scene, p.u, p.v);
      assert(q);
      assert(
        Math.abs(x - q.x) < 1e-7 && Math.abs(z - q.z) < 1e-7,
        'Camera projection must round-trip accurately',
      );
      assert(Math.abs(p.d) > 0.01, 'Camera calibration must stay finite');
    }
  let path = route(scene, scene.spawn, scene.exit);
  assert(path.length, 'Each studio approach must be reachable');
  let prev = scene.spawn;
  for (let p of path) {
    assert(lineClear(scene, prev, p), 'Navigation must not cut through an obstacle');
    prev = p;
  }
  assert(!blocked(scene, scene.exit.x, scene.exit.z));
  assert(blocked(scene, -100, 10));
  assert(blocked(scene, 0, scene.length + 10));
  // Scenes that recede from the camera make the actor shrink with distance; the side-on
  // street pans instead, with the walkway parallel to the picture.
  if (scene.lateral === 'z')
    assert(
      screenPoint(scene, 0, scene.length - 1).u > 1 + screenPoint(scene, 0, 1).u * 0,
      'The panorama street extends past one frame width',
    );
  else
    assert(
      project(scene.h, 0, 2).d < project(scene.h, 0, scene.length - 2).d,
      'Actor shrinks with depth',
    );
  console.log('PASS:', scene.name, 'perspective, navigation and exit');
}
// Walking along the wall from one side of the planter to the other needs a detour.
const s = scenes[0],
  planter = s.obstacles[0],
  from = { x: 2.4, z: planter.z - planter.d / 2 - 0.8 },
  to = { x: 2.4, z: planter.z + planter.d / 2 + 0.8 },
  around = route(s, from, to);
assert(around.length > 1, 'Click movement must find a detour around the planter');
let p = from;
for (let next of around) {
  assert(lineClear(s, p, next));
  p = next;
}
const stairs = scenes[1];
for (let x of [-5, 0, 5]) {
  let a = project(stairs.h, x, 20),
    b = project(stairs.stairs, x, 20);
  assert(Math.hypot(a.u - b.u, a.v - b.v) < 1e-7, 'Stair seam must not jump');
}
console.log('PASS: obstacle detour, floor-to-stair seam, and image-space clicks');

// Every walkable spot, including ones hugging walls and obstacles, must be able to
// route to the scene exit without cutting through anything.
for (let scene of scenes) {
  let checked = 0;
  for (let z = 0.2; z < scene.length; z += 0.29)
    for (let x = scene.bounds[0]; x < scene.bounds[1]; x += 0.11) {
      if (blocked(scene, x, z)) continue;
      checked++;
      const start = { x, z },
        path = route(scene, start, scene.exit);
      assert(path.length, `No route to exit in ${scene.id} from ${x.toFixed(2)},${z.toFixed(2)}`);
      let prev = start;
      for (let next of path) {
        assert(lineClear(scene, prev, next), `Route cuts through an obstacle in ${scene.id}`);
        prev = next;
      }
    }
  assert(checked > 500);
}
console.log('PASS: every walkable start point routes to its exit');
