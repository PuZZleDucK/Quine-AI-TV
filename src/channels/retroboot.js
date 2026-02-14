import { mulberry32 } from '../util/prng.js';

// REVIEWED: 2026-02-15

// Retro Boot Sequence
// Vintage computer boot-ups, UI tours, and “software archaeology” with CRT-ish overlays.

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

function makeScanPattern(){
  const c = document.createElement('canvas');
  c.width = 4; c.height = 4;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)';
  g.fillRect(0,0,4,4);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.fillRect(0,1,4,1);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0,3,4,1);
  return c;
}

function clamp01(x){ return Math.max(0, Math.min(1, x)); }

function hash32(x){
  x |= 0;
  x = (x ^ 61) ^ (x >>> 16);
  x = x + (x << 3);
  x = x ^ (x >>> 4);
  x = Math.imul(x, 0x27d4eb2d);
  x = x ^ (x >>> 15);
  return x >>> 0;
}

function hash01(x){
  return hash32(x) / 4294967296;
}

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }

function makeBootLines(rand){
  const mem = 256 + (((rand()*32)|0) * 32);
  const hdd = pick(rand, ['ST-506', 'Quantum Fireball', 'Conner CP-30104', 'IBM Deskstar', 'Maxtor 2.1GB']);
  const cd = pick(rand, ['ATAPI CD-ROM', 'Mitsumi FX001D', 'SONY CDU', 'TEAC CD-532E']);
  const bios = pick(rand, ['PhoenixBIOS 4.0', 'AMI BIOS', 'Award Modular BIOS', 'MR BIOS']);
  const cpu = pick(rand, ['486DX2-66', 'Pentium 90', 'Pentium II 300', 'K6-2 350', 'Celeron 433']);

  const base = [
    { at: 0.0, text: `${bios} — Setup Utility`, color: 'rgba(170,220,255,0.9)' },
    { at: 0.6, text: `CPU: ${cpu}`, color: 'rgba(180,255,210,0.92)' },
    { at: 1.0, text: `Memory Test: ${mem} KB OK`, color: 'rgba(180,255,210,0.92)' },
    { at: 1.5, text: `Detecting IDE Primary Master... ${hdd}`, color: 'rgba(180,255,210,0.92)' },
    { at: 2.1, text: `Detecting ATAPI... ${cd}`, color: 'rgba(180,255,210,0.92)' },
    { at: 2.7, text: `Press DEL to enter Setup`, color: 'rgba(255,210,140,0.92)' },
    { at: 3.2, text: `Booting from A:`, color: 'rgba(180,255,210,0.92)' },
    { at: 3.8, text: `Starting MS-DOS...`, color: 'rgba(180,255,210,0.92)' },
  ];

  return base;
}

function makeDosLines(rand){
  const label = pick(rand, ['GAMES', 'UTILS', 'WORK', 'MIDI', 'BBS']);
  const lines = [
    { at: 0.0, text: 'Microsoft(R) MS-DOS(R) Version 6.22', color: 'rgba(220,255,220,0.92)' },
    { at: 0.7, text: '(C)Copyright Microsoft Corp 1981-1994.', color: 'rgba(220,255,220,0.82)' },
    { at: 1.5, text: '', color: 'rgba(0,0,0,0)' },
    { at: 1.6, text: 'C:\\>dir', color: 'rgba(220,255,220,0.92)' },
    { at: 2.1, text: ` Volume in drive C is ${label}`, color: 'rgba(220,255,220,0.82)' },
    { at: 2.6, text: ` Directory of C:\\`, color: 'rgba(220,255,220,0.82)' },
    { at: 3.2, text: 'AUTOEXEC BAT      1,024  10-03-95  7:22p', color: 'rgba(220,255,220,0.86)' },
    { at: 3.6, text: 'CONFIG   SYS        768  10-03-95  7:22p', color: 'rgba(220,255,220,0.86)' },
    { at: 4.0, text: 'GAMES    <DIR>            02-18-96  1:05a', color: 'rgba(220,255,220,0.86)' },
    { at: 4.4, text: 'DEMOS    <DIR>            02-18-96  1:05a', color: 'rgba(220,255,220,0.86)' },
    { at: 4.8, text: 'SOUND    <DIR>            02-18-96  1:05a', color: 'rgba(220,255,220,0.86)' },
    { at: 5.2, text: 'README   TXT      3,584  10-04-95  9:10p', color: 'rgba(220,255,220,0.86)' },
    { at: 5.9, text: '', color: 'rgba(0,0,0,0)' },
    { at: 6.0, text: 'C:\\>_', color: 'rgba(220,255,220,0.92)' },
  ];
  return lines;
}

function makeLinuxLines(rand){
  const host = pick(rand, ['quartz', 'saturn', 'beige-box', 'tiger', 'nebula', 'hermes']);
  const kernel = pick(rand, ['2.4.37', '2.6.32', '3.2.0', '4.4.0']);
  const lines = [
    { at: 0.0, text: `Booting Linux ${kernel}...`, color: 'rgba(230,230,230,0.9)' },
    { at: 0.6, text: '[    0.000000] BIOS-provided physical RAM map:', color: 'rgba(190,210,255,0.85)' },
    { at: 1.1, text: '[    0.000000]  0000000000000000 - 000000000009f000 (usable)', color: 'rgba(190,210,255,0.85)' },
    { at: 1.7, text: '[    0.000000]  0000000000100000 - 000000001ff00000 (usable)', color: 'rgba(190,210,255,0.85)' },
    { at: 2.4, text: '[    0.420000] usbcore: registered new interface driver hub', color: 'rgba(210,255,220,0.85)' },
    { at: 3.0, text: '[    0.510000] EXT3-fs: mounted filesystem with ordered data mode.', color: 'rgba(210,255,220,0.85)' },
    { at: 3.6, text: '[    0.980000] Starting syslogd: [  OK  ]', color: 'rgba(255,240,170,0.85)' },
    { at: 4.2, text: '[    1.100000] Starting network: [  OK  ]', color: 'rgba(255,240,170,0.85)' },
    { at: 5.0, text: '', color: 'rgba(0,0,0,0)' },
    { at: 5.1, text: `${host} login: `, color: 'rgba(255,255,255,0.92)' },
    { at: 5.6, text: 'guest', color: 'rgba(255,255,255,0.92)' },
    { at: 6.1, text: 'Password: ', color: 'rgba(255,255,255,0.92)' },
    { at: 6.6, text: '********', color: 'rgba(255,255,255,0.92)' },
    { at: 7.2, text: 'Last login: Sat Feb  7 07:00:00 on tty1', color: 'rgba(190,210,255,0.85)' },
    { at: 7.7, text: `${host}:~$ _`, color: 'rgba(210,255,220,0.9)' },
  ];
  // tiny random module line
  lines.splice(4, 0, { at: 2.7, text: `[    0.${(200+((rand()*600)|0)).toString().padStart(6,'0')}] ${pick(rand, ['i8042: No controller found', 'PCI: Probing PCI hardware', 'hda: dma_intr: status=0x51', 'eth0: link up, 100Mbps'])}`, color: 'rgba(210,255,220,0.85)' });
  return lines;
}

function makeMacScreen(rand){
  const sys = pick(rand, ['System 6', 'System 7', 'Mac OS 8']);
  const specks = Array.from({ length: 42 }, () => ({ x: rand(), y: rand() }));
  return {
    title: `${sys} — Welcome`,
    draw(ctx, w, h, t){
      // beige background + centered window
      const g = ctx.createLinearGradient(0,0,0,h);
      g.addColorStop(0, '#d9d1bf');
      g.addColorStop(1, '#cbbfa8');
      ctx.fillStyle = g;
      ctx.fillRect(0,0,w,h);

      const s = Math.min(w,h);
      const ww = Math.floor(s*0.62);
      const wh = Math.floor(s*0.40);
      const x = Math.floor((w-ww)/2);
      const y = Math.floor((h-wh)/2);

      // window
      ctx.save();
      ctx.fillStyle = 'rgba(245,245,245,0.92)';
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      roundRect(ctx, x, y, ww, wh, 14);
      ctx.fill();
      ctx.stroke();

      // title bar
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(x+2, y+2, ww-4, Math.floor(wh*0.14));

      // smiley
      const cx = x + ww*0.5;
      const cy = y + wh*0.46;
      const r = Math.floor(Math.min(ww,wh)*0.18);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = 'rgba(245,245,245,0.9)';
      ctx.beginPath();
      ctx.arc(cx, cy, r-4, 0, Math.PI*2);
      ctx.fill();
      // eyes
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.beginPath();
      ctx.arc(cx - r*0.35, cy - r*0.20, r*0.10, 0, Math.PI*2);
      ctx.arc(cx + r*0.35, cy - r*0.20, r*0.10, 0, Math.PI*2);
      ctx.fill();
      // mouth
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(cx, cy + r*0.05, r*0.55, 0.1*Math.PI, 0.9*Math.PI);
      ctx.stroke();

      // message
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.font = `${Math.floor(wh*0.10)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('Welcome to Macintosh.', cx, y + wh*0.82);

      // progress bar
      const pbw = Math.floor(ww*0.62);
      const pbh = Math.floor(wh*0.08);
      const px = Math.floor(cx - pbw/2);
      const py = Math.floor(y + wh*0.88);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      roundRect(ctx, px, py, pbw, pbh, 8);
      ctx.stroke();

      const u = clamp01(t / 6.5);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      roundRect(ctx, px+3, py+3, Math.floor((pbw-6)*u), pbh-6, 6);
      ctx.fill();

      ctx.restore();

      // subtle pattern
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = '#ffffff';
      for (let i=0;i<specks.length;i++){
        const bx = (specks[i].x*w)|0;
        const by = (specks[i].y*h)|0;
        ctx.fillRect(bx, by, 1, 1);
      }
      ctx.restore();
    }
  };
}

function drawTyped(ctx, {x, y, lineH, lines, t, cps=34, cursor=true}){
  let yy = y;
  let last = null; // {x,y,w,text}

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  for (let i=0; i<lines.length; i++){
    const L = lines[i];
    if (t < L.at) continue;

    const dt = t - L.at;
    const n = Math.max(0, Math.min(L.text.length, Math.floor(dt * cps)));
    const s = L.text.slice(0, n);

    if (s.length === 0 && L.text.length !== 0) continue;

    ctx.fillStyle = L.color || 'rgba(220,255,220,0.92)';
    ctx.fillText(s, x, yy);
    last = { x, y: yy, w: ctx.measureText(s).width, text: s };
    yy += lineH;
  }

  // cursor blink at end of last visible line
  if (cursor && last && !last.text.endsWith('_')){
    const blink = (Math.sin(t*4.2) > 0);
    if (blink){
      const cx = last.x + last.w;
      const cy = last.y;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(cx, cy + Math.floor(lineH*0.10), Math.floor(lineH*0.62), Math.floor(lineH*0.78));
    }
  }
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0;
  let t = 0;

  // render buffer (for CRT overlays)
  let buf = null;
  let bctx = null;
  let scanPat = null;

  // sequence state
  let segIdx = 0;
  let segT = 0;

  // content
  let biosLines = [];
  let dosLines = [];
  let linuxLines = [];
  let macScreen = null;

  // audio
  let ah = null;
  let nextClick = 0.0;

  function buildContent(){
    biosLines = makeBootLines(rand);
    dosLines = makeDosLines(rand);
    linuxLines = makeLinuxLines(rand);
    macScreen = makeMacScreen(rand);
  }

  const SEGMENTS = [
    { key: 'bios', title: 'POST / BIOS', dur: 9.5 },
    { key: 'dos', title: 'MS-DOS Prompt', dur: 10.5 },
    { key: 'mac', title: 'Classic Desktop', dur: 9.5 },
    { key: 'linux', title: 'Linux Boot Log', dur: 11.5 },
  ];

  function init({ width, height }){
    w = width; h = height; t = 0;

    buf = document.createElement('canvas');
    buf.width = w; buf.height = h;
    bctx = buf.getContext('2d');

    scanPat = makeScanPattern();

    segIdx = (seed >>> 0) % SEGMENTS.length;
    segT = 0;

    nextClick = 0.18;

    buildContent();
  }

  function onResize(width, height){
    init({ width, height });
  }

  function makeAudioHandle(){
    const ctx = audio.ensure();

    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(audio.master);

    // CRT-ish hum: low oscillator + a touch of brown noise.
    const hum = ctx.createOscillator();
    hum.type = 'triangle';
    hum.frequency.value = 54;

    const humGain = ctx.createGain();
    humGain.gain.value = 0.0;

    const t0 = ctx.currentTime;
    humGain.gain.setValueAtTime(0.0001, t0);
    humGain.gain.exponentialRampToValueAtTime(0.017, t0 + 0.4);

    hum.connect(humGain);
    humGain.connect(out);

    const n = audio.noiseSource({ type: 'brown', gain: 0.010 });
    // reroute noise to our out
    try { n.gain.disconnect(); } catch {}
    n.gain.connect(out);

    hum.start();
    n.start();

    return {
      stop(){
        const now = ctx.currentTime;
        try { out.gain.setTargetAtTime(0.0001, now, 0.08); } catch {}
        try { hum.stop(now + 0.25); } catch {}
        try { n.stop(); } catch {}
      }
    };
  }

  function stopAudio({ clearCurrent = false } = {}){
    const handle = ah;
    if (!handle) return;

    const isCurrent = audio.current === handle;
    if (clearCurrent && isCurrent){
      // clears audio.current and stops via handle.stop()
      audio.stopCurrent();
    } else {
      try { handle?.stop?.(); } catch {}
    }

    ah = null;
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // Defensive: if onAudioOn is called repeatedly while audio is enabled,
    // ensure we don't stack/overlap our own ambience.
    if (ah && audio.current === ah) return;

    stopAudio({ clearCurrent: true });
    ah = makeAudioHandle();
    audio.setCurrent(ah);
  }

  function onAudioOff(){
    stopAudio({ clearCurrent: true });
  }

  function destroy(){
    // Only clears AudioManager.current when we own it.
    stopAudio({ clearCurrent: true });
  }

  function update(dt){
    t += dt;
    segT += dt;

    const seg = SEGMENTS[segIdx];
    if (segT >= seg.dur){
      segIdx = (segIdx + 1) % SEGMENTS.length;
      segT = 0;

      // a little "tuning" tick on segment swap
      if (audio.enabled) audio.beep({ freq: 420 + rand()*280, dur: 0.02, gain: 0.028, type: 'square' });
    }

    // disk clicks / keyboard ticks
    nextClick -= dt;
    if (nextClick <= 0){
      nextClick = 0.08 + rand()*0.45;
      if (audio.enabled){
        const f = 130 + rand()*420;
        audio.beep({ freq: f, dur: 0.012 + rand()*0.016, gain: 0.018 + rand()*0.010, type: rand() < 0.6 ? 'square' : 'triangle' });
      }
    }
  }

  function drawHud(ctx, title){
    const s = Math.min(w, h);
    const pad = Math.max(10, Math.floor(s * 0.02));
    const boxW = Math.floor(s * 0.52);
    const boxH = Math.floor(s * 0.10);
    const x = pad;
    const y = pad;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, boxW, boxH, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    ctx.font = `${Math.floor(boxH*0.34)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('RETRO BOOT SEQUENCE', x + 14, y + Math.floor(boxH*0.24));

    ctx.fillStyle = 'rgba(255,210,140,0.90)';
    ctx.font = `${Math.floor(boxH*0.30)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillText(title, x + 14, y + Math.floor(boxH*0.66));

    // disk LED
    const ledX = x + boxW - 18;
    const ledY = y + Math.floor(boxH*0.54);
    const on = (Math.sin(t * 9.0) > 0.35) || (segT < 1.2);
    ctx.fillStyle = on ? 'rgba(120,255,170,0.95)' : 'rgba(80,110,90,0.45)';
    ctx.beginPath();
    ctx.arc(ledX, ledY, 5, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
  }

  function renderCRT(ctx){
    // subtle scanlines + vignette + flicker over whatever is already drawn
    ctx.save();

    // scanlines
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = ctx.createPattern(scanPat, 'repeat');
    ctx.fillRect(0, 0, w, h);

    // vignette
    const vg = ctx.createRadialGradient(w*0.5, h*0.5, Math.min(w,h)*0.2, w*0.5, h*0.5, Math.max(w,h)*0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // flicker
    const flickerBucket = Math.floor(t * 24);
    const flickerN = hash01((seed ^ 0x9e3779b9) + flickerBucket * 0x85ebca6b);
    const f = 0.02 + 0.02 * Math.sin(t * 23.0) + 0.01 * (flickerN - 0.5);
    ctx.fillStyle = `rgba(255,255,255,${Math.max(0, f)})`;
    ctx.fillRect(0, 0, w, h);

    // tiny noise specks (cheap)
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = 'rgba(255,255,255,1)';
    const speckBucket = Math.floor(t * 12);
    for (let i=0; i<28; i++){
      const x = Math.floor(hash01((seed + 0x1b873593) ^ (speckBucket * 0x9e3779b9) ^ (i * 0x85ebca6b)) * w);
      const y = Math.floor(hash01((seed + 0x85ebca6b) ^ (speckBucket * 0xc2b2ae35) ^ (i * 0x27d4eb2d)) * h);
      ctx.fillRect(x, y, 1, 1);
    }

    ctx.restore();
  }

  function render(ctx){
    const seg = SEGMENTS[segIdx];

    // draw base frame into buffer
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.clearRect(0, 0, w, h);

    if (seg.key === 'bios'){
      const g = bctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#001019');
      g.addColorStop(1, '#00030a');
      bctx.fillStyle = g;
      bctx.fillRect(0, 0, w, h);

      const s = Math.min(w, h);
      const pad = Math.max(18, Math.floor(s * 0.05));
      const font = Math.floor(s * 0.032);
      bctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

      drawTyped(bctx, { x: pad, y: pad*1.9, lineH: Math.floor(font*1.35), lines: biosLines, t: segT, cps: 42, cursor: false });

      // a simple memory bar
      const u = clamp01(segT / 6.0);
      bctx.strokeStyle = 'rgba(170,220,255,0.35)';
      bctx.lineWidth = 2;
      const bw = Math.floor(w * 0.54);
      const bh = Math.max(10, Math.floor(h * 0.016));
      const bx = pad;
      const by = Math.floor(h - pad*1.3);
      roundRect(bctx, bx, by, bw, bh, 6);
      bctx.stroke();
      bctx.fillStyle = 'rgba(120,255,170,0.25)';
      roundRect(bctx, bx+3, by+3, Math.floor((bw-6)*u), bh-6, 5);
      bctx.fill();

    } else if (seg.key === 'dos'){
      bctx.fillStyle = '#001400';
      bctx.fillRect(0,0,w,h);

      const s = Math.min(w, h);
      const pad = Math.max(18, Math.floor(s * 0.05));
      const font = Math.floor(s * 0.034);
      bctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

      // faint phosphor glow via shadow
      bctx.save();
      bctx.shadowColor = 'rgba(120,255,160,0.35)';
      bctx.shadowBlur = Math.floor(font * 0.35);
      drawTyped(bctx, { x: pad, y: pad*1.6, lineH: Math.floor(font*1.30), lines: dosLines, t: segT, cps: 48, cursor: true });
      bctx.restore();

    } else if (seg.key === 'mac'){
      macScreen.draw(bctx, w, h, segT);

    } else if (seg.key === 'linux'){
      bctx.fillStyle = '#070a0f';
      bctx.fillRect(0,0,w,h);

      const s = Math.min(w, h);
      const pad = Math.max(18, Math.floor(s * 0.05));
      const font = Math.floor(s * 0.030);
      bctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

      drawTyped(bctx, { x: pad, y: pad*1.8, lineH: Math.floor(font*1.35), lines: linuxLines, t: segT, cps: 58, cursor: true });

      // a little "progress" spinner
      const sp = ['|','/','-','\\'][(Math.floor(segT*8))%4];
      bctx.fillStyle = 'rgba(255,255,255,0.22)';
      bctx.fillText(sp, w - pad*1.4, pad*1.2);
    }

    // subtle ghosting: re-draw buffer slightly offset onto itself
    bctx.save();
    bctx.globalAlpha = 0.06;
    bctx.drawImage(buf, 1, 0);
    bctx.restore();

    // now composite to main
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.drawImage(buf, 0, 0);

    drawHud(ctx, seg.title);
    renderCRT(ctx);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
