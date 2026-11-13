// Sprite sheets → cached, anchored cutouts.
//
// The sheets are not laid out consistently: within each walk row the figure drifts ~20% of a
// cell sideways, run rows sit at different offsets, and every frame's bounding box has a
// different height. Normalising each frame to its own box (as before) made the figure jitter
// and pulse in size. Instead:
//
// - Every frame is anchored horizontally on its head-and-shoulders centroid and vertically on
//   the ground: its lowest pixel for idle and walk (a foot is always planted), or the lowest
//   point of its row for run (so airborne frames lift).
// - Every sheet gets ONE pixel scale, from its standing height. Walk and run share a scale,
//   because they are drawn at the same size (equal head widths).
//
// Frame extraction and tinting happen once; gameplay draws cached canvases.

export const SHEETS = {
  idle: { cols: 4, rows: 2, ground: 'frame', scale: 'idle' },
  walk: { cols: 4, rows: 8, ground: 'frame', scale: 'walk' },
  run: { cols: 4, rows: 8, ground: 'row', scale: 'walk' },
};
const OPAQUE = 110, // alpha that counts as the figure (ignores soft matte edges)
  TORSO = 0.4, // top share of the figure used for the horizontal anchor
  PAD = 3;

// Pure: bounding box and head-and-shoulders centroid of one cell's alpha channel.
export function measureFrame(alpha, width, height) {
  let x0 = width,
    y0 = height,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (alpha[y * width + x] > OPAQUE) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return { x0: 0, y0: 0, x1: width - 1, y1: height - 1, torsoX: width / 2 };
  const limit = y0 + (y1 - y0) * TORSO;
  let sum = 0,
    count = 0;
  for (let y = y0; y <= limit; y++)
    for (let x = x0; x <= x1; x++)
      if (alpha[y * width + x] > OPAQUE) {
        sum += x;
        count++;
      }
  return { x0, y0, x1, y1, torsoX: count ? sum / count : (x0 + x1) / 2 };
}

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
};

// Pure: anchors and shared scale for a sheet, from per-frame measurements (row-major).
export function anchorSheet(metrics, cols, ground) {
  const frames = metrics.map((m, i) => {
    let groundY = m.y1;
    if (ground === 'row') {
      const row = Math.floor(i / cols) * cols;
      groundY = Math.max(...metrics.slice(row, row + cols).map((r) => r.y1));
    }
    return { ...m, groundY, height: groundY - m.y0 };
  });
  // Standing height: near the top of the range, so mid-stride dips stay dips.
  return {
    frames,
    standing: percentile(
      frames.map((f) => f.height),
      0.85,
    ),
  };
}

export class SpriteActor {
  constructor(images) {
    this.frames = {};
    this.standing = {};
    this.cache = new Map();
    const measured = {};
    for (const [type, image] of Object.entries(images)) {
      const { cols, rows, ground } = SHEETS[type];
      measured[type] = this.extract(image, cols, rows, ground);
    }
    for (const type of Object.keys(measured)) {
      this.frames[type] = measured[type].frames;
      this.standing[type] = measured[SHEETS[type].scale]?.standing ?? measured[type].standing;
    }
  }
  extract(image, cols, rows, ground) {
    const edge = (n, size, count) => Math.round((n * size) / count),
      maxW = edge(1, image.width, cols) + 1,
      maxH = edge(1, image.height, rows) + 1,
      read = document.createElement('canvas');
    read.width = maxW;
    read.height = maxH;
    const c = read.getContext('2d', { willReadFrequently: true }),
      cells = [],
      metrics = [];
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++) {
        // Integer cell edges: a 1:1 copy, no resampling and no bleed from neighbours.
        const sx = edge(col, image.width, cols),
          sy = edge(row, image.height, rows),
          w = edge(col + 1, image.width, cols) - sx,
          h = edge(row + 1, image.height, rows) - sy;
        c.clearRect(0, 0, maxW, maxH);
        c.drawImage(image, sx, sy, w, h, 0, 0, w, h);
        const data = c.getImageData(0, 0, w, h).data,
          alpha = new Uint8Array(w * h);
        for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
        const m = measureFrame(alpha, w, h),
          x0 = Math.max(0, m.x0 - PAD),
          y0 = Math.max(0, m.y0 - PAD),
          frame = document.createElement('canvas');
        frame.width = Math.min(w - 1, m.x1 + PAD) - x0 + 1;
        frame.height = Math.min(h - 1, m.y1 + PAD) - y0 + 1;
        frame
          .getContext('2d')
          .drawImage(read, x0, y0, frame.width, frame.height, 0, 0, frame.width, frame.height);
        cells.push({ image: frame, x0, y0 });
        metrics.push(m);
      }
    const sheet = anchorSheet(metrics, cols, ground);
    sheet.frames = sheet.frames.map((f, i) => ({
      image: cells[i].image,
      anchorX: f.torsoX - cells[i].x0,
      anchorY: f.groundY - cells[i].y0,
    }));
    return sheet;
  }
  pose(player) {
    const direction = ((Math.round(player.facing / (Math.PI / 4)) % 8) + 8) % 8,
      // A short hold keeps the stride from snapping to idle on one-frame stops.
      moving = player.moving || player.stillFor < 0.12,
      type = moving ? (player.running ? 'run' : 'walk') : 'idle',
      index = type === 'idle' ? direction : direction * 4 + (Math.floor(player.phase * 4) % 4);
    return { type, index, frame: this.frames[type][index] };
  }
  lit(type, index, tone) {
    const key = type + ':' + index + ':' + tone;
    if (this.cache.has(key)) return this.cache.get(key);
    let frame = this.frames[type][index],
      c = document.createElement('canvas');
    c.width = frame.image.width;
    c.height = frame.image.height;
    let x = c.getContext('2d');
    x.filter = 'brightness(1.04) contrast(1.05) saturate(.82)';
    x.drawImage(frame.image, 0, 0);
    x.filter = 'none';
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = TONES[tone] ?? TONES.neutral;
    x.fillRect(0, 0, c.width, c.height);
    this.cache.set(key, c);
    return c;
  }
  // `height` is the standing height in canvas pixels at the actor's depth.
  draw(ctx, player, x, y, height, tone, time, { reflection = false, alpha = 0.07 } = {}) {
    const { type, index, frame } = this.pose(player),
      image = this.lit(type, index, tone),
      breath = type === 'idle' ? 1 + Math.sin(time * 1.5) * 0.003 : 1,
      s = (height * breath) / this.standing[type],
      w = image.width * s,
      h = image.height * s,
      ax = frame.anchorX * s,
      ay = frame.anchorY * s;
    if (reflection) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, -0.23);
      ctx.globalAlpha = alpha;
      ctx.drawImage(image, -ax, -ay, w, h);
      ctx.restore();
    } else ctx.drawImage(image, x - ax, y - ay, w, h);
  }
}
const TONES = {
  warm: 'rgba(231,159,89,.15)',
  cool: 'rgba(85,171,188,.16)',
  shadow: 'rgba(5,12,20,.26)',
  ember: 'rgba(205,64,44,.16)',
  neutral: 'rgba(85,98,112,.07)',
};
export function turnToward(current, target, dt) {
  let delta = ((target - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return current + Math.sign(delta) * Math.min(Math.abs(delta), dt * 9);
}
