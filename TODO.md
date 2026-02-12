if `TODO.md` has no ready items:
  - Pick an **unreviewed** channel and perform a **detailed review** (per `/home/puzzleduck/x/quine-tv/AGENTS.md`).


# TODO Queue

- [quine-tv] `elevatorpanel` (src/channels/elevatorpanel.js): Visual - show a diagram of the building on the right with the elevator shafts and elevators highlighted
- [quine-tv] `elevatorpanel` (src/channels/elevatorpanel.js): Visual - call queue should be populated at random and serviced by elevators
- [quine-tv] `elevatorpanel` (src/channels/elevatorpanel.js): Buttons — replace simple chase light with persistent “selected floor” LEDs tied to CALL/QUEUE, plus press animation when a call is queued.
- [quine-tv] `elevatorpanel` (src/channels/elevatorpanel.js): Long-run interest — add 1–2 rare deterministic “special moments” (~45–120s) (e.g., fire-service key mode, overload alarm, inspection glitch) with clear visual signature and clean reset.
- [quine-tv] `elevatorpanel` (src/channels/elevatorpanel.js): Visual depth — add subtle glass reflection + edge vignette/panel bloom that varies by segment (MOVE/ARRIVE/SERVICE) without cluttering OSD.
- [quine-tv] `elevatorpanel` (src/channels/elevatorpanel.js): Text/dialog — expand the status strip into themed, mildly funny annunciator messages that can last 5 minutes (seeded rotation, no repeats too quickly).

- [quine-tv] `kintsugi` (src/channels/kintsugiclinic.js): Long-run interest — make the polish glint a true rare “special moment” (~45–120s) with a more dramatic, clearly visible signature + clean reset.
- [quine-tv] `kintsugi` (src/channels/kintsugiclinic.js): Visual polish — improve CRACK phase readability by varying crack thickness/opacity by depth and adding tiny branching micro-cracks near endpoints (deterministic per crack) without adding per-frame RNG.

- [quine-tv] `flow` (src/channels/flowfield.js): Long-run interest — add a 2–4 min phase cycle (CALM→SURGE→DRIFT) that modulates `fieldScale`, fade amount, and speed; schedule phase boundaries deterministically from `seed`.
- [quine-tv] `flow` (src/channels/flowfield.js): Special moment — add 1–2 rare deterministic events (~45–120s) (e.g., brief “field inversion” or ripple shockwave that temporarily bends trajectories) with a clear visual signature + clean reset.
- [quine-tv] `flow` (src/channels/flowfield.js): Visual identity — add a subtle, cached background gradient + slow midground “mist”/grain layer (seeded) so the scene reads less empty/digital; keep OSD-safe and avoid per-frame allocations.
- [quine-tv] `flow` (src/channels/flowfield.js): Long-run composition — prevent particle collapse into a couple of bright ribbons after ~5 min (e.g., deterministic periodic re-seed of a small % of points, or gentle divergence/jitter schedule) so coverage stays even.

- [quine-tv] `lava` (src/channels/lava.js): Perf — remove per-blob `createRadialGradient()` allocations in `render()` by pre-rendering blob sprites (bucket by radius + hue) to offscreen canvases and blitting with blur/composite. Accept: steady-state `render()` creates 0 gradients/frame.
- [quine-tv] `lava` (src/channels/lava.js): Time structure — add a 2–4 min phase cycle (CALM→BLOOP→SURGE) that modulates blob speed/blur/intensity and schedules 1–2 deterministic rare events (~45–120s) beyond the simple flash.
- [quine-tv] `lava` (src/channels/lava.js): Text/dialog — add a seeded rotating caption/subtitle line (40–80 variants, no repeats too quickly) so the channel stays entertaining over 5 minutes; keep OSD-safe.
- [quine-tv] `lava` (src/channels/lava.js): Audio polish — replace plain brown-noise hum with a gentle low drone + filtered noise that breathes with phase/flash; keep `onAudioOn()` idempotent and clear current only when owned.

- [quine-tv] `stitchalong` (src/channels/constellationstitch.js): Perf pass — cache gradients created in render path (fabric vignette, hoop wood radial, inner hoop vignette, stitch background radial) and/or pre-render weave texture to an offscreen tile; steady-state `render()` should call 0 `create*Gradient()`.
- [quine-tv] `stitchalong` (src/channels/constellationstitch.js): Long-run interest — expand pattern variety (more constellations/edge sets) and add a rare deterministic “special moment” (~45–120s) (e.g., shooting-star sweep that briefly re-threads a segment) with clean reset and OSD-safe flash.
