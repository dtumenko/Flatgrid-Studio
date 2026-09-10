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


# Responsive audit

Loads every page at every size that matters and measures the things that
actually break, rather than leaving it to the eye.

```bash
python -m http.server 8099 --bind 127.0.0.1   # from the site root
node tools/audit.js                            # → tools/audit/<viewport>/<page>.png
```

Checks, per page per viewport:

- **sideways overflow** — the page wider than the screen, and which element did
  it. Invisible until someone on a phone swipes and the whole page slides;
- **type under 11px** that is actually rendered and actually visible;
- **tap targets under 40px** — Apple and Google both ask for 44;
- **fixed chrome sitting on content** — the rail and the wordmark are fixed, so
  they can land on top of text at sizes where the layout has reflowed under them.

Findings print to the console and land in `tools/audit/report.json`.
Sizes covered: 1440, 1366, 1280 and 1024 laptops, an 834 tablet, and 390 and
375 phones.

# Recording quality

`record.js` uses Playwright's own `recordVideo`, which writes VP8 at about
870 kb/s with no way to raise it. On a near-black page that codec breaks the
flat darks into visible blocks.

`record-hq.js` takes frames off Chrome's screencast instead — one JPEG per
painted frame at quality 95 — and encodes them at CRF 16, so the only lossy
step is the one we control. Frame timing comes from each frame's own metadata
timestamp through an ffmpeg concat list, because the screencast delivers frames
when the page paints rather than on a fixed clock. Use this one.
