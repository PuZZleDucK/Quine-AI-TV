import { mulberry32, clamp } from '../../util/prng.js';

export function createChannel({ seed, audio }) {
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let t = 0;

  // layout
  let mapW = 0;
  let mapH = 0;
  let mapX = 0;
  let mapY = 0;

  // cached art
  let mapCanvas = null;
  let mapCtx = null;
  let deskGrad = null;

  // map content
  let roads = [];
  let pois = [];
  let labels = [];
  let route = null; // {pts:[{x,y}], a:{x,y,n}, b:{x,y,n}}

  // fold choreography
  const CYCLE = 30;
  let cycleIndex = -1;
  let perfectThisCycle = false;
  let snapFlash = 0;

  let lastOpenAmt = 0;
  let lastSnapGate = 0;

  // audio
  let rustle = null; // {src,gain,filter,stop()}

  function pick(arr) {
    return arr[(rand() * arr.length) | 0];
  }

  function easeInOut(x) {
    x = clamp(x, 0, 1);
    return x * x * (3 - 2 * x);
  }

  function hash01(s) {
    // tiny deterministic hash in [0,1)
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10_000) / 10_000;
  }

  function ensureMapCanvas() {
    if (!mapCanvas) {
      mapCanvas = document.createElement('canvas');
      mapCtx = mapCanvas.getContext('2d');
    }
    mapCanvas.width = Math.max(1, Math.floor(mapW));
    mapCanvas.height = Math.max(1, Math.floor(mapH));
  }

  function makeDeskGradient() {
    const g = deskGrad = mapCtx.createLinearGradient(0, 0, 0, mapH);
    g.addColorStop(0, '#14131a');
    g.addColorStop(0.4, '#101018');
    g.addColorStop(1, '#07070c');
  }

  function generateMap() {
    roads = [];
    pois = [];
    labels = [];

    // Road network: a noisy grid with a few diagonals.
    const cols = 10 + ((rand() * 4) | 0);
    const rows = 9 + ((rand() * 4) | 0);
    const pad = Math.min(mapW, mapH) * 0.07;

    const x0 = pad;
    const y0 = pad;
    const x1 = mapW - pad;
    const y1 = mapH - pad;

    const dx = (x1 - x0) / cols;
    const dy = (y1 - y0) / rows;

    const jitter = Math.min(dx, dy) * 0.18;

    // verticals
    for (let i = 0; i <= cols; i++) {
      const major = i % 3 === 0;
      const x = x0 + i * dx + (rand() - 0.5) * jitter;
      const wig = 0.6 + rand() * 1.0;
      roads.push({
        kind: major ? 'major' : 'minor',
        pts: [
          { x, y: y0 + (rand() - 0.5) * jitter },
          { x: x + Math.sin(1.2 + i) * jitter * 0.35 * wig, y: y1 + (rand() - 0.5) * jitter },
        ],
      });
    }

    // horizontals
    for (let j = 0; j <= rows; j++) {
      const major = j % 3 === 0;
      const y = y0 + j * dy + (rand() - 0.5) * jitter;
      const wig = 0.6 + rand() * 1.0;
      roads.push({
        kind: major ? 'major' : 'minor',
        pts: [
          { x: x0 + (rand() - 0.5) * jitter, y },
          { x: x1 + (rand() - 0.5) * jitter, y: y + Math.sin(2.1 + j) * jitter * 0.35 * wig },
        ],
      });
    }

    // a couple diagonals
    const diagCount = 2 + ((rand() * 2) | 0);
    for (let k = 0; k < diagCount; k++) {
      const a = {
        x: x0 + rand() * (x1 - x0),
        y: y0 + rand() * (y1 - y0),
      };
      const b = {
        x: x0 + rand() * (x1 - x0),
        y: y0 + rand() * (y1 - y0),
      };
      roads.push({ kind: 'diag', pts: [a, b] });
    }

    const POI_NAMES = [
      'CIVIC HALL',
      'RIVERGATE',
      'WEST END',
      'EAST MARKET',
      'PARK LOOP',
      'OLD DEPOT',
      'SOUTH QUAY',
      'NORTH PLAZA',
      'CLOCKTOWER',
      'LIBRARY',
      'HARBOR',
      'UNION STN',
    ];

    const poiCount = 6 + ((rand() * 4) | 0);
    for (let i = 0; i < poiCount; i++) {
      const name = POI_NAMES.splice(((rand() * POI_NAMES.length) | 0), 1)[0] || `POI-${i + 1}`;
      pois.push({
        x: x0 + (0.1 + 0.8 * rand()) * (x1 - x0),
        y: y0 + (0.1 + 0.8 * rand()) * (y1 - y0),
        name,
      });
    }

    const LABELS = ['NORTHSIDE', 'THE GRID', 'RIVERS', 'MARKET', 'OLD TOWN', 'HILLS'];
    const labelCount = 4 + ((rand() * 3) | 0);
    for (let i = 0; i < labelCount; i++) {
      labels.push({
        x: x0 + rand() * (x1 - x0),
        y: y0 + rand() * (y1 - y0),
        text: pick(LABELS),
        r: (rand() - 0.5) * 0.18,
      });
    }

    // route between two POIs
    const a = pick(pois);
    let b = pick(pois);
    for (let tries = 0; tries < 6 && b === a; tries++) b = pick(pois);
    const mid = {
      x: clamp((a.x + b.x) * 0.5 + (rand() - 0.5) * mapW * 0.18, pad, mapW - pad),
      y: clamp((a.y + b.y) * 0.5 + (rand() - 0.5) * mapH * 0.18, pad, mapH - pad),
    };

    route = {
      a,
      b,
      pts: [
        { x: a.x, y: a.y },
        { x: mid.x, y: a.y + (mid.y - a.y) * (0.55 + rand() * 0.2) },
        { x: mid.x, y: mid.y },
        { x: b.x, y: mid.y + (b.y - mid.y) * (0.45 + rand() * 0.2) },
        { x: b.x, y: b.y },
      ],
    };
  }

  function renderMapToCache() {
    ensureMapCanvas();
    makeDeskGradient();

    // paper base
    mapCtx.setTransform(1, 0, 0, 1, 0, 0);
    mapCtx.clearRect(0, 0, mapW, mapH);

    // paper fibers
    mapCtx.fillStyle = '#efe6d2';
    mapCtx.fillRect(0, 0, mapW, mapH);

    const paper = mapCtx.createLinearGradient(0, 0, mapW, mapH);
    paper.addColorStop(0, 'rgba(255,255,255,0.35)');
    paper.addColorStop(0.4, 'rgba(255,255,255,0.05)');
    paper.addColorStop(1, 'rgba(0,0,0,0.05)');
    mapCtx.fillStyle = paper;
    mapCtx.fillRect(0, 0, mapW, mapH);

    // border
    mapCtx.strokeStyle = 'rgba(40,35,40,0.35)';
    mapCtx.lineWidth = Math.max(1, mapH / 520);
    mapCtx.strokeRect(mapW * 0.03, mapH * 0.03, mapW * 0.94, mapH * 0.94);

    // parks / blocks (light fills)
    for (let i = 0; i < 12; i++) {
      const x = mapW * (0.08 + 0.84 * rand());
      const y = mapH * (0.08 + 0.84 * rand());
      const rw = mapW * (0.05 + 0.16 * rand());
      const rh = mapH * (0.04 + 0.14 * rand());
      mapCtx.fillStyle = i % 3 === 0 ? 'rgba(125, 170, 125, 0.15)' : 'rgba(90, 120, 160, 0.06)';
      mapCtx.fillRect(x - rw * 0.5, y - rh * 0.5, rw, rh);
    }

    // river (one swoopy stroke)
    mapCtx.save();
    mapCtx.globalAlpha = 0.9;
    mapCtx.strokeStyle = 'rgba(70, 110, 170, 0.35)';
    mapCtx.lineWidth = Math.max(2, mapH / 180);
    mapCtx.lineCap = 'round';
    mapCtx.beginPath();
    const ry = mapH * (0.42 + (rand() - 0.5) * 0.18);
    mapCtx.moveTo(-mapW * 0.05, ry);
    for (let i = 0; i <= 6; i++) {
      const x = (i / 6) * mapW;
      const y = ry + Math.sin(i * 0.9 + rand() * 2) * mapH * 0.07;
      mapCtx.lineTo(x, y);
    }
    mapCtx.lineTo(mapW * 1.05, ry + mapH * 0.05);
    mapCtx.stroke();
    mapCtx.restore();

    // roads
    for (const r of roads) {
      const wMul = r.kind === 'major' ? 1.8 : r.kind === 'diag' ? 1.3 : 1;
      mapCtx.strokeStyle = r.kind === 'major' ? 'rgba(30,30,40,0.38)' : 'rgba(30,30,40,0.23)';
      mapCtx.lineWidth = Math.max(1, (mapH / 520) * wMul);
      mapCtx.lineCap = 'round';
      mapCtx.beginPath();
      mapCtx.moveTo(r.pts[0].x, r.pts[0].y);
      for (let i = 1; i < r.pts.length; i++) mapCtx.lineTo(r.pts[i].x, r.pts[i].y);
      mapCtx.stroke();
    }

    // labels
    mapCtx.save();
    mapCtx.fillStyle = 'rgba(40,35,40,0.35)';
    mapCtx.textBaseline = 'middle';
    mapCtx.font = `${Math.max(10, Math.floor(mapH / 28))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    for (const lab of labels) {
      mapCtx.save();
      mapCtx.translate(lab.x, lab.y);
      mapCtx.rotate(lab.r);
      mapCtx.fillText(lab.text, 0, 0);
      mapCtx.restore();
    }
    mapCtx.restore();

    // POIs
    mapCtx.save();
    mapCtx.font = `${Math.max(10, Math.floor(mapH / 34))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    mapCtx.textBaseline = 'top';
    for (const p of pois) {
      mapCtx.fillStyle = 'rgba(35,30,35,0.72)';
      mapCtx.fillRect(p.x - 2, p.y - 2, 4, 4);
      mapCtx.fillStyle = 'rgba(35,30,35,0.42)';
      mapCtx.fillText(p.name, p.x + 6, p.y + 2);
    }
    mapCtx.restore();

    // legend footer
    mapCtx.save();
    mapCtx.fillStyle = 'rgba(35,30,35,0.35)';
    mapCtx.font = `${Math.max(11, Math.floor(mapH / 30))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    mapCtx.textBaseline = 'alphabetic';
    mapCtx.fillText('STREET MAP FOLDING GYM', mapW * 0.05, mapH * 0.965);
    mapCtx.fillStyle = 'rgba(35,30,35,0.22)';
    mapCtx.font = `${Math.max(10, Math.floor(mapH / 34))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    mapCtx.fillText('UNFOLD • TRACE • FOLD • SNAP', mapW * 0.52, mapH * 0.965);
    mapCtx.restore();
  }

  function pulseRustle(strength = 1) {
    if (!audio.enabled || !rustle) return;
    const ctx = audio.ensure();
    const g = rustle.gain;
    const now = ctx.currentTime;
    const base = 0.0001;
    const peak = 0.015 * strength;
    try {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(Math.max(base, g.gain.value), now);
      g.gain.linearRampToValueAtTime(peak, now + 0.015);
      g.gain.exponentialRampToValueAtTime(base, now + 0.28);
    } catch {}
  }

  function onAudioOn() {
    if (!audio.enabled) return;
    const ctx = audio.ensure();

    // Build a filtered noise source for paper rustle.
    const bufferSize = 2 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const out = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) out[i] = (Math.random() * 2 - 1) * 0.9;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 0.8;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(audio.master);
    src.start();

    rustle = {
      src,
      filter,
      gain,
      stop() {
        try { src.stop(); } catch {}
      },
    };

    audio.setCurrent({
      stop() {
        try { rustle?.stop?.(); } catch {}
        rustle = null;
      },
    });
  }

  function onAudioOff() {
    try { rustle?.stop?.(); } catch {}
    rustle = null;
  }

  function destroy() {
    onAudioOff();
  }

  function sceneInit(width, height) {
    w = width;
    h = height;
    t = 0;

    // map size fits the screen with generous margins
    mapW = Math.floor(w * 0.86);
    mapH = Math.floor(h * 0.82);
    mapX = Math.floor((w - mapW) * 0.5);
    mapY = Math.floor((h - mapH) * 0.52);

    ensureMapCanvas();
    generateMap();
    renderMapToCache();

    snapFlash = 0;
    cycleIndex = -1;
    perfectThisCycle = false;
    lastOpenAmt = 0;
    lastSnapGate = 0;
  }

  function onResize(width, height) {
    sceneInit(width, height);
  }

  function openAmount(phase) {
    // 0..1 open amount across the loop
    if (phase < 0.25) return easeInOut(phase / 0.25);
    if (phase < 0.75) return 1;
    if (phase < 0.95) return 1 - easeInOut((phase - 0.75) / 0.2);
    return 0;
  }

  function update(dt) {
    t += dt;

    const newCycle = Math.floor(t / CYCLE);
    if (newCycle !== cycleIndex) {
      cycleIndex = newCycle;
      // Deterministic: use a stable "random" derived from cycle index.
      const p = hash01(`streetmapfold:${seed}:${cycleIndex}`);
      perfectThisCycle = p < 0.22;
    }

    snapFlash = Math.max(0, snapFlash - dt * 2.2);

    const phase = (t % CYCLE) / CYCLE;
    const openAmt = openAmount(phase);

    // fold/unfold rustles at threshold crossings
    const thresholds = [0.22, 0.55, 0.86];
    for (const th of thresholds) {
      if (lastOpenAmt < th && openAmt >= th) pulseRustle(0.8);
      if (lastOpenAmt > th && openAmt <= th) pulseRustle(0.9);
    }

    // snap gate in final moment
    const snapGate = phase >= 0.95 ? 1 : 0;
    if (snapGate && !lastSnapGate) {
      if (perfectThisCycle) {
        snapFlash = 1;
        pulseRustle(1.1);
        if (audio.enabled) audio.beep({ freq: 1400, dur: 0.035, gain: 0.035, type: 'square' });
        if (audio.enabled) audio.beep({ freq: 420, dur: 0.04, gain: 0.02, type: 'triangle' });
      } else {
        pulseRustle(0.6);
        if (audio.enabled) audio.beep({ freq: 480, dur: 0.03, gain: 0.012, type: 'triangle' });
      }
    }

    lastOpenAmt = openAmt;
    lastSnapGate = snapGate;
  }

  function drawDesk(ctx) {
    ctx.save();
    ctx.fillStyle = '#0b0b10';
    ctx.fillRect(0, 0, w, h);

    const g = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(30, 28, 38, 0.9)');
    g.addColorStop(0.55, 'rgba(14, 14, 22, 0.92)');
    g.addColorStop(1, 'rgba(0, 0, 0, 1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // faint desk grain
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    for (let i = 0; i < 120; i++) {
      const y = (i / 120) * h;
      const a = 0.7 + 0.3 * Math.sin(i * 0.33);
      ctx.globalAlpha = 0.02 * a;
      ctx.fillRect(0, y, w, 1);
    }
    ctx.restore();
  }

  function drawCreases(ctx, openAmt, shimmer) {
    const strong = (1 - openAmt);
    const a = 0.08 + strong * 0.22;

    const cx = mapX + mapW * 0.5;
    const cy = mapY + mapH * 0.5;

    // primary cross fold
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = `rgba(70, 60, 70, ${a})`;
    ctx.lineWidth = Math.max(1, mapH / 420);
    ctx.beginPath();
    ctx.moveTo(mapX + mapW * 0.05, cy);
    ctx.lineTo(mapX + mapW * 0.95, cy);
    ctx.moveTo(cx, mapY + mapH * 0.05);
    ctx.lineTo(cx, mapY + mapH * 0.95);
    ctx.stroke();

    // secondary quarter creases
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = `rgba(85, 70, 90, ${a * 0.75})`;
    ctx.beginPath();
    ctx.moveTo(mapX + mapW * 0.25, mapY + mapH * 0.08);
    ctx.lineTo(mapX + mapW * 0.25, mapY + mapH * 0.92);
    ctx.moveTo(mapX + mapW * 0.75, mapY + mapH * 0.08);
    ctx.lineTo(mapX + mapW * 0.75, mapY + mapH * 0.92);
    ctx.stroke();

    // highlight sheen that runs along creases
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.9;
    const sheen = 0.04 + 0.12 * shimmer;
    ctx.strokeStyle = `rgba(255, 255, 255, ${sheen})`;
    ctx.lineWidth = Math.max(1, mapH / 520);
    ctx.beginPath();
    ctx.moveTo(mapX + mapW * 0.07, cy - Math.sin(t * 1.3) * mapH * 0.003);
    ctx.lineTo(mapX + mapW * 0.93, cy - Math.sin(t * 1.3) * mapH * 0.003);
    ctx.stroke();

    ctx.restore();
  }

  function drawRoute(ctx, phase, openAmt) {
    if (!route || openAmt < 0.6) return;

    // during the open middle of the cycle, animate route trace.
    let prog = 0;
    if (phase >= 0.25 && phase < 0.75) {
      prog = (phase - 0.25) / 0.5;
    } else if (phase >= 0.75 && phase < 0.95) {
      prog = 1;
    }
    prog = clamp(prog, 0, 1);

    const pts = route.pts;
    // cumulative lengths
    let total = 0;
    const segL = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = pts[i + 1].x - pts[i].x;
      const dy = pts[i + 1].y - pts[i].y;
      const l = Math.hypot(dx, dy);
      segL.push(l);
      total += l;
    }
    const target = total * prog;

    ctx.save();
    ctx.translate(mapX, mapY);

    // dashed red route
    ctx.strokeStyle = 'rgba(208, 50, 78, 0.9)';
    ctx.lineWidth = Math.max(2, mapH / 260);
    ctx.lineCap = 'round';
    ctx.setLineDash([Math.max(8, mapH / 34), Math.max(6, mapH / 42)]);
    ctx.lineDashOffset = -t * 40;

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    let acc = 0;
    for (let i = 0; i < segL.length; i++) {
      const l = segL[i];
      if (acc + l <= target) {
        ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
        acc += l;
      } else {
        const k = clamp((target - acc) / l, 0, 1);
        ctx.lineTo(
          pts[i].x + (pts[i + 1].x - pts[i].x) * k,
          pts[i].y + (pts[i + 1].y - pts[i].y) * k,
        );
        break;
      }
    }
    ctx.stroke();

    // endpoints
    const pulse = 0.6 + 0.4 * Math.sin(t * 3.2);
    function pin(p, txt, col) {
      ctx.save();
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.65 + 0.35 * pulse;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(4, mapH / 70), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(35,30,35,0.55)';
      ctx.font = `${Math.max(11, Math.floor(mapH / 28))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, p.x + 10, p.y);
      ctx.restore();
    }

    pin(route.a, 'START', 'rgba(40, 160, 120, 0.9)');
    pin(route.b, 'FINISH', 'rgba(208, 50, 78, 0.9)');

    ctx.restore();
  }

  function drawOverlay(ctx, phase, openAmt) {
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(12, Math.floor(h / 32))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

    const x = w * 0.06;
    const y = h * 0.15;

    const glow = 0.08 + 0.16 * (1 - openAmt) + snapFlash * 0.25;
    ctx.fillStyle = `rgba(255, 210, 140, ${0.12 + glow})`;
    ctx.fillText('FOLDING SEQUENCE', x, y);

    ctx.fillStyle = 'rgba(210, 210, 220, 0.16)';
    const steps = ['UNFOLD', 'CREASE', 'TRACE', 'FOLD', 'SNAP'];
    const i = Math.floor(((phase + 0.01) * steps.length)) % steps.length;
    ctx.fillText(`STEP: ${steps[i]}`, x, y + h * 0.04);

    if (phase >= 0.95) {
      ctx.fillStyle = perfectThisCycle ? 'rgba(255, 245, 220, 0.85)' : 'rgba(255, 245, 220, 0.35)';
      ctx.fillText(perfectThisCycle ? 'PERFECT FOLD!' : 'ALIGN…', x, y + h * 0.08);
    }

    ctx.restore();
  }

  function render(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawDesk(ctx);

    const phase = (t % CYCLE) / CYCLE;
    const openAmt = openAmount(phase);

    // map pose
    const sBase = 0.42 + openAmt * 0.58;
    const sx = sBase * (0.92 + 0.08 * openAmt);
    const sy = sBase * (0.85 + 0.15 * openAmt);

    // a little "gym" wobble while open
    const wob = openAmt * 0.006;
    const rot = Math.sin(t * 0.22) * wob + (1 - openAmt) * 0.02;

    // at the snap, do a tiny settle-to-grid
    const settle = snapFlash > 0 ? snapFlash : 0;
    const snapRot = rot * (1 - 0.85 * settle);
    const snapX = (Math.sin(t * 24) * 0.9) * settle;
    const snapY = (Math.cos(t * 21) * 0.9) * settle;

    ctx.save();
    ctx.translate(mapX + mapW * 0.5 + snapX, mapY + mapH * 0.5 + snapY);
    ctx.rotate(snapRot);

    // paper drop shadow
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(-mapW * 0.5 * sx, -mapH * 0.5 * sy, mapW * sx, mapH * sy);
    ctx.restore();

    // draw cached map
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(
      mapCanvas,
      -mapW * 0.5 * sx,
      -mapH * 0.5 * sy,
      mapW * sx,
      mapH * sy,
    );

    ctx.restore();

    // creases + route in screen space
    const shimmer = 0.5 + 0.5 * Math.sin(t * 1.7);
    drawCreases(ctx, openAmt, shimmer);
    drawRoute(ctx, phase, openAmt);
    drawOverlay(ctx, phase, openAmt);

    if (snapFlash > 0) {
      ctx.fillStyle = `rgba(255, 244, 210, ${snapFlash * 0.18})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function init({ width, height }) {
    sceneInit(width, height);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
