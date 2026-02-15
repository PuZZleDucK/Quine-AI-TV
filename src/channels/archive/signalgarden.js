import { mulberry32, clamp } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';

function pick(rand, a){ return a[(rand() * a.length) | 0]; }

function smoothstep(a, b, x){
  x = clamp((x - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
}

const TAU = Math.PI * 2;

function waveSine(x){ return Math.sin(x); }
function waveSaw(x){
  // -1..1 sawtooth
  const p = x / TAU;
  return 2 * (p - Math.floor(p + 0.5));
}
function waveTri(x){
  // -1..1 triangle
  const s = waveSaw(x);
  return 1 - 2 * Math.abs(s);
}
function waveFM(x, ratio, index, phase){
  return Math.sin(x + index * Math.sin(x * ratio + phase));
}

const WAVEFORMS = [
  {
    id: 'sine',
    label: 'SINE BLOOM',
    hud: 'sine',
    fn: (x, p) => waveSine(x + p.phase),
  },
  {
    id: 'saw',
    label: 'SAW VINE',
    hud: 'saw',
    fn: (x, p) => waveSaw(x + p.phase),
  },
  {
    id: 'tri',
    label: 'TRI PETALS',
    hud: 'triangle',
    fn: (x, p) => waveTri(x + p.phase),
  },
  {
    id: 'fm',
    label: 'FM ORCHID',
    hud: 'fm',
    fn: (x, p) => waveFM(x, p.fmRatio, p.fmIndex, p.phase),
  },
];

function buildScene(rand, w, h, font){
  const flowers = [];
  const count = 3 + ((rand() * 3) | 0);

  for (let i = 0; i < count; i++){
    const wf = pick(rand, WAVEFORMS);
    const petals = 3 + ((rand() * 7) | 0);
    const base = Math.min(w, h) * (0.12 + rand() * 0.12);

    flowers.push({
      wf,
      petals,
      cx: 0.2 + rand() * 0.6,
      cy: 0.25 + rand() * 0.55,
      rot: rand() * TAU,
      hue: (170 + rand() * 120) % 360,
      baseR: base * (0.35 + rand() * 0.25),
      ampR: base * (0.65 + rand() * 0.5),
      phase: rand() * TAU,
      fmRatio: 1.6 + rand() * 4.6,
      fmIndex: 0.7 + rand() * 2.2,
      line: Math.max(1.2, (font / 14) * 1.7),
      offset: rand() * 0.7,
    });
  }

  const title = 'ANALOG SIGNAL GARDEN';
  const subtitle = pick(rand, [
    'oscilloscope blooms • waveforms • harmonics',
    'sine • saw • fm • soft glow',
    'gentle voltage, loud aesthetics',
  ]);

  return { flowers, title, subtitle };
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, t = 0;
  let dpr = 1;
  let font = 16;
  let small = 12;

  let scene = null;
  let sceneT = 0;
  let sceneDur = 10;

  let ambience = null;

  function setSceneDuration(){
    sceneDur = 8.5 + rand() * 6.5;
  }

  function chirp(strength=1){
    if (!audio.enabled) return;
    const base = 320 + rand() * 540;
    const g = 0.012 + 0.014 * clamp(strength, 0, 1);
    audio.beep({ freq: base, dur: 0.04, gain: g, type: 'sine' });
    audio.beep({ freq: base * (1.5 + rand() * 0.15), dur: 0.025, gain: g * 0.65, type: 'triangle' });
  }

  function nextScene(){
    sceneT = 0;
    setSceneDuration();
    scene = buildScene(rand, w, h, font);
    chirp(0.9);
  }

  function init({ width, height, dpr: dp }){
    w = width;
    h = height;
    dpr = dp || 1;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));

    setSceneDuration();
    scene = buildScene(rand, w, h, font);
    sceneT = 0;
  }

  function onResize(width, height, dp){
    init({ width, height, dpr: dp });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    const hiss = audio.noiseSource({ type: 'pink', gain: 0.004 });
    hiss.start();
    const dr = simpleDrone(audio, { root: 92 + rand() * 26, detune: 0.6, gain: 0.035 });
    ambience = {
      stop(){
        try { hiss.stop(); } catch {}
        try { dr.stop(); } catch {}
      }
    };
    audio.setCurrent(ambience);
    chirp(0.45);
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
    sceneT += dt;

    if (sceneT >= sceneDur){
      nextScene();
    }

    // tiny occasional "scope tick"
    if (audio.enabled && rand() < dt * 0.05){
      const f = 780 + rand() * 420;
      audio.beep({ freq: f, dur: 0.012, gain: 0.006, type: 'square' });
    }
  }

  function drawGrid(ctx){
    // dim oscilloscope grid
    const step = Math.max(26, Math.floor(Math.min(w, h) / 18));
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = 'rgba(120, 255, 210, 0.22)';
    ctx.lineWidth = Math.max(1, 1.2 * dpr);

    for (let x = 0; x <= w; x += step){
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += step){
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(w, y + 0.5);
      ctx.stroke();
    }

    // brighter center crosshair
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = 'rgba(120, 255, 210, 0.35)';
    ctx.beginPath();
    ctx.moveTo(w * 0.5, 0);
    ctx.lineTo(w * 0.5, h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w, h * 0.5);
    ctx.stroke();

    ctx.restore();
  }

  function render(ctx){
    if (!scene) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // background: deep green-black with a soft bloom
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 10, w * 0.5, h * 0.45, Math.max(w, h) * 0.85);
    bg.addColorStop(0, '#07110d');
    bg.addColorStop(0.55, '#030807');
    bg.addColorStop(1, '#010203');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    drawGrid(ctx);

    // global drift, like a slightly warm analog scope
    const driftX = Math.sin(t * 0.12) * w * 0.006;
    const driftY = Math.cos(t * 0.11) * h * 0.006;

    // blooms
    const p = clamp(sceneT / sceneDur, 0, 1);
    const bloomIn = smoothstep(0.0, 0.22, p);
    const bloomOut = 1 - smoothstep(0.78, 1.0, p);
    const globalBloom = clamp(Math.sin(p * Math.PI) * 1.2, 0, 1) * bloomIn * bloomOut;

    for (let i = 0; i < scene.flowers.length; i++){
      const f = scene.flowers[i];
      const local = clamp(globalBloom * (0.85 + 0.25 * Math.sin(t * 0.7 + f.offset * 8)), 0, 1);
      const cx = (f.cx * w) + driftX;
      const cy = (f.cy * h) + driftY;
      const rot = f.rot + t * (0.08 + f.offset * 0.06);

      const amp = f.ampR * local;
      const base = f.baseR * (0.9 + 0.12 * Math.sin(t * 0.6 + i));

      const alpha = 0.12 + 0.58 * local;
      const col = `hsla(${f.hue}, 85%, 62%, ${alpha})`;
      const glow = `hsla(${f.hue}, 95%, 70%, ${0.25 + 0.35 * local})`;

      // two-pass: glow then core
      for (let pass = 0; pass < 2; pass++){
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rot);

        ctx.lineWidth = (pass === 0 ? f.line * 2.6 : f.line) * dpr;
        ctx.strokeStyle = pass === 0 ? glow : col;
        ctx.globalAlpha = pass === 0 ? 0.58 : 0.95;
        ctx.shadowColor = pass === 0 ? glow : 'transparent';
        ctx.shadowBlur = pass === 0 ? (18 * dpr) : 0;

        ctx.beginPath();
        const steps = 620;
        for (let s = 0; s <= steps; s++){
          const th = (s / steps) * TAU;
          const wx = f.wf.fn(f.petals * th, f);
          const r = base + amp * wx;
          const x = r * Math.cos(th);
          const y = r * Math.sin(th);
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
      }

      // label (gentle HUD)
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.35 * local;
      ctx.fillStyle = 'rgba(220, 255, 246, 0.82)';
      ctx.font = `${Math.floor(small * 0.96)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textBaseline = 'top';

      const lx = Math.floor(cx + base * 0.4);
      const ly = Math.floor(cy - base * 0.85);
      const wfTxt = f.wf.hud.padEnd(8, ' ');
      const petalsTxt = String(f.petals).padStart(2, '0');
      const extra = f.wf.id === 'fm' ? ` r:${f.fmRatio.toFixed(1)} i:${f.fmIndex.toFixed(1)}` : '';
      ctx.fillText(`${wfTxt} petals:${petalsTxt}${extra}`, lx, ly);
      ctx.restore();
    }

    // header
    const headerH = Math.floor(h * 0.12);
    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(0, 0, w, headerH);

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(220, 255, 246, 0.92)';
    ctx.font = `${Math.floor(font * 1.06)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText(scene.title, Math.floor(w * 0.05), Math.floor(headerH * 0.45));

    ctx.globalAlpha = 0.7;
    ctx.font = `${Math.floor(font * 0.86)}px ui-sans-serif, system-ui`;
    ctx.fillText(scene.subtitle, Math.floor(w * 0.05), Math.floor(headerH * 0.78));

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(120, 255, 210, 0.85)';
    ctx.fillRect(0, headerH - 2, w, 2);
    ctx.restore();

    // footer hint
    ctx.save();
    ctx.globalAlpha = 0.58;
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.fillRect(0, Math.floor(h * 0.93), w, Math.floor(h * 0.07));

    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(220, 255, 246, 0.72)';
    ctx.font = `${Math.floor(h / 40)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';

    ctx.fillText('sine • saw • triangle • fm', Math.floor(w * 0.05), Math.floor(h * 0.965));
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
