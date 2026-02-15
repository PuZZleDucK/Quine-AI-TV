import { mulberry32, clamp } from '../../util/prng.js';

// Museum of Obsolete Media
// Rotating VHS/floppy/minidisc/cassette/etc exhibits with quick history + UI-style metadata.

function pick(rand, a){ return a[(rand() * a.length) | 0]; }

function roundRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function strokeRoundRect(ctx, x, y, w, h, r){
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
}

function lerp(a,b,t){ return a + (b-a)*t; }

function shade(hex, k){
  // quick hex shade. k in [-1..1]
  const n = (x)=>Math.max(0, Math.min(255, x|0));
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  const f = k>=0 ? (x)=>n(x + (255-x)*k) : (x)=>n(x*(1+k));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function drawVHS(ctx, cx, cy, s, time, accent){
  const w = s * 1.55;
  const h = s * 0.95;
  const x = cx - w/2;
  const y = cy - h/2;

  // body
  ctx.fillStyle = 'rgba(20,20,24,0.95)';
  roundRect(ctx, x, y, w, h, s*0.10);
  ctx.fill();

  // label
  ctx.fillStyle = 'rgba(240,240,245,0.07)';
  roundRect(ctx, x + w*0.08, y + h*0.10, w*0.62, h*0.25, s*0.06);
  ctx.fill();

  // window
  ctx.fillStyle = 'rgba(8,10,14,0.9)';
  roundRect(ctx, x + w*0.18, y + h*0.42, w*0.64, h*0.38, s*0.09);
  ctx.fill();

  // reels
  const r = s * 0.17;
  const rx0 = x + w*0.35;
  const rx1 = x + w*0.65;
  const ry = y + h*0.61;
  const spin = time * 0.7;

  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = 'rgba(220,220,230,0.12)';
  for (const rx of [rx0, rx1]){
    ctx.beginPath(); ctx.arc(rx, ry, r, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(1, s*0.02);
    ctx.beginPath(); ctx.arc(rx, ry, r*0.72, 0, Math.PI*2); ctx.stroke();

    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(spin + (rx===rx0?0:1.2));
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    for (let k=0;k<3;k++){
      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.lineTo(r*0.68,0);
      ctx.stroke();
      ctx.rotate((Math.PI*2)/3);
    }
    ctx.restore();
  }
  ctx.restore();

  // tiny accent stamp
  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = accent;
  ctx.font = `${Math.floor(s*0.18)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  ctx.textBaseline = 'middle';
  ctx.fillText('VHS', x + w*0.74, y + h*0.22);
  ctx.restore();
}

function drawFloppy(ctx, cx, cy, s, time, accent){
  const w = s * 1.12;
  const h = s * 1.18;
  const x = cx - w/2;
  const y = cy - h/2;

  ctx.fillStyle = 'rgba(24,24,28,0.96)';
  roundRect(ctx, x, y, w, h, s*0.10);
  ctx.fill();

  // shutter
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  roundRect(ctx, x + w*0.18, y + h*0.06, w*0.64, h*0.22, s*0.06);
  ctx.fill();

  // label
  ctx.fillStyle = 'rgba(240,240,245,0.06)';
  roundRect(ctx, x + w*0.10, y + h*0.36, w*0.80, h*0.40, s*0.06);
  ctx.fill();

  // notch + hole
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fillRect(x + w*0.08, y + h*0.88, w*0.20, h*0.08);
  ctx.beginPath();
  ctx.arc(x + w*0.78, y + h*0.88, s*0.08, 0, Math.PI*2);
  ctx.fill();

  // accent text
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = accent;
  ctx.font = `${Math.floor(s*0.16)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  ctx.textBaseline = 'middle';
  const wob = Math.sin(time*0.5) * 0.5;
  ctx.fillText('3.5"', x + w*0.18, y + h*0.58 + wob);
  ctx.restore();
}

function drawCassette(ctx, cx, cy, s, time, accent){
  const w = s * 1.55;
  const h = s * 0.98;
  const x = cx - w/2;
  const y = cy - h/2;

  ctx.fillStyle = 'rgba(18,18,22,0.96)';
  roundRect(ctx, x, y, w, h, s*0.12);
  ctx.fill();

  // label strip
  ctx.fillStyle = 'rgba(240,240,245,0.07)';
  roundRect(ctx, x + w*0.10, y + h*0.10, w*0.80, h*0.22, s*0.06);
  ctx.fill();

  // window
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, x + w*0.18, y + h*0.40, w*0.64, h*0.40, s*0.10);
  ctx.fill();

  // reels
  const r = s * 0.17;
  const rx0 = x + w*0.38;
  const rx1 = x + w*0.62;
  const ry = y + h*0.60;
  const spin = time * 0.85;

  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = Math.max(1, s*0.02);
  for (const rx of [rx0, rx1]){
    ctx.beginPath(); ctx.arc(rx, ry, r, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(rx, ry, r*0.55, 0, Math.PI*2); ctx.stroke();

    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(spin + (rx===rx0?0.2:1.7));
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.55;
    for (let k=0;k<4;k++){
      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.lineTo(r*0.62,0);
      ctx.stroke();
      ctx.rotate((Math.PI*2)/4);
    }
    ctx.restore();
  }
  ctx.restore();

  // head opening
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, x + w*0.26, y + h*0.86, w*0.48, h*0.10, s*0.05);
  ctx.fill();
}

function drawMiniDisc(ctx, cx, cy, s, time, accent){
  const w = s * 1.15;
  const h = s * 1.15;
  const x = cx - w/2;
  const y = cy - h/2;

  ctx.fillStyle = 'rgba(22,22,26,0.96)';
  roundRect(ctx, x, y, w, h, s*0.10);
  ctx.fill();

  // window showing disc
  const wx = x + w*0.16;
  const wy = y + h*0.18;
  const ww = w*0.68;
  const wh = h*0.66;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  roundRect(ctx, wx, wy, ww, wh, s*0.10);
  ctx.fill();

  const r = s * 0.28;
  const dcx = wx + ww*0.54;
  const dcy = wy + wh*0.55;
  const rot = time * 0.35;

  // disc
  ctx.save();
  ctx.translate(dcx, dcy);
  ctx.rotate(rot);
  const g = ctx.createRadialGradient(0,0, r*0.2, 0,0, r);
  g.addColorStop(0, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0.03)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, s*0.02);
  for (let k=0;k<6;k++){
    ctx.beginPath();
    ctx.moveTo(r*0.15,0);
    ctx.lineTo(r*0.85,0);
    ctx.stroke();
    ctx.rotate((Math.PI*2)/6);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.arc(0,0,r*0.17,0,Math.PI*2); ctx.fill();
  ctx.restore();

  // accent text
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = accent;
  ctx.font = `${Math.floor(s*0.16)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  ctx.textBaseline = 'middle';
  ctx.fillText('MD', x + w*0.10, y + h*0.88);
  ctx.restore();
}

function drawCD(ctx, cx, cy, s, time, accent){
  const r = s * 0.58;
  const rot = time * 0.25;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);

  const g = ctx.createRadialGradient(0,0, r*0.05, 0,0, r);
  g.addColorStop(0, 'rgba(255,255,255,0.16)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.05)');
  g.addColorStop(1, 'rgba(255,255,255,0.02)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();

  // rainbow-ish arcs
  ctx.globalAlpha = 0.32;
  const colors = ['#7cffc6', '#6cf2ff', '#b2a4ff', '#ffd36b', '#ff5aa5'];
  ctx.lineWidth = Math.max(2, s*0.03);
  for (let i=0;i<colors.length;i++){
    ctx.strokeStyle = colors[i];
    ctx.beginPath();
    ctx.arc(0,0, r*(0.55 + i*0.06), i*0.9, i*0.9 + 1.1);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0,0,0,0.58)';
  ctx.beginPath(); ctx.arc(0,0,r*0.16,0,Math.PI*2); ctx.fill();

  // small stamp
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = accent;
  ctx.rotate(-rot);
  ctx.font = `${Math.floor(s*0.16)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CD', 0, r*0.78);

  ctx.restore();
}

function drawZipDisk(ctx, cx, cy, s, time, accent){
  const w = s * 1.15;
  const h = s * 1.25;
  const x = cx - w/2;
  const y = cy - h/2;

  ctx.fillStyle = 'rgba(26,26,30,0.96)';
  roundRect(ctx, x, y, w, h, s*0.12);
  ctx.fill();

  // label
  ctx.fillStyle = 'rgba(240,240,245,0.06)';
  roundRect(ctx, x + w*0.10, y + h*0.12, w*0.80, h*0.24, s*0.08);
  ctx.fill();

  // swirl
  const ox = x + w*0.50;
  const oy = y + h*0.66;
  const r = s * 0.34;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.rotate(time*0.2);
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = Math.max(2, s*0.03);
  for (let i=0;i<3;i++){
    ctx.beginPath();
    ctx.arc(0,0, r*(0.35 + i*0.18), i*1.2, i*1.2 + 3.4);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = accent;
  ctx.font = `${Math.floor(s*0.18)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  ctx.textBaseline = 'middle';
  ctx.fillText('ZIP', x + w*0.14, y + h*0.88);
  ctx.restore();
}

const EXHIBITS = [
  {
    id: 'vhs',
    title: 'VHS Cassette',
    era: '1976–2000s',
    medium: 'magnetic tape',
    capacity: '~2–6 hours',
    note: 'Tracking lines were a feature, not a bug.',
    draw: drawVHS,
  },
  {
    id: 'floppy35',
    title: '3.5" Floppy Disk',
    era: '1980s–2000s',
    medium: 'magnetic disk',
    capacity: '1.44 MB',
    note: 'The “Save” icon’s original habitat.',
    draw: drawFloppy,
  },
  {
    id: 'cassette',
    title: 'Compact Cassette',
    era: '1960s–1990s',
    medium: 'magnetic tape',
    capacity: 'C60/C90',
    note: 'Mixtapes: curated, imperfect, personal.',
    draw: drawCassette,
  },
  {
    id: 'minidisc',
    title: 'MiniDisc',
    era: '1992–2010s',
    medium: 'magneto-optical',
    capacity: '74–80 min',
    note: 'A tiny tank: rugged, editable, underrated.',
    draw: drawMiniDisc,
  },
  {
    id: 'zip',
    title: 'Iomega Zip Disk',
    era: '1990s',
    medium: 'removable disk',
    capacity: '100 MB',
    note: 'Backup culture, before “cloud” meant anything.',
    draw: drawZipDisk,
  },
  {
    id: 'cd',
    title: 'Compact Disc',
    era: '1982–2010s',
    medium: 'optical',
    capacity: '700 MB',
    note: 'Laser readouts, jewel cases, and scratches of fate.',
    draw: drawCD,
  },
];

function shuffled(rand, arr){
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--){
    const j = (rand() * (i + 1)) | 0;
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, t = 0;
  let font = 16, small = 12;

  const SEG_DUR = 55; // seconds per exhibit
  let order = [];
  let idx = 0;
  let segT = 0;

  let palette = null;
  let ah = null;

  function buildPalette(){
    const schemes = [
      { bg0: '#060913', bg1: '#02030a', a: '#6cf2ff', b: '#ffd36b', c: '#ff5aa5' },
      { bg0: '#0c0b12', bg1: '#030308', a: '#b2a4ff', b: '#63ffb6', c: '#ff7a59' },
      { bg0: '#061217', bg1: '#020509', a: '#9ad7ff', b: '#ffd36b', c: '#7cffc6' },
    ];
    return pick(rand, schemes);
  }

  function cur(){ return order[idx] || EXHIBITS[0]; }

  function nextExhibit(){
    idx++;
    if (idx >= order.length) idx = 0;
    segT = 0;
    palette = buildPalette();

    if (audio.enabled){
      audio.beep({ freq: 360 + rand() * 120, dur: 0.018, gain: 0.03, type: 'square' });
    }
  }

  function init({ width, height }){
    w = width; h = height; t = 0;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));

    order = shuffled(rand, EXHIBITS);
    idx = 0;
    segT = 0;
    palette = buildPalette();
  }

  function onResize(width, height){
    w = width; h = height;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));
  }

  function makeAudioHandle(){
    const ctx = audio.ensure();
    const out = ctx.createGain();
    out.gain.value = 0.85;
    out.connect(audio.master);

    // Archive room tone: lowpassed pink noise.
    const noise = audio.noiseSource({ type: 'pink', gain: 0.03 });
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 650;
    lpf.Q.value = 0.9;

    noise.src.disconnect();
    noise.src.connect(noise.gain);
    noise.gain.disconnect();
    noise.gain.connect(lpf);
    lpf.connect(out);

    noise.start();

    return {
      stop(){
        const now = ctx.currentTime;
        try { out.gain.setTargetAtTime(0.0001, now, 0.09); } catch {}
        try { noise.stop(); } catch {}
      }
    };
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    ah = makeAudioHandle();
    audio.setCurrent(ah);
  }

  function onAudioOff(){
    ah?.stop?.();
    ah = null;
  }

  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;
    segT += dt;
    if (segT >= SEG_DUR) nextExhibit();
  }

  function drawBackground(ctx){
    const pal = palette || { bg0: '#060913', bg1: '#02030a' };
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal.bg0);
    g.addColorStop(0.65, '#040510');
    g.addColorStop(1, pal.bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // spotlight cone
    const sp = ctx.createRadialGradient(w*0.50, h*0.42, 0, w*0.50, h*0.42, Math.max(w,h)*0.65);
    sp.addColorStop(0, 'rgba(255,255,255,0.08)');
    sp.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = sp;
    ctx.fillRect(0, 0, w, h);

    // floor
    ctx.save();
    ctx.globalAlpha = 0.55;
    const fg = ctx.createLinearGradient(0, h*0.62, 0, h);
    fg.addColorStop(0, 'rgba(0,0,0,0.0)');
    fg.addColorStop(1, 'rgba(0,0,0,0.75)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, h*0.60, w, h*0.40);
    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const pal = palette || buildPalette();
    const ex = cur();

    drawBackground(ctx);

    const s = Math.min(w, h);
    const cx = Math.floor(w * 0.52);
    const cy = Math.floor(h * 0.45);

    // pedestal
    const pedW = Math.floor(s * 0.42);
    const pedH = Math.floor(s * 0.16);
    const px = Math.floor(cx - pedW/2);
    const py = Math.floor(cy + s*0.24);

    // pedestal shadow
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, px + 10, py + 14, pedW, pedH, Math.floor(font * 0.9));
    ctx.fill();
    ctx.restore();

    // pedestal body
    ctx.save();
    const base = 'rgba(22,26,34,0.90)';
    ctx.fillStyle = base;
    roundRect(ctx, px, py, pedW, pedH, Math.floor(font * 0.9));
    ctx.fill();

    // trim
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(1, Math.floor(s/420));
    strokeRoundRect(ctx, px + 10, py + 10, pedW - 20, pedH - 20, Math.floor(font * 0.7));
    ctx.restore();

    // object shadow
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + s*0.20, s*0.22, s*0.06, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // object (with subtle “turntable” wobble)
    const bob = Math.sin(t * 0.7) * (s * 0.008);
    const tilt = Math.sin(t * 0.25) * 0.15;
    const scaleX = 1 - Math.abs(Math.sin(t * 0.13)) * 0.06;

    ctx.save();
    ctx.translate(cx, cy + bob);
    ctx.rotate(tilt);
    ctx.scale(scaleX, 1);

    const objS = s * 0.22;
    const accent = pal.a;
    ex.draw(ctx, 0, 0, objS, t, accent);

    ctx.restore();

    // UI panel
    const panelX = Math.floor(w * 0.06);
    const panelY = Math.floor(h * 0.68);
    const panelW = Math.floor(w * 0.58);
    const panelH = Math.floor(h * 0.25);

    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    roundRect(ctx, panelX + 6, panelY + 8, panelW, panelH, 16);
    ctx.fill();

    ctx.fillStyle = 'rgba(10, 14, 22, 0.78)';
    roundRect(ctx, panelX, panelY, panelW, panelH, 16);
    ctx.fill();

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = pal.a;
    ctx.fillRect(panelX, panelY + Math.floor(font * 1.55), panelW, 2);

    ctx.globalAlpha = 0.94;
    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.font = `${Math.floor(font * 1.05)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText('MUSEUM OF OBSOLETE MEDIA', panelX + Math.floor(font * 0.8), panelY + Math.floor(font * 0.35));

    ctx.font = `${Math.floor(font * 1.20)}px ui-sans-serif, system-ui`;
    ctx.globalAlpha = 0.92;
    ctx.fillText(ex.title, panelX + Math.floor(font * 0.8), panelY + Math.floor(font * 2.1));

    // metadata in monospace
    ctx.globalAlpha = 0.80;
    ctx.font = `${Math.floor(small * 0.96)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

    const left = panelX + Math.floor(font * 0.8);
    const top = panelY + Math.floor(font * 3.9);
    const lh = Math.floor(small * 1.22);

    const rows = [
      ['ERA', ex.era],
      ['MEDIUM', ex.medium],
      ['CAPACITY', ex.capacity],
    ];

    ctx.fillStyle = pal.b;
    rows.forEach(([k], i)=>{
      ctx.fillText(`${k}:`, left, top + i*lh);
    });

    ctx.fillStyle = 'rgba(231,238,246,0.82)';
    rows.forEach(([,v], i)=>{
      ctx.fillText(v, left + Math.floor(font * 6.0), top + i*lh);
    });

    ctx.globalAlpha = 0.86;
    ctx.fillStyle = pal.c;
    ctx.fillText('NOTE:', left, top + 3*lh + Math.floor(lh*0.2));

    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(231,238,246,0.82)';
    ctx.fillText(ex.note, left + Math.floor(font * 6.0), top + 3*lh + Math.floor(lh*0.2));

    // progress strip
    const u = clamp(segT / SEG_DUR, 0, 1);
    const barY = panelY + panelH - Math.floor(font * 0.85);
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = 'rgba(231,238,246,0.9)';
    ctx.fillRect(panelX + Math.floor(font*0.8), barY, panelW - Math.floor(font*1.6), 2);
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = pal.a;
    ctx.fillRect(panelX + Math.floor(font*0.8), barY, Math.floor((panelW - Math.floor(font*1.6)) * u), 2);

    ctx.restore();

    // corner tag + remaining seconds
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(231,238,246,0.78)';
    ctx.font = `${Math.floor(small * 0.9)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    const rem = Math.max(0, Math.ceil(SEG_DUR - segT));
    const tag = `EXHIBIT  •  ${String(rem).padStart(2,'0')}s`;
    ctx.fillText(tag, Math.floor(w*0.06), Math.floor(h*0.06));
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
