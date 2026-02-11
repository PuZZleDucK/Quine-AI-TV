
# TODO Queue

- [ ] [project:quine-tv] Determinism `containerport` (`src/channels/containerport.js`): decouple audio randomness from visual PRNG (separate RNG or time-scheduled events) so the same seed yields identical visuals with audio on/off. Accept: same seed yields identical screenshots at 30fps vs 60fps; audio.enabled does not affect visual sequence.
- [ ] [project:quine-tv] visuals `containerport`: containers should look more like shipping containers
- [ ] [project:quine-tv] visuals `containerport`: containers should be consistent persistant entities and not background elements or disapear
- [ ] [project:quine-tv] visuals `containerport`: containers should be loaded and unloaded from ships when ship is stopped only. some ships unload, some load, some both.
- [ ] [project:quine-tv] visuals `containerport`: cranes should only lift containers vertically and should be consistant and not jump around
- [ ] [project:quine-tv] Special moment `containerport` (`src/channels/containerport.js`): add 1–2 rare deterministic events (~45–120s) uncommon and rare ship types. Accept: 5min capture shows at least one special moment; deterministic per seed.
