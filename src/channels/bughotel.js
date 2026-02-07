import { mulberry32, clamp } from '../util/prng.js';

// Bug Hotel Live
// Cozy macro “wildlife cam” of tiny insects with faux field-notes + sightings log.

function lerp(a,b,t){ return a + (b-a)*t; }
function ease(t){ t = clamp(t, 0, 1); return t*t*(3-2*t); }

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

function fmtMMSS(sec){
  sec = Math.max(0, Math.floor(sec));
  const m = String(Math.floor(sec / 60)).padStart(2,'0');
  const s = String(sec % 60).padStart(2,'0');
  return `${m}:${s}`;
}

const SPECIES = [
  {
    key: 'ant',
    name: 'Garden Ant',
    latin: 'Lasius niger-ish',
    col: '#2a2a2a',
    size: 1.0,
    behaviors: ['trail-walking', 'antenna tap', 'crumb haul', 'edge patrol', 'spiral investigate'],
    notes: ['Keeps to edges.', 'Loves corners.', 'Stops to check “signals”.'],
  },
  {
    key: 'lady',
    name: 'Ladybird',
    latin: 'Coccinellidae',
    col: '#d94b3d',
    size: 1.35,
    behaviors: ['slow crawl', 'wing-case flex', 'sun pause', 'tiny hop', 'leaf peek'],
    notes: ['Shiny shell; polite vibes.', 'Occasionally “teleports” (actually, fast).'],
  },
  {
    key: 'beetle',
    name: 'Carpet Beetle',
    latin: 'Dermestidae',
    col: '#5b4a3a',
    size: 1.45,
    behaviors: ['zig-zag wander', 'freeze response', 'side-step', 'burrow nudge', 'circle scout'],
    notes: ['Moves like a tiny tank.', 'Stops when “watched”.'],
  },
  {
    key: 'moth',
    name: 'Moth',
    latin: 'Noctuidae',
    col: '#c9b99c',
    size: 1.55,
    behaviors: ['lamp orbit', 'flutter drift', 'landing test', 'dusty wing shake'],
    notes: ['Attracted to overlays.', 'Wings drawn to light gradients.'],
  },
  {
    key: 'isopod',
    name: 'Woodlouse',
    latin: 'Oniscidea',
    col: '#76808b',
    size: 1.7,
    behaviors: ['slow roll', 'tuck & turn', 'stone-bridge', 'moisture seek'],
    notes: ['Likes the cool shade.', 'Antennae always probing.'],
  },
];

function drawCritter(ctx, c, px, py, s){
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(c.ang);

  const a = 0.95;
  const bodyL = s * 1.55;
  const bodyW = s * 0.95;

  // shadow
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.beginPath();
  ctx.ellipse(s*0.18, s*0.25, bodyL*0.58, bodyW*0.55, 0, 0, Math.PI*2);
  ctx.fill();

  // body
  ctx.globalAlpha = a;
  ctx.fillStyle = c.col;
  ctx.beginPath();
  ctx.ellipse(0, 0, bodyL*0.55, bodyW*0.52, 0, 0, Math.PI*2);
  ctx.fill();

  // head
  ctx.globalAlpha = a * 0.95;
  ctx.beginPath();
  ctx.ellipse(bodyL*0.55, 0, bodyW*0.30, bodyW*0.26, 0, 0, Math.PI*2);
  ctx.fill();

  // markings (ladybird-ish)
  if (c.kind.key === 'lady'){
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(10,10,10,0.85)';
    for (let i=0;i<5;i++){
      const u = (i-2) / 2;
      ctx.beginPath();
      ctx.arc(u * s*0.55, (i%2? -1:1)*s*0.18, s*0.16, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = Math.max(1, s*0.06);
    ctx.beginPath();
    ctx.moveTo(-bodyL*0.20, -bodyW*0.35);
    ctx.lineTo(bodyL*0.30, bodyW*0.35);
    ctx.stroke();
  }

  // wings (moth)
  if (c.kind.key === 'moth'){
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(-s*0.15, -s*0.55, s*0.75, s*0.55, -0.4, 0, Math.PI*2);
    ctx.ellipse(-s*0.15, s*0.55, s*0.75, s*0.55, 0.4, 0, Math.PI*2);
    ctx.fill();
  }

  // legs (simple)
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = 'rgba(20,20,20,0.9)';
  ctx.lineWidth = Math.max(1, s*0.09);
  for (let i=-2;i<=2;i++){
    const lx = i * s*0.22;
    ctx.beginPath();
    ctx.moveTo(lx, -s*0.18);
    ctx.lineTo(lx - s*0.20, -s*0.45);
    ctx.moveTo(lx, s*0.18);
    ctx.lineTo(lx - s*0.20, s*0.45);
    ctx.stroke();
  }

  // antennae
  ctx.globalAlpha = 0.40;
  ctx.strokeStyle = 'rgba(20,20,20,0.9)';
  ctx.lineWidth = Math.max(1, s*0.07);
  ctx.beginPath();
  ctx.moveTo(bodyL*0.70, -s*0.05);
  ctx.lineTo(bodyL*0.92, -s*0.40);
  ctx.moveTo(bodyL*0.70, s*0.05);
  ctx.lineTo(bodyL*0.92, s*0.40);
  ctx.stroke();

  ctx.restore();
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, dpr = 1;
  let t = 0;
  let font = 18;

  // “Terrarium window” region
  let win = { x: 0, y: 0, w: 0, h: 0, r: 18 };

  let critters = [];
  let eventT = 0;
  let spotlight = null; // {i, age}

  let field = { title:'—', latin:'—', behavior:'—', note:'—' };
  let log = [];

  // Audio
  let ah = null;

  function initCritters(){
    const n = 8;
    critters = [];
    for (let i=0;i<n;i++){
      const kind = SPECIES[(seed + i + Math.floor(rand()*999)) % SPECIES.length];
      const x = win.x + win.w * (0.12 + rand()*0.76);
      const y = win.y + win.h * (0.18 + rand()*0.70);
      const sp = 0.6 + rand()*1.2;
      const ang = rand() * Math.PI*2;
      critters.push({
        kind,
        col: kind.col,
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        ang,
        wiggle: rand() * 10,
      });
    }
  }

  function init({ width, height, dpr: _dpr=1 }){
    w = width; h = height; dpr = _dpr;
    t = 0;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));

    const pad = Math.floor(w * 0.06);
    const ww = Math.floor(w * 0.76);
    const wh = Math.floor(h * 0.62);
    win = {
      x: Math.floor((w - ww) * 0.5),
      y: Math.floor(h * 0.18),
      w: ww,
      h: wh,
      r: Math.max(14, Math.floor(Math.min(w, h) / 38)),
    };

    initCritters();

    log = [];
    eventT = 1.0 + rand() * 1.5;
    spotlight = null;
    field = { title:'—', latin:'—', behavior:'—', note:'—' };
  }

  function onResize(width, height, _dpr){ init({ width, height, dpr: _dpr }); }

  function makeAudioHandle(){
    const ctx = audio.ensure();
    const out = ctx.createGain();
    out.gain.value = 0.70;
    out.connect(audio.master);

    const n = audio.noiseSource({ type: 'brown', gain: 0.0045 });
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 520;
    lpf.Q.value = 0.7;

    n.src.disconnect();
    n.src.connect(n.gain);
    n.gain.disconnect();
    n.gain.connect(lpf);
    lpf.connect(out);

    n.start();

    return {
      stop(){
        const now = ctx.currentTime;
        try { out.gain.setTargetAtTime(0.0001, now, 0.12); } catch {}
        try { n.stop(); } catch {}
      }
    };
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    ah = makeAudioHandle();
    audio.setCurrent(ah);
  }

  function onAudioOff(){
    try { ah?.stop?.(); } catch {}
    ah = null;
  }

  function destroy(){ onAudioOff(); }

  function spawnSighting(){
    const i = Math.floor(rand() * critters.length);
    const c = critters[i];
    const b = c.kind.behaviors[Math.floor(rand() * c.kind.behaviors.length)];
    const n = c.kind.notes[Math.floor(rand() * c.kind.notes.length)];

    spotlight = { i, age: 0 };
    field = {
      title: c.kind.name,
      latin: c.kind.latin,
      behavior: b,
      note: n,
    };

    const ts = fmtMMSS(t);
    const line = `${ts}  spotted: ${c.kind.key} • ${b}`;
    log.unshift(line);
    if (log.length > 7) log.length = 7;

    if (audio.enabled){
      audio.beep({ freq: 980 + rand()*240, dur: 0.018, gain: 0.010, type: 'triangle' });
    }

    eventT = 6.0 + rand() * 7.0;
  }

  function update(dt){
    t += dt;

    eventT -= dt;
    if (eventT <= 0){
      spawnSighting();
    }

    if (spotlight){
      spotlight.age += dt;
      if (spotlight.age > 4.2) spotlight = null;
    }

    // Wander critters within the terrarium window.
    const mx0 = win.x + win.w * 0.06;
    const mx1 = win.x + win.w * 0.94;
    const my0 = win.y + win.h * 0.10;
    const my1 = win.y + win.h * 0.92;

    for (let i=0;i<critters.length;i++){
      const c = critters[i];

      const jitter = 0.8 + 0.35 * Math.sin(t*0.6 + c.wiggle);
      const turn = (rand() - 0.5) * 0.9 * dt;
      c.ang += turn;

      const speed = (0.38 + 0.52 * rand()) * jitter * c.kind.size;
      c.vx = lerp(c.vx, Math.cos(c.ang) * speed, 0.06);
      c.vy = lerp(c.vy, Math.sin(c.ang) * speed, 0.06);

      // moth drifts toward top-left “light” region
      if (c.kind.key === 'moth'){
        const lx = win.x + win.w * 0.25;
        const ly = win.y + win.h * 0.18;
        c.vx += clamp((lx - c.x) * 0.0009, -0.04, 0.04);
        c.vy += clamp((ly - c.y) * 0.0009, -0.04, 0.04);
      }

      c.x += c.vx * dt * 60;
      c.y += c.vy * dt * 60;

      // bounce
      if (c.x < mx0){ c.x = mx0; c.ang = 0; }
      if (c.x > mx1){ c.x = mx1; c.ang = Math.PI; }
      if (c.y < my0){ c.y = my0; c.ang = Math.PI/2; }
      if (c.y > my1){ c.y = my1; c.ang = -Math.PI/2; }
    }
  }

  function drawBackground(ctx){
    // dim cozy room + soft vignette
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#070b0b');
    g.addColorStop(1, '#020303');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const vg = ctx.createRadialGradient(w*0.5, h*0.55, 0, w*0.5, h*0.55, Math.max(w,h)*0.82);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.78)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  function drawTerrarium(ctx){
    ctx.save();

    // glass shadow
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, win.x + 10, win.y + 14, win.w, win.h, win.r);
    ctx.fill();

    // glass body
    const gg = ctx.createLinearGradient(win.x, win.y, win.x + win.w, win.y + win.h);
    gg.addColorStop(0, '#123b31');
    gg.addColorStop(0.45, '#0b241f');
    gg.addColorStop(1, '#081515');

    ctx.globalAlpha = 0.95;
    ctx.fillStyle = gg;
    roundRect(ctx, win.x, win.y, win.w, win.h, win.r);
    ctx.fill();

    // substrate
    const dirtH = win.h * 0.32;
    const dg = ctx.createLinearGradient(0, win.y + win.h - dirtH, 0, win.y + win.h);
    dg.addColorStop(0, 'rgba(92,70,46,0.35)');
    dg.addColorStop(1, 'rgba(42,28,18,0.85)');
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.moveTo(win.x, win.y + win.h - dirtH);
    for (let i=0;i<=7;i++){
      const u = i/7;
      const x = win.x + u * win.w;
      const y = win.y + win.h - dirtH + Math.sin(u*5.2 + 1.3) * win.h*0.02;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(win.x + win.w, win.y + win.h);
    ctx.lineTo(win.x, win.y + win.h);
    ctx.closePath();
    ctx.fill();

    // glass edge + reflections
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = 'rgba(200,255,240,0.85)';
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w,h) / 320));
    roundRect(ctx, win.x, win.y, win.w, win.h, win.r);
    ctx.stroke();

    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w,h) / 260));
    ctx.beginPath();
    ctx.moveTo(win.x + win.w*0.10, win.y + win.h*0.16);
    ctx.quadraticCurveTo(win.x + win.w*0.22, win.y + win.h*0.08, win.x + win.w*0.40, win.y + win.h*0.12);
    ctx.stroke();

    ctx.restore();
  }

  function drawHUD(ctx){
    const pad = Math.floor(w * 0.06);

    // Title strip
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, Math.floor(h*0.06), w, Math.floor(h*0.10));

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(230,244,240,0.92)';
    ctx.font = `${Math.floor(font * 1.08)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText('BUG HOTEL LIVE', pad, Math.floor(h*0.11));

    // REC dot
    const recX = pad + Math.floor(font * 13.1);
    const recY = Math.floor(h*0.11);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(255,70,70,0.95)';
    const pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t*3.2));
    ctx.beginPath();
    ctx.arc(recX, recY, Math.max(3, font*0.20)*pulse, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = 'rgba(230,244,240,0.82)';
    ctx.font = `${Math.floor(font * 0.78)}px ui-sans-serif, system-ui`;
    ctx.fillText('REC', recX + Math.floor(font*0.55), recY);

    // time + env
    const ts = fmtMMSS(t);
    const temp = 22 + Math.sin(t*0.12 + 0.8) * 1.6;
    const hum = 64 + Math.sin(t*0.10 + 2.0) * 6.5;
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(230,244,240,0.80)';
    ctx.font = `${Math.floor(font * 0.76)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`T+${ts}   ${temp.toFixed(1)}°C   ${hum.toFixed(0)}%RH`, w - pad, recY);

    ctx.restore();
  }

  function drawPanels(ctx){
    const pad = Math.floor(w * 0.06);
    const panelH = Math.floor(h * 0.18);

    // Field notes (bottom-left)
    const fw = Math.floor(w * 0.44);
    const fx = pad;
    const fy = h - pad - panelH;

    ctx.save();
    ctx.globalAlpha = 0.68;
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    roundRect(ctx, fx + 6, fy + 8, fw, panelH, 14);
    ctx.fill();

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(8,14,14,0.86)';
    roundRect(ctx, fx, fy, fw, panelH, 14);
    ctx.fill();

    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = 'rgba(170,255,220,0.35)';
    ctx.lineWidth = 1;
    roundRect(ctx, fx, fy, fw, panelH, 14);
    ctx.stroke();

    ctx.globalAlpha = 0.90;
    ctx.fillStyle = 'rgba(230,244,240,0.92)';
    ctx.font = `${Math.floor(font * 0.78)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('FIELD NOTES', fx + 16, fy + 30);

    ctx.globalAlpha = 0.88;
    ctx.font = `${Math.floor(font * 0.92)}px ui-sans-serif, system-ui`;
    ctx.fillText(field.title, fx + 16, fy + 58);

    ctx.globalAlpha = 0.65;
    ctx.font = `${Math.floor(font * 0.72)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(field.latin, fx + 16, fy + 80);

    ctx.globalAlpha = 0.78;
    ctx.font = `${Math.floor(font * 0.74)}px ui-sans-serif, system-ui`;
    ctx.fillText(`behavior: ${field.behavior}`, fx + 16, fy + 110);

    ctx.globalAlpha = 0.70;
    ctx.fillText(`note: ${field.note}`, fx + 16, fy + 134);

    // Sightings log (bottom-right)
    const lw = Math.floor(w * 0.34);
    const lx = w - pad - lw;
    const ly = fy;

    ctx.globalAlpha = 0.68;
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    roundRect(ctx, lx + 6, ly + 8, lw, panelH, 14);
    ctx.fill();

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(8,14,14,0.86)';
    roundRect(ctx, lx, ly, lw, panelH, 14);
    ctx.fill();

    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = 'rgba(170,255,220,0.35)';
    ctx.lineWidth = 1;
    roundRect(ctx, lx, ly, lw, panelH, 14);
    ctx.stroke();

    ctx.globalAlpha = 0.90;
    ctx.fillStyle = 'rgba(230,244,240,0.92)';
    ctx.font = `${Math.floor(font * 0.78)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('SIGHTINGS', lx + 16, ly + 30);

    ctx.globalAlpha = 0.72;
    ctx.font = `${Math.floor(font * 0.66)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    for (let i=0;i<Math.min(6, log.length);i++){
      ctx.fillText(log[i], lx + 16, ly + 56 + i * Math.floor(font*0.74));
    }

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx);
    drawTerrarium(ctx);

    // draw critters clipped to window
    ctx.save();
    roundRect(ctx, win.x, win.y, win.w, win.h, win.r);
    ctx.clip();

    // subtle “macro grain”
    ctx.globalAlpha = 0.05;
    for (let i=0;i<220;i++){
      const x = win.x + rand() * win.w;
      const y = win.y + rand() * win.h;
      const r = rand() * 1.6;
      ctx.fillStyle = `rgba(255,255,255,${0.10 + rand()*0.12})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI*2);
      ctx.fill();
    }

    // critters
    ctx.globalAlpha = 0.95;
    for (let i=0;i<critters.length;i++){
      const c = critters[i];
      const s = Math.max(3, Math.min(w, h) * 0.0065 * c.kind.size);
      drawCritter(ctx, c, c.x, c.y, s);
    }

    // spotlight overlay
    if (spotlight){
      const c = critters[spotlight.i];
      const a = 0.65 * (1 - ease(Math.min(1, spotlight.age / 4.2)));
      const s = Math.max(10, Math.min(w, h) * 0.035);

      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = 'rgba(170,255,220,0.85)';
      ctx.lineWidth = Math.max(2, Math.floor(Math.min(w,h) / 260));
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, s*0.9, s*0.55, 0, 0, Math.PI*2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.globalAlpha = a * 0.55;
      ctx.fillStyle = 'rgba(170,255,220,0.25)';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, s*0.9, s*0.55, 0, 0, Math.PI*2);
      ctx.fill();

      ctx.restore();
    }

    ctx.restore();

    drawHUD(ctx);
    drawPanels(ctx);

    // tiny footer hint
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = 'rgba(230,244,240,0.75)';
    ctx.font = `${Math.floor(font * 0.64)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('Macro cam • field-notes auto-update', Math.floor(w*0.06), Math.floor(h*0.93));
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
