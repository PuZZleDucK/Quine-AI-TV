import { mulberry32 } from '../util/prng.js';

// Found Footage: Miniature Worlds
// Diorama scenes shot like a documentary: labels, scale bars, gentle pans.

function pick(rand, a){ return a[(rand() * a.length) | 0]; }
function lerp(a,b,t){ return a + (b-a)*t; }
function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }

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

function fmtTimecode(sec){
  const s = Math.max(0, Math.floor(sec));
  const hh = Math.floor(s/3600);
  const mm = Math.floor((s%3600)/60);
  const ss = s%60;
  return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

const WORLDS = [
  { id:'alley', title:'Diorama: Service Alley', scale:'1:48', hue: 210, tags:['WARNING: WET PAINT','PROP: CRATE','SUBJECT: CAT(?)','MARK: CHALK LINE'] },
  { id:'forest', title:'Diorama: Mossy Forest', scale:'1:35', hue: 120, tags:['SUBJECT: STUMP','SPECIMEN: FERN','MARK: STRING GRID','NOTE: SAFE TO TOUCH'] },
  { id:'workshop', title:'Diorama: Tiny Workshop', scale:'1:24', hue: 28, tags:['TOOL: SPANNER','PROP: BOLT JAR','NOTE: GREASE','SUBJECT: ROBOT ARM'] },
  { id:'moon', title:'Diorama: Moon Base', scale:'1:72', hue: 265, tags:['SUBJECT: AIRLOCK','HAZARD: DUST','MARK: ROUTE','PROP: ROVER'] },
  { id:'kitchen', title:'Diorama: Countertop City', scale:'1:87', hue: 12, tags:['SUBJECT: BRIDGE','PROP: SPOON','NOTE: STEAM','MARK: TAPE'] },
];

function makeObjectsForWorld(rand, world){
  const objs = [];

  // base ground features
  const n = 18 + ((rand()*10)|0);
  for (let i=0;i<n;i++){
    objs.push({
      kind: (rand()<0.55) ? 'pebble' : 'tuft',
      x: rand()*1.0,
      y: 0.55 + rand()*0.40,
      s: 0.6 + rand()*1.6,
      a: rand()*Math.PI*2,
    });
  }

  // “hero” props (varies by world)
  const hero = [];
  if (world.id==='alley') hero.push('bin','lamp','door','pipe');
  if (world.id==='forest') hero.push('stump','log','mushroom','rock');
  if (world.id==='workshop') hero.push('bench','toolbox','vise','robot');
  if (world.id==='moon') hero.push('dome','antenna','rover','crate');
  if (world.id==='kitchen') hero.push('cup','spoon','tower','bridge');

  const hn = 5 + ((rand()*3)|0);
  for (let i=0;i<hn;i++){
    const k = hero[i % hero.length];
    objs.push({
      kind: k,
      x: 0.12 + rand()*0.76,
      y: 0.34 + rand()*0.40,
      s: 0.75 + rand()*1.20,
      a: (rand()*2-1)*0.25,
    });
  }

  // background silhouettes
  const bn = 6 + ((rand()*5)|0);
  for (let i=0;i<bn;i++){
    objs.push({
      kind: (world.id==='forest') ? 'tree' : (world.id==='moon' ? 'ridge' : 'block'),
      x: -0.05 + rand()*1.10,
      y: 0.05 + rand()*0.30,
      s: 0.8 + rand()*1.4,
      a: (rand()*2-1)*0.2,
    });
  }

  return objs;
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w=0, h=0, t=0;
  let font=16, small=12;

  const SEG_DUR = 85;
  let segT = 0;
  let idx = 0;
  let order = [];

  // per-segment
  let world = WORLDS[0];
  let pal = null;
  let objs = [];

  // camera move
  let cam0 = { x: 0.5, y: 0.5, z: 1.0 };
  let cam1 = { x: 0.5, y: 0.5, z: 1.0 };
  let shake = 0;

  // overlay
  let tagA = '';
  let tagB = '';
  let tagC = '';
  let tcBase = 0;

  // film grain points (screen space)
  let grain = [];

  // audio handle
  let ah = null;

  function shuffled(arr){
    const a = [...arr];
    for (let i=a.length-1;i>0;i--){
      const j = (rand()*(i+1))|0;
      const tmp=a[i]; a[i]=a[j]; a[j]=tmp;
    }
    return a;
  }

  function buildPalette(){
    const base = (world.hue + (rand()*14-7) + 360) % 360;
    const hi = (base + 195 + rand()*45) % 360;
    return {
      bg0: `hsla(${(base+8)%360}, 42%, 12%, 1)`,
      bg1: `hsla(${(base+22)%360}, 52%, 5%, 1)`,
      fog: `hsla(${hi}, 65%, 74%, 0.11)`,
      ink: `hsla(${hi}, 70%, 84%, 0.92)`,
      inkDim: `hsla(${hi}, 55%, 82%, 0.68)`,
      uiDark: 'rgba(0,0,0,0.35)',
      red: 'rgba(255,70,70,0.92)',
      paper: 'rgba(245,250,255,0.08)',
    };
  }

  function reseedSegment(){
    world = order[idx] || WORLDS[0];
    pal = buildPalette();
    objs = makeObjectsForWorld(rand, world);

    // choose a gentle camera pan across a safe region
    cam0 = { x: 0.25 + rand()*0.50, y: 0.28 + rand()*0.50, z: 1.06 + rand()*0.12 };
    cam1 = { x: 0.25 + rand()*0.50, y: 0.28 + rand()*0.50, z: 1.00 + rand()*0.12 };
    shake = rand()*10;

    tagA = pick(rand, world.tags);
    tagB = pick(rand, world.tags);
    tagC = pick(rand, world.tags);
    if (tagB===tagA) tagB = pick(rand, world.tags);
    if (tagC===tagA || tagC===tagB) tagC = pick(rand, world.tags);

    tcBase = Math.floor(rand()*3600);

    if (audio.enabled){
      // tiny “camera cue”
      audio.beep({ freq: 640 + rand()*120, dur: 0.030, gain: 0.012, type: 'triangle' });
      audio.beep({ freq: 340 + rand()*90, dur: 0.020, gain: 0.010, type: 'sine' });
    }
  }

  function nextSegment(){
    idx = (idx + 1) % order.length;
    segT = 0;
    reseedSegment();
  }

  function init({ width, height }){
    w = width; h = height; t = 0; segT = 0;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));

    // film grain points
    const gn = Math.floor(900 * (w*h) / (960*540));
    grain = Array.from({ length: gn }, ()=>({
      x: rand()*w, y: rand()*h,
      a: 0.06 + rand()*0.12,
      s: 0.5 + rand()*1.2,
      ph: rand()*10,
    }));

    order = shuffled(WORLDS);
    idx = 0;
    reseedSegment();
  }

  function onResize(width, height){
    w = width; h = height;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));
  }

  function makeAudioHandle(){
    const ctx = audio.ensure();

    const out = ctx.createGain();
    out.gain.value = 0.75;
    out.connect(audio.master);

    // “tape hiss”
    const noise = audio.noiseSource({ type: 'pink', gain: 0.020 });

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.9;

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 5200;
    lpf.Q.value = 0.5;

    noise.src.disconnect();
    noise.src.connect(noise.gain);
    noise.gain.disconnect();
    noise.gain.connect(bp);
    bp.connect(lpf);
    lpf.connect(out);

    // faint motor hum
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 58 + rand()*9;
    og.gain.value = 0.010;
    o.connect(og);
    og.connect(out);

    noise.start();
    o.start();

    return {
      stop(){
        const now = ctx.currentTime;
        try { out.gain.setTargetAtTime(0.0001, now, 0.10); } catch {}
        try { noise.stop(); } catch {}
        try { o.stop(now + 0.25); } catch {}
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
    if (segT >= SEG_DUR) nextSegment();

    // occasional tiny “tracking noise” beeps (very subtle)
    if (audio.enabled && (Math.sin(t*0.13 + shake) > 0.9994)){
      audio.beep({ freq: 2000 + rand()*600, dur: 0.012, gain: 0.004, type: 'square' });
    }
  }

  function drawBackdrop(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal.bg0);
    g.addColorStop(1, pal.bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // fog / light leak
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 1;
    for (let i=0;i<3;i++){
      const x = w*(0.15 + i*0.33) + Math.sin(t*0.08 + i)*w*0.06;
      const y = h*(0.25 + i*0.12) + Math.cos(t*0.06 + i)*h*0.05;
      const r = Math.max(w,h)*(0.35 + i*0.05);
      const rr = ctx.createRadialGradient(x, y, 0, x, y, r);
      rr.addColorStop(0, pal.fog);
      rr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rr;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();

    // vignette
    const vg = ctx.createRadialGradient(w*0.5, h*0.45, 0, w*0.5, h*0.45, Math.max(w,h)*0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.68)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  function drawMiniThing(ctx, k, x, y, s, ang){
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.scale(s, s);

    const shadow = 'rgba(0,0,0,0.35)';
    const ink = 'rgba(245,250,255,0.12)';
    const solid = 'rgba(0,0,0,0.22)';

    function box(w,h){
      ctx.fillStyle = solid;
      ctx.fillRect(-w/2, -h/2, w, h);
      ctx.fillStyle = ink;
      ctx.fillRect(-w/2, -h/2, w, Math.max(2, h*0.15));
    }

    // drop shadow
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.ellipse(0, 18, 26, 10, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    if (k==='tree'){
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(-6, -10, 12, 40);
      ctx.fillStyle = 'rgba(245,250,255,0.10)';
      ctx.beginPath();
      ctx.arc(0, -14, 26, 0, Math.PI*2);
      ctx.fill();
    } else if (k==='ridge'){
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.moveTo(-40, 20);
      ctx.lineTo(-10, -10);
      ctx.lineTo(20, 10);
      ctx.lineTo(50, -6);
      ctx.lineTo(60, 20);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = 'rgba(245,250,255,0.10)';
      ctx.fillRect(-40, 12, 100, 6);
    } else if (k==='block'){
      box(52, 70);
    } else if (k==='bin'){
      box(40, 46);
      ctx.fillStyle = 'rgba(245,250,255,0.08)';
      ctx.fillRect(-20, -23, 40, 8);
    } else if (k==='lamp'){
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(-3, -24, 6, 56);
      ctx.fillStyle = 'rgba(245,250,255,0.13)';
      ctx.beginPath();
      ctx.arc(0, -26, 10, 0, Math.PI*2);
      ctx.fill();
    } else if (k==='door'){
      box(46, 72);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(8, -18, 6, 6);
    } else if (k==='pipe'){
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(-16, -34, 32, 78);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = 'rgba(245,250,255,0.10)';
      ctx.fillRect(-16, -34, 8, 78);
    } else if (k==='stump'){
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath();
      ctx.ellipse(0, 8, 26, 20, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = 'rgba(245,250,255,0.11)';
      ctx.beginPath();
      ctx.ellipse(0, -8, 24, 16, 0, 0, Math.PI*2);
      ctx.fill();
    } else if (k==='log'){
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.beginPath();
      ctx.ellipse(0, 8, 42, 16, 0.1, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = 'rgba(245,250,255,0.10)';
      ctx.fillRect(-40, 0, 80, 6);
    } else if (k==='mushroom'){
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(-6, -6, 12, 28);
      ctx.fillStyle = 'rgba(245,250,255,0.12)';
      ctx.beginPath();
      ctx.ellipse(0, -12, 20, 12, 0, 0, Math.PI*2);
      ctx.fill();
    } else if (k==='rock'){
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.beginPath();
      ctx.ellipse(0, 10, 28, 18, -0.2, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = 'rgba(245,250,255,0.10)';
      ctx.beginPath();
      ctx.ellipse(-6, 4, 10, 6, 0, 0, Math.PI*2);
      ctx.fill();
    } else if (k==='bench'){
      box(86, 36);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-38, 18, 10, 28);
      ctx.fillRect(28, 18, 10, 28);
    } else if (k==='toolbox'){
      box(58, 40);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-22, -8, 44, 5);
    } else if (k==='vise'){
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(-18, -10, 36, 26);
      ctx.fillRect(-8, 16, 16, 22);
      ctx.globalAlpha = 0.30;
      ctx.fillStyle = 'rgba(245,250,255,0.10)';
      ctx.fillRect(-18, -10, 12, 26);
    } else if (k==='robot'){
      box(46, 56);
      ctx.fillStyle = 'rgba(245,250,255,0.14)';
      ctx.fillRect(-10, -10, 8, 8);
      ctx.fillRect(2, -10, 8, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(-22, 24, 10, 24);
      ctx.fillRect(12, 24, 10, 24);
    } else if (k==='dome'){
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.beginPath();
      ctx.arc(0, 10, 32, Math.PI, 0);
      ctx.lineTo(32, 10);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = 'rgba(245,250,255,0.10)';
      ctx.beginPath();
      ctx.arc(0, 10, 22, Math.PI, 0);
      ctx.strokeStyle = 'rgba(245,250,255,0.10)';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else if (k==='antenna'){
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(-3, -28, 6, 70);
      ctx.beginPath();
      ctx.moveTo(-24, -18);
      ctx.lineTo(0, -30);
      ctx.lineTo(24, -18);
      ctx.closePath();
      ctx.fill();
    } else if (k==='rover'){
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(-26, -8, 52, 26);
      ctx.fillRect(-14, -18, 28, 12);
      ctx.fillStyle = 'rgba(245,250,255,0.10)';
      ctx.fillRect(-24, -6, 48, 6);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let i=-2;i<=2;i+=2){
        ctx.beginPath();
        ctx.arc(i*14, 20, 8, 0, Math.PI*2);
        ctx.fill();
      }
    } else if (k==='crate'){
      box(54, 44);
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = 'rgba(245,250,255,0.10)';
      ctx.lineWidth = 3;
      ctx.strokeRect(-27, -22, 54, 44);
    } else if (k==='cup'){
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath();
      ctx.ellipse(0, 6, 22, 18, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 0.30;
      ctx.strokeStyle = 'rgba(245,250,255,0.12)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(18, 2, 10, -0.4, 1.2);
      ctx.stroke();
    } else if (k==='spoon'){
      ctx.fillStyle = 'rgba(0,0,0,0.26)';
      ctx.beginPath();
      ctx.ellipse(-12, 0, 18, 12, -0.2, 0, Math.PI*2);
      ctx.fill();
      ctx.fillRect(0, -3, 46, 6);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = 'rgba(245,250,255,0.10)';
      ctx.fillRect(0, -3, 12, 6);
    } else if (k==='tower'){
      box(46, 92);
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = 'rgba(245,250,255,0.10)';
      ctx.fillRect(-23, -46, 46, 10);
    } else if (k==='bridge'){
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(-60, 0, 120, 14);
      ctx.beginPath();
      ctx.arc(-35, 14, 22, Math.PI, 0);
      ctx.arc(35, 14, 22, Math.PI, 0);
      ctx.fill();
      ctx.globalAlpha = 0.20;
      ctx.fillStyle = 'rgba(245,250,255,0.10)';
      ctx.fillRect(-60, 0, 120, 5);
    } else if (k==='tuft'){
      ctx.strokeStyle = 'rgba(245,250,255,0.12)';
      ctx.lineWidth = 2;
      for (let i=0;i<3;i++){
        ctx.beginPath();
        ctx.moveTo(-6 + i*6, 10);
        ctx.quadraticCurveTo(-6 + i*6, -8, -10 + i*6, -14);
        ctx.stroke();
      }
    } else {
      // pebble
      ctx.fillStyle = 'rgba(245,250,255,0.10)';
      ctx.beginPath();
      ctx.ellipse(0, 10, 10, 7, 0.2, 0, Math.PI*2);
      ctx.fill();
    }

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    drawBackdrop(ctx);

    // “camera frame”
    const s = Math.min(w, h);
    const frameW = Math.floor(w * 0.76);
    const frameH = Math.floor(h * 0.72);
    const frameX = Math.floor((w - frameW) * 0.5);
    const frameY = Math.floor((h - frameH) * 0.5);
    const r = Math.floor(s * 0.03);

    // drop shadow
    ctx.save();
    ctx.globalAlpha = 0.70;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, frameX + 10, frameY + 14, frameW, frameH, r);
    ctx.fill();
    ctx.restore();

    // frame
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, frameX, frameY, frameW, frameH, r);
    ctx.fill();

    // inner window
    const pad = Math.floor(font * 1.0);
    const winX = frameX + pad;
    const winY = frameY + Math.floor(font*2.2);
    const winW = frameW - pad*2;
    const winH = frameH - Math.floor(font*3.2) - pad;

    // header band
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(frameX, frameY, frameW, Math.floor(font*2.1));

    // clip to window
    roundRect(ctx, winX, winY, winW, winH, Math.floor(font*0.9));
    ctx.clip();

    // world-to-window camera
    const camT = clamp(segT / SEG_DUR, 0, 1);
    // ease in/out
    const ee = camT*camT*(3 - 2*camT);
    const cx = lerp(cam0.x, cam1.x, ee);
    const cY = lerp(cam0.y, cam1.y, ee);
    const cz = lerp(cam0.z, cam1.z, ee);

    const wobX = Math.sin(t*0.9 + shake) * 0.002;
    const wobY = Math.cos(t*0.8 + shake) * 0.002;

    const worldW = 1000;
    const worldH = 650;

    // compute camera top-left in world px
    const viewW = worldW / cz;
    const viewH = worldH / cz;
    let camPx = (cx + wobX) * worldW - viewW/2;
    let camPy = (cY + wobY) * worldH - viewH/2;
    camPx = clamp(camPx, 0, worldW - viewW);
    camPy = clamp(camPy, 0, worldH - viewH);

    // map world -> window
    const sx = winW / viewW;
    const sy = winH / viewH;

    ctx.save();
    ctx.translate(winX, winY);
    ctx.scale(sx, sy);
    ctx.translate(-camPx, -camPy);

    // diorama base + backdrop
    const bg = ctx.createLinearGradient(0, 0, 0, worldH);
    bg.addColorStop(0, 'rgba(255,255,255,0.05)');
    bg.addColorStop(1, 'rgba(0,0,0,0.10)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, worldW, worldH);

    // horizon band
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(0, worldH*0.38, worldW, worldH*0.05);
    ctx.globalAlpha = 1;

    // floor
    const floorY = worldH*0.50;
    const fg = ctx.createLinearGradient(0, floorY, 0, worldH);
    fg.addColorStop(0, 'rgba(0,0,0,0.10)');
    fg.addColorStop(1, 'rgba(0,0,0,0.24)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, floorY, worldW, worldH-floorY);

    // grid lines (tiny scale cue)
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    for (let x=0; x<=worldW; x+=80){
      ctx.beginPath();
      ctx.moveTo(x, floorY);
      ctx.lineTo(x, worldH);
      ctx.stroke();
    }
    for (let y=floorY; y<=worldH; y+=60){
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(worldW, y);
      ctx.stroke();
    }
    ctx.restore();

    // draw objects (background first)
    const sorted = [...objs].sort((a,b)=>a.y-b.y);
    for (const o of sorted){
      const px = o.x * worldW;
      const py = o.y * worldH;
      const ss = (0.65 + o.s*0.55);
      const aa = o.a || 0;
      const yy = (o.kind==='tree' || o.kind==='ridge' || o.kind==='block') ? (py - 220) : py;
      drawMiniThing(ctx, o.kind, px, yy, ss, aa);
    }

    // subtle depth blur overlay (fake)
    ctx.save();
    ctx.globalAlpha = 0.12;
    const blur = ctx.createLinearGradient(0, floorY, 0, worldH);
    blur.addColorStop(0, 'rgba(0,0,0,0)');
    blur.addColorStop(1, 'rgba(0,0,0,0.40)');
    ctx.fillStyle = blur;
    ctx.fillRect(0, floorY, worldW, worldH-floorY);
    ctx.restore();

    ctx.restore(); // world transform

    // scanlines (inside window)
    ctx.save();
    ctx.globalAlpha = 0.09;
    ctx.fillStyle = 'rgba(0,0,0,0.60)';
    for (let y=0;y<winH;y+=3){
      if ((y/3|0)%2===0) ctx.fillRect(winX, winY+y, winW, 1);
    }
    ctx.restore();

    // window border
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = Math.max(2, Math.floor(s*0.003));
    roundRect(ctx, winX, winY, winW, winH, Math.floor(font*0.9));
    ctx.stroke();
    ctx.restore();

    ctx.restore(); // frame clip

    // overlay text
    ctx.save();
    ctx.fillStyle = pal.ink;
    ctx.font = `${Math.floor(font*1.05)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';

    const headY = frameY + Math.floor(font*1.05);

    // REC indicator
    const blink = (Math.sin(t*2.4) > 0.2) ? 1 : 0;
    ctx.fillStyle = blink ? pal.red : 'rgba(255,70,70,0.25)';
    ctx.beginPath();
    ctx.arc(frameX + pad, headY, Math.floor(font*0.25), 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = pal.ink;
    ctx.fillText('REC', frameX + pad + Math.floor(font*0.55), headY);

    // title
    ctx.fillStyle = pal.inkDim;
    ctx.fillText('FOUND FOOTAGE UNIT', frameX + pad + Math.floor(font*3.0), headY);

    ctx.fillStyle = pal.ink;
    ctx.font = `${Math.floor(font*0.98)}px ui-sans-serif, system-ui`;
    ctx.fillText(world.title, frameX + pad, frameY + Math.floor(font*1.85));

    // timecode + scale
    ctx.font = `${Math.floor(font*0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const tc = fmtTimecode(tcBase + segT);
    const rightX = frameX + frameW - pad;
    ctx.textAlign = 'right';
    ctx.fillStyle = pal.ink;
    ctx.fillText(tc, rightX, headY);
    ctx.fillStyle = pal.inkDim;
    ctx.fillText(`SCALE ${world.scale}`, rightX, frameY + Math.floor(font*1.85));
    ctx.textAlign = 'left';

    // scale bar (bottom)
    const sbY = frameY + frameH - Math.floor(font*1.25);
    const sbX = frameX + pad;
    const sbW = Math.floor(frameW*0.16);
    ctx.save();
    ctx.globalAlpha = 0.80;
    ctx.fillStyle = pal.uiDark;
    roundRect(ctx, sbX - Math.floor(font*0.4), sbY - Math.floor(font*0.55), sbW + Math.floor(font*3.1), Math.floor(font*1.1), 10);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.ink;
    ctx.fillRect(sbX, sbY, sbW, Math.floor(font*0.12));
    ctx.fillRect(sbX, sbY - Math.floor(font*0.22), Math.floor(font*0.12), Math.floor(font*0.55));
    ctx.fillRect(sbX + sbW - Math.floor(font*0.12), sbY - Math.floor(font*0.22), Math.floor(font*0.12), Math.floor(font*0.55));
    ctx.fillStyle = pal.inkDim;
    ctx.font = `${Math.floor(small*0.90)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('1 cm', sbX + sbW + Math.floor(font*0.55), sbY + 1);
    ctx.restore();

    // annotation chips
    const chips = [tagA, tagB, tagC];
    const chipY0 = frameY + Math.floor(font*2.55);
    let cy = chipY0;
    ctx.font = `${Math.floor(small*0.92)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    for (let i=0;i<chips.length;i++){
      const text = chips[i];
      const tw = Math.ceil(ctx.measureText(text).width);
      ctx.save();
      ctx.globalAlpha = 0.78;
      ctx.fillStyle = pal.uiDark;
      roundRect(ctx, frameX + pad, cy, tw + Math.floor(font*1.0), Math.floor(small*1.55), 10);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = pal.ink;
      ctx.textBaseline = 'middle';
      ctx.fillText(text, frameX + pad + Math.floor(font*0.5), cy + Math.floor(small*0.78));
      ctx.restore();
      cy += Math.floor(small*1.85);
    }

    // focus reticle (center)
    const fx = Math.floor(frameX + frameW*0.5);
    const fy = Math.floor(winY + winH*0.52);
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(fx, fy, Math.floor(font*1.2), 0, Math.PI*2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(fx - Math.floor(font*1.8), fy);
    ctx.lineTo(fx - Math.floor(font*0.8), fy);
    ctx.moveTo(fx + Math.floor(font*0.8), fy);
    ctx.lineTo(fx + Math.floor(font*1.8), fy);
    ctx.moveTo(fx, fy - Math.floor(font*1.8));
    ctx.lineTo(fx, fy - Math.floor(font*0.8));
    ctx.moveTo(fx, fy + Math.floor(font*0.8));
    ctx.lineTo(fx, fy + Math.floor(font*1.8));
    ctx.stroke();
    ctx.restore();

    // film grain (screen space)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const g of grain){
      const tw2 = 0.5 + 0.5*Math.sin(t*1.2 + g.ph);
      const a = g.a * (0.7 + 0.6*tw2);
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(g.x, g.y, g.s, g.s);
    }
    ctx.restore();

    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
