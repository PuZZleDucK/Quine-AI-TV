import { mulberry32 } from '../util/prng.js';

const BUG_NOUNS = [
  'off-by-one', 'race condition', 'null pointer', 'heisenbug', 'timezone drift',
  'floating point gremlin', 'CSS specificity duel', 'broken cache', 'stale state',
  'misplaced await', 'silent NaN', 'wrong UUID', 'infinite loop', 'CORS tantrum',
];

const BUG_VERBS = [
  'haunted', 'derailed', 'ate', 'corrupted', 'shadowed', 'duplicated', 'froze',
  'reversed', 'flattened', 'desynced', 'hid', 'teleported',
];

const BUG_OBJECTS = [
  'the login button', 'the build pipeline', 'the onboarding flow', 'the graph',
  'the audio toggle', 'the channel guide', 'the API client', 'the search results',
  'the settings panel', 'the database migration',
];

const FIXES = [
  'added a guard clause', 'moved it into the right event loop tick',
  'deleted the "clever" part', 'wrote a tiny test', 'made the state explicit',
  'stopped mutating in place', 'replaced it with a boring function',
  'renamed the variable to the truth', 'clamped the value',
  'restarted from first principles',
];

const LESSONS = [
  'Logs are feelings with timestamps.',
  'If it’s flaky, it’s deterministic somewhere else.',
  'Clever code is just future-you’s jump scare.',
  'The bug was in the assumption, not the line.',
  'The simplest fix is usually the correct apology.',
  'Sleep is a debugging tool.',
  'If you can explain it to the duck, you can refactor it.',
];

function pick(rand, a){ return a[(rand() * a.length) | 0]; }

function confessional(rand){
  const hh = String((1 + (rand() * 4) | 0)).padStart(2, '0');
  const mm = String((rand() * 60) | 0).padStart(2, '0');
  const who = (rand() < 0.5) ? 'dev' : 'operator';
  const bug = `${pick(rand, BUG_NOUNS)} ${pick(rand, BUG_VERBS)} ${pick(rand, BUG_OBJECTS)}`;
  const fix = pick(rand, FIXES);
  const lesson = pick(rand, LESSONS);

  return [
    `${hh}:${mm}  ${who}: okay duck, here’s what happened…`,
    `BUG: ${bug}.`,
    `FIX: ${fix}.`,
    `LESSON: ${lesson}`
  ];
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, t = 0;
  let font = 18;
  let lineH = 22;

  let transcript = []; // {text, shown, color}
  let pending = [];
  let hold = 0;

  let beepCooldown = 0;
  let roomTone = null;

  function init({ width, height }){
    w = width; h = height; t = 0;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    lineH = Math.floor(font * 1.25);

    transcript = [];
    pending = confessional(rand);
    hold = 0.6;
  }

  function onResize(width, height){
    w = width; h = height;
    init({ width, height });
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    const n = audio.noiseSource({ type: 'brown', gain: 0.01 });
    n.start();
    roomTone = { stop(){ n.stop(); } };
    audio.setCurrent(roomTone);
  }

  function onAudioOff(){
    try { roomTone?.stop?.(); } catch {}
    roomTone = null;
  }

  function destroy(){
    onAudioOff();
  }

  function pushLine(text, color){
    transcript.push({ text, shown: 0, color });
    const maxLines = Math.max(10, Math.floor((h * 0.62) / lineH));
    while (transcript.length > maxLines) transcript.shift();
  }

  function update(dt){
    t += dt;
    beepCooldown -= dt;

    // If we have nothing queued, wait, then start a new confessional.
    if (pending.length === 0){
      hold -= dt;
      if (hold <= 0){
        pending = confessional(rand);
        hold = 2.0 + rand() * 2.8;
        pushLine('', 'rgba(180,210,220,0.35)');
      }
    }

    // Ensure we have a current line to type into.
    if (pending.length > 0){
      if (transcript.length === 0 || transcript[transcript.length - 1].shown >= transcript[transcript.length - 1].text.length){
        const next = pending.shift();
        let color = 'rgba(210, 255, 230, 0.92)';
        if (next.startsWith('BUG:')) color = 'rgba(255, 120, 170, 0.92)';
        else if (next.startsWith('FIX:')) color = 'rgba(120, 220, 255, 0.92)';
        else if (next.startsWith('LESSON:')) color = 'rgba(190, 210, 255, 0.88)';
        else if (next.trim() === '') color = 'rgba(180,210,220,0.35)';

        pushLine(next, color);
        if (audio.enabled && beepCooldown <= 0){
          beepCooldown = 0.05;
          audio.beep({ freq: 520 + rand() * 90, dur: 0.02, gain: 0.02, type: 'triangle' });
        }
      }

      const cur = transcript[transcript.length - 1];
      if (cur && cur.shown < cur.text.length){
        const speed = 35 + rand() * 20; // chars/sec, slightly jittery
        const prev = cur.shown;
        cur.shown = Math.min(cur.text.length, cur.shown + dt * speed);

        // subtle key clicks, rate-limited
        const gained = Math.floor(cur.shown) - Math.floor(prev);
        if (gained > 0 && audio.enabled && beepCooldown <= 0){
          beepCooldown = 0.06 + rand() * 0.05;
          audio.beep({ freq: 1200 + rand() * 400, dur: 0.012, gain: 0.012, type: 'square' });
        }
      }
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

    // Nighty background gradient + vignette
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#040812');
    bg.addColorStop(1, '#00040b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const vg = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.65);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // Terminal window
    const tw = Math.floor(w * 0.86);
    const th = Math.floor(h * 0.76);
    const tx = Math.floor((w - tw) / 2);
    const ty = Math.floor(h * 0.12);
    const r = Math.floor(Math.min(w, h) * 0.02);

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    roundedRect(ctx, tx + 10, ty + 12, tw, th, r);
    ctx.fill();
    ctx.restore();

    // body
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(6, 14, 24, 0.92)';
    roundedRect(ctx, tx, ty, tw, th, r);
    ctx.fill();
    ctx.restore();

    // header bar
    const hh = Math.floor(th * 0.11);
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(20, 38, 58, 0.95)';
    roundedRect(ctx, tx, ty, tw, hh, r);
    ctx.fill();
    ctx.fillStyle = 'rgba(108,242,255,0.85)';
    ctx.fillRect(tx, ty + hh - 2, tw, 2);

    ctx.font = `${Math.floor(font * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(220, 245, 255, 0.9)';
    ctx.textBaseline = 'middle';
    ctx.fillText('LATE NIGHT RUBBER DUCK DEBUGGING', tx + Math.floor(tw * 0.05), ty + hh / 2);

    // tiny status lights
    const lx = tx + Math.floor(tw * 0.88);
    const ly = ty + hh / 2;
    const lr = Math.max(3, Math.floor(font * 0.2));
    const lights = ['#ff5aa5', '#ffd66b', '#63ffb6'];
    for (let i = 0; i < 3; i++){
      ctx.beginPath();
      ctx.fillStyle = lights[i];
      ctx.globalAlpha = 0.7;
      ctx.arc(lx + i * (lr * 2.2), ly, lr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // text area
    const pad = Math.floor(tw * 0.05);
    const ax = tx + pad;
    const ay = ty + hh + Math.floor(pad * 0.6);
    const aw = tw - pad * 2;
    const ah = th - hh - Math.floor(pad * 1.2);

    // scanline-ish tint
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = 'rgba(108,242,255,1)';
    for (let y = ay; y < ay + ah; y += 3){
      ctx.fillRect(ax, y, aw, 1);
    }
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(ax, ay, aw, ah);
    ctx.clip();

    ctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';

    let y = ay;
    for (const line of transcript){
      const shown = line.text.slice(0, Math.floor(line.shown));
      ctx.fillStyle = line.color;
      ctx.fillText(shown, ax, y);
      y += lineH;
    }

    // cursor
    const cur = transcript[transcript.length - 1];
    if (cur && cur.shown < cur.text.length){
      const blink = (Math.sin(t * 6.5) > 0) ? 1 : 0;
      if (blink){
        const shown = cur.text.slice(0, Math.floor(cur.shown));
        const cx = ax + ctx.measureText(shown).width + 2;
        const cy = ay + (transcript.length - 1) * lineH;
        ctx.fillStyle = 'rgba(108,242,255,0.75)';
        ctx.fillRect(cx, cy + 2, Math.max(2, Math.floor(font * 0.12)), font + 2);
      }
    }

    // duck cameo
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = 'rgba(220, 245, 255, 0.9)';
    const duck = [
      '   __',
      '__(o )>',
      '\\___/ ',
      ' "  "  '
    ];
    const dx = ax + aw - Math.floor(font * 7.2);
    const dy = ay + ah - Math.floor(font * 4.8);
    ctx.font = `${Math.floor(font * 0.9)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    for (let i = 0; i < duck.length; i++) ctx.fillText(duck[i], dx, dy + i * Math.floor(font * 1.1));
    ctx.restore();

    ctx.restore();

    // bottom caption
    ctx.save();
    ctx.fillStyle = 'rgba(108,242,255,0.18)';
    ctx.fillRect(0, h * 0.91, w, Math.floor(h * 0.09));
    ctx.fillStyle = 'rgba(220, 245, 255, 0.7)';
    ctx.font = `${Math.floor(h / 34)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText('confessionals • bugs • fixes • lessons', w * 0.05, h * 0.95);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
