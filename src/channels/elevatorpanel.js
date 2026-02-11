// REVIEWED: 2026-02-12
import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

export function createChannel({ seed, audio }) {
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let t = 0;

  // ---- deterministic config
  const floorCount = 12 + ((rand() * 9) | 0); // 12..20
  const floors = Array.from({ length: floorCount }, (_, i) => i + 1);
  const panelLabel = pick([
    'ELEVATOR CONTROL',
    'LIFT PANEL',
    'SERVICE LIFT',
    'CAR CONTROLS',
    'FLOOR SELECTOR',
  ]);

  // ---- static textures
  let panelC = null;

  // ---- panel layout (computed on resize)
  let panelX = 0;
  let panelY = 0;
  let panelW = 0;
  let panelH = 0;

  let indicator = { x: 0, y: 0, w: 0, h: 0 };
  let queueBox = { x: 0, y: 0, w: 0, h: 0 };
  let buttons = []; // {x,y,w,h,floor}

  // ---- scripted time structure
  let script = []; // {type, t0, t1, from, to}
  let scriptTotal = 60;
  let lastSegIdx = -1;

  // ---- audio state
  let drone = null;
  let noise = null;
  let audioHandle = null;
  let beepTimers = [];

  function pick(arr) {
    return arr[(rand() * arr.length) | 0];
  }

  function buildScript() {
    const r2 = mulberry32((seed ^ 0xA13F0C3) >>> 0);

    let cur = 1 + ((r2() * floorCount) | 0);
    let tt = 0;
    script = [];

    function push(type, dur, extra = {}) {
      const t0 = tt;
      const t1 = tt + dur;
      script.push({ type, t0, t1, ...extra });
      tt = t1;
    }

    // Warm boot.
    push('IDLE', 1.2 + r2() * 1.0, { at: cur });

    let trips = 0;
    while (tt < 86) {
      // Occasionally: service mode interlude.
      if (trips > 0 && (trips % 3 === 0) && r2() < 0.65) {
        push('SERVICE', 5.5 + r2() * 3.0, { at: cur });
        push('IDLE', 1.0 + r2() * 1.6, { at: cur });
      }

      let next = 1 + ((r2() * floorCount) | 0);
      if (next === cur) next = 1 + ((r2() * floorCount) | 0);
      const dist = Math.max(1, Math.abs(next - cur));

      push('CALL', 0.9 + r2() * 0.6, { at: cur, call: next });
      push('MOVE', 1.2 + dist * (0.32 + r2() * 0.12), { from: cur, to: next });
      push('ARRIVE', 1.6 + r2() * 0.9, { at: next, from: cur });

      cur = next;
      trips++;

      // Rare special moment: "express" hop.
      if (r2() < 0.18) {
        let ex = 1 + ((r2() * floorCount) | 0);
        if (ex === cur) ex = floorCount;
        const dist2 = Math.max(1, Math.abs(ex - cur));
        push('CALL', 0.55 + r2() * 0.35, { at: cur, call: ex, express: true });
        push('MOVE', 0.9 + dist2 * 0.22, { from: cur, to: ex, express: true });
        push('ARRIVE', 1.1 + r2() * 0.7, { at: ex, from: cur, express: true });
        cur = ex;
        trips++;
      }

      if (tt > 70 && trips >= 5) break;
    }

    // Cooldown.
    push('IDLE', 2.0 + r2() * 1.8, { at: cur });
    scriptTotal = tt;
    lastSegIdx = -1;
  }

  function segmentAt(tt) {
    tt = ((tt % scriptTotal) + scriptTotal) % scriptTotal;
    for (let i = 0; i < script.length; i++) {
      const s = script[i];
      if (tt >= s.t0 && tt < s.t1) return { idx: i, seg: s, segT: (tt - s.t0) / (s.t1 - s.t0), tt };
    }
    // Fallback
    return { idx: script.length - 1, seg: script[script.length - 1], segT: 1, tt };
  }

  function upcomingStops(fromIdx, count = 6) {
    const out = [];
    for (let k = 0; k < script.length && out.length < count; k++) {
      const s = script[(fromIdx + k) % script.length];
      if (s.type === 'MOVE') out.push(s.to);
      if (s.type === 'SERVICE') out.push('SV');
    }
    return out;
  }

  // ---- drawing helpers
  function drawText(ctx, text, x, y, size, color = 'rgba(240,255,252,0.9)', align = 'left') {
    ctx.save();
    ctx.fillStyle = color;
    ctx.font = `600 ${size}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  const SEG = {
    0: [1, 1, 1, 1, 1, 1, 0],
    1: [0, 1, 1, 0, 0, 0, 0],
    2: [1, 1, 0, 1, 1, 0, 1],
    3: [1, 1, 1, 1, 0, 0, 1],
    4: [0, 1, 1, 0, 0, 1, 1],
    5: [1, 0, 1, 1, 0, 1, 1],
    6: [1, 0, 1, 1, 1, 1, 1],
    7: [1, 1, 1, 0, 0, 0, 0],
    8: [1, 1, 1, 1, 1, 1, 1],
    9: [1, 1, 1, 1, 0, 1, 1],
  };

  function draw7SegDigit(ctx, x, y, ww, hh, digit, onColor, offColor) {
    const s = SEG[digit] || SEG[0];
    const th = Math.max(2, Math.floor(Math.min(ww, hh) * 0.14));
    const pad = Math.max(2, Math.floor(th * 0.7));
    const r = Math.max(2, Math.floor(th * 0.6));

    // segments: A (top), B (upper right), C (lower right), D (bottom), E (lower left), F (upper left), G (middle)
    const A = { x: x + pad, y: y + pad, w: ww - pad * 2, h: th };
    const D = { x: x + pad, y: y + hh - pad - th, w: ww - pad * 2, h: th };
    const G = { x: x + pad, y: y + (hh - th) * 0.5, w: ww - pad * 2, h: th };

    const vH = (hh - pad * 3 - th * 3) * 0.5;
    const F = { x: x + pad, y: y + pad + th, w: th, h: vH };
    const B = { x: x + ww - pad - th, y: y + pad + th, w: th, h: vH };
    const E = { x: x + pad, y: y + pad + th * 2 + vH, w: th, h: vH };
    const C = { x: x + ww - pad - th, y: y + pad + th * 2 + vH, w: th, h: vH };

    const segs = [A, B, C, D, E, F, G];

    ctx.save();
    for (let i = 0; i < segs.length; i++) {
      const g = segs[i];
      ctx.fillStyle = s[i] ? onColor : offColor;
      roundRect(ctx, g.x, g.y, g.w, g.h, r);
      ctx.fill();
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w2, h2, r) {
    const rr = Math.min(r, w2 * 0.5, h2 * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w2, y, x + w2, y + h2, rr);
    ctx.arcTo(x + w2, y + h2, x, y + h2, rr);
    ctx.arcTo(x, y + h2, x, y, rr);
    ctx.arcTo(x, y, x + w2, y, rr);
    ctx.closePath();
  }

  function drawIndicator(ctx, value, dir, mode, pulse) {
    // base
    ctx.save();
    const r = Math.max(8, indicator.h * 0.12);

    // subtle inner glow
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    roundRect(ctx, indicator.x, indicator.y, indicator.w, indicator.h, r);
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = 'rgba(120, 255, 240, 0.15)';
    ctx.lineWidth = Math.max(2, h / 240);
    roundRect(ctx, indicator.x, indicator.y, indicator.w, indicator.h, r);
    ctx.stroke();
    ctx.restore();

    const on = `rgba(120,255,240,${0.78 + pulse * 0.22})`;
    const off = 'rgba(25,60,58,0.25)';

    if (mode === 'SERVICE') {
      const s = Math.max(12, indicator.h * 0.18);
      drawText(ctx, 'SERVICE', indicator.x + indicator.w * 0.5, indicator.y + indicator.h * 0.62, s, `rgba(120,255,240,${0.75 + pulse * 0.25})`, 'center');
    } else {
      const n = Math.max(0, Math.min(99, value | 0));
      const tens = (n / 10) | 0;
      const ones = n % 10;
      const pad = indicator.w * 0.1;
      const digitW = (indicator.w - pad * 3) * 0.5;
      const digitH = indicator.h * 0.78;
      const dx0 = indicator.x + pad;
      const dy = indicator.y + indicator.h * 0.12;
      if (tens > 0) {
        draw7SegDigit(ctx, dx0, dy, digitW, digitH, tens, on, off);
      } else {
        // faint placeholder
        draw7SegDigit(ctx, dx0, dy, digitW, digitH, 0, 'rgba(120,255,240,0.10)', off);
      }
      draw7SegDigit(ctx, dx0 + digitW + pad, dy, digitW, digitH, ones, on, off);

      // direction arrows
      const ax = indicator.x + indicator.w * 0.86;
      const ay = indicator.y + indicator.h * 0.26;
      const s = indicator.h * 0.15;

      ctx.globalAlpha = 0.9;
      ctx.fillStyle = dir > 0 ? `rgba(120,255,240,${0.55 + pulse * 0.35})` : 'rgba(120,255,240,0.12)';
      tri(ctx, ax, ay, s, -1);
      ctx.fill();

      ctx.fillStyle = dir < 0 ? `rgba(120,255,240,${0.55 + pulse * 0.35})` : 'rgba(120,255,240,0.12)';
      tri(ctx, ax, ay + indicator.h * 0.28, s, +1);
      ctx.fill();
    }

    ctx.restore();
  }

  function tri(ctx, x, y, s, dir) {
    ctx.beginPath();
    if (dir < 0) {
      ctx.moveTo(x, y);
      ctx.lineTo(x - s, y + s);
      ctx.lineTo(x + s, y + s);
    } else {
      ctx.moveTo(x, y + s);
      ctx.lineTo(x - s, y);
      ctx.lineTo(x + s, y);
    }
    ctx.closePath();
  }

  function drawButtons(ctx, litFloor, chaseIdx, pulse) {
    const r = Math.max(6, panelH * 0.02);

    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      const active = (typeof litFloor === 'number' && b.floor === litFloor);
      const chase = (i === chaseIdx);
      const a = active ? 0.75 : chase ? 0.28 : 0.12;

      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, b.x, b.y, b.w, b.h, r);
      ctx.fill();

      ctx.strokeStyle = `rgba(120,255,240,${0.12 + a * 0.5})`;
      ctx.lineWidth = Math.max(1.5, h / 420);
      roundRect(ctx, b.x, b.y, b.w, b.h, r);
      ctx.stroke();

      if (active || chase) {
        const glow = ctx.createRadialGradient(b.x + b.w * 0.5, b.y + b.h * 0.5, 0, b.x + b.w * 0.5, b.y + b.h * 0.5, Math.max(b.w, b.h) * 0.9);
        glow.addColorStop(0, `rgba(120,255,240,${0.10 + a * 0.30 + pulse * 0.08})`);
        glow.addColorStop(1, 'rgba(120,255,240,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(b.x - b.w * 0.4, b.y - b.h * 0.4, b.w * 1.8, b.h * 1.8);
      }

      // label
      const fs = Math.max(10, b.h * 0.45);
      drawText(ctx, String(b.floor), b.x + b.w * 0.5, b.y + b.h * 0.68, fs, `rgba(240,255,252,${0.66 + a * 0.25})`, 'center');
      ctx.restore();
    }
  }

  function drawQueue(ctx, list, pulse) {
    const r = Math.max(10, queueBox.h * 0.18);
    ctx.save();

    // container
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, queueBox.x, queueBox.y, queueBox.w, queueBox.h, r);
    ctx.fill();

    ctx.strokeStyle = 'rgba(120,255,240,0.14)';
    ctx.lineWidth = Math.max(2, h / 520);
    roundRect(ctx, queueBox.x, queueBox.y, queueBox.w, queueBox.h, r);
    ctx.stroke();

    drawText(ctx, 'CALL QUEUE', queueBox.x + queueBox.w * 0.08, queueBox.y + queueBox.h * 0.22, Math.max(10, queueBox.h * 0.16), 'rgba(240,255,252,0.55)');

    const itemH = queueBox.h * 0.62 / 6;
    for (let i = 0; i < 6; i++) {
      const y = queueBox.y + queueBox.h * 0.3 + i * itemH;
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(120,255,240,0.05)';
      ctx.fillRect(queueBox.x + queueBox.w * 0.06, y + itemH * 0.1, queueBox.w * 0.88, itemH * 0.8);

      const v = list[i];
      if (v == null) continue;
      const txt = typeof v === 'number' ? String(v).padStart(2, '0') : String(v);
      const a = i === 0 ? 0.85 : 0.52;
      drawText(ctx, txt, queueBox.x + queueBox.w * 0.86, y + itemH * 0.72, Math.max(12, itemH * 0.72), `rgba(120,255,240,${a + pulse * 0.12})`, 'right');
    }

    ctx.restore();
  }

  function rebuildPanelTexture() {
    panelC = document.createElement('canvas');
    panelC.width = w;
    panelC.height = h;
    const p = panelC.getContext('2d');

    // background
    const bg = p.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#05090b');
    bg.addColorStop(0.55, '#030607');
    bg.addColorStop(1, '#000000');
    p.fillStyle = bg;
    p.fillRect(0, 0, w, h);

    // ambient vignette
    const vg = p.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.55, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.65)');
    p.fillStyle = vg;
    p.fillRect(0, 0, w, h);

    // subtle scanlines (static)
    p.save();
    p.globalAlpha = 0.08;
    p.fillStyle = 'rgba(255,255,255,1)';
    for (let y = 0; y < h; y += 3) p.fillRect(0, y, w, 1);
    p.restore();

    // panel body
    const r = Math.max(18, panelH * 0.06);
    const g2 = p.createLinearGradient(panelX, panelY, panelX + panelW, panelY + panelH);
    g2.addColorStop(0, '#0c1113');
    g2.addColorStop(0.5, '#0a0f11');
    g2.addColorStop(1, '#0e1517');

    p.fillStyle = g2;
    roundRect(p, panelX, panelY, panelW, panelH, r);
    p.fill();

    p.strokeStyle = 'rgba(120,255,240,0.10)';
    p.lineWidth = Math.max(2, h / 240);
    roundRect(p, panelX + 1, panelY + 1, panelW - 2, panelH - 2, r);
    p.stroke();

    // header label
    drawText(p, panelLabel, panelX + panelW * 0.06, panelY + panelH * 0.08, Math.max(12, panelH * 0.03), 'rgba(240,255,252,0.42)');

    // floor count hint (tiny)
    drawText(p, `FLOORS: ${floorCount}`, panelX + panelW * 0.94, panelY + panelH * 0.08, Math.max(12, panelH * 0.03), 'rgba(240,255,252,0.32)', 'right');

    // tiny screws
    p.save();
    p.fillStyle = 'rgba(255,255,255,0.06)';
    const sx = [panelX + panelW * 0.06, panelX + panelW * 0.94];
    const sy = [panelY + panelH * 0.12, panelY + panelH * 0.94];
    for (const xx of sx) {
      for (const yy of sy) {
        p.beginPath();
        p.arc(xx, yy, Math.max(2, panelW * 0.008), 0, Math.PI * 2);
        p.fill();
      }
    }
    p.restore();
  }

  function layout(width, height) {
    w = width;
    h = height;

    panelW = w * 0.62;
    panelH = h * 0.86;
    panelX = w * 0.19;
    panelY = h * 0.07;

    indicator = {
      x: panelX + panelW * 0.08,
      y: panelY + panelH * 0.12,
      w: panelW * 0.84,
      h: panelH * 0.20,
    };

    queueBox = {
      x: panelX + panelW * 0.08,
      y: panelY + panelH * 0.35,
      w: panelW * 0.36,
      h: panelH * 0.42,
    };

    // button grid: 4 cols x rows, up to floorCount
    const cols = 4;
    const rows = Math.ceil(floorCount / cols);

    const bx0 = panelX + panelW * 0.50;
    const by0 = panelY + panelH * 0.35;
    const bw = panelW * 0.42;
    const bh = panelH * 0.56;

    const gap = Math.max(6, panelW * 0.012);
    const cellW = (bw - gap * (cols - 1)) / cols;
    const cellH = (bh - gap * (rows - 1)) / rows;

    buttons = [];
    for (let i = 0; i < floorCount; i++) {
      const col = i % cols;
      const row = (i / cols) | 0;
      const x = bx0 + col * (cellW + gap);
      const y = by0 + row * (cellH + gap);
      buttons.push({ x, y, w: cellW, h: cellH, floor: floors[i] });
    }

    rebuildPanelTexture();
  }

  function sceneInit(width, height) {
    t = 0;
    layout(width, height);
    buildScript();
  }

  function playArrivalChime(express = false) {
    if (!audio?.enabled) return;

    // clear any pending beeps
    beepTimers.forEach((id) => clearTimeout(id));
    beepTimers = [];

    const base = express ? 740 : 660;
    const seq = [
      { f: base, at: 0.00, d: 0.06, g: 0.045 },
      { f: base * 1.26, at: 0.09, d: 0.07, g: 0.045 },
      { f: base * 1.5, at: 0.20, d: 0.09, g: 0.040 },
    ];

    for (const s of seq) {
      beepTimers.push(
        setTimeout(() => {
          try {
            audio.beep({ freq: s.f, dur: s.d, gain: s.g, type: 'sine' });
          } catch {}
        }, (s.at * 1000) | 0)
      );
    }
  }

  function stopAmbience({ clearCurrent = false } = {}) {
    // Cancel pending beeps regardless of whether we have an active handle.
    beepTimers.forEach((id) => clearTimeout(id));
    beepTimers = [];

    const handle = audioHandle;

    // If we somehow have sources without a registered handle, stop them anyway.
    if (!handle) {
      try { drone?.stop?.(); } catch {}
      try { noise?.stop?.(); } catch {}
      drone = null;
      noise = null;
      return;
    }

    const isCurrent = audio.current === handle;
    if (clearCurrent && isCurrent) {
      // Stops via handle.stop() and clears AudioManager.current.
      audio.stopCurrent();
    } else {
      try { handle?.stop?.(); } catch {}
    }

    audioHandle = null;
    drone = null;
    noise = null;
  }

  function onAudioOn() {
    if (!audio?.enabled) return;

    // Defensive: keep repeated audio toggles idempotent (no stacked sources).
    stopAmbience({ clearCurrent: true });

    try {
      drone = simpleDrone(audio, { root: 55 + ((rand() * 40) | 0), gain: 0.035 });
      noise = audio.noiseSource({ type: 'brown', gain: 0.018 });
      noise.start();

      const handle = {
        stop() {
          beepTimers.forEach((id) => clearTimeout(id));
          beepTimers = [];
          try { drone?.stop?.(); } catch {}
          try { noise?.stop?.(); } catch {}
        },
      };
      audioHandle = handle;
      audio.setCurrent(handle);
    } catch {}
  }

  function onAudioOff() {
    // Stop our handle; clear AudioManager.current only if we own it.
    stopAmbience({ clearCurrent: true });
  }

  function destroy() {
    onAudioOff();
  }

  function onResize({ width, height }) {
    layout(width, height);
  }

  function update(dt) {
    t += dt;

    const { idx, seg } = segmentAt(t);
    if (idx !== lastSegIdx) {
      // arrivals chime
      if (seg.type === 'ARRIVE') {
        playArrivalChime(!!seg.express);
      }
      lastSegIdx = idx;
    }
  }

  function render(ctx) {
    if (!panelC) return;

    const tt = t;
    const { idx, seg, segT } = segmentAt(tt);

    // draw base
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(panelC, 0, 0);

    // moving scanline (dynamic)
    const scanY = ((tt * 60) % (h + 120)) - 60;
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = 'rgba(120,255,240,1)';
    ctx.fillRect(0, scanY, w, Math.max(1, h / 520));
    ctx.restore();

    // determine displayed floor + direction
    let floorNow = 1;
    let dir = 0;
    let mode = 'NORMAL';

    if (seg.type === 'MOVE') {
      const e = segT < 0.5 ? 2 * segT * segT : 1 - Math.pow(-2 * segT + 2, 2) / 2;
      floorNow = seg.from + (seg.to - seg.from) * e;
      dir = seg.to > seg.from ? +1 : -1;
    } else if (seg.type === 'SERVICE') {
      mode = 'SERVICE';
      floorNow = seg.at;
    } else {
      floorNow = seg.at ?? seg.to ?? seg.from ?? 1;
      dir = 0;
    }

    // indicator pulse: moving / arrival / service
    let pulse = 0;
    if (seg.type === 'MOVE') pulse = 0.25 + 0.35 * (0.5 - Math.abs(segT - 0.5)) * 2;
    if (seg.type === 'ARRIVE') pulse = 0.35 + 0.45 * Math.sin(segT * Math.PI);
    if (seg.type === 'SERVICE') pulse = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(tt * 6));

    // show a "CALL" blink
    let litFloor = null;
    if (seg.type === 'CALL') {
      litFloor = seg.call;
      pulse = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(tt * 10));
    }

    // chase lights
    const chaseIdx = (Math.floor(tt * 7.5) % Math.max(1, buttons.length)) | 0;

    // indicator
    const disp = mode === 'SERVICE' ? (floorNow | 0) : Math.round(floorNow);
    drawIndicator(ctx, disp, dir, mode, pulse);

    // queue
    const q = upcomingStops(idx + 1, 6);
    drawQueue(ctx, q, pulse * 0.35);

    // buttons (foreground)
    drawButtons(ctx, litFloor, chaseIdx, pulse * 0.35);

    // small status strip
    ctx.save();
    const y = panelY + panelH * 0.92;
    const stripH = panelH * 0.06;
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    roundRect(ctx, panelX + panelW * 0.08, y, panelW * 0.84, stripH, Math.max(10, stripH * 0.35));
    ctx.fill();

    const st = seg.type === 'MOVE' ? (seg.express ? 'EXPRESS' : 'MOVING') : seg.type;
    drawText(ctx, st, panelX + panelW * 0.12, y + stripH * 0.70, Math.max(12, stripH * 0.46), 'rgba(240,255,252,0.62)');

    const next = q[0] ?? '—';
    drawText(ctx, `NEXT: ${next}`, panelX + panelW * 0.88, y + stripH * 0.70, Math.max(12, stripH * 0.46), `rgba(120,255,240,${0.55 + pulse * 0.25})`, 'right');
    ctx.restore();

    // service-mode interlude overlay (special moment)
    if (seg.type === 'SERVICE') {
      ctx.save();
      const a = 0.08 + 0.10 * (0.5 + 0.5 * Math.sin(tt * 12));
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(255, 255, 255, 1)';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  function init({ width, height }) {
    sceneInit(width, height);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
