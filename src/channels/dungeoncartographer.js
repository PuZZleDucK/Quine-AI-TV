import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

export function createChannel({ seed, audio }) {
  const baseSeed = seed >>> 0;

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  const cycleDur = 60;
  let cycleIndex = 0;
  let cycleT = 0;

  let tableC = null;
  let paper = { x: 0, y: 0, w: 0, h: 0 };
  let mapRect = { x: 0, y: 0, w: 0, h: 0 };

  let rand = mulberry32(baseSeed);

  let rooms = [];
  let corridors = [];
  let strokes = [];
  let doors = [];
  let traps = [];
  let secret = null;

  let inkStep = 0.22;
  let inkStart = 6.0;

  let lastInkRoom = -1;
  let trapBeeped = new Set();
  let secretBeeped = false;

  let drone = null;
  let noise = null;
  let audioHandle = null;

  function pick(arr) {
    return arr[(rand() * arr.length) | 0];
  }

  function lerp(a, b, u) {
    return a + (b - a) * u;
  }

  function ease(u) {
    u = clamp(u, 0, 1);
    return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  }

  function roundRectPath(ctx, x, y, ww, hh, r) {
    const rr = Math.max(0, Math.min(r, ww * 0.5, hh * 0.5));
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, rr);
    ctx.arcTo(x + ww, y + hh, x, y + hh, rr);
    ctx.arcTo(x, y + hh, x, y, rr);
    ctx.arcTo(x, y, x + ww, y, rr);
    ctx.closePath();
  }

  function cycleSeed(i) {
    // Deterministic per-cycle salt.
    return (baseSeed ^ Math.imul((i + 1) >>> 0, 0x9e3779b1)) >>> 0;
  }

  function setLayout() {
    paper = {
      x: Math.floor(w * 0.12),
      y: Math.floor(h * 0.1),
      w: Math.floor(w * 0.76),
      h: Math.floor(h * 0.8),
    };

    const m = Math.floor(Math.min(paper.w, paper.h) * 0.08);
    mapRect = {
      x: paper.x + m,
      y: paper.y + m,
      w: paper.w - 2 * m,
      h: paper.h - 2 * m,
    };
  }

  function sx(x) {
    return mapRect.x + x * mapRect.w;
  }

  function sy(y) {
    return mapRect.y + y * mapRect.h;
  }

  function renderTable() {
    tableC = document.createElement('canvas');
    tableC.width = w;
    tableC.height = h;
    const ctx = tableC.getContext('2d');

    // Wood base
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#2b170e');
    g.addColorStop(1, '#120804');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Grain
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = '#3a2216';
    ctx.lineWidth = 1;
    const lines = Math.floor((w + h) / 6);
    for (let i = 0; i < lines; i++) {
      const y0 = (i / lines) * h;
      ctx.beginPath();
      ctx.moveTo(0, y0 + (rand() - 0.5) * 10);
      ctx.bezierCurveTo(w * 0.3, y0 + (rand() - 0.5) * 14, w * 0.7, y0 + (rand() - 0.5) * 14, w, y0 + (rand() - 0.5) * 10);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Paper
    const px = paper.x;
    const py = paper.y;
    const pw = paper.w;
    const ph = paper.h;

    ctx.save();
    const pg = ctx.createLinearGradient(px, py, px, py + ph);
    pg.addColorStop(0, '#f3ecd8');
    pg.addColorStop(1, '#e7dcc0');
    ctx.fillStyle = pg;
    ctx.fillRect(px, py, pw, ph);

    // Paper edge + slight wear
    ctx.strokeStyle = 'rgba(60, 40, 25, 0.45)';
    ctx.lineWidth = Math.max(2, Math.floor(Math.min(w, h) * 0.004));
    ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);

    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#7a5a3a';
    for (let i = 0; i < 30; i++) {
      const rx = px + rand() * pw;
      const ry = py + rand() * ph;
      const r = 6 + rand() * 24;
      ctx.beginPath();
      ctx.arc(rx, ry, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Vignette
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.25, w * 0.5, h * 0.5, Math.min(w, h) * 0.9);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  function buildDungeonForCycle(i) {
    rand = mulberry32(cycleSeed(i));

    // Grid-based walk to carve a network, then decorate.
    const gx = 9;
    const gy = 6;
    const steps = 26 + ((rand() * 10) | 0);

    let cx = (gx / 2) | 0;
    let cy = (gy / 2) | 0;

    const visited = new Map();
    const visitKey = (x, y) => `${x},${y}`;
    visited.set(visitKey(cx, cy), { x: cx, y: cy, count: 1 });

    corridors = [];

    for (let s = 0; s < steps; s++) {
      const dirs = [
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 },
      ];
      const d = pick(dirs);
      const nx = clamp(cx + d.dx, 0, gx - 1);
      const ny = clamp(cy + d.dy, 0, gy - 1);
      if (nx === cx && ny === cy) continue;

      corridors.push({ a: { x: cx, y: cy }, b: { x: nx, y: ny } });
      cx = nx;
      cy = ny;
      const k = visitKey(cx, cy);
      const v = visited.get(k);
      if (v) v.count++;
      else visited.set(k, { x: cx, y: cy, count: 1 });
    }

    const cells = [...visited.values()];
    // Prefer bigger rooms in more-visited cells.
    rooms = cells.map((c, idx) => {
      const intensity = clamp((c.count - 1) / 4, 0, 1);
      const grow = 0.055 + intensity * 0.04 + rand() * 0.02;
      const base = 0.08 + rand() * 0.03;

      const x = (c.x + 0.5) / gx;
      const y = (c.y + 0.5) / gy;

      const rx = 0.09 + x * 0.82;
      const ry = 0.11 + y * 0.78;

      const rw = clamp(base + grow, 0.09, 0.18);
      const rh = clamp(base * (0.75 + rand() * 0.5) + grow * 0.6, 0.07, 0.16);

      const names = ['CRYPT', 'ARMORY', 'LIBRARY', 'HALL', 'VAULT', 'ALTAR', 'CELL', 'STUDY', 'FORGE', 'POOL', 'DEN', 'ARCHIVE', 'LOFT', 'SUMP'];

      return {
        id: idx,
        x: clamp(rx - rw * 0.5, 0.06, 0.94 - rw),
        y: clamp(ry - rh * 0.5, 0.08, 0.92 - rh),
        w: rw,
        h: rh,
        label: pick(names),
      };
    });

    // Corridor segments in map space.
    const cellToMap = (c) => ({
      x: 0.09 + ((c.x + 0.5) / gx) * 0.82,
      y: 0.11 + ((c.y + 0.5) / gy) * 0.78,
    });

    const segs = corridors.map((e) => ({ a: cellToMap(e.a), b: cellToMap(e.b) }));

    // Pick a secret-door segment.
    secret = null;
    if (segs.length) {
      const sidx = (rand() * segs.length) | 0;
      const s = segs[sidx];
      const u0 = 0.35 + rand() * 0.3;
      const u1 = u0 + 0.14;
      secret = {
        a: { x: lerp(s.a.x, s.b.x, u0), y: lerp(s.a.y, s.b.y, u0) },
        b: { x: lerp(s.a.x, s.b.x, u1), y: lerp(s.a.y, s.b.y, u1) },
        t0: 48.0,
        t1: 55.0,
      };
    }

    // Doors: small ticks on some corridor ends.
    doors = [];
    for (let i2 = 0; i2 < segs.length; i2++) {
      if (rand() < 0.55) {
        const s = segs[i2];
        const u = rand() < 0.5 ? 0.14 : 0.86;
        const p = { x: lerp(s.a.x, s.b.x, u), y: lerp(s.a.y, s.b.y, u) };
        const dx = s.b.x - s.a.x;
        const dy = s.b.y - s.a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const tick = 0.018 + rand() * 0.01;
        doors.push({
          a: { x: p.x - nx * tick, y: p.y - ny * tick },
          b: { x: p.x + nx * tick, y: p.y + ny * tick },
        });
      }
    }

    // Traps: points along random corridor segments.
    traps = [];
    const trapCount = Math.min(7, Math.max(4, 3 + ((rand() * 6) | 0)));
    for (let k = 0; k < trapCount && segs.length; k++) {
      const s = pick(segs);
      const u = 0.18 + rand() * 0.64;
      traps.push({
        x: lerp(s.a.x, s.b.x, u),
        y: lerp(s.a.y, s.b.y, u),
        at: 30 + k * (1.9 + rand() * 1.1),
        kind: pick(['SPIKES', 'PIT', 'DARTS', 'RUNE']),
      });
    }

    // Strokes timeline.
    strokes = [];

    // Corridor strokes first (so rooms feel "placed" on top).
    for (const s of segs) {
      strokes.push({ kind: 'seg', a: s.a, b: s.b, phase: 'ink' });
    }
    for (const r of rooms) {
      const a = { x: r.x, y: r.y };
      const b = { x: r.x + r.w, y: r.y };
      const c = { x: r.x + r.w, y: r.y + r.h };
      const d = { x: r.x, y: r.y + r.h };
      strokes.push({ kind: 'seg', a, b, phase: 'ink' });
      strokes.push({ kind: 'seg', a: b, b: c, phase: 'ink' });
      strokes.push({ kind: 'seg', a: c, b: d, phase: 'ink' });
      strokes.push({ kind: 'seg', a: d, b: a, phase: 'ink' });
    }

    // Detail strokes (doors).
    for (const d2 of doors) {
      strokes.push({ kind: 'seg', a: d2.a, b: d2.b, phase: 'detail' });
    }

    // Assign schedule.
    const ink = strokes.filter((s) => s.phase === 'ink');
    const detail = strokes.filter((s) => s.phase === 'detail');

    inkStep = 0.22;
    inkStart = 6.0;

    ink.forEach((s, idx) => {
      s.start = inkStart + idx * inkStep;
      s.dur = 0.75 + rand() * 0.35;
      s.w = 2.2 + rand() * 1.2;
    });

    const detailStart = 24.0;
    detail.forEach((s, idx) => {
      s.start = detailStart + idx * 0.12;
      s.dur = 0.5 + rand() * 0.25;
      s.w = 1.8 + rand() * 0.9;
    });

    lastInkRoom = -1;
    trapBeeped = new Set();
    secretBeeped = false;
  }

  function onResize(width, height, DPR = 1) {
    w = width;
    h = height;
    dpr = DPR;
    t = 0;
    cycleIndex = 0;
    cycleT = 0;
    setLayout();

    // Render table+paper using a stable rand for this resize.
    rand = mulberry32(baseSeed ^ 0x5a17c0de);
    renderTable();

    buildDungeonForCycle(0);
  }

  function onAudioOn() {
    if (!audio.enabled) return;
    drone = simpleDrone(audio, { root: 65.4, detune: 1.2, gain: 0.035 });
    noise = audio.noiseSource({ type: 'pink', gain: 0.02 });
    try { noise.start(); } catch {}

    audioHandle = {
      stop() {
        try { drone?.stop?.(); } catch {}
        try { noise?.stop?.(); } catch {}
      },
    };
    audio.setCurrent(audioHandle);
  }

  function onAudioOff() {
    try { audioHandle?.stop?.(); } catch {}
    drone = null;
    noise = null;
    audioHandle = null;
  }

  function destroy() {
    onAudioOff();
  }

  function update(dt) {
    t += dt;

    const nextCycleIndex = Math.floor(t / cycleDur);
    cycleT = t - nextCycleIndex * cycleDur;

    if (nextCycleIndex !== cycleIndex) {
      cycleIndex = nextCycleIndex;
      buildDungeonForCycle(cycleIndex);
    }

    // Soft "scribble" accents: one tiny tick per room (not per stroke).
    const inkProgress = Math.floor((cycleT - inkStart) / inkStep);
    const roomIdx = Math.floor(inkProgress / 4);
    if (audio.enabled && cycleT > inkStart && roomIdx !== lastInkRoom && roomIdx >= 0 && roomIdx < rooms.length) {
      lastInkRoom = roomIdx;
      audio.beep({ freq: 520 + (rand() * 80) | 0, dur: 0.04, gain: 0.018, type: 'square' });
    }

    // Trap pings.
    if (audio.enabled) {
      for (let i = 0; i < traps.length; i++) {
        const tr = traps[i];
        if (cycleT >= tr.at && !trapBeeped.has(i)) {
          trapBeeped.add(i);
          audio.beep({ freq: 880 + (rand() * 200) | 0, dur: 0.05, gain: 0.03, type: 'triangle' });
        }
      }
    }

    // Secret-door shimmer cue.
    if (audio.enabled && secret && !secretBeeped && cycleT >= secret.t0) {
      secretBeeped = true;
      audio.beep({ freq: 260, dur: 0.09, gain: 0.03, type: 'sine' });
      audio.beep({ freq: 392, dur: 0.06, gain: 0.02, type: 'sine' });
    }
  }

  function drawInkSeg(ctx, a, b, u, width, wobble = 0.0) {
    u = clamp(u, 0, 1);
    const x1 = sx(a.x);
    const y1 = sy(a.y);
    const x2 = sx(lerp(a.x, b.x, u));
    const y2 = sy(lerp(a.y, b.y, u));

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    const j = wobble * Math.sin((x1 * 0.01 + y1 * 0.013 + t * 2.1) * 2.0);

    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1 + nx * j, y1 + ny * j);
    ctx.lineTo(x2 + nx * j, y2 + ny * j);
    ctx.stroke();
  }

  function drawCandle(ctx) {
    const cx = paper.x + paper.w * 0.1;
    const cy = paper.y + paper.h * 0.16;

    const flick = 0.7 + 0.3 * Math.sin(t * 4.8) + 0.12 * Math.sin(t * 10.6);

    // Glow
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const r0 = Math.min(w, h) * 0.05;
    const r1 = Math.min(w, h) * 0.42;
    const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
    g.addColorStop(0, `rgba(255, 210, 140, ${0.22 * flick})`);
    g.addColorStop(0.35, `rgba(255, 170, 90, ${0.12 * flick})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // Candle body
    const bw = Math.max(10, Math.floor(Math.min(w, h) * 0.03));
    const bh = Math.max(22, Math.floor(Math.min(w, h) * 0.09));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#f0e6cf';
    ctx.strokeStyle = 'rgba(70,40,20,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    roundRectPath(ctx, -bw * 0.5, 0, bw, bh, 6);
    ctx.fill();
    ctx.stroke();

    // Flame
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(255, 210, 120, ${0.9 * flick})`;
    ctx.beginPath();
    ctx.ellipse(0, -bh * 0.08, bw * 0.22, bh * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 120, 40, ${0.35 * flick})`;
    ctx.beginPath();
    ctx.ellipse(0, -bh * 0.08, bw * 0.15, bh * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function draw(ctx) {
    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);
    if (tableC) ctx.drawImage(tableC, 0, 0);

    drawCandle(ctx);

    // Map grid (faint)
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = 'rgba(40, 25, 15, 0.6)';
    ctx.lineWidth = 1;
    const grid = Math.max(24, Math.floor(Math.min(mapRect.w, mapRect.h) / 12));
    for (let x = mapRect.x; x <= mapRect.x + mapRect.w + 0.5; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, mapRect.y);
      ctx.lineTo(x, mapRect.y + mapRect.h);
      ctx.stroke();
    }
    for (let y = mapRect.y; y <= mapRect.y + mapRect.h + 0.5; y += grid) {
      ctx.beginPath();
      ctx.moveTo(mapRect.x, y);
      ctx.lineTo(mapRect.x + mapRect.w, y);
      ctx.stroke();
    }
    ctx.restore();

    // Ink strokes
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Slight shadow for ink depth.
    ctx.shadowColor = 'rgba(0,0,0,0.22)';
    ctx.shadowBlur = Math.max(2, Math.floor(Math.min(w, h) * 0.004));

    const inkCol = 'rgba(40, 25, 15, 0.92)';
    const detailCol = 'rgba(30, 18, 10, 0.82)';

    for (const s of strokes) {
      const u = ease((cycleT - s.start) / s.dur);
      if (u <= 0) continue;
      ctx.strokeStyle = s.phase === 'detail' ? detailCol : inkCol;
      drawInkSeg(ctx, s.a, s.b, u, s.w, s.phase === 'detail' ? 0.6 : 0.35);
    }

    ctx.restore();

    // Room labels (fade in)
    const labelFade = clamp((cycleT - 20) / 6, 0, 1);
    if (labelFade > 0) {
      ctx.save();
      ctx.globalAlpha = 0.7 * labelFade;
      ctx.fillStyle = 'rgba(40, 25, 15, 0.9)';
      ctx.font = `${Math.max(12, Math.floor(Math.min(w, h) * 0.022))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const r of rooms) {
        const x = sx(r.x + r.w * 0.5);
        const y = sy(r.y + r.h * 0.5);
        ctx.fillText(r.label, x, y);
      }
      ctx.restore();
    }

    // Trap pings
    for (let i = 0; i < traps.length; i++) {
      const tr = traps[i];
      const age = cycleT - tr.at;
      if (age < -0.2 || age > 1.2) continue;
      const u = clamp(age / 1.0, 0, 1);
      const pulse = 1 - u;
      const x = sx(tr.x);
      const y = sy(tr.y);

      ctx.save();
      ctx.globalAlpha = 0.75 * pulse;
      ctx.strokeStyle = 'rgba(140, 30, 20, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, (8 + u * 18) * dpr, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(140, 30, 20, 0.85)';
      ctx.font = `${Math.max(11, Math.floor(Math.min(w, h) * 0.018))}px ui-monospace, monospace`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(tr.kind, x + 10 * dpr, y - 6 * dpr);
      ctx.restore();
    }

    // Secret door shimmer
    if (secret) {
      const u = clamp((cycleT - secret.t0) / (secret.t1 - secret.t0), 0, 1);
      if (u > 0 && u < 1) {
        const sh = 0.5 + 0.5 * Math.sin(t * 10.0);
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.55 * (1 - Math.abs(u * 2 - 1));
        ctx.strokeStyle = `rgba(80, 200, 255, ${0.75 * sh})`;
        ctx.lineWidth = Math.max(3, Math.floor(Math.min(w, h) * 0.006));
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx(secret.a.x), sy(secret.a.y));
        ctx.lineTo(sx(secret.b.x), sy(secret.b.y));
        ctx.stroke();
        ctx.restore();
      }
    }

    // Header + phase UI
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(40, 25, 15, 0.92)';
    ctx.font = `${Math.max(13, Math.floor(Math.min(w, h) * 0.024))}px ui-monospace, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText("Dungeon Cartographer's Desk", paper.x + 14 * dpr, paper.y + 12 * dpr);

    const phase = cycleT < 20 ? 'DRAFT' : cycleT < 46 ? 'DETAILS' : 'SECRET DOOR';
    ctx.globalAlpha = 0.65;
    ctx.fillText(`PHASE: ${phase}`, paper.x + 14 * dpr, paper.y + 42 * dpr);
    ctx.restore();

    // Reset wipe
    const wipe = clamp((cycleT - 56) / 4, 0, 1);
    if (wipe > 0) {
      ctx.save();
      ctx.globalAlpha = 0.6 * wipe;
      ctx.fillStyle = '#1a0f08';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  return {
    onResize,
    update,
    draw,
    onAudioOn,
    onAudioOff,
    destroy,
  };
}
