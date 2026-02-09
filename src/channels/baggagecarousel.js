// REVIEWED: 2026-02-10
import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }
function lerp(a,b,t){ return a + (b-a)*t; }
function ease(t){ t = clamp(t, 0, 1); return t*t*(3 - 2*t); }

function roundedRect(ctx, x, y, w, h, r){
  r = Math.min(r, w*0.5, h*0.5);
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  let font = 16;
  let small = 12;
  let mono = 13;

  const pal = {
    floorA: '#0f1317',
    floorB: '#111a1f',
    grout: 'rgba(255,255,255,0.06)',
    belt: '#1a232a',
    beltHi: '#2b3a46',
    beltEdge: 'rgba(210,240,255,0.10)',
    metal: '#a7b8c6',
    shadow: 'rgba(0,0,0,0.32)',
    text: 'rgba(235,245,255,0.92)',
    subtext: 'rgba(235,245,255,0.72)',
    accent: '#6cf2ff',
    warn: '#ff4e52',
    warn2: '#ffcf6a',
  };

  const PHASES = [
    { id: 'arrivals', label: 'ARRIVALS' },
    { id: 'rush', label: 'RUSH' },
    { id: 'alert', label: 'ALERT' },
    { id: 'clear', label: 'CLEAR' },
  ];
  const PHASE_DUR = 18;
  const CYCLE_DUR = PHASE_DUR * PHASES.length;

  // carousel layout
  let cx = 0;
  let cy = 0;
  let rx = 0;
  let ry = 0;
  let beltThick = 0;

  // sim
  let beltSpeed = 0.7;
  let phaseIndex = -1;

  const MAX_BAGS = 18;
  let bags = []; // {id,a,s,kind,col,tag,nextTagAt,tagFlip,pres,blink}

  // alert card
  let alert = { a: 0, id: '', dest: '', bag: -1 };
  let nextAlertAt = 0;

  // audio
  let ambience = null;

  const DESTS = [
    'MEL','SYD','BNE','PER','ADL','HBA','CBR','OOL',
    'AKL','WLG','NRT','HND','ICN','SIN','HKG','TPE',
    'LAX','SFO','SEA','YVR','JFK','BOS','CDG','FRA',
  ];

  const BAG_COLS = [
    '#2b2d3a', '#2f1f2b', '#1f2b2a', '#2f2a1f',
    '#3a2222', '#1f2430', '#2a3322', '#2a2033',
  ];

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function regenLayout(){
    cx = w * (0.56 + Math.sin(seed * 0.00001) * 0.02);
    cy = h * 0.60;
    rx = w * 0.30;
    ry = h * 0.20;
    beltThick = Math.max(12, Math.floor(Math.min(w, h) * 0.045));
  }

  function reset(){
    t = 0;
    beltSpeed = 0.7;
    phaseIndex = -1;

    bags = [];
    for (let i = 0; i < MAX_BAGS; i++){
      const kind = pick(rand, ['suitcase','duffel','backpack']);
      const col = pick(rand, BAG_COLS);
      const dest = pick(rand, DESTS);
      bags.push({
        id: i,
        a: rand() * Math.PI * 2,
        s: 0.75 + rand() * 0.55,
        kind,
        col,
        tag: dest,
        nextTagAt: 3 + rand() * 9,
        tagFlip: 0,
        pres: 0,
        blink: 0,
      });
    }

    alert = { a: 0, id: '', dest: '', bag: -1 };
    nextAlertAt = 9 + rand() * 11;
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;

    font = Math.max(14, Math.floor(Math.min(w, h) / 32));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(12, Math.floor(font * 0.86));

    regenLayout();
    reset();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    const n = audio.noiseSource({ type: 'brown', gain: 0.0042 });
    n.start();
    const d = simpleDrone(audio, { root: 47 + rand()*12, detune: 0.65, gain: 0.012 });

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

  function phaseParams(p){
    if (p === 0) return { speed: 0.62, target: 8, label: 'BAGGAGE CLAIM — ARRIVALS' };
    if (p === 1) return { speed: 1.05, target: 14, label: 'BAGGAGE CLAIM — RUSH' };
    if (p === 2) return { speed: 0.86, target: 12, label: 'BAGGAGE CLAIM — CHECK TAGS' };
    return { speed: 0.48, target: 6, label: 'BAGGAGE CLAIM — CLEARING' };
  }

  function update(dt){
    t += dt;

    // phase
    const p = ((t / PHASE_DUR) | 0) % PHASES.length;
    if (p !== phaseIndex){
      phaseIndex = p;
      if (phaseIndex === 1) safeBeep({ freq: 110, dur: 0.08, gain: 0.018, type: 'square' });
      if (phaseIndex === 2) safeBeep({ freq: 160, dur: 0.06, gain: 0.016, type: 'triangle' });
      if (phaseIndex === 3) safeBeep({ freq: 92, dur: 0.08, gain: 0.014, type: 'sine' });
    }

    const pp = phaseParams(phaseIndex);
    beltSpeed = lerp(beltSpeed, pp.speed, 1 - Math.exp(-dt * 1.4));

    // presence targets
    const target = pp.target;
    for (const b of bags){
      const want = b.id < target ? 1 : 0;
      b.pres = clamp(b.pres + (want ? 1 : -1) * dt * 0.65, 0, 1);
      b.tagFlip = Math.max(0, b.tagFlip - dt * 3.5);
      b.blink = Math.max(0, b.blink - dt * 2.0);

      // motion
      const sp = beltSpeed * b.s;
      b.a = (b.a + dt * sp) % (Math.PI * 2);

      // tag flips (deterministic-ish timing)
      if (b.pres > 0.4 && t >= b.nextTagAt){
        b.tagFlip = 1;
        b.tag = pick(rand, DESTS);
        b.nextTagAt = t + (5 + rand() * 11);

        if (audio.enabled && rand() < 0.18) safeBeep({ freq: 520 + rand()*140, dur: 0.03, gain: 0.006, type: 'square' });
      }
    }

    // lost bag alert
    alert.a = Math.max(0, alert.a - dt * 0.55);
    if (t >= nextAlertAt){
      // pick a currently present bag
      const present = bags.filter(b => b.pres > 0.6);
      if (present.length){
        const b = pick(rand, present);
        alert = {
          a: 1,
          id: `BAG ${(b.id + 1).toString().padStart(2,'0')}`,
          dest: b.tag,
          bag: b.id,
        };
        b.blink = 1;
        safeBeep({ freq: 880, dur: 0.06, gain: 0.018, type: 'square' });
        safeBeep({ freq: 440, dur: 0.08, gain: 0.012, type: 'triangle' });
      }
      nextAlertAt = t + 18 + rand() * 18;
    }
  }

  function drawFloor(ctx){
    // base
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal.floorA);
    g.addColorStop(1, pal.floorB);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // tiles
    const tile = Math.max(26, Math.floor(Math.min(w, h) * 0.06));
    ctx.strokeStyle = pal.grout;
    ctx.lineWidth = Math.max(1, Math.floor(dpr));

    const driftX = (t * 4) % tile;
    const driftY = (t * 3) % tile;

    for (let x = -tile; x <= w + tile; x += tile){
      ctx.beginPath();
      ctx.moveTo(x + driftX, 0);
      ctx.lineTo(x + driftX, h);
      ctx.stroke();
    }
    for (let y = -tile; y <= h + tile; y += tile){
      ctx.beginPath();
      ctx.moveTo(0, y + driftY);
      ctx.lineTo(w, y + driftY);
      ctx.stroke();
    }

    // subtle vignette
    const v = ctx.createRadialGradient(w*0.55, h*0.6, Math.min(w,h)*0.1, w*0.55, h*0.6, Math.min(w,h)*0.65);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  function drawCarousel(ctx){
    // shadow blob
    ctx.save();
    ctx.fillStyle = pal.shadow;
    ctx.beginPath();
    ctx.ellipse(cx + w*0.01, cy + h*0.02, rx + beltThick*0.9, ry + beltThick*0.75, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // belt ring
    const beltG = ctx.createLinearGradient(cx-rx, cy-ry-beltThick, cx+rx, cy+ry+beltThick);
    beltG.addColorStop(0, pal.belt);
    beltG.addColorStop(0.5, pal.beltHi);
    beltG.addColorStop(1, pal.belt);

    ctx.fillStyle = beltG;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx + beltThick, ry + beltThick*0.75, 0, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - beltThick*0.25, ry - beltThick*0.25, 0, 0, Math.PI*2);
    ctx.fill();

    // highlight edge
    ctx.strokeStyle = pal.beltEdge;
    ctx.lineWidth = Math.max(1, Math.floor(dpr));
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx + beltThick*0.95, ry + beltThick*0.7, 0, 0, Math.PI*2);
    ctx.stroke();

    // moving belt ticks
    const marks = 46;
    const off = (t * beltSpeed * 0.65) % (Math.PI*2);
    for (let i=0;i<marks;i++){
      const a = (i / marks) * Math.PI * 2 + off;
      const x = cx + Math.cos(a) * (rx + beltThick*0.52);
      const y = cy + Math.sin(a) * (ry + beltThick*0.40);
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      ctx.strokeStyle = `rgba(210,240,255,${0.035 + 0.045*(0.5+0.5*Math.sin(a*2 + t*0.6))})`;
      ctx.lineWidth = Math.max(1, Math.floor(dpr));
      ctx.beginPath();
      ctx.moveTo(x - nx*6, y - ny*6);
      ctx.lineTo(x + nx*6, y + ny*6);
      ctx.stroke();
    }

    // metal post
    const postW = Math.max(16, Math.floor(Math.min(w,h) * 0.028));
    const postH = Math.max(26, Math.floor(Math.min(w,h) * 0.05));
    const px = cx - rx * 0.78;
    const py = cy - ry * 0.05;
    const mg = ctx.createLinearGradient(px, py, px+postW, py+postH);
    mg.addColorStop(0, 'rgba(235,245,255,0.10)');
    mg.addColorStop(0.5, 'rgba(235,245,255,0.24)');
    mg.addColorStop(1, 'rgba(235,245,255,0.07)');
    ctx.fillStyle = mg;
    roundedRect(ctx, px, py, postW, postH, 5);
    ctx.fill();

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    roundedRect(ctx, px + postW*0.18, py + postH*0.18, postW*0.64, postH*0.12, 3);
    ctx.fill();
  }

  function drawBag(ctx, b){
    const a = b.a;
    const x = cx + Math.cos(a) * (rx + beltThick*0.35);
    const y = cy + Math.sin(a) * (ry + beltThick*0.22);

    // tangent orientation
    const rot = a + Math.PI * 0.5;

    const size = Math.min(w, h) * 0.05;
    const bw = size * (0.92 + b.s * 0.2);
    const bh = size * (0.62 + b.s * 0.12);

    const fade = ease(b.pres);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    // drop shadow
    ctx.globalAlpha = 0.35 * fade;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundedRect(ctx, -bw*0.5 + 5, -bh*0.5 + 6, bw, bh, 8);
    ctx.fill();

    ctx.globalAlpha = 1;

    // body
    ctx.globalAlpha = 0.98 * fade;
    ctx.fillStyle = b.col;

    if (b.kind === 'duffel'){
      roundedRect(ctx, -bw*0.55, -bh*0.45, bw*1.1, bh*0.9, 14);
    } else if (b.kind === 'backpack'){
      roundedRect(ctx, -bw*0.5, -bh*0.55, bw, bh*1.1, 14);
    } else {
      roundedRect(ctx, -bw*0.55, -bh*0.5, bw*1.1, bh, 10);
    }
    ctx.fill();

    // seams
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = Math.max(1, Math.floor(dpr));
    ctx.beginPath();
    ctx.moveTo(-bw*0.38, -bh*0.45);
    ctx.lineTo(-bw*0.38, bh*0.45);
    ctx.stroke();

    // handle
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(2, Math.floor(dpr*1.5));
    ctx.beginPath();
    ctx.moveTo(-bw*0.16, -bh*0.52);
    ctx.quadraticCurveTo(0, -bh*0.78, bw*0.16, -bh*0.52);
    ctx.stroke();

    // luggage tag
    const flip = b.tagFlip;
    const tagW = bw * 0.42;
    const tagH = bh * 0.42;
    const tx = bw * 0.46;
    const ty = -bh * 0.10;

    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(1 - 0.22*flip, 1);

    ctx.fillStyle = `rgba(245,246,248,${0.90*fade})`;
    roundedRect(ctx, -tagW*0.5, -tagH*0.5, tagW, tagH, 5);
    ctx.fill();

    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(-tagW*0.5, -tagH*0.02, tagW, Math.max(1, Math.floor(dpr)));

    ctx.font = `${Math.floor(mono * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(10,14,16,0.9)';
    ctx.fillText(b.tag, 0, 0);

    ctx.restore();

    // lost bag highlight
    const hl = (alert.a > 0 && alert.bag === b.id) ? (0.35 + 0.65*(0.5+0.5*Math.sin(t*10))) : b.blink;
    if (hl > 0.001){
      ctx.globalAlpha = fade;
      ctx.strokeStyle = `rgba(255,78,82,${0.35 + hl*0.55})`;
      ctx.lineWidth = Math.max(2, Math.floor(dpr*1.6));
      roundedRect(ctx, -bw*0.58, -bh*0.54, bw*1.16, bh*1.08, 12);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawOverlay(ctx){
    const pp = phaseParams(phaseIndex);

    // OSD title
    const x = w * 0.055;
    const y = h * 0.16;

    ctx.save();
    ctx.textBaseline = 'middle';

    ctx.font = `${Math.floor(mono * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = pal.accent;
    ctx.shadowColor = 'rgba(108,242,255,0.6)';
    ctx.shadowBlur = 14;
    ctx.fillText('CH 07', x, y);

    ctx.shadowBlur = 0;
    ctx.font = `${font}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
    ctx.fillStyle = pal.text;
    ctx.fillText(pp.label, x, y + font*1.2);

    // camera timecode
    ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = pal.subtext;
    const hh = ((t / 3600) | 0) % 24;
    const mm = ((t / 60) | 0) % 60;
    const ss = (t | 0) % 60;
    const tc = `${hh.toString().padStart(2,'0')}:${mm.toString().padStart(2,'0')}:${ss.toString().padStart(2,'0')}`;
    ctx.fillText(`CAM 2  •  ${tc}`, x, y + font*1.2 + small*1.4);

    ctx.restore();

    // alert card
    if (alert.a > 0){
      const a = ease(alert.a);
      const cw = Math.min(w * 0.42, 420);
      const ch = Math.min(h * 0.18, 140);
      const cx0 = w - cw - w*0.05;
      const cy0 = h * 0.12;

      const pop = 1 - (1-a)*(1-a);
      const yoff = (1-pop) * 18;
      const blink = 0.6 + 0.4 * (0.5 + 0.5*Math.sin(t*14));

      ctx.save();
      ctx.globalAlpha = 0.92 * a;
      ctx.fillStyle = `rgba(10,12,14,${0.85*blink})`;
      roundedRect(ctx, cx0, cy0 + yoff, cw, ch, 14);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.strokeStyle = `rgba(255,78,82,${0.7*blink})`;
      ctx.lineWidth = Math.max(2, Math.floor(dpr*1.5));
      roundedRect(ctx, cx0, cy0 + yoff, cw, ch, 14);
      ctx.stroke();

      ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillStyle = `rgba(255,78,82,${0.95*blink})`;
      ctx.textBaseline = 'middle';
      ctx.fillText('LOST BAG ALERT', cx0 + 18, cy0 + yoff + 22);

      ctx.font = `${font}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
      ctx.fillStyle = pal.text;
      ctx.fillText(alert.id, cx0 + 18, cy0 + yoff + 56);

      ctx.font = `${Math.floor(font * 0.95)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
      ctx.fillStyle = pal.subtext;
      ctx.fillText(`TAG: ${alert.dest}`, cx0 + 18, cy0 + yoff + 84);

      ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillStyle = `rgba(255,207,106,${0.8})`;
      ctx.fillText('PLEASE CHECK DISPLAY', cx0 + 18, cy0 + yoff + 112);

      ctx.restore();
    }
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawFloor(ctx);
    drawCarousel(ctx);

    // bags
    for (const b of bags){
      if (b.pres <= 0.01) continue;
      drawBag(ctx, b);
    }

    drawOverlay(ctx);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
