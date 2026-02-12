if `TODO.md` has no ready items:
  - Pick an **unreviewed** channel and perform a **detailed review** (per `/home/puzzleduck/x/quine-tv/AGENTS.md`).

# TODO Queue

- [ ] Review channel `lava` (src/channels/lava.js): capture screenshots (0–300s), do code/audio/perf pass, add `// REVIEWED: 2026-02-12`, and queue concrete follow-ups.

- [ ] [lava] Determinism: switch to fixed-timestep update (or deterministic scheduler) so 30fps vs 60fps yields identical captures for the same seed (similar approach to `flowfield`). File: src/channels/lava.js.
- [ ] [lava] Responsive scaling: store `baseR` for blobs (and maybe base velocities) and recompute `r` on `onResize()` from current `h` (rebuild sprite cache) so resizes don’t make blobs comically huge/small. File: src/channels/lava.js.
