import test from 'node:test';
import assert from 'node:assert/strict';
import { measureFrame, anchorSheet, turnToward } from '../dist/sprites.js';

// A 40×60 cell with a 10×50 "figure" whose top fifth (the head) sits at `headX`.
function cell({ left = 10, bottom = 55, headX = 15, height = 50 } = {}) {
  const w = 40,
    h = 60,
    a = new Uint8Array(w * h),
    top = bottom - height;
  for (let y = top; y <= bottom; y++) for (let x = left; x < left + 10; x++) a[y * w + x] = 255;
  for (let y = top; y < top + 10; y++)
    for (let x = headX - 3; x <= headX + 3; x++) a[y * w + x] = 255;
  return measureFrame(a, w, h);
}

test('measureFrame finds the figure box and its head-and-shoulders centre', () => {
  const m = cell({ left: 10, headX: 14 });
  assert.equal(m.y1, 55);
  assert.equal(m.x0, 10);
  assert(Math.abs(m.torsoX - 14) < 1.5, 'Anchor follows the upper body, not the cell centre');
  const empty = measureFrame(new Uint8Array(16), 4, 4);
  assert.equal(empty.x1, 3);
});

test('frames drifting across their cells are anchored on the body, not the cell', () => {
  const drifting = [0, 5, 10, 15].map((dx) => cell({ left: 8 + dx, headX: 13 + dx }));
  const { frames } = anchorSheet(drifting, 4, 'frame');
  const anchors = frames.map((f) => f.torsoX - f.x0);
  assert(Math.max(...anchors) - Math.min(...anchors) < 0.5, 'Same anchor offset in every frame');
});

test('ground lines: planted per frame for walking, shared per row for running', () => {
  const row = [cell({ bottom: 55 }), cell({ bottom: 50, height: 45 }), cell(), cell()];
  assert.deepEqual(
    anchorSheet(row, 4, 'frame').frames.map((f) => f.groundY),
    [55, 50, 55, 55],
  );
  assert.deepEqual(
    anchorSheet(row, 4, 'row').frames.map((f) => f.groundY),
    [55, 55, 55, 55],
    'An airborne run frame keeps the row ground, so it lifts',
  );
});

test('one standing height per sheet: no per-frame scale pulsing', () => {
  const heights = [50, 48, 50, 44].map((height) => cell({ height }));
  const sheet = anchorSheet(heights, 4, 'frame');
  assert.equal(sheet.standing, 50, 'Near the top of the range, so a dipping pose stays shorter');
});

test('turns take the shortest path', () => {
  assert(Math.abs(turnToward(Math.PI - 0.1, -Math.PI + 0.1, 0.1) - (Math.PI + 0.1)) < 0.001);
});
