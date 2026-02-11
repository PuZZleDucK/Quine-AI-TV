
# TODO Queue

- [ ] [project:quine-tv] Determinism `containerport` (`src/channels/containerport.js`): decouple audio randomness from visual PRNG (separate RNG or time-scheduled events) so the same seed yields identical visuals with audio on/off. Accept: same seed yields identical screenshots at 30fps vs 60fps; audio.enabled does not affect visual sequence.

- [ ] [project:quine-tv] Perf pass `containerport` (`src/channels/containerport.js`): cache gradients created in render path (bg/sea/yard/vignette) on init/resize/ctx swap. Accept: steady-state `render()` allocates 0 gradients/frame.

- [ ] [project:quine-tv] Special moment `containerport` (`src/channels/containerport.js`): add 1–2 rare deterministic events (~45–120s) (e.g. CUSTOMS HOLD alert sweep, storm flash, crane jam) that reset cleanly and keep OSD legible. Accept: 5min capture shows at least one special moment; deterministic per seed.
