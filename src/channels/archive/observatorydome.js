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

function circle(ctx, x, y, r){
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  // visual identity: crisp observatory UI + dome silhouette
  const palettes = [
    { bg0:'#040615', bg1:'#0a1029', ink:'#eaf6ff', sub:'rgba(234,246,255,0.62)', accent:'#6cf2ff', ok:'#8dffb0', warn:'#ff6a3a', bad:'#ff4ea6', dome:'#0b0d16', rim:'rgba(255,255,255,0.08)', cloud:'rgba(180,220,255,0.10)' },
    { bg0:'#050311', bg1:'#120a24', ink:'#fff6ec', sub:'rgba(255,246,236,0.60)', accent:'#ff7ad6', ok:'#7cffc9', warn:'#ffcc6a', bad:'#ff4ea6', dome:'#0c0714', rim:'rgba(255,255,255,0.07)', cloud:'rgba(255,170,230,0.08)' },
    { bg0:'#03060c', bg1:'#0b1a24', ink:'#eafff6', sub:'rgba(234,255,246,0.56)', accent:'#7affff', ok:'#a8ff7a', warn:'#ffd36a', bad:'#ff5a7a', dome:'#050e12', rim:'rgba(255,255,255,0.07)', cloud:'rgba(190,255,255,0.08)' },
  ];
  const pal = pick(rand, palettes);

  // layout
  let pad = 40;
  let hud = { x:0, y:0, w:0, h:0 };
  let dome = { cx:0, cy:0, r:0 };
  let cards = { x:0, y:0, w:0, h:0 };

  // typography
  let font = 16;
  let small = 12;
  let mono = 13;

  // background layers
  let starsFar = [];
  let starsNear = [];
  let clouds = [];

  // schedule
  const TARGETS = [
    { name: 'M31 ANDROMEDA', tag: 'GALAXY' },
    { name: 'M42 ORION', tag: 'NEBULA' },
    { name: 'JUPITER', tag: 'PLANET' },
    { name: 'SATURN', tag: 'PLANET' },
    { name: 'PLEIADES M45', tag: 'CLUSTER' },
    { name: 'OMEGA CENTAURI', tag: 'CLUSTER' },
    { name: 'CARINA NEBULA', tag: 'NEBULA' },
    { name: 'LUNAR TERMINATOR', tag: 'MOON' },
    { name: 'CRUX / COALSACK', tag: 'DARK' },
    { name: 'SOUTHERN RING', tag: 'NEBULA' },
  ];

  const PHASES = [
    { id:'setup', label:'CALIBRATE', dur: 12 },
    { id:'t1', label:'SLEW + TRACK', dur: 16 },
    { id:'t2', label:'SLEW + TRACK', dur: 16 },
    { id:'t3', label:'SLEW + TRACK', dur: 16 },
    { id:'meteor', label:'METEOR WINDOW', dur: 10 },
    { id:'wrap', label:'LOG + PARK', dur: 12 },
  ];
  const CYCLE_DUR = PHASES.reduce((s,p)=>s+p.dur, 0);

  let plan = []; // {phaseId, label, time, target, az}
  let phaseIdx = 0;
  let phaseT0 = 0;
  let nextPhaseAt = 0;

  // dome motion
  let domeAng = 0;
  let domeAngTarget = 0;
  let domeOpen = 0;

  // weather
  let cloudCover = 0.2;
  let cloudPulse = rand() * Math.PI * 2;

  // special moments
  let stamp = { a:0, text:'', color: pal.accent };
  let go = 0;
  let nextGoAt = 0;
  let meteors = []; // {x,y,vx,vy,life}

  // audio
  let ambience = null;
  let musicHandle = null;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function fmtClock(mins){
    const hh = Math.floor(mins / 60) % 24;
    const mm = Math.floor(mins % 60);
    const H = hh.toString().padStart(2, '0');
    const M = mm.toString().padStart(2, '0');
    return `${H}:${M}`;
  }

  function buildPlan(){
    // choose targets deterministically
    const picks = [];
    while (picks.length < 3){
      const t0 = pick(rand, TARGETS);
      if (!picks.find(p => p.name === t0.name)) picks.push(t0);
    }

    const baseTime = 22 * 60 + ((rand() * 50) | 0); // 22:00-ish
    const gaps = [0, 18, 36, 54, 66, 78];

    plan = PHASES.map((p, i) => {
      let target = null;
      if (p.id === 't1') target = picks[0];
      if (p.id === 't2') target = picks[1];
      if (p.id === 't3') target = picks[2];
      if (p.id === 'meteor') target = { name: 'PERSEID WATCH', tag: 'EVENT' };
      if (p.id === 'setup') target = { name: 'FLAT FIELD', tag: 'CAL' };
      if (p.id === 'wrap') target = { name: 'PARK DOME', tag: 'END' };

      // azimuth target angle (radians): left(-) to right(+)
      const az = (-0.9 + rand()*1.8) * (Math.PI * 0.35);

      return {
        phaseId: p.id,
        label: p.label,
        time: fmtClock(baseTime + gaps[i]),
        target,
        az,
      };
    });
  }

  function regenLayout(){
    const base = Math.min(w, h);
    pad = Math.floor(base * 0.06);

    hud.x = pad;
    hud.y = pad;
    hud.w = w - pad * 2;
    hud.h = h - pad * 2;

    const cardW = Math.floor(hud.w * 0.34);
    cards.w = clamp(cardW, 260, Math.floor(hud.w * 0.45));
    cards.x = hud.x + hud.w - cards.w;
    cards.y = hud.y + Math.floor(hud.h * 0.14);
    cards.h = Math.floor(hud.h * 0.74);

    dome.r = Math.floor(base * 0.36);
    dome.cx = hud.x + Math.floor(hud.w * 0.36);
    dome.cy = hud.y + Math.floor(hud.h * 0.72);

    font = Math.max(14, Math.floor(base / 30));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(12, Math.floor(font * 0.86));

    // stars (deterministic)
    starsFar = Array.from({ length: 240 }, () => ({
      x: rand() * w,
      y: rand() * h * 0.62,
      z: 0.25 + rand() * 0.9,
      tw: rand() * 10,
      a: 0.25 + rand() * 0.55,
    }));
    starsNear = Array.from({ length: 90 }, () => ({
      x: rand() * w,
      y: rand() * h * 0.56,
      z: 0.8 + rand() * 1.6,
      tw: rand() * 8,
      a: 0.35 + rand() * 0.65,
    }));

    clouds = Array.from({ length: 7 }, () => ({
      x: rand() * w,
      y: h * (0.08 + rand() * 0.25),
      s: 0.8 + rand() * 2.2,
      ph: rand() * Math.PI * 2,
    }));
  }

  function setPhase(idx){
    phaseIdx = idx;
    phaseT0 = t;
    nextPhaseAt = t + PHASES[phaseIdx].dur;

    const p = PHASES[phaseIdx];
    const item = plan[phaseIdx];

    // dome targets
    domeAngTarget = item?.az ?? 0;

    // dome open amount (setup opens, wrap closes)
    if (p.id === 'setup') domeOpen = 0.2;
    if (p.id === 'wrap') domeOpen = 0.35;
    if (p.id === 'meteor') domeOpen = 0.55;

    // UI stamp
    stamp.a = 1;
    stamp.text = (p.id === 'meteor') ? 'WINDOW' : (p.id === 'wrap') ? 'PARK' : (p.id === 'setup') ? 'CAL' : 'TRACK';
    stamp.color = (p.id === 'meteor') ? pal.ok : pal.accent;

    // audio cues
    if (p.id === 'meteor'){
      safeBeep({ freq: 880, dur: 0.03, gain: 0.014, type: 'square' });
      safeBeep({ freq: 660, dur: 0.05, gain: 0.012, type: 'triangle' });
    } else {
      safeBeep({ freq: 520 + rand()*80, dur: 0.02, gain: 0.010, type: 'square' });
    }

    // schedule the "go" moment during meteor window
    if (p.id === 'meteor'){
      go = 0;
      nextGoAt = t + 1.2 + rand()*2.2;
    }
  }

  function onResize(width, height, _dpr){
    w = width;
    h = height;
    dpr = _dpr || 1;
    t = 0;

    buildPlan();
    regenLayout();

    domeAng = plan[0]?.az ?? 0;
    domeAngTarget = domeAng;

    meteors = [];
    stamp.a = 0;
    domeOpen = 0.18;

    cloudPulse = rand() * Math.PI * 2;

    setPhase(0);
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    ambience = simpleDrone(audio, { root: 55, detune: 1.2, gain: 0.045 });
    musicHandle = {
      stop(){
        try { ambience?.stop?.(); } catch {}
      },
    };
    audio.setCurrent(musicHandle);
  }

  function onAudioOff(){
    try { musicHandle?.stop?.(); } catch {}
    ambience = null;
    musicHandle = null;
  }

  function destroy(){
    onAudioOff();
  }

  function spawnMeteor(){
    const startX = w * (0.15 + rand() * 0.7);
    const startY = h * (0.06 + rand() * 0.22);
    meteors.push({
      x: startX,
      y: startY,
      vx: -(w * (0.25 + rand() * 0.22)),
      vy: h * (0.10 + rand() * 0.18),
      life: 0.7 + rand() * 0.5,
    });
    if (meteors.length > 6) meteors.shift();
  }

  function update(dt){
    t += dt;

    // smooth dome angle
    const aErr = domeAngTarget - domeAng;
    domeAng += aErr * (1 - Math.exp(-dt * 2.6));

    // weather: slow, deterministic drift
    cloudPulse += dt * (0.14 + rand() * 0.02);
    const coverBase = 0.18 + 0.32 * (0.5 + 0.5 * Math.sin(cloudPulse));
    const coverNoise = 0.18 * (0.5 + 0.5 * Math.sin(cloudPulse * 1.7 + 1.3));
    cloudCover = clamp(coverBase + coverNoise, 0, 0.95);

    // stamps + go
    stamp.a = Math.max(0, stamp.a - dt * 0.75);
    go = Math.max(0, go - dt * 0.8);

    // phase switching
    if (t >= nextPhaseAt){
      const next = (phaseIdx + 1) % PHASES.length;
      if (next === 0){
        // new night plan every loop for variety (still seed-deterministic)
        buildPlan();
      }
      setPhase(next);
    }

    const phase = PHASES[phaseIdx];

    // dome opening animation by phase
    const openTarget = (phase.id === 'wrap') ? 0.1 : (phase.id === 'setup') ? 0.25 : (phase.id === 'meteor') ? 0.6 : 0.42;
    domeOpen = lerp(domeOpen, openTarget, 1 - Math.exp(-dt * 1.7));

    // meteor window special moment
    if (phase.id === 'meteor'){
      if (t >= nextGoAt){
        nextGoAt = t + 2.2 + rand() * 1.8;
        if (cloudCover < 0.52){
          go = 1;
          spawnMeteor();
          safeBeep({ freq: 990, dur: 0.02, gain: 0.012, type: 'square' });
          safeBeep({ freq: 1320, dur: 0.02, gain: 0.008, type: 'triangle' });
        } else {
          // too cloudy: show a brief warning pulse
          stamp.a = 1;
          stamp.text = 'HOLD';
          stamp.color = pal.warn;
          safeBeep({ freq: 220, dur: 0.05, gain: 0.010, type: 'sawtooth' });
        }
      }
    }

    // update meteors
    for (const m of meteors){
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.life -= dt;
    }
    meteors = meteors.filter(m => m.life > 0 && m.x > -w*0.3 && m.y < h*0.8);
  }

  function drawSky(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal.bg0);
    g.addColorStop(0.55, pal.bg1);
    g.addColorStop(1, '#02030a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // horizon glow
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const hz = dome.cy - dome.r * 0.2;
    ctx.fillStyle = `rgba(120, 220, 255, ${0.04 + (1 - cloudCover) * 0.06})`;
    ctx.fillRect(0, hz, w, h - hz);
    ctx.restore();

    // stars: layered parallax
    function drawStars(list, drift){
      for (const s of list){
        const tw = 0.6 + 0.4 * Math.sin(t * 0.6 + s.tw);
        const a = s.a * tw;
        const x = (s.x + t * drift * s.z) % w;
        const y = s.y;
        const r = (1.1 + 1.6 * (s.z)) * 0.7;
        ctx.fillStyle = `rgba(240, 250, 255, ${a})`;
        ctx.fillRect(x, y, r, r);
      }
    }

    drawStars(starsFar, 6);
    drawStars(starsNear, 12);

    // meteors (screen blend)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const m of meteors){
      const k = clamp(m.life / 0.8, 0, 1);
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.22 + 0.45 * k})`;
      ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.003);
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - m.vx * 0.05, m.y - m.vy * 0.05);
      ctx.stroke();
    }
    ctx.restore();

    // clouds
    const cloudAlpha = 0.14 + cloudCover * 0.52;
    for (const c of clouds){
      const x = (c.x + t * 8 * (0.35 + 0.4/c.s)) % (w + 200) - 100;
      const y = c.y + Math.sin(t*0.12 + c.ph) * 10;
      const sx = 160 * c.s;
      const sy = 44 * c.s;

      ctx.save();
      ctx.translate(x, y);
      ctx.globalAlpha = cloudAlpha;
      ctx.fillStyle = pal.cloud;

      for (let i=0;i<4;i++){
        const ox = (i-1.2) * sx * 0.35;
        const oy = Math.sin(c.ph + i) * sy * 0.12;
        circle(ctx, ox, oy, sx * (0.22 + i*0.03));
        ctx.fill();
      }

      ctx.restore();
    }
  }

  function drawDome(ctx){
    // ground base
    ctx.fillStyle = pal.dome;
    ctx.fillRect(0, dome.cy, w, h - dome.cy);

    // dome silhouette
    ctx.save();
    ctx.translate(dome.cx, dome.cy);

    // dome body
    circle(ctx, 0, 0, dome.r);
    ctx.fillStyle = pal.dome;
    ctx.fill();

    // subtle rim
    ctx.strokeStyle = pal.rim;
    ctx.lineWidth = Math.max(1, dome.r * 0.02);
    ctx.stroke();

    // slit opening
    const slitW = dome.r * (0.16 + domeOpen * 0.22);
    const slitH = dome.r * (0.62 + domeOpen * 0.12);
    ctx.rotate(domeAng);

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    roundedRect(ctx, -slitW*0.5, -slitH*0.75, slitW, slitH, slitW*0.45);
    ctx.fill();
    ctx.restore();

    // inside glow
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const glow = 0.06 + (1 - cloudCover) * 0.10 + go * 0.14;
    ctx.fillStyle = `rgba(120, 220, 255, ${glow})`;
    roundedRect(ctx, -slitW*0.42, -slitH*0.68, slitW*0.84, slitH*0.92, slitW*0.45);
    ctx.fill();
    ctx.restore();

    // crosshair line
    ctx.strokeStyle = `rgba(255,255,255,${0.12 + go*0.35})`;
    ctx.lineWidth = Math.max(1, dome.r * 0.008);
    ctx.beginPath();
    ctx.moveTo(0, -dome.r * 0.8);
    ctx.lineTo(0, -dome.r * 0.15);
    ctx.stroke();

    ctx.restore();

    // small mount/console
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundedRect(ctx, dome.cx - dome.r*0.42, dome.cy + dome.r*0.18, dome.r*0.84, dome.r*0.22, dome.r*0.06);
    ctx.fill();

    // status ring
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(108, 242, 255, ${0.06 + (1-cloudCover)*0.10})`;
    ctx.lineWidth = Math.max(1, dome.r*0.012);
    ctx.beginPath();
    ctx.arc(dome.cx, dome.cy, dome.r*1.06, Math.PI*1.05, Math.PI*1.95);
    ctx.stroke();
    ctx.restore();
  }

  function drawHUD(ctx){
    const phase = PHASES[phaseIdx];
    const item = plan[phaseIdx];

    ctx.save();
    ctx.fillStyle = pal.ink;
    ctx.font = `600 ${font}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.textBaseline = 'top';

    ctx.fillText('OBSERVATORY DOME SCHEDULER', hud.x, hud.y);

    // top status pills
    const statusX = hud.x;
    const statusY = hud.y + font + 10;

    const sky = cloudCover < 0.33 ? 'CLEAR' : cloudCover < 0.62 ? 'PATCHY' : 'CLOUDY';
    const skyCol = cloudCover < 0.33 ? pal.ok : cloudCover < 0.62 ? pal.warn : pal.bad;

    ctx.font = `600 ${small}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;

    const pill = (x, y, text, col) => {
      const padX = 10;
      const padY = 6;
      const tw = ctx.measureText(text).width;
      const pw = tw + padX*2;
      const ph = small + padY*2;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      roundedRect(ctx, x, y, pw, ph, ph*0.5);
      ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,0.09)`;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = col;
      ctx.fillText(text, x + padX, y + padY);
      return pw;
    };

    let x = statusX;
    x += pill(x, statusY, `SKY ${sky}`, skyCol) + 10;

    const timeText = item?.time ? `SLOT ${item.time}` : 'SLOT --:--';
    x += pill(x, statusY, timeText, pal.accent) + 10;

    const phaseText = phase?.label || '---';
    pill(x, statusY, phaseText, pal.sub);

    // stamp tag (brief)
    if (stamp.a > 0.01){
      ctx.save();
      ctx.globalAlpha = stamp.a;
      ctx.font = `800 ${small}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      const text = stamp.text;
      const tw = ctx.measureText(text).width;
      const bx = hud.x + 2;
      const by = statusY + small + 18;
      const bw = tw + 18;
      const bh = small + 14;
      ctx.strokeStyle = stamp.color;
      ctx.lineWidth = 2;
      roundedRect(ctx, bx, by, bw, bh, 10);
      ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      roundedRect(ctx, bx, by, bw, bh, 10);
      ctx.fill();
      ctx.fillStyle = stamp.color;
      ctx.fillText(text, bx + 9, by + 7);
      ctx.restore();
    }

    // cards panel
    const cardCount = 5;
    const cardH = Math.max(60, Math.floor(cards.h / (cardCount + 0.3)));
    const gap = Math.max(10, Math.floor(cardH * 0.16));

    ctx.font = `600 ${small}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.fillStyle = pal.sub;
    ctx.fillText('SCHEDULE', cards.x, cards.y - small - 10);

    for (let i=0; i<cardCount; i++){
      const idx = (phaseIdx + i) % plan.length;
      const it = plan[idx];
      const y = cards.y + i * (cardH + gap);
      const isNow = (i === 0);

      const slide = ease(Math.min(1, (t - phaseT0) / 0.8));
      const offset = isNow ? lerp(18, 0, slide) : 0;

      // frame
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      roundedRect(ctx, cards.x + offset, y, cards.w - offset, cardH, 16);
      ctx.fill();
      ctx.strokeStyle = isNow ? `rgba(255,255,255,0.16)` : `rgba(255,255,255,0.08)`;
      ctx.lineWidth = isNow ? 2 : 1;
      ctx.stroke();

      // header
      ctx.fillStyle = isNow ? pal.accent : pal.sub;
      ctx.fillText(it.time, cards.x + 16 + offset, y + 12);

      // target
      ctx.fillStyle = pal.ink;
      ctx.font = `700 ${Math.max(14, Math.floor(font*0.95))}px system-ui, -apple-system, Segoe UI, sans-serif`;
      ctx.fillText(it.target.name, cards.x + 16 + offset, y + 30);

      ctx.font = `600 ${small}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
      ctx.fillStyle = pal.sub;
      ctx.fillText(it.target.tag, cards.x + 16 + offset, y + cardH - 18);

      if (isNow){
        // small condition readout
        const cond = (PHASES[phaseIdx].id === 'meteor')
          ? (cloudCover < 0.52 ? 'CONDITIONS: GO' : 'CONDITIONS: HOLD')
          : `CLOUD ${Math.round(cloudCover * 100)}%`;
        ctx.fillStyle = (PHASES[phaseIdx].id === 'meteor')
          ? (cloudCover < 0.52 ? pal.ok : pal.warn)
          : pal.sub;
        ctx.fillText(cond, cards.x + 16 + offset, y + cardH - 36);
      }

      ctx.font = `600 ${small}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    }

    // subtle grid
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    const step = Math.max(26, Math.floor(Math.min(w, h) * 0.05));
    for (let gx=0; gx<w; gx+=step){
      ctx.beginPath();
      ctx.moveTo(gx + 0.5, 0);
      ctx.lineTo(gx + 0.5, h);
      ctx.stroke();
    }
    for (let gy=0; gy<h; gy+=step){
      ctx.beginPath();
      ctx.moveTo(0, gy + 0.5);
      ctx.lineTo(w, gy + 0.5);
      ctx.stroke();
    }
    ctx.restore();

    ctx.restore();
  }

  function draw(ctx){
    drawSky(ctx);
    drawDome(ctx);
    drawHUD(ctx);

    // vignette
    ctx.save();
    const vg = ctx.createRadialGradient(w*0.5, h*0.55, Math.min(w,h)*0.2, w*0.5, h*0.55, Math.max(w,h)*0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0,0,w,h);
    ctx.restore();
  }

  return {
    onResize,
    update,
    draw,
    destroy,
    onAudioOn,
    onAudioOff,
  };
}
