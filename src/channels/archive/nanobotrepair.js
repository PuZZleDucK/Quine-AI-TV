import { mulberry32, clamp } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';

function lerp(a, b, t) { return a + (b - a) * t; }
function ease(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
function pick(rand, arr) { return arr[(rand() * arr.length) | 0]; }

function distToSegSq(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const denom = abx * abx + aby * aby;
  const u = denom > 1e-9 ? clamp((apx * abx + apy * aby) / denom, 0, 1) : 0;
  const cx = ax + abx * u;
  const cy = ay + aby * u;
  const dx = px - cx;
  const dy = py - cy;
  return { d2: dx * dx + dy * dy, cx, cy, u };
}

export function createChannel({ seed, audio }) {
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  // microscope viewport
  let cx = 0;
  let cy = 0;
  let R = 0;

  // crack path in pixel coords (within viewport)
  let crack = []; // [{x,y}]
  let crackSeg = []; // [{ax,ay,bx,by,len,cum}]
  let crackLen = 1;

  // swarm particles
  const BOT_N = 140;
  let bots = []; // [{x,y,vx,vy,ph,spin}]

  // phases
  const PHASES = [
    { id: 'scan', label: 'SCAN' },
    { id: 'patch', label: 'PATCH' },
    { id: 'polish', label: 'POLISH' },
  ];
  const DUR = [8.5, 11.0, 9.0];
  const CYCLE = DUR.reduce((a, b) => a + b, 0);

  let scanPingAt = 0;
  let lastPhaseId = '';
  let completeFlash = 0;
  let completeShown = false;

  // palette (deterministic)
  const palettes = [
    { bg0: '#05080a', bg1: '#071417', glass0: '#0a2b26', glass1: '#0c3a2e', ink: 'rgba(220,255,245,0.92)', sub: 'rgba(220,255,245,0.60)', accent: '#7cffc9', hi: '#c8fff1' },
    { bg0: '#07060a', bg1: '#130a16', glass0: '#2a0f2e', glass1: '#381741', ink: 'rgba(255,235,252,0.92)', sub: 'rgba(255,235,252,0.62)', accent: '#ff7fdc', hi: '#ffd1f4' },
    { bg0: '#05070d', bg1: '#071126', glass0: '#081a2c', glass1: '#0a2542', ink: 'rgba(230,245,255,0.92)', sub: 'rgba(230,245,255,0.60)', accent: '#6cf2ff', hi: '#d5fbff' },
  ];
  const pal = pick(rand, palettes);

  // audio
  let ambience = null;
  function safeBeep(opts) { if (audio.enabled) audio.beep(opts); }

  function buildCrack() {
    const base = [];
    const n = 14;
    for (let i = 0; i < n; i++) {
      const x = lerp(-0.82, 0.82, i / (n - 1));
      const wob = Math.sin(i * 0.9 + rand() * 2) * 0.06;
      const y = (rand() - 0.5) * 0.34 + wob;
      base.push({ x, y });
    }

    // introduce a few small zig-kinks
    for (let k = 0; k < 3; k++) {
      const idx = 2 + ((rand() * (n - 4)) | 0);
      base[idx].y += (rand() - 0.5) * 0.18;
    }

    // rotate + scale into viewport
    const ang = (rand() - 0.5) * 0.55;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    crack = base.map((p) => {
      const rx = p.x * ca - p.y * sa;
      const ry = p.x * sa + p.y * ca;
      return {
        x: cx + rx * R * 0.86,
        y: cy + ry * R * 0.86,
      };
    });

    // segments + cumulative length
    crackSeg = [];
    crackLen = 0;
    for (let i = 0; i < crack.length - 1; i++) {
      const a = crack[i];
      const b = crack[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      crackSeg.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, len, cum: crackLen });
      crackLen += len;
    }
    crackLen = Math.max(1, crackLen);
  }

  function resetBots() {
    bots = Array.from({ length: BOT_N }, () => {
      // random point within viewport circle
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * R * 0.86;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      return {
        x,
        y,
        vx: (rand() - 0.5) * R * 0.05,
        vy: (rand() - 0.5) * R * 0.05,
        ph: rand() * Math.PI * 2,
        spin: (rand() < 0.5 ? -1 : 1) * (0.8 + rand() * 1.4),
      };
    });
  }

  function initLayout(width, height, dprIn) {
    w = width;
    h = height;
    dpr = dprIn || 1;

    cx = w * 0.5;
    cy = h * 0.53;
    R = Math.min(w, h) * 0.41;

    t = 0;
    scanPingAt = 0;
    lastPhaseId = '';
    completeFlash = 0;
    completeShown = false;

    buildCrack();
    resetBots();
  }

  function init({ width, height, dpr: dprIn }) {
    initLayout(width, height, dprIn);
  }

  function onResize(width, height, dprIn) {
    initLayout(width, height, dprIn);
  }

  function onAudioOn() {
    if (!audio.enabled) return;
    const n = audio.noiseSource({ type: 'pink', gain: 0.0032 });
    n.start();
    const d = simpleDrone(audio, { root: 48 + rand() * 18, detune: 0.9, gain: 0.014 });
    ambience = {
      stop() {
        try { n.stop(); } catch {}
        try { d.stop(); } catch {}
      },
    };
    audio.setCurrent(ambience);
  }

  function onAudioOff() {
    try { ambience?.stop?.(); } catch {}
    ambience = null;
  }

  function destroy() {
    onAudioOff();
  }

  function phaseAt(tt) {
    let x = tt % CYCLE;
    for (let i = 0; i < PHASES.length; i++) {
      const d = DUR[i];
      if (x <= d) return { phase: PHASES[i], i, t: x / d, local: x };
      x -= d;
    }
    return { phase: PHASES[0], i: 0, t: 0, local: 0 };
  }

  function nearestCrackPoint(px, py) {
    let best = { d2: 1e18, cx: px, cy: py, along: 0 };
    for (const s of crackSeg) {
      const r = distToSegSq(px, py, s.ax, s.ay, s.bx, s.by);
      if (r.d2 < best.d2) {
        best = { d2: r.d2, cx: r.cx, cy: r.cy, along: (s.cum + r.u * s.len) / crackLen };
      }
    }
    return best;
  }

  function keepInViewport(b) {
    const dx = b.x - cx;
    const dy = b.y - cy;
    const rr = Math.hypot(dx, dy);
    const lim = R * 0.86;
    if (rr > lim) {
      const k = lim / rr;
      b.x = cx + dx * k;
      b.y = cy + dy * k;
      // nudge velocity tangentially
      const tx = -dy / rr;
      const ty = dx / rr;
      b.vx = lerp(b.vx, tx * R * 0.06, 0.5);
      b.vy = lerp(b.vy, ty * R * 0.06, 0.5);
    }
  }

  function update(dt) {
    t += dt;

    const ph = phaseAt(t);

    if (ph.phase.id !== lastPhaseId) {
      lastPhaseId = ph.phase.id;
      // phase cue
      if (audio.enabled) {
        const base = ph.phase.id === 'scan' ? 680 : ph.phase.id === 'patch' ? 520 : 740;
        safeBeep({ freq: base, dur: 0.05, gain: 0.02, type: 'triangle' });
      }
    }

    // complete sparkle moment late in polish
    if (ph.phase.id === 'polish') {
      const gate = ph.t;
      if (!completeShown && gate > 0.72) {
        completeShown = true;
        completeFlash = 1;
        safeBeep({ freq: 880, dur: 0.06, gain: 0.02, type: 'triangle' });
        safeBeep({ freq: 1320, dur: 0.04, gain: 0.016, type: 'sine' });
      }
    } else {
      completeShown = false;
    }

    completeFlash = Math.max(0, completeFlash - dt * 1.6);

    // scan pings
    if (ph.phase.id === 'scan') {
      scanPingAt -= dt;
      if (scanPingAt <= 0) {
        scanPingAt = 0.85 + rand() * 0.35;
        safeBeep({ freq: 980 + rand() * 220, dur: 0.025, gain: 0.014, type: 'square' });
      }
    }

    // bot motion
    const baseSpeed = R * (0.22 + 0.05 * Math.sin(t * 0.7));
    const wander = 0.8 + 0.2 * Math.sin(t * 0.9);

    for (const b of bots) {
      b.ph += dt * b.spin * (0.7 + 0.3 * Math.sin(t * 0.5 + b.ph));

      // gentle wandering noise-ish
      b.vx += Math.cos(b.ph) * baseSpeed * dt * 0.12 * wander;
      b.vy += Math.sin(b.ph * 0.9) * baseSpeed * dt * 0.12 * wander;

      const n = nearestCrackPoint(b.x, b.y);
      const near = Math.exp(-n.d2 / (R * R * 0.018));

      if (ph.phase.id === 'patch') {
        // pull bots toward crack; stronger as patch progresses
        const pull = (0.12 + 0.55 * ease(ph.t)) * (0.25 + near);
        b.vx = lerp(b.vx, (n.cx - b.x) * pull, 0.10);
        b.vy = lerp(b.vy, (n.cy - b.y) * pull, 0.10);
      } else if (ph.phase.id === 'polish') {
        // swirl along crack (tangential)
        const tx = -(n.cy - b.y);
        const ty = (n.cx - b.x);
        const tl = Math.hypot(tx, ty) || 1;
        const swirl = (0.10 + 0.28 * ease(ph.t)) * (0.25 + near);
        b.vx = lerp(b.vx, (tx / tl) * baseSpeed * swirl, 0.12);
        b.vy = lerp(b.vy, (ty / tl) * baseSpeed * swirl, 0.12);
      }

      // cap velocity
      const sp = Math.hypot(b.vx, b.vy);
      const cap = baseSpeed * (ph.phase.id === 'patch' ? 0.55 : 0.75);
      if (sp > cap) {
        const k = cap / sp;
        b.vx *= k;
        b.vy *= k;
      }

      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // slight damping
      b.vx *= 0.94;
      b.vy *= 0.94;

      keepInViewport(b);
    }
  }

  function drawCrack(ctx, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // shadow/depth
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = Math.max(1, R * 0.010);
    ctx.beginPath();
    for (let i = 0; i < crack.length; i++) {
      const p = crack[i];
      if (i === 0) ctx.moveTo(p.x + 1, p.y + 1);
      else ctx.lineTo(p.x + 1, p.y + 1);
    }
    ctx.stroke();

    // main crack
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = Math.max(1, R * 0.007);
    ctx.beginPath();
    for (let i = 0; i < crack.length; i++) {
      const p = crack[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();

    ctx.restore();
  }

  function drawPatch(ctx, amt) {
    amt = clamp(amt, 0, 1);
    const targetLen = crackLen * ease(amt);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // filled seam
    ctx.strokeStyle = `rgba(124, 255, 201, ${0.18 + amt * 0.22})`;
    ctx.shadowColor = `rgba(124, 255, 201, ${0.35 + amt * 0.25})`;
    ctx.shadowBlur = 14 * (0.6 + amt * 0.7);
    ctx.lineWidth = Math.max(2, R * (0.010 + amt * 0.004));

    ctx.beginPath();
    let acc = 0;
    for (let i = 0; i < crack.length - 1; i++) {
      const a = crack[i];
      const b = crack[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      const nextAcc = acc + segLen;

      if (i === 0) ctx.moveTo(a.x, a.y);

      if (nextAcc <= targetLen) {
        ctx.lineTo(b.x, b.y);
      } else {
        const u = segLen > 1e-6 ? clamp((targetLen - acc) / segLen, 0, 1) : 0;
        ctx.lineTo(lerp(a.x, b.x, u), lerp(a.y, b.y, u));
        break;
      }
      acc = nextAcc;
    }
    ctx.stroke();

    ctx.restore();
  }

  function drawBots(ctx, phId, phT) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    const aBase = phId === 'patch' ? 0.85 : phId === 'polish' ? 0.78 : 0.70;
    const size = Math.max(1, R * 0.008);

    for (const b of bots) {
      const n = nearestCrackPoint(b.x, b.y);
      const near = Math.exp(-n.d2 / (R * R * 0.014));
      const a = aBase * (0.12 + 0.88 * near);
      const r = size * (0.7 + 0.7 * near);

      ctx.fillStyle = `rgba(200, 255, 241, ${a})`;
      ctx.shadowColor = `rgba(124,255,201,${0.25 + 0.45 * near})`;
      ctx.shadowBlur = 8 + 12 * near;
      ctx.beginPath();
      ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
      ctx.fill();

      // occasional tiny spark
      const s = Math.sin((b.x * 0.013 + b.y * 0.017) + t * (2.4 + near * 3.5));
      if (s > 0.995 && (phId === 'patch' || phId === 'polish')) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.35 * near})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(b.x - r * 2.2, b.y);
        ctx.lineTo(b.x + r * 2.2, b.y);
        ctx.moveTo(b.x, b.y - r * 2.2);
        ctx.lineTo(b.x, b.y + r * 2.2);
        ctx.stroke();
      }
    }

    // polish glint sweep
    if (phId === 'polish') {
      const u = ease(phT);
      const gx = lerp(cx - R * 0.8, cx + R * 0.8, u);
      const g = ctx.createLinearGradient(gx - R * 0.25, 0, gx + R * 0.25, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, `rgba(255,255,255,${0.10 + 0.10 * (1 - u)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = g;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    }

    ctx.restore();
  }

  function drawHud(ctx, ph, phT) {
    ctx.save();

    ctx.fillStyle = pal.ink;
    ctx.globalAlpha = 0.92;
    ctx.font = `800 ${Math.max(14, Math.floor(h * 0.030))}px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Nanobot Repair Swarm', 22, 18);

    ctx.globalAlpha = 0.74;
    ctx.font = `700 ${Math.max(11, Math.floor(h * 0.018))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`PHASE: ${ph.label}`, 22, 18 + Math.max(14, Math.floor(h * 0.030)) + 8);

    const pct = Math.round(phT * 100);
    ctx.fillText(`PROGRESS: ${pct}%`, 22, 18 + Math.max(14, Math.floor(h * 0.030)) + 8 + Math.max(11, Math.floor(h * 0.018)) + 6);

    // completion stamp
    if (completeFlash > 0.01) {
      const a = ease(completeFlash);
      ctx.globalAlpha = 0.8 * a;
      ctx.fillStyle = pal.accent;
      ctx.font = `900 ${Math.max(12, Math.floor(h * 0.022))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('REPAIR COMPLETE', w * 0.5, h * 0.18);

      ctx.globalAlpha = 0.20 * a;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
  }

  function render(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const ph = phaseAt(t);

    // background vignette
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, pal.bg0);
    bg.addColorStop(1, pal.bg1);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const vg = ctx.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.55, Math.max(w, h) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // microscope ring + clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    // glass
    const g = ctx.createRadialGradient(cx, cy, R * 0.15, cx, cy, R);
    g.addColorStop(0, pal.glass1);
    g.addColorStop(1, pal.glass0);
    ctx.fillStyle = g;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

    // subtle grain
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    for (let i = 0; i < 220; i++) {
      const a = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * R;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();

    // crack + patch layers
    const crackA = ph.phase.id === 'polish' ? (0.85 - 0.70 * ease(ph.t)) : 1;
    drawCrack(ctx, crackA);

    if (ph.phase.id === 'patch') {
      drawPatch(ctx, ph.t);
    } else if (ph.phase.id === 'polish') {
      // lingering seam glow fades out
      drawPatch(ctx, 1 - 0.65 * ease(ph.t));
    }

    // scan line
    if (ph.phase.id === 'scan') {
      const u = ease(ph.t);
      const sx = lerp(cx - R * 0.86, cx + R * 0.86, u);
      const beam = ctx.createLinearGradient(sx - R * 0.18, 0, sx + R * 0.18, 0);
      beam.addColorStop(0, 'rgba(0,0,0,0)');
      beam.addColorStop(0.5, `rgba(124,255,201,${0.10 + 0.10 * Math.sin(t * 6)})`);
      beam.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = beam;
      ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

      // faint gridlines
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = pal.hi;
      ctx.lineWidth = 1;
      const step = Math.max(18, Math.floor(R * 0.14));
      for (let x = cx - R; x <= cx + R; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, cy - R);
        ctx.lineTo(x, cy + R);
        ctx.stroke();
      }
      for (let y = cy - R; y <= cy + R; y += step) {
        ctx.beginPath();
        ctx.moveTo(cx - R, y);
        ctx.lineTo(cx + R, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // bots over everything
    drawBots(ctx, ph.phase.id, ph.t);

    ctx.restore();

    // ring + glare
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = Math.max(2, Math.floor(R * 0.03));
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = pal.hi;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx - R * 0.15, cy - R * 0.25, R * 0.78, 0.2, 1.35);
    ctx.stroke();
    ctx.restore();

    drawHud(ctx, ph.phase, ph.t);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
