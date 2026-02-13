if `TODO.md` has no ready items:
  - Pick an **unreviewed** channel and perform a **detailed review** (per `/home/puzzleduck/x/quine-tv/AGENTS.md`).

# TODO Queue

- [ ] [project:quine-tv] `orbits` (src/channels/orbits.js): special moment — add a rare deterministic “COMET PASS” (shooting star + trail) scheduled ~45–120s with a clear signature and clean reset.

- [ ] [project:quine-tv] `orbits` (src/channels/orbits.js): time structure — add a deterministic 2–4 min phase cycle (CALM→WARP→DRIFT) modulating orbit speeds + palette/nebula intensity with smooth easing.

- [ ] [project:quine-tv] `orbits` (src/channels/orbits.js): perf — pre-render/cached planet sprites (radius+hue buckets) to avoid per-frame `createRadialGradient()` for every planet.

- [ ] [project:quine-tv] `orbits` (src/channels/orbits.js): audio hygiene — make `onAudioOn()` idempotent (no stacking) and ensure `destroy()` only clears AudioManager.current when owned.
