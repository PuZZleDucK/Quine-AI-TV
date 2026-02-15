import { mulberry32, clamp } from '../../util/prng.js';

function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

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

// Classic 8-position semaphore: 1=up, then clockwise in 45° steps.
function posAngle(pos){
  return (-Math.PI / 2) + (pos - 1) * (Math.PI / 4);
}

// Standard-ish mapping: ordered combinations of (1..8) pick 2.
const SEM = {
  A: [1, 2], B: [1, 3], C: [1, 4], D: [1, 5], E: [1, 6], F: [1, 7], G: [1, 8],
  H: [2, 3], I: [2, 4], J: [2, 5], K: [2, 6], L: [2, 7], M: [2, 8],
  N: [3, 4], O: [3, 5], P: [3, 6], Q: [3, 7], R: [3, 8],
  S: [4, 5], T: [4, 6], U: [4, 7], V: [4, 8],
  W: [5, 6], X: [5, 7], Y: [5, 8], Z: [6, 7],
  NUM: [6, 8],
  CANCEL: [7, 8],
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0;
  let t = 0;

  let font = 16;
  let big = 56;

  // Palette (seeded)
  const skyHue = 195 + rand() * 25;
  const seaHue = 205 + rand() * 18;
  const skyTop = `hsl(${skyHue}, 55%, 14%)`;
  const skyMid = `hsl(${skyHue + 10}, 65%, 10%)`;
  const skyGlow = `hsla(${(skyHue + 40) % 360}, 85%, 60%, 0.09)`;
  const seaA = `hsl(${seaHue}, 70%, 20%)`;
  const seaB = `hsl(${seaHue + 10}, 75%, 12%)`;
  const foam = `hsla(${seaHue + 35}, 85%, 75%, 0.18)`;

  const hullA = `hsl(${(seaHue + 150) % 360}, 32%, 22%)`;
  const hullB = `hsl(${(seaHue + 170) % 360}, 28%, 16%)`;
  const mast = `hsl(${(seaHue + 120) % 360}, 25%, 70%)`;

  const flagA = `hsl(${(skyHue + 330) % 360}, 88%, 58%)`;
  const flagB = `hsl(${(skyHue + 40) % 360}, 92%, 58%)`;

  const ui = `hsla(${(skyHue + 70) % 360}, 90%, 78%, 0.92)`;
  const uiDim = `hsla(${(skyHue + 70) % 360}, 80%, 76%, 0.55)`;

  // Parallax clouds (precomputed)
  const clouds = Array.from({ length: 12 }, () => ({
    x: rand(),
    y: rand() * 0.28,
    r: 0.04 + rand() * 0.11,
    s: (0.004 + rand() * 0.01) * (rand() < 0.5 ? -1 : 1),
    a: 0.05 + rand() * 0.1,
  }));

  // Boats (two layers + a "signal" boat)
  const boats = [
    { layer: 'far', x: 0.18 + rand() * 0.18, y: 0.66, s: 0.55, drift: (rand() < 0.5 ? -1 : 1) * (0.004 + rand() * 0.006) },
    { layer: 'mid', x: 0.58 + rand() * 0.2, y: 0.72, s: 0.75, drift: (rand() < 0.5 ? -1 : 1) * (0.006 + rand() * 0.01) },
    { layer: 'signal', x: 0.36 + rand() * 0.2, y: 0.79, s: 1.05, drift: (rand() < 0.5 ? -1 : 1) * (0.01 + rand() * 0.014) },
  ];

  // Lesson plan: letters + quizzes + a "message received" end card.
  const segments = [];
  function makeWord(len){
    let s = '';
    for (let i = 0; i < len; i++) s += ALPHABET[(rand() * 26) | 0];
    return s;
  }

  for (let i = 0; i < ALPHABET.length; i++){
    segments.push({ kind: 'letter', letter: ALPHABET[i], dur: 2.05 });
    if ((i + 1) % 6 === 0 && i < 25){
      const word = makeWord(3 + ((rand() * 3) | 0));
      segments.push({ kind: 'quiz', word, dur: 8.2, letterDur: 1.0 });
    }
  }
  segments.push({ kind: 'end', dur: 4.5 });

  let segIndex = 0;
  let segT = 0;

  let flash = 0;
  let gust = 0;
  let nextGustAt = 0;

  let gull = null;
  let nextGullAt = 0;

  let bed = null;

  let revealed = false;
  let revealPulse = 0;

  function cur(){ return segments[segIndex] || segments[0]; }

  function init({ width, height }){
    w = width;
    h = height;
    t = 0;

    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    big = Math.max(44, Math.floor(Math.min(w, h) / 9));

    segIndex = 0;
    segT = 0;

    flash = 0;
    gust = 0;

    gull = null;
    nextGullAt = 2.5 + rand() * 6;
    nextGustAt = 3.5 + rand() * 7;

    revealed = false;
    revealPulse = 0;

    segmentStarted(cur());
  }

  function onResize(width, height){
    init({ width, height });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    const src = audio.noiseSource({ type: 'brown', gain: 0.045 });
    src.start();
    bed = src;
    audio.setCurrent({
      stop(){ try { src.stop(); } catch {} },
    });
  }

  function onAudioOff(){
    try { bed?.stop?.(); } catch {}
    bed = null;
  }

  function destroy(){
    onAudioOff();
  }

  function segmentStarted(s){
    revealed = false;
    revealPulse = 0;

    if (!audio.enabled) return;

    if (s.kind === 'letter'){
      const i = s.letter.charCodeAt(0) - 65;
      audio.beep({ freq: 360 + i * 7, dur: 0.05, gain: 0.028, type: 'square' });
    } else if (s.kind === 'quiz'){
      audio.beep({ freq: 900, dur: 0.06, gain: 0.03, type: 'square' });
      audio.beep({ freq: 620, dur: 0.05, gain: 0.022, type: 'triangle' });
    } else if (s.kind === 'end'){
      audio.beep({ freq: 520, dur: 0.06, gain: 0.028, type: 'triangle' });
      audio.beep({ freq: 360, dur: 0.08, gain: 0.022, type: 'sine' });
    }
  }

  function update(dt){
    t += dt;
    segT += dt;

    flash = Math.max(0, flash - dt * 1.5);
    gust = Math.max(0, gust - dt * 1.8);
    revealPulse = Math.max(0, revealPulse - dt * 2.4);

    const s = cur();
    if (segT >= s.dur){
      segT = 0;
      segIndex = (segIndex + 1) % segments.length;
      segmentStarted(cur());
    }

    if (t >= nextGustAt){
      gust = 1;
      nextGustAt = t + 6 + rand() * 10;
      if (audio.enabled) audio.beep({ freq: 240 + rand() * 90, dur: 0.04, gain: 0.015, type: 'sine' });
    }

    if (!gull && t >= nextGullAt){
      gull = {
        x: rand() < 0.5 ? -0.15 : 1.15,
        y: 0.16 + rand() * 0.22,
        vx: (rand() < 0.5 ? 1 : -1) * (0.14 + rand() * 0.08),
        life: 6.5 + rand() * 3,
        phase: rand() * Math.PI * 2,
      };
      // Make sure vx heads inward.
      gull.vx = gull.x < 0 ? Math.abs(gull.vx) : -Math.abs(gull.vx);
      nextGullAt = t + 10 + rand() * 18;
    }

    if (gull){
      gull.x += gull.vx * dt;
      gull.life -= dt;
      if (gull.life <= 0) gull = null;
    }

    // Timed special moment: quiz reveal pulse.
    const cs = cur();
    if (cs.kind === 'quiz'){
      const revealAt = cs.dur * 0.68;
      if (!revealed && segT >= revealAt){
        revealed = true;
        revealPulse = 1;
        flash = Math.max(flash, 0.8);
        if (audio.enabled) audio.beep({ freq: 1080, dur: 0.06, gain: 0.028, type: 'square' });
      }
    }
  }

  function drawSky(ctx, horizon){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, skyTop);
    g.addColorStop(0.5, skyMid);
    g.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // A subtle glow band.
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = skyGlow;
    ctx.fillRect(0, horizon * 0.12, w, horizon * 0.65);
    ctx.restore();

    // Clouds
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const c of clouds){
      const xx = ((c.x + t * c.s) % 1 + 1) % 1;
      const x = xx * w;
      const y = c.y * h;
      const r = c.r * Math.min(w, h);
      ctx.globalAlpha = c.a;
      ctx.fillStyle = `rgba(220,235,255,1)`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.arc(x + r * 0.9, y + r * 0.15, r * 0.85, 0, Math.PI * 2);
      ctx.arc(x - r * 0.8, y + r * 0.2, r * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Scanlines
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    const step = Math.max(2, Math.floor(Math.min(w, h) / 120));
    for (let y = 0; y < h; y += step) ctx.fillRect(0, y, w, 1);
    ctx.restore();
  }

  function drawOcean(ctx, horizon){
    const g = ctx.createLinearGradient(0, horizon * 0.55, 0, h);
    g.addColorStop(0, seaA);
    g.addColorStop(1, seaB);
    ctx.fillStyle = g;
    ctx.fillRect(0, horizon * 0.55, w, h - horizon * 0.55);

    function wave(yBase, amp, freq, speed, alpha){
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = foam;
      ctx.beginPath();
      const step = Math.max(10, Math.floor(w / 64));
      ctx.moveTo(0, h);
      for (let x = 0; x <= w + step; x += step){
        const nx = x / w;
        const yy = yBase + Math.sin(nx * Math.PI * 2 * freq + t * speed) * amp + Math.sin(nx * Math.PI * 2 * (freq * 0.37) + t * speed * 0.7) * (amp * 0.35);
        ctx.lineTo(x, yy);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const farY = lerp(horizon * 0.7, h * 0.72, 0.25);
    wave(farY, h * 0.006, 2.1, 0.7, 0.16);
    wave(farY + h * 0.03, h * 0.008, 1.6, 0.9, 0.12);

    const nearY = lerp(horizon * 0.75, h * 0.88, 0.72);
    wave(nearY, h * 0.015, 1.25, 1.1, 0.18);
    wave(nearY + h * 0.06, h * 0.02, 0.9, 1.2, 0.14);
  }

  function drawBoat(ctx, b, horizon, flags){
    const bx = (b.x + Math.sin(t * 0.2 + b.y * 8) * 0.01 + t * b.drift) % 1;
    const x = bx * w;
    const y = b.y * h;
    const s = b.s * Math.min(w, h) / 420;

    const bob = Math.sin(t * (0.9 + b.s * 0.2) + b.x * 10) * (6 * s);
    const tilt = Math.sin(t * 0.7 + b.x * 7) * 0.04;

    ctx.save();
    ctx.translate(x, y + bob);
    ctx.rotate(tilt);

    // hull
    const hw = 140 * s;
    const hh = 26 * s;
    ctx.fillStyle = hullB;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.58, 0);
    ctx.quadraticCurveTo(0, hh * 0.9, hw * 0.62, 0);
    ctx.quadraticCurveTo(hw * 0.52, -hh * 0.9, -hw * 0.55, -hh * 0.55);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = hullA;
    ctx.beginPath();
    ctx.moveTo(-hw * 0.52, -hh * 0.15);
    ctx.quadraticCurveTo(0, hh * 0.55, hw * 0.55, -hh * 0.1);
    ctx.quadraticCurveTo(hw * 0.48, -hh * 0.7, -hw * 0.5, -hh * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    // mast
    const mx = -hw * 0.05;
    const my = -hh * 1.2;
    const mh = 130 * s;
    ctx.strokeStyle = mast;
    ctx.lineWidth = Math.max(2, 3 * s);
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.lineTo(mx, my - mh);
    ctx.stroke();

    // rigging line
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = Math.max(1, 2 * s);
    ctx.beginPath();
    ctx.moveTo(mx, my - mh * 0.85);
    ctx.lineTo(hw * 0.46, my - mh * 0.22);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // flags (optional)
    if (flags){
      drawSemaphoreFlags(ctx, mx, my - mh * 0.72, 58 * s, flags);
    } else {
      // idle pennant
      ctx.save();
      ctx.translate(mx, my - mh * 0.82);
      const fl = 32 * s;
      const a = -Math.PI / 2 + Math.sin(t * 1.2 + b.x * 10) * 0.12;
      ctx.rotate(a);
      ctx.fillStyle = `hsla(${(skyHue + 10) % 360}, 70%, 60%, 0.75)`;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(fl, fl * 0.16);
      ctx.lineTo(fl * 0.84, -fl * 0.18);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // tiny wake
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = foam;
    ctx.lineWidth = Math.max(1, 2 * s);
    ctx.beginPath();
    ctx.arc(-hw * 0.42, hh * 0.4, 18 * s, Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  function drawSemaphoreFlags(ctx, x, y, R, { aPos, bPos, snap=0 }){
    // Two flags around a point (like classic semaphore, but mounted on a mast).
    const aAng = posAngle(aPos);
    const bAng = posAngle(bPos);

    function drawFlag(angle, col, flip){
      ctx.save();
      ctx.translate(x, y);
      const gustAmt = gust * 0.35 + snap;
      ctx.rotate(angle + Math.sin(t * 2.6 + (flip ? 1 : 0)) * 0.06 * gustAmt);

      // pole
      ctx.strokeStyle = mast;
      ctx.lineWidth = Math.max(1, R * 0.06);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(R, 0);
      ctx.stroke();

      // cloth
      const fw = R * 0.78;
      const fh = R * 0.28;
      ctx.translate(R * 0.22, 0);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(fw, fh);
      ctx.lineTo(fw * 0.9, -fh);
      ctx.closePath();
      ctx.fill();

      // stripe
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.moveTo(fw * 0.18, 0);
      ctx.lineTo(fw * 0.74, fh * 0.62);
      ctx.lineTo(fw * 0.62, -fh * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawFlag(aAng, flagA, false);
    drawFlag(bAng, flagB, true);

    // hub
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawGull(ctx){
    if (!gull) return;
    const x = gull.x * w;
    const y = gull.y * h + Math.sin(t * 2.0 + gull.phase) * (h * 0.008);
    const s = Math.min(w, h) / 520;

    const flap = Math.sin(t * 6.5 + gull.phase);
    const wing = 18 * s;

    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = 'rgba(240,250,255,0.95)';
    ctx.lineWidth = Math.max(1, 2 * s);
    ctx.beginPath();
    ctx.moveTo(-wing, 0);
    ctx.quadraticCurveTo(-wing * 0.3, -wing * (0.5 + flap * 0.2), 0, 0);
    ctx.quadraticCurveTo(wing * 0.3, -wing * (0.5 - flap * 0.2), wing, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawUI(ctx, horizon){
    const s = cur();

    const pad = Math.max(10, Math.floor(Math.min(w, h) / 38));
    const bx = pad;
    const by = pad;
    const bw = Math.min(w - pad * 2, Math.floor(w * 0.46));
    const bh = Math.floor(h * 0.18);

    ctx.save();
    ctx.globalAlpha = 0.36;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    roundRect(ctx, bx + 8, by + 10, bw, bh, 18);
    ctx.fill();

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(10,16,24,0.85)';
    roundRect(ctx, bx, by, bw, bh, 18);
    ctx.fill();

    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = uiDim;
    ctx.lineWidth = 2;
    roundRect(ctx, bx, by, bw, bh, 18);
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.fillStyle = ui;
    ctx.font = `600 ${font}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;

    let title = 'LESSON';
    if (s.kind === 'quiz') title = 'QUIZ';
    if (s.kind === 'end') title = 'END';

    ctx.fillText('SIGNAL FLAG REGATTA', bx + pad, by + pad + font);

    ctx.globalAlpha = 0.8;
    ctx.fillStyle = uiDim;
    ctx.fillText(title, bx + pad, by + pad + font * 2.2);

    // progress bar
    const px = bx + pad;
    const py = by + bh - pad - Math.max(6, Math.floor(font * 0.35));
    const pw = bw - pad * 2;
    const ph = Math.max(6, Math.floor(font * 0.35));

    ctx.globalAlpha = 0.25;
    ctx.fillStyle = ui;
    roundRect(ctx, px, py, pw, ph, ph);
    ctx.fill();

    const prog = clamp(segT / s.dur, 0, 1);
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = ui;
    roundRect(ctx, px, py, pw * prog, ph, ph);
    ctx.fill();

    // Main content
    ctx.globalAlpha = 1;
    ctx.fillStyle = ui;

    if (s.kind === 'letter'){
      ctx.font = `800 ${big}px ui-sans-serif, system-ui`;
      ctx.fillText(s.letter, bx + pad, by + bh - pad - ph - font * 0.25);
      ctx.globalAlpha = 0.65;
      ctx.font = `600 ${font}px ui-sans-serif, system-ui`;
      ctx.fillText('Watch the signal boat.', bx + pad + big * 0.62, by + bh - pad - ph - font * 0.2);
    } else if (s.kind === 'quiz'){
      const shown = s.word.split('').map(ch => (revealed ? ch : '•')).join(' ');
      ctx.font = `800 ${Math.floor(big * 0.66)}px ui-sans-serif, system-ui`;
      ctx.fillText(shown, bx + pad, by + bh - pad - ph - font * 0.15);

      ctx.globalAlpha = 0.7;
      ctx.font = `600 ${font}px ui-sans-serif, system-ui`;
      ctx.fillText('Decode the flags. Reveal near end.', bx + pad, by + pad + font * 3.25);
    } else if (s.kind === 'end'){
      ctx.font = `800 ${Math.floor(big * 0.6)}px ui-sans-serif, system-ui`;
      ctx.fillText('MESSAGE RECEIVED', bx + pad, by + bh - pad - ph - font * 0.1);

      // stamp moment
      const k = ease(Math.min(1, segT / s.dur));
      ctx.save();
      ctx.translate(bx + bw * 0.72, by + bh * 0.52);
      ctx.rotate(-0.08 + Math.sin(t * 1.4) * 0.02);
      ctx.globalAlpha = 0.18 + 0.38 * k;
      ctx.strokeStyle = ui;
      ctx.lineWidth = Math.max(2, Math.floor(font * 0.14));
      const sw = bw * 0.26;
      const sh = bh * 0.48;
      roundRect(ctx, -sw / 2, -sh / 2, sw, sh, 14);
      ctx.stroke();
      ctx.restore();
    }

    // flash overlay (quiz reveal / gust)
    const f = Math.max(flash * 0.6, revealPulse * 0.35);
    if (f > 0.001){
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = f;
      ctx.fillStyle = 'rgba(220,255,255,1)';
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
  }

  function draw(ctx){
    const horizon = h * (0.42 + Math.sin(t * 0.05) * 0.01);

    drawSky(ctx, horizon);
    drawOcean(ctx, horizon);
    drawGull(ctx);

    // Determine current flag pose for the signal boat.
    const s = cur();
    let flags = null;

    if (s.kind === 'letter'){
      const pose = SEM[s.letter] || SEM.A;
      flags = { aPos: pose[0], bPos: pose[1], snap: gust * 0.25 };
    } else if (s.kind === 'quiz'){
      const idx = Math.min(s.word.length - 1, Math.floor(segT / s.letterDur));
      const ch = s.word[idx] || 'A';
      const pose = SEM[ch] || SEM.A;
      flags = { aPos: pose[0], bPos: pose[1], snap: gust * 0.25 };
    } else if (s.kind === 'end'){
      const pose = SEM.CANCEL;
      flags = { aPos: pose[0], bPos: pose[1], snap: gust * 0.25 };
    }

    // Boats: far -> mid -> signal.
    for (const b of boats){
      const isSignal = b.layer === 'signal';
      drawBoat(ctx, b, horizon, isSignal ? flags : null);
    }

    // Foreground vignette
    ctx.save();
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.55, Math.min(w, h) * 0.1, w * 0.5, h * 0.55, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    drawUI(ctx, horizon);
  }

  return {
    onResize,
    onAudioOn,
    onAudioOff,
    update,
    draw,
    destroy,
  };
}
