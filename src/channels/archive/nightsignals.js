import { mulberry32, clamp } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';

function pick(rand, a){ return a[(rand() * a.length) | 0]; }
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

function hexToRgb(hex){
  const h = hex.replace('#','');
  const n = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16);
  return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
}
function rgba(hex, a){
  const {r,g,b} = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function pulse(t, speed=1){
  return 0.5 + 0.5*Math.sin(t*speed*Math.PI*2);
}

function patternIntensity(t, pat){
  // pat = [{on:seconds, off:seconds}] looped; on is full, off is 0.
  if (!pat?.length) return 1;
  const total = pat.reduce((s,p)=>s + p.on + p.off, 0) || 1;
  let x = ((t % total) + total) % total;
  for (const p of pat){
    if (x < p.on) return 1;
    x -= p.on;
    if (x < p.off) return 0;
    x -= p.off;
  }
  return 0;
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w=0, h=0, dpr=1;
  let t=0;

  // layout
  let baseFont=16, small=12;

  // audio
  let ambience = null;
  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  const SIGNALS = [
    {
      domain: 'RAILWAY',
      title: 'RED LAMP',
      caption: 'STOP — do not proceed.',
      lamps: [{ color: '#ff3b30', y: 0 }],
    },
    {
      domain: 'RAILWAY',
      title: 'GREEN LAMP',
      caption: 'CLEAR — proceed with caution.',
      lamps: [{ color: '#34c759', y: 0 }],
    },
    {
      domain: 'AVIATION',
      title: 'OBSTRUCTION BEACON',
      caption: 'RED flash — tall structure ahead.',
      lamps: [{ color: '#ff453a', y: 0, pattern: [{ on: 0.18, off: 0.55 }] }],
    },
    {
      domain: 'MARITIME',
      title: 'DOUBLE RED',
      caption: 'RESTRICTED — keep clear.',
      lamps: [
        { color: '#ff3b30', y: -1.05 },
        { color: '#ff3b30', y: +1.05 },
      ],
    },
    {
      domain: 'MARITIME',
      title: 'RED / WHITE',
      caption: 'CAUTION — reduced visibility.',
      lamps: [
        { color: '#ff3b30', y: -1.05, pattern: [{ on: 0.25, off: 0.85 }] },
        { color: '#ffffff', y: +1.05, pattern: [{ on: 0.08, off: 0.35 }, { on: 0.08, off: 0.95 }] },
      ],
    },
    {
      domain: 'MORSE',
      title: 'SOS',
      caption: '... --- ... (for vibes only)',
      lamps: [{
        color: '#d7f6ff',
        y: 0,
        // dot dot dot, dash dash dash, dot dot dot
        pattern: [
          { on: 0.12, off: 0.14 }, { on: 0.12, off: 0.14 }, { on: 0.12, off: 0.28 },
          { on: 0.38, off: 0.14 }, { on: 0.38, off: 0.14 }, { on: 0.38, off: 0.28 },
          { on: 0.12, off: 0.14 }, { on: 0.12, off: 0.14 }, { on: 0.12, off: 0.90 },
        ]
      }],
    },
  ];

  let idx = 0;
  let sceneT = 0;
  const DUR = 15; // seconds per signal

  // some drifting dust particles
  const parts = Array.from({length: 38}, () => ({
    x: rand(),
    y: rand(),
    r: 0.5 + rand()*1.8,
    s: 0.03 + rand()*0.12,
    a: 0.05 + rand()*0.10,
  }));

  function init({ width, height, dpr: dprIn }){
    w = width; h = height; dpr = dprIn || 1;
    t = 0;
    idx = 0;
    sceneT = 0;

    baseFont = Math.max(14, Math.floor(Math.min(w, h) / 28));
    small = Math.max(11, Math.floor(baseFont * 0.72));

    // tiny click
    safeBeep({ freq: 520 + rand()*160, dur: 0.02, gain: 0.010, type: 'square' });
  }

  function onResize(width, height, dprIn){ init({ width, height, dpr: dprIn }); }

  function onAudioOn(){
    if (!audio.enabled) return;
    const n = audio.noiseSource({ type: 'pink', gain: 0.0045 });
    n.start();
    const d = simpleDrone(audio, { root: 55 + rand()*18, detune: 0.8, gain: 0.018 });
    ambience = { stop(){ try{ n.stop(); }catch{} try{ d.stop(); }catch{} } };
    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    try{ ambience?.stop?.(); } catch {}
    ambience = null;
  }

  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;
    sceneT += dt;
    if (sceneT >= DUR){
      sceneT = sceneT % DUR;
      idx = (idx + 1) % SIGNALS.length;
      safeBeep({ freq: 380 + rand()*160, dur: 0.018, gain: 0.012, type: 'square' });
    }

    // drift particles slowly
    for (const p of parts){
      p.y -= dt * p.s;
      p.x += dt * (p.s * 0.22);
      if (p.y < -0.05) { p.y = 1.05; p.x = rand(); }
      if (p.x > 1.05) p.x = -0.05;
    }
  }

  function bg(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    const g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0, '#03060b');
    g.addColorStop(0.55, '#000102');
    g.addColorStop(1, '#000000');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,w,h);

    // faint haze
    const rg = ctx.createRadialGradient(w*0.55, h*0.35, 0, w*0.55, h*0.35, Math.max(w,h)*0.72);
    rg.addColorStop(0, 'rgba(40,80,140,0.08)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0,0,w,h);

    // dust
    ctx.fillStyle = 'rgba(220,235,255,0.08)';
    for (const p of parts){
      ctx.globalAlpha = p.a;
      ctx.beginPath();
      ctx.arc(p.x*w, p.y*h, p.r*dpr, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function renderLamp(ctx, cx, cy, r, color, intensity){
    // housing
    ctx.save();
    ctx.translate(cx, cy);

    // backplate
    ctx.fillStyle = 'rgba(16,18,22,0.85)';
    ctx.beginPath();
    ctx.arc(0,0,r*1.18,0,Math.PI*2);
    ctx.fill();

    // lens
    const lens = ctx.createRadialGradient(-r*0.25, -r*0.35, r*0.12, 0,0,r);
    lens.addColorStop(0, rgba(color, 0.92*intensity + 0.08));
    lens.addColorStop(0.55, rgba(color, 0.20*intensity));
    lens.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = lens;
    ctx.beginPath();
    ctx.arc(0,0,r,0,Math.PI*2);
    ctx.fill();

    // glow
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = rgba(color, 0.75*intensity);
    ctx.shadowBlur = r * (3.0 + 3.0*intensity);
    ctx.fillStyle = rgba(color, 0.16*intensity);
    ctx.beginPath();
    ctx.arc(0,0,r*1.02,0,Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // spec highlight
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(255,255,255,${0.10 + 0.18*intensity})`;
    ctx.beginPath();
    ctx.ellipse(-r*0.22, -r*0.28, r*0.26, r*0.18, -0.6, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
  }

  function renderBeam(ctx, cx, cy, r, color, intensity){
    if (intensity <= 0.001) return;
    const beamLen = Math.min(w, h) * 0.62;
    const beamW = r * 2.2;

    // a soft wedge cone
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grd = ctx.createLinearGradient(cx, cy, cx + beamLen, cy);
    grd.addColorStop(0, rgba(color, 0.00));
    grd.addColorStop(0.10, rgba(color, 0.10*intensity));
    grd.addColorStop(0.55, rgba(color, 0.045*intensity));
    grd.addColorStop(1, rgba(color, 0.0));
    ctx.fillStyle = grd;

    ctx.beginPath();
    ctx.moveTo(cx + r*0.8, cy);
    ctx.lineTo(cx + beamLen, cy - beamW);
    ctx.lineTo(cx + beamLen, cy + beamW);
    ctx.closePath();
    ctx.fill();

    // thin core
    ctx.strokeStyle = rgba(color, 0.12*intensity);
    ctx.lineWidth = Math.max(1, r*0.10);
    ctx.beginPath();
    ctx.moveTo(cx + r*0.7, cy);
    ctx.lineTo(cx + beamLen, cy);
    ctx.stroke();

    ctx.restore();
  }

  function renderPost(ctx, cx, cy, scale){
    const postH = h * 0.52;
    const postW = Math.max(10*dpr, scale*22);
    // pole
    ctx.fillStyle = 'rgba(12,12,14,0.92)';
    ctx.fillRect(cx - postW*0.15, cy - postH*0.10, postW*0.30, postH);

    // little base box
    ctx.fillStyle = 'rgba(20,20,24,0.88)';
    ctx.fillRect(cx - postW*0.70, cy + postH*0.85, postW*1.40, postW*0.90);

    // bolts
    ctx.fillStyle = 'rgba(200,210,220,0.06)';
    for (let i=0;i<4;i++){
      ctx.beginPath();
      ctx.arc(cx - postW*0.52 + i*(postW*0.34), cy + postH*0.90 + postW*0.25, postW*0.08, 0, Math.PI*2);
      ctx.fill();
    }
  }

  function renderHud(ctx, s, cx, topY){
    const p = clamp(sceneT / 0.8, 0, 1);
    const aIn = ease(p);

    ctx.save();
    ctx.textBaseline = 'top';
    ctx.fillStyle = `rgba(235,242,255,${0.88*aIn})`;
    ctx.font = `700 ${baseFont}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillText('NIGHT SIGNALS', w*0.07, topY);

    ctx.font = `600 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = `rgba(170,190,215,${0.78*aIn})`;
    ctx.fillText(`${s.domain}  •  ${s.title}`, w*0.07, topY + baseFont*1.15);

    // disclaimer
    ctx.fillStyle = `rgba(150,165,190,${0.48*aIn})`;
    ctx.fillText('NOT FOR NAVIGATION', w*0.07, topY + baseFont*1.15 + small*1.25);

    // caption card
    const cardW = w * 0.86;
    const cardH = Math.max(54*dpr, small*3.1);
    const cardX = (w - cardW)/2;
    const cardY = h * 0.78;
    ctx.fillStyle = `rgba(10,12,16,${0.66*aIn})`;
    ctx.strokeStyle = `rgba(170,190,215,${0.14*aIn})`;
    ctx.lineWidth = Math.max(1, 1.25*dpr);
    roundRect(ctx, cardX, cardY, cardW, cardH, 12*dpr);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = `rgba(235,242,255,${0.86*aIn})`;
    ctx.font = `600 ${Math.floor(small*1.02)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.textBaseline = 'middle';
    ctx.fillText(s.caption, cardX + cardW*0.045, cardY + cardH*0.50);

    // tiny progress bar
    const prog = clamp(sceneT / DUR, 0, 1);
    ctx.fillStyle = `rgba(110,220,255,${0.22*aIn})`;
    ctx.fillRect(cardX, cardY + cardH - 2*dpr, cardW * prog, 2*dpr);

    ctx.restore();
  }

  function render(ctx){
    bg(ctx);

    const s = SIGNALS[idx];

    const cx = w * 0.50;
    const cy = h * 0.46;
    const scale = Math.min(w, h) * 0.001;

    // subtle camera sway
    const sway = (pulse(t, 0.03) - 0.5) * 2;
    const sx = cx + sway * (w*0.012);
    const sy = cy + (pulse(t+2.1, 0.021) - 0.5) * (h*0.012);

    renderPost(ctx, sx, sy, Math.max(10, scale*1000));

    // lamp cluster
    const lampR = Math.max(18*dpr, Math.min(w, h) * 0.065);
    const lampX = sx + Math.max(20*dpr, lampR*1.1);

    // housing plate behind lamps
    const plateW = lampR * 2.8;
    const plateH = lampR * 3.2;
    ctx.fillStyle = 'rgba(14,15,18,0.88)';
    ctx.strokeStyle = 'rgba(200,210,225,0.06)';
    ctx.lineWidth = Math.max(1, 1.25*dpr);
    roundRect(ctx, lampX - plateW/2, sy - plateH/2, plateW, plateH, 16*dpr);
    ctx.fill();
    ctx.stroke();

    for (const L of s.lamps){
      const ly = sy + L.y * lampR * 1.25;
      const pat = L.pattern;
      const base = patternIntensity(t, pat);
      const flick = 0.82 + 0.18*pulse(t + (L.y*1.7), 0.9);
      const ramp = clamp(sceneT / 0.55, 0, 1);
      const intensity = clamp(base * flick * ease(ramp), 0, 1);

      renderBeam(ctx, lampX, ly, lampR, L.color, intensity);
      renderLamp(ctx, lampX, ly, lampR, L.color, intensity);

      // tiny little label ticks next to each lamp
      ctx.fillStyle = 'rgba(220,235,255,0.10)';
      ctx.fillRect(lampX - lampR*1.55, ly - 1*dpr, lampR*0.22, 2*dpr);
    }

    renderHud(ctx, s, sx, h*0.08);

    // vignette
    const vg = ctx.createRadialGradient(w*0.52, h*0.42, Math.min(w,h)*0.12, w*0.52, h*0.42, Math.max(w,h)*0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = vg;
    ctx.fillRect(0,0,w,h);
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
