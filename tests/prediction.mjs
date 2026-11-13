// Unit tests for the studio prediction state machine.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPrediction,
  startPrediction,
  updatePrediction,
  feedFigure,
  remaining,
  controlHeld,
  MARK,
  VIEW,
  PREVIEW,
  LEAD,
  AFTERMATH,
  FACING_CAMERA,
} from '../dist/prediction.js';

const run = (state, seconds, player, inRoom = true, dt = 0.05) => {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += dt)
    events.push(...updatePrediction(state, dt, player, inRoom));
  return events;
};

test('phases advance on gameplay time: preview, countdown, resolved, ready', () => {
  const s = createPrediction(),
    player = { ...VIEW };
  assert.deepEqual(run(s, 10, player), [], 'Nothing happens before the monitor is examined');
  assert(startPrediction(s, player));
  assert(controlHeld(s));
  let events = run(s, PREVIEW, player);
  assert.deepEqual(events, ['released']);
  assert.equal(s.phase, 'countdown');
  assert(!controlHeld(s));
  assert.equal(remaining(s), LEAD);
  events = run(s, LEAD, player);
  assert.deepEqual(events, ['tick', 'tick', 'tick', 'tick', 'tick', 'tick', 'resisted']);
  assert.equal(s.phase, 'resolved');
  assert.deepEqual(run(s, AFTERMATH + 0.1, player), ['ready']);
  assert(s.ready);
  assert.deepEqual(run(s, 5, player), [], 'Resolved sequences stay quiet');
});

test('the outcome is decided by where the player stands at the deadline', () => {
  const s = createPrediction();
  startPrediction(s, VIEW);
  run(s, PREVIEW, VIEW);
  // On the mark early, then stepping off at the last moment, is resisting.
  run(s, LEAD - 0.5, { ...MARK });
  assert.equal(s.phase, 'countdown');
  run(s, 1, VIEW);
  assert.equal(s.outcome, 'resisted');

  const f = createPrediction();
  startPrediction(f, VIEW);
  run(f, PREVIEW, VIEW);
  run(f, LEAD, { x: MARK.x + 0.4, z: MARK.z - 0.3 });
  assert.equal(f.outcome, 'followed');
});

test('leaving the studio before the deadline counts as resisting', () => {
  const s = createPrediction();
  startPrediction(s, VIEW);
  run(s, PREVIEW + LEAD, { ...MARK }, false);
  assert.equal(s.outcome, 'resisted');
});

test('starting again never restarts the sequence', () => {
  const s = createPrediction();
  assert(startPrediction(s, VIEW));
  run(s, 2, VIEW);
  assert(!startPrediction(s, MARK));
  assert.equal(s.clock.toFixed(2), '2.00');
  assert.deepEqual(s.from, { x: VIEW.x, z: VIEW.z });
});

test('the monitor figure never mutates the real player', () => {
  const s = createPrediction(),
    player = { x: VIEW.x, z: VIEW.z, facing: 1, moving: false, running: false, phase: 0.3 },
    snapshot = JSON.stringify(player),
    out = {};
  assert.equal(
    feedFigure(s, player, out, () => 0),
    false,
    'Idle feed is live',
  );
  assert.equal(out.x, player.x);
  startPrediction(s, player);
  run(s, PREVIEW / 2, player);
  assert.equal(
    feedFigure(s, player, out, () => 0.5),
    true,
  );
  assert(out.moving, 'The future figure walks during the preview');
  assert(out.z > VIEW.z || out.x < VIEW.x);
  run(s, PREVIEW / 2 + LEAD + 2, player);
  feedFigure(s, player, out, () => 0);
  assert.deepEqual([out.x, out.z], [MARK.x, MARK.z], 'Resisted: the figure kept the appointment');
  assert.equal(out.facing, FACING_CAMERA, 'and turns to look at the camera');
  assert.equal(JSON.stringify(player), snapshot);
});
