import { mulberry32, clamp } from '../../util/prng.js';

// Mapmaker's Weathered Atlas
// Hand-drawn map pages with animated routes, marginalia, and little historical footnotes.

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

function quillScratch(audio, rand, {gain=0.03}={}){
  const ctx = audio.ensure();
  const dur = 0.08 + rand() * 0.06;
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(dur * sr));

  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++){
    const x = i / len;
    const env = Math.pow(1 - x, 1.8);
    // slightly "gritty" noise (a bit of inertia)
    const n = (Math.random() * 2 - 1) * 0.9;
    last = last * 0.82 + n * 0.18;
    // add a tiny "stroke" modulation
    const mod = 0.65 + 0.35 * Math.sin(2 * Math.PI * (6 + rand() * 9) * x);
    d[i] = last * env * mod;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1200 + rand() * 1400;
  bp.Q.value = 1.1;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 260;
  hp.Q.value = 0.7;

  const g = ctx.createGain();
  g.gain.value = 0;

  src.connect(bp);
  bp.connect(hp);
  hp.connect(g);
  g.connect(audio.master);

  const t0 = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

const SYL_A = ['mar','val','cor','wen','dra','hal','bel','tor','lin','fen','ast','nor','rim','cal','ves','brin','sol','dar','kir','elm'];
const SYL_B = ['dale','ford','haven','reach','mere','spire','wold','gate','holm','bay','march','crest','barrow','fells','moor','strand','watch','cairn','pass','heath'];
const PLACE_KIND = ['Isles','Coast','Lowlands','Highlands','Marches','Shore','Reach','Basin','Hinterlands','Straits'];
const NOTE_VERB = ['Avoid','Observe','Mark','Trust','Doubt','Record','Sketch','Measure','Respect','Ignore'];
const NOTE_OBJ = ['fogbanks','tidal flats','old roads','quiet ruins','shifting dunes','storm fronts','border stones','broken bridges','lantern posts','whispering reeds'];

function namePlace(rand){
  const a = pick(rand, SYL_A);
  const b = pick(rand, SYL_B);
  if (rand() < 0.28) return `${a[0].toUpperCase()+a.slice(1)} ${b}`;
  return `${a[0].toUpperCase()+a.slice(1)}${b}`;
}

function genIsland(rand, cx, cy, r0, points=86){
  // quick polar blob with a few sine bumps
  const b1 = 2 + ((rand() * 4) | 0);
  const b2 = 3 + ((rand() * 5) | 0);
  const p = [];
  const phase1 = rand() * Math.PI * 2;
  const phase2 = rand() * Math.PI * 2;
  const a1 = 0.20 + rand() * 0.18;
  const a2 = 0.10 + rand() * 0.12;
  for (let i = 0; i < points; i++){
    const th = (i / points) * Math.PI * 2;
    const bump = 1
      + a1 * Math.sin(th * b1 + phase1)
      + a2 * Math.sin(th * b2 + phase2);
    const jitter = 1 + (rand() * 2 - 1) * 0.03;
    const r = r0 * bump * jitter;
    p.push([cx + Math.cos(th) * r, cy + Math.sin(th) * r]);
  }
  return p;
}

function polyLen(poly){
  let L = 0;
  for (let i = 1; i < poly.length; i++){
    const [x0,y0] = poly[i-1];
    const [x1,y1] = poly[i];
    const dx = x1 - x0, dy = y1 - y0;
    L += Math.hypot(dx, dy);
  }
  return L;
}

function pointOnPoly(poly, u){
  // u in [0..1]
  const total = polyLen(poly);
  const target = total * clamp(u, 0, 1);
  let acc = 0;
  for (let i = 1; i < poly.length; i++){
    const [x0,y0] = poly[i-1];
    const [x1,y1] = poly[i];
    const seg = Math.hypot(x1-x0, y1-y0);
    if (acc + seg >= target){
      const t = seg ? (target - acc) / seg : 0;
      return [lerp(x0,x1,t), lerp(y0,y1,t)];
    }
    acc += seg;
  }
  return poly[poly.length - 1];
}

function genRoute(rand, x0, y0, x1, y1){
  const pts = [];
  const n = 7 + ((rand() * 5) | 0);
  const mx = (x0 + x1) * 0.5;
  const my = (y0 + y1) * 0.5;
  const bend = (rand() * 2 - 1) * 0.18;
  const bx = mx + (y0 - y1) * bend;
  const by = my + (x1 - x0) * bend;

  for (let i = 0; i < n; i++){
    const t = i / (n - 1);
    // quadratic bezier-ish
    const ax = lerp(x0, bx, t);
    const ay = lerp(y0, by, t);
    const cx = lerp(bx, x1, t);
    const cy = lerp(by, y1, t);
    let x = lerp(ax, cx, t);
    let y = lerp(ay, cy, t);

    // jitter perpendicular to direction
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dd = Math.hypot(dx, dy) || 1;
    const nx = -dy / dd;
    const ny = dx / dd;
    const j = (rand() * 2 - 1) * 0.03 * (0.2 + 0.8 * Math.sin(t * Math.PI));
    x += nx * j;
    y += ny * j;

    pts.push([x, y]);
  }

  return pts;
}

function buildPage(rand, idx){
  const title = `${namePlace(rand)} ${pick(rand, PLACE_KIND)}`;
  const leaf = `LEAF ${String(1 + ((rand() * 24) | 0)).padStart(2,'0')}`;
  const year = 1680 + ((rand() * 220) | 0);
  const carto = `${pick(rand, ['A.','B.','C.','D.','E.'])}${pick(rand, ['.',''])} ${namePlace(rand)}`;

  // map space in normalized coordinates (0..1)
  const islands = [];
  const k = 1 + ((rand() * 3) | 0);
  for (let i = 0; i < k; i++){
    const cx = 0.42 + (rand() * 0.34 - 0.17);
    const cy = 0.52 + (rand() * 0.30 - 0.15);
    const r0 = 0.15 + rand() * 0.12;
    islands.push(genIsland(rand, cx, cy, r0, 80 + ((rand() * 30) | 0)));
  }

  // towns + labels
  const towns = [];
  const tn = 5 + ((rand() * 6) | 0);
  for (let i = 0; i < tn; i++){
    towns.push({
      x: 0.16 + rand() * 0.68,
      y: 0.22 + rand() * 0.56,
      name: namePlace(rand),
    });
  }

  // mountains
  const mountains = [];
  const mn = 10 + ((rand() * 14) | 0);
  for (let i = 0; i < mn; i++){
    mountains.push({
      x: 0.18 + rand() * 0.64,
      y: 0.24 + rand() * 0.52,
      s: 0.012 + rand() * 0.010,
    });
  }

  // route
  const sx = 0.18 + rand() * 0.64;
  const sy = 0.26 + rand() * 0.48;
  const ex = 0.18 + rand() * 0.64;
  const ey = 0.26 + rand() * 0.48;
  const route = genRoute(rand, sx, sy, ex, ey);

  const foot = [];
  const fn = 4 + ((rand() * 4) | 0);
  for (let i = 0; i < fn; i++){
    const v = pick(rand, NOTE_VERB);
    const o = pick(rand, NOTE_OBJ);
    const n0 = `${(i+1)}. ${v} the ${o}.`;
    foot.push(n0);
  }

  const margin = [];
  const mn2 = 3 + ((rand() * 4) | 0);
  for (let i = 0; i < mn2; i++){
    const prefix = pick(rand, ['NOTE','MARGIN','ADDEND','ERRATA','OBS']);
    const txt = `${prefix}: ${pick(rand, NOTE_VERB)} ${pick(rand, NOTE_OBJ)}.`;
    margin.push(txt);
  }

  return {
    idx,
    title,
    leaf,
    year,
    carto,
    islands,
    towns,
    mountains,
    route,
    foot,
    margin,
    stainSeed: rand(),
    compassA: rand() * Math.PI * 2,
  };
}

function drawParchment(ctx, x, y, w, h, rand, stainSeed){
  // base
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#f2e4c2');
  g.addColorStop(0.55, '#ead8b1');
  g.addColorStop(1, '#e2cca0');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);

  // grain
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = 'rgba(60,40,15,0.9)';
  const step = Math.max(9, Math.floor(Math.min(w, h) / 26));
  for (let yy = 0; yy < h; yy += step){
    for (let xx = 0; xx < w; xx += step){
      const hsh = (((xx * 73856093) ^ (yy * 19349663) ^ ((stainSeed * 1e9) | 0)) >>> 0);
      if ((hsh & 31) === 0) ctx.fillRect(x + xx + (hsh & 7), y + yy + ((hsh >>> 3) & 7), 1, 1);
    }
  }
  ctx.restore();

  // stains / weathering
  ctx.save();
  ctx.globalAlpha = 0.15;
  ctx.strokeStyle = 'rgba(120,70,25,0.6)';
  ctx.lineWidth = Math.max(1, Math.floor(Math.min(w,h) / 420));
  const n = 3 + ((stainSeed * 9) | 0);
  for (let i = 0; i < n; i++){
    const rx = x + w * (0.12 + ((stainSeed * 997 + i * 0.17) % 1) * 0.76);
    const ry = y + h * (0.12 + ((stainSeed * 463 + i * 0.31) % 1) * 0.76);
    const rr = Math.min(w,h) * (0.06 + (((stainSeed * 113 + i * 0.19) % 1) * 0.08));
    ctx.beginPath();
    ctx.arc(rx, ry, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha *= 0.68;
    ctx.beginPath();
    ctx.arc(rx + rr * 0.25, ry - rr * 0.10, rr * 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.15;
  }
  ctx.restore();

  // edge burn-ish vignette
  ctx.save();
  const vg = ctx.createRadialGradient(x + w/2, y + h/2, Math.min(w,h) * 0.2, x + w/2, y + h/2, Math.max(w,h) * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(55,30,10,0.22)');
  ctx.fillStyle = vg;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}

function drawInkPath(ctx, pts, x, y, w, h){
  if (!pts.length) return;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++){
    const [px, py] = pts[i];
    const xx = x + px * w;
    const yy = y + py * h;
    if (i === 0) ctx.moveTo(xx, yy);
    else ctx.lineTo(xx, yy);
  }
}

function drawMountain(ctx, x, y, s, ink){
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1, s * 1.3);
  ctx.beginPath();
  ctx.moveTo(x - s * 1.2, y + s * 0.8);
  ctx.lineTo(x, y - s * 1.1);
  ctx.lineTo(x + s * 1.2, y + s * 0.8);
  ctx.stroke();
  // little ridge
  ctx.globalAlpha *= 0.65;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.15, y - s * 0.2);
  ctx.lineTo(x + s * 0.55, y + s * 0.55);
  ctx.stroke();
  ctx.restore();
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, dpr = 1;
  let t = 0;

  let page = null;
  let next = null;
  let pageT = 0;
  let transitioning = false;

  let font = 16;
  let small = 12;

  let ambience = null;
  let scratchGate = 0;

  const PAGE_DUR = 78; // seconds per leaf
  const TRANS_DUR = 1.2;

  function init({ width, height, dpr: dp }){
    w = width;
    h = height;
    dpr = dp || 1;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 32));
    small = Math.max(11, Math.floor(font * 0.72));

    pageT = 0;
    transitioning = false;

    page = buildPage(rand, 1);
    next = null;
    scratchGate = 0;
  }

  function onResize(width, height, dp){ init({ width, height, dpr: dp }); }

  function onAudioOn(){
    if (!audio.enabled) return;
    // quiet "paper room" bed
    const hdl = audio.noiseSource({ type: 'pink', gain: 0.022 });
    hdl.start();
    ambience = { stop(){ hdl.stop(); } };
    audio.setCurrent(ambience);
    audio.beep({ freq: 392 + rand() * 50, dur: 0.03, gain: 0.012, type: 'triangle' });
  }

  function onAudioOff(){ ambience?.stop?.(); ambience = null; }
  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;
    pageT += dt;

    if (!transitioning && pageT >= PAGE_DUR){
      transitioning = true;
      next = buildPage(rand, page.idx + 1);
      if (audio.enabled) quillScratch(audio, rand, { gain: 0.032 });
    }

    if (transitioning && pageT >= PAGE_DUR + TRANS_DUR){
      page = next;
      next = null;
      transitioning = false;
      pageT = 0;
    }

    // occasional scratch when marker crosses a "tick"
    if (audio.enabled){
      const u = ((t * 0.018) % 1);
      const k = (u * 8) | 0;
      if (k !== scratchGate){
        scratchGate = k;
        if (rand() < 0.22) quillScratch(audio, rand, { gain: 0.018 + rand() * 0.012 });
      }
    }
  }

  function renderPage(ctx, pg, alpha, uMarker){
    const s = Math.min(w, h);
    const pw = Math.floor(s * 0.84);
    const ph = Math.floor(s * 0.96);
    const px = Math.floor(w * 0.5 - pw * 0.5);
    const py = Math.floor(h * 0.5 - ph * 0.5);

    const ink = 'rgba(55,35,16,0.86)';
    const faintInk = 'rgba(55,35,16,0.42)';
    const red = 'rgba(150,40,28,0.65)';

    ctx.save();
    ctx.globalAlpha = alpha;

    // parchment
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, px + 10, py + 12, pw, ph, Math.max(18, Math.floor(font * 1.2)));
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(px, py);

    roundRect(ctx, 0, 0, pw, ph, Math.max(18, Math.floor(font * 1.2)));
    ctx.clip();

    drawParchment(ctx, 0, 0, pw, ph, rand, pg.stainSeed);

    // frame
    ctx.save();
    ctx.strokeStyle = 'rgba(75,45,18,0.35)';
    ctx.lineWidth = Math.max(1, 1.2 * dpr);
    roundRect(ctx, pw * 0.05, ph * 0.07, pw * 0.90, ph * 0.86, Math.max(14, Math.floor(font * 1.0)));
    ctx.stroke();
    ctx.globalAlpha = 0.55;
    roundRect(ctx, pw * 0.058, ph * 0.078, pw * 0.884, ph * 0.844, Math.max(12, Math.floor(font * 0.9)));
    ctx.stroke();
    ctx.restore();

    // header
    ctx.save();
    ctx.fillStyle = ink;
    ctx.textBaseline = 'top';
    ctx.font = `${Math.floor(font * 1.12)}px ui-serif, Georgia, serif`;
    ctx.fillText("MAPMAKER'S WEATHERED ATLAS", Math.floor(pw * 0.07), Math.floor(ph * 0.06));

    ctx.globalAlpha = 0.78;
    ctx.font = `${Math.floor(font * 0.88)}px ui-serif, Georgia, serif`;
    ctx.fillText(`${pg.leaf}  •  ${pg.year}`, Math.floor(pw * 0.07), Math.floor(ph * 0.06 + font * 1.35));

    ctx.globalAlpha = 0.92;
    ctx.font = `${Math.floor(font * 1.34)}px ui-sans-serif, system-ui`;
    ctx.fillText(pg.title, Math.floor(pw * 0.07), Math.floor(ph * 0.14));

    ctx.globalAlpha = 0.66;
    ctx.font = `${Math.floor(small * 0.98)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`Cartographer: ${pg.carto}`, Math.floor(pw * 0.07), Math.floor(ph * 0.14 + font * 1.55));
    ctx.restore();

    // map rect
    const mx = Math.floor(pw * 0.07);
    const my = Math.floor(ph * 0.26);
    const mw = Math.floor(pw * 0.72);
    const mh = Math.floor(ph * 0.60);

    // sea wash
    ctx.save();
    const sea = ctx.createLinearGradient(mx, my, mx, my + mh);
    sea.addColorStop(0, 'rgba(110,150,155,0.10)');
    sea.addColorStop(1, 'rgba(70,110,120,0.06)');
    ctx.fillStyle = sea;
    roundRect(ctx, mx, my, mw, mh, Math.max(12, Math.floor(font * 0.85)));
    ctx.fill();
    ctx.restore();

    // coastlines
    ctx.save();
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1, 1.4 * dpr);
    ctx.globalAlpha = 0.92;
    for (const isl of pg.islands){
      drawInkPath(ctx, isl, mx, my, mw, mh);
      ctx.closePath();
      ctx.fillStyle = 'rgba(120,140,90,0.10)';
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    // mountains
    ctx.save();
    ctx.globalAlpha = 0.70;
    for (const mtn of pg.mountains){
      const xx = mx + mtn.x * mw;
      const yy = my + mtn.y * mh;
      drawMountain(ctx, xx, yy, mtn.s * mw, ink);
    }
    ctx.restore();

    // towns
    ctx.save();
    ctx.fillStyle = ink;
    ctx.strokeStyle = faintInk;
    ctx.lineWidth = Math.max(1, 1.0 * dpr);
    ctx.font = `${Math.floor(small * 0.92)}px ui-serif, Georgia, serif`;
    ctx.textBaseline = 'middle';
    for (const tw0 of pg.towns){
      const xx = mx + tw0.x * mw;
      const yy = my + tw0.y * mh;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.arc(xx, yy, Math.max(1.7, 2.2 * dpr), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(xx, yy, Math.max(3.2, 4.2 * dpr), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 0.72;
      ctx.fillText(tw0.name, xx + Math.floor(small * 0.7), yy);
    }
    ctx.restore();

    // compass rose
    ctx.save();
    ctx.translate(mx + mw * 0.90, my + mh * 0.12);
    ctx.rotate(pg.compassA * 0.15 + Math.sin(t * 0.06) * 0.03);
    ctx.strokeStyle = faintInk;
    ctx.lineWidth = Math.max(1, 1.2 * dpr);
    const cr = Math.min(mw, mh) * 0.06;
    ctx.beginPath();
    ctx.arc(0, 0, cr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, -cr);
    ctx.lineTo(0, cr);
    ctx.moveTo(-cr, 0);
    ctx.lineTo(cr, 0);
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.75;
    ctx.font = `${Math.floor(small * 0.90)}px ui-serif, Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('N', 0, -cr - 2);
    ctx.restore();

    // route
    ctx.save();
    ctx.strokeStyle = red;
    ctx.lineWidth = Math.max(1, 1.5 * dpr);
    ctx.setLineDash([Math.max(6, small * 0.65), Math.max(4, small * 0.55)]);
    ctx.lineDashOffset = -t * 18;
    drawInkPath(ctx, pg.route, mx, my, mw, mh);
    ctx.stroke();

    // marker (tiny "ship")
    const p = pointOnPoly(pg.route, uMarker);
    const sx = mx + p[0] * mw;
    const sy = my + p[1] * mh;
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(25,18,10,0.82)';
    const ss = Math.max(5, small * 0.62);
    ctx.beginPath();
    ctx.moveTo(sx, sy - ss * 0.9);
    ctx.lineTo(sx - ss * 0.75, sy + ss * 0.75);
    ctx.lineTo(sx + ss * 0.75, sy + ss * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.stroke();

    ctx.restore();

    // marginalia column (right)
    const rx = Math.floor(pw * 0.81);
    const ry = Math.floor(ph * 0.26);
    const rw = Math.floor(pw * 0.12);
    const rh = Math.floor(ph * 0.60);

    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(60,40,15,0.05)';
    roundRect(ctx, rx, ry, rw, rh, Math.max(10, Math.floor(font * 0.75)));
    ctx.fill();

    ctx.fillStyle = ink;
    ctx.textBaseline = 'top';
    ctx.font = `${Math.floor(small * 0.88)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.globalAlpha = 0.8;
    ctx.fillText('MARGINALIA', rx + Math.floor(rw * 0.1), ry + Math.floor(rh * 0.04));

    const hi = ((t * 0.09) | 0) % pg.margin.length;
    const lh = Math.floor(small * 1.32);
    let yy = ry + Math.floor(rh * 0.14);
    for (let i = 0; i < pg.margin.length; i++){
      if (i === hi){
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = 'rgba(150,40,28,0.85)';
        ctx.fillRect(rx + Math.floor(rw * 0.06), yy - 2, rw - Math.floor(rw * 0.12), lh + 2);
        ctx.restore();
      }
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = ink;
      const txt = pg.margin[i];
      // simple wrap
      const wrapW = rw - Math.floor(rw * 0.12);
      const words = txt.split(' ');
      let line = '';
      let yy2 = yy;
      for (const w0 of words){
        const test = line ? (line + ' ' + w0) : w0;
        if (ctx.measureText(test).width > wrapW && line){
          ctx.fillText(line, rx + Math.floor(rw * 0.06), yy2);
          yy2 += lh;
          line = w0;
        } else line = test;
      }
      if (line) ctx.fillText(line, rx + Math.floor(rw * 0.06), yy2);
      yy = yy2 + Math.floor(lh * 0.65);
      if (yy > ry + rh * 0.88) break;
    }
    ctx.restore();

    // footnotes
    ctx.save();
    ctx.fillStyle = ink;
    ctx.textBaseline = 'top';
    ctx.globalAlpha = 0.68;
    ctx.font = `${Math.floor(small * 0.95)}px ui-serif, Georgia, serif`;
    const fx = Math.floor(pw * 0.07);
    const fy = Math.floor(ph * 0.89);
    ctx.fillText('FOOTNOTES', fx, fy);

    ctx.globalAlpha = 0.6;
    ctx.fillStyle = faintInk;
    ctx.fillRect(fx, fy + Math.floor(small * 1.08), Math.floor(pw * 0.68), Math.max(1, 1.2 * dpr));

    ctx.globalAlpha = 0.72;
    ctx.fillStyle = 'rgba(45,28,12,0.86)';
    ctx.font = `${Math.floor(small * 0.92)}px ui-sans-serif, system-ui`;
    let y2 = fy + Math.floor(small * 1.45);
    const lh2 = Math.floor(small * 1.25);
    const active = ((t * 0.07) | 0) % pg.foot.length;
    for (let i = 0; i < pg.foot.length; i++){
      if (i === active){
        ctx.save();
        ctx.globalAlpha = 0.10;
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillRect(fx, y2 - 1, Math.floor(pw * 0.68), lh2 + 2);
        ctx.restore();
      }
      ctx.globalAlpha = 0.78;
      ctx.fillText(pg.foot[i], fx, y2);
      y2 += lh2;
      if (y2 > ph * 0.98) break;
    }
    ctx.restore();

    // page corner annotation
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(45,28,12,0.76)';
    ctx.font = `${Math.floor(small * 0.90)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'alphabetic';
    const right = `ROUTE: ${String(Math.floor(uMarker * 100)).padStart(2,'0')}%`;
    const tw = ctx.measureText(right).width;
    ctx.fillText(right, Math.floor(pw * 0.93 - tw), Math.floor(ph * 0.96));
    ctx.restore();

    ctx.restore(); // translate
    ctx.restore(); // alpha
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // desk background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0a0b0c');
    bg.addColorStop(0.55, '#070707');
    bg.addColorStop(1, '#040404');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const uMarker = (t * 0.018) % 1;

    if (!transitioning){
      renderPage(ctx, page, 1, uMarker);
    } else {
      const p = clamp((pageT - PAGE_DUR) / TRANS_DUR, 0, 1);
      const a0 = 1 - p;
      const a1 = p;
      // slight crossfade + subtle slide
      ctx.save();
      ctx.translate(-p * 6, -p * 3);
      renderPage(ctx, page, a0, uMarker);
      ctx.restore();

      ctx.save();
      ctx.translate((1 - p) * 6, (1 - p) * 3);
      renderPage(ctx, next, a1, uMarker);
      ctx.restore();
    }

    // broadcast speckle
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    const n = Math.floor(200 + 200 * (0.5 + 0.5 * Math.sin(t * 0.6)));
    for (let i = 0; i < n; i++){
      const x = (rand() * w) | 0;
      const y = (rand() * h) | 0;
      if (((x + y + i) & 7) === 0) ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
