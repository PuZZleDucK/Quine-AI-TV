// REVIEWED: 2026-02-13
import { mulberry32 } from '../util/prng.js';

const BUG_NOUNS = [
  'off-by-one', 'race condition', 'null pointer', 'heisenbug', 'timezone drift',
  'floating point gremlin', 'CSS specificity duel', 'broken cache', 'stale state',
  'misplaced await', 'silent NaN', 'wrong UUID', 'infinite loop', 'CORS tantrum',
  'memory leak', 'deadlock', 'bad regex', 'unicode goblin', 'locale mismatch',
  'bitshift oops',
  'unhandled rejection', 'retry spiral', 'stuck promise', 'event storm',
  'index out of bounds', 'clock skew', 'stale token', 'double-encoded JSON',
  'invisible character', 'bad merge', 'shadow DOM trap', 'broken polyfill',
  'font fallback', 'NaN cascade',
];

const BUG_VERBS = [
  'haunted', 'derailed', 'ate', 'corrupted', 'shadowed', 'duplicated', 'froze',
  'reversed', 'flattened', 'desynced', 'hid', 'teleported',
  'throttled', 'forked', 'misfiled', 'blindsided',
  'panicked', 'restarted', 'segfaulted', 'soft-locked', 'flapped',
  'misrendered', 'overwrote', 'underflowed', 'overflowed', 'reordered',
];

const BUG_OBJECTS = [
  'the login button', 'the build pipeline', 'the onboarding flow', 'the graph',
  'the audio toggle', 'the channel guide', 'the API client', 'the search results',
  'the settings panel', 'the database migration',
  'the loading spinner', 'the websocket', 'the rate limiter', 'the cache key',
  'the cron job', 'the email template',
  'the payment modal', 'the notification bell', 'the progress bar',
  'the export button', 'the session cookie', 'the websocket handshake',
  'the auth header', 'the feature flag', 'the router', 'the i18n strings',
  'the background job', 'the search index', 'the video player',
  'the analytics event', 'the GPU canvas', 'the CDN edge',
];

const FIXES = [
  'added a guard clause', 'moved it into the right event loop tick',
  'deleted the "clever" part', 'wrote a tiny test', 'made the state explicit',
  'stopped mutating in place', 'replaced it with a boring function',
  'renamed the variable to the truth', 'clamped the value',
  'restarted from first principles',
  'added a retry with backoff', 'stopped rounding twice',
  'made it a pure function', 'documented the footgun',
  'validated inputs like an adult', 'stopped parsing dates by vibes',
  'made the retry finite', 'added a timeout', 'added a circuit breaker',
  'moved it behind a feature flag', 'pinned the version', 'deleted a dependency',
  'made the error loud', 'added an assertion', 'made it idempotent',
  'added tracing', 'replaced magic numbers',
];

const LESSONS = [
  'Logs are feelings with timestamps.',
  'If it’s flaky, it’s deterministic somewhere else.',
  'Clever code is just future-you’s jump scare.',
  'The bug was in the assumption, not the line.',
  'The simplest fix is usually the correct apology.',
  'Sleep is a debugging tool.',
  'If you can explain it to the duck, you can refactor it.',
  'If you can’t reproduce it, you can’t fix it.',
  'The second best fix is a log line.',
  'State is a liar unless you make it confess.',
  'The network is a suggestion.',
  'Every cache is a lie waiting to happen.',
  'Time is an API you can’t trust.',
  'If it’s "just one line", it’s never one line.',
  'Undefined behavior is defined by spite.',
  'Your future self is a different person.',
  'Don’t ship on a Friday.',
  'If it compiles, it can still be wrong.',
  'Bugs love silence; add logs.',
  'Once is a glitch; twice is a pattern.',
];

const USERNAMES = [
  'dev', 'operator', 'oncall', 'qa', 'buildbot', 'intern',
  'db-admin', 'frontend', 'backend', 'infra',
  'sre', 'security', 'release', 'product',
];

const OPENERS = [
  'okay duck, here’s what happened…',
  'duck. buddy. i need you.',
  'so. hypothetically. if a bug…',
  'i touched nothing and now it’s on fire.',
  'this one’s embarrassing…',
  'we are, in technical terms, cooked.',
  'help me explain this so i can fix it.',
  'it only fails on the demo machine. naturally.',
  'i have a theory. it’s bad.',
  'this is a small bug with big emotions.',
  'duck, i have receipts. the logs do not.',
  'i swear it passed locally.',
  'it worked yesterday. i have witnesses.',
  'this is not a bug, it’s a lifestyle.',
  'please pretend you didn’t see that commit.',
  'my brain is a stack overflow right now.',
  'so… the dashboard is lying.',
  'this is either cursed or i wrote it.',
  'i tried turning it off and on. it got worse.',
];

// Uncommon/rare ASCII art stingers for bug + fix lines.
// (Deterministic per-seed; intended to be small/OSD-safe.)
const BUG_ART = {
  uncommon: [
    [
      '   .-.-.',
      '  (o o )',
      '   | O |',
      '   |   |',
      '   `~~~\'',
    ],
    [
      '  /\\_/\\',
      ' ( o.o )',
      '  > ^ <',
    ],
    [
      '  .---.',
      ' / x x\\',
      ' \\  ^  /',
      '  `---\'',
    ],
  ],
  rare: [
    [
      '      ____',
      '  ___/____\\___',
      ' /  /  __  \\  \\',
      '|  |  (__)  |  |',
      ' \\__\\____/__/ ',
      '    (______)    ',
    ],
    [
      '  .----.',
      ' / .--.\\',
      '| |    | |',
      '| |    | |',
      ' \\ \'--\' /',
      '  `----\'',
    ],
  ],
};

const FIX_ART = {
  uncommon: [
    [
      '   ____',
      ' _|__|__|_',
      '|  ____  |',
      '|_|____|_|',
    ],
    [
      '   _/\\_',
      ' _|    |_',
      '|  [] [] |',
      '|__----__|',
    ],
  ],
  rare: [
    [
      '  ___________',
      ' /          /|',
      '/__________/ |',
      '|  PATCHED | |',
      '|  & TESTS | /',
      '|__________|/',
    ],
  ],
};

const BUG_LINES = [
  (bug) => `BUG: ${bug}.`,
  (bug) => `BUG REPORT: ${bug}.`,
  (bug) => `BUG: apparently ${bug}.`,
  (bug) => `BUG: turns out ${bug}.`,
];

const FIX_LINES = [
  (fix) => `FIX: ${fix}.`,
  (fix) => `FIX: ${fix}. (don’t look at git blame)`,
  (fix) => `FIX: ${fix}. shipped a tiny test to keep it honest.`,
];

const LESSON_LINES = [
  (lesson) => `LESSON: ${lesson}`,
  (lesson) => `LESSON LEARNED: ${lesson}`,
  (lesson) => `NOTE TO SELF: ${lesson}`,
];

// Fake stack traces (short, multiline, terminal-wrapped).
const STACK_ERROR_TYPES = [
  'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'DOMException', 'AssertionError', 'Error',
];

const STACK_PROPS = [
  'length', 'map', 'id', 'name', 'value', 'enabled', 'toString', 'push',
  'getContext', 'dataset', 'classList', 'status', 'ok', 'body', 'headers',
];

const STACK_FUNCS = [
  'render', 'update', 'init', 'tick', 'hydrate', 'parseConfig', 'decodeToken',
  'handleClick', 'fetchData', 'applyPatch', 'connect', 'dispatch', 'commit',
  'drawHUD', 'layout', 'main',
];

const STACK_DIRS = [
  'src', 'src/core', 'src/lib', 'src/ui', 'src/util', 'src/channels',
];

const STACK_FILES = [
  'index', 'app', 'router', 'store', 'api', 'auth', 'ui', 'render', 'hooks',
  'utils', 'scheduler', 'player', 'channel', 'audio', 'canvas',
];

const STACK_OBJECTS = [
  'App', 'Router', 'Store', 'Player', 'Audio', 'Canvas', 'Scheduler', 'Hooks',
  'Auth', 'API', 'Channel', 'HUD', 'Renderer',
];

const STACK_ALIASES = [
  'onClick', 'onKeyDown', 'onResize', 'onMessage', 'onFrame', 'onTick',
  'handleEvent', 'dispatchAction',
];

const STACK_EXTS = ['js', 'ts', 'mjs'];

const STACK_INTERNAL = [
  'node:internal/process/task_queues:95:5',
  'node:internal/timers:569:17',
  'node:internal/async_hooks:203:9',
];

const STACK_MSGS = [
  (rand) => `Cannot read properties of undefined (reading '${pick(rand, STACK_PROPS)}')`,
  (rand) => `Cannot set properties of null (setting '${pick(rand, STACK_PROPS)}')`,
  (rand) => `${pick(rand, STACK_PROPS)} is not a function`,
  (rand) => `Maximum call stack size exceeded`,
  (rand) => `Unexpected token ${pick(rand, ['<', '}', ';', 'EOF'])} in JSON at position ${((rand() * 900) | 0)}`,
  (rand) => `Request failed with status ${400 + ((rand() * 120) | 0)}`,
  (rand) => `Permission denied: '${pick(rand, ['cache', 'tmp', 'config', 'secrets'])}'`,
];

function fakeDiffSnippet(rand){
  const dir = pick(rand, STACK_DIRS);
  const file = pick(rand, STACK_FILES);
  const ext = pick(rand, STACK_EXTS);
  const path = `${dir}/${file}.${ext}`;
  const ln = 10 + ((rand() * 240) | 0);

  const prop = pick(rand, STACK_PROPS);
  const fn = pick(rand, STACK_FUNCS);

  const variants = [
    () => ({
      oldLine: `if (${prop}) ${fn}();`,
      newLine: `if (${prop} != null) ${fn}();`,
    }),
    () => ({
      oldLine: `const x = obj.${prop};`,
      newLine: `const x = obj?.${prop};`,
    }),
    () => ({
      oldLine: `return ${fn}(state.${prop});`,
      newLine: `return ${fn}(state?.${prop});`,
    }),
  ];

  const { oldLine, newLine } = pick(rand, variants)();

  return [
    `    --- a/${path}`,
    `    +++ b/${path}`,
    `    @@ -${ln},1 +${ln},1 @@`,
    `    -  ${oldLine}`,
    `    +  ${newLine}`,
  ];
}

function fakeStackTrace(rand){
  const errType = pick(rand, STACK_ERROR_TYPES);
  const msg = pick(rand, STACK_MSGS)(rand);

  const n = 3 + ((rand() * 4) | 0); // 3..6 frames
  const lines = [`${errType}: ${msg}`];

  for (let i = 0; i < n; i++){
    if (i === n - 1 && rand() < 0.35){
      lines.push(`    at processTicksAndRejections (${pick(rand, STACK_INTERNAL)})`);
      continue;
    }

    const isAsync = rand() < 0.35;
    const asyncPrefix = isAsync ? 'async ' : '';

    const obj = pick(rand, STACK_OBJECTS);
    const fn = pick(rand, STACK_FUNCS);
    const alias = pick(rand, STACK_ALIASES);

    const dir = pick(rand, STACK_DIRS);
    const file = pick(rand, STACK_FILES);
    const ext = pick(rand, STACK_EXTS);

    const ln = 10 + ((rand() * 240) | 0);
    const col = 1 + ((rand() * 80) | 0);

    const templates = [
      () => `    at ${asyncPrefix}${fn} (${dir}/${file}.${ext}:${ln}:${col})`,
      () => `    at ${asyncPrefix}${obj}.${fn} (${dir}/${file}.${ext}:${ln}:${col})`,
      () => `    at ${asyncPrefix}Object.${fn} (${dir}/${file}.${ext}:${ln}:${col})`,
      () => `    at ${asyncPrefix}${fn} (file://${dir}/${file}.${ext}:${ln}:${col})`,
      () => `    at ${asyncPrefix}${fn} (${file}.${ext}:${ln}:${col})`,
      () => `    at ${asyncPrefix}${fn} [as ${alias}] (${dir}/${file}.${ext}:${ln}:${col})`,
    ];

    lines.push(pick(rand, templates)());
  }

  // Occasionally include a tiny diff-style snippet (indented) like in debug logs.
  if (rand() < 0.25) lines.push(...fakeDiffSnippet(rand));

  return lines;
}

function pick(rand, a){ return a[(rand() * a.length) | 0]; }

function maybeArt(rand, pool){
  // ~12% uncommon, ~3% rare.
  const r = rand();
  if (r < 0.03) return pick(rand, pool.rare);
  if (r < 0.15) return pick(rand, pool.uncommon);
  return null;
}

function confessional(rand){
  const hh = String((1 + (rand() * 4) | 0)).padStart(2, '0');
  const mm = String((rand() * 60) | 0).padStart(2, '0');
  const who = pick(rand, USERNAMES);
  const opener = pick(rand, OPENERS);

  const bug = `${pick(rand, BUG_NOUNS)} ${pick(rand, BUG_VERBS)} ${pick(rand, BUG_OBJECTS)}`;
  const fix = pick(rand, FIXES);
  const lesson = pick(rand, LESSONS);

  const lines = [];
  lines.push(`${hh}:${mm}  ${who}: ${opener}`);

  lines.push(pick(rand, BUG_LINES)(bug));
  if (rand() < 0.38) lines.push(...fakeStackTrace(rand));
  const bugArt = maybeArt(rand, BUG_ART);
  if (bugArt) lines.push(...bugArt);

  lines.push(pick(rand, FIX_LINES)(fix));
  const fixArt = maybeArt(rand, FIX_ART);
  if (fixArt) lines.push(...fixArt);

  lines.push(pick(rand, LESSON_LINES)(lesson));
  return lines;
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  // Determinism: keep audio randomness from consuming the visual PRNG so the same
  // seed yields identical visuals with audio on/off.
  const audioRand = mulberry32(((seed | 0) ^ 0xA11D0BEE) >>> 0);
  // Determinism: typing speed jitter should be per-line (FPS-stable).
  const typeRand = mulberry32(((seed | 0) ^ 0x71BEEFED) >>> 0);
  // Determinism: special-moment FX should not perturb the confessional PRNG.
  const fxRand = mulberry32(((seed | 0) ^ 0xC0FFEE77) >>> 0);

  // Explicit time-structured phases (calm → crisis → resolution).
  // These modulate typing speed, scanline intensity, and between-confessional hold.
  const PHASES = [
    { name: 'calm', dur: 18, typeMul: 0.85, scanMul: 0.85, holdMul: 1.25 },
    { name: 'crisis', dur: 11, typeMul: 1.45, scanMul: 1.75, holdMul: 0.65 },
    { name: 'resolution', dur: 16, typeMul: 0.95, scanMul: 1.05, holdMul: 1.05 },
  ];
  const PHASE_TOTAL = PHASES.reduce((s, p) => s + p.dur, 0);
  const PHASE_XFADE = 1.4; // seconds of crossfade at phase boundaries

  function lerp(a, b, u){ return a + (b - a) * u; }
  function smoothstep01(x){
    const u = Math.max(0, Math.min(1, x));
    return u * u * (3 - 2 * u);
  }

  function phaseParams(tt){
    let x = (PHASE_TOTAL > 0) ? (tt % PHASE_TOTAL) : 0;
    let i = 0;
    while (i < PHASES.length - 1 && x >= PHASES[i].dur){
      x -= PHASES[i].dur;
      i++;
    }

    const a = PHASES[i];
    const b = PHASES[(i + 1) % PHASES.length];
    const xfade = Math.min(PHASE_XFADE, a.dur * 0.5);

    let blend = 0;
    if (xfade > 0 && x > a.dur - xfade){
      blend = smoothstep01((x - (a.dur - xfade)) / xfade);
    }

    return {
      name: a.name,
      typeMul: lerp(a.typeMul, b.typeMul, blend),
      scanMul: lerp(a.scanMul, b.scanMul, blend),
      holdMul: lerp(a.holdMul, b.holdMul, blend),
    };
  }

  let w = 0, h = 0, t = 0;
  let font = 18;
  let lineH = 22;

  let transcript = []; // {text, shown, color}
  let pending = [];
  let hold = 0;
  let holdAdjusted = false;

  // special moments (rare; OSD-safe)
  let glitch = 0; // 0..1
  let stamp = 0; // 0..1
  let stampText = 'BUG!';
  let nextSpecialAt = 0;

  let beepCooldown = 0;
  let roomTone = null;

  // Cached gradients (rebuild on resize or ctx swap) to keep render() allocation-free.
  let gradCtx = null;
  let gradW = 0, gradH = 0;
  let bgGrad = null;
  let vgGrad = null;

  // Cached scanline pattern (rebuild on ctx swap) so we don't loop fillRect per frame.
  let scanCtx = null;
  let scanTile = null;
  let scanPattern = null;

  // Cached terminal text metrics (rebuild on resize/ctx swap) to avoid measureText() every frame.
  let metricsDirty = true;
  let metricsCtx = null;
  let metricsAw = 0;
  let metricsFont = '';
  let termCharW = 10;
  let termMaxChars = 60;

  function ensureTextMetrics(ctx, aw){
    const fontStr = ctx.font || '';
    if (!metricsDirty && ctx === metricsCtx && aw === metricsAw && fontStr === metricsFont) return;

    metricsDirty = false;
    metricsCtx = ctx;
    metricsAw = aw;
    metricsFont = fontStr;

    termCharW = ctx.measureText('M').width || 10;
    termMaxChars = Math.max(12, Math.floor(aw / termCharW));
  }

  function ensureGradients(ctx){
    if (ctx !== gradCtx || w !== gradW || h !== gradH || !bgGrad || !vgGrad){
      gradCtx = ctx;
      gradW = w; gradH = h;

      bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#040812');
      bgGrad.addColorStop(1, '#00040b');

      vgGrad = ctx.createRadialGradient(
        w * 0.5, h * 0.5, 0,
        w * 0.5, h * 0.5, Math.max(w, h) * 0.65
      );
      vgGrad.addColorStop(0, 'rgba(0,0,0,0)');
      vgGrad.addColorStop(1, 'rgba(0,0,0,0.65)');
    }
  }

  function ensureScanPattern(ctx){
    if (ctx === scanCtx && scanPattern) return;

    scanCtx = ctx;

    if (!scanTile){
      scanTile = document.createElement('canvas');
      scanTile.width = 8;
      scanTile.height = 3;
      const sctx = scanTile.getContext('2d');
      sctx.clearRect(0, 0, scanTile.width, scanTile.height);
      sctx.fillStyle = 'rgba(108,242,255,1)';
      sctx.fillRect(0, 0, scanTile.width, 1);
    }

    scanPattern = ctx.createPattern(scanTile, 'repeat');
  }

  function init({ width, height }){
    w = width; h = height; t = 0;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    lineH = Math.floor(font * 1.25);

    // Force cache rebuild after any size reset.
    gradCtx = null;
    bgGrad = null;
    vgGrad = null;
    gradW = 0; gradH = 0;

    scanCtx = null;
    scanPattern = null;

    metricsDirty = true;
    metricsCtx = null;

    transcript = [];
    pending = confessional(rand);
    hold = 0.6;
    holdAdjusted = false;

    glitch = 0;
    stamp = 0;
    stampText = 'BUG!';
    nextSpecialAt = 12 + fxRand() * 20;
  }

  function onResize(width, height){
    w = width; h = height;
    init({ width, height });
  }

  function stopRoomTone({ clearCurrent = false } = {}){
    const handle = roomTone;
    if (!handle) return;

    const isCurrent = audio.current === handle;
    if (clearCurrent && isCurrent){
      audio.stopCurrent();
    } else {
      try { handle?.stop?.(); } catch {}
    }

    roomTone = null;
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // Idempotent: if our room tone is already the current handle, keep it.
    if (roomTone && audio.current === roomTone) return;

    // If we previously started one (even if no longer current), stop it.
    stopRoomTone({ clearCurrent: true });

    const n = audio.noiseSource({ type: 'brown', gain: 0.01 });
    n.start();
    roomTone = { stop(){ n.stop(); } };
    audio.setCurrent(roomTone);
  }

  function onAudioOff(){
    stopRoomTone({ clearCurrent: true });
  }

  function destroy(){
    onAudioOff();
  }

  function pushLine(text, color){
    const speed = (text && text.length) ? (35 + typeRand() * 20) : 0;
    transcript.push({ text, shown: 0, color, speed });
    const maxLines = Math.max(10, Math.floor((h * 0.62) / lineH));
    while (transcript.length > maxLines) transcript.shift();
  }

  function lastSignificantPrefix(){
    for (let i = transcript.length - 1; i >= 0; i--){
      const s = transcript[i]?.text || '';
      if (s.startsWith('BUG:')) return 'BUG';
      if (s.startsWith('FIX:')) return 'FIX';
    }
    return '';
  }

  function triggerSpecial(){
    glitch = Math.max(glitch, 1);
    stamp = Math.max(stamp, 1);

    const p = lastSignificantPrefix();
    if (p === 'BUG') stampText = 'BUG!';
    else if (p === 'FIX') stampText = 'FIXED';
    else stampText = (fxRand() < 0.5) ? 'BUG!' : 'FIXED';

    if (audio.enabled){
      audio.beep({ freq: 760 + audioRand() * 160, dur: 0.018, gain: 0.010, type: 'sawtooth' });
      if (audioRand() < 0.6) audio.beep({ freq: 420 + audioRand() * 90, dur: 0.030, gain: 0.006, type: 'triangle' });
    }
  }

  function drawStamp(ctx, tx, ty, tw, hh){
    if (stamp <= 0.02) return;

    const a = Math.min(1, stamp);
    const text = stampText || 'BUG!';
    const isBug = text.startsWith('BUG');
    const col = isBug ? 'rgba(255, 90, 165, 1)' : 'rgba(120, 220, 255, 1)';

    const size = Math.max(10, Math.floor(hh * 0.46));

    ctx.save();
    ctx.translate(tx + tw * 0.72, ty + hh * 0.52);
    ctx.rotate(-0.12);

    ctx.font = `800 ${size}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';

    const m = ctx.measureText(text);
    const pad = size * 0.55;
    const bw = m.width + pad * 2;
    const bh = size * 1.25;

    ctx.globalAlpha = 0.55 * a;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundedRect(ctx, -bw/2, -bh/2, bw, bh, Math.max(6, Math.floor(size * 0.35)));
    ctx.fill();

    ctx.globalAlpha = 0.80 * a;
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(2, Math.floor(size * 0.08));
    ctx.stroke();

    ctx.globalAlpha = 0.92 * a;
    ctx.fillStyle = col;
    ctx.fillText(text, -m.width / 2, 0);

    ctx.restore();
  }

  function update(dt){
    t += dt;
    const phase = phaseParams(t);
    beepCooldown -= dt;

    glitch = Math.max(0, glitch - dt * 1.8);
    stamp = Math.max(0, stamp - dt * 0.9);

    if (t >= nextSpecialAt){
      triggerSpecial();
      nextSpecialAt = t + 18 + fxRand() * 34;
    }

    // If we have nothing queued, wait, then start a new confessional.
    if (pending.length === 0){
      // Apply the current phase's hold shaping once per pause.
      if (!holdAdjusted){
        hold = Math.max(0, hold * phase.holdMul);
        holdAdjusted = true;
      }

      hold -= dt;
      if (hold <= 0){
        pending = confessional(rand);
        hold = 2.0 + rand() * 2.8;
        holdAdjusted = false;
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
          audio.beep({ freq: 520 + audioRand() * 90, dur: 0.02, gain: 0.02, type: 'triangle' });
        }
      }

      const cur = transcript[transcript.length - 1];
      if (cur && cur.shown < cur.text.length){
        const speed = cur.speed * phase.typeMul; // chars/sec (phase-shaped)
        const prev = cur.shown;
        cur.shown = Math.min(cur.text.length, cur.shown + dt * speed);

        // subtle key clicks, rate-limited
        const gained = Math.floor(cur.shown) - Math.floor(prev);
        if (gained > 0 && audio.enabled && beepCooldown <= 0){
          beepCooldown = 0.06 + audioRand() * 0.05;
          audio.beep({ freq: 1200 + audioRand() * 400, dur: 0.012, gain: 0.012, type: 'square' });
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

  function wrapForTerminal(text, maxChars){
    if (text == null) return [''];
    if (text === '') return [''];
    if (text.length <= maxChars) return [text];

    function wrapPlain(src, width){
      const out = [];
      let rest = src;
      while (rest.length > width){
        let cut = rest.lastIndexOf(' ', width);
        if (cut < Math.floor(width * 0.5)) cut = width;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
        if (rest.startsWith(' ')) rest = rest.slice(1);
      }
      if (rest.length) out.push(rest);
      return out.length ? out : [''];
    }

    // Wrap indented lines (stack traces, code blocks) while preserving indentation.
    const m = text.match(/^\s+/);
    if (m){
      const indent = m[0];

      // If indentation itself is wider than the terminal, fall back to plain wrapping.
      // (Otherwise we'd generate lines that can never fit.)
      if (indent.length >= maxChars) return wrapPlain(text.trimStart(), maxChars);

      const body = text.slice(indent.length);
      const bodyWidth = Math.max(4, maxChars - indent.length);
      const parts = wrapPlain(body, bodyWidth);
      return parts.map(p => (indent + p).slice(0, maxChars));
    }

    return wrapPlain(text, maxChars);
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const phase = phaseParams(t);

    if (glitch > 0.02){
      const g = glitch;
      const jx = (Math.sin(t * 54.0) * 2.8 + Math.sin(t * 17.0) * 1.6) * g;
      const jy = (Math.cos(t * 47.0) * 1.8 + Math.sin(t * 9.0) * 1.2) * g;
      ctx.translate(jx, jy);
    }

    // Nighty background gradient + vignette
    ensureGradients(ctx);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = vgGrad;
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

    // phase indicator (subtle; stays within the window header)
    {
      const phaseText = String(phase?.name || 'calm').toUpperCase();
      const size = Math.max(10, Math.floor(font * 0.62));
      const charW = size * 0.62; // monospace-ish estimate; avoids measureText() hot-path
      const bw = Math.ceil(phaseText.length * charW + size * 1.25);
      const bh = Math.ceil(size * 1.35);
      const bx = Math.floor((lx - lr * 1.9) - bw);
      const by = Math.floor(ty + hh * 0.5 - bh * 0.5);

      let col = 'rgba(220,245,255,0.8)';
      if (phaseText === 'CRISIS') col = 'rgba(255,120,170,0.82)';
      else if (phaseText === 'RESOLUTION') col = 'rgba(190,210,255,0.82)';

      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      roundedRect(ctx, bx, by, bw, bh, Math.max(6, Math.floor(size * 0.5)));
      ctx.fill();

      ctx.globalAlpha = 0.48;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.globalAlpha = 0.78;
      ctx.font = `700 ${size}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillStyle = col;
      ctx.textBaseline = 'middle';
      ctx.fillText(phaseText, bx + Math.floor(size * 0.62), ty + hh / 2);
      ctx.restore();
    }

    for (let i = 0; i < 3; i++){
      ctx.beginPath();
      ctx.fillStyle = lights[i];
      ctx.globalAlpha = 0.7;
      ctx.arc(lx + i * (lr * 2.2), ly, lr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // rare stamp overlay (kept in header so it doesn’t obscure the transcript)
    drawStamp(ctx, tx, ty, tw, hh);

    // text area
    const pad = Math.floor(tw * 0.05);
    const ax = tx + pad;
    const ay = ty + hh + Math.floor(pad * 0.6);
    const aw = tw - pad * 2;
    const ah = th - hh - Math.floor(pad * 1.2);

    // scanline-ish tint (cached pattern; no per-frame loop)
    ensureScanPattern(ctx);
    ctx.save();
    ctx.globalAlpha = Math.min(0.45, (0.12 + glitch * 0.18) * phase.scanMul);
    ctx.fillStyle = scanPattern;
    ctx.fillRect(ax, ay, aw, ah);
    ctx.restore();

    if (glitch > 0.02){
      // subtle horizontal sync-bar during glitch moments (low alpha; OSD-safe)
      const p = 0.5 + 0.5 * Math.sin(t * 8.0);
      const by = ay + (0.10 + 0.75 * p) * ah;
      ctx.save();
      ctx.globalAlpha = 0.06 * glitch * phase.scanMul;
      ctx.fillStyle = 'rgba(220,245,255,1)';
      ctx.fillRect(ax, Math.floor(by), aw, Math.max(2, Math.floor(lineH * 0.6)));
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(ax, ay, aw, ah);
    ctx.clip();

    ctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';

    // Wrap long dialog lines to fit the terminal viewport.
    ensureTextMetrics(ctx, aw);
    const maxChars = termMaxChars;

    let y = ay;
    let cursorX = ax;
    let cursorY = ay;

    for (let i = 0; i < transcript.length; i++){
      const line = transcript[i];
      const shown = line.text.slice(0, Math.floor(line.shown));
      ctx.fillStyle = line.color;

      const parts = wrapForTerminal(shown, maxChars);
      for (let j = 0; j < parts.length; j++){
        ctx.fillText(parts[j], ax, y);
        if (i === transcript.length - 1){
          cursorY = y;
          cursorX = Math.min(ax + aw - 2, ax + parts[j].length * termCharW + 2);
        }
        y += lineH;
      }
    }

    // cursor
    const cur = transcript[transcript.length - 1];
    if (cur && cur.shown < cur.text.length){
      const blink = (Math.sin(t * 6.5) > 0) ? 1 : 0;
      if (blink){
        ctx.fillStyle = 'rgba(108,242,255,0.75)';
        ctx.fillRect(cursorX, cursorY + 2, Math.max(2, Math.floor(font * 0.12)), font + 2);
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

    if (glitch > 0.02){
      // brief CRT-ish flash + cyan tint split (kept subtle to preserve OSD legibility)
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.10 * glitch;
      ctx.fillStyle = 'rgba(255,255,255,1)';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.06 * glitch * phase.scanMul;
      ctx.fillStyle = 'rgba(108,242,255,1)';
      ctx.translate((Math.sin(t * 12.0) * 6) * glitch, 0);
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
