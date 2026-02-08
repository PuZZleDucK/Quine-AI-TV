import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

export function createChannel({ seed, audio }) {
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let t = 0;

  let bgC = null;
  let planC = null;

  let rooms = [];
  let roomOrder = [];
  let corridors = [];

  let tourClock = 0;
  const dwellDur = 2.8;
  const moveDur = 4.0;
  const stepDur = dwellDur + moveDur;
  let curRoomStep = -1;

  let noteText = '';
  let noteAge = 0;

  let flicker = 0;
  let nextFlickerAt = 0;

  let slam = 0;
  let nextSlamAt = 0;

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
    return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  }

  function center(idx) {
    const r = rooms[idx];
    return { x: r.x + r.w * 0.5, y: r.y + r.h * 0.5 };
  }

  function buildPlan() {
    const cols = 4;
    const rows = 3;
    const count = 8 + ((rand() * 4) | 0); // 8–11

    const used = new Set();
    rooms = [];

    for (let i = 0; i < count; i++) {
      for (let tries = 0; tries < 60; tries++) {
        const c = (rand() * cols) | 0;
        const r = (rand() * rows) | 0;
        const key = `${c},${r}`;
        if (used.has(key)) continue;
        used.add(key);

        const cw = 1 / cols;
        const rh = 1 / rows;
        const pad = 0.06;

        const x0 = c * cw + pad * cw + rand() * cw * 0.1;
        const y0 = r * rh + pad * rh + rand() * rh * 0.1;
        const rw = cw * (0.72 + rand() * 0.18);
        const rhh = rh * (0.62 + rand() * 0.22);

        rooms.push({
          x: x0,
          y: y0,
          w: Math.min(rw, 1 - x0 - pad * cw),
          h: Math.min(rhh, 1 - y0 - pad * rh),
          label: '',
        });
        break;
      }
    }

    const labels = [
      'FOYER',
      'HALL',
      'PARLOUR',
      'STUDY',
      'NURSERY',
      'KITCHEN',
      'PANTRY',
      'CELLAR',
      'ATTIC',
      'STORAGE',
      'GUEST',
      'STAIRS',
      'LAUNDRY',
      'LIBRARY',
      'BATH',
      'SERVANT',
      'WORKSHOP',
    ];

    rooms.forEach((rm) => {
      rm.label = pick(labels);
    });

    // Deterministic tour order: greedy nearest-neighbour walk.
    roomOrder = [];
    if (!rooms.length) return;

    const remaining = new Set(rooms.map((_, i) => i));
    let cur = 0;
    roomOrder.push(cur);
    remaining.delete(cur);

    while (remaining.size) {
      const c0 = center(cur);
      let best = null;
      let bestD = Infinity;
      for (const j of remaining) {
        const c1 = center(j);
        const d = (c1.x - c0.x) ** 2 + (c1.y - c0.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      cur = best;
      roomOrder.push(cur);
      remaining.delete(cur);
    }

    corridors = [];
    for (let i = 0; i < roomOrder.length; i++) {
      const a = center(roomOrder[i]);
      const b = center(roomOrder[(i + 1) % roomOrder.length]);
      const corner = rand() < 0.5 ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
      corridors.push([a, corner, b]);
    }
  }

  function renderBg() {
    bgC = document.createElement('canvas');
    bgC.width = w;
    bgC.height = h;
    const bctx = bgC.getContext('2d');

    const g = bctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#041225');
    g.addColorStop(1, '#020712');
    bctx.fillStyle = g;
    bctx.fillRect(0, 0, w, h);

    const grid = Math.max(28, Math.floor(Math.min(w, h) / 18));
    bctx.globalAlpha = 0.18;
    bctx.strokeStyle = '#0b3156';
    bctx.lineWidth = 1;

    for (let x = 0; x <= w; x += grid) {
      bctx.beginPath();
      bctx.moveTo(x, 0);
      bctx.lineTo(x, h);
      bctx.stroke();
    }
    for (let y = 0; y <= h; y += grid) {
      bctx.beginPath();
      bctx.moveTo(0, y);
      bctx.lineTo(w, y);
      bctx.stroke();
    }
    bctx.globalAlpha = 1;

    const vg = bctx.createRadialGradient(
      w * 0.5,
      h * 0.5,
      Math.min(w, h) * 0.22,
      w * 0.5,
      h * 0.5,
      Math.min(w, h) * 0.85,
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    bctx.fillStyle = vg;
    bctx.fillRect(0, 0, w, h);
  }

  function renderPlan() {
    planC = document.createElement('canvas');
    planC.width = w;
    planC.height = h;
    const pctx = planC.getContext('2d');

    const m = Math.floor(Math.min(w, h) * 0.08);
    const sx = (x) => m + x * (w - 2 * m);
    const sy = (y) => m + y * (h - 2 * m);

    pctx.save();
    pctx.lineJoin = 'round';
    pctx.lineCap = 'round';

    // Corridors
    pctx.strokeStyle = 'rgba(120, 220, 255, 0.22)';
    pctx.lineWidth = Math.max(2, Math.floor(Math.min(w, h) * 0.004));
    for (const poly of corridors) {
      pctx.beginPath();
      pctx.moveTo(sx(poly[0].x), sy(poly[0].y));
      for (let k = 1; k < poly.length; k++) pctx.lineTo(sx(poly[k].x), sy(poly[k].y));
      pctx.stroke();
    }

    // Rooms
    const lw = Math.max(2, Math.floor(Math.min(w, h) * 0.0045));
    pctx.lineWidth = lw;

    const fs = Math.max(10, Math.floor(Math.min(w, h) * 0.024));
    pctx.font = `${fs}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

    for (const rm of rooms) {
      const x = sx(rm.x);
      const y = sy(rm.y);
      const rw = rm.w * (w - 2 * m);
      const rh = rm.h * (h - 2 * m);

      pctx.fillStyle = 'rgba(10, 60, 90, 0.12)';
      pctx.fillRect(x, y, rw, rh);

      pctx.strokeStyle = 'rgba(160, 250, 255, 0.5)';
      pctx.strokeRect(x, y, rw, rh);

      pctx.fillStyle = 'rgba(160, 250, 255, 0.35)';
      pctx.fillText(rm.label, x + lw * 2, y + fs + lw);
    }

    // Border
    pctx.strokeStyle = 'rgba(160, 250, 255, 0.28)';
    pctx.lineWidth = Math.max(1, Math.floor(Math.min(w, h) * 0.003));
    pctx.strokeRect(m * 0.6, m * 0.6, w - m * 1.2, h - m * 1.2);

    pctx.restore();
  }

  function sceneInit(width, height) {
    w = width;
    h = height;
    t = 0;

    tourClock = 0;
    curRoomStep = -1;
    noteText = '';
    noteAge = 0;

    flicker = 0;
    slam = 0;

    buildPlan();
    renderBg();
    renderPlan();

    nextFlickerAt = 1 + rand() * 4;
    nextSlamAt = 18 + rand() * 18;
  }

  function onResize(width, height) {
    sceneInit(width, height);
  }

  function onAudioOn() {
    if (!audio.enabled) return;

    drone = simpleDrone(audio, { root: 55, detune: 1.0, gain: 0.05 });
    noise = audio.noiseSource({ type: 'pink', gain: 0.018 });
    noise.start();

    audioHandle = {
      stop() {
        try {
          drone?.stop?.();
        } catch {}
        try {
          noise?.stop?.();
        } catch {}
      },
    };

    audio.setCurrent(audioHandle);
  }

  function onAudioOff() {
    try {
      audioHandle?.stop?.();
    } catch {}
    audioHandle = null;
    drone = null;
    noise = null;
  }

  function destroy() {
    onAudioOff();
  }

  function slamEvent() {
    slam = 1;
    tourClock = 0;

    // Rotate the tour order for variety.
    if (roomOrder.length > 2) {
      const shift = 1 + ((rand() * (roomOrder.length - 1)) | 0);
      roomOrder = roomOrder.slice(shift).concat(roomOrder.slice(0, shift));
    }

    if (audio.enabled) {
      audio.beep({ freq: 70, dur: 0.12, gain: 0.08, type: 'triangle' });
      audio.beep({ freq: 190, dur: 0.04, gain: 0.03, type: 'square' });
    }
  }

  function update(dt) {
    t += dt;
    tourClock += dt;

    noteAge += dt;

    flicker = Math.max(0, flicker - dt * 6);
    slam = Math.max(0, slam - dt * 1.3);

    if (t >= nextFlickerAt) {
      flicker = 1;
      nextFlickerAt = t + 2.5 + rand() * 6;
    }

    if (t >= nextSlamAt) {
      slamEvent();
      nextSlamAt = t + 24 + rand() * 22;
    }

    const stepIdx = Math.floor(tourClock / stepDur);
    if (stepIdx !== curRoomStep) {
      curRoomStep = stepIdx;
      const notePhrases = [
        'COLD SPOT RECORDED',
        'DRAFT UNDER DOOR',
        'SCRATCHES ON WALL',
        'WHISPER DETECTED',
        'FLOOR CREAKS HERE',
        'LIGHTS FLICKERED',
        'DO NOT ENTER',
        'STILLNESS TOO LOUD',
      ];
      noteText = `NOTE: ${pick(notePhrases)}`;
      noteAge = 0;
      flicker = Math.max(flicker, 0.5);
    }
  }

  function getCursor() {
    if (!rooms.length) return { x: 0.5, y: 0.5, room: 0, moving: false };

    const stepIdx = Math.floor(tourClock / stepDur);
    const aIdx = roomOrder[stepIdx % roomOrder.length];
    const bIdx = roomOrder[(stepIdx + 1) % roomOrder.length];

    const within = tourClock - stepIdx * stepDur;
    if (within < dwellDur) {
      const c = center(aIdx);
      return { x: c.x, y: c.y, room: aIdx, moving: false };
    }

    const u = clamp((within - dwellDur) / moveDur, 0, 1);
    const e = ease(u);

    const a = center(aIdx);
    const b = center(bIdx);

    // Stable per-step corner choice: parity.
    const corner = stepIdx % 2 === 0 ? { x: b.x, y: a.y } : { x: a.x, y: b.y };

    const leg1 = Math.abs(corner.x - a.x) + Math.abs(corner.y - a.y);
    const leg2 = Math.abs(b.x - corner.x) + Math.abs(b.y - corner.y);
    const total = Math.max(1e-6, leg1 + leg2);

    const d = e * total;
    if (d <= leg1) {
      const f = leg1 ? d / leg1 : 1;
      return { x: lerp(a.x, corner.x, f), y: lerp(a.y, corner.y, f), room: aIdx, moving: true };
    }

    const f = leg2 ? (d - leg1) / leg2 : 1;
    return { x: lerp(corner.x, b.x, f), y: lerp(corner.y, b.y, f), room: bIdx, moving: true };
  }

  function draw(ctx) {
    if (!w || !h) return;

    const cur = getCursor();

    ctx.clearRect(0, 0, w, h);
    if (bgC) ctx.drawImage(bgC, 0, 0);

    const shake = slam > 0 ? (Math.sin(t * 80) * 2 + Math.sin(t * 57) * 2) * slam : 0;

    ctx.save();
    ctx.translate(shake, -shake * 0.6);

    const flickAmt = flicker > 0 ? 0.55 + 0.45 * Math.sin(t * 120) : 1;
    ctx.globalAlpha = 0.92 * flickAmt;
    ctx.globalCompositeOperation = 'screen';
    if (planC) ctx.drawImage(planC, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    const m = Math.floor(Math.min(w, h) * 0.08);
    const sx = (x) => m + x * (w - 2 * m);
    const sy = (y) => m + y * (h - 2 * m);

    const px = sx(cur.x);
    const py = sy(cur.y);

    const spotR = Math.min(w, h) * 0.22;
    const spot = ctx.createRadialGradient(px, py, 0, px, py, spotR);
    spot.addColorStop(0, `rgba(160, 250, 255, ${0.15 + (cur.moving ? 0.08 : 0.12)})`);
    spot.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, w, h);

    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(200,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(px, py, 3 + pulse * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const rm = rooms[cur.room];
    if (rm) {
      const rx = sx(rm.x);
      const ry = sy(rm.y);
      const rw = rm.w * (w - 2 * m);
      const rh = rm.h * (h - 2 * m);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.25 + pulse * 0.18})`;
      ctx.lineWidth = Math.max(2, Math.floor(Math.min(w, h) * 0.006));
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.restore();
    }

    const fs = Math.max(12, Math.floor(Math.min(w, h) * 0.03));
    ctx.font = `${fs}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const a = clamp(1 - noteAge / 4.5, 0, 1);
    ctx.fillStyle = `rgba(180, 255, 255, ${0.6 * a})`;
    ctx.fillText(noteText, m * 0.8, h - m * 0.55);

    if (slam > 0) {
      const s = clamp(slam, 0, 1);
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${0.35 * s})`;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = `rgba(160,0,20,${0.25 * s})`;
      ctx.fillRect(0, 0, w, h);

      const big = Math.max(20, Math.floor(Math.min(w, h) * 0.08));
      ctx.font = `${big}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255, 180, 190, ${0.75 * s})`;
      ctx.fillText('DOOR SLAM', w * 0.5, h * 0.5);
      ctx.restore();
    }

    ctx.restore();
  }

  return { onResize, update, draw, destroy, onAudioOn, onAudioOff };
}
