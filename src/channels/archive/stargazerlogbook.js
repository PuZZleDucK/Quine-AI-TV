import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

// Stargazer's Logbook
// Telescope view + handwritten notes: target → track → sketch phases,
// with timed meteor streaks and subtle focus “breathing”.

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }
function lerp(a,b,t){ return a + (b-a)*t; }

function roundRect(ctx, x, y, w, h, r){
  r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function softNoise2(t){
  // simple deterministic-ish “noise” from sines (no allocation)
  return (
    0.5 + 0.25 * Math.sin(t * 0.9) +
    0.18 * Math.sin(t * 1.7 + 1.3) +
    0.12 * Math.sin(t * 3.1 + 2.7)
  );
}

const TARGETS = [
  { name: 'M42 ORION NEBULA', kind: 'nebula', tint: [110, 190, 255] },
  { name: 'M13 HERCULES CLUSTER', kind: 'cluster', tint: [220, 235, 255] },
  { name: 'SATURN (RINGS)', kind: 'planet', tint: [255, 220, 150] },
  { name: 'JUPITER (BANDS)', kind: 'planet', tint: [255, 210, 165] },
  { name: 'THE PLEIADES', kind: 'cluster', tint: [170, 215, 255] },
  { name: 'ANDROMEDA GALAXY', kind: 'galaxy', tint: [200, 220, 255] },
  { name: 'LUNAR TERMINATOR', kind: 'moon', tint: [235, 240, 255] },
  { name: 'VEGA / LYRA', kind: 'star', tint: [210, 235, 255] },
  { name: 'BETELGEUSE', kind: 'star', tint: [255, 185, 165] },
];

const NOTE_BITS = {
  seeing: ['steady', 'soft', 'variable', 'good', 'excellent', 'hazy'],
  transparency: ['clear', 'thin cloud', 'dusty', 'crisp', 'glassy'],
  mood: ['quiet', 'patient', 'methodical', 'sleepy', 'delighted'],
  verbs: ['tracked', 'centered', 'focused', 'confirmed', 'sketched', 'logged'],
  extra: [
    'faint detail appears with averted vision',
    'field drift corrected every few beats',
    'brief sparkle near the edge of the FOV',
    'contrast improves after refocus',
    'a tiny meteor cut across the frame',
    'notes smudge slightly on the page',
  ],
};

function genSketch(rand){
  // generate a small star pattern and a handful of segments to “sketch”
  const stars = [];
  const n = 14 + ((rand() * 10) | 0);
  for (let i = 0; i < n; i++){
    stars.push({
      x: 0.18 + rand() * 0.64,
      y: 0.18 + rand() * 0.64,
      m: 0.4 + rand() * 0.6,
    });
  }

  const segs = [];
  const sCount = 10 + ((rand() * 10) | 0);
  for (let i = 0; i < sCount; i++){
    const a = (rand() * stars.length) | 0;
    let b = (rand() * stars.length) | 0;
    if (b === a) b = (b + 1) % stars.length;
    // prefer shorter lines to look “constellation-ish”
    const dx = stars[a].x - stars[b].x;
    const dy = stars[a].y - stars[b].y;
    const d = Math.hypot(dx, dy);
    if (d > 0.55 && rand() < 0.75) continue;
    segs.push([a, b]);
  }

  return { stars, segs };
}

function genObservation(rand, idx){
  const target = pick(rand, TARGETS);

  const raH = (rand() * 24) | 0;
  const raM = (rand() * 60) | 0;
  const decS = rand() < 0.5 ? '-' : '+';
  const decD = (rand() * 80) | 0;
  const decM = (rand() * 60) | 0;
  const mag = 50 + ((rand() * 180) | 0);

  const seeing = pick(rand, NOTE_BITS.seeing);
  const trans = pick(rand, NOTE_BITS.transparency);
  const mood = pick(rand, NOTE_BITS.mood);
  const verb = pick(rand, NOTE_BITS.verbs);

  const noteA = pick(rand, NOTE_BITS.extra);
  const noteB = pick(rand, NOTE_BITS.extra);

  const sketch = genSketch(rand);

  // a seeded-ish drift signature
  const drift = {
    a: rand() * Math.PI * 2,
    b: rand() * Math.PI * 2,
    s: 0.6 + rand() * 0.7,
  };

  return {
    idx,
    target,
    ra: `${String(raH).padStart(2,'0')}:${String(raM).padStart(2,'0')}`,
    dec: `${decS}${String(decD).padStart(2,'0')}°${String(decM).padStart(2,'0')}`,
    mag,
    seeing,
    trans,
    mood,
    verb,
    noteA,
    noteB,
    sketch,
    drift,
  };
}

export function createChannel({ seed, audio }) {
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let t = 0;

  // layout (computed on resize)
  let scope = { cx: 0, cy: 0, r: 0 };
  let page = { x: 0, y: 0, w: 0, h: 0 };
  let sketchBox = { x: 0, y: 0, w: 0, h: 0 };

  // background stars (normalized)
  let bgStars = [];

  // observations
  const observations = Array.from({ length: 10 }, (_, i) => genObservation(rand, i));
  let obsIndex = 0;
  let curObs = observations[0];

  // phase machine
  const PHASES = ['TARGET', 'TRACK', 'SKETCH'];
  const phaseDur = 22; // seconds per phase
  const cycleDur = phaseDur * PHASES.length;
  let phaseIndex = 0;
  let prevPhaseIndex = -1;
  let cycleIndex = -1;

  // special moments
  let nextMeteorAt = 0;
  let meteor = null;
  let flash = 0;

  // audio
  let drone = null;
  let noise = null;
  let musicHandle = null;

  function initStars(){
    bgStars = Array.from({ length: 420 }, () => ({
      x: rand(),
      y: rand(),
      z: 0.15 + rand() * 0.95,
      tw: rand() * 12,
      hue: 195 + rand() * 80,
    }));
  }

  function sceneInit(width, height){
    w = width;
    h = height;
    t = 0;
    flash = 0;

    // telescope view on left; notebook on right
    const pad = Math.min(w, h) * 0.04;
    const pageW = Math.max(280, w * 0.38);
    page = {
      x: w - pageW - pad,
      y: pad,
      w: pageW,
      h: h - pad * 2,
    };

    const scopeAreaW = w - pageW - pad * 3;
    const scopeR = Math.min(scopeAreaW, h) * 0.42;
    scope = {
      cx: pad + scopeAreaW * 0.52,
      cy: h * 0.52,
      r: Math.max(120, scopeR),
    };

    sketchBox = {
      x: page.x + page.w * 0.11,
      y: page.y + page.h * 0.40,
      w: page.w * 0.78,
      h: page.h * 0.40,
    };

    initStars();

    meteor = null;
    nextMeteorAt = 4 + rand() * 7;

    obsIndex = 0;
    curObs = observations[0];
    phaseIndex = 0;
    prevPhaseIndex = -1;
    cycleIndex = -1;
  }

  function onResize(width, height){
    sceneInit(width, height);
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    drone = simpleDrone(audio, { root: 73.42, detune: 0.9, gain: 0.045 });
    noise = audio.noiseSource({ type: 'pink', gain: 0.025 });
    try { noise.start(); } catch {}
    musicHandle = {
      stop(){
        try { drone?.stop?.(); } catch {}
        try { noise?.stop?.(); } catch {}
      }
    };
    audio.setCurrent(musicHandle);
  }

  function onAudioOff(){
    try { musicHandle?.stop?.(); } catch {}
    drone = null;
    noise = null;
    musicHandle = null;
  }

  function destroy(){
    onAudioOff();
  }

  function phaseChanged(){
    // tiny “shutter” click
    if (!audio.enabled) return;
    const beat = phaseIndex;
    audio.beep({
      freq: beat === 0 ? 520 : beat === 1 ? 440 : 610,
      dur: 0.05,
      gain: 0.028,
      type: 'square',
    });
  }

  function update(dt){
    t += dt;
    flash = Math.max(0, flash - dt * 1.6);

    const cyc = Math.floor(t / cycleDur);
    if (cyc !== cycleIndex){
      cycleIndex = cyc;
      obsIndex = cyc % observations.length;
      curObs = observations[obsIndex];
      // a subtle “page” flash at new entry
      flash = 0.45;
    }

    const ph = Math.floor((t % cycleDur) / phaseDur);
    phaseIndex = ph;
    if (phaseIndex !== prevPhaseIndex){
      prevPhaseIndex = phaseIndex;
      phaseChanged();
    }

    if (!meteor && t >= nextMeteorAt){
      meteor = {
        x: scope.cx + scope.r * (0.7 + rand() * 0.5),
        y: scope.cy - scope.r * (0.55 + rand() * 0.25),
        vx: -(scope.r * (1.6 + rand() * 1.1)),
        vy: scope.r * (0.7 + rand() * 0.7),
        life: 0.8 + rand() * 0.7,
      };
      nextMeteorAt = t + 8 + rand() * 14;
    }

    if (meteor){
      meteor.x += meteor.vx * dt;
      meteor.y += meteor.vy * dt;
      meteor.life -= dt;
      if (meteor.life <= 0) meteor = null;
    }
  }

  function drawDesk(ctx){
    // warm desk backdrop
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#141116');
    g.addColorStop(0.45, '#0f1420');
    g.addColorStop(1, '#1a1410');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // subtle vignette
    ctx.save();
    const v = ctx.createRadialGradient(w * 0.55, h * 0.55, 10, w * 0.55, h * 0.55, Math.max(w, h) * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawScope(ctx, phaseT){
    const { cx, cy, r } = scope;

    // outer ring
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    const rim = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r * 1.08);
    rim.addColorStop(0, 'rgba(20,25,35,0.0)');
    rim.addColorStop(0.55, 'rgba(30,40,58,0.55)');
    rim.addColorStop(1, 'rgba(10,12,18,0.95)');
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.08, 0, Math.PI * 2);
    ctx.fill();

    // clip to lens
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    // focus breathing changes “sharpness”
    const focus = 0.55 + 0.45 * Math.sin(t * 0.18 + curObs.drift.a);
    const focusSharp = clamp((focus - 0.2) / 0.8, 0, 1);

    // sky gradient
    const sky = ctx.createRadialGradient(cx, cy, 1, cx, cy, r * 1.25);
    sky.addColorStop(0, '#02020a');
    sky.addColorStop(0.55, '#050820');
    sky.addColorStop(1, '#01010a');
    ctx.fillStyle = sky;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // drift offsets per phase
    const ph = PHASES[phaseIndex];
    const driftAmt = ph === 'TRACK' ? 0.020 : ph === 'SKETCH' ? 0.010 : 0.006;
    const driftX = (Math.sin(t * (0.37 * curObs.drift.s) + curObs.drift.a) + Math.sin(t * 0.91 + curObs.drift.b) * 0.35) * driftAmt;
    const driftY = (Math.cos(t * (0.31 * curObs.drift.s) + curObs.drift.b) + Math.sin(t * 0.77 + curObs.drift.a) * 0.28) * driftAmt;

    // starfield
    for (const s of bgStars){
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (0.32 + s.z * 0.55) + s.tw));
      const a = (0.10 + 0.55 * tw) * (0.55 + focusSharp * 0.55);

      const px = cx + (s.x - 0.5 + driftX * (0.7 + 0.8 * s.z)) * (r * 2.0);
      const py = cy + (s.y - 0.5 + driftY * (0.7 + 0.8 * s.z)) * (r * 2.0);

      const sharp = 0.7 + focusSharp * 0.8;
      const sz = (0.7 + s.z * 1.8) * (0.55 + sharp);
      ctx.fillStyle = `hsla(${s.hue}, 90%, 78%, ${a})`;
      ctx.fillRect(px, py, sz, sz);

      if (focusSharp < 0.35){
        ctx.globalAlpha = a * 0.15;
        ctx.beginPath();
        ctx.arc(px, py, sz * (2.2 + (0.35 - focusSharp) * 6), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // target object (center-ish)
    const tx = cx + driftX * r * 1.7;
    const ty = cy + driftY * r * 1.7;
    const [tr,tg,tb] = curObs.target.tint;

    if (curObs.target.kind === 'planet'){
      const pr = r * 0.13;
      const pg = ctx.createRadialGradient(tx - pr * 0.2, ty - pr * 0.2, 1, tx, ty, pr * 1.25);
      pg.addColorStop(0, `rgba(${tr},${tg},${tb},0.95)`);
      pg.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(tx, ty, pr, 0, Math.PI * 2);
      ctx.fill();

      // bands / rings
      ctx.save();
      ctx.globalAlpha = 0.18 + focusSharp * 0.22;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = Math.max(1, r / 260);
      for (let i = -2; i <= 2; i++){
        ctx.beginPath();
        ctx.ellipse(tx, ty + i * pr * 0.18, pr * 0.95, pr * 0.38, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    } else if (curObs.target.kind === 'moon'){
      const mr = r * 0.18;
      ctx.fillStyle = `rgba(${tr},${tg},${tb},0.95)`;
      ctx.beginPath();
      ctx.arc(tx, ty, mr, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(tx + mr * 0.28, ty, mr * 1.02, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (curObs.target.kind === 'nebula' || curObs.target.kind === 'galaxy'){
      const nr = r * 0.24;
      const ng = ctx.createRadialGradient(tx, ty, 1, tx, ty, nr * 1.1);
      ng.addColorStop(0, `rgba(${tr},${tg},${tb},${0.28 + focusSharp * 0.12})`);
      ng.addColorStop(0.55, `rgba(${tr},${tg},${tb},0.08)`);
      ng.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = ng;
      ctx.beginPath();
      ctx.arc(tx, ty, nr * 1.1, 0, Math.PI * 2);
      ctx.fill();

      // faint dust lanes
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = 'rgba(200,220,255,0.35)';
      ctx.lineWidth = Math.max(1, r / 340);
      for (let i = 0; i < 5; i++){
        const a0 = rand() * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(tx, ty, nr * (0.7 + i * 0.09), nr * (0.35 + i * 0.06), a0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      // bright star
      const sr = r * 0.05;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const sg = ctx.createRadialGradient(tx, ty, 1, tx, ty, sr * 6);
      sg.addColorStop(0, `rgba(${tr},${tg},${tb},0.9)`);
      sg.addColorStop(0.22, `rgba(${tr},${tg},${tb},0.4)`);
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(tx, ty, sr * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = Math.max(1, r / 360);
      ctx.beginPath();
      ctx.moveTo(tx - sr * 4.2, ty);
      ctx.lineTo(tx + sr * 4.2, ty);
      ctx.moveTo(tx, ty - sr * 4.2);
      ctx.lineTo(tx, ty + sr * 4.2);
      ctx.stroke();
    }

    // crosshair (stronger during track)
    const crossA = phaseIndex === 1 ? 0.55 : 0.34;
    ctx.save();
    ctx.globalAlpha = crossA;
    ctx.strokeStyle = 'rgba(160,210,255,0.75)';
    ctx.lineWidth = Math.max(1, r / 420);
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();

    // small reticle box
    ctx.globalAlpha = crossA * 0.8;
    ctx.strokeStyle = 'rgba(200,240,255,0.55)';
    ctx.strokeRect(cx - r * 0.08, cy - r * 0.08, r * 0.16, r * 0.16);
    ctx.restore();

    // meteor streak
    if (meteor){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = 'rgba(210,245,255,0.75)';
      ctx.lineWidth = Math.max(1, r / 280);
      ctx.beginPath();
      ctx.moveTo(meteor.x, meteor.y);
      ctx.lineTo(meteor.x + r * 0.22, meteor.y - r * 0.12);
      ctx.stroke();
      ctx.restore();
    }

    // lens vignette
    const vg = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.05);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = vg;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // subtle scan-line grain
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#ffffff';
    const step = Math.max(3, (h / 180) | 0);
    for (let y = (t * 40) % step; y < h; y += step){
      ctx.fillRect(cx - r, y, r * 2, 1);
    }
    ctx.restore();

    ctx.restore();

    // UI title
    ctx.save();
    ctx.font = `600 ${Math.max(12, (h / 52) | 0)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace`;
    ctx.fillStyle = 'rgba(210,235,255,0.78)';
    ctx.fillText(curObs.target.name, cx - r * 0.95, cy + r * 0.98);
    ctx.globalAlpha = 0.62;
    ctx.font = `500 ${Math.max(11, (h / 60) | 0)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace`;
    ctx.fillText(`RA ${curObs.ra}  DEC ${curObs.dec}   MAG ${curObs.mag}×`, cx - r * 0.95, cy + r * 1.06);

    // phase badge
    const badge = `${PHASES[phaseIndex]}`;
    const bx = cx - r * 0.95;
    const by = cy - r * 1.12;
    const bw = ctx.measureText(badge).width + 18;
    const bh = Math.max(18, (h / 44) | 0);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(15,20,30,0.78)';
    roundRect(ctx, bx, by, bw, bh, 8);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(210,240,255,0.88)';
    ctx.fillText(badge, bx + 10, by + bh * 0.72);
    ctx.restore();

    // flash overlay
    if (flash > 0.001){
      ctx.save();
      ctx.globalAlpha = flash * 0.25;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.08, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawPage(ctx, phaseT){
    const r = Math.min(page.w, page.h) * 0.04;

    // page shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, page.x + 8, page.y + 10, page.w, page.h, r);
    ctx.fill();

    // paper
    const paper = ctx.createLinearGradient(page.x, page.y, page.x + page.w, page.y + page.h);
    paper.addColorStop(0, '#efe2c4');
    paper.addColorStop(0.55, '#e8d6b2');
    paper.addColorStop(1, '#e2cda8');
    ctx.fillStyle = paper;
    roundRect(ctx, page.x, page.y, page.w, page.h, r);
    ctx.fill();

    // faint page grain
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#000000';
    const gStep = Math.max(10, (page.w / 26) | 0);
    for (let y = page.y + gStep; y < page.y + page.h; y += gStep){
      ctx.fillRect(page.x + page.w * 0.06, y, page.w * 0.88, 1);
    }

    // header
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(40,25,10,0.85)';
    ctx.font = `700 ${Math.max(14, (h / 45) | 0)}px ui-serif, Georgia, Times, serif`;
    ctx.fillText("STARGAZER'S LOGBOOK", page.x + page.w * 0.08, page.y + page.h * 0.10);

    ctx.globalAlpha = 0.75;
    ctx.font = `600 ${Math.max(12, (h / 58) | 0)}px ui-serif, Georgia, Times, serif`;
    ctx.fillText(`ENTRY ${String(curObs.idx + 1).padStart(2,'0')} — ${curObs.mood.toUpperCase()}`, page.x + page.w * 0.08, page.y + page.h * 0.145);

    // “handwriting” notes
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(40,20,10,0.78)';
    ctx.font = `italic ${Math.max(14, (h / 50) | 0)}px ui-serif, Georgia, Times, serif`;

    const left = page.x + page.w * 0.10;
    let yy = page.y + page.h * 0.22;
    const lh = Math.max(18, (h / 36) | 0);

    const lines = [
      `Target: ${curObs.target.name}`, 
      `Conditions: seeing ${curObs.seeing}, transparency ${curObs.trans}.`,
      `Notes: ${curObs.verb} @ ${curObs.mag}×; ${curObs.noteA}.`,
      `Addendum: ${curObs.noteB}.`,
    ];

    const ph = PHASES[phaseIndex];
    const reveal = ph === 'TARGET' ? 2 : ph === 'TRACK' ? 3 : 4;

    for (let i = 0; i < lines.length; i++){
      if (i >= reveal) break;
      const wob = (softNoise2(t * 0.7 + i * 1.3) - 0.5) * 0.8;
      ctx.save();
      ctx.translate(left, yy + i * lh);
      ctx.rotate((wob * Math.PI) / 180);
      ctx.fillText(lines[i], 0, 0);
      ctx.restore();
    }

    // sketch frame
    ctx.globalAlpha = 0.95;
    ctx.strokeStyle = 'rgba(40,20,10,0.45)';
    ctx.lineWidth = Math.max(1, page.w / 420);
    roundRect(ctx, sketchBox.x, sketchBox.y, sketchBox.w, sketchBox.h, 12);
    ctx.stroke();

    // draw sketch only in SKETCH phase (or faintly earlier)
    const k = curObs.sketch;
    const skP = PHASES[phaseIndex] === 'SKETCH' ? clamp(phaseT, 0, 1) : 0.18;

    // little stars
    ctx.save();
    ctx.globalAlpha = 0.85;
    for (const s of k.stars){
      const px = sketchBox.x + s.x * sketchBox.w;
      const py = sketchBox.y + s.y * sketchBox.h;
      const r0 = Math.max(1.1, (page.w / 420) * (1 + s.m));
      ctx.fillStyle = 'rgba(45,25,12,0.65)';
      ctx.beginPath();
      ctx.arc(px, py, r0, 0, Math.PI * 2);
      ctx.fill();
    }

    // segments reveal
    ctx.strokeStyle = 'rgba(35,18,10,0.48)';
    ctx.lineWidth = Math.max(1, page.w / 520);
    const totalSegs = k.segs.length || 1;
    const segDraw = clamp(skP * totalSegs, 0, totalSegs);

    for (let i = 0; i < k.segs.length; i++){
      const [a, b] = k.segs[i];
      const pa = k.stars[a];
      const pb = k.stars[b];
      const x0 = sketchBox.x + pa.x * sketchBox.w;
      const y0 = sketchBox.y + pa.y * sketchBox.h;
      const x1 = sketchBox.x + pb.x * sketchBox.w;
      const y1 = sketchBox.y + pb.y * sketchBox.h;

      const u = clamp(segDraw - i, 0, 1);
      if (u <= 0) break;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(lerp(x0, x1, u), lerp(y0, y1, u));
      ctx.stroke();
    }

    ctx.restore();

    // footer stamp
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.font = `600 ${Math.max(11, (h / 64) | 0)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace`;
    ctx.fillStyle = 'rgba(55,30,16,0.75)';
    const stamp = `RA ${curObs.ra}  DEC ${curObs.dec}  •  MAG ${curObs.mag}×`;
    ctx.fillText(stamp, page.x + page.w * 0.10, page.y + page.h * 0.93);
    ctx.restore();

    // page flash
    if (flash > 0.001){
      ctx.save();
      ctx.globalAlpha = flash * 0.18;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, page.x, page.y, page.w, page.h, r);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  function draw(ctx){
    const phaseT = (t % phaseDur) / phaseDur;

    drawDesk(ctx);
    drawScope(ctx, phaseT);
    drawPage(ctx, phaseT);
  }

  return {
    onResize,
    update,
    draw,
    destroy,
    onAudioOn,
    onAudioOff,
  };
}
