if `TODO.md` has no ready items:
  - Pick an **unreviewed** channel and perform a **detailed review** (per `/home/puzzleduck/x/quine-tv/AGENTS.md`).

# TODO Queue

## Channel review queue

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
- [ ] `sandtable` (src/channels/sandtable.js): determinism — avoid consuming `rand()` inside `render()` (broadcast speckle) so 30fps/60fps captures match at fixed offsets.
- [ ] `sandtable` (src/channels/sandtable.js): audio determinism/perf — replace `Math.random()` in `sandScrape()` with the seeded PRNG (and consider reusing a small noise buffer).
