import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }
function lerp(a,b,t){ return a + (b-a)*t; }
function ease(t){ t = clamp(t, 0, 1); return t*t*(3 - 2*t); }

const MORSE = {
  A: '.-',
  B: '-...',
  C: '-.-.',
  D: '-..',
  E: '.',
  F: '..-.',
  G: '--.',
  H: '....',
  I: '..',
  J: '.---',
  K: '-.-',
  L: '.-..',
  M: '--',
  N: '-.',
  O: '---',
  P: '.--.',
  Q: '--.-',
  R: '.-.',
  S: '...',
  T: '-',
  U: '..-',
  V: '...-',
  W: '.--',
  X: '-..-',
  Y: '-.--',
  Z: '--..',
  0: '-----',
  1: '.----',
  2: '..---',
  3: '...--',
  4: '....-',
  5: '.....',
  6: '-....',
  7: '--...',
  8: '---..',
  9: '----.',
};

function encodeMorse(text){
  const up = String(text || '').toUpperCase();
  const parts = [];
  for (const ch of up){
    if (ch === ' '){ parts.push('/'); continue; }
    if (MORSE[ch]) parts.push(MORSE[ch]);
  }
  return parts.join(' ');
}

function buildPulseEvents(text, baseT, unit){
  // Returns pulse-only events: [{ t, dur, kind: 'dot'|'dash' }]
  const up = String(text || '').toUpperCase();
  const events = [];
  let tt = baseT;

  function gap(n){ tt += n * unit; }

  for (let i = 0; i < up.length; i++){
    const ch = up[i];

    if (ch === ' '){
      // Word gap: 7 units total; assume we've already had 1u element gap, so add 7u.
      gap(7);
      continue;
    }

    const code = MORSE[ch];
    if (!code) continue;

    for (let j = 0; j < code.length; j++){
      const sym = code[j];
      const kind = sym === '-' ? 'dash' : 'dot';
      const durU = kind === 'dash' ? 3 : 1;

      events.push({ t: tt, dur: durU * unit, kind });

      // intra-element gap 1 unit (even after last; corrected below)
      gap(durU + 1);
    }

    // letter gap: 3 units total; we already added 1 unit after last element.
    gap(2);
  }

  return events;
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  // palette
  const palettes = [
    { deskA: '#140f0a', deskB: '#070504', paperA: '#e9dfc9', paperB: '#c9b99a', ink: '#1b1b1b', hud: 'rgba(250,245,236,0.92)', accent: '#ffcf7a' },
    { deskA: '#101015', deskB: '#050508', paperA: '#f0e9d6', paperB: '#cdbfa2', ink: '#111', hud: 'rgba(245,248,255,0.92)', accent: '#7ad7ff' },
    { deskA: '#0f1411', deskB: '#050806', paperA: '#eadfcb', paperB: '#c7b692', ink: '#151515', hud: 'rgba(245,255,248,0.92)', accent: '#a8ff8a' },
  ];
  const pal = pick(rand, palettes);

  const WORDS = [
    'HELLO',
    'SIGNAL',
    'DUCK',
    'MELBOURNE',
    'CODE',
    'COMMS',
    'MESSAGE',
    'MORSE',
    'NIGHT',
    'RADIO',
    'STATION',
    'TICK',
    'TONE',
    'SAFE',
    'REPEAT',
  ];

  // cycle timing
  const CYCLE_DUR = 44;
  const INTRO_DUR = 6;
  const PRACTICE_DUR = 18;
  const QUIZ_DUR = 10;
  const REVEAL_DUR = 10;

  // morse timing
  const UNIT = 0.11;
  const PRACTICE_START = INTRO_DUR + 0.7;
  const QUIZ_START = INTRO_DUR + PRACTICE_DUR + 0.7;

  let cycle = -1;
  let word = 'HELLO';
  let morseText = '';

  let events = []; // pulses across both segments
  let soundEvents = []; // same as events, already sorted
  let soundIdx = 0;

  // visual state
  let grain = [];
  let stamp = 0;
  let stampAt = 0;
  let keyDown = 0;
  let keyFlash = 0;

  // audio
  let ambience = null;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function regenDeskGrain(){
    const r2 = mulberry32((seed ^ 0x5ad9c0de) >>> 0);
    grain = [];
    const n = 46;
    for (let i = 0; i < n; i++){
      grain.push({
        x: r2() * w,
        y: r2() * h,
        l: (0.4 + r2() * 0.8) * Math.max(w, h),
        a: r2() * Math.PI * 2,
        w: 0.35 + r2() * 1.2,
        o: 0.06 + r2() * 0.08,
      });
    }
  }

  function chooseWord(){
    // deterministic per-cycle word selection
    const r2 = mulberry32(((seed ^ 0x9e3779b9) + (cycle * 977)) >>> 0);
    return WORDS[(r2() * WORDS.length) | 0];
  }

  function setupCycle(){
    word = chooseWord();
    morseText = encodeMorse(word);

    const a = buildPulseEvents(word, PRACTICE_START, UNIT);
    const b = buildPulseEvents(word, QUIZ_START, UNIT);

    // Add tiny jitter to avoid perfectly robotic spacing (still deterministic)
    const r2 = mulberry32(((seed ^ 0x1337c0de) + cycle * 131) >>> 0);
    events = a.concat(b).map((e) => ({
      t: e.t + (r2() - 0.5) * 0.006,
      dur: e.dur,
      kind: e.kind,
    })).sort((x, y) => x.t - y.t);

    soundEvents = events;
    soundIdx = 0;

    stamp = 0;
    stampAt = INTRO_DUR + PRACTICE_DUR + QUIZ_DUR + 0.2;
    keyFlash = 0;
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;
    t = 0;
    cycle = -1;

    regenDeskGrain();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    const n = audio.noiseSource({ type: 'pink', gain: 0.0026 });
    n.start();

    const d = simpleDrone(audio, { root: 55 + rand() * 8, detune: 1.2, gain: 0.010 });

    ambience = {
      stop(){
        try { n.stop(); } catch {}
        try { d.stop(); } catch {}
      },
    };

    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    try { ambience?.stop?.(); } catch {}
    ambience = null;
  }

  function destroy(){ onAudioOff(); }

  function segment(tt){
    if (tt < INTRO_DUR) return 'INTRO';
    if (tt < INTRO_DUR + PRACTICE_DUR) return 'PRACTICE';
    if (tt < INTRO_DUR + PRACTICE_DUR + QUIZ_DUR) return 'QUIZ';
    return 'REVEAL';
  }

  function isPulseActive(tt){
    // tt is time within cycle
    for (let i = 0; i < events.length; i++){
      const e = events[i];
      if (tt < e.t) break;
      if (tt >= e.t && tt < e.t + e.dur) return true;
    }
    return false;
  }

  function update(dt){
    t += dt;

    const c = Math.floor(t / CYCLE_DUR);
    if (c !== cycle){
      cycle = c;
      setupCycle();
    }

    const tt = t - cycle * CYCLE_DUR;

    stamp = Math.max(0, stamp - dt * 1.8);
    keyFlash = Math.max(0, keyFlash - dt * 2.6);

    // key animation follows pulse activity
    const down = isPulseActive(tt) ? 1 : 0;
    keyDown = lerp(keyDown, down, 1 - Math.pow(0.0001, dt));

    if (down > 0.5) keyFlash = Math.min(1, keyFlash + dt * 3.2);

    // stamp moment
    if (stamp <= 0 && tt >= stampAt && tt < stampAt + 0.28){
      stamp = 1;
      safeBeep({ freq: 640, dur: 0.06, gain: 0.020, type: 'square' });
      safeBeep({ freq: 920, dur: 0.05, gain: 0.015, type: 'triangle' });
    }

    // per-pulse beeps
    if (audio.enabled){
      while (soundIdx < soundEvents.length && tt >= soundEvents[soundIdx].t){
        const e = soundEvents[soundIdx];
        const f = e.kind === 'dash' ? 690 : 740;
        const g = e.kind === 'dash' ? 0.020 : 0.017;
        safeBeep({ freq: f, dur: Math.max(0.02, e.dur * 0.95), gain: g, type: 'square' });
        soundIdx++;
      }
    }
  }

  function roundedRect(ctx, x, y, ww, hh, r){
    r = Math.min(r, ww * 0.5, hh * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, r);
    ctx.arcTo(x + ww, y + hh, x, y + hh, r);
    ctx.arcTo(x, y + hh, x, y, r);
    ctx.arcTo(x, y, x + ww, y, r);
    ctx.closePath();
  }

  function drawDesk(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal.deskA);
    g.addColorStop(1, pal.deskB);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // subtle grain
    ctx.save();
    ctx.strokeStyle = 'rgba(255,220,180,0.18)';
    for (const ln of grain){
      ctx.globalAlpha = ln.o;
      const x1 = ln.x;
      const y1 = ln.y;
      const x2 = x1 + Math.cos(ln.a) * ln.l;
      const y2 = y1 + Math.sin(ln.a) * ln.l;
      ctx.lineWidth = ln.w;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();

    // vignette
    const v = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.14, w * 0.5, h * 0.5, Math.max(w, h) * 0.76);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.60)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  function drawTape(ctx, tt){
    const x = w * 0.10;
    const y = h * 0.53;
    const ww = w * 0.80;
    const hh = h * 0.16;

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#000';
    roundedRect(ctx, x + 8, y + 10, ww, hh, hh * 0.18);
    ctx.fill();
    ctx.restore();

    // tape
    const tg = ctx.createLinearGradient(x, y, x, y + hh);
    tg.addColorStop(0, pal.paperA);
    tg.addColorStop(1, pal.paperB);
    ctx.fillStyle = tg;
    roundedRect(ctx, x, y, ww, hh, hh * 0.18);
    ctx.fill();

    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = Math.max(2, hh * 0.06);
    roundedRect(ctx, x, y, ww, hh, hh * 0.18);
    ctx.stroke();

    // perforation holes (moving)
    const holeStep = Math.max(18, hh * 0.36);
    const holeR = Math.max(2, hh * 0.09);
    const feedSpeed = w * 0.13;
    const shift = (t * feedSpeed) % holeStep;

    ctx.save();
    ctx.globalAlpha = 0.34;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let px = x - shift; px < x + ww + holeStep; px += holeStep){
      ctx.beginPath();
      ctx.arc(px + holeStep * 0.5, y + hh * 0.18, holeR, 0, Math.PI * 2);
      ctx.arc(px + holeStep * 0.5, y + hh * 0.82, holeR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // printed pulses
    ctx.save();
    ctx.fillStyle = pal.ink;

    const markH = hh * 0.34;
    const my = y + hh * 0.5 - markH * 0.5;

    for (let i = 0; i < events.length; i++){
      const e = events[i];
      const dt2 = tt - e.t;
      if (dt2 < 0) break;
      const px = x + ww - dt2 * feedSpeed;
      if (px < x - ww * 0.2) continue;
      if (px > x + ww + ww * 0.1) continue;

      if (e.kind === 'dot'){
        const r = markH * 0.22;
        ctx.beginPath();
        ctx.arc(px, y + hh * 0.5, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const mw = markH * 0.85;
        roundedRect(ctx, px - mw * 0.5, my, mw, markH, markH * 0.2);
        ctx.fill();
      }
    }

    ctx.restore();

    // subtle ruler lines
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = Math.max(1, hh * 0.02);
    const gridStep = Math.max(10, ww / 28);
    for (let gx = x; gx <= x + ww; gx += gridStep){
      ctx.beginPath();
      ctx.moveTo(gx, y + hh * 0.06);
      ctx.lineTo(gx, y + hh * 0.10);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawKey(ctx){
    const baseX = w * 0.63;
    const baseY = h * 0.78;
    const baseW = w * 0.30;
    const baseH = h * 0.12;

    const rim = Math.max(2, h / 260);

    // base
    ctx.save();
    const g = ctx.createLinearGradient(baseX, baseY, baseX, baseY + baseH);
    g.addColorStop(0, 'rgba(25,25,28,0.92)');
    g.addColorStop(1, 'rgba(0,0,0,0.92)');
    ctx.fillStyle = g;
    roundedRect(ctx, baseX, baseY, baseW, baseH, baseH * 0.18);
    ctx.fill();

    // brass plate
    const plateH = baseH * 0.42;
    const plateY = baseY + baseH * 0.12;
    const pg = ctx.createLinearGradient(baseX, plateY, baseX + baseW, plateY);
    pg.addColorStop(0, 'rgba(170,140,70,0.92)');
    pg.addColorStop(0.5, 'rgba(240,210,120,0.95)');
    pg.addColorStop(1, 'rgba(150,120,60,0.92)');
    ctx.fillStyle = pg;
    roundedRect(ctx, baseX + baseW * 0.08, plateY, baseW * 0.84, plateH, plateH * 0.22);
    ctx.fill();

    // lever
    const pivotX = baseX + baseW * 0.24;
    const pivotY = baseY + baseH * 0.34;

    const leverLen = baseW * 0.62;
    const press = ease(keyDown);
    const ang = lerp(-0.22, 0.06, press);

    ctx.save();
    ctx.translate(pivotX, pivotY);
    ctx.rotate(ang);

    ctx.strokeStyle = 'rgba(240,240,245,0.75)';
    ctx.lineWidth = Math.max(2, baseH * 0.10);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(leverLen, 0);
    ctx.stroke();

    // knob
    ctx.fillStyle = 'rgba(250,250,255,0.85)';
    ctx.beginPath();
    ctx.arc(leverLen, 0, baseH * 0.14, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // pivot screw
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(pivotX, pivotY, baseH * 0.12, 0, Math.PI * 2);
    ctx.fill();

    // highlight flash when keying
    if (keyFlash > 0.01){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.25 * keyFlash;
      ctx.fillStyle = pal.accent;
      roundedRect(ctx, baseX + baseW * 0.06, baseY + baseH * 0.05, baseW * 0.88, baseH * 0.90, baseH * 0.2);
      ctx.fill();
      ctx.restore();
    }

    // outline
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = rim;
    roundedRect(ctx, baseX, baseY, baseW, baseH, baseH * 0.18);
    ctx.stroke();

    ctx.restore();
  }

  function drawHud(ctx, tt){
    const seg = segment(tt);

    const pad = w * 0.04;
    const titleSize = Math.max(16, (h / 24) | 0);
    const mono = Math.max(12, (h / 44) | 0);

    ctx.save();
    ctx.fillStyle = pal.hud;
    ctx.font = `700 ${titleSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillText('TELEGRAPH KEY PRACTICE HOUR', pad, h * 0.085);

    ctx.font = `${mono}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(250,245,236,0.78)';
    ctx.fillText(`MODE: ${seg}`, pad, h * 0.115);

    // panel
    const boxX = pad;
    const boxY = h * 0.14;
    const boxW = w - pad * 2;
    const boxH = h * 0.16;

    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    roundedRect(ctx, boxX, boxY, boxW, boxH, boxH * 0.18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = Math.max(2, h / 360);
    roundedRect(ctx, boxX, boxY, boxW, boxH, boxH * 0.18);
    ctx.stroke();

    const lineY = boxY + boxH * 0.34;

    if (seg === 'PRACTICE'){
      ctx.fillStyle = 'rgba(250,245,236,0.86)';
      ctx.fillText(`PRACTICE WORD: ${word}`, boxX + pad * 0.4, lineY);
      ctx.fillStyle = 'rgba(250,245,236,0.70)';
      ctx.fillText(`MORSE: ${morseText}`, boxX + pad * 0.4, lineY + mono + 10);
    } else if (seg === 'QUIZ'){
      const qT = tt - (INTRO_DUR + PRACTICE_DUR);
      const secs = Math.max(0, Math.ceil(QUIZ_DUR - qT));
      ctx.fillStyle = 'rgba(250,245,236,0.86)';
      ctx.fillText(`QUIZ: DECODE THIS`, boxX + pad * 0.4, lineY);
      ctx.fillStyle = 'rgba(250,245,236,0.72)';
      ctx.fillText(`MORSE: ${morseText}`, boxX + pad * 0.4, lineY + mono + 10);
      ctx.fillStyle = `rgba(255,207,122,${0.55 + 0.20 * Math.sin(t * 6)})`;
      ctx.fillText(`TIME: ${secs}s`, boxX + pad * 0.4, lineY + (mono + 10) * 2);
    } else if (seg === 'REVEAL'){
      ctx.fillStyle = 'rgba(250,245,236,0.86)';
      ctx.fillText(`ANSWER: ${word}`, boxX + pad * 0.4, lineY);
      ctx.fillStyle = 'rgba(250,245,236,0.70)';
      ctx.fillText('KEEP PRACTICING. KEEP LISTENING.', boxX + pad * 0.4, lineY + mono + 10);
    } else {
      ctx.fillStyle = 'rgba(250,245,236,0.80)';
      ctx.fillText('LISTEN • TAP • DECODE', boxX + pad * 0.4, lineY);
      ctx.fillStyle = 'rgba(250,245,236,0.62)';
      ctx.fillText('TODAY: DOTS, DASHES, AND TIMING', boxX + pad * 0.4, lineY + mono + 10);
    }

    ctx.restore();
  }

  function drawStamp(ctx){
    if (stamp <= 0) return;

    const a = clamp(stamp, 0, 1);
    const k = ease(1 - a);

    ctx.save();
    ctx.translate(w * 0.62, h * 0.43);
    ctx.rotate(-0.18 + (1 - a) * 0.08);

    const ww = w * (0.36 + k * 0.04);
    const hh = h * (0.10 + k * 0.02);

    ctx.globalAlpha = 0.82 * a;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(-ww * 0.5 + 6, -hh * 0.5 + 7, ww, hh);

    ctx.globalAlpha = 0.92 * a;
    ctx.strokeStyle = 'rgba(255,120,120,0.9)';
    ctx.lineWidth = Math.max(3, h / 160);
    ctx.strokeRect(-ww * 0.5, -hh * 0.5, ww, hh);

    ctx.font = `800 ${Math.max(18, (h / 22) | 0)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,120,120,0.85)';
    ctx.fillText('MESSAGE RECEIVED', 0, 0);

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const dx = Math.sin(t * 0.10 + seed * 0.00001) * w * 0.006;
    const dy = Math.cos(t * 0.09 + seed * 0.00002) * h * 0.004;

    ctx.save();
    ctx.translate(dx, dy);

    const tt = t - cycle * CYCLE_DUR;

    drawDesk(ctx);
    drawTape(ctx, tt);
    drawKey(ctx);
    drawHud(ctx, tt);
    drawStamp(ctx);

    ctx.restore();

    // subtle scanlines
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#000';
    const step = Math.max(2, Math.floor(3 * dpr));
    for (let y = 0; y < h; y += step){
      ctx.fillRect(0, y, w, 1);
    }
    ctx.restore();
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
