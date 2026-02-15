// REVIEWED: 2026-02-12
import { mulberry32, clamp } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }
function lerp(a,b,t){ return a + (b-a)*t; }
function ease(t){ t = clamp(t, 0, 1); return t*t*(3 - 2*t); }

function ring(ctx, cx, cy, r, w){
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.lineWidth = w;
  ctx.stroke();
}

function roundedRect(ctx, x, y, w, h, r){
  r = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawWeave(ctx, w, h, t, pal, vignette){
  // Fabric base
  ctx.fillStyle = pal.fabric;
  ctx.fillRect(0, 0, w, h);

  // Subtle weave lines (animated offsets)
  const ox = Math.sin(t * 0.17) * 6;
  const oy = Math.cos(t * 0.13) * 6;
  const step = Math.max(10, Math.floor(Math.min(w, h) / 34));

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = pal.weaveA;
  ctx.lineWidth = 1;
  for (let y = (-step * 2 + (oy % step)); y < h + step * 2; y += step){
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = pal.weaveB;
  for (let x = (-step * 2 + (ox % step)); x < w + step * 2; x += step){
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  ctx.restore();

  // Gentle vignette to keep center readable
  if (vignette){
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }
}

function makeConstellations(){
  // Points are in hoop-local coords, roughly in [-1,1].
  // These are intentionally stylised (not astronomically exact).
  return [
    {
      id: 'orion',
      name: 'Orion',
      pts: [
        [-0.55, -0.55], [-0.20, -0.30], [ 0.20, -0.32], [ 0.55, -0.52],
        [-0.15,  0.02], [ 0.00,  0.06], [ 0.15,  0.02],
        [-0.35,  0.55], [ 0.35,  0.55],
      ],
      edges: [[0,1],[1,2],[2,3],[1,4],[4,5],[5,6],[2,6],[4,7],[6,8]]
    },
    {
      id: 'ursa',
      name: 'Ursa Major',
      pts: [[-0.62,-0.25],[-0.35,-0.15],[-0.10,-0.10],[ 0.15,-0.05],[0.42,0.08],[0.60,0.32],[0.48,0.55]],
      edges: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6]]
    },
    {
      id: 'cass',
      name: 'Cassiopeia',
      pts: [[-0.60,0.12],[-0.32,-0.10],[-0.05,0.18],[0.22,-0.08],[0.55,0.15]],
      edges: [[0,1],[1,2],[2,3],[3,4]]
    },
    {
      id: 'lyra',
      name: 'Lyra',
      pts: [[-0.20,-0.28],[0.10,-0.45],[0.42,-0.20],[0.22,0.05],[-0.10,0.10],[-0.35,-0.10]],
      edges: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[0,3]]
    },
    {
      id: 'cygnus',
      name: 'Cygnus',
      pts: [[0.00,-0.60],[0.00,-0.25],[-0.28,0.00],[0.28,0.00],[0.00,0.25],[0.00,0.60]],
      edges: [[0,1],[1,2],[1,3],[1,4],[4,5]]
    },
    {
      id: 'scorpio',
      name: 'Scorpius',
      pts: [[-0.55,-0.10],[-0.35,0.10],[-0.10,0.15],[0.12,0.05],[0.25,-0.20],[0.32,-0.42],[0.50,-0.55]],
      edges: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6]]
    },
    {
      id: 'pegasus',
      name: 'Pegasus',
      pts: [[-0.45,-0.25],[0.10,-0.25],[0.10,0.30],[-0.45,0.30],[0.42,-0.10],[0.60,0.15]],
      edges: [[0,1],[1,2],[2,3],[3,0],[1,4],[4,5]]
    },
    {
      id: 'crux',
      name: 'Crux',
      pts: [[0.00,-0.60],[0.00,-0.20],[0.00,0.22],[0.00,0.62],[-0.30,0.05],[0.30,0.05]],
      edges: [[0,1],[1,2],[2,3],[4,2],[2,5]]
    },
    {
      id: 'leo',
      name: 'Leo',
      pts: [[-0.55,0.22],[-0.32,0.08],[-0.10,0.02],[0.12,-0.06],[0.33,0.06],[0.52,0.22],[0.30,0.44],[0.06,0.36],[-0.18,0.42]],
      edges: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,8],[8,1]]
    },
    {
      id: 'aquarius',
      name: 'Aquarius',
      pts: [[-0.58,-0.08],[-0.34,-0.24],[-0.08,-0.14],[0.18,-0.30],[0.46,-0.10],[0.22,0.06],[-0.06,0.16],[-0.32,0.02],[0.46,0.24],[0.20,0.42],[-0.08,0.30]],
      edges: [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7],[7,0],[5,8],[8,9],[9,10],[10,6]]
    },
  ];
}

export function createChannel({ seed, audio }){
  const seed32 = (seed | 0) >>> 0;
  const rand = mulberry32(seed32); // visuals
  const randAudio = mulberry32((seed32 ^ 0x9e3779b9) >>> 0);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  let font = 16;
  let small = 12;
  let mono = 13;

  const palettes = [
    { fabric: '#101018', weaveA: 'rgba(255,255,255,0.06)', weaveB: 'rgba(170,190,255,0.05)', hoopA: '#2a1d12', hoopB: '#0e0b08', thread: '#e7e3df', star: '#cfe8ff', gold: '#f7d77a', ink: 'rgba(10,12,14,0.92)' },
    { fabric: '#0e1512', weaveA: 'rgba(255,255,255,0.05)', weaveB: 'rgba(190,255,230,0.05)', hoopA: '#2a1c10', hoopB: '#0f0b09', thread: '#e7f3ea', star: '#d5fff1', gold: '#ffd98a', ink: 'rgba(10,12,14,0.92)' },
    { fabric: '#161016', weaveA: 'rgba(255,255,255,0.05)', weaveB: 'rgba(255,200,255,0.05)', hoopA: '#2c2014', hoopB: '#0e0b08', thread: '#f2e6ff', star: '#f4d8ff', gold: '#ffe7a0', ink: 'rgba(10,12,14,0.92)' },
  ];
  const pal = pick(rand, palettes);

  const ALL = makeConstellations();
  let order = [];

  const PHASE_DUR = 22;
  let phaseIdx = 0;
  let phaseT = 0;

  let hoop = { cx: 0, cy: 0, r: 0, rw: 0, innerR: 0 };

  let glint = 0;
  let nextGlintAt = 0;
  let gold = 0;
  let nextGoldAt = 0;

  // Rare deterministic "special moment" (~45–120s): a shooting-star sweep that briefly
  // re-threads one segment. Kept OSD-safe (inside the hoop) and resets cleanly.
  let specialT = 0;
  const SPECIAL_DUR = 4.2;
  let nextSpecialAt = 0;
  let specialEdge = 0;
  let specialAngle = 0;

  let ambience = null;

  // Gradient caches (rebuilt on resize and ctx swap) so steady-state render avoids per-frame create*Gradient allocations.
  let gradCtx = null;
  let gradW = 0;
  let gradH = 0;
  let gradCx = 0;
  let gradCy = 0;
  let gradR = 0;
  let gradInnerR = 0;

  let weaveVignetteG = null;
  let hoopWoodG = null;
  let innerClothG = null;

  function ensureGradients(ctx){
    const { cx, cy, r, innerR } = hoop;
    if (
      ctx === gradCtx &&
      w === gradW &&
      h === gradH &&
      cx === gradCx &&
      cy === gradCy &&
      r === gradR &&
      innerR === gradInnerR &&
      weaveVignetteG &&
      hoopWoodG &&
      innerClothG
    ) return;

    gradCtx = ctx;
    gradW = w;
    gradH = h;
    gradCx = cx;
    gradCy = cy;
    gradR = r;
    gradInnerR = innerR;

    weaveVignetteG = ctx.createRadialGradient(
      w * 0.5, h * 0.52, Math.min(w, h) * 0.22,
      w * 0.5, h * 0.52, Math.max(w, h) * 0.85
    );
    weaveVignetteG.addColorStop(0, 'rgba(0,0,0,0)');
    weaveVignetteG.addColorStop(1, 'rgba(0,0,0,0.55)');

    hoopWoodG = ctx.createRadialGradient(
      cx - r * 0.18, cy - r * 0.22, r * 0.10,
      cx, cy, r * 1.1
    );
    hoopWoodG.addColorStop(0, pal.hoopA);
    hoopWoodG.addColorStop(1, pal.hoopB);

    innerClothG = ctx.createRadialGradient(
      cx, cy, innerR * 0.08,
      cx, cy, innerR * 1.1
    );
    innerClothG.addColorStop(0, 'rgba(255,255,255,0.08)');
    innerClothG.addColorStop(1, 'rgba(0,0,0,0.10)');
  }

  // Audio-only RNG (never touches visual PRNG) for FPS-stable needle clicks.
  let nextClickAt = 0;
  function scheduleNextClick(now){
    const min = 2.2;
    const max = 7.0;
    nextClickAt = now + min + randAudio() * (max - min);
  }

  function stopOwnedAmbience(){
    if (!ambience) return;
    if (audio.current === ambience){
      audio.stopCurrent();
    } else {
      try { ambience.stop?.(); } catch {}
    }
    ambience = null;
  }

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function reseedOrder(){
    // Deterministic shuffle-ish order, but stable per seed.
    const pool = ALL.slice();
    order = [];
    while (pool.length){
      const i = (rand() * pool.length) | 0;
      order.push(pool.splice(i, 1)[0]);
    }
    // Keep loop comfy: 4 constellations per cycle.
    order = order.slice(0, 4);
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;

    font = Math.max(14, Math.floor(Math.min(w, h) / 28));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(12, Math.floor(font * 0.86));

    const r = Math.min(w, h) * 0.33;
    hoop = {
      cx: w * 0.5,
      cy: h * 0.53,
      r,
      rw: Math.max(10, Math.floor(Math.min(w, h) * 0.035)),
      innerR: r - Math.max(10, Math.floor(Math.min(w, h) * 0.05)),
    };

    t = 0;
    phaseIdx = 0;
    phaseT = 0;

    glint = 0;
    nextGlintAt = 2.5 + rand() * 3.5;
    gold = 0;
    nextGoldAt = 9 + rand() * 10;

    specialT = 0;
    nextSpecialAt = 55 + rand() * 55;
    specialEdge = 0;
    specialAngle = rand() * Math.PI * 2;

    reseedOrder();
    scheduleNextClick(t);

    if (audio.enabled){
      safeBeep({ freq: 420 + randAudio() * 120, dur: 0.018, gain: 0.008, type: 'square' });
    }
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    // Idempotent: if we're toggled on repeatedly, stop our previous sources first.
    stopOwnedAmbience();
    if (!audio.enabled) return;

    // Avoid "catch-up" clicks after long silent periods.
    if (t >= nextClickAt) scheduleNextClick(t);

    const n = audio.noiseSource({ type: 'pink', gain: 0.0022 });
    n.start();
    const d = simpleDrone(audio, { root: 55 + randAudio() * 12, detune: 1.2, gain: 0.010 });

    ambience = {
      stop(){
        try { n.stop(); } catch {}
        try { d.stop(); } catch {}
      }
    };
    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    // Only clear audio.current if we own it; still stop our own sources regardless.
    stopOwnedAmbience();
  }

  function destroy(){
    stopOwnedAmbience();
  }

  function update(dt){
    t += dt;
    phaseT += dt;

    glint = Math.max(0, glint - dt * 1.6);
    gold = Math.max(0, gold - dt * 0.9);

    if (specialT > 0){
      specialT += dt;
      if (specialT >= SPECIAL_DUR) specialT = 0;
    }

    if (specialT == 0 && t >= nextSpecialAt){
      // Start a special moment: pick an edge on the *current* constellation and sweep a
      // shooting-star highlight across the hoop.
      specialT = 0.0001;
      const cons = order[phaseIdx];
      specialEdge = (rand() * cons.edges.length) | 0;
      specialAngle = rand() * Math.PI * 2;
      nextSpecialAt = t + 45 + rand() * 75;

      glint = Math.max(glint, 0.85);
      gold = Math.max(gold, 0.65);

      if (audio.enabled){
        safeBeep({ freq: 1680 + randAudio() * 520, dur: 0.032, gain: 0.006, type: 'sine' });
        safeBeep({ freq: 980 + randAudio() * 260, dur: 0.055, gain: 0.004, type: 'triangle' });
      }
    }

    if (t >= nextGlintAt){
      glint = 1;
      nextGlintAt = t + 2.5 + rand() * 4.5;
      if (audio.enabled){
        safeBeep({ freq: 1300 + randAudio() * 420, dur: 0.008 + randAudio() * 0.010, gain: 0.0018, type: 'sine' });
      }
    }

    if (t >= nextGoldAt){
      gold = 1;
      nextGoldAt = t + 10 + rand() * 14;
      if (audio.enabled){
        safeBeep({ freq: 920 + randAudio() * 180, dur: 0.018, gain: 0.007, type: 'triangle' });
        safeBeep({ freq: 520 + randAudio() * 120, dur: 0.030, gain: 0.006, type: 'sine' });
      }
    }

    if (phaseT >= PHASE_DUR){
      phaseT = phaseT % PHASE_DUR;
      phaseIdx = (phaseIdx + 1) % order.length;
      if (audio.enabled){
        safeBeep({ freq: 360 + randAudio() * 120, dur: 0.018, gain: 0.007, type: 'square' });
      }
    }

    // occasional tiny needle clicks (scheduled so FPS doesn't affect the visual PRNG)
    if (audio.enabled){
      let guard = 0;
      while (t >= nextClickAt && guard++ < 3){
        safeBeep({ freq: 210 + randAudio() * 90, dur: 0.006 + randAudio() * 0.010, gain: 0.0016, type: 'square' });
        scheduleNextClick(t);
      }
    }
  }

  function drawHoop(ctx){
    const { cx, cy, r, rw, innerR } = hoop;

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.03, cy + r * 0.05, r * 1.02, r * 0.98, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // wood ring
    ctx.strokeStyle = hoopWoodG || pal.hoopA;
    ring(ctx, cx, cy, r, rw);

    // inner cloth cutout edge
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ring(ctx, cx, cy, innerR, Math.max(2, Math.floor(rw * 0.18)));
    ctx.restore();

    // little clamp/crew hint
    ctx.save();
    ctx.translate(cx, cy - r - rw * 0.55);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-rw * 0.55, -rw * 0.42, rw * 1.1, rw * 0.84);
    ctx.fillStyle = 'rgba(240,240,240,0.25)';
    ctx.fillRect(-rw * 0.40, -rw * 0.26, rw * 0.80, rw * 0.52);
    ctx.restore();
  }

  function hoopClip(ctx){
    const { cx, cy, innerR } = hoop;
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.clip();
  }

  function toPx(pt){
    const { cx, cy, innerR } = hoop;
    return {
      x: cx + pt[0] * innerR * 0.86,
      y: cy + pt[1] * innerR * 0.86,
    };
  }

  function drawStitches(ctx, cons, p){
    const starP = ease((p - 0.05) / 0.30);
    const stitchP = ease((p - 0.30) / 0.55);
    const labelP = ease((p - 0.82) / 0.18);

    // background inside hoop: slightly brighter cloth + weave, with gentle drift
    const { cx, cy, innerR } = hoop;
    ctx.fillStyle = innerClothG;
    ctx.fillRect(cx - innerR - 2, cy - innerR - 2, innerR * 2 + 4, innerR * 2 + 4);

    // constellation stars
    for (let i = 0; i < cons.pts.length; i++){
      const s = toPx(cons.pts[i]);
      const a = 0.15 + 0.85 * starP;
      const tw = 0.55 + 0.45 * Math.sin(t * (0.9 + i * 0.12) + i * 2.1);
      const r = Math.max(1.2, innerR * (0.010 + 0.004 * tw));
      ctx.fillStyle = `rgba(207,232,255,${a * (0.65 + 0.35 * tw)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();

      // tiny stitch-hole highlight
      if (starP > 0){
        ctx.fillStyle = `rgba(0,0,0,${0.20 * a})`;
        ctx.beginPath();
        ctx.arc(s.x + r * 0.35, s.y + r * 0.35, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // stitched lines (draw edge-by-edge progress)
    const edgesToDraw = cons.edges.length * stitchP;
    const fullEdges = Math.floor(edgesToDraw);
    const tail = edgesToDraw - fullEdges;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = pal.thread;
    ctx.lineWidth = Math.max(1.4, innerR * 0.010);
    ctx.setLineDash([Math.max(4, innerR * 0.040), Math.max(3, innerR * 0.028)]);
    ctx.lineDashOffset = -t * innerR * 0.035;

    function seg(i0, i1, amt){
      const a = toPx(cons.pts[i0]);
      const b = toPx(cons.pts[i1]);
      const x = lerp(a.x, b.x, amt);
      const y = lerp(a.y, b.y, amt);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    for (let i = 0; i < fullEdges; i++){
      const e = cons.edges[i];
      seg(e[0], e[1], 1);
    }
    if (fullEdges < cons.edges.length){
      const e = cons.edges[fullEdges];
      seg(e[0], e[1], tail);
    }

    // glint shimmer sweep along thread
    if (glint > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = `rgba(255,255,255,${0.30 * glint})`;
      ctx.lineWidth *= 1.35;
      ctx.setLineDash([innerR * 0.06, innerR * 0.06]);
      ctx.lineDashOffset = -t * innerR * 0.10;
      for (let i = 0; i < Math.min(cons.edges.length, fullEdges + 1); i++){
        const e = cons.edges[i];
        seg(e[0], e[1], i < fullEdges ? 1 : tail);
      }
      ctx.restore();
    }

    // gold highlight moment
    if (gold > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = `rgba(247,215,122,${0.28 * gold})`;
      ctx.lineWidth *= 1.5;
      ctx.setLineDash([]);
      for (let i = 0; i < Math.min(cons.edges.length, fullEdges + 1); i++){
        const e = cons.edges[i];
        seg(e[0], e[1], i < fullEdges ? 1 : tail);
      }
      ctx.restore();
    }

    // rare special moment overlay: re-thread a single segment + shooting-star sweep
    if (specialT > 0 && cons.edges.length){
      const u = clamp(specialT / SPECIAL_DUR, 0, 1);
      const a = Math.sin(Math.PI * u);
      const travel = ease(u);
      const e = cons.edges[specialEdge % cons.edges.length];
      const A = toPx(cons.pts[e[0]]);
      const B = toPx(cons.pts[e[1]]);

      const tailP = Math.max(0, travel - 0.35);
      const x0 = lerp(A.x, B.x, tailP);
      const y0 = lerp(A.y, B.y, tailP);
      const x1 = lerp(A.x, B.x, travel);
      const y1 = lerp(A.y, B.y, travel);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.setLineDash([]);

      // re-thread highlight
      ctx.globalAlpha = 0.38 * a;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2.0, innerR * 0.022);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();

      ctx.globalAlpha = 0.85 * a;
      ctx.strokeStyle = pal.star;
      ctx.lineWidth = Math.max(1.2, innerR * 0.012);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();

      // sparkle at the needle head
      ctx.globalAlpha = 0.70 * a;
      ctx.fillStyle = pal.star;
      ctx.beginPath();
      ctx.arc(x1, y1, Math.max(1.6, innerR * 0.020), 0, Math.PI * 2);
      ctx.fill();

      // shooting-star sweep line across the hoop
      const dx = Math.cos(specialAngle);
      const dy = Math.sin(specialAngle);
      const px = -dy;
      const py = dx;
      const sweep = (travel - 0.5) * innerR * 0.70;
      const sx = cx + px * sweep;
      const sy = cy + py * sweep;
      const len = innerR * 1.25;

      ctx.globalAlpha = 0.12 * a;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = innerR * 0.060;
      ctx.beginPath();
      ctx.moveTo(sx - dx * len, sy - dy * len);
      ctx.lineTo(sx + dx * len, sy + dy * len);
      ctx.stroke();

      ctx.globalAlpha = 0.26 * a;
      ctx.strokeStyle = pal.gold;
      ctx.lineWidth = innerR * 0.018;
      ctx.beginPath();
      ctx.moveTo(sx - dx * len, sy - dy * len);
      ctx.lineTo(sx + dx * len, sy + dy * len);
      ctx.stroke();

      ctx.restore();
    }

    ctx.restore();

    // label card
    ctx.save();
    ctx.globalAlpha = 0.85 * labelP;
    const cardW = Math.min(w * 0.34, innerR * 1.35);
    const cardH = Math.max(42, Math.floor(font * 2.1));
    const x = hoop.cx - cardW * 0.5;
    const y = hoop.cy + innerR * 0.58;

    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    roundedRect(ctx, x, y, cardW, cardH, 14);
    ctx.fill();

    ctx.fillStyle = 'rgba(231,238,246,0.86)';
    ctx.font = `700 ${Math.max(12, Math.floor(mono * 0.95))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    const msg = `PATTERN: ${cons.name.toUpperCase()}`;
    ctx.fillText(msg, x + 16, y + cardH * 0.52);
    ctx.restore();
  }

  function header(ctx){
    const pad = Math.floor(Math.min(w, h) * 0.055);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, w, pad + font * 2.2);

    ctx.fillStyle = 'rgba(235,244,255,0.92)';
    ctx.font = `800 ${font}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText('Constellation Stitch‑Along', pad, Math.floor(pad * 0.62));

    const cons = order[phaseIdx];
    const p = phaseT / PHASE_DUR;
    ctx.fillStyle = 'rgba(235,244,255,0.72)';
    ctx.font = `600 ${small}px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif`;
    ctx.fillText(`${cons.name} • stitch → connect → finish`, pad, Math.floor(pad * 0.62 + font * 1.12));

    // progress pill
    const pillW = Math.min(w * 0.26, 220);
    const pillH = Math.max(14, Math.floor(small * 1.05));
    const px = w - pad - pillW;
    const py = Math.floor(pad * 0.70 + font * 0.20);

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundedRect(ctx, px, py, pillW, pillH, pillH);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundedRect(ctx, px + 2, py + 2, (pillW - 4) * clamp(p, 0, 1), pillH - 4, pillH);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = `700 ${Math.max(10, Math.floor(small * 0.72))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText(`PHASE ${(phaseIdx + 1)}/${order.length}`, px + 10, py + pillH * 0.54);
    ctx.restore();
  }

  function render(ctx){
    const cons = order[phaseIdx];
    const p = phaseT / PHASE_DUR;

    ensureGradients(ctx);
    drawWeave(ctx, w, h, t, pal, weaveVignetteG);
    header(ctx);

    // hoop + stitches
    ctx.save();
    hoopClip(ctx);
    drawStitches(ctx, cons, p);
    ctx.restore();

    drawHoop(ctx);

    // subtle scan/speckle
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    const dots = 160;
    for (let i = 0; i < dots; i++){
      const x = ((i * 97 + (seed|0)) % 997) / 997;
      const y = ((i * 57 + ((seed*3)|0)) % 991) / 991;
      if (((i + (t * 6) | 0) % 23) !== 0) continue;
      ctx.fillRect(x * w, y * h, 1, 1);
    }
    ctx.restore();
  }

  return {
    init,
    onResize,
    update,
    render,
    onAudioOn,
    onAudioOff,
    destroy,
  };
}
