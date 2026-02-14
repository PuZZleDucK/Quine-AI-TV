import { mulberry32, clamp } from '../util/prng.js';

// Robot Petting Zoo
// Cute micro-robots exhibit simple behaviors (curious/shy/playful) in a stylized enclosure UI.

function pick(rand, a){ return a[(rand() * a.length) | 0]; }

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

function lerp(a,b,t){ return a + (b-a)*t; }

const ROBOTS = [
  { name: 'Nib', form: 'wheely', vibe: 'curious', fav: 'shiny bolts' },
  { name: 'Pip', form: 'bouncy', vibe: 'playful', fav: 'boops' },
  { name: 'Moss', form: 'spider', vibe: 'shy', fav: 'quiet corners' },
  { name: 'Dot', form: 'hover', vibe: 'curious', fav: 'laser pointers' },
  { name: 'Kiki', form: 'wheely', vibe: 'playful', fav: 'ramps' },
  { name: 'Sprocket', form: 'spider', vibe: 'curious', fav: 'tiny gears' },
];

const BEHAVIORS = [
  { id: 'curious', label: 'CURIOUS', tip: 'Approaches, sniffs, pauses.' },
  { id: 'shy', label: 'SHY', tip: 'Hides, peeks, retreats.' },
  { id: 'playful', label: 'PLAYFUL', tip: 'Bounces, spins, zooms.' },
];

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w=0, h=0, t=0;
  let font=16, small=12;

  const SEG_DUR = 55; // seconds per robot exhibit
  let order = [];
  let idx = 0;
  let segT = 0;

  // robot state (0..1 in pen)
  let rx = 0.5, ry = 0.55;
  let vx = 0, vy = 0;
  let rot = 0;
  let blink = 0;
  let battery = 0.85;

  let palette = null;

  // audio handle
  let ah = null;

  function shuffled(arr){
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--){
      const j = (rand() * (i + 1)) | 0;
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function curRobot(){
    return order[idx] || ROBOTS[0];
  }

  function curBehavior(){
    const r = curRobot();
    // the robot has a "vibe", but we also let it drift a little.
    const drift = (Math.sin(t * 0.07 + idx * 1.3) * 0.5 + 0.5);
    if (drift < 0.18) return BEHAVIORS[1];
    if (drift > 0.84) return BEHAVIORS[2];
    return BEHAVIORS.find(b => b.id === r.vibe) || BEHAVIORS[0];
  }

  function buildPalette(){
    const schemes = [
      { bg0:'#0a1218', bg1:'#04070a', ui:'#6cf2ff', a:'#ffd36b', b:'#ff5aa5', pen:'#13222a' },
      { bg0:'#0f0b18', bg1:'#04020a', ui:'#b2a4ff', a:'#63ffb6', b:'#ff7a59', pen:'#1c132a' },
      { bg0:'#071319', bg1:'#020507', ui:'#9ad7ff', a:'#ffd36b', b:'#7cffc6', pen:'#112028' },
    ];
    return pick(rand, schemes);
  }

  function reseedRobot(){
    palette = buildPalette();

    // start somewhere sensible
    rx = 0.45 + (rand()-0.5)*0.15;
    ry = 0.55 + (rand()-0.5)*0.15;
    vx = (rand()-0.5) * 0.08;
    vy = (rand()-0.5) * 0.08;
    rot = rand() * Math.PI * 2;
    blink = 0;

    // new battery reading
    battery = 0.55 + rand() * 0.45;

    // tiny "exhibit chirp"
    if (audio.enabled){
      audio.beep({ freq: 520 + rand()*140, dur: 0.04, gain: 0.028, type: 'square' });
      audio.beep({ freq: 820 + rand()*120, dur: 0.03, gain: 0.018, type: 'sine' });
    }
  }

  function nextRobot(){
    idx++;
    if (idx >= order.length) idx = 0;
    segT = 0;
    reseedRobot();
  }

  function init({ width, height }){
    w = width; h = height; t = 0;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));

    order = shuffled(ROBOTS);
    idx = 0;
    segT = 0;
    reseedRobot();
  }

  function onResize(width, height){
    w = width; h = height;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));
  }

  function makeAudioHandle(){
    const ctx = audio.ensure();

    const out = ctx.createGain();
    out.gain.value = 0.82;
    out.connect(audio.master);

    // soft mechanical ambience: lowpassed pink noise + a very quiet "motor" tone
    const noise = audio.noiseSource({ type: 'pink', gain: 0.03 });
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 560;
    lpf.Q.value = 0.8;

    noise.src.disconnect();
    noise.src.connect(noise.gain);
    noise.gain.disconnect();
    noise.gain.connect(lpf);
    lpf.connect(out);

    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = 48 + rand()*8;
    og.gain.value = 0.018;
    o.connect(og);
    og.connect(out);

    noise.start();
    o.start();

    return {
      stop(){
        const now = ctx.currentTime;
        try { out.gain.setTargetAtTime(0.0001, now, 0.09); } catch {}
        try { noise.stop(); } catch {}
        try { o.stop(now + 0.2); } catch {}
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

    if (segT >= SEG_DUR) nextRobot();

    // blinking eyes (cute, not uncanny)
    blink -= dt;
    if (blink <= 0 && rand() < 0.02) blink = 0.12 + rand() * 0.12;

    const beh = curBehavior().id;

    // pen bounds (inset so the robot doesn't clip)
    const minX = 0.14, maxX = 0.86;
    const minY = 0.24, maxY = 0.86;

    // target point ("petting hand" hover) drifts around
    const hx = 0.5 + 0.22 * Math.sin(t * 0.19 + idx);
    const hy = 0.52 + 0.20 * Math.sin(t * 0.23 + idx * 2.1);

    if (beh === 'curious'){
      const ax = (hx - rx) * 0.25;
      const ay = (hy - ry) * 0.25;
      vx = vx * 0.92 + ax * dt;
      vy = vy * 0.92 + ay * dt;
      // tiny pauses
      const pause = 0.55 + 0.45 * Math.sin(t * 0.9 + idx);
      vx *= lerp(0.35, 1.0, pause);
      vy *= lerp(0.35, 1.0, pause);
    } else if (beh === 'shy'){
      // flee to the farthest corner from the hand
      const corners = [
        {x:minX,y:minY},{x:maxX,y:minY},{x:minX,y:maxY},{x:maxX,y:maxY}
      ];
      let best = corners[0], bestD = -1;
      for (const c of corners){
        const dx = c.x - hx, dy = c.y - hy;
        const d = dx*dx + dy*dy;
        if (d > bestD){ bestD = d; best = c; }
      }
      const ax = (best.x - rx) * 0.20;
      const ay = (best.y - ry) * 0.20;
      vx = vx * 0.90 + ax * dt;
      vy = vy * 0.90 + ay * dt;
      // peeking wobble
      vx += Math.sin(t * 1.7 + idx) * 0.0009;
      vy += Math.cos(t * 1.9 + idx) * 0.0009;
    } else {
      // playful
      vx += Math.sin(t * 2.0 + idx) * 0.002;
      vy += Math.cos(t * 2.2 + idx * 1.3) * 0.002;
      // orbit the hand
      const ax = (hx - rx) * 0.12;
      const ay = (hy - ry) * 0.12;
      vx = vx * 0.96 + ay * dt;
      vy = vy * 0.96 - ax * dt;
    }

    // integrate
    rx = clamp(rx + vx, minX, maxX);
    ry = clamp(ry + vy, minY, maxY);

    // bounce off walls
    if (rx === minX || rx === maxX){
      vx *= -0.85;
      if (audio.enabled && rand() < 0.06) audio.beep({freq: 320 + rand()*80, dur: 0.02, gain: 0.012, type: 'square'});
    }
    if (ry === minY || ry === maxY){
      vy *= -0.85;
      if (audio.enabled && rand() < 0.06) audio.beep({freq: 280 + rand()*70, dur: 0.02, gain: 0.012, type: 'square'});
    }

    // rotation follows motion
    rot = Math.atan2(vy, vx);

    // battery slowly changes
    battery = clamp(battery + (Math.sin(t * 0.05 + idx) * 0.0008) - 0.00015 * dt, 0.12, 0.98);
  }

  function drawBackground(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, palette?.bg0 || '#0a1218');
    g.addColorStop(0.55, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, palette?.bg1 || '#04070a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // soft bloom
    const sp = ctx.createRadialGradient(w*0.45, h*0.4, 0, w*0.45, h*0.4, Math.max(w,h)*0.8);
    sp.addColorStop(0, 'rgba(255,255,255,0.06)');
    sp.addColorStop(1, 'rgba(0,0,0,0.78)');
    ctx.fillStyle = sp;
    ctx.fillRect(0, 0, w, h);
  }

  function drawPen(ctx, x, y, ww, hh){
    ctx.save();
    // shadow
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, x+10, y+14, ww, hh, 22);
    ctx.fill();

    // pen
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette?.pen || '#13222a';
    roundRect(ctx, x, y, ww, hh, 22);
    ctx.fill();

    // grid
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = 'rgba(231,238,246,0.65)';
    ctx.lineWidth = 1;
    const step = Math.max(18, Math.floor(Math.min(ww, hh) / 12));
    for (let xx = x + step; xx < x + ww; xx += step){
      ctx.beginPath();
      ctx.moveTo(xx, y);
      ctx.lineTo(xx, y + hh);
      ctx.stroke();
    }
    for (let yy = y + step; yy < y + hh; yy += step){
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + ww, yy);
      ctx.stroke();
    }

    // fence highlight
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = 'rgba(108,242,255,0.55)';
    ctx.lineWidth = Math.max(2, Math.floor(font * 0.16));
    roundRect(ctx, x+4, y+4, ww-8, hh-8, 20);
    ctx.stroke();

    ctx.restore();
  }

  function drawHand(ctx, px, py, size){
    // simple petting "hand" icon (semi-transparent)
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = 'rgba(231,238,246,0.95)';
    ctx.beginPath();
    roundRect(ctx, px - size*0.42, py - size*0.22, size*0.84, size*0.64, size*0.18);
    ctx.fill();

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = palette?.ui || '#6cf2ff';
    ctx.beginPath();
    ctx.arc(px + size*0.22, py - size*0.12, size*0.18, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function drawRobot(ctx, robot, beh, x, y, s){
    const body = robot.form;
    const ui = palette?.ui || '#6cf2ff';
    const a = palette?.a || '#ffd36b';
    const b = palette?.b || '#ff5aa5';

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.beginPath();
    ctx.ellipse(x, y + s*0.34, s*0.52, s*0.22, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);

    // playful gets a little spin
    const spin = beh === 'playful' ? Math.sin(t * 2.2) * 0.18 : 0;
    ctx.rotate(rot * 0.35 + spin);

    // body
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(22, 30, 38, 0.95)';
    ctx.strokeStyle = 'rgba(231,238,246,0.25)';
    ctx.lineWidth = Math.max(2, Math.floor(s * 0.06));

    if (body === 'hover'){
      roundRect(ctx, -s*0.45, -s*0.26, s*0.90, s*0.52, s*0.22);
      ctx.fill();
      ctx.stroke();
      // hover glow
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = ui;
      ctx.beginPath();
      ctx.ellipse(0, s*0.28, s*0.36, s*0.10, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 0.95;
    } else if (body === 'spider'){
      roundRect(ctx, -s*0.35, -s*0.26, s*0.70, s*0.52, s*0.22);
      ctx.fill();
      ctx.stroke();
      // legs
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = 'rgba(231,238,246,0.22)';
      ctx.lineWidth = Math.max(1, Math.floor(s * 0.05));
      for (let i=0;i<4;i++){
        const side = i<2 ? -1 : 1;
        const yy = (-0.18 + (i%2)*0.36) * s;
        ctx.beginPath();
        ctx.moveTo(side * s*0.30, yy);
        ctx.lineTo(side * s*0.55, yy + side * s*0.10);
        ctx.lineTo(side * s*0.68, yy + side * s*0.22);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.95;
    } else {
      // wheely / bouncy
      const rr = body === 'bouncy' ? s*0.30 : s*0.22;
      ctx.beginPath();
      ctx.moveTo(-s*0.45 + rr, -s*0.28);
      ctx.arcTo(s*0.45, -s*0.28, s*0.45, s*0.28, rr);
      ctx.arcTo(s*0.45, s*0.28, -s*0.45, s*0.28, rr);
      ctx.arcTo(-s*0.45, s*0.28, -s*0.45, -s*0.28, rr);
      ctx.arcTo(-s*0.45, -s*0.28, s*0.45, -s*0.28, rr);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // wheels
      if (body === 'wheely'){
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.arc(-s*0.26, s*0.24, s*0.12, 0, Math.PI*2);
        ctx.arc(s*0.26, s*0.24, s*0.12, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 0.95;
      }
    }

    // face panel
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(ctx, -s*0.26, -s*0.12, s*0.52, s*0.28, s*0.12);
    ctx.fill();

    // eyes
    const closed = blink > 0;
    const eyeY = -s*0.01;
    const eyeDX = s*0.10;

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = ui;
    if (!closed){
      ctx.beginPath();
      ctx.arc(-eyeDX, eyeY, s*0.045, 0, Math.PI*2);
      ctx.arc(eyeDX, eyeY, s*0.045, 0, Math.PI*2);
      ctx.fill();

      // pupils: track "hand" a little via behavior
      const px = beh === 'shy' ? -0.25 : (beh === 'playful' ? 0.25 : 0.10);
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.beginPath();
      ctx.arc(-eyeDX + s*0.018*px, eyeY + s*0.008, s*0.018, 0, Math.PI*2);
      ctx.arc(eyeDX + s*0.018*px, eyeY + s*0.008, s*0.018, 0, Math.PI*2);
      ctx.fill();
    } else {
      ctx.globalAlpha = 0.75;
      ctx.strokeStyle = ui;
      ctx.lineWidth = Math.max(2, Math.floor(s * 0.05));
      ctx.beginPath();
      ctx.moveTo(-eyeDX - s*0.04, eyeY);
      ctx.lineTo(-eyeDX + s*0.04, eyeY);
      ctx.moveTo(eyeDX - s*0.04, eyeY);
      ctx.lineTo(eyeDX + s*0.04, eyeY);
      ctx.stroke();
    }

    // antenna / accent
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = a;
    ctx.lineWidth = Math.max(1, Math.floor(s * 0.05));
    ctx.beginPath();
    ctx.moveTo(0, -s*0.28);
    ctx.lineTo(0, -s*0.44);
    ctx.stroke();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = b;
    ctx.beginPath();
    ctx.arc(0, -s*0.48, s*0.06, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!palette) palette = buildPalette();

    drawBackground(ctx);

    const s = Math.min(w, h);
    const penW = Math.floor(w * 0.78);
    const penH = Math.floor(h * 0.70);
    const penX = Math.floor(w * 0.11);
    const penY = Math.floor(h * 0.14);

    drawPen(ctx, penX, penY, penW, penH);

    // hand hover point inside pen
    const hx = penX + penW * (0.5 + 0.22 * Math.sin(t * 0.19 + idx));
    const hy = penY + penH * (0.45 + 0.18 * Math.sin(t * 0.23 + idx * 2.1));
    drawHand(ctx, hx, hy, Math.floor(s * 0.10));

    // robot position (normalized inside pen)
    const px = penX + penW * rx;
    const py = penY + penH * ry;

    const r = curRobot();
    const b = curBehavior();
    const rs = Math.floor(s * 0.16);
    drawRobot(ctx, r, b.id, px, py, rs);

    // UI overlay panel
    const panelW = Math.floor(w * 0.34);
    const panelH = Math.floor(h * 0.24);
    const panelX = Math.floor(w * 0.06);
    const panelY = Math.floor(h * 0.70);

    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    roundRect(ctx, panelX + 6, panelY + 8, panelW, panelH, 16);
    ctx.fill();

    ctx.fillStyle = 'rgba(10, 14, 22, 0.78)';
    roundRect(ctx, panelX, panelY, panelW, panelH, 16);
    ctx.fill();

    // header stripe
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = palette.ui;
    ctx.fillRect(panelX, panelY + Math.floor(font * 1.55), panelW, 2);

    // title
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.font = `${Math.floor(font * 1.05)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText('ROBOT PETTING ZOO', panelX + Math.floor(font * 0.8), panelY + Math.floor(font * 0.35));

    // robot name
    ctx.globalAlpha = 0.94;
    ctx.font = `${Math.floor(font * 1.20)}px ui-sans-serif, system-ui`;
    ctx.fillText(r.name, panelX + Math.floor(font * 0.8), panelY + Math.floor(font * 2.05));

    // behavior tag
    ctx.globalAlpha = 0.88;
    ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = palette.a;
    ctx.fillText(`BEHAVIOR: ${b.label}`, panelX + Math.floor(font * 0.8), panelY + Math.floor(font * 3.55));

    // battery bar
    const barX = panelX + Math.floor(font * 0.8);
    const barY = panelY + Math.floor(font * 4.75);
    const barW = panelW - Math.floor(font * 1.6);
    const barH = Math.max(10, Math.floor(font * 0.55));

    ctx.globalAlpha = 0.30;
    ctx.fillStyle = 'rgba(231,238,246,0.9)';
    roundRect(ctx, barX, barY, barW, barH, 8);
    ctx.fill();

    ctx.globalAlpha = 0.78;
    ctx.fillStyle = (battery > 0.28) ? palette.ui : palette.b;
    roundRect(ctx, barX, barY, barW * battery, barH, 8);
    ctx.fill();

    ctx.globalAlpha = 0.75;
    ctx.fillStyle = 'rgba(231,238,246,0.78)';
    ctx.font = `${Math.floor(small * 0.95)}px ui-sans-serif, system-ui`;
    ctx.fillText(`Battery`, barX, barY - Math.floor(small * 1.25));

    // tip line
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = 'rgba(231,238,246,0.74)';
    ctx.font = `${Math.floor(small * 0.92)}px ui-sans-serif, system-ui`;
    ctx.fillText(b.tip, barX, barY + Math.floor(barH + small * 0.55));

    // favorite
    ctx.globalAlpha = 0.70;
    ctx.fillStyle = palette.b;
    ctx.font = `${Math.floor(small * 0.92)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`FAV: ${r.fav}`, barX, barY + Math.floor(barH + small * 1.75));

    ctx.restore();

    // top-right "exhibit timer" chip
    const rem = Math.max(0, Math.ceil(SEG_DUR - segT));
    const chip = `EXHIBIT  •  ${String(rem).padStart(2,'0')}s`;
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.font = `${Math.floor(small * 0.9)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const tw = Math.ceil(ctx.measureText(chip).width);
    const cx = Math.floor(w - tw - font * 1.4);
    const cy = Math.floor(h * 0.06);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    roundRect(ctx, cx + 4, cy + 6, tw + font*0.9, Math.floor(small * 1.7), 12);
    ctx.fill();
    ctx.fillStyle = 'rgba(10, 14, 22, 0.75)';
    roundRect(ctx, cx, cy, tw + font*0.9, Math.floor(small * 1.7), 12);
    ctx.fill();
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = 'rgba(231,238,246,0.82)';
    ctx.textBaseline = 'middle';
    ctx.fillText(chip, cx + Math.floor(font*0.45), cy + Math.floor(small * 0.85));
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
