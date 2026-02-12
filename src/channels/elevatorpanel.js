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
  let diagramBox = { x: 0, y: 0, w: 0, h: 0 };
  let buttons = []; // {x,y,w,h,floor}

  // ---- scripted time structure
  let script = []; // {type, t0, t1, from, to}
  let scriptTotal = 60;
  let lastSegIdx = -1;

  // ---- call queue (seeded; serviced on arrivals)
  let callQueue = []; // floors (numbers)
  let lastLoop = -1;
  let elevators = []; // { floor, target, dir, door, servicing }
  let nextCallAt = 0;
  let primaryShaft = 0;
  let sceneMode = 'IDLE';
  let sceneModeT = 0;
  let sceneModeDur = 1;

  // ---- button press FX (deterministic; driven by segment edges)
  let pressEvents = []; // { floor, t0 }

  // ---- status strip message rotation (slow, 5-min cadence)
  const msgRng = mulberry32((seed ^ 0x6D2B79F5) >>> 0);
  const msgOffset = (msgRng() * 10000) | 0;
  let statusBucket = -1;
  let statusMsgIdx = 0;
  let statusMsg = 'BOOTING…';

  // ---- building diagram (right-side schematic; separate RNG so it doesn't perturb visuals)
  const diagRng = mulberry32((seed ^ 0xB1D1A6) >>> 0);
  const shaftCount = 2 + ((diagRng() * 3) | 0); // 2..4
  const elevatorHomeFloors = Array.from({ length: shaftCount }, () => 1 + ((diagRng() * floorCount) | 0));

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

  function ellipsize(text, maxChars) {
    const s = String(text ?? '');
    if (s.length <= maxChars) return s;
    return s.slice(0, Math.max(0, maxChars - 1)) + '…';
  }

  const STATUS_POOLS = {
    IDLE: [
      ({ cur }) => `STANDBY @ ${cur}`,
      ({ cur }) => `DOORS CLOSED • FLOOR ${cur}`,
      ({ cur }) => `LISTENING… FLOOR ${cur}`,
      () => 'NO SMOKING. NO DRAGONS.',
      () => 'PLEASE FACE FORWARD (OPTIONAL).',
      () => 'CAPACITY: VAGUELY ADEQUATE.',
    ],
    CALL: [
      ({ next }) => `CALL REGISTERED: ${next}`,
      () => 'BUTTON MASHING DETECTED (NICE).',
      () => 'ONE MOMENT. PRETENDING TO THINK…',
      () => 'QUEUEING REQUEST… PLEASE HOLD.',
    ],
    MOVE: [
      ({ dir }) => (dir > 0 ? 'ASCENDING…' : dir < 0 ? 'DESCENDING…' : 'MOVING…'),
      ({ cur, next }) => `EN ROUTE ${cur} → ${next}`,
      () => "PLEASE HOLD. WE'RE DOING ELEVATOR THINGS.",
      () => 'THIS IS NORMAL. PROBABLY.',
    ],
    EXPRESS: [
      ({ cur, next }) => `EXPRESS ${cur} → ${next}`,
      () => 'FAST MODE: ENGAGED.',
      () => 'SKIPPING SMALL TALK.',
      () => 'PRIORITY ROUTE CONFIRMED.',
    ],
    ARRIVE: [
      ({ cur }) => `ARRIVED: ${cur}`,
      () => 'DING. YOU MAY NOW EXIST ELSEWHERE.',
      () => 'MIND THE GAP (THERE IS NONE).',
      () => 'FLOOR CONFIRMED. HAVE A NICE LOOP.',
    ],
    SERVICE: [
      () => 'SERVICE MODE — DO NOT PANIC.',
      () => 'INSPECTION IN PROGRESS.',
      () => 'AUTHORIZED PERSONNEL: YOU LOOK AUTHORIZED.',
      () => 'DIAGNOSTICS: PASSING VIBES CHECK.',
    ],
    GENERAL: [
      ({ cur, next }) => `FLOOR ${cur} • NEXT ${next}`,
      () => 'THANK YOU FOR YOUR PATIENCE.',
      () => 'THIS PANEL FEELS VERY OFFICIAL.',
      () => 'IF LOST, TRY "UP".',
    ],
  };

  function refreshStatusMessage({ segKey, bucket, cur, next, dir }) {
    const pool = STATUS_POOLS[segKey] || STATUS_POOLS.GENERAL;
    let idx = (bucket + msgOffset) % pool.length;
    if (pool.length > 1 && idx === statusMsgIdx) idx = (idx + 1) % pool.length;
    statusMsgIdx = idx;

    try {
      const entry = pool[idx];
      statusMsg = entry({ cur, next, dir });
    } catch {
      statusMsg = STATUS_POOLS.GENERAL[0]({ cur, next, dir });
    }
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

  function drawButtons(ctx, { selected, primaryFloor, pressEvents, tt, pulse }) {
    const r = Math.max(6, panelH * 0.02);
    const sel = selected || new Set();

    for (let i = 0; i < buttons.length; i++) {
      const b = buttons[i];
      const active = sel.has(b.floor);
      const primary = (typeof primaryFloor === 'number' && b.floor === primaryFloor);

      // Press animation: a quick push + release when a floor is enqueued.
      let press = 0;
      for (let j = pressEvents.length - 1; j >= 0; j--) {
        const e = pressEvents[j];
        if (e.floor !== b.floor) continue;
        const dt = tt - e.t0;
        if (dt < 0) continue;
        if (dt > 0.55) break;
        const u = clamp(dt / 0.55, 0, 1);
        const p = u < 0.35 ? u / 0.35 : 1 - (u - 0.35) / 0.65;
        press = Math.max(press, p);
        break;
      }

      const a = primary ? (0.64 + pulse * 0.26) : active ? (0.34 + pulse * 0.12) : 0.10;
      const cx = b.x + b.w * 0.5;
      const cy = b.y + b.h * 0.5;

      ctx.save();

      if (press > 0) {
        const s = 1 - press * 0.06;
        ctx.translate(cx, cy + press * b.h * 0.06);
        ctx.scale(s, s);
        ctx.translate(-cx, -cy);
      }

      // base
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, b.x, b.y, b.w, b.h, r);
      ctx.fill();

      // ring
      ctx.strokeStyle = `rgba(120,255,240,${0.10 + a * 0.55})`;
      ctx.lineWidth = Math.max(1.5, h / 420);
      roundRect(ctx, b.x, b.y, b.w, b.h, r);
      ctx.stroke();

      // subtle fill glow for selected floors (kept weaker than the main indicator)
      if (active || primary) {
        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(b.w, b.h) * 0.9);
        glow.addColorStop(0, `rgba(120,255,240,${0.08 + a * 0.22})`);
        glow.addColorStop(1, 'rgba(120,255,240,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(b.x - b.w * 0.4, b.y - b.h * 0.4, b.w * 1.8, b.h * 1.8);
      }

      // LED lens (top-right)
      const ledR = Math.max(3, Math.min(b.w, b.h) * 0.10);
      const lx = b.x + b.w * 0.82;
      const ly = b.y + b.h * 0.28;

      // LED bloom
      if (active || primary) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const gg = ctx.createRadialGradient(lx, ly, 0, lx, ly, ledR * 4);
        gg.addColorStop(0, `rgba(120,255,240,${0.35 + a * 0.45})`);
        gg.addColorStop(1, 'rgba(120,255,240,0)');
        ctx.fillStyle = gg;
        ctx.fillRect(lx - ledR * 4, ly - ledR * 4, ledR * 8, ledR * 8);
        ctx.restore();
      }

      // LED body
      ctx.beginPath();
      ctx.arc(lx, ly, ledR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(120,255,240,${0.10 + a * 0.85})`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = Math.max(1, h / 780);
      ctx.stroke();

      // label
      const fs = Math.max(10, b.h * 0.45);
      drawText(ctx, String(b.floor), cx, b.y + b.h * 0.68, fs, `rgba(240,255,252,${0.62 + a * 0.28})`, 'center');

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

  function drawBuildingDiagram(ctx, { carFloor, activeShaft, targetFloor, pulse, tt, elevatorFloors }) {
    // Right column schematic: shafts + elevator cars.
    const x0 = diagramBox.x;
    const ww = diagramBox.w;
    const y0 = diagramBox.y;
    const hh = diagramBox.h;
    if (ww < 42 || hh < 60) return;

    const r = Math.max(10, Math.min(ww, hh) * 0.10);

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    roundRect(ctx, x0, y0, ww, hh, r);
    ctx.fill();

    ctx.strokeStyle = 'rgba(120,255,240,0.10)';
    ctx.lineWidth = Math.max(1.5, h / 720);
    roundRect(ctx, x0 + 1, y0 + 1, ww - 2, hh - 2, r);
    ctx.stroke();

    drawText(ctx, 'SHAFTS', x0 + ww * 0.10, y0 + hh * 0.12, Math.max(10, hh * 0.07), 'rgba(240,255,252,0.42)');

    const topPad = hh * 0.16;
    const botPad = hh * 0.08;
    const usableH = Math.max(1, hh - topPad - botPad);

    const fy = (f) => {
      const ff = clamp(Number(f) || 1, 1, floorCount);
      const u = floorCount <= 1 ? 0 : (floorCount - ff) / (floorCount - 1);
      return y0 + topPad + u * usableH;
    };

    // floor guide lines (subtle; a bit brighter every 2 floors)
    ctx.save();
    for (let f = 1; f <= floorCount; f++) {
      const yy = fy(f);
      const major = (f % 2) === 0;
      ctx.globalAlpha = major ? 0.10 : 0.06;
      ctx.fillStyle = 'rgba(120,255,240,1)';
      ctx.fillRect(x0 + ww * 0.12, yy, ww * 0.82, Math.max(1, h / 980));

      if (major && (f % 4) === 0) {
        ctx.globalAlpha = 0.28;
        drawText(ctx, String(f), x0 + ww * 0.08, yy + hh * 0.018, Math.max(9, hh * 0.06), 'rgba(240,255,252,0.38)', 'right');
      }
    }
    ctx.restore();

    // shafts
    const innerX = x0 + ww * 0.16;
    const innerW = ww * 0.78;
    const gap = Math.max(3, innerW * 0.04);
    const shaftW = (innerW - gap * (shaftCount - 1)) / shaftCount;

    const carH = Math.max(6, usableH / Math.max(6, floorCount) * 0.68);

    for (let s = 0; s < shaftCount; s++) {
      const sx = innerX + s * (shaftW + gap);

      // shaft outline
      ctx.save();
      const hi = s === activeShaft;
      ctx.globalAlpha = 1;
      ctx.strokeStyle = hi ? `rgba(120,255,240,${0.20 + pulse * 0.10})` : 'rgba(120,255,240,0.10)';
      ctx.lineWidth = Math.max(1.5, h / 860);
      roundRect(ctx, sx, y0 + topPad, shaftW, usableH, Math.max(6, shaftW * 0.18));
      ctx.stroke();
      ctx.restore();

      const home = elevatorHomeFloors[s] ?? 1;
      const f = (elevatorFloors && typeof elevatorFloors[s] === 'number')
        ? elevatorFloors[s]
        : ((s === activeShaft) ? carFloor : home);
      const cy = fy(f);

      // elevator car
      const carW = shaftW * 0.72;
      const cx = sx + (shaftW - carW) * 0.5;
      const carY = cy - carH * 0.5;

      // bloom for active car
      if (s === activeShaft) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.18 + pulse * 0.16;
        ctx.fillStyle = 'rgba(120,255,240,1)';
        roundRect(ctx, cx - carW * 0.18, carY - carH * 0.35, carW * 1.36, carH * 1.70, Math.max(6, carW * 0.20));
        ctx.fill();
        ctx.restore();
      }

      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, cx, carY, carW, carH, Math.max(6, carW * 0.18));
      ctx.fill();

      const a = s === activeShaft ? (0.36 + pulse * 0.26) : 0.14;
      ctx.strokeStyle = `rgba(120,255,240,${a})`;
      ctx.lineWidth = Math.max(1.5, h / 860);
      roundRect(ctx, cx, carY, carW, carH, Math.max(6, carW * 0.18));
      ctx.stroke();

      // tiny indicator dot
      const dotR = Math.max(2.2, carH * 0.16);
      ctx.beginPath();
      ctx.arc(cx + carW * 0.82, carY + carH * 0.30, dotR, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(120,255,240,${0.10 + a * 1.4})`;
      ctx.fill();

      ctx.restore();
    }

    // target floor marker (only on active shaft)
    if (typeof targetFloor === 'number') {
      const sx = innerX + activeShaft * (shaftW + gap);
      const yy = fy(targetFloor);
      ctx.save();
      ctx.globalAlpha = 0.16 + pulse * 0.16;
      ctx.fillStyle = 'rgba(120,255,240,1)';
      ctx.fillRect(sx + shaftW * 0.10, yy - Math.max(1, h / 980), shaftW * 0.80, Math.max(2, h / 520));
      ctx.restore();
    }

    // little drift scan (keeps it alive without shouting)
    ctx.save();
    const sy = y0 + topPad + ((tt * 40) % (usableH + 40)) - 20;
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = 'rgba(120,255,240,1)';
    ctx.fillRect(x0 + ww * 0.08, sy, ww * 0.86, Math.max(1, h / 780));
    ctx.restore();

    ctx.restore();
  }

  function drawPanelGlass(ctx, segType, segT, pulse, tt) {
    // Subtle overlay to add depth without competing with OSD.
    let edgeV = 0.11;
    let bloom = 0.06;
    let refl = 0.08;

    if (segType === 'MOVE') {
      edgeV = 0.10;
      bloom = 0.09;
      refl = 0.11;
    } else if (segType === 'ARRIVE') {
      edgeV = 0.08;
      bloom = 0.12 + pulse * 0.04;
      refl = 0.12;
    } else if (segType === 'SERVICE') {
      edgeV = 0.15;
      bloom = 0.05;
      refl = 0.04;
    }

    const r = Math.max(18, panelH * 0.06);

    ctx.save();
    roundRect(ctx, panelX, panelY, panelW, panelH, r);
    ctx.clip();

    // Edge vignette (varies slightly by segment).
    const vg = ctx.createRadialGradient(
      panelX + panelW * 0.5,
      panelY + panelH * 0.55,
      Math.min(panelW, panelH) * 0.18,
      panelX + panelW * 0.5,
      panelY + panelH * 0.55,
      Math.max(panelW, panelH) * 0.78
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,0,${edgeV})`);
    ctx.fillStyle = vg;
    ctx.fillRect(panelX, panelY, panelW, panelH);

    // Mild panel bloom (MOVE/ARRIVE get a touch more).
    ctx.globalCompositeOperation = 'screen';
    const bg = ctx.createRadialGradient(
      panelX + panelW * 0.5,
      panelY + panelH * 0.56,
      Math.min(panelW, panelH) * 0.22,
      panelX + panelW * 0.5,
      panelY + panelH * 0.56,
      Math.max(panelW, panelH) * 0.72
    );
    bg.addColorStop(0, 'rgba(120,255,240,0)');
    bg.addColorStop(1, `rgba(120,255,240,${bloom})`);
    ctx.fillStyle = bg;
    ctx.fillRect(panelX, panelY, panelW, panelH);

    // Glass reflection streak (gentle drift across the panel).
    const phase = (tt * 0.03 + segT * 0.15) % 1;
    const sx = panelX - panelW * 0.25 + phase * panelW * 1.55;
    const sy = panelY + panelH * 0.05;
    const g = ctx.createLinearGradient(sx, sy, sx + panelW * 0.35, sy + panelH * 0.92);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(255,255,255,${refl})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(panelX - panelW * 0.25, panelY, panelW * 1.6, panelH);

    // Top lip highlight.
    const top = ctx.createLinearGradient(0, panelY, 0, panelY + panelH * 0.22);
    top.addColorStop(0, `rgba(255,255,255,${0.05 + refl * 0.35})`);
    top.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = top;
    ctx.fillRect(panelX, panelY, panelW, panelH * 0.22);

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

    // Two-column stage layout: main panel + dedicated schematic column.
    const stageX = w * 0.07;
    const stageW = w * 0.86;
    const gutter = stageW * 0.03;
    const leftRatio = 0.80;

    panelW = stageW * leftRatio;
    panelH = h * 0.84;
    panelX = stageX;
    panelY = h * 0.08;

    diagramBox = {
      x: panelX + panelW + gutter,
      y: panelY + panelH * 0.12,
      w: stageW - panelW - gutter,
      h: panelH * 0.78,
    };

    indicator = {
      x: panelX + panelW * 0.07,
      y: panelY + panelH * 0.12,
      w: panelW * 0.86,
      h: panelH * 0.16,
    };

    queueBox = {
      x: panelX + panelW * 0.07,
      y: panelY + panelH * 0.33,
      w: panelW * 0.35,
      h: panelH * 0.44,
    };

    // button grid: 4 cols x rows, up to floorCount
    const cols = 4;
    const rows = Math.ceil(floorCount / cols);

    const bx0 = panelX + panelW * 0.45;
    const by0 = panelY + panelH * 0.33;
    const bw = panelW * 0.48;
    const bh = panelH * 0.52;

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
    callQueue = [];
    pressEvents = [];
    lastLoop = -1;
    primaryShaft = 0;
    sceneMode = 'IDLE';
    sceneModeT = 0;
    sceneModeDur = 1;
    nextCallAt = 1.5 + rand() * 2.8;
    elevators = Array.from({ length: shaftCount }, (_, i) => ({
      floor: elevatorHomeFloors[i] ?? 1,
      target: null,
      dir: 0,
      door: 0,
      servicing: null,
    }));
  }

  function setSceneMode(type, dur = 1) {
    sceneMode = type;
    sceneModeDur = Math.max(0.1, dur);
    sceneModeT = sceneModeDur;
  }

  function scheduleNextCall() {
    nextCallAt = t + 2.8 + rand() * 6.2;
  }

  function enqueueCall(floor, pressDelay = 0) {
    const f = clamp((floor | 0), 1, floorCount);
    if (!callQueue.includes(f)) {
      callQueue.push(f);
      if (callQueue.length > 14) callQueue.splice(14);
    }
    pressEvents.push({ floor: f, t0: t + pressDelay });
    if (pressEvents.length > 24) pressEvents.splice(0, pressEvents.length - 24);
  }

  function serviceQueueAssignments() {
    const claimed = new Set();
    for (const e of elevators) {
      if (typeof e.servicing === 'number') claimed.add(e.servicing);
    }

    for (let i = 0; i < elevators.length; i++) {
      const e = elevators[i];
      if (e.target != null || e.door > 0) continue;

      let best = null;
      let bestDist = Infinity;
      for (let k = 0; k < callQueue.length; k++) {
        const floor = callQueue[k];
        if (claimed.has(floor)) continue;
        const dist = Math.abs(floor - e.floor);
        if (dist < bestDist) {
          bestDist = dist;
          best = floor;
        }
      }

      if (best != null) {
        e.target = best;
        e.servicing = best;
        e.dir = best > e.floor ? +1 : best < e.floor ? -1 : 0;
        claimed.add(best);
        primaryShaft = i;
      }
    }
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

    // Keep FX bounded.
    pressEvents = pressEvents.filter((e) => t - e.t0 < 1.2);
    sceneModeT = Math.max(0, sceneModeT - dt);

    // Add occasional hall calls (persistent queue; no random replacement).
    if (t >= nextCallAt) {
      let f = 1 + ((rand() * floorCount) | 0);
      if (callQueue.includes(f) || elevators.some((e) => e.servicing === f)) {
        f = 1 + (((f + ((rand() * (floorCount - 1)) | 0)) % floorCount) | 0);
      }
      enqueueCall(f, 0);
      if (rand() < 0.25) {
        let f2 = 1 + ((rand() * floorCount) | 0);
        if (f2 !== f) enqueueCall(f2, 0.05);
      }
      setSceneMode('CALL', 0.9);
      if (audio?.enabled) {
        try { audio.beep({ freq: 360 + rand() * 120, dur: 0.03, gain: 0.02, type: 'triangle' }); } catch {}
      }
      scheduleNextCall();
    }

    serviceQueueAssignments();

    let movingCount = 0;
    let arrived = false;
    for (let i = 0; i < elevators.length; i++) {
      const e = elevators[i];
      if (e.door > 0) {
        e.door = Math.max(0, e.door - dt);
        e.dir = 0;
        continue;
      }
      if (e.target == null) {
        e.dir = 0;
        continue;
      }

      const diff = e.target - e.floor;
      const speed = 0.92; // floors per second
      const step = speed * dt;
      if (Math.abs(diff) <= step) {
        e.floor = e.target;
        e.dir = 0;
        e.target = null;
        e.door = 1.05;
        arrived = true;
        primaryShaft = i;

        if (typeof e.servicing === 'number') {
          const j = callQueue.indexOf(e.servicing);
          if (j >= 0) callQueue.splice(j, 1);
        }
        e.servicing = null;
        playArrivalChime(false);
      } else {
        e.dir = diff > 0 ? +1 : -1;
        e.floor += e.dir * step;
        movingCount++;
      }
    }

    if (arrived) {
      setSceneMode('ARRIVE', 1.0);
    } else if (sceneModeT <= 0) {
      if (movingCount > 0) setSceneMode('MOVE', 0.6);
      else setSceneMode('IDLE', 0.8);
    }
  }

  function render(ctx) {
    if (!panelC) return;
    const tt = t;

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
    const activeShaft = clamp(primaryShaft | 0, 0, shaftCount - 1);
    const activeElevator = elevators[activeShaft] || { floor: 1, dir: 0, target: null };
    floorNow = activeElevator.floor;
    dir = activeElevator.dir;

    // indicator pulse: moving / arrival / service
    let pulse = 0;
    const modeP = sceneModeDur > 0 ? (1 - sceneModeT / sceneModeDur) : 1;
    if (sceneMode === 'MOVE') pulse = 0.30 + 0.30 * (0.5 + 0.5 * Math.sin(tt * 5.2));
    if (sceneMode === 'ARRIVE') pulse = 0.40 + 0.40 * Math.sin(modeP * Math.PI);
    if (sceneMode === 'CALL') pulse = 0.30 + 0.45 * (0.5 + 0.5 * Math.sin(tt * 10));
    if (sceneMode === 'IDLE') pulse = 0.12 + 0.10 * (0.5 + 0.5 * Math.sin(tt * 1.8));

    // show a "CALL" blink + pressed floor
    const primaryFloor = typeof activeElevator.target === 'number' ? activeElevator.target : (callQueue[0] ?? null);

    // indicator
    const disp = mode === 'SERVICE' ? (floorNow | 0) : Math.round(floorNow);
    drawIndicator(ctx, disp, dir, mode, pulse);

    // queue
    const q = callQueue.slice(0, 6);
    drawQueue(ctx, q, pulse * 0.35);

    // buttons (foreground): persistent selection LEDs tied to queue/call state
    const selected = new Set();
    const src = callQueue;
    for (let i = 0; i < src.length; i++) {
      const v = src[i];
      if (typeof v === 'number') selected.add(v);
    }
    for (const e of elevators) {
      if (typeof e.target === 'number') selected.add(e.target);
    }
    drawButtons(ctx, { selected, primaryFloor, pressEvents, tt, pulse: pulse * 0.35 });

    // right-side building diagram (shafts + cars)
    const targetFloor = typeof activeElevator.target === 'number' ? activeElevator.target : null;
    const elevatorFloors = elevators.map((e) => e.floor);
    drawBuildingDiagram(ctx, { carFloor: floorNow, activeShaft, targetFloor, pulse: pulse * 0.35, tt, elevatorFloors });

    // small status strip
    ctx.save();
    const y = panelY + panelH * 0.92;
    const stripH = panelH * 0.06;
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    roundRect(ctx, panelX + panelW * 0.08, y, panelW * 0.84, stripH, Math.max(10, stripH * 0.35));
    ctx.fill();

    const next = callQueue[0] ?? '—';

    // Slow, themed annunciator messages (seeded; rotate every 5 minutes)
    const bucket = Math.floor(tt / 300);
    if (bucket !== statusBucket) {
      statusBucket = bucket;
      const segKey = sceneMode;
      refreshStatusMessage({ segKey, bucket, cur: disp, next, dir });
    }

    // Clip the message so it can be longer without overlapping NEXT.
    ctx.save();
    ctx.beginPath();
    ctx.rect(panelX + panelW * 0.10, y, panelW * 0.70, stripH);
    ctx.clip();
    drawText(ctx, ellipsize(statusMsg, 64), panelX + panelW * 0.12, y + stripH * 0.70, Math.max(12, stripH * 0.44), 'rgba(240,255,252,0.62)');
    ctx.restore();

    drawText(ctx, `NEXT: ${next}`, panelX + panelW * 0.88, y + stripH * 0.70, Math.max(12, stripH * 0.46), `rgba(120,255,240,${0.55 + pulse * 0.25})`, 'right');
    ctx.restore();

    // subtle glass + vignette depth
    drawPanelGlass(ctx, sceneMode, modeP, pulse, tt);
  }

  function init({ width, height }) {
    sceneInit(width, height);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
