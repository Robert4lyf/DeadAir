import { MARK, VIEW } from './prediction.js';
// Perspective floor calibration and small navigation mesh, independent of rendering.
export function homography(src, dst) {
  const a = [];
  for (let i = 0; i < 4; i++) {
    let [x, z] = src[i],
      [u, v] = dst[i];
    a.push([x, z, 1, 0, 0, 0, -u * x, -u * z, u]);
    a.push([0, 0, 0, x, z, 1, -v * x, -v * z, v]);
  }
  for (let k = 0; k < 8; k++) {
    let pivot = k;
    for (let j = k + 1; j < 8; j++) if (Math.abs(a[j][k]) > Math.abs(a[pivot][k])) pivot = j;
    [a[k], a[pivot]] = [a[pivot], a[k]];
    if (Math.abs(a[k][k]) < 1e-10) throw Error('Degenerate camera calibration');
    let p = a[k][k];
    for (let j = k; j < 9; j++) a[k][j] /= p;
    for (let i = 0; i < 8; i++)
      if (i !== k) {
        let f = a[i][k];
        for (let j = k; j < 9; j++) a[i][j] -= f * a[k][j];
      }
  }
  return a.map((row) => row[8]).concat(1);
}
export function project(h, x, z) {
  let d = h[6] * x + h[7] * z + 1;
  return { u: (h[0] * x + h[1] * z + h[2]) / d, v: (h[3] * x + h[4] * z + h[5]) / d, d };
}
export function unproject(h, u, v) {
  let a = h[0] - u * h[6],
    b = h[1] - u * h[7],
    c = u - h[2],
    d = h[3] - v * h[6],
    e = h[4] - v * h[7],
    f = v - h[5],
    q = a * e - b * d;
  if (Math.abs(q) < 1e-10) return null;
  return { x: (c * e - b * f) / q, z: (a * f - c * d) / q };
}
export function pointInPolygon(x, z, poly) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    let a = poly[i],
      b = poly[j];
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0])
      hit = !hit;
  }
  return hit;
}
export function blocked(scene, x, z) {
  const r = scene.bodyRadius ?? 0.18; // clearance kept from walls and obstacles
  if (
    !Number.isFinite(x + z) ||
    x < scene.bounds[0] + r ||
    x > scene.bounds[1] - r ||
    z < 0.15 ||
    z > scene.length - 0.15
  )
    return true;
  if (scene.walkable && !pointInPolygon(x, z, scene.walkable)) return true;
  return scene.obstacles.some(
    (o) => Math.abs(x - o.x) < o.w / 2 + r && Math.abs(z - o.z) < o.d / 2 + r,
  );
}
export function lineClear(scene, a, b) {
  let steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.15);
  for (let i = 0; i <= steps; i++) {
    let t = i / Math.max(1, steps);
    if (blocked(scene, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}
// The grid node nearest to `start` that is walkable and directly reachable from it.
// Plain rounding can land inside the wall margin when the player hugs a wall.
function startNode(scene, start, step) {
  const cx = Math.round(start.x / step),
    cz = Math.round(start.z / step),
    candidates = [];
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++) candidates.push({ x: (cx + i) * step, z: (cz + j) * step });
  candidates.sort(
    (a, b) => Math.hypot(a.x - start.x, a.z - start.z) - Math.hypot(b.x - start.x, b.z - start.z),
  );
  return candidates.find((p) => !blocked(scene, p.x, p.z) && lineClear(scene, start, p)) ?? null;
}
export function route(scene, start, goal) {
  if (blocked(scene, goal.x, goal.z)) return [];
  if (lineClear(scene, start, goal)) return [goal];
  let step = 0.4,
    key = (p) => Math.round(p.x / step) + ',' + Math.round(p.z / step),
    s = startNode(scene, start, step);
  if (!s) return [];
  let queue = [s],
    seen = new Map([[key(s), null]]),
    end = null;
  for (let head = 0; head < queue.length && head < 14000; head++) {
    let p = queue[head];
    if (Math.hypot(p.x - goal.x, p.z - goal.z) < 0.65 && lineClear(scene, p, goal)) {
      end = p;
      break;
    }
    for (let [dx, dz] of [
      [step, 0],
      [-step, 0],
      [0, step],
      [0, -step],
    ]) {
      let q = { x: p.x + dx, z: p.z + dz },
        k = key(q);
      if (seen.has(k) || blocked(scene, q.x, q.z) || !lineClear(scene, p, q)) continue;
      seen.set(k, p);
      queue.push(q);
    }
  }
  if (!end) return [];
  let path = [goal],
    p = end;
  while (p) {
    path.unshift(p);
    p = seen.get(key(p));
  }
  // Keep the start node: smoothing drops it when the player can see past it.
  let clean = [],
    prev = start;
  for (let i = 0; i < path.length; i++) {
    if (i + 1 < path.length && lineClear(scene, prev, path[i + 1])) continue;
    clean.push(path[i]);
    prev = path[i];
  }
  return clean;
}
const corners = (w, l) => [
  [-w, 0],
  [w, 0],
  [w, l],
  [-w, l],
];
export const scenes = [
  {
    // A side-on panorama (dist/art/street.webp, 2884×1024) the camera pans across. The street
    // runs left to right: z is distance along it (0.7 m per unit), x is depth across the
    // pavement from the kerb (x -3) to the back wall (x 3). Positions are measured from the art.
    id: 'street',
    name: 'The side street',
    district: 'LOW CITY',
    file: 'street.webp',
    span: 1.5846, // panorama width in frame widths
    lateral: 'z', // the axis parallel to the picture plane
    length: 28.8,
    bounds: [-3, 3],
    spawn: { x: 2.0, z: 1.6 }, // out of the stairwell doorway
    returnSpawn: { x: 0.5, z: 25 }, // back from the plaza, by the crossing
    bodyHeight: 2.5, // 1.75 m: doorway 2.1 m = 300 px, lamp post ~4.9 m = 694 px
    walkable: [
      [-2.75, 0.3],
      [2.75, 0.3],
      [2.75, 28.5],
      [-2.75, 28.5],
    ],
    obstacles: [
      { x: 1.67, z: 7.2, w: 2.67, d: 3.08 }, // planter against the wall
      { x: -2.85, z: 11.23, w: 0.5, d: 0.5 }, // street lamp at the kerb
    ],
    floor: [
      [0, 0.8789],
      [0, 0.7422],
      [1.5824, 0.7422],
      [1.5824, 0.8789],
    ],
    exit: { x: 0.5, z: 26.8 },
    exitLabel: 'Continue toward the tower',
  },
  {
    id: 'plaza',
    name: 'The studio approach',
    district: 'BROADCAST PLAZA',
    file: 'plaza.webp',
    length: 28,
    bounds: [-6, 6],
    spawn: { x: -1.4, z: 5 },
    returnSpawn: { x: 0, z: 24 }, // back from the studio, at the foot of the doors
    // Calibrated against the studio doors at the top of the stairs.
    nearHeight: 0.24,
    walkable: [
      [-5.65, 0.3],
      [5.65, 0.3],
      [5.5, 15],
      [5.4, 20],
      [5.6, 27.7],
      [-5.6, 27.7],
      [-5.4, 20],
      [-5.3, 10],
    ],
    obstacles: [{ x: -5.3, z: 4, w: 0.9, d: 1.7 }],
    floor: [
      [0.22, 1.05],
      [0.91, 1.05],
      [0.85, 0.675],
      [0.42, 0.675],
    ],
    occlusion: [
      [
        [0, 0],
        [0.1, 0],
        [0.1, 0.67],
        [0.145, 0.68],
        [0.22, 0.82],
        [0.22, 0.94],
        [0.13, 1],
        [0, 1],
      ],
    ],
    exit: { x: 0, z: 26.8 },
    exitLabel: 'Enter Studio 001',
  },
];
// The street lamp stands at the kerb, nearer the camera than anywhere the player can walk.
scenes[0].masks = [
  {
    // The pole only: the character never reaches the lamp head, whose light effects must
    // stay visible on top.
    polygon: [
      [0.6055, 0.27],
      [0.6286, 0.27],
      [0.6286, 0.8887],
      [0.6055, 0.8887],
    ],
    depth: 0.8789,
  },
];
scenes[1].masks = [
  {
    polygon: [
      [0, 0],
      [0.101, 0],
      [0.101, 0.67],
      [0.145, 0.68],
      [0.22, 0.82],
      [0.22, 0.94],
      [0.13, 1],
      [0, 1],
    ],
    depth: 1.1,
  },
];
scenes.push({
  id: 'studio',
  name: 'Studio 001',
  district: 'DEAD AIR',
  file: 'studio.webp',
  length: 17,
  bounds: [-4, 4],
  spawn: { x: -1.7, z: 3.3 },
  returnSpawn: { x: -1.7, z: 3.3 },
  // Calibrated against the desk, office chair and filing cabinet.
  nearHeight: 0.66,
  walkable: [
    [-3.7, 0.3],
    [3.7, 0.3],
    [3.3, 9],
    [2.3, 16.7],
    [-2.3, 16.7],
    [-3.3, 9],
  ],
  obstacles: [],
  floor: [
    [0.28, 1.02],
    [0.87, 1.02],
    [0.78, 0.62],
    [0.5, 0.62],
  ],
  masks: [
    {
      polygon: [
        [0.12, 0.43],
        [0.27, 0.44],
        [0.275, 0.84],
        [0.23, 0.88],
        [0.12, 0.81],
      ],
      depth: 0.88,
    },
    {
      polygon: [
        [0.83, 0.56],
        [0.93, 0.54],
        [1, 0.57],
        [1, 1],
        [0.94, 0.98],
        [0.94, 0.88],
        [0.85, 0.84],
      ],
      depth: 0.94,
    },
  ],
  exit: { x: MARK.x, z: MARK.z },
  exitLabel: 'Use the mixing desk',
});
for (let s of scenes) {
  s.h = homography(corners(s.bounds[1], s.id === 'plaza' ? 20 : s.length), s.floor);
  if (s.id === 'plaza')
    s.stairs = homography(
      [
        [-6, 20],
        [6, 20],
        [6, 28],
        [-6, 28],
      ],
      [
        [0.42, 0.675],
        [0.85, 0.675],
        [0.82, 0.572],
        [0.64, 0.572],
      ],
    );
  // Body height is the ruler for everything scale-dependent in a scene: walking speed, stride
  // and the clearance kept from walls (about a shoulder's half-width).
  s.bodyUnits = actorHeightUnits(s);
  s.bodyRadius = 0.09 * s.bodyUnits;
}
// How tall the character is in world units on a scene's floor (its calibration differs per
// camera). Used to match the walk cycle to ground speed so feet do not slide.
export function actorHeightUnits(scene) {
  if (scene.bodyHeight) return scene.bodyHeight;
  const z = Math.min(8, scene.length / 2),
    d = project(scene.h, 0, z).d,
    a = project(scene.h, -0.5, z),
    b = project(scene.h, 0.5, z);
  return (scene.nearHeight * 9) / d / Math.hypot((b.u - a.u) * 16, (b.v - a.v) * 9);
}
export function screenPoint(scene, x, z) {
  return project(scene.stairs && z > 20 ? scene.stairs : scene.h, x, z);
}
export function groundPoint(scene, u, v) {
  if (scene.stairs && v < 0.675) {
    let p = unproject(scene.stairs, u, v);
    if (p && p.z >= 20 && p.z <= 28) return p;
  }
  return unproject(scene.h, u, v);
}

export const interactables = [
  {
    id: 'notice',
    scene: 0,
    label: 'Read the curfew notice',
    x: 2.4,
    z: 4.4,
    reach: 1.7,
    rect: [0.1846, 0.4883, 0.3, 0.6348],
  },
  {
    id: 'intercom',
    scene: 0,
    label: 'Listen to the service intercom',
    x: 2.4,
    z: 9.6,
    reach: 1.7,
    rect: [0.5088, 0.5039, 0.544, 0.5781],
  },
  {
    id: 'breaker',
    scene: 0,
    label: 'Cut the service feed',
    x: 2.4,
    z: 19.8,
    reach: 1.7,
    rect: [1.0692, 0.5078, 1.111, 0.6191],
  },
  {
    id: 'crossing',
    scene: 0,
    label: 'Cross toward the tower',
    x: 0.5,
    z: 26.8,
    reach: 1.65,
    rect: [1.4154, 0.6836, 1.5846, 0.873],
  },
  {
    id: 'backStreet',
    scene: 1,
    label: 'Return to the side street',
    x: -1.4,
    z: 2.3,
    reach: 1.4,
    rect: null,
  },
  {
    id: 'doors',
    scene: 1,
    label: 'Enter Studio 001',
    x: 0,
    z: 26.8,
    reach: 1.6,
    rect: [0.64, 0.42, 0.85, 0.595],
  },
  {
    id: 'backPlaza',
    scene: 2,
    label: 'Return to the plaza',
    x: -1.7,
    z: 2.3,
    reach: 1.4,
    rect: null,
  },
  {
    // `stand`: using it walks the player to this exact spot first, then acts on arrival.
    // The prediction must always begin here, well clear of the tape mark.
    id: 'monitor',
    scene: 2,
    label: 'Watch the studio monitor',
    x: VIEW.x,
    z: VIEW.z,
    reach: 2.6,
    stand: true,
    rect: [0.705, 0.345, 0.795, 0.47],
  },
  {
    // Reach stays inside the tape mark, so walking over to use it always lands on the mark.
    id: 'microphone',
    scene: 2,
    label: 'Step up to the microphone',
    x: MARK.x,
    z: MARK.z,
    reach: 1.6,
    rect: [0.6, 0.29, 0.69, 0.47],
  },
];
