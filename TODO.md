if `TODO.md` has no ready items:
  - Pick an **unreviewed** channel and perform a **detailed review** (per `/home/puzzleduck/x/quine-tv/AGENTS.md`).

# TODO Queue

- [ ] `fixit` (src/channels/fixit.js): Expand `REPAIRS` from 4 → 10+ with unique palettes/tools and 4–6 steps each (label/dur/action/sound); keep durations varied so a single repair lasts ~30–60s.
- [ ] `fixit` (src/channels/fixit.js): Add deterministic 2–4 minute phase cycle that modulates lamp warmth, bench vignette intensity, and animation pacing (store phase in `update(dt)`, render reads stable phase values).
- [ ] `fixit` (src/channels/fixit.js): Add rare deterministic “special moments” (~45–120s cadence; seeded) with clear signatures + clean reset (e.g. LAMP FLICKER, SUCCESS STAMP, DUST PUFF overlay).
- [ ] `fixit` (src/channels/fixit.js): Improve tool art: draw distinct tips/silhouettes per tool (pliers/wrench/screwdriver/tape) instead of the generic spear tip; add subtle drop shadow under tool + object for depth.
