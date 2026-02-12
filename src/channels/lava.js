import { mulberry32, clamp } from '../util/prng.js';

const CAPTIONS = [
  'slow heat • soft glow • no rush',
  'bubbles pending… please hold',
  'molten mood lighting (certified)',
  'gentle physics • loud colours',
  'warm drift • cool glass',
  'gravity: optional • vibe: mandatory',
  'viscosity doing its best',
  'the lamp is thinking',
  'low effort • high comfort',
  'bubble forecast: mostly rising',
  'deep magenta • shallow thoughts',
  'soft blur • hard limits',
  'ambient blob logistics',
  'please admire responsibly',
  'thermal dreams in progress',
  'a small universe of goop',
  'just add time',
  'slow-motion fireworks (indoors)',
  'ooze with purpose',
  'calm chaos • polite shimmer',
  'float • merge • separate • repeat',
  'quietly incandescent',
  'your eyes can rest here',
  'satisfying for no reason',
  'lava lamp: yes, still cool',
  'do not disturb: bubbling',
  'hot take, literally',
  'time dilation, but cosy',
  'dusk in a bottle',
  'glow maintenance window',
  'the blobs have a union',
  'screen saver, but emotional',
  'gentle turbulence • no drama',
  'this is what patience looks like',
  'warm gradients • warmer thoughts',
  'if you stare, it stares back',
  'bubble etiquette: single file',
  'soft neon • softer edges',
  'slow synth without the synth',
  'comfort loop: engaged',
  'mood: molten',
  'gravity and glitter, mostly',
  'everything rises eventually',
  'watching bubbles: a hobby',
  'heat map of feelings',
  'glow gently • think vaguely',
  'the blobs are plotting',
  'please remain in a state of awe',
  'liquid light, politely',
  'low frequency serenity',
  'wobbly, but determined',
  'soft focus • loud heart',
  'bubble choreography rehearsal',
  'this is your sign to breathe',
  'tiny suns • big calm',
  'a slow dance in glass',
  'minimum effort • maximum ambience',
];

function shuffleInPlace(arr, rand){
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(rand() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
}

export function createChannel({ seed, audio }){
  const seed32 = seed >>> 0;
  const rand = mulberry32(seed32);
  let w=0,h=0,t=0;
  let blobs=[];

  // audio
  let ambience = null;

  // UI / text determinism: keep caption shuffles from perturbing visuals.
  let captions = CAPTIONS;
  let captionOffset = 0;
  let captionPeriod = 22;

  function init({width,height}){
    w=width; h=height; t=0;
    blobs = Array.from({length: 7}, () => ({
      x: rand()*w,
      y: rand()*h,
      vx: (rand()*2-1) * (30+w/30),
      vy: (rand()*2-1) * (30+h/30),
      r: (80+rand()*170) * (h/540),
      hue: 290 + rand()*60,
      ph: rand()*10,
    }));

    const uiRand = mulberry32(seed32 ^ 0xA11CE);
    captions = CAPTIONS.slice();
    shuffleInPlace(captions, uiRand);
    captionOffset = Math.floor(uiRand() * captions.length);
    captionPeriod = 18 + Math.floor(uiRand() * 10);
  }

  function onResize(width,height){ w=width; h=height; }

  function stopAmbience(){
    try { ambience?.stop?.(); } catch {}

    // Only clear the global current handle if we still own it.
    try {
      if (audio.current === ambience) audio.current = null;
    } catch {}

    ambience = null;
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // Idempotent: don't stack sources.
    if (ambience) return;

    const ctx = audio.ensure();

    // master bus for this channel (lets us modulate without fighting AudioManager.master)
    const bus = ctx.createGain();
    bus.gain.value = 1.0;
    bus.connect(audio.master);

    // drone (low + gentle upper harmonic)
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.010;
    droneGain.connect(bus);

    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = 55;

    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = 110;
    o2.detune.value = 18;

    const o2g = ctx.createGain();
    o2g.gain.value = 0.28;

    o1.connect(droneGain);
    o2.connect(o2g);
    o2g.connect(droneGain);

    o1.start();
    o2.start();

    // filtered noise (soft "air" + warmth)
    const noise = audio.noiseSource({ type: 'brown', gain: 0.06 });

    // Re-route: noiseSource defaults to master; we want it through a filter + our bus.
    try { noise.gain.disconnect(); } catch {}

    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.value = 220;
    nf.Q.value = 0.7;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.004;

    noise.gain.connect(nf);
    nf.connect(noiseGain);
    noiseGain.connect(bus);

    noise.start();

    ambience = {
      ctx,
      bus,
      droneGain,
      noiseGain,
      nf,
      oscs: [o1, o2],
      stop(){
        const now = ctx.currentTime;
        try { droneGain.gain.setTargetAtTime(0.0001, now, 0.10); } catch {}
        try { noiseGain.gain.setTargetAtTime(0.0001, now, 0.12); } catch {}
        try { bus.gain.setTargetAtTime(0.0001, now, 0.12); } catch {}

        try { noise.stop(); } catch {}

        for (const o of [o1, o2]){
          try { o.stop(now + 0.25); } catch {}
        }

        try { bus.disconnect(); } catch {}
      },
    };

    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    stopAmbience();
  }

  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;

    // audio "breath" (slow, subtle)
    if (ambience && audio.enabled){
      const ctx = ambience.ctx;
      const p = 0.5 + 0.5 * Math.sin(t * 0.22);
      const dg = 0.0085 + 0.0045 * p;
      const ng = 0.0030 + 0.0060 * p;
      const cf = 170 + 380 * p;
      try { ambience.droneGain.gain.setTargetAtTime(dg, ctx.currentTime, 0.18); } catch {}
      try { ambience.noiseGain.gain.setTargetAtTime(ng, ctx.currentTime, 0.22); } catch {}
      try { ambience.nf.frequency.setTargetAtTime(cf, ctx.currentTime, 0.25); } catch {}
    }

    for (const b of blobs){
      b.x += b.vx*dt;
      b.y += b.vy*dt;
      // soft bounds
      if (b.x < -b.r) { b.x = w + b.r; }
      if (b.x > w + b.r) { b.x = -b.r; }
      if (b.y < -b.r) { b.y = h + b.r; }
      if (b.y > h + b.r) { b.y = -b.r; }
      b.vx += Math.sin(t*0.6 + b.ph)*0.3;
      b.vy += Math.cos(t*0.7 + b.ph)*0.3;
      b.vx = clamp(b.vx, -220, 220);
      b.vy = clamp(b.vy, -220, 220);
    }
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    // background
    const bg = ctx.createLinearGradient(0,0,0,h);
    bg.addColorStop(0,'#090018');
    bg.addColorStop(1,'#010208');
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,w,h);

    // blob field
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.filter = `blur(${Math.max(6, Math.floor(h/80))}px)`;
    for (const b of blobs){
      const rr = b.r * (0.9 + 0.1*Math.sin(t*0.7 + b.ph));
      const g = ctx.createRadialGradient(b.x,b.y, 0, b.x,b.y, rr);
      g.addColorStop(0, `hsla(${b.hue},90%,60%,0.65)`);
      g.addColorStop(0.6, `hsla(${b.hue+20},90%,55%,0.22)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x,b.y, rr, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();

    // glass shine
    ctx.save();
    const shine = ctx.createLinearGradient(0,0,w,0);
    shine.addColorStop(0,'rgba(255,255,255,0.0)');
    shine.addColorStop(0.2,'rgba(255,255,255,0.05)');
    shine.addColorStop(0.35,'rgba(255,255,255,0.02)');
    shine.addColorStop(1,'rgba(255,255,255,0.0)');
    ctx.fillStyle = shine;
    ctx.fillRect(0,0,w,h);
    ctx.restore();

    // label
    ctx.save();
    ctx.font = `${Math.floor(h/18)}px ui-rounded, ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(255,220,255,0.75)';
    ctx.shadowColor = 'rgba(255,75,216,0.7)';
    ctx.shadowBlur = 10;
    ctx.fillText('LAVA LAMP', w*0.05, h*0.12);
    ctx.restore();

    // rotating caption (seeded; no fast repeats)
    const slot = Math.floor(t / captionPeriod);
    const caption = captions[(captionOffset + slot) % captions.length];

    ctx.save();
    const stripH = Math.floor(h * 0.09);
    ctx.fillStyle = 'rgba(10,0,24,0.28)';
    ctx.fillRect(0, h - stripH, w, stripH);

    ctx.font = `${Math.floor(h/40)}px ui-rounded, ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,220,255,0.62)';
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 6;
    ctx.fillText(caption, w*0.05, h - stripH * 0.5);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
