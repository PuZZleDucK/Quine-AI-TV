# Quine TV

HTML5 virtual TV: a CRT-ish shell UI + a pile of animated channels.

## Run

Option A (recommended):
```bash
cd ~/x/quine-tv
npm run dev
# open http://localhost:5176
```

Option B:
```bash
cd ~/x/quine-tv
python3 -m http.server
```

## Controls
- Space: power
- ↑ / ↓: channel
- 0–9: type a channel number, Enter to tune
- Backspace: edit tuning
- A: audio on/off (first click is required to allow audio)
- I: toggle overlay
- H / ?: help

## Notes
- Each channel is a module in `src/channels/`.
- Audio is optional per-channel and only starts after user gesture.
