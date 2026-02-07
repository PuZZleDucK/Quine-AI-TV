import { mulberry32 } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

function pick(rand, a){ return a[(rand() * a.length) | 0]; }

const VARS = ['duck', 'bean', 'pixel', 'orbit', 'crumb', 'spark', 'moss', 'byte', 'petal', 'kettle'];
const FUNCS = ['render', 'compile', 'bake', 'hydrate', 'stitch', 'glow', 'bundle', 'lint', 'optimize'];

const SNIPPETS = [
  (r)=>{
    const v = pick(r, VARS);
    return [
      `function ${pick(r, FUNCS)}(${v}) {`,
      `  const out = [];`,
      `  for (let i = 0; i < ${v}.length; i++) {`,
      `    out.push(${v}[i] * (i + 1));`,
      `  }`,
      `  return out;`,
      `}`,
    ];
  },
  (r)=>{
    const v = pick(r, VARS);
    return [
      `const ${v} = {`,
      `  mood: 'cozy',`,
      `  maxFrames: 240,`,
      `  jitter: 0.12,`,
      `};`,
      `export function tick(t){`,
      `  return Math.sin(t * 0.8) * ${v}.jitter;`,
      `}`,
    ];
  },
  (r)=>{
    const v = pick(r, VARS);
    const f = pick(r, FUNCS);
    return [
      `// tiny state machine`,
      `let state = 'IDLE';`,
      `export function ${f}(${v}){`,
      `  if (!${v}) state = 'PANIC';`,
      `  if (state === 'PANIC') return 'have you tried turning it off?';`,
      `  return 'OK';`,
      `}`,
    ];
  },
];

const ERRORS = [
  (r)=>`error TS8008: Cannot implicitly convert coffee to boolean.`,
  (r)=>`error E019: Unexpected token 'vibes' at line ${(2 + (r() * 4) | 0)}.`,
  (r)=>`error LINT42: Variable '${pick(r, VARS)}' is too powerful for this scope.`,
  (r)=>`error BUILD: Segmentation fault (in feelings).`,
  (r)=>`error PARSE: Missing semicolon; found existential dread.`,
];

const FIXES = [
  (r)=>`// fix: add explicit cast (and a nap)`,
  (r)=>`// fix: rename it to the truth`,
  (r)=>`// fix: delete the "clever" part`,
  (r)=>`// fix: clamp the value, clamp the ego`,
  (r)=>`// fix: add a guard clause`,
];

function makeSegment(rand){
  const code = pick(rand, SNIPPETS)(rand);
  const hasError = rand() < 0.38;

  const steps = [
    'Parsing…',
    'Typechecking…',
    'Inlining whispers…',
    'Optimizing crumbs…',
    'Linking…',
  ];

  const error = hasError ? pick(rand, ERRORS)(rand) : null;
  const fix = hasError ? pick(rand, FIXES)(rand) : null;

  return { code, steps, error, fix };
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, t = 0;
  let font = 16;
  let lineH = 20;

  let seg = null;
  let phase = 'typing'; // typing | compiling | fixing | success

  // typing state
  let codeIdx = 0;
  let codeShown = 0;

  // log state
  let log = []; // {text, shown}
  let logQueue = [];
  let logTimer = 0;

  // build artifact state
  let buildPulse = 0;
  let artifact = 0;

  let beepCooldown = 0;
  let bed = null;

  function resetSegment(){
    seg = makeSegment(rand);
    phase = 'typing';
    codeIdx = 0;
    codeShown = 0;

    log = [];
    logQueue = seg.steps.slice();
    logTimer = 0.35;

    buildPulse = 0;
    artifact = (artifact + 1) % 6;
  }

  function init({ width, height }){
    w = width; h = height; t = 0;
    font = Math.max(14, Math.floor(Math.min(w, h) / 36));
    lineH = Math.floor(font * 1.25);
    resetSegment();
  }

  function onResize(width, height){
    init({ width, height });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    const n = audio.noiseSource({ type: 'pink', gain: 0.008 });
    n.start();
    const d = simpleDrone(audio, { root: 98 + rand() * 22, detune: 0.55, gain: 0.04 });
    bed = { stop(){ try{ n.stop(); } catch {} try{ d.stop(); } catch {} } };
    audio.setCurrent(bed);
  }

  function onAudioOff(){
    try { bed?.stop?.(); } catch {}
    bed = null;
  }

  function destroy(){
    onAudioOff();
  }

  function pushLog(text){
    log.push({ text, shown: 0 });
    const maxLines = Math.max(8, Math.floor((h * 0.22) / lineH));
    while (log.length > maxLines) log.shift();

    if (audio.enabled && beepCooldown <= 0){
      beepCooldown = 0.12;
      const base = text.startsWith('error') ? 210 : 620;
      audio.beep({ freq: base + rand() * 120, dur: 0.045, gain: 0.02, type: text.startsWith('error') ? 'sawtooth' : 'triangle' });
    }
  }

  function updateTyping(dt){
    const line = seg.code[codeIdx] || '';
    const speed = 40 + rand() * 18; // chars/sec

    const prev = codeShown;
    codeShown = Math.min(line.length, codeShown + dt * speed);

    // keystrokes
    const gained = Math.floor(codeShown) - Math.floor(prev);
    if (gained > 0 && audio.enabled && beepCooldown <= 0){
      beepCooldown = 0.055 + rand() * 0.03;
      audio.beep({ freq: 1200 + rand() * 400, dur: 0.012, gain: 0.012, type: 'square' });
    }

    if (codeShown >= line.length){
      // small pause before next line
      if (line.length === 0){
        codeIdx++;
        codeShown = 0;
      } else {
        // advance when a little time passes (using buildPulse as a cheap timer)
        buildPulse += dt;
        if (buildPulse > 0.09){
          buildPulse = 0;
          codeIdx++;
          codeShown = 0;
        }
      }

      if (codeIdx >= seg.code.length){
        phase = 'compiling';
        logTimer = 0.2;
      }
    }
  }

  function updateCompile(dt){
    logTimer -= dt;
    if (logTimer <= 0){
      if (logQueue.length > 0){
        pushLog(logQueue.shift());
        logTimer = 0.45 + rand() * 0.35;
        buildPulse = 1;
      } else {
        if (seg.error){
          pushLog(seg.error);
          phase = 'fixing';
          logTimer = 0.9;
        } else {
          pushLog('Build succeeded.');
          phase = 'success';
          logTimer = 2.2 + rand() * 1.6;
        }
      }
    }
  }

  function updateFix(dt){
    logTimer -= dt;
    if (logTimer <= 0){
      pushLog('Applying fix…');
      if (seg.fix) pushLog(seg.fix);
      pushLog('Build succeeded.');
      phase = 'success';
      logTimer = 2.2 + rand() * 1.6;
    }
  }

  function updateSuccess(dt){
    logTimer -= dt;
    if (logTimer <= 0){
      resetSegment();
    }
  }

  function update(dt){
    t += dt;
    beepCooldown -= dt;

    // animate "build" pulse always
    buildPulse += dt;

    if (!seg) resetSegment();

    if (phase === 'typing') updateTyping(dt);
    else if (phase === 'compiling') updateCompile(dt);
    else if (phase === 'fixing') updateFix(dt);
    else if (phase === 'success') updateSuccess(dt);

    // reveal logs gradually
    for (const l of log){
      l.shown = Math.min(l.text.length, l.shown + dt * (52 + rand() * 25));
    }
  }

  function roundedRect(ctx, x, y, ww, hh, r){
    const rr = Math.min(r, ww / 2, hh / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, rr);
    ctx.arcTo(x + ww, y + hh, x, y + hh, rr);
    ctx.arcTo(x, y + hh, x, y, rr);
    ctx.arcTo(x, y, x + ww, y, rr);
    ctx.closePath();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Cozy background
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#110d16');
    bg.addColorStop(1, '#04040b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const glow = ctx.createRadialGradient(w * 0.35, h * 0.28, 0, w * 0.35, h * 0.28, Math.max(w, h) * 0.7);
    glow.addColorStop(0, 'rgba(255,190,140,0.08)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // Main window
    const tw = Math.floor(w * 0.9);
    const th = Math.floor(h * 0.78);
    const tx = Math.floor((w - tw) / 2);
    const ty = Math.floor(h * 0.11);
    const r = Math.floor(Math.min(w, h) * 0.02);

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    roundedRect(ctx, tx + 10, ty + 12, tw, th, r);
    ctx.fill();
    ctx.restore();

    // body
    ctx.save();
    ctx.globalAlpha = 0.93;
    ctx.fillStyle = 'rgba(14, 10, 18, 0.93)';
    roundedRect(ctx, tx, ty, tw, th, r);
    ctx.fill();
    ctx.restore();

    // header
    const hh = Math.floor(th * 0.12);
    ctx.save();
    ctx.globalAlpha = 0.97;
    ctx.fillStyle = 'rgba(38, 22, 44, 0.96)';
    roundedRect(ctx, tx, ty, tw, hh, r);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 190, 140, 0.65)';
    ctx.fillRect(tx, ty + hh - 2, tw, 2);

    ctx.font = `${Math.floor(font * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(255, 240, 225, 0.88)';
    ctx.textBaseline = 'middle';
    ctx.fillText('THE COZY COMPILER', tx + Math.floor(tw * 0.05), ty + hh / 2);

    // build status pill
    const pill = phase === 'success' ? 'OK' : (phase === 'fixing' ? 'FIX' : 'BUILD');
    const pW = Math.floor(font * 5.2);
    const pH = Math.floor(font * 1.3);
    const px = tx + tw - pW - Math.floor(tw * 0.05);
    const py = ty + Math.floor((hh - pH) / 2);
    roundedRect(ctx, px, py, pW, pH, Math.floor(pH / 2));
    ctx.fillStyle = phase === 'success' ? 'rgba(120,255,190,0.25)' : 'rgba(255,190,140,0.20)';
    ctx.fill();
    ctx.strokeStyle = phase === 'success' ? 'rgba(120,255,190,0.6)' : 'rgba(255,190,140,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = phase === 'success' ? 'rgba(170,255,220,0.9)' : 'rgba(255, 235, 220, 0.86)';
    ctx.textAlign = 'center';
    ctx.fillText(pill, px + pW / 2, py + pH / 2);
    ctx.textAlign = 'left';

    ctx.restore();

    // layout: code left, logs + artifact right
    const pad = Math.floor(tw * 0.05);
    const ax = tx + pad;
    const ay = ty + hh + Math.floor(pad * 0.6);
    const aw = tw - pad * 2;
    const ah = th - hh - Math.floor(pad * 1.2);

    const split = ax + Math.floor(aw * 0.62);

    // code panel
    ctx.save();
    const codeX = ax;
    const codeY = ay;
    const codeW = split - ax - Math.floor(pad * 0.6);
    const codeH = ah;

    roundedRect(ctx, codeX, codeY, codeW, codeH, Math.floor(r * 0.8));
    ctx.fillStyle = 'rgba(6, 8, 12, 0.55)';
    ctx.fill();

    ctx.beginPath();
    ctx.rect(codeX, codeY, codeW, codeH);
    ctx.clip();

    ctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';

    let y = codeY + Math.floor(font * 0.85);
    const gutter = Math.floor(font * 2.1);

    for (let i = 0; i < seg.code.length; i++){
      const ln = String(i + 1).padStart(2, '0');
      ctx.fillStyle = 'rgba(255, 240, 225, 0.28)';
      ctx.fillText(ln, codeX + Math.floor(font * 0.8), y);

      let text = seg.code[i];
      if (i === codeIdx) text = text.slice(0, Math.floor(codeShown));
      if (i > codeIdx) text = '';

      ctx.fillStyle = 'rgba(255, 240, 225, 0.82)';
      ctx.fillText(text, codeX + gutter, y);

      // cursor
      if (i === codeIdx && phase === 'typing'){
        const blink = (Math.sin(t * 6.2) > 0) ? 1 : 0;
        if (blink){
          const m = ctx.measureText(text);
          const cx = codeX + gutter + m.width + 2;
          ctx.fillStyle = 'rgba(255,190,140,0.75)';
          ctx.fillRect(cx, y + 2, Math.max(2, Math.floor(font * 0.12)), font + 2);
        }
      }

      y += lineH;
    }
    ctx.restore();

    // right panel (artifact + logs)
    ctx.save();
    const rightX = split;
    const rightY = ay;
    const rightW = ax + aw - split;
    const rightH = ah;

    roundedRect(ctx, rightX, rightY, rightW, rightH, Math.floor(r * 0.8));
    ctx.fillStyle = 'rgba(6, 8, 12, 0.45)';
    ctx.fill();

    // artifact box
    const boxH = Math.floor(rightH * 0.48);
    const boxPad = Math.floor(font * 0.9);
    const boxX = rightX + boxPad;
    const boxY = rightY + boxPad;
    const boxW = rightW - boxPad * 2;

    roundedRect(ctx, boxX, boxY, boxW, boxH - boxPad, Math.floor(r * 0.7));
    ctx.fillStyle = 'rgba(16, 12, 20, 0.85)';
    ctx.fill();

    // progress bar
    const prog = phase === 'success' ? 1 : (phase === 'typing' ? 0.25 : 0.65);
    const pulse = 0.5 + 0.5 * Math.sin(t * 5.0);
    const barY = boxY + (boxH - boxPad) - Math.floor(font * 1.2);
    const barH = Math.max(6, Math.floor(font * 0.35));

    ctx.fillStyle = 'rgba(255, 240, 225, 0.10)';
    ctx.fillRect(boxX + Math.floor(font * 0.8), barY, boxW - Math.floor(font * 1.6), barH);

    const fillW = (boxW - Math.floor(font * 1.6)) * Math.min(1, Math.max(0.05, prog * (0.72 + 0.28 * pulse)));
    ctx.fillStyle = phase === 'success' ? 'rgba(120,255,190,0.55)' : 'rgba(255,190,140,0.45)';
    ctx.fillRect(boxX + Math.floor(font * 0.8), barY, fillW, barH);

    // simple "compiled" icon that changes each segment
    const cx = boxX + boxW / 2;
    const cy = boxY + (boxH - boxPad) / 2 - Math.floor(font * 0.2);
    const s = Math.floor(Math.min(boxW, boxH) * 0.12);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin(t * 0.6) * 0.06);
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = Math.max(2, Math.floor(font * 0.12));

    const ok = phase === 'success';
    ctx.strokeStyle = ok ? 'rgba(170,255,220,0.85)' : 'rgba(255, 240, 225, 0.65)';
    ctx.fillStyle = ok ? 'rgba(120,255,190,0.12)' : 'rgba(255,190,140,0.10)';

    // Draw one of a few glyphs
    const a = artifact;
    if (a === 0){
      ctx.beginPath();
      ctx.rect(-s, -s, s*2, s*2);
      ctx.fill();
      ctx.stroke();
    } else if (a === 1){
      ctx.beginPath();
      ctx.moveTo(0, -s*1.25);
      ctx.lineTo(s*1.2, s);
      ctx.lineTo(-s*1.2, s);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (a === 2){
      ctx.beginPath();
      ctx.arc(0, 0, s*1.2, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
    } else if (a === 3){
      ctx.beginPath();
      ctx.moveTo(-s*1.2, 0);
      ctx.lineTo(0, -s*1.2);
      ctx.lineTo(s*1.2, 0);
      ctx.lineTo(0, s*1.2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (a === 4){
      roundedRect(ctx, -s*1.4, -s*0.9, s*2.8, s*1.8, s*0.6);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s*0.9, 0);
      ctx.lineTo(s*0.9, 0);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-s*1.2, -s*0.8);
      ctx.lineTo(s*1.2, -s*0.8);
      ctx.lineTo(s*0.6, s*1.1);
      ctx.lineTo(-s*0.6, s*1.1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // If failing, draw a tiny warning "!"
    if (phase === 'fixing'){
      ctx.strokeStyle = 'rgba(255,120,170,0.85)';
      ctx.beginPath();
      ctx.moveTo(0, -s*0.7);
      ctx.lineTo(0, s*0.45);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, s*0.8, Math.max(2, Math.floor(s*0.12)), 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,120,170,0.85)';
      ctx.fill();
    }

    ctx.restore();

    // logs
    const logY0 = boxY + (boxH - boxPad) + Math.floor(font * 0.5);
    ctx.save();
    ctx.beginPath();
    ctx.rect(boxX, logY0, boxW, rightY + rightH - logY0 - boxPad);
    ctx.clip();

    ctx.font = `${Math.floor(font * 0.92)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';

    let ly = logY0;
    for (const l of log){
      const txt = l.text.slice(0, Math.floor(l.shown));
      const isErr = txt.startsWith('error');
      ctx.fillStyle = isErr ? 'rgba(255,120,170,0.90)' : 'rgba(255, 240, 225, 0.75)';
      ctx.fillText(txt, boxX, ly);
      ly += lineH;
    }

    ctx.restore();
    ctx.restore();

    // bottom caption strip
    ctx.save();
    ctx.fillStyle = 'rgba(255, 190, 140, 0.10)';
    ctx.fillRect(0, h * 0.91, w, Math.floor(h * 0.09));
    ctx.fillStyle = 'rgba(255, 240, 225, 0.75)';
    ctx.font = `${Math.floor(h / 36)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText('code • build logs • punchline errors • tiny fixes', w * 0.05, h * 0.95);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
