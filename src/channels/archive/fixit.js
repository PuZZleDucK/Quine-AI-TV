import { mulberry32, clamp } from '../../util/prng.js';

// REVIEWED: 2026-02-13

function pick(rand, a){ return a[(rand() * a.length) | 0]; }

function shuffleInPlace(rand, a){
  for (let i = a.length - 1; i > 0; i--){
    const j = (rand() * (i + 1)) | 0;
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

const FOOTER_CAPTIONS = [
  // Keep these short-ish and OSD-safe; we ellipsize, but this reads best when concise.
  // 45 captions × 9s = 6m45s deterministic rotation with no repeats.
  'no talking • gentle clicks • slow repairs',
  'torque to spec • wipe down • repeat',
  'diagnosing vibes • not faults',
  'calibrating the tiny screwdriver',
  'soft zip sounds • crisp snaps',
  'bench reset • tool return ritual',
  'dust removed with extreme patience',
  'tighten until it feels correct',
  'align • press • test glide',
  'micro-adjustments only',
  'please hold while we fix the universe',
  'repair note: found one (1) loose vibe',
  'repair note: gremlin relocated',
  'repair note: applied more tape than necessary',
  'repair note: tightened by feel, not ego',
  '#asmr #clicks #quietcompetence',
  '#workshop #tinytools #slowtv',
  'quality control: gentle tap test',
  'quality control: squint at it',
  'faint graphite smell (imagined)',
  'tool check: pliers • wrench • tape',
  'do not rush the satisfying part',
  'repair speed: leisurely',
  'if it wiggles, we listen',
  'silence punctuated by success',
  'screw turns: 1… 2… perfect',
  'wipe lens • breathe • done',
  'zipper therapy session ongoing',
  'chair leg: now emotionally stable',
  'cable patch: stronger than before',
  'work order: tiny fix, big peace',
  'set down the tool. admire. continue.',
  'notes: minimal drama, maximum snug',
  'ambient pink noise, workshop edition',
  'inventory: one mystery screw (missing)',
  'we fix it gently, so it stays fixed',
  'tighten, then stop. stop!',
  'alignment achieved: probably',
  'this is the good part.',
  'repair log: click… click… click…',
  'confirm: nothing squeaks (for now)',
  'cleanup: put tools back like a saint',
  'bench vibes: immaculate',
  'operator status: calm',
  'end of note: proceed with softness',
];

function ellipsize(ctx, text, maxW){
  if (!text) return '';
  if (ctx.measureText(text).width <= maxW) return text;
  const ell = '…';
  let lo = 0;
  let hi = text.length;
  while (lo < hi){
    const mid = ((lo + hi) / 2) | 0;
    const s = text.slice(0, mid).trimEnd() + ell;
    if (ctx.measureText(s).width <= maxW) lo = mid + 1;
    else hi = mid;
  }
  const cut = Math.max(0, lo - 1);
  return text.slice(0, cut).trimEnd() + ell;
}

const REPAIRS = [
  {
    id: 'zipper',
    title: 'Zipper Alignment',
    tool: 'pliers',
    palette: { a: '#6cf2ff', b: '#ff5aa5' },
    steps: [
      { label: 'inspect', dur: 4.5, action: 'hover', sound: null },
      { label: 'clean track', dur: 8.0, action: 'brush', sound: 'brush' },
      { label: 'align teeth', dur: 9.5, action: 'zip', sound: 'zip' },
      { label: 'crimp pull', dur: 7.5, action: 'press', sound: 'click' },
      { label: 'apply wax', dur: 6.5, action: 'press', sound: 'click-soft' },
      { label: 'final glide', dur: 4.5, action: 'zip', sound: 'zip-soft' },
    ],
  },
  {
    id: 'glasses',
    title: 'Glasses Screw Tighten',
    tool: 'screwdriver',
    palette: { a: '#9ad7ff', b: '#63ffb6' },
    steps: [
      { label: 'inspect hinge', dur: 4.0, action: 'hover', sound: null },
      { label: 'tighten', dur: 10.0, action: 'screw', sound: 'screw' },
      { label: 'apply threadlock', dur: 7.5, action: 'press', sound: 'click-soft' },
      { label: 're-tighten', dur: 8.0, action: 'screw', sound: 'screw-low' },
      { label: 'wipe lens', dur: 6.5, action: 'brush', sound: 'brush' },
      { label: 'fold + unfold', dur: 5.0, action: 'tap', sound: 'tap' },
    ],
  },
  {
    id: 'chair',
    title: 'Chair Leg Wobble Fix',
    tool: 'wrench',
    palette: { a: '#ffd66b', b: '#6cf2ff' },
    steps: [
      { label: 'find wobble', dur: 4.0, action: 'tap', sound: 'tap' },
      { label: 'tighten bolt', dur: 11.0, action: 'screw', sound: 'screw-low' },
      { label: 'add felt pad', dur: 7.5, action: 'press', sound: 'click-soft' },
      { label: 'level pad', dur: 7.0, action: 'press', sound: 'click-soft' },
      { label: 're-tighten', dur: 7.5, action: 'screw', sound: 'screw-low' },
      { label: 'test stability', dur: 4.5, action: 'tap', sound: 'tap' },
    ],
  },
  {
    id: 'cable',
    title: 'Headphone Cable Patch',
    tool: 'tape',
    palette: { a: '#ff7a59', b: '#63ffb6' },
    steps: [
      { label: 'locate break', dur: 4.0, action: 'hover', sound: null },
      { label: 'prep sleeve', dur: 7.5, action: 'wrap', sound: 'wrap' },
      { label: 'wrap tape', dur: 12.0, action: 'wrap', sound: 'wrap' },
      { label: 'press + smooth', dur: 8.0, action: 'press', sound: 'click-soft' },
      { label: 'add strain loop', dur: 7.0, action: 'wrap', sound: 'wrap' },
      { label: 'test flex', dur: 6.0, action: 'tap', sound: 'tap' },
    ],
  },
  {
    id: 'remote',
    title: 'Remote Button De-stick',
    tool: 'screwdriver',
    palette: { a: '#b28dff', b: '#63ffb6' },
    steps: [
      { label: 'inspect', dur: 4.0, action: 'hover', sound: null },
      { label: 'open shell', dur: 12.0, action: 'screw', sound: 'screw' },
      { label: 'clean contacts', dur: 9.0, action: 'brush', sound: 'brush' },
      { label: 're-seat membrane', dur: 7.0, action: 'press', sound: 'click-soft' },
      { label: 'test click', dur: 5.0, action: 'tap', sound: 'tap' },
    ],
  },
  {
    id: 'mug',
    title: 'Mug Handle Re-glue',
    tool: 'tape',
    palette: { a: '#ffb86c', b: '#b28dff' },
    steps: [
      { label: 'inspect chip', dur: 4.0, action: 'hover', sound: null },
      { label: 'apply glue', dur: 9.0, action: 'press', sound: 'click-soft' },
      { label: 'wrap clamp', dur: 12.0, action: 'wrap', sound: 'wrap' },
      { label: 'wait set', dur: 10.0, action: 'hover', sound: null },
      { label: 'remove wrap', dur: 5.0, action: 'wrap', sound: 'wrap' },
      { label: 'tap test', dur: 4.0, action: 'tap', sound: 'tap' },
    ],
  },
  {
    id: 'lamp',
    title: 'Lamp Switch Clean + Reseat',
    tool: 'pliers',
    palette: { a: '#7aa2ff', b: '#ffcf6e' },
    steps: [
      { label: 'inspect', dur: 4.0, action: 'hover', sound: null },
      { label: 'open housing', dur: 9.0, action: 'press', sound: 'click' },
      { label: 'bend contacts', dur: 10.0, action: 'press', sound: 'click-soft' },
      { label: 'brush debris', dur: 8.0, action: 'brush', sound: 'brush' },
      { label: 're-seat cap', dur: 8.0, action: 'press', sound: 'click-soft' },
      { label: 'test toggle', dur: 5.0, action: 'tap', sound: 'tap' },
    ],
  },
  {
    id: 'keyboard',
    title: 'Keyboard Keycap Reseat',
    tool: 'pliers',
    palette: { a: '#a6ff7a', b: '#9ad7ff' },
    steps: [
      { label: 'inspect wobble', dur: 4.0, action: 'hover', sound: null },
      { label: 'pry keycap', dur: 8.0, action: 'press', sound: 'click' },
      { label: 'align stabilizer', dur: 10.0, action: 'press', sound: 'click-soft' },
      { label: 'seat keycap', dur: 7.0, action: 'press', sound: 'click' },
      { label: 'brush crumbs', dur: 7.0, action: 'brush', sound: 'brush' },
      { label: 'tap test', dur: 5.0, action: 'tap', sound: 'tap' },
    ],
  },
  {
    id: 'frame',
    title: 'Picture Frame Corner Tighten',
    tool: 'wrench',
    palette: { a: '#ffd66b', b: '#b28dff' },
    steps: [
      { label: 'inspect miter', dur: 4.0, action: 'hover', sound: null },
      { label: 'tighten bracket', dur: 12.0, action: 'screw', sound: 'screw-low' },
      { label: 'add corner pad', dur: 8.0, action: 'press', sound: 'click-soft' },
      { label: 'tape backing', dur: 9.0, action: 'wrap', sound: 'wrap' },
      { label: 'brush glass', dur: 7.0, action: 'brush', sound: 'brush' },
      { label: 'hang test', dur: 4.0, action: 'tap', sound: 'tap' },
    ],
  },
  {
    id: 'hinge',
    title: 'Door Hinge De-squeak',
    tool: 'wrench',
    palette: { a: '#6cf2ff', b: '#ff7a59' },
    steps: [
      { label: 'listen', dur: 4.0, action: 'hover', sound: null },
      { label: 'tighten screws', dur: 12.0, action: 'screw', sound: 'screw-low' },
      { label: 'wick oil', dur: 8.0, action: 'press', sound: 'click-soft' },
      { label: 'wiggle hinge', dur: 9.0, action: 'tap', sound: 'tap' },
      { label: 'wipe excess', dur: 8.0, action: 'brush', sound: 'brush' },
      { label: 'test swing', dur: 5.0, action: 'tap', sound: 'tap' },
    ],
  },
  {
    id: 'usb',
    title: 'USB Plug Straighten + Reinforce',
    tool: 'pliers',
    palette: { a: '#ff7ad9', b: '#6cf2ff' },
    steps: [
      { label: 'inspect pins', dur: 4.0, action: 'hover', sound: null },
      { label: 'straighten shell', dur: 10.0, action: 'press', sound: 'click-soft' },
      { label: 'wipe contacts', dur: 8.0, action: 'brush', sound: 'brush' },
      { label: 'tape strain relief', dur: 10.0, action: 'wrap', sound: 'wrap' },
      { label: 'press housing', dur: 6.0, action: 'press', sound: 'click-soft' },
      { label: 'test plug', dur: 5.0, action: 'tap', sound: 'tap' },
    ],
  },
];

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  // Separate RNG for rare deterministic “special moments” (~45–120s cadence; seeded).
  const momentRand = mulberry32(((seed ^ 0x2c1b3c6d) >>> 0));

  // Separate RNG so captions stay deterministic without consuming the visual PRNG.
  const captionRand = mulberry32(((seed ^ 0x9e3779b9) >>> 0));
  const captionOrder = shuffleInPlace(captionRand, FOOTER_CAPTIONS.slice());
  const captionDur = 9.0;

  // Separate RNG for long-period “mood” cycles.
  const phaseRand = mulberry32(((seed ^ 0x85ebca6b) >>> 0));

  const PHASES = [
    // 2–4 minute deterministic cycle: cooler/slow → warmer → focused/fast → loop.
    { warm: 0.15, vig: 0.25, pace: 0.88 },
    { warm: 0.95, vig: 0.45, pace: 0.96 },
    { warm: 0.60, vig: 0.85, pace: 1.12 },
  ];

  let phaseT = 0;
  let phaseCycleDur = 180;
  let phaseWarm = 0.2;
  let phaseVig = 0.4;
  let phasePace = 1.0;

  // Rare deterministic “special moments”: scheduled off a separate PRNG and timer so
  // they don’t consume the visual RNG or drift with framerate.
  const SPECIAL_MOMENTS = ['lamp-flicker', 'success-stamp', 'dust-puff'];
  let momentNext = 60;
  let momentKind = null;
  let momentT = 0;
  let momentDur = 0;
  let dustPuff = null;

  function scheduleNextMoment(){
    momentNext = 45 + momentRand() * 75;
  }

  function clearMoment(){
    momentKind = null;
    momentT = 0;
    momentDur = 0;
    dustPuff = null;
  }

  function startMoment(){
    momentKind = pick(momentRand, SPECIAL_MOMENTS);
    momentT = 0;

    if (momentKind === 'lamp-flicker') momentDur = 1.8 + momentRand() * 1.0;
    else if (momentKind === 'success-stamp') momentDur = 2.2 + momentRand() * 1.2;
    else if (momentKind === 'dust-puff') momentDur = 1.7 + momentRand() * 1.0;
    else momentDur = 2.2;

    if (momentKind === 'dust-puff'){
      const n = 14 + ((momentRand() * 8) | 0);
      dustPuff = Array.from({ length: n }, () => ({
        ox: (momentRand() * 2 - 1),
        oy: (momentRand() * 2 - 1),
        vx: (momentRand() * 2 - 1),
        vy: (momentRand() * 2 - 1),
        r: 1.5 + momentRand() * 6,
      }));
    }

    // Small audio signature (subtle, OSD-safe).
    if (audio.enabled){
      if (momentKind === 'success-stamp'){
        audio.beep({ freq: 880, dur: 0.02, gain: 0.01, type: 'sine' });
        audio.beep({ freq: 1320, dur: 0.02, gain: 0.008, type: 'sine' });
      } else if (momentKind === 'lamp-flicker'){
        audio.beep({ freq: 420, dur: 0.03, gain: 0.008, type: 'triangle' });
      } else if (momentKind === 'dust-puff'){
        audio.beep({ freq: 760, dur: 0.018, gain: 0.006, type: 'triangle' });
      }
    }
  }

  function smooth01(x){ return x * x * (3 - 2 * x); }
  function lerp(a, b, x){ return a + (b - a) * x; }

  function updatePhase(dt){
    phaseT += dt;
    if (phaseT >= phaseCycleDur) phaseT -= phaseCycleDur * Math.floor(phaseT / phaseCycleDur);

    const n = PHASES.length;
    const segDur = phaseCycleDur / n;
    const seg = Math.floor(phaseT / segDur) % n;
    const segP = (phaseT - seg * segDur) / segDur;

    const a = PHASES[seg];
    const b = PHASES[(seg + 1) % n];
    const e = smooth01(clamp(segP, 0, 1));

    phaseWarm = lerp(a.warm, b.warm, e);
    phaseVig = lerp(a.vig, b.vig, e);
    phasePace = lerp(a.pace, b.pace, e);
  }

  let w = 0, h = 0, t = 0;
  let font = 16;
  let small = 12;

  let repair = null;
  let stepIndex = 0;
  let stepT = 0;

  let sfxAcc = 0;
  let ambience = null; // handle registered with AudioManager

  function stopAmbience({ clearCurrentIfOwned = false } = {}){
    if (!ambience) return;
    const h = ambience;
    ambience = null;

    // Only clear AudioManager.current if this channel still owns it.
    if (clearCurrentIfOwned && audio.current === h){
      try { audio.stopCurrent(); } catch {}
      return;
    }

    // Otherwise, just stop our handle without touching whatever is current.
    try { h.stop?.(); } catch {}
  }

  function curStep(){
    return repair?.steps?.[stepIndex] || null;
  }

  function nextRepair(){
    repair = pick(rand, REPAIRS);
    stepIndex = 0;
    stepT = 0;
    sfxAcc = 0;
  }

  function init({ width, height }){
    w = width;
    h = height;
    t = 0;

    phaseCycleDur = 120 + phaseRand() * 120;
    phaseT = phaseRand() * phaseCycleDur;
    updatePhase(0);

    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));

    nextRepair();

    clearMoment();
    scheduleNextMoment();
  }

  function onResize(width, height){
    init({ width, height });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // Idempotent: if we're already the current audio owner, do nothing.
    if (audio.current === ambience) return;

    // Stop any stale handle we still reference (without killing the real current).
    stopAmbience();

    const n = audio.noiseSource({ type: 'pink', gain: 0.006 });
    n.start();

    let stopped = false;
    const handle = {
      stop(){
        if (stopped) return;
        stopped = true;
        const ctx = audio.ensure();
        // Fade to avoid clicks, then stop a moment later.
        try { n.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.06); } catch {}
        try { n.src.stop(ctx.currentTime + 0.25); } catch { try { n.stop(); } catch {} }
      },
    };

    ambience = audio.setCurrent(handle);
  }

  function onAudioOff(){
    stopAmbience({ clearCurrentIfOwned: true });
  }

  function destroy(){
    onAudioOff();
  }

  function stepTransitionSound(){
    if (!audio.enabled) return;
    audio.beep({ freq: 520 + rand() * 140, dur: 0.03, gain: 0.014, type: 'triangle' });
  }

  function sfx(kind, intensity){
    if (!audio.enabled) return;
    const x = clamp(intensity ?? 0.5, 0, 1);

    if (kind === 'screw'){
      audio.beep({ freq: 1600 + rand() * 500, dur: 0.012, gain: 0.008 + x * 0.01, type: 'square' });
    } else if (kind === 'screw-low'){
      audio.beep({ freq: 820 + rand() * 220, dur: 0.016, gain: 0.01 + x * 0.01, type: 'triangle' });
    } else if (kind === 'zip'){
      audio.beep({ freq: 820 + rand() * 380 + x * 240, dur: 0.008, gain: 0.006 + x * 0.009, type: 'triangle' });
    } else if (kind === 'zip-soft'){
      audio.beep({ freq: 660 + rand() * 260 + x * 160, dur: 0.008, gain: 0.004 + x * 0.006, type: 'triangle' });
    } else if (kind === 'click'){
      audio.beep({ freq: 2100 + rand() * 600, dur: 0.01, gain: 0.008 + x * 0.012, type: 'square' });
    } else if (kind === 'click-soft'){
      audio.beep({ freq: 1500 + rand() * 500, dur: 0.01, gain: 0.006 + x * 0.009, type: 'square' });
    } else if (kind === 'tap'){
      audio.beep({ freq: 520 + rand() * 240, dur: 0.018, gain: 0.008 + x * 0.01, type: 'sine' });
    } else if (kind === 'brush'){
      audio.beep({ freq: 2800 + rand() * 700, dur: 0.006, gain: 0.003 + x * 0.004, type: 'triangle' });
    } else if (kind === 'wrap'){
      audio.beep({ freq: 980 + rand() * 220, dur: 0.009, gain: 0.005 + x * 0.006, type: 'triangle' });
    }
  }

  function update(dt){
    // Special moments: schedule/advance using real dt (not phase-paced t).
    if (momentKind){
      momentT += dt;
      if (momentT >= momentDur){
        clearMoment();
        scheduleNextMoment();
      }
    } else {
      momentNext -= dt;
      if (momentNext <= 0){
        startMoment();
      }
    }

    updatePhase(dt);
    t += dt * phasePace;

    if (!repair) nextRepair();

    const step = curStep();
    if (!step){
      nextRepair();
      return;
    }

    stepT += dt;
    const p = clamp(stepT / step.dur, 0, 1);

    // drive sounds
    if (audio.enabled && step.sound){
      let rate = 0;
      if (step.sound === 'screw' || step.sound === 'screw-low') rate = 12;
      else if (step.sound === 'zip') rate = 28;
      else if (step.sound === 'zip-soft') rate = 18;
      else if (step.sound === 'brush') rate = 22;
      else if (step.sound === 'wrap') rate = 20;
      else if (step.sound === 'click' || step.sound === 'click-soft') rate = 7;
      else if (step.sound === 'tap') rate = 5;

      // fade in/out the density so it feels less mechanical
      const density = Math.sin(p * Math.PI);
      sfxAcc += dt * rate * (0.25 + density * 0.95);
      while (sfxAcc >= 1){
        sfxAcc -= 1;
        sfx(step.sound, density);
      }
    } else {
      sfxAcc = 0;
    }

    if (stepT >= step.dur){
      stepIndex++;
      stepT = 0;
      sfxAcc = 0;
      stepTransitionSound();
      if (stepIndex >= repair.steps.length){
        // a short pause between repairs
        if (rand() < 0.12) stepTransitionSound();
        nextRepair();
      }
    }
  }

  function roundRect(ctx, x, y, ww, hh, r){
    const rr = Math.min(r, ww / 2, hh / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, rr);
    ctx.arcTo(x + ww, y + hh, x, y + hh, rr);
    ctx.arcTo(x, y + hh, x, y, rr);
    ctx.arcTo(x, y, x + ww, y, rr);
    ctx.closePath();
  }

  function drawWorkbench(ctx){
    const top = Math.floor(h * 0.66);

    // soft lamp gradient (warmth modulated by the long-period phase cycle)
    const warm = clamp(phaseWarm, 0, 1);
    const hue = 215 - warm * 160;
    const sat = 18 + warm * 28;
    const l0 = 11 + warm * 2.5;
    const l1 = 6 + warm * 1.2;
    const l2 = 3.2 + warm * 0.6;

    const bg = ctx.createRadialGradient(w * 0.52, h * 0.22, 10, w * 0.52, h * 0.22, Math.max(w, h) * 0.75);
    bg.addColorStop(0, `hsl(${hue}, ${sat}%, ${l0}%)`);
    bg.addColorStop(0.55, `hsl(${hue}, ${sat * 0.8}%, ${l1}%)`);
    bg.addColorStop(1, `hsl(${hue}, ${sat * 0.55}%, ${l2}%)`);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // bench wood
    ctx.save();
    const wood = ctx.createLinearGradient(0, top, 0, h);
    wood.addColorStop(0, 'rgba(92, 60, 38, 0.92)');
    wood.addColorStop(1, 'rgba(28, 18, 11, 1)');
    ctx.fillStyle = wood;
    ctx.fillRect(0, top, w, h - top);
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    for (let i = 0; i < 12; i++){
      const y = top + i * ((h - top) / 12);
      ctx.fillRect(0, y, w, 1);
    }
    ctx.restore();

    // anti-vignette (center brighter) — intensity modulated by the phase cycle
    ctx.save();
    const vig = clamp(phaseVig, 0, 1);
    const centerA = 0.08 - vig * 0.04;
    const edgeA = 0.55 + vig * 0.2;

    const vg = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, Math.max(w, h) * 0.68);
    vg.addColorStop(0, `rgba(255,255,255,${centerA})`);
    vg.addColorStop(1, `rgba(0,0,0,${edgeA})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // Special: LAMP FLICKER — subtle exposure/brightness modulation.
    if (momentKind === 'lamp-flicker'){
      const mp = clamp(momentT / Math.max(0.001, momentDur), 0, 1);
      const env = Math.sin(mp * Math.PI); // 0→1→0
      const f = (Math.sin(momentT * 34) * 0.55 + Math.sin(momentT * 61 + 1.1) * 0.45);
      const a = clamp((0.08 + 0.14 * Math.max(0, f)) * env, 0, 0.22);

      ctx.save();
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.fillRect(0, 0, w, h);
      // slight warm flash on some peaks
      const wa = clamp((0.03 + 0.06 * Math.max(0, -f)) * env, 0, 0.09);
      ctx.fillStyle = `rgba(255,200,140,${wa})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  function drawMat(ctx, x, y, ww, hh, accent){
    const r = Math.max(12, Math.floor(font * 0.95));
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, x + 8, y + 10, ww, hh, r);
    ctx.fill();

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(16, 22, 30, 0.92)';
    roundRect(ctx, x, y, ww, hh, r);
    ctx.fill();

    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1, Math.floor(font * 0.1));
    ctx.setLineDash([Math.max(4, Math.floor(font * 0.35)), Math.max(4, Math.floor(font * 0.35))]);
    roundRect(ctx, x + 10, y + 10, ww - 20, hh - 20, r - 6);
    ctx.stroke();
    ctx.setLineDash([]);

    // grid
    ctx.globalAlpha = 0.09;
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.lineWidth = 1;
    const step = Math.max(18, Math.floor(font * 1.15));
    for (let xx = x; xx <= x + ww; xx += step){
      ctx.beginPath();
      ctx.moveTo(xx, y);
      ctx.lineTo(xx, y + hh);
      ctx.stroke();
    }
    for (let yy = y; yy <= y + hh; yy += step){
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + ww, yy);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawObject(ctx, kind, cx, cy, scale, p, accentA, accentB){
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    const wob = Math.sin(t * 0.6) * 0.6;
    ctx.rotate(wob * 0.002);

    if (kind === 'zipper'){
      // two fabric strips + teeth
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = 'rgba(231,238,246,0.14)';
      ctx.fillRect(-70, -50, 50, 100);
      ctx.fillRect(20, -50, 50, 100);

      // teeth
      const teeth = 18;
      for (let i = 0; i < teeth; i++){
        const y = -42 + (i / (teeth - 1)) * 84;
        const open = 1 - p;
        const gap = 8 + open * 16;
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = 'rgba(231,238,246,0.55)';
        ctx.fillRect(-6 - gap * 0.5, y, 4, 6);
        ctx.fillRect(2 + gap * 0.5, y, 4, 6);
      }

      // slider (moves with p)
      const sy = -42 + p * 84;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = accentA;
      roundRect(ctx, -14, sy - 10, 28, 20, 6);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#000';
      ctx.fillRect(-10, sy - 4, 20, 8);
    }

    if (kind === 'glasses'){
      // simple glasses frames
      ctx.globalAlpha = 0.88;
      ctx.strokeStyle = 'rgba(231,238,246,0.65)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(-36, 0, 24, 18, 0, 0, Math.PI * 2);
      ctx.ellipse(36, 0, 24, 18, 0, 0, Math.PI * 2);
      ctx.stroke();

      // bridge
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(12, 0);
      ctx.stroke();

      // hinge screw highlight (tighten target)
      const hx = 60;
      const hy = -10;
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = accentB;
      ctx.beginPath();
      ctx.arc(hx, hy, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // subtle shimmer based on progress
      ctx.globalAlpha = 0.12 + 0.18 * Math.sin(p * Math.PI);
      ctx.fillStyle = accentA;
      ctx.fillRect(-75, -30, 150, 60);
    }

    if (kind === 'chair'){
      // top seat edge
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'rgba(231,238,246,0.12)';
      roundRect(ctx, -70, -42, 140, 30, 10);
      ctx.fill();

      // legs
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = 'rgba(231,238,246,0.2)';
      ctx.fillRect(-52, -12, 24, 70);
      ctx.fillRect(28, -12, 24, 70);

      // wobble indicator
      const wobX = Math.sin(t * 4.0) * (2 + (1 - p) * 6);
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = accentA;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-52 + wobX, 62);
      ctx.lineTo(52 - wobX, 62);
      ctx.stroke();

      // bolt point
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = accentB;
      ctx.beginPath();
      ctx.arc(40, 6, 5.2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (kind === 'cable'){
      // cable line with a "break" section
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = 'rgba(231,238,246,0.55)';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-70, 10);
      ctx.quadraticCurveTo(-22, -30, 0, 5);
      ctx.quadraticCurveTo(26, 35, 70, -5);
      ctx.stroke();

      // patch wrap grows with p
      const px = 0;
      const py = 6;
      const len = 30 + p * 45;
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = accentA;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(px - len * 0.5, py);
      ctx.lineTo(px + len * 0.5, py);
      ctx.stroke();

      // tape stripes
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = accentB;
      ctx.lineWidth = 2;
      for (let i = -3; i <= 3; i++){
        const x = i * 8;
        ctx.beginPath();
        ctx.moveTo(x - 6, py - 8);
        ctx.lineTo(x + 6, py + 8);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function drawTool(ctx, tool, cx, cy, scale, action, p, accent){
    // minimalist "hand/tool" pass over the object
    ctx.save();
    ctx.translate(cx, cy);

    const reach = 120 * scale;
    let tx = 0, ty = 0, rot = 0;

    if (action === 'hover'){
      tx = Math.sin(t * 0.9) * reach * 0.08;
      ty = -reach * 0.35 + Math.sin(t * 1.1) * reach * 0.05;
      rot = -0.25;
    } else if (action === 'screw'){
      tx = reach * 0.35;
      ty = -reach * 0.15;
      rot = -0.6 + Math.sin(t * 20) * 0.04;
    } else if (action === 'zip'){
      tx = 0;
      ty = (-reach * 0.2) + (p * reach * 0.6);
      rot = -0.1;
    } else if (action === 'press'){
      tx = reach * 0.18;
      ty = reach * (0.05 + (1 - Math.sin(p * Math.PI)) * 0.08);
      rot = -0.35;
    } else if (action === 'brush'){
      tx = -reach * 0.1 + Math.sin(t * 10) * reach * 0.05;
      ty = -reach * 0.05 + Math.cos(t * 9) * reach * 0.03;
      rot = 0.25;
    } else if (action === 'tap'){
      tx = -reach * 0.2;
      ty = reach * (0.1 + Math.abs(Math.sin(t * 8)) * 0.05);
      rot = 0.2;
    } else if (action === 'wrap'){
      tx = -reach * 0.15 + Math.sin(t * 5) * reach * 0.03;
      ty = -reach * 0.1;
      rot = -0.15;
    }

    // tool shadow on the bench (drawn pre-rotation so it reads as a drop shadow)
    ctx.save();
    ctx.globalAlpha = 0.26;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.ellipse(tx + 58 * scale, ty + 20 * scale, 52 * scale, 14 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.translate(tx, ty);
    ctx.rotate(rot);

    const L = 110 * scale;
    const W = 14 * scale;

    // handle
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, -L * 0.12, -W * 0.7, L * 0.38, W * 1.4, W * 0.6);
    ctx.fill();

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(231,238,246,0.28)';
    roundRect(ctx, -L * 0.1, -W * 0.6, L * 0.34, W * 1.2, W * 0.55);
    ctx.fill();

    // shaft
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = 'rgba(231,238,246,0.35)';
    roundRect(ctx, L * 0.18, -W * 0.18, L * 0.62, W * 0.36, W * 0.18);
    ctx.fill();

    // head / tip (distinct silhouettes per tool)
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = accent;
    const tipX = L * 0.78;

    if (tool === 'tape'){
      // chunky tape block + inner roll hint
      roundRect(ctx, L * 0.58, -W * 0.55, L * 0.26, W * 1.1, W * 0.55);
      ctx.fill();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(tipX, 0, W * 0.58, W * 0.58, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (tool === 'screwdriver'){
      // flat blade tip
      roundRect(ctx, tipX - L * 0.02, -W * 0.18, L * 0.14, W * 0.36, W * 0.18);
      ctx.fill();
      // tiny notch for definition
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = 'rgba(0,0,0,0.9)';
      ctx.fillRect(tipX + L * 0.09, -W * 0.06, L * 0.04, W * 0.12);
    } else if (tool === 'wrench'){
      // open-end wrench arc
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(2, W * 0.55);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(tipX, 0, W * 0.78, -0.95, 0.95);
      ctx.stroke();
      ctx.restore();
    } else if (tool === 'pliers'){
      // two jaws + a pivot dot
      ctx.beginPath();
      ctx.moveTo(tipX + W * 0.65, 0);
      ctx.lineTo(tipX - W * 0.15, -W * 0.55);
      ctx.lineTo(tipX - W * 0.38, -W * 0.18);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(tipX + W * 0.65, 0);
      ctx.lineTo(tipX - W * 0.15, W * 0.55);
      ctx.lineTo(tipX - W * 0.38, W * 0.18);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(tipX - W * 0.12, 0, W * 0.28, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // generic point (fallback)
      ctx.beginPath();
      ctx.moveTo(L * 0.84, 0);
      ctx.lineTo(L * 0.72, -W * 0.22);
      ctx.lineTo(L * 0.72, W * 0.22);
      ctx.closePath();
      ctx.fill();
    }

    // tool label (subtle)
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(231,238,246,0.8)';
    ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    const lbl = (tool || '').toUpperCase();
    if (lbl) ctx.fillText(lbl, -L * 0.1, W * 0.95);

    ctx.restore();
  }

  function drawMomentBadge(ctx, label, accent){
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';

    const padX = 10;
    const padY = 7;
    const txt = `SPECIAL: ${label}`;
    const tw = Math.ceil(ctx.measureText(txt).width);
    const bw = tw + padX * 2;
    const bh = Math.max(22, small + padY * 2);
    const bx = Math.floor(w - bw - w * 0.04);
    const by = Math.floor(h * 0.06);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, bx + 4, by + 5, bw, bh, bh / 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(16, 22, 30, 0.82)';
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fill();

    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(231,238,246,0.85)';
    ctx.globalAlpha = 0.92;
    ctx.fillText(txt, bx + padX, by + bh / 2);

    ctx.restore();
  }

  function drawSpecialMoment(ctx, cx, cy, scale, accentA, accentB){
    if (!momentKind) return;

    const mp = clamp(momentT / Math.max(0.001, momentDur), 0, 1);
    const env = Math.sin(mp * Math.PI);

    if (momentKind === 'success-stamp'){
      ctx.save();
      ctx.translate(cx, cy - 20 * scale);
      ctx.rotate(-0.35);

      const s = 1.0 + 0.06 * Math.sin(mp * Math.PI);
      ctx.scale(s, s);

      ctx.globalAlpha = 0.14 * env;
      ctx.fillStyle = '#000';
      ctx.font = `${Math.floor(74 * scale)}px ui-sans-serif, system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SUCCESS', 10 * scale, 10 * scale);

      ctx.globalAlpha = 0.72 * env;
      ctx.strokeStyle = accentB;
      ctx.lineWidth = Math.max(2, Math.floor(4 * scale));
      ctx.lineJoin = 'round';
      ctx.strokeText('SUCCESS', 0, 0);

      ctx.globalAlpha = 0.25 * env;
      ctx.fillStyle = accentA;
      ctx.fillText('SUCCESS', 0, 0);

      ctx.restore();
      drawMomentBadge(ctx, 'SUCCESS STAMP', accentB);
    } else if (momentKind === 'dust-puff' && dustPuff){
      const spread = 140 * scale;
      const pp = clamp(mp, 0, 1);

      ctx.save();
      ctx.fillStyle = 'rgba(231,238,246,1)';

      for (const d of dustPuff){
        const x = cx + d.ox * spread * 0.45 + d.vx * spread * pp * 0.28;
        const y = cy + d.oy * spread * 0.28 + d.vy * spread * pp * 0.22 - pp * pp * spread * 0.08;
        const r = (d.r * scale) * (0.85 + pp * 0.95);
        const a = (0.12 + 0.25 * (1 - pp)) * env;

        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      drawMomentBadge(ctx, 'DUST PUFF', accentA);
    } else if (momentKind === 'lamp-flicker'){
      drawMomentBadge(ctx, 'LAMP FLICKER', accentA);
    }
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawWorkbench(ctx);

    const accentA = repair?.palette?.a || '#6cf2ff';
    const accentB = repair?.palette?.b || '#ff5aa5';

    // mat area
    const mw = Math.floor(w * 0.66);
    const mh = Math.floor(h * 0.56);
    const mx = Math.floor((w - mw) / 2);
    const my = Math.floor(h * 0.2);
    drawMat(ctx, mx, my, mw, mh, accentA);

    // object
    const step = curStep();
    const p = step ? clamp(stepT / step.dur, 0, 1) : 0;
    const scale = Math.max(1, Math.min(w, h) / 720);
    const cx = mx + mw * 0.5;
    const cy = my + mh * 0.52;

    // subtle contact shadow so the object feels grounded on the mat
    ctx.save();
    const sh = ctx.createRadialGradient(cx, cy + 58 * scale, 1, cx, cy + 58 * scale, 120 * scale);
    sh.addColorStop(0, 'rgba(0,0,0,0.28)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 58 * scale, 95 * scale, 20 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawObject(ctx, repair?.id, cx, cy, scale, p, accentA, accentB);

    // tool pass
    drawTool(ctx, repair?.tool, cx, cy, scale, step?.action || 'hover', p, accentB);

    // rare special moments
    drawSpecialMoment(ctx, cx, cy, scale, accentA, accentB);

    // title strip
    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(0, Math.floor(h * 0.06), w, Math.floor(h * 0.1));
    ctx.fillStyle = accentA;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(0, Math.floor(h * 0.16), w, 2);

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.font = `${Math.floor(font * 1.05)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillText('FIX-IT ASMR', Math.floor(w * 0.05), Math.floor(h * 0.105));

    ctx.font = `${Math.floor(font * 0.9)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(231,238,246,0.72)';
    ctx.fillText(repair?.title || '—', Math.floor(w * 0.05), Math.floor(h * 0.145));
    ctx.restore();

    // step label + progress
    ctx.save();
    const pillW = Math.floor(w * 0.34);
    const pillH = Math.max(24, Math.floor(font * 1.45));
    const px = Math.floor(w * 0.05);
    const py = Math.floor(h * 0.78);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, px, py, pillW, pillH, pillH / 2);
    ctx.fill();

    // progress bar
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(231,238,246,0.2)';
    roundRect(ctx, px + 10, py + pillH - 7, pillW - 20, 3, 2);
    ctx.fill();
    ctx.fillStyle = accentB;
    roundRect(ctx, px + 10, py + pillH - 7, (pillW - 20) * p, 3, 2);
    ctx.fill();

    ctx.globalAlpha = 0.88;
    ctx.fillStyle = 'rgba(231,238,246,0.82)';
    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    const stepTxt = step?.label ? `step: ${step.label}` : 'step: —';
    ctx.fillText(stepTxt, px + 14, py + pillH * 0.46);
    ctx.restore();

    // footer / caption strip
    ctx.save();
    const fh = Math.floor(h * 0.08);
    const fy = Math.floor(h * 0.92);

    ctx.globalAlpha = 0.7;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, fy, w, fh);

    ctx.globalAlpha = 0.88;
    ctx.fillStyle = 'rgba(231,238,246,0.7)';
    ctx.font = `${Math.floor(h / 38)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';

    const capI = captionOrder.length ? (Math.floor(t / captionDur) % captionOrder.length) : 0;
    const cap = captionOrder[capI] || '';
    const txt = ellipsize(ctx, cap, Math.floor(w * 0.9));
    ctx.fillText(txt, Math.floor(w * 0.05), fy + fh * 0.5);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
