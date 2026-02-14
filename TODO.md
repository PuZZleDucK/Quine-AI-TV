if `TODO.md` has no ready items:
  - Pick an **unreviewed** channel and perform a **detailed review** (per `/home/puzzleduck/x/quine-tv/AGENTS.md`).

# TODO Queue

## Channel review queue

<!-- (empty) -->
<!-- done: reviewed `news` (2026-02-14) → TODONE.md -->

<!-- done: moved to TODONE.md -->

## Follow-ups queued from review: tugdispatch

<!-- done: moved to TODONE.md -->
<!-- done: moved to TODONE.md (scanline cache) -->
<!-- done: moved to TODONE.md (vhf dispatch log strip) -->
<!-- done: moved to TODONE.md (special moments) -->
<!-- done: moved to TODONE.md (lightning determinism) -->

## Follow-ups queued from review: forgeanvil

(none queued)

## Follow-ups queued from review: futurearch

(none queued)

## Follow-ups queued from review: icecorelab

<!-- done: moved to TODONE.md (icecorelab depth/age readout) -->
<!-- done: moved to TODONE.md (icecorelab micro-striation) -->
<!-- done: moved to TODONE.md (icecorelab sample tray chip) -->
<!-- done: moved to TODONE.md (icecorelab ash/isotope chart tie) -->

## Follow-ups queued from review: sandtable

<!-- done: moved to TODONE.md (sandtable sand texture Y tiling) -->
<!-- done: moved to TODONE.md (sandtable render speckle determinism) -->

## Follow-ups queued from review: kitchen

<!-- done: moved to TODONE.md (kitchen cleanup / unused locals) -->

<!-- done: moved to TODONE.md (kitchen beaker glass highlight/caustic overlay) -->

<!-- done: moved to TODONE.md (kitchen science fair cadence/variant tuning) -->

<!-- done: moved to TODONE.md (kitchen foam band determinism) -->
<!-- done: moved to TODONE.md (kitchen bg cache) -->
<!-- done: moved to TODONE.md (kitchen audio hygiene) -->
<!-- done: moved to TODONE.md (kitchen experiments shuffle-bag) -->
<!-- done: moved to TODONE.md (kitchen science fair) -->

## Follow-ups queued from review: microfilm

<!-- done: moved to TODONE.md (microfilm reel contrast + film path hint) -->
<!-- done: moved to TODONE.md (microfilm scratches overlay) -->
<!-- done: moved to TODONE.md (microfilm rare special moments) -->
<!-- done: moved to TODONE.md (microfilm bg/vignette cache) -->

## Follow-ups queued from review: news

<!-- done: moved to TODONE.md (news OSD safety logo safe-rect) -->
<!-- done: moved to TODONE.md (news ticker cache) -->
<!-- done: moved to TODONE.md (news special moments) -->
<!-- done: moved to TODONE.md (news audio hygiene) -->

## Follow-ups queued from review: packetsfm

<!-- done: moved to TODONE.md (packetsfm determinism: fixed-timestep sim for FPS-stable captures) -->
<!-- done: moved to TODONE.md (packetsfm gradient cache) -->
<!-- done: moved to TODONE.md (packetsfm spectrum hsla allocs) -->
<!-- done: moved to TODONE.md (audio hygiene) -->
<!-- done: moved to TODONE.md (packetsfm packet log strip) -->

## Follow-ups queued from review: lighthouse

<!-- done: moved to TODONE.md (lighthouse audio hygiene) -->
<!-- done: moved to TODONE.md (lighthouse rain determinism) -->
<!-- done: moved to TODONE.md (lighthouse gradient cache) -->
<!-- done: moved to TODONE.md (lighthouse cliff texture) -->
<!-- done: moved to TODONE.md (lighthouse special moments) -->

## Follow-ups queued from review: lasercutfile

- [ ] `lasercutfile` (src/channels/lasercutfile.js): audio hygiene — make `onAudioOn()` idempotent and ensure `onAudioOff()`/`destroy()` only clear AudioManager.current when owned (avoid stacking / clobbering other channel audio).
- [ ] `lasercutfile` (src/channels/lasercutfile.js): perf — cache the inner bed gradient created in `drawBed()` (rebuild on resize/ctx swap) so steady-state render avoids per-frame `createLinearGradient()`.
- [ ] `lasercutfile` (src/channels/lasercutfile.js): UI — clamp/ellipsize HUD badge text (e.g. `MATERIAL CHANGE: …`) so it never overflows its rounded-rect container at small resolutions.

<!-- done: moved to TODONE.md (lasercutfile sparks determinism / FPS-stable) -->
<!-- done: moved to TODONE.md (lasercutfile sparks cap perf) -->
<!-- done: moved to TODONE.md (lasercutfile special moments) -->
<!-- done: moved to TODONE.md (lasercutfile bed frame texture) -->
