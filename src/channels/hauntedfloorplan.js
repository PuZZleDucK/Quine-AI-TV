import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';
// REVIEWED: 2026-02-11

export function createChannel({ seed, audio }) {
  const notePhrases = [
    'EMF METER JUST FLAGGED THE MICROWAVE',
    'THERMAL CAMERA FOUND A COLD PIZZA',
    'ORB CAUGHT ON TAPE WAS DUST AGAIN',
    'SPIRIT BOX SAID SUBSCRIBE AND RAN',
    'BASEMENT FEELS LIKE A BAD IDEA',
    'FLOORBOARD CREAKED ON NOISE CUE',
    'NIGHT VISION SHOWS 3% MORE PANIC',
    'INFRARED HOTSPOT IS PROBABLY THE CAT',
    'STATIC SPIKE MATCHES NERVOUS BREATHING',
    'K2 METER PEAKED NEAR THE EXTENSION CORD',
    'DOOR LATCH MOVED WITHOUT PERMISSION',
    'WE HEARD A WHISPER SAY CHECK THE ATTIC',
    'THERMAL ANOMALY SHAPED LIKE A TAX FORM',
    'TEAM SPLIT UP AGAIN VERY SMART',
    'NOPE ENERGY DETECTED IN THIS HALLWAY',
    'CAMERA A JUST RECORDED PURE REGRET',
    'CAMERA B JUST RECORDED MORE REGRET',
    'SPIRIT BOX RESPONSE: GET OUT MAYBE',
    'UNEXPLAINED DRAFT FROM CLOSED WINDOW',
    'MYSTERY FOOTSTEP COUNT NOW SUSPICIOUS',
    'TRIPOD SHOOK WHEN NOBODY TOUCHED IT',
    'SENSOR LOG CLASSIFIED THIS AS YIKES',
    'WE MARKED THIS ROOM DEFINITELY HAUNTED',
    'COULD BE A GHOST COULD BE PLUMBING',
    'WE ASKED A QUESTION AND GOT STATIC ATTITUDE',
    'HALLWAY JUST GOT TEN FEET LONGER FEELING',
    'SUDDEN CHILL RIGHT ON CUE HOW DRAMATIC',
    'REMOTE MIC PICKED UP A TINY LAUGH',
    'THE DARKNESS IS DOING A LOT TODAY',
    'A SHADOW MOVED OR WE BLINKED WEIRD',
    'UNNATURAL SILENCE NOW RATED CONCERNING',
    'HISSING AUDIO NOT FROM OUR GEAR',
    'WALL KNOCK PATTERN SPOKE IN MORSE MAYBE',
    'CROSSCHECK RESULT: STILL SPOOKED',
    'BASELINE READING CHANGED WHEN WE SAID HELLO',
    'SOMETHING JUST TOUCHED THE BOOM MIC',
    'FOYER VIBES CURRENTLY EXTREMELY CURSED',
    'MOTION SENSOR TRIGGERED BY EXISTENTIAL DREAD',
    'DOORWAY JUST DID A LITTLE JUMP SCARE',
    'OUR MAP NOW LABELS THIS AS ABSOLUTELY NOT',
    'THERMAL GHOST OR OVERWORKED RADIATOR',
    'HOUSE MADE A NOISE LIKE A QUESTION',
    'WE HEARD CHAINS IT WAS THE FAN CHAIN',
    'WHISPER AUDIO ENHANCE MADE IT WORSE',
    'PARANORMAL LEVELS HOLDING STEADY AT UH OH',
    'THIS CORNER HAS MAIN CHARACTER ENERGY',
    'ANOMALY TRACKING: STILL RUDE',
    'LIGHT FLICKER TIMING LOOKS INTENTIONAL',
    'SOMETHING IN THE WALLS SAID NOT TODAY',
    'UNSEEN PRESENCE NOW FOLLOWING PRODUCTION NOTES',
    'HEART RATE SPIKE MATCHED THAT CREAK',
    'ATTIC REQUESTED WE LEAVE POLITELY',
    'PARLOUR JUST FAILED VIBE CHECK',
    'WE RECORDED A GROWL IT WAS MY STOMACH',
    'OBJECT MOVED TWO INCHES FOR DRAMA',
    'AUDIT TRAIL SAYS GHOST IS UNIONIZED',
    'THIS HOUSE HAS TOO MANY OPINIONS',
    'WALKIE STATIC SOUNDS LIKE WHISPERING AGAIN',
    'THE FLOORPLAN JUST FELT OFF TO EVERYONE',
    'CONFIRMED ACTIVITY: SOMETHING SPOOKY ADJACENT',
  ];

  const rand = mulberry32(seed);
  const PLAN_COUNT = 4; // current house plan + three more
  const PLAN_ROTATE_SEC = 300;

  let w = 0;
  let h = 0;
  let t = 0;

  let bgC = null;
  let planC = null;

  let rooms = [];
  let roomOrder = [];
  let corridors = [];
  let walls = [];
  let house = null;
  let portals = new Map();
  let planBank = [];
  let activePlanIdx = 0;

  let tourClock = 0;
  const dwellDur = 2.8;
  const moveDur = 4.0;
  const stepDur = dwellDur + moveDur;
  let curRoomStep = -1;

  let noteText = '';
  let noteAge = 0;
  let noteAnchor = { x: 0.5, y: 0.5 };
  let noteRoom = 0;

  let flicker = 0;
  let nextFlickerAt = 0;

  let slam = 0;
  let nextSlamAt = 0;
  let slamRoom = -1;
  let nextRareAt = 0;
  let rareRoom = -1;
  let rareKind = '';
  let rarePulse = 0;
  let pendingEventNote = '';

  let drone = null;
  let noise = null;
  let audioHandle = null;

  function pick(arr) {
    return arr[(rand() * arr.length) | 0];
  }

  function lerp(a, b, u) {
    return a + (b - a) * u;
  }

  function ease(u) {
    return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  }

  function center(idx) {
    const r = rooms[idx];
    return { x: r.x + r.w * 0.5, y: r.y + r.h * 0.5 };
  }

  function pairKey(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  function getPortal(a, b) {
    return portals.get(pairKey(a, b)) || null;
  }

  function pickOtherRoom(currentRoom) {
    if (rooms.length <= 1) return -1;
    let idx = currentRoom;
    let guard = 0;
    while (idx === currentRoom && guard < 20) {
      idx = (rand() * rooms.length) | 0;
      guard += 1;
    }
    return idx === currentRoom ? -1 : idx;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (rand() * (i + 1)) | 0;
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function splitLeaf(leaves, idx, orientation, minW, minH) {
    const leaf = leaves[idx];

    if (orientation === 'v') {
      const cut = leaf.x + leaf.w * (0.38 + rand() * 0.24);
      const a = { x: leaf.x, y: leaf.y, w: cut - leaf.x, h: leaf.h };
      const b = { x: cut, y: leaf.y, w: leaf.x + leaf.w - cut, h: leaf.h };
      if (a.w < minW || b.w < minW) return false;

      const doorPad = Math.min(0.06, leaf.h * 0.22);
      const doorPos = leaf.y + doorPad + rand() * Math.max(0.001, leaf.h - doorPad * 2);
      const doorSize = Math.min(0.11, Math.max(0.05, leaf.h * (0.17 + rand() * 0.08)));

      walls.push({
        x1: cut,
        y1: leaf.y,
        x2: cut,
        y2: leaf.y + leaf.h,
        vertical: true,
        doorPos,
        doorSize,
      });

      leaves.splice(idx, 1, a, b);
      return true;
    }

    const cut = leaf.y + leaf.h * (0.36 + rand() * 0.28);
    const a = { x: leaf.x, y: leaf.y, w: leaf.w, h: cut - leaf.y };
    const b = { x: leaf.x, y: cut, w: leaf.w, h: leaf.y + leaf.h - cut };
    if (a.h < minH || b.h < minH) return false;

    const doorPad = Math.min(0.06, leaf.w * 0.22);
    const doorPos = leaf.x + doorPad + rand() * Math.max(0.001, leaf.w - doorPad * 2);
    const doorSize = Math.min(0.12, Math.max(0.05, leaf.w * (0.16 + rand() * 0.08)));

    walls.push({
      x1: leaf.x,
      y1: cut,
      x2: leaf.x + leaf.w,
      y2: cut,
      vertical: false,
      doorPos,
      doorSize,
    });

    leaves.splice(idx, 1, a, b);
    return true;
  }

  function buildPlan() {
    house = {
      x: 0.08 + rand() * 0.02,
      y: 0.09 + rand() * 0.02,
      w: 0.82 - rand() * 0.04,
      h: 0.78 - rand() * 0.04,
    };

    const targetRooms = 8 + ((rand() * 3) | 0);
    const minW = 0.14;
    const minH = 0.11;

    const leaves = [house];
    walls = [];

    let guard = 0;
    while (leaves.length < targetRooms && guard < 160) {
      guard += 1;

      let pickIdx = -1;
      let bestArea = 0;
      for (let i = 0; i < leaves.length; i++) {
        const leaf = leaves[i];
        const canV = leaf.w >= minW * 2.1;
        const canH = leaf.h >= minH * 2.1;
        if (!canV && !canH) continue;

        const area = leaf.w * leaf.h;
        if (area > bestArea) {
          bestArea = area;
          pickIdx = i;
        }
      }

      if (pickIdx < 0) break;
      const leaf = leaves[pickIdx];

      const canV = leaf.w >= minW * 2.1;
      const canH = leaf.h >= minH * 2.1;

      let orientation = 'v';
      if (canV && canH) {
        if (leaf.w > leaf.h * 1.15) orientation = 'v';
        else if (leaf.h > leaf.w * 1.15) orientation = 'h';
        else orientation = rand() < 0.5 ? 'v' : 'h';
      } else if (canH) {
        orientation = 'h';
      }

      if (!splitLeaf(leaves, pickIdx, orientation, minW, minH)) {
        if (!splitLeaf(leaves, pickIdx, orientation === 'v' ? 'h' : 'v', minW, minH)) break;
      }
    }

    const labels = shuffle([
      'FOYER',
      'HALL',
      'PARLOUR',
      'STUDY',
      'NURSERY',
      'KITCHEN',
      'PANTRY',
      'CELLAR',
      'ATTIC',
      'DINING',
      'STAIRS',
      'LAUNDRY',
      'LIBRARY',
      'BATH',
      'GUEST',
      'BEDROOM',
      'SUNROOM',
      'HEARTH',
    ]);

    rooms = leaves.map((leaf, i) => ({
      x: leaf.x,
      y: leaf.y,
      w: leaf.w,
      h: leaf.h,
      label: labels[i % labels.length],
    }));

    portals = new Map();
    const graph = Array.from({ length: rooms.length }, () => []);
    const edgeSeen = new Set();
    const eps = 1e-4;

    function addDoorEdge(a, b, door) {
      if (a < 0 || b < 0 || a === b) return;
      const key = pairKey(a, b);
      if (edgeSeen.has(key)) return;
      edgeSeen.add(key);
      portals.set(key, door);
      graph[a].push(b);
      graph[b].push(a);
    }

    for (const wall of walls) {
      if (wall.vertical) {
        let left = -1;
        let right = -1;
        for (let i = 0; i < rooms.length; i++) {
          const r = rooms[i];
          const doorInside = wall.doorPos > r.y + eps && wall.doorPos < r.y + r.h - eps;
          if (!doorInside) continue;
          if (Math.abs(r.x + r.w - wall.x1) < eps) left = i;
          if (Math.abs(r.x - wall.x1) < eps) right = i;
        }
        if (left >= 0 && right >= 0) addDoorEdge(left, right, { x: wall.x1, y: wall.doorPos });
      } else {
        let top = -1;
        let bottom = -1;
        for (let i = 0; i < rooms.length; i++) {
          const r = rooms[i];
          const doorInside = wall.doorPos > r.x + eps && wall.doorPos < r.x + r.w - eps;
          if (!doorInside) continue;
          if (Math.abs(r.y + r.h - wall.y1) < eps) top = i;
          if (Math.abs(r.y - wall.y1) < eps) bottom = i;
        }
        if (top >= 0 && bottom >= 0) addDoorEdge(top, bottom, { x: wall.doorPos, y: wall.y1 });
      }
    }

    roomOrder = [];
    if (!rooms.length) return;

    if (rooms.length === 1) {
      roomOrder = [0];
    } else {
      const seen = new Set();
      function walk(node, parent) {
        seen.add(node);
        roomOrder.push(node);
        const neighbors = [...graph[node]].sort((a, b) => a - b);
        for (const nxt of neighbors) {
          if (nxt === parent) continue;
          walk(nxt, node);
          roomOrder.push(node);
        }
      }
      walk(0, -1);

      if (seen.size !== rooms.length) {
        // Fallback if graph recovery failed for any room.
        roomOrder = rooms.map((_, i) => i);
      }
    }

    corridors = [];
    for (let i = 0; i < roomOrder.length; i++) {
      const a = center(roomOrder[i]);
      const b = center(roomOrder[(i + 1) % roomOrder.length]);
      const door = getPortal(roomOrder[i], roomOrder[(i + 1) % roomOrder.length]);
      if (door) corridors.push([a, door, b]);
      else corridors.push([a, b]);
    }
  }

  function clonePortalMap(src) {
    const out = new Map();
    for (const [k, v] of src.entries()) out.set(k, { x: v.x, y: v.y });
    return out;
  }

  function snapshotCurrentPlan() {
    const prevPlanCanvas = planC;
    renderPlan();
    const snap = {
      rooms: rooms.map((r) => ({ ...r })),
      roomOrder: [...roomOrder],
      corridors: corridors.map((poly) => poly.map((p) => ({ x: p.x, y: p.y }))),
      walls: walls.map((w0) => ({ ...w0 })),
      house: house ? { ...house } : null,
      portals: clonePortalMap(portals),
      canvas: planC,
    };
    planC = prevPlanCanvas;
    return snap;
  }

  function setActivePlan(idx, resetTour = false) {
    if (!planBank.length) return;
    const clamped = ((idx % planBank.length) + planBank.length) % planBank.length;
    const p = planBank[clamped];
    activePlanIdx = clamped;
    rooms = p.rooms;
    roomOrder = p.roomOrder;
    corridors = p.corridors;
    walls = p.walls;
    house = p.house;
    portals = p.portals;
    planC = p.canvas;

    slamRoom = -1;
    rareRoom = -1;
    rareKind = '';
    rarePulse = 0;

    if (resetTour) {
      tourClock = 0;
      curRoomStep = -1;
      pendingEventNote = `NOTE: SWITCHING TO FLOORPLAN ${clamped + 1}`;
      const c = rooms.length ? center(0) : { x: 0.5, y: 0.5 };
      noteAnchor = { x: c.x, y: c.y };
      noteRoom = 0;
      noteAge = 999;
    }
  }

  function renderBg() {
    bgC = document.createElement('canvas');
    bgC.width = w;
    bgC.height = h;
    const bctx = bgC.getContext('2d');

    const g = bctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#041225');
    g.addColorStop(1, '#020712');
    bctx.fillStyle = g;
    bctx.fillRect(0, 0, w, h);

    const grid = Math.max(28, Math.floor(Math.min(w, h) / 18));
    bctx.globalAlpha = 0.18;
    bctx.strokeStyle = '#0b3156';
    bctx.lineWidth = 1;

    for (let x = 0; x <= w; x += grid) {
      bctx.beginPath();
      bctx.moveTo(x, 0);
      bctx.lineTo(x, h);
      bctx.stroke();
    }
    for (let y = 0; y <= h; y += grid) {
      bctx.beginPath();
      bctx.moveTo(0, y);
      bctx.lineTo(w, y);
      bctx.stroke();
    }
    bctx.globalAlpha = 1;

    const vg = bctx.createRadialGradient(
      w * 0.5,
      h * 0.5,
      Math.min(w, h) * 0.22,
      w * 0.5,
      h * 0.5,
      Math.min(w, h) * 0.85,
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    bctx.fillStyle = vg;
    bctx.fillRect(0, 0, w, h);
  }

  function renderPlan() {
    planC = document.createElement('canvas');
    planC.width = w;
    planC.height = h;
    const pctx = planC.getContext('2d');

    const m = Math.floor(Math.min(w, h) * 0.08);
    const sx = (x) => m + x * (w - 2 * m);
    const sy = (y) => m + y * (h - 2 * m);

    pctx.save();
    pctx.lineJoin = 'round';
    pctx.lineCap = 'round';

    for (const rm of rooms) {
      const x = sx(rm.x);
      const y = sy(rm.y);
      const rw = rm.w * (w - 2 * m);
      const rh = rm.h * (h - 2 * m);
      pctx.fillStyle = 'rgba(10, 60, 90, 0.11)';
      pctx.fillRect(x, y, rw, rh);
    }

    pctx.strokeStyle = 'rgba(95, 190, 220, 0.2)';
    pctx.lineWidth = Math.max(1, Math.floor(Math.min(w, h) * 0.0025));
    pctx.setLineDash([6, 7]);
    for (const poly of corridors) {
      pctx.beginPath();
      pctx.moveTo(sx(poly[0].x), sy(poly[0].y));
      for (let i = 1; i < poly.length; i++) pctx.lineTo(sx(poly[i].x), sy(poly[i].y));
      pctx.stroke();
    }
    pctx.setLineDash([]);

    const wallW = Math.max(2, Math.floor(Math.min(w, h) * 0.0048));
    pctx.strokeStyle = 'rgba(165, 248, 255, 0.58)';
    pctx.lineWidth = wallW;

    if (house) {
      const x0 = sx(house.x);
      const y0 = sy(house.y);
      const x1 = sx(house.x + house.w);
      const y1 = sy(house.y + house.h);

      pctx.beginPath();
      pctx.rect(x0, y0, x1 - x0, y1 - y0);
      pctx.stroke();
    }

    pctx.strokeStyle = 'rgba(150, 245, 255, 0.5)';
    pctx.lineWidth = Math.max(2, wallW - 1);
    for (const wall of walls) {
      if (wall.vertical) {
        const x = sx(wall.x1);
        const y0 = sy(wall.y1);
        const y1 = sy(wall.y2);
        const d = sy(wall.doorPos);
        const halfGap = ((h - 2 * m) * wall.doorSize) * 0.5;

        pctx.beginPath();
        pctx.moveTo(x, y0);
        pctx.lineTo(x, d - halfGap);
        pctx.moveTo(x, d + halfGap);
        pctx.lineTo(x, y1);
        pctx.stroke();

        pctx.strokeStyle = 'rgba(210, 255, 255, 0.45)';
        pctx.lineWidth = Math.max(1, wallW - 2);
        pctx.beginPath();
        pctx.moveTo(x - wallW * 0.9, d);
        pctx.lineTo(x + wallW * 0.9, d);
        pctx.stroke();
      } else {
        const y = sy(wall.y1);
        const x0 = sx(wall.x1);
        const x1 = sx(wall.x2);
        const d = sx(wall.doorPos);
        const halfGap = ((w - 2 * m) * wall.doorSize) * 0.5;

        pctx.strokeStyle = 'rgba(150, 245, 255, 0.5)';
        pctx.lineWidth = Math.max(2, wallW - 1);
        pctx.beginPath();
        pctx.moveTo(x0, y);
        pctx.lineTo(d - halfGap, y);
        pctx.moveTo(d + halfGap, y);
        pctx.lineTo(x1, y);
        pctx.stroke();

        pctx.strokeStyle = 'rgba(210, 255, 255, 0.45)';
        pctx.lineWidth = Math.max(1, wallW - 2);
        pctx.beginPath();
        pctx.moveTo(d, y - wallW * 0.9);
        pctx.lineTo(d, y + wallW * 0.9);
        pctx.stroke();
      }
      pctx.strokeStyle = 'rgba(150, 245, 255, 0.5)';
      pctx.lineWidth = Math.max(2, wallW - 1);
    }

    const fs = Math.max(10, Math.floor(Math.min(w, h) * 0.022));
    pctx.font = `${fs}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    pctx.fillStyle = 'rgba(160, 250, 255, 0.35)';
    for (const rm of rooms) {
      const x = sx(rm.x);
      const y = sy(rm.y);
      pctx.fillText(rm.label, x + wallW * 1.6, y + fs + wallW * 1.2);
    }

    pctx.strokeStyle = 'rgba(160, 250, 255, 0.25)';
    pctx.lineWidth = Math.max(1, Math.floor(Math.min(w, h) * 0.003));
    pctx.strokeRect(m * 0.6, m * 0.6, w - m * 1.2, h - m * 1.2);

    pctx.restore();
  }

  function sceneInit(width, height) {
    w = width;
    h = height;
    t = 0;

    tourClock = 0;
    curRoomStep = -1;
    noteText = '';
    noteAge = 0;
    noteAnchor = { x: 0.5, y: 0.5 };
    noteRoom = 0;

    flicker = 0;
    slam = 0;
    slamRoom = -1;
    rareRoom = -1;
    rareKind = '';
    rarePulse = 0;
    pendingEventNote = '';

    planBank = [];
    for (let i = 0; i < PLAN_COUNT; i++) {
      buildPlan();
      planBank.push(snapshotCurrentPlan());
    }
    activePlanIdx = 0;
    setActivePlan(0, true);

    renderBg();

    nextFlickerAt = 1 + rand() * 4;
    nextSlamAt = 18 + rand() * 18;
    nextRareAt = 12 + rand() * 16;
  }

  function onResize(width, height) {
    sceneInit(width, height);
  }

  function onAudioOn() {
    if (!audio.enabled) return;

    drone = simpleDrone(audio, { root: 55, detune: 1.0, gain: 0.05 });
    noise = audio.noiseSource({ type: 'pink', gain: 0.018 });
    noise.start();

    audioHandle = {
      stop() {
        try {
          drone?.stop?.();
        } catch {}
        try {
          noise?.stop?.();
        } catch {}
      },
    };

    audio.setCurrent(audioHandle);
  }

  function onAudioOff() {
    try {
      audioHandle?.stop?.();
    } catch {}
    audioHandle = null;
    drone = null;
    noise = null;
  }

  function destroy() {
    onAudioOff();
  }

  function slamEvent(currentRoom) {
    slam = 1;
    slamRoom = pickOtherRoom(currentRoom);
    pendingEventNote = 'NOTE: A DOOR SLAMMED NEARBY';

    if (audio.enabled) {
      audio.beep({ freq: 70, dur: 0.12, gain: 0.08, type: 'triangle' });
      audio.beep({ freq: 190, dur: 0.04, gain: 0.03, type: 'square' });
    }
  }

  function rareEvent(currentRoom) {
    const room = pickOtherRoom(currentRoom);
    if (room < 0) return;

    const events = [
      { kind: 'WHISPER', note: 'NOTE: THE SPIRIT BOX WHISPERED NEXT DOOR' },
      { kind: 'SCRATCH', note: 'NOTE: SCRATCHING CAME FROM THE OTHER SIDE' },
      { kind: 'RATTLE', note: 'NOTE: SOMETHING RATTLED A ROOM AWAY' },
      { kind: 'KNOCK', note: 'NOTE: THREE KNOCKS JUST AUDITIONED NEARBY' },
    ];
    const ev = pick(events);

    rareRoom = room;
    rareKind = ev.kind;
    rarePulse = 1;
    pendingEventNote = ev.note;

    if (!audio.enabled) return;
    if (ev.kind === 'WHISPER') {
      audio.beep({ freq: 420, dur: 0.08, gain: 0.028, type: 'triangle' });
      audio.beep({ freq: 365, dur: 0.11, gain: 0.024, type: 'sine' });
    } else if (ev.kind === 'SCRATCH') {
      audio.beep({ freq: 1250, dur: 0.03, gain: 0.03, type: 'sawtooth' });
      audio.beep({ freq: 980, dur: 0.04, gain: 0.028, type: 'square' });
      audio.beep({ freq: 760, dur: 0.03, gain: 0.025, type: 'sawtooth' });
    } else if (ev.kind === 'RATTLE') {
      audio.beep({ freq: 310, dur: 0.03, gain: 0.026, type: 'square' });
      audio.beep({ freq: 292, dur: 0.03, gain: 0.024, type: 'square' });
      audio.beep({ freq: 278, dur: 0.03, gain: 0.022, type: 'triangle' });
    } else {
      audio.beep({ freq: 180, dur: 0.05, gain: 0.032, type: 'square' });
      audio.beep({ freq: 180, dur: 0.05, gain: 0.03, type: 'square' });
      audio.beep({ freq: 150, dur: 0.06, gain: 0.026, type: 'triangle' });
    }
  }

  function update(dt) {
    t += dt;
    if (planBank.length > 1) {
      const idx = Math.floor(t / PLAN_ROTATE_SEC) % planBank.length;
      if (idx !== activePlanIdx) setActivePlan(idx, true);
    }
    tourClock += dt;
    const cur = getCursor();

    noteAge += dt;

    flicker = Math.max(0, flicker - dt * 6);
    slam = Math.max(0, slam - dt * 1.3);
    rarePulse = Math.max(0, rarePulse - dt * 0.55);
    if (rarePulse <= 0.001) {
      rareRoom = -1;
      rareKind = '';
    }

    if (t >= nextFlickerAt) {
      flicker = 1;
      nextFlickerAt = t + 2.5 + rand() * 6;
    }

    if (t >= nextSlamAt) {
      slamEvent(cur.room);
      nextSlamAt = t + 24 + rand() * 22;
    }

    if (t >= nextRareAt) {
      rareEvent(cur.room);
      nextRareAt = t + 42 + rand() * 78;
    }

    const stepIdx = Math.floor(tourClock / stepDur);
    if (stepIdx !== curRoomStep) {
      curRoomStep = stepIdx;
      noteText = pendingEventNote || `NOTE: ${pick(notePhrases)}`;
      pendingEventNote = '';
      noteAge = 0;
      noteRoom = roomOrder[stepIdx % roomOrder.length];
      noteAnchor = { x: cur.x + (rand() - 0.5) * 0.02, y: cur.y + (rand() - 0.5) * 0.02 };
      flicker = Math.max(flicker, 0.5);
    }
  }

  function getCursor() {
    if (!rooms.length) return { x: 0.5, y: 0.5, room: 0, moving: false };

    const stepIdx = Math.floor(tourClock / stepDur);
    const aIdx = roomOrder[stepIdx % roomOrder.length];
    const bIdx = roomOrder[(stepIdx + 1) % roomOrder.length];

    const within = tourClock - stepIdx * stepDur;
    if (within < dwellDur) {
      const c = center(aIdx);
      return { x: c.x, y: c.y, room: aIdx, moving: false };
    }

    const u = clamp((within - dwellDur) / moveDur, 0, 1);
    const e = ease(u);
    const a = center(aIdx);
    const b = center(bIdx);
    const door = getPortal(aIdx, bIdx);
    const path = door ? [a, door, b] : [a, b];

    if (path.length === 2) {
      return {
        x: lerp(path[0].x, path[1].x, e),
        y: lerp(path[0].y, path[1].y, e),
        room: e < 0.5 ? aIdx : bIdx,
        moving: true,
      };
    }

    const l1 = Math.hypot(path[1].x - path[0].x, path[1].y - path[0].y);
    const l2 = Math.hypot(path[2].x - path[1].x, path[2].y - path[1].y);
    const total = Math.max(1e-6, l1 + l2);
    const d = e * total;
    if (d <= l1) {
      const f = l1 ? d / l1 : 1;
      return { x: lerp(path[0].x, path[1].x, f), y: lerp(path[0].y, path[1].y, f), room: aIdx, moving: true };
    }
    const f = l2 ? (d - l1) / l2 : 1;
    return { x: lerp(path[1].x, path[2].x, f), y: lerp(path[1].y, path[2].y, f), room: bIdx, moving: true };
  }

  function draw(ctx) {
    if (!w || !h) return;

    const cur = getCursor();

    ctx.clearRect(0, 0, w, h);
    if (bgC) ctx.drawImage(bgC, 0, 0);

    const shake = slam > 0 ? (Math.sin(t * 80) * 2 + Math.sin(t * 57) * 2) * slam : 0;

    ctx.save();
    ctx.translate(shake, -shake * 0.6);

    const flickAmt = flicker > 0 ? 0.55 + 0.45 * Math.sin(t * 120) : 1;
    ctx.globalAlpha = 0.92 * flickAmt;
    ctx.globalCompositeOperation = 'screen';
    if (planC) ctx.drawImage(planC, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    const m = Math.floor(Math.min(w, h) * 0.08);
    const sx = (x) => m + x * (w - 2 * m);
    const sy = (y) => m + y * (h - 2 * m);

    const px = sx(cur.x);
    const py = sy(cur.y);

    const spotR = Math.min(w, h) * 0.22;
    const spot = ctx.createRadialGradient(px, py, 0, px, py, spotR);
    spot.addColorStop(0, `rgba(160, 250, 255, ${0.15 + (cur.moving ? 0.08 : 0.12)})`);
    spot.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, w, h);

    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(200,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(px, py, 3 + pulse * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const rm = rooms[cur.room];
    if (rm) {
      const rx = sx(rm.x);
      const ry = sy(rm.y);
      const rw = rm.w * (w - 2 * m);
      const rh = rm.h * (h - 2 * m);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.25 + pulse * 0.18})`;
      ctx.lineWidth = Math.max(2, Math.floor(Math.min(w, h) * 0.006));
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.restore();
    }

    if (noteText) {
      const hold = 2.0;
      const fade = 3.8;
      const a = noteAge <= hold ? 1 : clamp(1 - (noteAge - hold) / fade, 0, 1);
      const fs = Math.max(13, Math.floor(Math.min(w, h) * 0.024));
      ctx.font = `600 ${fs}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      const pad = Math.max(6, Math.floor(fs * 0.48));
      const tw = Math.ceil(ctx.measureText(noteText).width);
      const bw = tw + pad * 2;
      const bh = fs + pad * 1.7;
      const tx = sx(noteAnchor.x);
      const ty = sy(noteAnchor.y);
      const bx = clamp(tx + 16, m * 0.7, w - m * 0.7 - bw);
      const by = clamp(ty - bh - 14, m * 0.7, h - m * 0.7 - bh);

      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(2, 14, 25, 0.94)';
      ctx.strokeStyle = 'rgba(175, 248, 255, 0.82)';
      ctx.lineWidth = Math.max(1, Math.floor(fs * 0.11));
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, Math.max(6, Math.floor(fs * 0.3)));
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(clamp(tx + 6, bx + 10, bx + bw - 10), by + bh);
      ctx.lineTo(clamp(tx + 18, bx + 18, bx + bw - 2), by + bh);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(238, 254, 255, 1)';
      ctx.shadowColor = 'rgba(120, 240, 255, 0.5)';
      ctx.shadowBlur = 8;
      ctx.fillText(noteText, bx + pad, by + fs + pad * 0.45);
      ctx.restore();
    }

    if (rareRoom >= 0 && rareRoom < rooms.length && rarePulse > 0) {
      const rr = rooms[rareRoom];
      const rx = sx(rr.x);
      const ry = sy(rr.y);
      const rw = rr.w * (w - 2 * m);
      const rh = rr.h * (h - 2 * m);
      const amp = (0.35 + 0.65 * Math.sin(t * 18) ** 2) * rarePulse;
      const hue = rareKind === 'WHISPER' ? '120,255,210' : rareKind === 'SCRATCH' ? '255,180,150' : '210,190,255';
      ctx.save();
      ctx.strokeStyle = `rgba(${hue}, ${0.58 * amp})`;
      ctx.lineWidth = Math.max(2, Math.floor(Math.min(w, h) * 0.005));
      ctx.strokeRect(rx, ry, rw, rh);
      const rg = ctx.createRadialGradient(rx + rw * 0.5, ry + rh * 0.5, 0, rx + rw * 0.5, ry + rh * 0.5, Math.max(rw, rh));
      rg.addColorStop(0, `rgba(${hue}, ${0.22 * amp})`);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(rx - rw * 0.3, ry - rh * 0.3, rw * 1.6, rh * 1.6);
      ctx.restore();
    }

    if (slam > 0) {
      const s = clamp(slam, 0, 1);
      ctx.save();
      ctx.fillStyle = `rgba(0,0,0,${0.35 * s})`;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = `rgba(160,0,20,${0.25 * s})`;
      ctx.fillRect(0, 0, w, h);

      if (slamRoom >= 0 && slamRoom < rooms.length && slamRoom !== cur.room) {
        const target = rooms[slamRoom];
        const rx = sx(target.x);
        const ry = sy(target.y);
        const rw = target.w * (w - 2 * m);
        const rh = target.h * (h - 2 * m);
        const flash = 0.55 + 0.45 * Math.sin(t * 34);
        ctx.fillStyle = `rgba(255, 232, 235, ${0.2 * s * flash})`;
        ctx.fillRect(rx, ry, rw, rh);
        const glow = ctx.createRadialGradient(
          rx + rw * 0.5,
          ry + rh * 0.5,
          0,
          rx + rw * 0.5,
          ry + rh * 0.5,
          Math.max(rw, rh) * 0.9,
        );
        glow.addColorStop(0, `rgba(255, 215, 220, ${0.6 * s * flash})`);
        glow.addColorStop(1, 'rgba(255, 0, 0, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(rx - rw * 0.25, ry - rh * 0.25, rw * 1.5, rh * 1.5);
        ctx.strokeStyle = `rgba(255, 240, 244, ${0.95 * s * flash})`;
        ctx.lineWidth = Math.max(2, Math.floor(Math.min(w, h) * 0.006));
        ctx.strokeRect(rx, ry, rw, rh);
      }

      const big = Math.max(20, Math.floor(Math.min(w, h) * 0.08));
      ctx.font = `${big}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255, 180, 190, ${0.75 * s})`;
      ctx.fillText('DOOR SLAM', w * 0.5, h * 0.5);
      ctx.restore();
    }

    ctx.restore();
  }

  return { onResize, update, draw, destroy, onAudioOn, onAudioOff };
}
