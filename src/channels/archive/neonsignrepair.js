import { mulberry32, clamp } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }
function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

function roundRectPath(ctx, x, y, w, h, r){
  const rr = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;

  let t = 0;

  // layout
  let font = 16;
  let small = 12;
  let mono = 13;

  const palettes = [
    { bg0: '#04060d', bg1: '#0b0e19', bench0: '#1d1410', bench1: '#140e0c', ink: 'rgba(240,240,245,0.92)', dim: 'rgba(240,240,245,0.55)', neonA: '#ff3bd4', neonB: '#6cf2ff', neonC: '#b7ff8a', warn: '#ffd46a' },
    { bg0: '#04020a', bg1: '#0a0515', bench0: '#201316', bench1: '#120a0c', ink: 'rgba(250,246,238,0.92)', dim: 'rgba(250,246,238,0.58)', neonA: '#ff6a3a', neonB: '#7affd6', neonC: '#7a5cff', warn: '#ffd86a' },
    { bg0: '#02050c', bg1: '#061626', bench0: '#1a1f19', bench1: '#0f120f', ink: 'rgba(235,248,255,0.92)', dim: 'rgba(235,248,255,0.56)', neonA: '#72f7ff', neonB: '#ff4e8a', neonC: '#ffd57a', warn: '#b7ff8a' },
  ];
  const pal = pick(rand, palettes);

  const PHASES = [
    { id: 'diag', label: 'DIAGNOSE' },
    { id: 'bend', label: 'BEND' },
    { id: 'seal', label: 'SEAL' },
    { id: 'light', label: 'LIGHT' },
  ];

  const PHASE_DUR = 18;
  let phaseIdx = 0;
  let phaseT = 0;

  // neon tubes (precomputed)
  // tube: { pts:[{x,y}], col, brokenAt (0..1), glow (0..1), steady (0..1) }
  let tubes = [];

  // scanning / repair cursor
  let scanX = 0;
  let scanDir = 1;

  // special moments
  let spark = { x: 0, y: 0, a: 0 };
  let flicker = 0;
  let nextFlickerAt = 0;
  let steadyFlash = 0;
  let steadyTriggered = false;

  // particles (tiny sparks)
  let parts = []; // {x,y,vx,vy,life}

  // audio
  let ambience = null;
  let crackleAcc = 0;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function regen(){
    t = 0;
    phaseIdx = 0;
    phaseT = 0;

    scanX = 0;
    scanDir = 1;

    spark = { x: w * 0.5, y: h * 0.52, a: 0 };
    flicker = 0;
    nextFlickerAt = 2.2 + rand() * 3.2;
    steadyFlash = 0;
    steadyTriggered = false;

    parts = [];

    const cx = w * 0.5;
    const cy = h * 0.56;

    const signW = Math.min(w * 0.78, h * 1.05);
    const signH = signW * 0.42;

    // three tube shapes: top word, middle swoosh, bottom underline
    const colA = pick(rand, [pal.neonA, pal.neonB]);
    const colB = pick(rand, [pal.neonB, pal.neonC]);
    const colC = pick(rand, [pal.neonC, pal.neonA]);

    function mkPts(kind){
      const pts = [];
      const x0 = cx - signW * 0.45;
      const x1 = cx + signW * 0.45;
      const yTop = cy - signH * 0.35;
      const yMid = cy;
      const yBot = cy + signH * 0.33;

      if (kind === 'zig'){
        const n = 10;
        for (let i=0;i<=n;i++){
          const u = i / n;
          const x = lerp(x0, x1, u);
          const y = yTop + Math.sin(u * Math.PI * 2) * signH * 0.08 + (i % 2 ? signH * 0.03 : -signH * 0.03);
          pts.push({ x, y });
        }
      } else if (kind === 'swoosh'){
        const n = 18;
        for (let i=0;i<=n;i++){
          const u = i / n;
          const x = lerp(x0, x1, u);
          const y = yMid + Math.sin(u * Math.PI * 2) * signH * 0.12;
          pts.push({ x, y });
        }
      } else {
        // underline
        const n = 8;
        for (let i=0;i<=n;i++){
          const u = i / n;
          const x = lerp(x0 + signW * 0.08, x1 - signW * 0.08, u);
          const y = yBot + Math.sin(u * Math.PI) * signH * 0.02;
          pts.push({ x, y });
        }
      }
      return pts;
    }

    tubes = [
      { pts: mkPts('zig'), col: colA, brokenAt: 0.25 + rand() * 0.55, glow: 0.1, steady: 0 },
      { pts: mkPts('swoosh'), col: colB, brokenAt: 0.2 + rand() * 0.6, glow: 0.08, steady: 0 },
      { pts: mkPts('line'), col: colC, brokenAt: 0.25 + rand() * 0.55, glow: 0.06, steady: 0 },
    ];

    crackleAcc = 0;
  }

  function onPhaseEnter(){
    const ph = PHASES[phaseIdx].id;

    // phase click
    safeBeep({ freq: 420 + rand() * 140, dur: 0.016, gain: 0.008, type: 'square' });

    if (ph === 'diag'){
      // tiny "probe" tone
      safeBeep({ freq: 760 + rand() * 90, dur: 0.045, gain: 0.01, type: 'sine' });
    }

    if (ph === 'light'){
      nextFlickerAt = t + 1.2 + rand() * 1.8;
      steadyTriggered = false;
    }
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;

    font = Math.max(14, Math.floor(Math.min(w, h) / 32));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(12, Math.floor(font * 0.86));

    regen();
    onPhaseEnter();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    const n = audio.noiseSource({ type: 'brown', gain: 0.0035 });
    n.start();

    const d = simpleDrone(audio, { root: 55 + rand() * 18, detune: 0.9, gain: 0.014 });

    ambience = {
      stop(){
        try { n.stop(); } catch {}
        try { d.stop(); } catch {}
      }
    };

    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    try { ambience?.stop?.(); } catch {}
    ambience = null;
  }

  function destroy(){
    onAudioOff();
  }

  function tubePointAt(tube, u){
    const pts = tube.pts;
    const n = pts.length;
    if (n <= 1) return { x: pts[0].x, y: pts[0].y };
    const s = clamp(u, 0, 0.9999) * (n - 1);
    const i = Math.floor(s);
    const f = s - i;
    const a = pts[i];
    const b = pts[i + 1];
    return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) };
  }

  function spawnSparks(x, y, n){
    for (let i=0;i<n;i++){
      parts.push({
        x,
        y,
        vx: (rand() - 0.5) * w * 0.22,
        vy: -Math.abs(rand()) * h * 0.28,
        life: 0.22 + rand() * 0.35,
      });
    }
  }

  function update(dt){
    t += dt;
    phaseT += dt;

    spark.a = Math.max(0, spark.a - dt * 3.5);
    flicker = Math.max(0, flicker - dt * 2.8);
    steadyFlash = Math.max(0, steadyFlash - dt * 1.6);

    // phase
    while (phaseT >= PHASE_DUR){
      phaseT -= PHASE_DUR;
      phaseIdx = (phaseIdx + 1) % PHASES.length;
      onPhaseEnter();
    }

    const ph = PHASES[phaseIdx].id;
    const u = phaseT / PHASE_DUR;

    // scanning line
    if (ph === 'diag'){
      scanX += scanDir * dt * w * 0.16;
      const lo = -w * 0.05;
      const hi = w * 0.05;
      if (scanX > hi){ scanX = hi; scanDir = -1; }
      if (scanX < lo){ scanX = lo; scanDir = 1; }

      // "crackle test" beeps on peaks
      crackleAcc += dt;
      if (audio.enabled && crackleAcc > 0.55){
        crackleAcc = 0;
        safeBeep({ freq: 980 + rand() * 420, dur: 0.02, gain: 0.008, type: 'square' });
      }
    }

    // repair progression per phase
    tubes.forEach((tube, idx) => {
      const target = ph === 'diag' ? 0.12 : ph === 'bend' ? 0.22 : ph === 'seal' ? 0.35 : 0.85;
      const k = ph === 'light' ? 0.8 : 0.5;
      tube.glow = lerp(tube.glow, target, 1 - Math.exp(-dt * k));

      if (ph === 'bend' && idx === 0){
        tube.brokenAt = lerp(tube.brokenAt, 0.12, dt * 0.08);
      }

      if (ph === 'seal' && idx === 1){
        tube.brokenAt = lerp(tube.brokenAt, 0.06, dt * 0.1);
      }

      if (ph === 'light'){
        tube.steady = lerp(tube.steady, 1, 1 - Math.exp(-dt * 0.25));
      } else {
        tube.steady = lerp(tube.steady, 0, 1 - Math.exp(-dt * 0.9));
      }
    });

    // timed flicker moments in LIGHT
    if (ph === 'light' && t >= nextFlickerAt){
      flicker = 1;
      nextFlickerAt = t + 1.6 + rand() * 3.0;

      const tube = pick(rand, tubes);
      const p = tubePointAt(tube, tube.brokenAt);
      spark = { x: p.x, y: p.y, a: 1 };
      spawnSparks(p.x, p.y, 10 + ((rand() * 10) | 0));

      safeBeep({ freq: 1200 + rand() * 900, dur: 0.018, gain: 0.01, type: 'square' });
      safeBeep({ freq: 190 + rand() * 70, dur: 0.05, gain: 0.006, type: 'sine' });

      // once per LIGHT phase, do a "steady glow" moment near the end
      if (!steadyTriggered && u > 0.72){
        steadyTriggered = true;
        steadyFlash = 1;
        safeBeep({ freq: 640, dur: 0.09, gain: 0.012, type: 'triangle' });
      }
    }

    // particles
    for (let i = parts.length - 1; i >= 0; i--){
      const p = parts[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += h * 0.55 * dt;
      p.life -= dt;
      if (p.life <= 0) parts.splice(i, 1);
    }
  }

  function drawTube(ctx, tube, amp, dimOnly=false){
    const pts = tube.pts;
    if (pts.length < 2) return;

    const brokenU = clamp(tube.brokenAt + (amp - 0.5) * 0.03, 0.04, 0.96);

    // base glass
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(230,230,235,0.15)';
    ctx.lineWidth = Math.max(2.2, Math.min(w, h) * 0.0042);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    // neon glow (split at "break")
    const lw = Math.max(3.2, Math.min(w, h) * 0.0062);
    const glow = tube.glow * (dimOnly ? 0.7 : 1);

    function strokeSegment(a, b, alpha, blur){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.shadowColor = tube.col;
      ctx.shadowBlur = blur;
      ctx.strokeStyle = tube.col;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      for (let i=a.i+1;i<=b.i;i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.restore();
    }

    // determine index of break
    const s = brokenU * (pts.length - 1);
    const bi = Math.floor(s);

    const left = { i: bi };
    const right = { i: Math.min(pts.length - 1, bi + 1) };

    // left segment (always stable-ish)
    const a0 = { x: pts[0].x, y: pts[0].y, i: 0 };
    const b0 = { x: pts[bi].x, y: pts[bi].y, i: bi };

    const flick = 0.25 + 0.75 * (1 - flicker);
    const steady = 0.35 + 0.65 * tube.steady;

    const alphaL = (0.08 + glow * 0.65) * steady;
    const alphaR = (0.05 + glow * 0.62) * steady * flick;

    strokeSegment(a0, b0, alphaL, 18 + glow * 26);

    // right segment flickers more until "steady"
    const a1 = { x: pts[right.i].x, y: pts[right.i].y, i: right.i };
    const b1 = { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y, i: pts.length - 1 };
    strokeSegment(a1, b1, alphaR, 16 + glow * 28);

    // bright core (thin)
    if (!dimOnly){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = tube.col;
      ctx.globalAlpha = (0.12 + glow * 0.55) * steady;
      ctx.lineWidth = Math.max(1.2, lw * 0.46);
      ctx.shadowColor = tube.col;
      ctx.shadowBlur = 8 + glow * 10;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.restore();
    }

    // break gap highlight
    const bp = tubePointAt(tube, brokenU);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = (0.08 + glow * 0.35) * (1 - tube.steady * 0.6);
    ctx.fillStyle = pal.warn;
    ctx.shadowColor = pal.warn;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, Math.max(2.4, lw * 0.48), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function draw(ctx){
    // background
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal.bg0);
    g.addColorStop(1, pal.bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // subtle vignette
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(40,60,90,0.08)';
    ctx.fillRect(0, h * 0.15, w, h * 0.6);
    ctx.restore();

    // bench
    const bx = w * 0.08;
    const by = h * 0.62;
    const bw = w * 0.84;
    const bh = h * 0.28;

    const wood = ctx.createLinearGradient(0, by, 0, by + bh);
    wood.addColorStop(0, pal.bench0);
    wood.addColorStop(1, pal.bench1);
    ctx.fillStyle = wood;
    ctx.fillRect(bx, by, bw, bh);

    // bench grain
    ctx.save();
    ctx.globalAlpha = 0.18;
    for (let i=0;i<32;i++){
      const y = by + (i / 32) * bh;
      ctx.strokeStyle = i % 2 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.08)';
      ctx.beginPath();
      ctx.moveTo(bx, y);
      ctx.lineTo(bx + bw, y);
      ctx.stroke();
    }
    ctx.restore();

    // sign backing plate
    const sx = w * 0.18;
    const sy = h * 0.18;
    const sw = w * 0.64;
    const sh = h * 0.40;

    ctx.save();
    ctx.fillStyle = 'rgba(10,12,18,0.72)';
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 2;
    roundRectPath(ctx, sx, sy, sw, sh, 14);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // mounting clips
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(230,230,235,0.22)';
    for (let i=0;i<6;i++){
      const u = (i + 0.5) / 6;
      const x = lerp(sx + sw * 0.08, sx + sw * 0.92, u);
      const y = sy + sh * (i % 2 ? 0.82 : 0.18);
      ctx.fillRect(x - 7, y - 3, 14, 6);
    }
    ctx.restore();

    // tubes
    const amp = 0.5 + 0.5 * Math.sin(t * 1.1);
    ctx.save();
    tubes.forEach(tube => drawTube(ctx, tube, amp));
    ctx.restore();

    // scanline / tool light
    const ph = PHASES[phaseIdx].id;
    const u = phaseT / PHASE_DUR;

    if (ph === 'diag'){
      const x = w * 0.5 + scanX;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const sg = ctx.createLinearGradient(x - w * 0.06, 0, x + w * 0.06, 0);
      sg.addColorStop(0, 'rgba(108,242,255,0)');
      sg.addColorStop(0.5, 'rgba(108,242,255,0.16)');
      sg.addColorStop(1, 'rgba(108,242,255,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(0, h * 0.18, w, h * 0.42);
      ctx.restore();
    }

    if (ph === 'bend' || ph === 'seal'){
      const tube = ph === 'bend' ? tubes[0] : tubes[1];
      const p = tubePointAt(tube, ease(0.15 + u * 0.65));
      const r = Math.max(10, Math.min(w, h) * 0.028);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = ph === 'bend' ? 'rgba(255,212,106,0.55)' : 'rgba(255,106,58,0.55)';
      ctx.shadowColor = ph === 'bend' ? pal.warn : pal.neonA;
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // micro sparks for SEAL
      if (ph === 'seal' && (Math.sin(t * 7.5) > 0.92)){
        spawnSparks(p.x, p.y, 2);
        safeBeep({ freq: 1400 + rand() * 700, dur: 0.012, gain: 0.006, type: 'square' });
      }
    }

    // sparks particles
    if (parts.length){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const p of parts){
        const a = clamp(p.life / 0.5, 0, 1);
        ctx.globalAlpha = a * 0.85;
        ctx.fillStyle = pal.warn;
        ctx.fillRect(p.x, p.y, 2.2, 2.2);
      }
      ctx.restore();
    }

    // main spark flash + steady flash
    if (spark.a > 0 || steadyFlash > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const a = spark.a * 0.65 + steadyFlash * 0.22;
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.shadowColor = pal.warn;
      ctx.shadowBlur = 30;
      ctx.beginPath();
      ctx.arc(spark.x, spark.y, 7 + steadyFlash * 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // HUD
    ctx.save();
    ctx.fillStyle = pal.ink;
    ctx.font = `600 ${font}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText('NEON SIGN REPAIR BENCH', w * 0.08, h * 0.06);

    ctx.fillStyle = pal.dim;
    ctx.font = `${small}px ui-sans-serif, system-ui`;
    const phase = PHASES[phaseIdx];
    ctx.fillText(`PHASE: ${phase.label}`, w * 0.08, h * 0.06 + font + 6);

    // tiny progress bar
    const px = w * 0.08;
    const py = h * 0.06 + font + small + 16;
    const pw = Math.min(w * 0.34, 260);
    const phh = 7;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(px, py, pw, phh);
    ctx.fillStyle = phase.id === 'light' ? pal.neonB : pal.warn;
    ctx.fillRect(px, py, pw * clamp(u, 0, 1), phh);

    // status line
    ctx.fillStyle = pal.dim;
    ctx.font = `${mono}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    const status = phase.id === 'diag'
      ? 'probe: continuity…  leak: suspected'
      : phase.id === 'bend'
        ? 'fixture: align bend radius'
        : phase.id === 'seal'
          ? 'torch: micro-seal  leak: closing'
          : (steadyFlash > 0.1 ? 'power: steady glow ✓' : 'power: warm-up…');
    ctx.fillText(status, w * 0.08, py + 14);

    ctx.restore();

    // subtle flicker overlay
    if (flicker > 0){
      ctx.save();
      ctx.globalAlpha = flicker * 0.10;
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  return {
    onResize,
    onAudioOn,
    onAudioOff,
    update,
    draw,
    destroy,
  };
}
