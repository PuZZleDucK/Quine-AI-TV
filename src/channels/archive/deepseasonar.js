import { mulberry32, clamp } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';

// REVIEWED: 2026-02-12
// Deep Sea Sonar Survey
// - circular sonar scope + range rings
// - phase-based "mission" loop
// - contact bloom/fade + classification log
// - rare BIG ECHO moment

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, dpr = 1;
  let t = 0;

  // layout
  let cx = 0, cy = 0, R = 0;

  // phases
  let phases = [];
  let phaseIdx = 0;
  let phaseT = 0;

  // sweep / pings
  let sweep = 0;
  let pingT = 0;
  let pingPulse = 0; // 0..1 (expanding ring)

  // big echo moment
  let bigEcho = null; // {t0, a, r}
  let nextBigEchoAt = 0;

  // contacts
  const MAX_CONTACTS = 52;
  const contacts = Array.from({ length: MAX_CONTACTS }, () => ({ alive: 0 }));

  // recent classification log
  const LOG_MAX = 7;
  let log = [];

  // background bubbles (layered motion)
  let bubbles = [];

  // deterministic speckle noise points in scope
  let specks = [];

  let ambience = null;

  function pick(arr){ return arr[(rand() * arr.length) | 0]; }
  function lerp(a, b, p){ return a + (b - a) * p; }
  function ease(p){ return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
  function angDiff(a, b){
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function regen(){
    // scope geometry
    cx = w * 0.46;
    cy = h * 0.54;
    R = Math.min(w, h) * 0.40;

    // phases are deterministic but varied per seed
    phases = [
      { id: 'transit', name: 'TRANSIT', dur: 42, sweepSpd: 0.38, pingEvery: 2.1, spawn: 4.5, noise: 0.55 },
      { id: 'survey', name: 'SURVEY', dur: 56, sweepSpd: 0.52, pingEvery: 1.65, spawn: 7.0, noise: 0.40 },
      { id: 'track', name: 'TRACK', dur: 52, sweepSpd: 0.46, pingEvery: 1.8, spawn: 5.4, noise: 0.32 },
      { id: 'anomaly', name: 'ANOMALY', dur: 48, sweepSpd: 0.58, pingEvery: 1.45, spawn: 7.8, noise: 0.62 },
    ].map(ph => ({
      ...ph,
      dur: ph.dur * (0.85 + rand() * 0.35),
      pingEvery: ph.pingEvery * (0.85 + rand() * 0.30),
      spawn: ph.spawn * (0.85 + rand() * 0.35),
      sweepSpd: ph.sweepSpd * (0.90 + rand() * 0.25),
    }));

    phaseIdx = 0;
    phaseT = 0;
    sweep = rand();
    pingT = 0.2 + rand() * 0.8;
    pingPulse = 0;

    log = [];

    // bubbles in the background (not the scope)
    const bubbleCount = Math.max(24, Math.floor((w * h) / 42000));
    bubbles = Array.from({ length: bubbleCount }, () => ({
      x: rand() * w,
      y: rand() * h,
      r: (0.8 + rand() * 2.3) * (dpr >= 2 ? 1.0 : 1.1),
      vy: (6 + rand() * 18) * (0.75 + rand() * 0.7),
      phase: rand() * Math.PI * 2,
    }));

    // speckle points inside scope (deterministic)
    const speckCount = 140;
    specks = Array.from({ length: speckCount }, () => {
      const rr = Math.sqrt(rand());
      const aa = rand() * Math.PI * 2;
      return {
        a: aa,
        r: rr,
        k: 0.6 + rand() * 1.6,
        p: rand() * Math.PI * 2,
      };
    });

    // schedule first big echo in anomaly phase (rare-ish)
    // it will be rescheduled on each anomaly entry
    nextBigEchoAt = 999999;
    bigEcho = null;

    // seed initial contacts
    for (const c of contacts) c.alive = 0;
    for (let i = 0; i < 18; i++) spawnContact();

    onPhaseEnter();
  }

  function onPhaseEnter(){
    const ph = phases[phaseIdx];

    // schedule big echo only during anomaly; keep it rare
    if (ph.id === 'anomaly'){
      nextBigEchoAt = t + 10 + rand() * 18;
    } else {
      nextBigEchoAt = 999999;
    }

    // soft UI click
    if (audio.enabled) audio.beep({ freq: 380 + rand() * 160, dur: 0.016, gain: 0.006, type: 'square' });
  }

  function addLog(text){
    log.unshift({ text, age: 0 });
    if (log.length > LOG_MAX) log.pop();
  }

  function spawnContact({ a, r, strengthMul = 1 } = {}){
    let slot = null;
    for (const c of contacts){ if (c.alive <= 0){ slot = c; break; } }
    if (!slot) return;

    const kinds = [
      { id: 'BIO', w: 3 },
      { id: 'WRECK', w: 1 },
      { id: 'ROCK', w: 2 },
      { id: 'THERM', w: 1 },
      { id: 'SURF', w: 1 },
      { id: 'UNK', w: 2 },
    ];
    let sum = 0;
    for (const k of kinds) sum += k.w;
    let pickv = rand() * sum;
    let kind = 'UNK';
    for (const k of kinds){
      pickv -= k.w;
      if (pickv <= 0){ kind = k.id; break; }
    }

    const rr = r != null ? r : (0.10 + Math.pow(rand(), 1.2) * 0.82);
    const aa = a != null ? a : rand() * Math.PI * 2;

    const life = 1.4 + rand() * 2.6;
    slot.alive = 1;
    slot.a = aa;
    slot.r = rr;
    slot.kind = kind;
    slot.life = life;
    slot.maxLife = life;
    slot.base = 0.22 + rand() * 0.85;
    slot.str = (0.45 + rand() * 0.75) * strengthMul;
    slot.bloom = 0;
    slot.lastSeen = -999;
    slot.j = rand() * Math.PI * 2;
  }

  function triggerPing({ loud = false } = {}){
    pingPulse = 0.0001;

    if (audio.enabled){
      audio.beep({
        freq: loud ? (180 + rand() * 60) : (320 + rand() * 90),
        dur: loud ? 0.10 : 0.06,
        gain: loud ? 0.030 : 0.016,
        type: loud ? 'triangle' : 'sine',
      });
      // a tiny high chirp on top makes it feel "sonar-y"
      if (loud) setTimeout(() => {
        if (audio.enabled) audio.beep({ freq: 880 + rand() * 220, dur: 0.030, gain: 0.010, type: 'sine' });
      }, 90);
    }
  }

  function triggerBigEcho(){
    const a = rand() * Math.PI * 2;
    const r = 0.18 + rand() * 0.62;
    bigEcho = { t0: t, a, r };

    // spawn a contact cluster around the echo bearing
    const n = 9 + ((rand() * 6) | 0);
    for (let i = 0; i < n; i++){
      const da = (rand() - 0.5) * 0.35;
      const dr = (rand() - 0.5) * 0.18;
      spawnContact({ a: a + da, r: clamp(r + dr, 0.08, 0.95), strengthMul: 1.4 });
    }

    addLog(`BIG ECHO  BRG ${(a * 180 / Math.PI) | 0}°`);
    triggerPing({ loud: true });
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;
    t = 0;
    regen();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    const n = audio.noiseSource({ type: 'pink', gain: 0.0027 + rand() * 0.0013 });
    n.start();

    const d = simpleDrone(audio, { root: 44 + rand() * 22, detune: 1.0, gain: 0.012 });

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

  function update(dt){
    t += dt;

    // phase progression
    phaseT += dt;
    if (phaseT >= phases[phaseIdx].dur){
      phaseT = phaseT % phases[phaseIdx].dur;
      phaseIdx = (phaseIdx + 1) % phases.length;
      onPhaseEnter();
    }
    const ph = phases[phaseIdx];

    // sweep
    sweep = (sweep + dt * ph.sweepSpd) % 1;

    // ping
    pingT -= dt;
    if (pingT <= 0){
      pingT = ph.pingEvery * (0.85 + rand() * 0.35);
      triggerPing();
    }
    if (pingPulse > 0) pingPulse = Math.min(1, pingPulse + dt * 0.55);

    // big echo event (only in anomaly)
    if (t >= nextBigEchoAt){
      nextBigEchoAt = 999999;
      triggerBigEcho();
    }

    // contacts: decay + occasional respawn
    const respawnRate = ph.spawn;
    let respawns = dt * respawnRate;
    while (respawns >= 1){
      respawns -= 1;
      spawnContact();
    }
    if (rand() < respawns) spawnContact();

    const beamAng = sweep * Math.PI * 2;
    const beamWidth = 0.16; // radians

    for (const c of contacts){
      if (c.alive <= 0) continue;

      c.life -= dt;
      if (c.life <= 0){ c.alive = 0; continue; }

      // gentle drift (bearing + range) - deterministic (no PRNG in hot path)
      c.a += dt * (0.06 + 0.08 * Math.sin(t * 0.25 + c.j));
      c.r = clamp(c.r + dt * (0.004 * Math.sin(t * 0.35 + c.j * 2)), 0.06, 0.98);

      c.bloom = Math.max(0, c.bloom - dt * 0.75);

      // "detect" when the sweep passes the contact
      const d = Math.abs(angDiff(c.a, beamAng));
      if (d < beamWidth){
        const strength = (1 - d / beamWidth) * c.str;
        c.bloom = Math.max(c.bloom, strength);

        if ((t - c.lastSeen) > 2.2 && strength > 0.55){
          c.lastSeen = t;
          const brg = ((c.a * 180 / Math.PI) | 0);
          const rng = ((c.r * 100) | 0);
          addLog(`${c.kind.padEnd(5)} BRG ${String(brg).padStart(3,' ')}°  RNG ${String(rng).padStart(2,'0')}`);
          if (audio.enabled) audio.beep({ freq: 900 + rand() * 260, dur: 0.018, gain: 0.006, type: 'triangle' });
        }
      }
    }

    // log aging
    for (const it of log) it.age += dt;

    // bubbles
    for (const b of bubbles){
      b.y -= b.vy * dt;
      b.x += Math.sin(t * 0.35 + b.phase) * dt * 7;
      if (b.y < -20) { b.y = h + 20; b.x = rand() * w; }
      if (b.x < -30) b.x = w + 30;
      if (b.x > w + 30) b.x = -30;
    }
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#01040a');
    bg.addColorStop(1, '#000007');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // drifting bubbles (midground layer)
    ctx.save();
    for (const b of bubbles){
      const a = 0.07 + 0.06 * (0.5 + 0.5 * Math.sin(t * 0.7 + b.phase));
      ctx.strokeStyle = `rgba(140,220,255,${a})`;
      ctx.lineWidth = Math.max(1, Math.floor(h / 820));
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // scope background disk
    ctx.save();
    ctx.translate(cx, cy);
    const disk = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.05);
    disk.addColorStop(0, 'rgba(0,22,20,0.92)');
    disk.addColorStop(1, 'rgba(0,4,6,0.98)');
    ctx.fillStyle = disk;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.03, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // rings + bearing ticks
    ctx.save();
    ctx.translate(cx, cy);
    const lw = Math.max(1, Math.floor(Math.min(w, h) / 620));
    ctx.lineWidth = lw;

    // rings
    for (let i = 1; i <= 5; i++){
      const rr = (R * i) / 5;
      ctx.strokeStyle = 'rgba(120,255,220,0.12)';
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // ticks
    for (let i = 0; i < 36; i++){
      const a = (i / 36) * Math.PI * 2;
      const isCard = (i % 9) === 0;
      const r0 = R * (isCard ? 0.96 : 0.985);
      const r1 = R * 1.01;
      ctx.strokeStyle = isCard ? 'rgba(170,255,235,0.20)' : 'rgba(120,255,220,0.12)';
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.stroke();
    }

    // crosshair
    ctx.strokeStyle = 'rgba(120,255,220,0.10)';
    ctx.beginPath();
    ctx.moveTo(-R, 0);
    ctx.lineTo(R, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -R);
    ctx.lineTo(0, R);
    ctx.stroke();

    ctx.restore();

    // deterministic scope speckle noise (background texture inside scope)
    ctx.save();
    ctx.translate(cx, cy);
    for (const s of specks){
      const x = Math.cos(s.a) * (s.r * R);
      const y = Math.sin(s.a) * (s.r * R);
      const a = 0.05 + 0.06 * (0.5 + 0.5 * Math.sin(t * s.k + s.p));
      ctx.fillStyle = `rgba(90,255,210,${a})`;
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();

    // sweep beam
    const ph = phases[phaseIdx];
    const beamAng = sweep * Math.PI * 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(beamAng);

    const beamGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    beamGrad.addColorStop(0, 'rgba(120,255,220,0.00)');
    beamGrad.addColorStop(0.12, 'rgba(120,255,220,0.08)');
    beamGrad.addColorStop(0.55, 'rgba(120,255,220,0.03)');
    beamGrad.addColorStop(1, 'rgba(120,255,220,0.00)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, -0.18, 0.18);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(190,255,240,0.45)';
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w, h) / 720));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(R, 0);
    ctx.stroke();

    ctx.restore();

    // ping pulse (expanding ring)
    if (pingPulse > 0){
      const p = pingPulse;
      const rr = R * (0.02 + p * 1.05);
      const a = (1 - p) * 0.18;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = `rgba(160,255,235,${a})`;
      ctx.lineWidth = Math.max(1, Math.floor(Math.min(w, h) / 760));
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (pingPulse >= 1) pingPulse = 0;
    }

    // contacts
    ctx.save();
    ctx.translate(cx, cy);
    for (const c of contacts){
      if (c.alive <= 0) continue;
      const age = 1 - c.life / c.maxLife;
      const fade = 0.15 + 0.85 * Math.max(0, 1 - age);
      const strength = clamp((c.base + c.bloom * 0.85) * fade, 0, 1);

      const x = Math.cos(c.a) * (c.r * R);
      const y = Math.sin(c.a) * (c.r * R);

      const rad = lerp(6, 12, c.bloom) * (0.9 + 0.25 * Math.sin(t * 1.4 + c.j));
      const gg = ctx.createRadialGradient(x, y, 0, x, y, rad);
      gg.addColorStop(0, `rgba(160,255,235,${0.10 + strength * 0.35})`);
      gg.addColorStop(1, 'rgba(160,255,235,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();

      // tiny point
      ctx.fillStyle = `rgba(200,255,245,${0.08 + strength * 0.35})`;
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
    ctx.restore();

    // BIG ECHO overlay
    if (bigEcho){
      const p = clamp((t - bigEcho.t0) / 3.2, 0, 1);
      const rr = R * (bigEcho.r + p * 0.85);
      const a = (1 - p) * 0.32;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = `rgba(255,230,160,${a})`;
      ctx.lineWidth = Math.max(1, Math.floor(Math.min(w, h) / 680));
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.stroke();

      // bearing wedge highlight
      ctx.rotate(bigEcho.a);
      ctx.fillStyle = `rgba(255,220,140,${a * 0.35})`;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, -0.08, 0.08);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      if (p >= 1) bigEcho = null;
    }

    // interference band in anomaly phase (foreground texture)
    if (ph.id === 'anomaly'){
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalCompositeOperation = 'screen';
      const bandY = (Math.sin(t * 0.35) * 0.25) * R;
      const bandH = R * 0.18;
      const grad = ctx.createLinearGradient(0, bandY - bandH, 0, bandY + bandH);
      grad.addColorStop(0, 'rgba(120,255,220,0)');
      grad.addColorStop(0.5, 'rgba(120,255,220,0.06)');
      grad.addColorStop(1, 'rgba(120,255,220,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.rect(-R, bandY - bandH, R * 2, bandH * 2);
      ctx.fill();
      ctx.restore();
    }

    // scope frame
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(160,255,235,0.25)';
    ctx.lineWidth = Math.max(2, Math.floor(Math.min(w, h) / 420));
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.03, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // UI text
    const font = Math.max(14, Math.floor(Math.min(w, h) / 32));
    const mono = `${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const small = `${Math.max(11, Math.floor(font * 0.78))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

    ctx.save();
    ctx.font = mono;
    ctx.fillStyle = 'rgba(190,255,240,0.80)';
    ctx.fillText('DEEP SEA SONAR', w * 0.05, h * 0.12);
    ctx.font = small;
    ctx.fillStyle = 'rgba(190,255,240,0.60)';
    ctx.fillText(`MODE ${ph.name}`, w * 0.05, h * 0.155);
    ctx.fillText(`SWEEP ${(beamAng * 180 / Math.PI) | 0}°`, w * 0.05, h * 0.185);
    ctx.restore();

    // classification panel
    const panelX = w * 0.66;
    const panelY = h * 0.16;
    const panelW = w * 0.30;
    const panelH = h * 0.40;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 20, 22, 0.40)';
    ctx.strokeStyle = 'rgba(160,255,235,0.18)';
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w, h) / 760));
    ctx.beginPath();
    roundRect(ctx, panelX, panelY, panelW, panelH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.font = small;
    ctx.fillStyle = 'rgba(190,255,240,0.70)';
    ctx.fillText('CLASSIFY / LOG', panelX + panelW * 0.06, panelY + panelH * 0.12);

    ctx.font = `${Math.max(10, Math.floor(font * 0.72))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const lineH = Math.max(14, Math.floor(font * 1.05));
    let yy = panelY + panelH * 0.22;
    for (const it of log){
      const a = clamp(1 - it.age / 14, 0, 1);
      ctx.fillStyle = `rgba(200,255,245,${0.18 + a * 0.62})`;
      ctx.fillText(it.text, panelX + panelW * 0.06, yy);
      yy += lineH;
    }

    // status strip
    ctx.fillStyle = 'rgba(160,255,235,0.10)';
    ctx.fillRect(panelX, panelY + panelH + h * 0.02, panelW, h * 0.055);
    ctx.fillStyle = 'rgba(190,255,240,0.65)';
    ctx.fillText('RANGE 00-99  |  GAIN AUTO', panelX + panelW * 0.06, panelY + panelH + h * 0.057);

    ctx.restore();
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

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
