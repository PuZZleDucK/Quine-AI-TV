import { mulberry32 } from '../util/prng.js';

// Small Town UFO Hotline
// Call-in style faux radio drama: odd sightings, skeptical hosts, escalating lore, and periodic “commercials.”

const HOSTS = [
  { name: 'Mara', tag: 'HOST', vibe: 'skeptical calm' },
  { name: 'Deputy Dale', tag: 'CO-HOST', vibe: 'small-town practical' },
  { name: '"Doc" Hensley', tag: 'GUEST', vibe: 'confidently weird' },
];

const CALLERS = [
  'Eddie from Miller Creek',
  'Janine near the old silo',
  '"Truck" Tom',
  'Ruth at Pine Ridge',
  'Caleb from Route 9',
  'Lola by the quarry',
  'Sandy at the diner',
  'Mick in the trailer park',
];

const SIGHTINGS = [
  { place: 'Miller\'s Field', what: 'a triangle of lights hovering, silent as lint' },
  { place: 'the water tower', what: 'a bright orb that "blinked" like it understood Morse' },
  { place: 'County Road 6', what: 'a low hum that made the dashboard needles wiggle' },
  { place: 'Pine Ridge', what: 'a shape behind the clouds like a coin under cloth' },
  { place: 'the radio mast', what: 'a shimmer around the antenna, like heat off asphalt' },
  { place: 'the quarry', what: 'a beam that turned the dust into a slow snowfall' },
  { place: 'the old drive-in', what: 'a "screen glow" with no projector and no film' },
];

const LORE_BITS = [
  'the "Red Frequency" that only shows up after midnight',
  'a second set of footprints behind the water tower',
  'missing time measured in burnt-out watch batteries',
  'a map of town with one street that doesn\'t exist',
  'the same three notes whistled on different calls',
  'a voice that answers before the phone rings',
];

const COMMERCIALS = [
  {
    brand: 'Harlow\'s Tire & Towing',
    copy: 'Stuck in a ditch? We\'ll haul you out. Unless it\'s… not a ditch.',
    jingle: 'Harlow\'s—two honks and you\'re home.'
  },
  {
    brand: 'Betty\'s All-Night Diner',
    copy: 'Coffee strong enough to fight the dark. Pie warm enough to forget it.',
    jingle: 'Betty\'s—open when the sky isn\'t.'
  },
  {
    brand: 'Kite & Key Hardware',
    copy: 'Batteries, flashlights, and the kind of rope you hope you don\'t need.',
    jingle: 'Kite & Key—tighten the world.'
  },
  {
    brand: 'WQNZ Station ID',
    copy: 'You\'re listening to WQNZ 97.3… or maybe it\'s listening to you.',
    jingle: 'WQNZ—stay tuned.'
  }
];

function pick(rand, arr){ return arr[Math.floor(rand() * arr.length)]; }

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

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, t = 0;

  // segment state
  let seg = null;
  let segTimer = 0;
  let glitch = 0;
  let callWave = 0;

  // audio handle
  let ah = null;

  function newSegment(){
    // weights: mostly calls, sometimes lore, sometimes commercials
    const u = rand();

    if (u < 0.62){
      const host = pick(rand, HOSTS);
      const caller = pick(rand, CALLERS);
      const s = pick(rand, SIGHTINGS);
      const lore = rand() < 0.35 ? pick(rand, LORE_BITS) : null;

      const lines = [
        `${host.tag}: ${host.name} — "You\'re on the line."`,
        `CALLER: ${caller}`,
        `"I saw it over ${s.place}. ${s.what}."`,
      ];
      if (lore) lines.push(`"And… I heard about ${lore}."`);
      lines.push('HOST: "Stay with us. Don\'t hang up."');

      seg = {
        kind: 'call',
        title: 'UFO HOTLINE — CALL IN PROGRESS',
        stamp: `CALLER #${String(100 + Math.floor(rand() * 900))}`,
        lines,
      };

      segTimer = 10 + rand() * 8;
      glitch = 0.22 + rand() * 0.55;

      if (audio.enabled){
        // phone ring blip + "line open" click
        audio.beep({ freq: 880, dur: 0.06, gain: 0.035, type: 'square' });
        audio.beep({ freq: 660, dur: 0.05, gain: 0.03, type: 'square' });
      }
    } else if (u < 0.80){
      const bit = pick(rand, LORE_BITS);
      const host = pick(rand, HOSTS);
      seg = {
        kind: 'lore',
        title: 'MIDNIGHT BULLETIN',
        stamp: `NOTE ${String.fromCharCode(65 + Math.floor(rand() * 26))}-${String(10 + Math.floor(rand() * 90))}`,
        lines: [
          `${host.tag}: ${host.name} — "We\'re getting reports of…"`,
          `"${bit}."`,
          '"If you hear your name on the static, do not respond."',
          '"Back to the phones."',
        ]
      };
      segTimer = 8 + rand() * 7;
      glitch = 0.35 + rand() * 0.55;
      if (audio.enabled){
        audio.beep({ freq: 520 + rand() * 80, dur: 0.05, gain: 0.03, type: 'triangle' });
      }
    } else {
      const c = pick(rand, COMMERCIALS);
      seg = {
        kind: 'ad',
        title: 'PAID MESSAGE',
        stamp: 'SPONSOR',
        lines: [
          c.brand.toUpperCase(),
          c.copy,
          c.jingle,
          '—',
          'Return to the hotline after this.',
        ]
      };
      segTimer = 7 + rand() * 6;
      glitch = 0.10 + rand() * 0.35;
      if (audio.enabled){
        // jingle chirp
        audio.beep({ freq: 740, dur: 0.045, gain: 0.025, type: 'sine' });
        audio.beep({ freq: 988, dur: 0.045, gain: 0.02, type: 'sine' });
      }
    }
  }

  function makeAudioHandle(){
    const ctx = audio.ensure();

    const out = ctx.createGain();
    out.gain.value = 0.95;
    out.connect(audio.master);

    // AM-ish bed: pink noise with lowpass + gentle tremolo
    const ns = audio.noiseSource({ type: 'pink', gain: 0.08 });

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 1150;
    lpf.Q.value = 0.75;

    const trem = ctx.createOscillator();
    trem.type = 'sine';
    trem.frequency.value = 2.2;

    const tremGain = ctx.createGain();
    tremGain.gain.value = 0.25;

    const level = ctx.createGain();
    level.gain.value = 0.9;

    // wire tremolo into level gain (subtle)
    trem.connect(tremGain);
    tremGain.connect(level.gain);

    ns.src.disconnect();
    ns.src.connect(ns.gain);
    ns.gain.disconnect();
    ns.gain.connect(lpf);

    lpf.connect(level);
    level.connect(out);

    ns.start();
    trem.start();

    // occasional "tower hum" tone (very subtle)
    const hum = ctx.createOscillator();
    hum.type = 'triangle';
    hum.frequency.value = 62;

    const humGain = ctx.createGain();
    humGain.gain.value = 0.0;

    const t0 = ctx.currentTime;
    humGain.gain.setValueAtTime(0.0001, t0);
    humGain.gain.exponentialRampToValueAtTime(0.020, t0 + 0.6);

    hum.connect(humGain);
    humGain.connect(lpf);
    hum.start();

    return {
      stop(){
        const now = ctx.currentTime;
        try { out.gain.setTargetAtTime(0.0001, now, 0.08); } catch {}
        try { ns.stop(); } catch {}
        try { trem.stop(now + 0.15); } catch {}
        try { hum.stop(now + 0.15); } catch {}
      }
    };
  }

  function init({ width, height }){
    w = width; h = height; t = 0;
    seg = null;
    segTimer = 0;
    glitch = 0;
    callWave = rand() * 10;
    newSegment();
  }

  function onResize(width, height){ w = width; h = height; }

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

    segTimer -= dt;
    if (segTimer <= 0){
      newSegment();
    }

    if (glitch > 0) glitch = Math.max(0, glitch - dt);
    callWave += dt * (1.4 + Math.sin(t*0.3) * 0.25);
  }

  function drawBackground(ctx){
    // midnight gradient
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#05060b');
    g.addColorStop(0.55, '#070a12');
    g.addColorStop(1, '#020205');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // faint stars
    const n = Math.floor(40 + (w * h) / 80_000);
    for (let i=0; i<n; i++){
      const x = (i * 97.3 + (seed % 997)) % w;
      const y = (i * 53.1 + (seed % 271)) % (h * 0.55);
      const tw = 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(t*0.8 + i));
      ctx.fillStyle = `rgba(190,220,255,${0.06 * tw})`;
      ctx.fillRect(x, y, 1, 1);
    }

    // small-town silhouette
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    const baseY = Math.floor(h * 0.78);
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, baseY);
    const steps = 14;
    for (let i=0; i<=steps; i++){
      const x = (i/steps) * w;
      const up = 10 + 26 * (0.5 + 0.5 * Math.sin(i*1.3 + (seed%9)));
      const roof = baseY - up;
      ctx.lineTo(x, roof);
      ctx.lineTo(x, baseY);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // radio mast blink
    const mx = Math.floor(w * 0.82);
    const my = Math.floor(h * 0.50);
    ctx.strokeStyle = 'rgba(180,190,210,0.12)';
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w,h) / 700));
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(mx, baseY);
    ctx.stroke();

    const blink = 0.5 + 0.5 * Math.sin(t * 1.7);
    ctx.fillStyle = `rgba(255,80,80,${0.12 + 0.25*blink})`;
    ctx.beginPath();
    ctx.arc(mx, my, 3, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // vignette
    const vg = ctx.createRadialGradient(w*0.5, h*0.5, Math.min(w,h)*0.22, w*0.5, h*0.5, Math.max(w,h)*0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  function drawScanlines(ctx){
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = '#000';
    const step = Math.max(2, Math.floor(h / 180));
    for (let y=0; y<h; y+=step){
      ctx.fillRect(0, y, w, 1);
    }
    ctx.restore();
  }

  function drawHotlineUI(ctx){
    const s = Math.min(w, h);
    const pad = Math.max(14, Math.floor(s * 0.03));

    // header strip
    ctx.save();
    ctx.fillStyle = 'rgba(10, 14, 24, 0.72)';
    ctx.strokeStyle = 'rgba(255, 90, 120, 0.18)';
    ctx.lineWidth = 1;
    roundRect(ctx, pad, pad, w - pad*2, Math.floor(s * 0.085), 12);
    ctx.fill();
    ctx.stroke();

    const hdrH = Math.floor(s * 0.085);
    ctx.font = `${Math.floor(hdrH*0.40)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(250, 250, 255, 0.92)';
    ctx.fillText('WQNZ 97.3 — SMALL TOWN UFO HOTLINE', pad + 14, pad + Math.floor(hdrH*0.60));

    // ON AIR pill
    const pillW = Math.floor(s * 0.17);
    const pillH = Math.floor(hdrH * 0.62);
    const pillX = w - pad - pillW - 14;
    const pillY = pad + Math.floor(hdrH*0.19);
    const air = 0.55 + 0.45 * Math.sin(t * 2.4);
    ctx.fillStyle = `rgba(255, 60, 80, ${0.18 + 0.20*air})`;
    ctx.strokeStyle = 'rgba(255, 90, 120, 0.25)';
    roundRect(ctx, pillX, pillY, pillW, pillH, 999);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `${Math.floor(pillH*0.55)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillText('ON AIR', pillX + 14, pillY + Math.floor(pillH*0.70));

    ctx.restore();

    // segment card
    const cardW = Math.floor(w * 0.76);
    const cardH = Math.floor(h * 0.46);
    const cardX = Math.floor((w - cardW) / 2);
    const cardY = Math.floor(h * 0.23);

    ctx.save();
    ctx.fillStyle = 'rgba(4, 6, 10, 0.76)';
    ctx.strokeStyle = 'rgba(180, 200, 255, 0.16)';
    ctx.lineWidth = 1;
    roundRect(ctx, cardX, cardY, cardW, cardH, 16);
    ctx.fill();
    ctx.stroke();

    // title
    ctx.fillStyle = 'rgba(210, 230, 255, 0.92)';
    ctx.font = `${Math.floor(cardH*0.10)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(seg?.title || '—', cardX + 18, cardY + Math.floor(cardH*0.18));

    // stamp
    ctx.fillStyle = 'rgba(255, 190, 110, 0.86)';
    ctx.font = `${Math.floor(cardH*0.08)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const stamp = seg?.stamp || '';
    const stw = ctx.measureText(stamp).width;
    ctx.fillText(stamp, cardX + cardW - 18 - stw, cardY + Math.floor(cardH*0.18));

    // lines
    const lines = seg?.lines || [];
    const lineY0 = cardY + Math.floor(cardH*0.30);
    const lh = Math.floor(cardH*0.12);
    ctx.font = `${Math.floor(cardH*0.085)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;

    for (let i=0; i<Math.min(lines.length, 6); i++){
      const a = 0.55 + 0.45 * Math.sin(t*0.8 + i*0.7);
      ctx.fillStyle = `rgba(255,255,255,${0.78 + 0.10*a})`;
      ctx.fillText(lines[i], cardX + 18, lineY0 + i*lh);
    }

    // waveform bar
    const wx = cardX + 18;
    const wy = cardY + cardH - Math.floor(cardH*0.18);
    const ww = cardW - 36;
    const wh = Math.floor(cardH*0.10);

    ctx.fillStyle = 'rgba(108,242,255,0.10)';
    roundRect(ctx, wx, wy, ww, wh, 10);
    ctx.fill();

    // bars
    const bars = 40;
    const bw = ww / bars;
    for (let i=0; i<bars; i++){
      const ph = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(callWave*2.2 + i*0.55));
      const hh = Math.floor((wh-6) * ph);
      const bx = wx + i*bw;
      const by = wy + Math.floor((wh - hh)/2);
      ctx.fillStyle = seg?.kind === 'ad'
        ? 'rgba(255,190,110,0.55)'
        : (seg?.kind === 'lore' ? 'rgba(255,110,190,0.45)' : 'rgba(108,242,255,0.55)');
      ctx.fillRect(bx + 1, by, Math.max(1, bw - 2), hh);
    }

    // glitch overlay when segment changes
    if (glitch > 0){
      const a = Math.min(1, glitch / 0.75);
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255,255,255,${0.05*a})`;
      ctx.fillRect(cardX, cardY, cardW, cardH);
      ctx.fillStyle = `rgba(255,80,110,${0.06*a})`;
      ctx.fillRect(cardX + Math.sin(t*40)*6, cardY + 6, cardW, 2);
      ctx.fillStyle = `rgba(108,242,255,${0.06*a})`;
      ctx.fillRect(cardX + Math.cos(t*33)*6, cardY + cardH - 10, cardW, 2);
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx);
    drawHotlineUI(ctx);
    drawScanlines(ctx);

    // slight chroma-ish sheen
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const sheen = ctx.createLinearGradient(0, 0, w, h);
    sheen.addColorStop(0, 'rgba(255,110,190,0.00)');
    sheen.addColorStop(0.5, 'rgba(255,110,190,0.04)');
    sheen.addColorStop(1, 'rgba(108,242,255,0.00)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
