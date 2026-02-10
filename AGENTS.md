# Agent Instructions (Quine TV)

## Important

For any bugfix or improvment you must take screenshots at the start of your work, and screenshots at the completion of your work. Review the final screenshot to verify that the intended effect has been achieved and try again if it has not. If you cannnot complete the task discard the work and report that the task was not achieved and why.

## Screenshot Review Workflow

The repository includes a Playwright-based capture tool: `scripts/capture-channel-screenshots.mjs` (invoked via `npm run screenshots`).

**Channel quality bar / example to copy:**
- Use `src/channels/synthwave.js` as the *canonical* example of what “good” looks like.
- Channels should aim to have (most of):
  - A strong visual identity (palette + composition) with **layered motion** (background/midground/foreground).
  - **Time structure** (beats/segments/phases) rather than a single infinite loop.
  - A couple of small **“special moments”** (e.g. meteor/flash/glitch.rare-event) triggered on timers.
  - Deterministic variety via the provided `seed` + PRNG (so the same seed yields the same scene).
  - Optional audio that respects `audio.enabled` (start on `onAudioOn`, stop/cleanup on `onAudioOff`/`destroy`).
  - Clean lifecycle: implement `onResize`, `update(dt)`, `draw(ctx)`, and `destroy()`; keep allocations out of the hot path.

### Prereqs

1. Ensure the dev server is running (default `http://localhost:5176`):

```bash
npm run dev
```

2. If Playwright Chromium is not installed on the machine:

```bash
npm run screenshots:install
```

### Capture A Single Channel For Review

For a good channel review, capture:
- The first few frames shortly after tuning (detect flicker / overly-fast motion / initialization artifacts).
- A frame at ~10 seconds (initial steady state).
- A frame at ~1 minute (sustained behavior).
- A frame at ~5 minutes (long-run drift, perf cliffs, leaks).

Use `OFFSETS_MS` to capture at specific times after tuning:

```bash
OUT_DIR=screenshots/review-aquarium \
  CLEAN_OUT_DIR=1 \
  CHANNEL_ID=aquarium \
  OFFSETS_MS=0,200,400,600,800,10000,60000,300000 \
  FAIL_ON_ERRORS=1 \
  npm run screenshots
```

Notes:
- `CHANNEL_ID` selects a channel by id (e.g. `aquarium`). Alternatively use `CHANNEL_NUM=2`.
- Output includes a `report.json` with `captures`, `errors`, and `warnings`.
- The capture intentionally keeps the OSD visible in the shot (to verify UI remains legible/uncluttered).

### Multi-Frame Capture (Uniform Spacing)

If you want evenly spaced frames (useful for checking animation speed):

```bash
OUT_DIR=screenshots/review-aquarium-frames \
  CLEAN_OUT_DIR=1 \
  CHANNEL_ID=aquarium \
  FRAMES=12 \
  FRAME_GAP_MS=200 \
  FAIL_ON_ERRORS=1 \
  npm run screenshots
```

## Channel Review Standard (definition of “reviewed”)

A *good channel review* must produce concrete, trackable follow-ups. Do **all** of the following.

### 1) Capture screenshots + visual analysis
- Capture several screenshots across time (different phases / special moments).
- Ask:
  - Does it look good? (composition, palette, legibility, typography)
  - Does it convey the intended effect/intent?
  - Is it visually pleasing/interesting over time (not just the first 10 seconds)?
  - Is the dialog or text funny or entertaining?

### 2) Code + audio review
- Review the channel code for:
  - correctness and obvious bugs,
  - lifecycle hygiene (`onResize`, `update(dt)`, `draw(ctx)`, `destroy()`),
  - deterministic variety (seeded PRNG use, stable pacing),
  - performance (hot-path allocations, expensive gradients/paths per frame, too-many draw calls).
- Review optional audio for:
  - respecting `audio.enabled`,
  - correct start/stop/cleanup on audio toggle + `destroy()`,
  - sane levels + loops (no clicks, no runaway stacking).

### 3) Identify improvements (be specific)
Look for opportunities in these buckets:
- Visual upgrades: depth/parallax, lighting/material cues, HUD polish.
- Long-term interest: better time structure/phases, more variety, better pacing.
- Efficiency: cache work, reduce allocations/state churn.
- Text/dialog: longer, better themed, clearer intent, more dynamic, more entertaining.
- New elements that better convey the concept.
- Uncommon and rare elements.

### 4) Create TODO items for every identified improvement
- For each improvement, add a checklist task (in `/home/puzzleduck/clawd/AUTOPILOT.md` under `## Queue`).
- Every TODO must include:
  - channel id and file path (`src/channels/<id>.js`),
  - exactly what to change and where,
- Prefer several small bounded tasks over one huge “improve graphics” blob.

### 5) Mark the channel file as reviewed
Add a short comment near the top of `src/channels/<id>.js`:

```js
// REVIEWED: YYYY-MM-DD
```

That comment is the durable marker that the review pass happened.
