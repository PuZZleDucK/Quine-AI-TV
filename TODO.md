if `TODO.md` has no ready items:
  - Pick an **unreviewed** channel and perform a **detailed review** (per `/home/puzzleduck/x/quine-tv/AGENTS.md`).

# TODO Queue

## matrix (src/channels/matrix.js)
- [ ] `matrix` time structure: add a deterministic 2–4 minute phase cycle in `update(dt)` that modulates trail decay (`fillStyle alpha`), rain speed, and palette (e.g. GREEN → TEAL → RED ALERT) with smooth easing.
- [ ] `matrix` special moments: schedule a rare deterministic “GLITCH” event (every ~45–120s, seeded) that briefly increases contrast + scrambles a subset of columns, then cleanly resets.
