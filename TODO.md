if `TODO.md` has no ready items:
  - Pick an **unreviewed** channel and perform a **detailed review** (per `/home/puzzleduck/x/quine-tv/AGENTS.md`).

# TODO Queue

## matrix (src/channels/matrix.js)
- [ ] `matrix` determinism: stop consuming `rand()` in `render()` (currently `glyph()` uses `rand()` per draw). Add a separate `randGlyph` stream + a `glyphGrid` (or per-column glyph arrays) updated on a fixed cadence in `update(dt)` (e.g. every 80–140ms), so glyph changes are time-based/FPS-stable.
- [ ] `matrix` time structure: add a deterministic 2–4 minute phase cycle in `update(dt)` that modulates trail decay (`fillStyle alpha`), rain speed, and palette (e.g. GREEN → TEAL → RED ALERT) with smooth easing.
- [ ] `matrix` special moments: schedule a rare deterministic “GLITCH” event (every ~45–120s, seeded) that briefly increases contrast + scrambles a subset of columns, then cleanly resets.
- [ ] `matrix` visual polish: make the top overlay banner OSD-safer by fading it in/out or reducing its height; also rotate the title text from a seeded list (5+ minutes) instead of a single static string.
- [ ] `matrix` audio hygiene: make `onAudioOn()` idempotent (don’t stack noise sources) and in `onAudioOff()/destroy()` clear AudioManager current only if the handle is owned; consider a gentle fade and reduce beep frequency/variation.

