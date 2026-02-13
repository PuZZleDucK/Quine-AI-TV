// REVIEWED: 2026-02-13
import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

// Speculative museum placards for present-day objects.
// Playful fiction: not a serious forecast.
const ARTIFACTS = [
  {
    id: 'glass-slab',
    title: 'Glass Slab Oracle',
    era: 'Late Network Age',
    material: 'Aluminosilicate glass / rare-earth traces',
    kind: 'phone',
    plaque: [
      'Often found near sleeping areas, suggesting nocturnal consultation rituals.',
      'Surface bears “finger constellations” — evidence of repeated divination attempts.',
      'Many are discovered with depleted power cells: the oracle demanded offerings.',
    ],
  },
  {
    id: 'white-cord',
    title: 'Serpent of Many Ends',
    era: 'Transition to Universal Port',
    material: 'Copper / polymer sheath',
    kind: 'cable',
    plaque: [
      'This creature connects incompatible devices through gentle persuasion.',
      'Tribes hoarded adapters like charms; none of them ever fit.',
      'Twisted into knots — possibly a defensive posture when threatened.',
    ],
  },
  {
    id: 'steel-key',
    title: 'Tiny Teeth of Authority',
    era: 'Door-and-Handle Period',
    material: 'Steel / nickel plating',
    kind: 'keys',
    plaque: [
      'Carried in jingling clusters to broadcast status and access rights.',
      'Worn smooth by anxious thumb-rubbing during decision ceremonies.',
      'Frequently misplaced — a recurring theme in surviving literature.',
    ],
  },
  {
    id: 'mug',
    title: 'Hot Beverage Shrine',
    era: 'Caffeinated Productivity Epoch',
    material: 'Ceramic / printed pigment',
    kind: 'mug',
    plaque: [
      'Filled with bitter offerings to summon focus spirits ("Monday").',
      'Inscribed with motivational spells to ward off fatigue.',
      'Often chipped: evidence of workplace skirmishes and desk-edge impacts.',
    ],
  },
  {
    id: 'remote',
    title: 'Channel Wand (Domestic)',
    era: 'Streaming Wars',
    material: 'Plastic / rubber domes',
    kind: 'remote',
    plaque: [
      'A handheld device used to negotiate entertainment treaties with televisions.',
      'Buttons show uneven wear: the "Volume" sect was dominant.',
      'Batteries removed and replaced in cycles — a seasonal rite.',
    ],
  },
  {
    id: 'mask',
    title: 'Breath Filter of Solidarity',
    era: 'Great Indoor Air Reforms',
    material: 'Nonwoven fabric',
    kind: 'mask',
    plaque: [
      'Worn in public as both protection and social signal.',
      'Elastic loops indicate rapid deployment, suggesting frequent alerts.',
      'Recovered in vast quantities near pockets and car consoles.',
    ],
  },
  {
    id: 'spork',
    title: 'Fork-Spoon Diplomatic Hybrid',
    era: 'Single-Use Imperium',
    material: 'Biopolymer / questionable optimism',
    kind: 'spork',
    plaque: [
      'A compromise tool, invented to avoid carrying two distinct implements.',
      'Ineffective at both stabbing and scooping — a masterclass in negotiation failure.',
      'Frequently paired with packets of “mystery sauce”.',
    ],
  },
  {
    id: 'earbuds',
    title: 'Paired Whisper Stones',
    era: 'Private Audio Revolution',
    material: 'Polymer / microelectronics',
    kind: 'earbuds',
    plaque: [
      'Inserted to silence the world and summon curated noise.',
      'Often lost individually, implying they escaped captivity.',
      'Charging cases act as tiny sarcophagi for the pair.',
    ],
  },
  {
    id: 'smartwatch',
    title: 'Wrist Chronicon',
    era: 'Wearable Quantification Age',
    material: 'Glass / silicone / lithium cell',
    kind: 'watch',
    plaque: [
      'Kept time, health metrics, and social obligations in one polite rectangle.',
      'The wrist placement suggests constant monitoring was considered reassuring.',
      'Many units show micro-scratches: evidence of countless doorframe negotiations.',
    ],
  },
  {
    id: 'dongle',
    title: 'Port Translation Idol',
    era: 'Adapter Renaissance',
    material: 'Aluminium / tiny chips / quiet despair',
    kind: 'cable',
    plaque: [
      'A sacred intermediary enabling ancient devices to speak in newer tongues.',
      'Collectors carried pouches of these idols, just in case “the projector” appeared.',
      'Often misplaced at the moment of greatest need — a recurring tragedy motif.',
    ],
  },
  {
    id: 'keyfob',
    title: 'Charmed Proximity Totem',
    era: 'Automotive Convenience Period',
    material: 'Plastic / radio coil / button membrane',
    kind: 'keys',
    plaque: [
      'Pressed to summon vehicles from slumber and to silence their warning cries.',
      'Worn shiny at the edges where anxious fingers performed reassurance loops.',
      'Sometimes wrapped in leather: a domestication attempt that rarely succeeded.',
    ],
  },
  {
    id: 'travel-mug',
    title: 'Thermal Cylinder of Perseverance',
    era: 'Commute Era',
    material: 'Steel / vacuum gap / gasket',
    kind: 'mug',
    plaque: [
      'Designed to keep offerings warm during long migrations between buildings.',
      'Seals fail catastrophically, suggesting the gods demanded tribute on trousers.',
      'Lids are often missing — perhaps removed to encourage mindfulness.',
    ],
  },
  {
    id: 'gamepad',
    title: 'Dual-Stick Diviner',
    era: 'Console Dynasties',
    material: 'ABS plastic / carbon domes',
    kind: 'remote',
    plaque: [
      'Used to steer imaginary avatars through moral dilemmas and timed jumping trials.',
      'Thumb-worn pits indicate favored spells ("jump") and forbidden spells ("pause").',
      'Sometimes connected by cable, implying the diviner needed a leash.',
    ],
  },
  {
    id: 'respirator',
    title: 'Particulate Veil (High Filtration)',
    era: 'Mask Upgrade Cycle',
    material: 'Melt-blown fiber / elastic loops',
    kind: 'mask',
    plaque: [
      'A more serious cousin of the cloth veil, built for harsher indoor climates.',
      'The rigid shape suggests prestige, or at least better cheekbone support.',
      'Frequently stored in glove boxes: a sign that air was an intermittent problem.',
    ],
  },
  {
    id: 'takeout-cutlery',
    title: 'Emergency Utensil of the Road',
    era: 'Delivery Feast Epoch',
    material: 'Biopolymer / optimistic branding',
    kind: 'spork',
    plaque: [
      'Included with meals as a contingency plan against lost forks and fragile resolve.',
      'Often arrives in duplicate, suggesting redundancy was an honored virtue.',
      'Lightweight enough to become airborne in mild breezes, returning to the wild.',
    ],
  },
  {
    id: 'earbud-case',
    title: 'Pocket Sarcophagus (Rechargeable)',
    era: 'Wireless Pairing Era',
    material: 'Polymer / magnets / tiny battery',
    kind: 'earbuds',
    plaque: [
      'A cradle that both charges and imprisons the whisper stones between rituals.',
      'Many cases are empty: the stones escaped, leaving only the coffin behind.',
      'The hinge wear pattern implies frequent checking to confirm the stones existed.',
    ],
  },
];

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0;
  let t = 0;

  let font = 16;
  let small = 12;

  let current = null;
  let next = null;
  let prev = null;

  let cardT = 0;
  let cardDur = 16;
  let trans = 1; // 0..1

  let motes = [];
  let ambience = null;

  // Rare deterministic special moment (~45–120s): DOCENT NOTE + exhibit light flicker.
  // Keep an explicit start/duration so we can ramp the signature in/out cleanly.
  const DOCENT_NOTES = [
    'Please do not feed the {TITLE}. It becomes nostalgic.',
    'If the lights flicker, that is normal. This wing is still being remembered.',
    'The {TITLE} is on loan from the Department of Mild Regrets.',
    'Do not tap the glass. The glass will tap back.',
    'Conservation note: fingerprints are considered a form of annotation.',
    'Audio guide update: the {TITLE} is not actually haunted. It is merely thinking.',
  ];
  let docent = { active: false, start: 0, dur: 0, until: 0, note: '', pulses: null, flicker: 0, alpha: 0 };
  let nextDocentAt = 0;

  // Cache static gradients so the background hot path allocates 0 gradients/frame.
  // Gradients are tied to a specific 2D context, so we rebuild when ctx changes.
  let bgCache = {
    ctx: null,
    w: 0,
    h: 0,
    bg: null,
    floor: null,
    floorY: 0,
    vignette: null,
  };

  function rebuildBgCache(ctx){
    const floorY = h * 0.72;

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#05070c');
    bg.addColorStop(0.55, '#070b12');
    bg.addColorStop(1, '#020305');

    const floor = ctx.createLinearGradient(0, floorY, 0, h);
    floor.addColorStop(0, 'rgba(130,160,190,0.06)');
    floor.addColorStop(1, 'rgba(0,0,0,0.70)');

    const vignette = ctx.createRadialGradient(
      w * 0.52, h * 0.34, 0,
      w * 0.52, h * 0.34, Math.max(w, h) * 0.76
    );
    vignette.addColorStop(0, 'rgba(255,255,255,0.05)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.86)');

    bgCache = { ctx, w, h, bg, floor, floorY, vignette };
  }

  function ensureBgCache(ctx){
    if (!bgCache.bg || bgCache.ctx !== ctx || bgCache.w !== w || bgCache.h !== h){
      rebuildBgCache(ctx);
    }
  }

  // Seeded shuffle-bag so we see every artifact once per cycle.
  // With 16+ artifacts and ~14–24s cards, this yields ~5+ minutes before repeats.
  let bag = [];
  let bagI = 0;

  function shuffleInPlace(a){
    for (let i = a.length - 1; i > 0; i--){
      const j = (rand() * (i + 1)) | 0;
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
  }

  function refillBag(prev){
    bag = Array.from({ length: ARTIFACTS.length }, (_, i) => i);
    shuffleInPlace(bag);

    // Avoid back-to-back repeats across bag boundaries.
    if (prev && ARTIFACTS.length > 1 && ARTIFACTS[bag[0]]?.id === prev.id){
      const t = bag[0]; bag[0] = bag[1]; bag[1] = t;
    }

    bagI = 0;
  }

  function chooseArtifact(prev){
    if (!bag.length || bagI >= bag.length) refillBag(prev);
    let a = ARTIFACTS[bag[bagI++]];

    // Defensive: if we somehow matched prev, correct (still deterministic).
    if (prev && a?.id === prev.id && ARTIFACTS.length > 1){
      if (bagI >= bag.length) refillBag(prev);
      a = ARTIFACTS[bag[bagI++]];
    }

    return a;
  }

  function resetScene(width, height){
    w = width; h = height;
    t = 0;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));

    // deterministic dust motes
    motes = [];
    const n = clamp(Math.floor((w * h) / 14_000), 18, 120);
    for (let i = 0; i < n; i++){
      motes.push({
        x: rand() * w,
        y: rand() * h,
        r: 0.6 + rand() * 1.8,
        a: 0.02 + rand() * 0.07,
        s: 4 + rand() * 18,
        ph: rand() * Math.PI * 2,
      });
    }

    current = chooseArtifact(null);
    next = chooseArtifact(current);
    prev = null;
    cardT = 0;
    cardDur = 14 + rand() * 10;
    trans = 1;

    // Reset deterministic special-moment schedule on regen/resize.
    docent.active = false;
    docent.note = '';
    docent.pulses = null;
    docent.flicker = 0;
    docent.alpha = 0;
    scheduleNextDocent(0);
  }

  function scheduleNextDocent(fromT = t){
    nextDocentAt = fromT + 45 + rand() * 75;
  }

  function startDocent(at = t){
    const dur = 3.8 + rand() * 2.6;
    const nP = 4 + ((rand() * 3) | 0); // 4–6 pulses
    const pulses = [];
    for (let i = 0; i < nP; i++){
      pulses.push({
        t: rand() * dur,
        w: 0.05 + rand() * 0.12,
        a: 0.10 + rand() * 0.22,
      });
    }
    pulses.sort((a, b) => a.t - b.t);

    const tpl = DOCENT_NOTES[(rand() * DOCENT_NOTES.length) | 0];
    const title = current?.title ?? 'artifact';
    const note = tpl.replaceAll('{TITLE}', title);

    docent.active = true;
    docent.start = at;
    docent.dur = dur;
    docent.until = at + dur;
    docent.note = note;
    docent.pulses = pulses;
    docent.flicker = 0;
    docent.alpha = 0;

    if (audio.enabled){
      const base = 520 + rand() * 160;
      audio.beep({ freq: base, dur: 0.035, gain: 0.010, type: 'triangle' });
      audio.beep({ freq: base * 1.45, dur: 0.028, gain: 0.008, type: 'sine' });
    }
  }

  function init({ width, height }){
    resetScene(width, height);
  }

  function onResize(width, height){
    resetScene(width, height);
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    const n = audio.noiseSource({ type: 'pink', gain: 0.004 });
    n.start();
    const d = simpleDrone(audio, { root: 55, detune: 0.9, gain: 0.03 });
    ambience = {
      stop(){
        try { n.stop(); } catch {}
        try { d.stop(); } catch {}
      }
    };
    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    try { ambience?.stop?.(); } catch {}
    ambience = null;
  }

  function destroy(){
    onAudioOff();
  }

  function update(dt){
    t += dt;
    cardT += dt;

    trans = clamp(trans + dt * 1.2, 0, 1);
    if (trans >= 1) prev = null;

    if (cardT >= cardDur){
      prev = current;
      current = next;
      next = chooseArtifact(current);
      cardT = 0;
      cardDur = 14 + rand() * 10;
      trans = 0;

      if (audio.enabled){
        // little "gallery click"
        const base = 360 + rand() * 90;
        audio.beep({ freq: base, dur: 0.03, gain: 0.018, type: 'square' });
        audio.beep({ freq: base * 1.7, dur: 0.02, gain: 0.010, type: 'triangle' });
      }
    }

    // Rare deterministic special moment (~45–120s): docent note + exhibit light flicker.
    if (!docent.active){
      if (t >= nextDocentAt){
        startDocent(nextDocentAt);
      }
    } else {
      const lt = t - docent.start;
      const inT = 0.40;
      const outT = 0.70;
      const aIn = clamp(lt / inT, 0, 1);
      const aOut = clamp((docent.until - t) / outT, 0, 1);
      const sIn = aIn * aIn * (3 - 2 * aIn);
      const sOut = aOut * aOut * (3 - 2 * aOut);
      docent.alpha = sIn * sOut;

      let f = 0;
      for (const p of docent.pulses || []){
        const d = Math.abs(lt - p.t);
        const x = clamp(1 - d / p.w, 0, 1);
        f = Math.max(f, x * x * p.a);
      }
      docent.flicker = f * docent.alpha;

      if (t >= docent.until){
        const endAt = docent.until;
        docent.active = false;
        docent.note = '';
        docent.pulses = null;
        docent.flicker = 0;
        docent.alpha = 0;
        scheduleNextDocent(endAt);
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

  function wrapText(ctx, text, x, y, maxW, lineH){
    const words = String(text).split(/\s+/g);
    let line = '';
    let yy = y;
    for (let i = 0; i < words.length; i++){
      const test = line ? (line + ' ' + words[i]) : words[i];
      if (ctx.measureText(test).width > maxW && line){
        ctx.fillText(line, x, yy);
        line = words[i];
        yy += lineH;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, yy);
    return yy;
  }

  function drawArtifact(ctx, kind, x, y, s){
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = Math.max(2, Math.floor(s * 0.045));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const stroke = 'rgba(240,245,255,0.90)';
    ctx.strokeStyle = stroke;

    if (kind === 'phone'){
      roundRect(ctx, -s * 0.26, -s * 0.44, s * 0.52, s * 0.88, s * 0.10);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -s * 0.36, s * 0.03, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s * 0.20, -s * 0.26);
      ctx.lineTo(s * 0.20, -s * 0.26);
      ctx.stroke();
    } else if (kind === 'watch'){
      // screen
      roundRect(ctx, -s * 0.22, -s * 0.22, s * 0.44, s * 0.44, s * 0.12);
      ctx.stroke();
      // straps
      roundRect(ctx, -s * 0.10, -s * 0.44, s * 0.20, s * 0.18, s * 0.08);
      ctx.stroke();
      roundRect(ctx, -s * 0.10, s * 0.26, s * 0.20, s * 0.18, s * 0.08);
      ctx.stroke();
      // crown
      ctx.beginPath();
      ctx.moveTo(s * 0.22, -s * 0.02);
      ctx.lineTo(s * 0.32, -s * 0.02);
      ctx.stroke();
    } else if (kind === 'cable'){
      ctx.beginPath();
      ctx.moveTo(-s * 0.42, -s * 0.04);
      ctx.bezierCurveTo(-s * 0.20, -s * 0.30, s * 0.12, s * 0.30, s * 0.40, 0);
      ctx.stroke();
      // ends
      roundRect(ctx, -s * 0.50, -s * 0.10, s * 0.14, s * 0.20, s * 0.05);
      ctx.stroke();
      roundRect(ctx, s * 0.36, -s * 0.10, s * 0.14, s * 0.20, s * 0.05);
      ctx.stroke();
    } else if (kind === 'keys'){
      for (let i = 0; i < 3; i++){
        const ox = (-0.16 + i * 0.16) * s;
        ctx.beginPath();
        ctx.arc(ox, -s * 0.10, s * 0.12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ox, 0);
        ctx.lineTo(ox, s * 0.34);
        ctx.lineTo(ox + s * 0.10, s * 0.34);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, -s * 0.30, s * 0.16, 0, Math.PI * 2);
      ctx.stroke();
    } else if (kind === 'mug'){
      roundRect(ctx, -s * 0.24, -s * 0.30, s * 0.48, s * 0.58, s * 0.06);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s * 0.28, -s * 0.10, s * 0.16, -0.8, 0.8);
      ctx.stroke();
      // steam
      ctx.globalAlpha = 0.7;
      for (let i = -1; i <= 1; i++){
        ctx.beginPath();
        ctx.moveTo(i * s * 0.10, -s * 0.34);
        ctx.bezierCurveTo(i * s * 0.18, -s * 0.44, i * s * 0.02, -s * 0.54, i * s * 0.10, -s * 0.64);
        ctx.stroke();
      }
    } else if (kind === 'remote'){
      roundRect(ctx, -s * 0.18, -s * 0.44, s * 0.36, s * 0.88, s * 0.12);
      ctx.stroke();
      for (let r = 0; r < 5; r++){
        for (let c = 0; c < 3; c++){
          ctx.beginPath();
          ctx.arc((-0.08 + c * 0.08) * s, (-0.20 + r * 0.12) * s, s * 0.025, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.beginPath();
      ctx.arc(0, -s * 0.34, s * 0.04, 0, Math.PI * 2);
      ctx.stroke();
    } else if (kind === 'mask'){
      // face curve
      ctx.beginPath();
      ctx.moveTo(-s * 0.34, 0);
      ctx.quadraticCurveTo(0, s * 0.18, s * 0.34, 0);
      ctx.quadraticCurveTo(0, -s * 0.22, -s * 0.34, 0);
      ctx.closePath();
      ctx.stroke();
      // pleats
      ctx.globalAlpha = 0.7;
      for (let i = -1; i <= 1; i++){
        ctx.beginPath();
        ctx.moveTo(-s * 0.24, i * s * 0.08);
        ctx.lineTo(s * 0.24, i * s * 0.08);
        ctx.stroke();
      }
      // loops
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(-s * 0.38, 0, s * 0.10, -0.5, 0.5);
      ctx.arc(s * 0.38, 0, s * 0.10, Math.PI - 0.5, Math.PI + 0.5);
      ctx.stroke();
    } else if (kind === 'spork'){
      // handle
      ctx.beginPath();
      ctx.moveTo(0, s * 0.44);
      ctx.lineTo(0, -s * 0.10);
      ctx.stroke();
      // spoon bowl
      ctx.beginPath();
      ctx.ellipse(0, -s * 0.22, s * 0.18, s * 0.22, 0, 0, Math.PI * 2);
      ctx.stroke();
      // tines
      for (let i = -1; i <= 1; i++){
        ctx.beginPath();
        ctx.moveTo(i * s * 0.06, -s * 0.44);
        ctx.lineTo(i * s * 0.06, -s * 0.30);
        ctx.stroke();
      }
    } else if (kind === 'earbuds'){
      // buds
      for (let i = -1; i <= 1; i += 2){
        ctx.beginPath();
        ctx.arc(i * s * 0.14, -s * 0.06, s * 0.10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(i * s * 0.14, s * 0.04);
        ctx.lineTo(i * s * 0.14, s * 0.34);
        ctx.stroke();
      }
      // case
      roundRect(ctx, -s * 0.22, s * 0.24, s * 0.44, s * 0.18, s * 0.08);
      ctx.stroke();
    } else {
      // fallback: monolith
      roundRect(ctx, -s * 0.14, -s * 0.44, s * 0.28, s * 0.88, s * 0.10);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawBackground(ctx){
    ensureBgCache(ctx);

    // gallery room
    ctx.fillStyle = bgCache.bg;
    ctx.fillRect(0, 0, w, h);

    // floor sheen
    ctx.save();
    ctx.fillStyle = bgCache.floor;
    ctx.fillRect(0, bgCache.floorY, w, h - bgCache.floorY);
    ctx.restore();

    // columns
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (let i = 0; i < 4; i++){
      const x = w * (0.10 + i * 0.26);
      roundRect(ctx, x, h * 0.10, w * 0.06, h * 0.70, 18);
      ctx.fill();
    }
    ctx.restore();

    // vignette
    ctx.fillStyle = bgCache.vignette;
    ctx.fillRect(0, 0, w, h);

    // floating dust
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,1)';
    for (const m of motes){
      let yy = (m.y + Math.sin(t * 0.4 + m.ph) * m.s) % h;
      let xx = (m.x + Math.cos(t * 0.3 + m.ph) * (m.s * 0.5)) % w;
      if (yy < 0) yy += h;
      if (xx < 0) xx += w;
      ctx.globalAlpha = m.a;
      ctx.beginPath();
      ctx.arc(xx, yy, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPedestal(ctx, cx, cy, s){
    ctx.save();

    // spotlight cone
    ctx.save();
    const cone = ctx.createRadialGradient(cx, h * 0.08, 0, cx, h * 0.08, h * 0.82);
    cone.addColorStop(0, 'rgba(210,230,255,0.18)');
    cone.addColorStop(0.35, 'rgba(210,230,255,0.06)');
    cone.addColorStop(1, 'rgba(210,230,255,0.00)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.95, cy);
    ctx.lineTo(cx + s * 0.95, cy);
    ctx.lineTo(cx + s * 0.30, h * 0.10);
    ctx.lineTo(cx - s * 0.30, h * 0.10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // pedestal body
    const pw = s * 0.95;
    const ph = s * 0.56;
    const x = cx - pw / 2;
    const y = cy + s * 0.22;

    const pg = ctx.createLinearGradient(x, y, x + pw, y + ph);
    pg.addColorStop(0, 'rgba(245,248,255,0.16)');
    pg.addColorStop(0.45, 'rgba(245,248,255,0.08)');
    pg.addColorStop(1, 'rgba(0,0,0,0.20)');

    ctx.fillStyle = pg;
    roundRect(ctx, x, y, pw, ph, 18);
    ctx.fill();

    // base shadow
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.beginPath();
    ctx.ellipse(cx, y + ph + s * 0.16, pw * 0.65, s * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawPlacard(ctx, artifact, { alpha = 1, dx = 0 } = {}){
    const pad = Math.floor(font * 1.15);
    const cw = Math.min(w * 0.84, 1020);
    const ch = Math.min(h * 0.30, 320);
    const x = (w - cw) / 2 + dx;

    // OSD-safe: keep the placard (and especially bullet text) clear of the DOM OSD pills.
    // The OSD sits bottom-right and can wrap to multiple lines for long channel names.
    const osdSafeBottom = Math.max(72, Math.floor(h * 0.16));
    const yMax = Math.max(0, h - osdSafeBottom - ch);
    const y = clamp(h * 0.67, 0, yMax);

    ctx.save();
    ctx.globalAlpha = alpha;

    // plate
    ctx.save();
    ctx.globalAlpha *= 0.85;
    ctx.fillStyle = 'rgba(240,245,255,0.10)';
    roundRect(ctx, x, y, cw, ch, 16);
    ctx.fill();

    ctx.strokeStyle = 'rgba(240,245,255,0.20)';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, cw, ch, 16);
    ctx.stroke();
    ctx.restore();

    // header
    ctx.fillStyle = 'rgba(240,245,255,0.86)';
    ctx.font = `700 ${Math.floor(font * 1.25)}px ui-sans-serif, system-ui, -apple-system, Segoe UI`;
    ctx.fillText(artifact.title, x + pad, y + pad * 1.15);

    ctx.fillStyle = 'rgba(240,245,255,0.62)';
    ctx.font = `${Math.floor(small * 1.02)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`ERA: ${artifact.era.toUpperCase()}`, x + pad, y + pad * 1.95);
    ctx.fillText(`MATERIAL: ${artifact.material.toUpperCase()}`, x + pad, y + pad * 2.55);

    // notes
    ctx.fillStyle = 'rgba(240,245,255,0.70)';
    ctx.font = `${Math.floor(font * 0.98)}px ui-sans-serif, system-ui`;
    const lineH = Math.floor(font * 1.40);
    let yy = y + pad * 3.40;
    const maxW = cw - pad * 2;
    for (const line of artifact.plaque){
      yy = wrapText(ctx, '• ' + line, x + pad, yy, maxW, lineH) + Math.floor(font * 0.40);
    }

    ctx.restore();
  }

  function wrapLines(ctx, text, maxW){
    const words = String(text).split(/\s+/g);
    const lines = [];
    let line = '';
    for (let i = 0; i < words.length; i++){
      const test = line ? (line + ' ' + words[i]) : words[i];
      if (ctx.measureText(test).width > maxW && line){
        lines.push(line);
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawDocentNote(ctx, { alpha = 1 } = {}){
    if (!alpha || !docent.note) return;

    const margin = Math.floor(w * 0.05);
    const ww = clamp(Math.floor(w * 0.34), 260, 620);
    const x = w - margin - ww;
    const y = Math.floor(h * 0.20);
    const pad = Math.floor(font * 0.85);

    const headerH = Math.floor(font * 1.55);
    const bodyFont = `${Math.floor(small * 1.06)}px ui-sans-serif, system-ui, -apple-system, Segoe UI`;
    const headerFont = `800 ${Math.floor(small * 1.00)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const lineH = Math.floor(small * 1.35);

    ctx.save();
    ctx.globalAlpha = alpha;

    ctx.font = bodyFont;
    const maxW = ww - pad * 2;
    let lines = wrapLines(ctx, docent.note, maxW);
    const maxLines = 4;
    if (lines.length > maxLines){
      lines = lines.slice(0, maxLines);
      const last = lines[lines.length - 1];
      lines[lines.length - 1] = last.replace(/\s*$/, '') + '…';
    }

    const hh = pad + headerH + pad * 0.35 + lines.length * lineH + pad;

    // panel
    ctx.save();
    ctx.globalAlpha *= 0.92;
    ctx.fillStyle = 'rgba(255,248,230,0.10)';
    roundRect(ctx, x, y, ww, hh, 14);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,240,170,0.26)';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, ww, hh, 14);
    ctx.stroke();

    // accent bar
    ctx.fillStyle = 'rgba(255,220,110,0.22)';
    roundRect(ctx, x + 10, y + 10, 6, hh - 20, 4);
    ctx.fill();
    ctx.restore();

    // header
    ctx.fillStyle = 'rgba(255,235,170,0.88)';
    ctx.font = headerFont;
    ctx.fillText('DOCENT NOTE', x + pad, y + pad + headerH * 0.70);

    // body
    ctx.fillStyle = 'rgba(245,248,255,0.74)';
    ctx.font = bodyFont;
    let yy = y + pad + headerH + pad * 0.20;
    for (const ln of lines){
      ctx.fillText(ln, x + pad, yy);
      yy += lineH;
    }

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx);

    // subtle camera drift
    const driftX = Math.sin(t * 0.12) * w * 0.008;
    const driftY = Math.cos(t * 0.10) * h * 0.006;

    const cx = w * 0.5 + driftX;
    const cy = h * 0.42 + driftY;

    // pedestal + artifact
    const s = Math.min(w, h) * 0.38;
    drawPedestal(ctx, cx, cy, s);

    // Artifact + placard transition: museum dissolve (strong crossfade, minimal slide)
    const tt = trans * trans * (3 - 2 * trans); // smoothstep
    const slide = 1 - tt;
    const dx = slide * (w * 0.02);

    let prevPlacard = null;
    let curPlacard = { artifact: current, opts: { alpha: prev ? tt : 1, dx: -dx * 0.15 } };

    if (prev && tt < 1){
      // previous card fades out
      ctx.save();
      ctx.globalAlpha = 1 - tt;
      drawArtifact(ctx, prev.kind, cx + dx, cy - s * 0.10, s * 0.50);
      ctx.restore();
      prevPlacard = { artifact: prev, opts: { alpha: 1 - tt, dx: dx * 0.35 } };
    }

    // current card fades in
    ctx.save();
    ctx.globalAlpha = prev ? tt : 1;
    drawArtifact(ctx, current.kind, cx - dx * 0.5, cy - s * 0.10, s * 0.50);
    ctx.restore();

    // Exhibit light flicker: affects scene (bg/pedestal/artifact), but NOT the placard.
    if (docent.flicker > 0){
      const f = docent.flicker;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = f * 0.18;
      ctx.fillStyle = 'rgb(255,248,232)';
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = f * 0.28;
      ctx.fillStyle = 'rgb(72,78,94)';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // placards (kept legible)
    if (prevPlacard) drawPlacard(ctx, prevPlacard.artifact, prevPlacard.opts);
    drawPlacard(ctx, curPlacard.artifact, curPlacard.opts);

    // channel label
    ctx.save();
    ctx.fillStyle = 'rgba(231,238,246,0.76)';
    ctx.font = `${Math.floor(h / 28)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('FUTURE ARCHAEOLOGY', w * 0.05, h * 0.12);
    ctx.fillStyle = 'rgba(231,238,246,0.52)';
    ctx.font = `${Math.floor(h / 36)}px ui-sans-serif, system-ui`;
    ctx.fillText('A museum tour of us, interpreted badly (affectionately).', w * 0.05, h * 0.16);
    ctx.restore();

    if (docent.active && docent.alpha > 0){
      drawDocentNote(ctx, { alpha: docent.alpha });
    }
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
