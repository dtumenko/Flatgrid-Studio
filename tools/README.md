# Walkthrough recorder

Drives the real site through every animation and transition while Playwright
records it, then transcodes to H.264/MP4. Repeatable: re-run it after the
project photography lands and the film fills its own gaps.

```bash
npm i playwright ffmpeg-static
npx playwright install chromium

python -m http.server 8099 --bind 127.0.0.1   # from the site root, in another shell
node tools/measure.js                          # scroll heights, if pages changed
node tools/record.js                           # → tools/out/*.webm   (~1:40)
node tools/to-mp4.js                           # → tools/out/flatgrid-walkthrough.mp4
```

**Scroll distances come from `measure.js`, not from guesses.** The first cut
overshot the work reel by 2.4x and sat on one project for forty seconds.

**`scroll()` is paced by the wall clock**, not by a step count. Every
`mouse.wheel` is its own IPC round trip, so a fixed 30-steps-a-second loop ran
about 40% long and the whole film drifted.

**Playwright's bundled ffmpeg cannot do this conversion.** It is built
`--disable-everything` with only VP8 and the WebM muxer — it records, it cannot
transcode. Hence `ffmpeg-static`.
