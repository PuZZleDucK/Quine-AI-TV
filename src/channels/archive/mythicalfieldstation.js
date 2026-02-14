import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

// Mythical Creature Field Station
// A ranger desk logs cryptid evidence (casts, sketches, maps) with occasional camera glitches
// and a calm "SPECIMEN FILED" end card.

function pick(rand, a){ return a[(rand() * a.length) | 0]; }

function smoothstep(a, b, x){
  x = clamp((x - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
}

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

function hash2(seed, x, y){
  // deterministic 0..1 pseudo-rand from integer coords
  let h = seed ^ (x * 374761393) ^ (y * 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function stampThunk(audio, rand, {gain=0.035}={}){
  const ctx = audio.ensure();
  const dur = 0.085 + rand() * 0.05;
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(dur * sr));

  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let p = 0;
  for (let i = 0; i < len; i++){
    const x = i / len;
    const env = Math.pow(1 - x, 2.2);
    const n = (Math.random() * 2 - 1);
    p = p * 0.78 + n * 0.22;
    d[i] = p * env;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 520 + rand() * 180;
  lp.Q.value = 0.7;

  const g = ctx.createGain();
  g.gain.value = 0;

  src.connect(lp);
  lp.connect(g);
  g.connect(audio.master);

  const t0 = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.start(t0);
  src.stop(t0 + dur + 0.02);

  audio.beep({ freq: 180 + rand() * 40, dur: 0.03, gain: 0.014, type: 'square' });
}

function penTick(audio, rand){
  audio.beep({ freq: 980 + rand() * 320, dur: 0.012, gain: 0.0045, type: 'square' });
}

const CREATURES = [
  { name: 'YOWIE', vibe: 'bipedal', note: 'heavy prints near creekbed' },
  { name: 'MOTHMAN', vibe: 'winged', note: 'low-frequency flutter recorded' },
  { name: 'BUNYIP', vibe: 'aquatic', note: 'ripples without wind' },
  { name: 'KELPIE', vibe: 'shoreline', note: 'hoof marks, no horse' },
  { name: 'JERSEY DEVIL', vibe: 'screech', note: 'odd calls at 03:12' },
  { name: 'SKUNK APE', vibe: 'forest', note: 'pine needles disturbed' },
  { name: 'THUNDERBIRD', vibe: 'sky', note: 'shadow pass over ridge' },
];

const LOCATIONS = [
  'RANGE SECTOR 3B',
  'GULLY TRAIL 11',
  'WATERLINE MARKER 07',
  'RIDGE LOOKOUT A2',
  'FENCE LINE 04',
  'SCRUB EDGE 9C',
];

const EVIDENCE_KINDS = [
  { kind: 'cast', label: 'PLASTER CAST' },
  { kind: 'sketch', label: 'FIELD SKETCH' },
  { kind: 'map', label: 'TRANSECT MAP' },
  { kind: 'sample', label: 'SAMPLE VIAL' },
  { kind: 'photo', label: 'PHOTO STRIP' },
];

function makeCaseId(rand, n){
  const a = String.fromCharCode(65 + ((rand() * 24) | 0));
  const b = String.fromCharCode(65 + ((rand() * 24) | 0));
  const num = 100 + ((rand() * 900) | 0);
  return `${a}${b}-${num}-${String(n).padStart(2,'0')}`;
}

function makeSketch(rand){
  // store a few strokes (arrays of points)
  const strokes = [];
  const sN = 3 + ((rand() * 3) | 0);
  for (let i = 0; i < sN; i++){
    const pts = [];
    const pN = 8 + ((rand() * 10) | 0);
    let x = 0.15 + rand() * 0.7;
    let y = 0.18 + rand() * 0.6;
    for (let k = 0; k < pN; k++){
      x = clamp(x + (rand() - 0.5) * 0.12, 0.08, 0.92);
      y = clamp(y + (rand() - 0.5) * 0.10, 0.08, 0.92);
      pts.push([x, y]);
    }
    strokes.push(pts);
  }
  return strokes;
}

function makeRoute(rand){
  const pts = [];
  const n = 5 + ((rand() * 4) | 0);
  let x = 0.12 + rand() * 0.18;
  let y = 0.18 + rand() * 0.64;
  for (let i = 0; i < n; i++){
    x = clamp(x + 0.12 + rand() * 0.18, 0.08, 0.92);
    y = clamp(y + (rand() - 0.5) * 0.22, 0.10, 0.90);
    pts.push([x, y]);
  }
  return pts;
}

function buildEvidence(rand){
  const e = pick(rand, EVIDENCE_KINDS);
  if (e.kind === 'sketch') return { ...e, strokes: makeSketch(rand) };
  if (e.kind === 'map') return { ...e, route: makeRoute(rand) };
  if (e.kind === 'photo'){
    const frames = 3 + ((rand() * 2) | 0);
    return { ...e, frames };
  }
  if (e.kind === 'cast'){
    const toes = 3 + ((rand() * 3) | 0);
    return { ...e, toes };
  }
  if (e.kind === 'sample'){
    const hue = 120 + rand() * 160;
    return { ...e, hue };
  }
  return { ...e };
}

function buildCase(rand, n){
  const creature = pick(rand, CREATURES);
  const loc = pick(rand, LOCATIONS);
  const id = makeCaseId(rand, n);

  // choose 3 evidence items (avoid duplicates)
  const ev = [];
  while (ev.length < 3){
    const next = buildEvidence(rand);
    if (ev.some((x) => x.kind === next.kind)) continue;
    ev.push(next);
  }

  const rating = 1 + ((rand() * 5) | 0);
  const wind = pick(rand, ['CALM', 'BREEZY', 'STILL', 'GUSTS']);
  const time = `${String(1 + ((rand() * 11) | 0)).padStart(2,'0')}:${String(((rand() * 60) | 0)).padStart(2,'0')}`;

  const lines = [
    `CASE: ${id}`,
    `TARGET: ${creature.name} (${creature.vibe})`,
    `SITE: ${loc}`,
    `TIME: ${time}  WIND: ${wind}`,
    `RISK: ${'★'.repeat(rating)}${'·'.repeat(5 - rating)}`,
    '',
    `NOTE: ${creature.note}.`,
    pick(rand, [
      'Marker tape replaced. Prints measured. Photos logged.',
      'No direct visual. Movement heard beyond scrub line.',
      'Thermal anomaly brief. Recorder captured a hiss.',
      'Trail cam triggered twice. Second frame corrupted.',
    ]),
  ];

  return {
    n,
    id,
    creature: creature.name,
    location: loc,
    rating,
    evidence: ev,
    lines,
    // glitch timing is deterministic per case
    glitchAt: 4.2 + rand() * 6.5,
  };
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  const seedInt = seed >>> 0;

  let w = 0, h = 0, dpr = 1;
  let t = 0;

  let font = 16;
  let small = 12;

  let caseN = 1;
  let cur = null;
  let caseT = 0;

  let openP = 0;
  let stampP = 0;

  let glitch = 0;
  let glitchedThisCase = false;

  let motes = [];

  let ambience = null;

  const CASE_DUR = 16.0;
  const OUT_DUR = 2.0;

  function nextCase(){
    caseN++;
    cur = buildCase(rand, caseN);
    caseT = 0;
    openP = 0;
    stampP = 0;
    glitch = 0;
    glitchedThisCase = false;

    if (audio.enabled){
      // subtle "new page" tick
      audio.beep({ freq: 420 + rand() * 110, dur: 0.03, gain: 0.010, type: 'triangle' });
    }
  }

  function init({ width, height, dpr: dp }){
    w = width;
    h = height;
    dpr = dp || 1;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));

    caseN = 1;
    cur = buildCase(rand, caseN);
    caseT = 0;
    openP = 0;
    stampP = 0;
    glitch = 0;
    glitchedThisCase = false;

    // precompute dust motes (deterministic)
    const n = 180;
    motes = Array.from({ length: n }, (_, i) => ({
      x: (hash2(seedInt, i, 11) * w),
      y: (hash2(seedInt, i, 29) * h),
      z: 0.25 + hash2(seedInt, i, 41) * 0.9,
      p: hash2(seedInt, i, 53) * Math.PI * 2,
    }));
  }

  function onResize(width, height, dp){
    init({ width, height, dpr: dp });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    const room = audio.noiseSource({ type: 'brown', gain: 0.004 });
    room.start();
    const dr = simpleDrone(audio, { root: 78 + rand() * 18, detune: 0.55, gain: 0.030 });
    ambience = {
      stop(){
        try { room.stop(); } catch {}
        try { dr.stop(); } catch {}
      }
    };
    audio.setCurrent(ambience);
    audio.beep({ freq: 520 + rand() * 80, dur: 0.03, gain: 0.010, type: 'triangle' });
  }

  function onAudioOff(){
    try { ambience?.stop?.(); } catch {}
    ambience = null;
  }

  function destroy(){
    onAudioOff();
  }

  function update(dt){
    t += dt;
    caseT += dt;

    // open folder early
    openP = smoothstep(0.0, 1.0, caseT / 1.2);

    // stamp near the end
    const stampT0 = CASE_DUR - 1.2;
    stampP = smoothstep(0.0, 1.0, (caseT - stampT0) / 1.0);

    // one planned glitch per case + rare tiny flutter
    if (cur && !glitchedThisCase && caseT >= cur.glitchAt){
      glitch = 1;
      glitchedThisCase = true;
      if (audio.enabled){
        audio.beep({ freq: 120 + rand() * 60, dur: 0.05, gain: 0.012, type: 'square' });
      }
    }
    if (rand() < dt * 0.015) glitch = Math.max(glitch, 0.35);
    glitch = Math.max(0, glitch - dt * 2.6);

    // soft pen ticks while "typing"
    if (audio.enabled){
      const typingP = smoothstep(0.2, 1.0, caseT / (CASE_DUR * 0.75));
      if (typingP > 0.02 && rand() < dt * (0.35 + typingP * 0.85)) penTick(audio, rand);
      // stamp thump exactly on threshold
      if (caseT >= CASE_DUR && caseT - dt < CASE_DUR){
        stampThunk(audio, rand, { gain: 0.035 });
      }
    }

    if (caseT >= CASE_DUR + OUT_DUR){
      nextCase();
    }
  }

  function drawBackground(ctx){
    // desk gradient
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#07070a');
    g.addColorStop(0.45, '#050506');
    g.addColorStop(1, '#020203');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // warm pool
    const rg = ctx.createRadialGradient(w * 0.52, h * 0.55, 10, w * 0.52, h * 0.55, Math.max(w, h) * 0.8);
    rg.addColorStop(0, 'rgba(130, 90, 45, 0.18)');
    rg.addColorStop(0.5, 'rgba(70, 40, 20, 0.10)');
    rg.addColorStop(1, 'rgba(0,0,0,0.82)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);

    // dust motes (layered motion)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(255,245,230,0.9)';
    for (let i = 0; i < motes.length; i++){
      const m = motes[i];
      const sx = (m.x + t * 8 * m.z + Math.sin(t * 0.25 + m.p) * 6) % (w + 10);
      const sy = (m.y + Math.sin(t * 0.32 + m.p) * 10) % (h + 10);
      const a = 0.02 + 0.08 * (0.5 + 0.5 * Math.sin(t * (0.3 + m.z * 0.45) + m.p));
      ctx.globalAlpha = a;
      ctx.fillRect(sx, sy, 1 + m.z * 1.2, 1 + m.z * 1.2);
    }
    ctx.restore();

    // vignette
    const v = ctx.createRadialGradient(w * 0.5, h * 0.52, Math.min(w, h) * 0.15, w * 0.5, h * 0.52, Math.max(w, h) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  function drawHeader(ctx){
    const headerH = Math.floor(h * 0.12);
    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(0, 0, w, headerH);

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(240, 232, 220, 0.92)';
    ctx.font = `${Math.floor(font * 1.05)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText('MYTHICAL CREATURE FIELD STATION', Math.floor(w * 0.05), Math.floor(headerH * 0.45));

    ctx.globalAlpha = 0.70;
    ctx.font = `${Math.floor(font * 0.82)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`UNIT CRYPTID • LOG ACTIVE • ${cur?.id || '—'}`, Math.floor(w * 0.05), Math.floor(headerH * 0.78));

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(240, 210, 160, 0.75)';
    ctx.fillRect(0, headerH - 2, w, 2);
    ctx.restore();
  }

  function drawFolder(ctx, x, y, fw, fh){
    // folder base
    const lift = fw * 0.015 * (1 - openP);

    ctx.save();
    ctx.translate(0, lift);

    ctx.fillStyle = 'rgba(34, 24, 16, 0.92)';
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(1, 1.4 * dpr);
    roundRect(ctx, x, y, fw, fh, Math.max(16, Math.floor(font * 1.0)));
    ctx.fill();
    ctx.stroke();

    // folder tab
    const tabW = Math.floor(fw * 0.28);
    const tabH = Math.floor(fh * 0.10);
    ctx.fillStyle = 'rgba(52, 38, 26, 0.92)';
    roundRect(ctx, x + Math.floor(fw * 0.08), y - Math.floor(tabH * 0.55), tabW, tabH, Math.max(12, Math.floor(font * 0.8)));
    ctx.fill();

    // paper edge highlight
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = 'rgba(255, 235, 210, 0.9)';
    ctx.fillRect(x + Math.floor(fw * 0.03), y + Math.floor(fh * 0.08), Math.floor(fw * 0.94), 1);

    ctx.restore();
  }

  function drawEvidencePanel(ctx, x, y, pw, ph){
    const e = cur?.evidence || [];

    // panel frame
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(18, 14, 10, 0.55)';
    ctx.strokeStyle = 'rgba(240, 210, 160, 0.12)';
    ctx.lineWidth = Math.max(1, 1.2 * dpr);
    roundRect(ctx, x, y, pw, ph, Math.max(14, Math.floor(font * 0.9)));
    ctx.fill();
    ctx.stroke();

    // choose which evidence is "featured" based on time
    const seg = clamp(Math.floor((caseT / CASE_DUR) * 3), 0, 2);
    const featured = e[seg] || e[0];

    // label
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(240, 232, 220, 0.85)';
    ctx.font = `${Math.floor(small * 0.92)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    ctx.fillText(`EVIDENCE: ${featured?.label || '—'}`, x + Math.floor(pw * 0.06), y + Math.floor(ph * 0.06));

    // inner canvas
    const ix = x + Math.floor(pw * 0.06);
    const iy = y + Math.floor(ph * 0.15);
    const iw = Math.floor(pw * 0.88);
    const ih = Math.floor(ph * 0.80);

    ctx.globalAlpha = 0.90;
    ctx.fillStyle = 'rgba(246, 241, 232, 0.92)';
    ctx.strokeStyle = 'rgba(40, 24, 14, 0.14)';
    roundRect(ctx, ix, iy, iw, ih, Math.max(12, Math.floor(font * 0.8)));
    ctx.fill();
    ctx.stroke();

    // ruled lines (paper feel)
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = 'rgba(60, 40, 24, 0.55)';
    ctx.lineWidth = Math.max(1, 1.0 * dpr);
    const step = Math.max(14, Math.floor(ih / 9));
    for (let yy = iy + Math.floor(ih * 0.20); yy < iy + ih - Math.floor(ih * 0.08); yy += step){
      ctx.beginPath();
      ctx.moveTo(ix + Math.floor(iw * 0.06), yy);
      ctx.lineTo(ix + Math.floor(iw * 0.94), yy);
      ctx.stroke();
    }
    ctx.restore();

    // draw evidence content
    const pad = Math.floor(iw * 0.08);
    const cx = ix + pad;
    const cy = iy + pad + Math.floor(font * 0.5);
    const cw = iw - pad * 2;
    const ch = ih - pad * 2 - Math.floor(font * 0.8);

    if (featured?.kind === 'cast'){
      // plaster footprint-ish
      ctx.save();
      ctx.translate(cx + cw * 0.5, cy + ch * 0.55);
      const sway = Math.sin(t * 0.35) * 0.02;
      ctx.rotate(sway);

      const rx = cw * 0.22;
      const ry = ch * 0.32;
      ctx.fillStyle = 'rgba(220, 220, 220, 0.9)';
      ctx.strokeStyle = 'rgba(90, 80, 70, 0.25)';
      ctx.lineWidth = Math.max(1, 1.4 * dpr);

      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // toe nubs
      const toes = featured.toes || 4;
      for (let i = 0; i < toes; i++){
        const a = -0.9 + (i / Math.max(1, toes - 1)) * 1.1;
        const tx = Math.cos(a) * rx * 0.65;
        const ty = -ry * 0.95 + Math.sin(a) * ry * 0.22;
        ctx.beginPath();
        ctx.ellipse(tx, ty, rx * 0.16, ry * 0.12, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // ridge shading
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = 'rgba(140, 120, 100, 0.8)';
      for (let i = 0; i < 8; i++){
        const yy = (-ry * 0.65) + (i / 7) * (ry * 1.3);
        ctx.fillRect(-rx * 0.75, yy, rx * 1.5, Math.max(1, (ch / 220) | 0));
      }

      ctx.restore();
    }
    else if (featured?.kind === 'sketch'){
      // pencil strokes
      ctx.save();
      ctx.strokeStyle = 'rgba(20, 12, 8, 0.65)';
      ctx.lineWidth = Math.max(1, 1.2 * dpr);
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      const strokes = featured.strokes || [];
      const reveal = smoothstep(0.15, 0.85, caseT / CASE_DUR);
      let drawCount = Math.floor(strokes.length * (0.35 + 0.65 * reveal));
      drawCount = clamp(drawCount, 1, strokes.length);

      for (let i = 0; i < drawCount; i++){
        const pts = strokes[i];
        if (!pts?.length) continue;
        ctx.beginPath();
        for (let k = 0; k < pts.length; k++){
          const px = cx + pts[k][0] * cw;
          const py = cy + pts[k][1] * ch;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // a faint label
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = 'rgba(20, 12, 8, 0.55)';
      ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText('approx. silhouette (witness)', cx, iy + ih - Math.floor(font * 1.0));

      ctx.restore();
    }
    else if (featured?.kind === 'map'){
      ctx.save();
      // grid
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = 'rgba(20, 12, 8, 0.35)';
      ctx.lineWidth = Math.max(1, 1.0 * dpr);
      const cols = 10;
      const rows = 8;
      for (let i = 0; i <= cols; i++){
        const xx = cx + (i / cols) * cw;
        ctx.beginPath();
        ctx.moveTo(xx, cy);
        ctx.lineTo(xx, cy + ch);
        ctx.stroke();
      }
      for (let j = 0; j <= rows; j++){
        const yy = cy + (j / rows) * ch;
        ctx.beginPath();
        ctx.moveTo(cx, yy);
        ctx.lineTo(cx + cw, yy);
        ctx.stroke();
      }

      // route
      const route = featured.route || [];
      const drift = Math.sin(t * 0.35) * 0.004;
      ctx.globalAlpha = 0.78;
      ctx.strokeStyle = 'rgba(200, 40, 30, 0.75)';
      ctx.lineWidth = Math.max(2, Math.floor(ch / 170));
      ctx.beginPath();
      for (let i = 0; i < route.length; i++){
        const px = cx + (route[i][0] + drift) * cw;
        const py = cy + (route[i][1] + drift * 0.6) * ch;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // markers
      ctx.fillStyle = 'rgba(200, 40, 30, 0.75)';
      for (let i = 0; i < route.length; i++){
        const px = cx + (route[i][0] + drift) * cw;
        const py = cy + (route[i][1] + drift * 0.6) * ch;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(2, ch / 70), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 0.55;
      ctx.fillStyle = 'rgba(20, 12, 8, 0.55)';
      ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText('transect route + markers', cx, iy + ih - Math.floor(font * 1.0));

      ctx.restore();
    }
    else if (featured?.kind === 'sample'){
      ctx.save();
      const hue = featured.hue || 210;
      const bx = cx + cw * 0.55;
      const by = cy + ch * 0.55;
      const bw = cw * 0.28;
      const bh = ch * 0.52;

      // vial body
      ctx.fillStyle = 'rgba(230, 232, 236, 0.88)';
      ctx.strokeStyle = 'rgba(40, 24, 14, 0.18)';
      ctx.lineWidth = Math.max(1, 1.2 * dpr);
      roundRect(ctx, bx - bw * 0.5, by - bh * 0.5, bw, bh, Math.max(12, Math.floor(font * 0.8)));
      ctx.fill();
      ctx.stroke();

      // liquid
      const fillP = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(t * 0.6));
      const lh = bh * fillP;
      const lx = bx - bw * 0.42;
      const ly = by + bh * 0.5 - lh - bh * 0.06;
      const lg = ctx.createLinearGradient(0, ly, 0, ly + lh);
      lg.addColorStop(0, `hsla(${hue}, 85%, 55%, 0.80)`);
      lg.addColorStop(1, `hsla(${hue + 20}, 85%, 40%, 0.88)`);
      ctx.fillStyle = lg;
      roundRect(ctx, lx, ly, bw * 0.84, lh, Math.max(10, Math.floor(font * 0.7)));
      ctx.fill();

      // cap
      ctx.fillStyle = 'rgba(24, 20, 18, 0.85)';
      roundRect(ctx, bx - bw * 0.52, by - bh * 0.58, bw * 1.04, bh * 0.16, Math.max(10, Math.floor(font * 0.7)));
      ctx.fill();

      // highlight
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(bx - bw * 0.28, by - bh * 0.35, Math.max(2, bw * 0.06), bh * 0.68);

      ctx.globalAlpha = 0.55;
      ctx.fillStyle = 'rgba(20, 12, 8, 0.55)';
      ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText('sealed vial • chain-of-custody', cx, iy + ih - Math.floor(font * 1.0));

      ctx.restore();
    }
    else if (featured?.kind === 'photo'){
      ctx.save();
      const frames = featured.frames || 3;
      const phW = cw * 0.78;
      const phH = ch * 0.78;
      const px = cx + (cw - phW) * 0.5;
      const py = cy + (ch - phH) * 0.42;

      ctx.fillStyle = 'rgba(28, 26, 24, 0.85)';
      roundRect(ctx, px, py, phW, phH, Math.max(10, Math.floor(font * 0.7)));
      ctx.fill();

      // sprocket holes
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = 'rgba(240, 232, 220, 0.85)';
      const holeN = 11;
      for (let i = 0; i < holeN; i++){
        const yy = py + (i / (holeN - 1)) * phH;
        ctx.fillRect(px + phW * 0.03, yy, phW * 0.04, phH * 0.03);
        ctx.fillRect(px + phW * 0.93, yy, phW * 0.04, phH * 0.03);
      }
      ctx.globalAlpha = 1;

      // frames
      const fx = px + phW * 0.10;
      const fw = phW * 0.80;
      const fh = (phH * 0.82) / frames;
      const wob = 0.5 + 0.5 * Math.sin(t * 0.5);
      for (let i = 0; i < frames; i++){
        const fy = py + phH * 0.08 + i * fh;
        const gg = ctx.createLinearGradient(fx, fy, fx + fw, fy + fh);
        gg.addColorStop(0, `rgba(${25 + i * 10}, ${22 + i * 6}, ${18 + i * 5}, 0.92)`);
        gg.addColorStop(1, `rgba(${50 + i * 15}, ${45 + i * 8}, ${35 + i * 7}, 0.92)`);
        ctx.fillStyle = gg;
        roundRect(ctx, fx, fy + 2, fw, fh - 4, Math.max(8, Math.floor(font * 0.6)));
        ctx.fill();

        // a "shadow pass" bar
        ctx.globalAlpha = 0.12 + wob * 0.12;
        ctx.fillStyle = 'rgba(240, 232, 220, 0.85)';
        ctx.fillRect(fx + fw * 0.1, fy + fh * (0.3 + i * 0.02), fw * 0.8, Math.max(2, fh * 0.06));
        ctx.globalAlpha = 1;
      }

      ctx.globalAlpha = 0.55;
      ctx.fillStyle = 'rgba(20, 12, 8, 0.55)';
      ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText('contact strip • frame #2 corrupted', cx, iy + ih - Math.floor(font * 1.0));

      ctx.restore();
    }

    ctx.restore();
  }

  function drawReport(ctx, x, y, rw, rh){
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(18, 14, 10, 0.55)';
    ctx.strokeStyle = 'rgba(240, 210, 160, 0.12)';
    ctx.lineWidth = Math.max(1, 1.2 * dpr);
    roundRect(ctx, x, y, rw, rh, Math.max(14, Math.floor(font * 0.9)));
    ctx.fill();
    ctx.stroke();

    // inner paper
    const ix = x + Math.floor(rw * 0.06);
    const iy = y + Math.floor(rh * 0.10);
    const iw = Math.floor(rw * 0.88);
    const ih = Math.floor(rh * 0.84);

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(246, 241, 232, 0.92)';
    ctx.strokeStyle = 'rgba(40, 24, 14, 0.14)';
    roundRect(ctx, ix, iy, iw, ih, Math.max(12, Math.floor(font * 0.8)));
    ctx.fill();
    ctx.stroke();

    // typed text reveal
    const revealP = clamp((caseT - 0.2) / (CASE_DUR * 0.78), 0, 1);
    const text = (cur?.lines || []).join('\n');
    const total = text.length;
    const shown = Math.floor(total * smoothstep(0, 1, revealP));
    const vis = text.slice(0, shown);

    ctx.globalAlpha = 0.90;
    ctx.fillStyle = 'rgba(20, 12, 8, 0.86)';
    ctx.textBaseline = 'top';

    const marginX = ix + Math.floor(iw * 0.07);
    let yy = iy + Math.floor(ih * 0.08);

    const lines = vis.split('\n');
    for (let i = 0; i < lines.length; i++){
      const ln = lines[i];
      if (i === 0){
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = 'rgba(20, 12, 8, 0.90)';
        ctx.font = `${Math.floor(font * 1.02)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      } else if (i <= 4){
        ctx.globalAlpha = 0.78;
        ctx.fillStyle = 'rgba(20, 12, 8, 0.78)';
        ctx.font = `${Math.floor(small * 0.98)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      } else {
        ctx.globalAlpha = 0.84;
        ctx.fillStyle = 'rgba(20, 12, 8, 0.82)';
        ctx.font = `${Math.floor(small * 1.03)}px ui-sans-serif, system-ui`;
      }

      ctx.fillText(ln, marginX, yy);
      yy += Math.floor((i <= 4 ? small * 1.45 : small * 1.55));
      if (yy > iy + ih - Math.floor(ih * 0.10)) break;
    }

    // signature line
    const sigY = y + rh - Math.floor(rh * 0.10);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(240, 232, 220, 0.75)';
    ctx.fillRect(ix, sigY, iw, 1);
    ctx.globalAlpha = 0.55;
    ctx.font = `${Math.floor(small * 0.92)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('— ranger on duty', ix, sigY + Math.floor(font * 0.6));

    ctx.restore();
  }

  function drawStamp(ctx){
    if (stampP <= 0) return;

    const fade = smoothstep(0.0, 1.0, stampP);
    const out = clamp(1 - (caseT - CASE_DUR) / OUT_DUR, 0, 1);

    const cx = w * 0.5;
    const cy = h * 0.56;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.18 + Math.sin(t * 0.4) * 0.02);

    ctx.globalAlpha = 0.12 * fade * out;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(-w * 0.22, -h * 0.08, w * 0.44, h * 0.16);

    ctx.globalAlpha = 0.62 * fade * out;
    ctx.strokeStyle = 'rgba(210, 40, 30, 0.72)';
    ctx.lineWidth = Math.max(2, Math.floor(h / 190));
    ctx.strokeRect(-w * 0.22, -h * 0.08, w * 0.44, h * 0.16);

    ctx.globalAlpha = 0.68 * fade * out;
    ctx.fillStyle = 'rgba(210, 40, 30, 0.72)';
    ctx.font = `${Math.floor(h / 18)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText('SPECIMEN FILED', 0, 0);

    ctx.restore();
  }

  function drawGlitchOverlay(ctx){
    if (glitch <= 0) return;

    // scanlines + slight RGB ghost
    const a = clamp(glitch, 0, 1);
    const lineH = Math.max(2, Math.floor(h / 180));

    ctx.save();
    ctx.globalAlpha = 0.10 * a;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let y = 0; y < h; y += lineH * 2){
      ctx.fillRect(0, y, w, lineH);
    }

    const dx = Math.sin(t * 95) * w * 0.004 * a;
    const dy = Math.sin(t * 77) * h * 0.003 * a;

    ctx.globalAlpha = 0.12 * a;
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(120, 245, 255, 0.35)';
    ctx.fillRect(dx, dy, w, h);

    ctx.globalAlpha = 0.10 * a;
    ctx.fillStyle = 'rgba(255, 80, 180, 0.28)';
    ctx.fillRect(-dx * 0.6, -dy * 0.6, w, h);

    ctx.restore();
  }

  function render(ctx){
    if (!cur) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx);
    drawHeader(ctx);

    const s = Math.min(w, h);
    const fw = Math.floor(s * 0.88);
    const fh = Math.floor(s * 0.72);
    const fx = Math.floor(w * 0.5 - fw * 0.5);
    const fy = Math.floor(h * 0.56 - fh * 0.5);

    drawFolder(ctx, fx, fy, fw, fh);

    // layout inside folder
    const pad = Math.floor(fw * 0.05);
    const innerX = fx + pad;
    const innerY = fy + Math.floor(fh * 0.08);
    const innerW = fw - pad * 2;
    const innerH = fh - Math.floor(fh * 0.12);

    const leftW = Math.floor(innerW * 0.46);
    const rightW = innerW - leftW - Math.floor(innerW * 0.04);
    const gap = Math.floor(innerW * 0.04);

    drawEvidencePanel(ctx, innerX, innerY, leftW, innerH);
    drawReport(ctx, innerX + leftW + gap, innerY, rightW, innerH);

    drawStamp(ctx);
    drawGlitchOverlay(ctx);

    // footer timer
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.fillRect(0, Math.floor(h * 0.93), w, Math.floor(h * 0.07));

    ctx.globalAlpha = 0.78;
    ctx.fillStyle = 'rgba(245, 235, 220, 0.70)';
    ctx.font = `${Math.floor(h / 40)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';

    const rem = Math.max(0, Math.ceil(CASE_DUR - caseT));
    ctx.fillText(`NEXT FILE: ${String(rem).padStart(2,'0')}s`, Math.floor(w * 0.05), Math.floor(h * 0.965));
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
