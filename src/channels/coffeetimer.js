import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

// REVIEWED: 2026-02-10

function pick(rand, a){ return a[(rand() * a.length) | 0]; }
function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

function fmt(sec){
  sec = Math.max(0, Math.ceil(sec));
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function roundRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, w / 2, h / 2);
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

  const METHODS = [
    {
      id: 'v60',
      name: 'V60 POUR OVER',
      caption: 'slow circles • steady kettle • clean cup',
      spec: ['18g dose', '300g water', 'grind: medium-fine'],
      steps: [
        { label: 'bloom + swirl', dur: 30 },
        { label: 'pour to 150g', dur: 45 },
        { label: 'pour to 300g', dur: 45 },
        { label: 'drawdown', dur: 60 },
      ],
      tick: { freq: 520, gain: 0.006 },
    },
    {
      id: 'aeropress',
      name: 'AEROPRESS',
      caption: 'stir • steep • smooth plunge',
      spec: ['15g dose', '210g water', 'grind: medium'],
      steps: [
        { label: 'pour + stir', dur: 20 },
        { label: 'steep', dur: 60 },
        { label: 'flip + plunge', dur: 30 },
        { label: 'dilute / enjoy', dur: 20 },
      ],
      tick: { freq: 640, gain: 0.006 },
    },
    {
      id: 'frenchpress',
      name: 'FRENCH PRESS',
      caption: 'coarse grind • wait • gentle press',
      spec: ['30g dose', '500g water', 'grind: coarse'],
      steps: [
        { label: 'bloom + stir', dur: 20 },
        { label: 'steep', dur: 240 },
        { label: 'press slowly', dur: 30 },
        { label: 'settle', dur: 20 },
      ],
      tick: { freq: 420, gain: 0.006 },
    },
    {
      id: 'mokapot',
      name: 'MOKA POT',
      caption: 'keep it low • listen for sputter',
      spec: ['basket: fill', 'water: to valve', 'heat: low'],
      steps: [
        { label: 'warm up', dur: 45 },
        { label: 'extraction', dur: 75 },
        { label: 'kill heat', dur: 15 },
        { label: 'serve', dur: 20 },
      ],
      tick: { freq: 560, gain: 0.006 },
    },
  ];

  const STATIONS = [
    { freq: '88.3', call: 'WQNE', tag: 'late-night kettle' },
    { freq: '91.7', call: 'CFR', tag: 'brew prompts + lo-fi' },
    { freq: '94.9', call: 'KOFF', tag: 'clean pours only' },
    { freq: '101.2', call: 'DRIP', tag: 'steady timers' },
    { freq: '106.6', call: 'MUG', tag: 'warm cups' },
  ];

  const TRACKS = [
    'LO-FI POUR OVER',
    'STEAM ROOM AMBIENCE',
    'FILTER PAPER FUNK',
    'MIDNIGHT MUG GROOVE',
    'CAFÉ WINDOW RAIN',
    'SPOON TAP SHUFFLE',
    'LATTE LINE STUDY',
  ];

  let w = 0, h = 0, dpr = 1;
  let t = 0;

  let font = 16;
  let small = 12;
  let big = 48;

  let method = pick(rand, METHODS);
  let station = pick(rand, STATIONS);
  let track = pick(rand, TRACKS);

  let stepIndex = 0;
  let stepT = 0;
  let loopT = 0;

  // audio
  let ambience = null;
  let tickAcc = 0;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function methodTotal(m){ return m.steps.reduce((a, s) => a + s.dur, 0); }

  function nextMethod(){
    const old = method?.id;
    let m = pick(rand, METHODS);
    if (m.id === old) m = pick(rand, METHODS);
    method = m;

    station = pick(rand, STATIONS);
    track = pick(rand, TRACKS);

    stepIndex = 0;
    stepT = 0;
    loopT = 0;

    // tiny dial click
    safeBeep({ freq: 460 + rand()*80, dur: 0.015, gain: 0.010, type: 'square' });
  }

  function curStep(){ return method.steps[stepIndex] || method.steps[0]; }
  function nextStep(){ return method.steps[(stepIndex + 1) % method.steps.length]; }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.80));
    big = Math.max(44, Math.floor(Math.min(w, h) / 8.6));

    stepIndex = 0;
    stepT = 0;
    loopT = 0;

    tickAcc = 0;

    // deterministically pick initial content from seed
    method = METHODS[(seed >>> 2) % METHODS.length];
    station = STATIONS[(seed >>> 6) % STATIONS.length];
    track = TRACKS[(seed >>> 10) % TRACKS.length];
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function stopAmbience({ clearCurrent=false }={}){
    const handle = ambience;
    if (!handle) return;

    const isCurrent = audio.current === handle;

    if (clearCurrent && isCurrent){
      // clears audio.current and stops via handle.stop()
      audio.stopCurrent();
    } else {
      try{ handle?.stop?.(); } catch {}
    }

    ambience = null;
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // defensively stop any existing ambience we started
    stopAmbience({ clearCurrent: true });

    // very quiet café room tone
    const n = audio.noiseSource({ type: 'pink', gain: 0.004 });
    n.start();
    const d = simpleDrone(audio, { root: 55 + rand()*18, detune: 0.7, gain: 0.015 });

    const handle = {
      stop(){
        try{ n.stop(); } catch {}
        try{ d.stop(); } catch {}
      }
    };

    ambience = handle;
    audio.setCurrent(handle);
  }

  function onAudioOff(){
    // stop/clear everything we own; only clear AudioManager.current if it's ours
    stopAmbience({ clearCurrent: true });
  }

  function destroy(){
    stopAmbience({ clearCurrent: true });
  }

  function update(dt){
    t += dt;
    stepT += dt;
    loopT += dt;

    const s = curStep();
    if (stepT >= s.dur){
      stepT = 0;
      stepIndex += 1;

      // step change: soft click
      safeBeep({ freq: method.tick.freq + rand()*60, dur: 0.02, gain: method.tick.gain, type: 'triangle' });

      if (stepIndex >= method.steps.length){
        // little station ID + switch method
        safeBeep({ freq: 880 + rand()*80, dur: 0.02, gain: 0.009, type: 'square' });
        safeBeep({ freq: 660 + rand()*60, dur: 0.02, gain: 0.008, type: 'square' });
        nextMethod();
      }
    }

    // metronome-ish ticks: subtle, not constant
    if (audio.enabled){
      const baseRate = method.id === 'frenchpress' ? 0.65 : 0.85;
      tickAcc += dt * baseRate;
      while (tickAcc >= 1){
        tickAcc -= 1;
        if (rand() < 0.70) safeBeep({ freq: 980 + rand()*60, dur: 0.008, gain: 0.0045, type: 'square' });
      }
    } else {
      tickAcc = 0;
    }
  }

  function bg(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const g = ctx.createRadialGradient(w*0.48, h*0.35, 0, w*0.5, h*0.5, Math.max(w, h)*0.85);
    g.addColorStop(0, '#2a1a12');
    g.addColorStop(0.45, '#0b0a0a');
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // warm grain
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = 'rgba(255, 210, 170, 1)';
    const step = Math.max(3, Math.floor(Math.min(w, h) / 90));
    for (let y=0; y<h; y+=step){
      if (((y/step)|0) % 2 === 0) ctx.fillRect(0, y, w, 1);
    }
    ctx.restore();

    // vignette
    ctx.save();
    const vg = ctx.createRadialGradient(w*0.5, h*0.45, Math.min(w,h)*0.12, w*0.5, h*0.45, Math.max(w,h)*0.70);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function header(ctx){
    const pad = Math.floor(Math.min(w, h) * 0.06);
    const hh = Math.max(54, Math.floor(font * 2.4));

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(12, 10, 10, 0.78)';
    roundRect(ctx, pad, pad, w - pad*2, hh, 18);
    ctx.fill();

    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = 'rgba(255, 215, 160, 0.65)';
    ctx.lineWidth = 2;
    roundRect(ctx, pad, pad, w - pad*2, hh, 18);
    ctx.stroke();

    const flick = 0.86 + 0.14 * (0.5 + 0.5*Math.sin(t*1.9 + seed*0.0007));

    ctx.globalAlpha = 0.95 * flick;
    ctx.fillStyle = 'rgba(241, 236, 228, 0.95)';
    ctx.font = `800 ${font}px ui-sans-serif, system-ui, -apple-system`;
    ctx.textBaseline = 'top';
    ctx.fillText('COFFEE TIMER RADIO', pad + Math.floor(font*0.9), pad + Math.floor(font*0.45));

    ctx.globalAlpha = 0.72 * flick;
    ctx.fillStyle = 'rgba(241, 236, 228, 0.75)';
    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`${station.freq} FM  •  ${station.call}  •  ${station.tag}`, pad + Math.floor(font*0.9), pad + Math.floor(font*1.6));

    ctx.textAlign = 'right';
    ctx.globalAlpha = 0.78 * flick;
    ctx.fillStyle = 'rgba(255, 210, 150, 0.82)';
    ctx.font = `700 ${small}px ui-sans-serif, system-ui`;
    ctx.fillText(method.name, w - pad - Math.floor(font*0.9), pad + Math.floor(font*0.55));

    ctx.globalAlpha = 0.60 * flick;
    ctx.fillStyle = 'rgba(241, 236, 228, 0.65)';
    ctx.font = `${Math.max(10, Math.floor(small*0.92))}px ui-sans-serif, system-ui`;
    ctx.fillText(method.caption, w - pad - Math.floor(font*0.9), pad + Math.floor(font*1.65));
    ctx.textAlign = 'left';

    ctx.restore();

    return { pad, hh };
  }

  function render(ctx){
    bg(ctx);

    const { pad, hh } = header(ctx);

    const top = pad + hh + Math.floor(font*0.9);

    const cx = w * 0.5;
    const cy = top + (h - top - pad) * 0.44;
    const R = Math.min(w, h) * 0.235;

    const s = curStep();
    const n = nextStep();

    const p = ease(stepT / s.dur);
    const rem = s.dur - stepT;

    // plate
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.ellipse(cx + 12, cy + 18, R * 1.08, R * 0.84, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.90;
    const plate = ctx.createRadialGradient(cx, cy - R*0.22, 10, cx, cy, R*1.35);
    plate.addColorStop(0, 'rgba(34, 26, 22, 1)');
    plate.addColorStop(1, 'rgba(6, 6, 7, 1)');
    ctx.fillStyle = plate;
    ctx.beginPath();
    ctx.ellipse(cx, cy, R * 1.12, R * 0.86, 0, 0, Math.PI * 2);
    ctx.fill();

    // progress ring
    ctx.globalAlpha = 0.26;
    ctx.strokeStyle = 'rgba(241,236,228,0.35)';
    ctx.lineWidth = Math.max(6, Math.floor(R * 0.12));
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI * 0.5, Math.PI * 1.5);
    ctx.stroke();

    ctx.globalAlpha = 0.86;
    ctx.strokeStyle = 'rgba(255, 210, 150, 0.95)';
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * p);
    ctx.stroke();

    // timer
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(241,236,228,0.96)';
    ctx.font = `${big}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmt(rem), cx, cy);

    // step label
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = 'rgba(255, 210, 150, 0.92)';
    ctx.font = `700 ${Math.floor(font*1.08)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText(String(s.label).toUpperCase(), cx, cy + R * 0.20);

    ctx.restore();

    // spec card
    const cardW = Math.floor(w * 0.30);
    const cardH = Math.floor(Math.max(92, font * 6.2));
    const cardX = Math.floor(w * 0.08);
    const cardY = Math.floor(top + (h - top - pad) * 0.25);

    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, cardX + 8, cardY + 10, cardW, cardH, 18);
    ctx.fill();

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(12, 10, 10, 0.78)';
    roundRect(ctx, cardX, cardY, cardW, cardH, 18);
    ctx.fill();

    ctx.globalAlpha = 0.30;
    ctx.strokeStyle = 'rgba(255, 215, 160, 0.55)';
    ctx.lineWidth = 2;
    roundRect(ctx, cardX, cardY, cardW, cardH, 18);
    ctx.stroke();

    ctx.globalAlpha = 0.90;
    ctx.fillStyle = 'rgba(241,236,228,0.85)';
    ctx.font = `700 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('BREW NOTES', cardX + Math.floor(font*0.9), cardY + Math.floor(font*0.7));

    ctx.globalAlpha = 0.82;
    ctx.font = `${Math.floor(small*0.95)}px ui-sans-serif, system-ui`;
    for (let i=0;i<method.spec.length;i++){
      ctx.fillText(`• ${method.spec[i]}`, cardX + Math.floor(font*0.9), cardY + Math.floor(font*2.0) + i*Math.floor(font*1.15));
    }

    ctx.restore();

    // footer strip
    const fy = Math.floor(h * 0.86);
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, fy, w, h - fy);

    const total = methodTotal(method);
    const loopRem = total - (loopT % total);

    ctx.globalAlpha = 0.86;
    ctx.fillStyle = 'rgba(241,236,228,0.78)';
    ctx.font = `${Math.floor(font*0.92)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(`NEXT: ${String(n.label).toUpperCase()}`, Math.floor(w*0.06), Math.floor(h*0.92));

    ctx.globalAlpha = 0.75;
    ctx.textAlign = 'right';
    ctx.font = `${Math.floor(font*0.84)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`LOOP ${fmt(loopRem)}`, Math.floor(w*0.94), Math.floor(h*0.92));

    ctx.globalAlpha = 0.62;
    ctx.textAlign = 'left';
    ctx.font = `${Math.floor(font*0.78)}px ui-sans-serif, system-ui`;
    ctx.fillText(`NOW PLAYING: ${track}`, Math.floor(w*0.06), Math.floor(h*0.965));

    ctx.restore();

    // tiny dial indicator
    const dialW = Math.floor(w * 0.22);
    const dialX = Math.floor(w - pad - dialW);
    const dialY = Math.floor(top + (h - top - pad) * 0.30);
    const dialH = Math.floor(font * 2.6);

    const dialP = (0.5 + 0.5*Math.sin(t * 0.20 + seed * 0.001)) * 0.92;
    const tickX = dialX + dialW * dialP;

    ctx.save();
    ctx.globalAlpha = 0.68;
    ctx.fillStyle = 'rgba(12,10,10,0.72)';
    roundRect(ctx, dialX, dialY, dialW, dialH, 14);
    ctx.fill();

    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = 'rgba(241,236,228,0.9)';
    ctx.lineWidth = 2;
    roundRect(ctx, dialX, dialY, dialW, dialH, 14);
    ctx.stroke();

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(241,236,228,0.75)';
    ctx.font = `${Math.floor(small*0.92)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('DIAL', dialX + Math.floor(font*0.7), dialY + dialH*0.5);

    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = 'rgba(255,210,150,0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tickX, dialY + Math.floor(dialH*0.22));
    ctx.lineTo(tickX, dialY + Math.floor(dialH*0.78));
    ctx.stroke();

    ctx.restore();
  }

  return { init, onResize, update, render, onAudioOn, onAudioOff, destroy };
}
