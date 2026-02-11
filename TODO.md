
# TODO Queue
- Channel `volcanoobs` (`src/channels/volcanoobservatory.js`): Replace `destination-out` crater hole in `drawVolcano()` (`src/channels/volcanoobservatory.js:265`) with layered rim/lip shading that keeps mountain mass visible and prevents hard cutout artifacts.
- Channel `volcanoobs` (`src/channels/volcanoobservatory.js`): Increase eruption readability by scaling ash and plume contrast in `drawVolcano()` and `drawAsh()` (`src/channels/volcanoobservatory.js:293` and `src/channels/volcanoobservatory.js:341`) during puff phase; include occasional incandescent ejecta arcs as rare moments.
- Channel `volcanoobs` (`src/channels/volcanoobservatory.js`): Improve seismograph coupling in `drawSeismograph()` (`src/channels/volcanoobservatory.js:388`) by overlaying threshold markers/alerts tied to `intensityAt(loopT)` so build-up and eruption states are legible.



