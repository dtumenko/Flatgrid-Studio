/* =============================================================
   FLATGRID STUDIO — walkthrough recorder, high quality

   Playwright's own recordVideo writes VP8 at roughly 870 kb/s with
   no way to raise it, and a near-black page is the worst case for
   that codec: the flat darks break into visible blocks. This takes
   the frames straight off Chrome's screencast instead — one JPEG
   per painted frame at quality 95 — and encodes them itself, so the
   only lossy step is the one we control.

   Frame timing comes from each frame's own metadata timestamp, fed
   to ffmpeg through a concat list, because the screencast delivers
   frames when the page paints rather than on a fixed clock.

   node record-hq.js  →  out-hq/flatgrid-walkthrough.mp4
   ============================================================= */
const { chromium } = require('playwright');
const ffmpeg = require('ffmpeg-static');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const OUT = path.join(__dirname, 'out-hq');
const FRAMES = path.join(OUT, 'frames');
const W = 1920, H = 1080;

const SCROLLABLE = { work: 2160, project: 6921, studio: 2435, director: 1058 };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const hold = (s) => wait(s * 1000);

async function scroll(page, distance, seconds) {
  const t0 = Date.now(), ms = seconds * 1000;
  let sent = 0;
  for (;;) {
    const t = Math.min(1, (Date.now() - t0) / ms);
    const target = distance * t;
    const d = target - sent;
    if (Math.abs(d) >= 1) { await page.mouse.wheel(0, d); sent = target; }
    if (t >= 1) break;
    await wait(16);
  }
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();

  // ------------------------------------------------------------- capture
  const shots = [];                 // { t, file }
  let n = 0, writing = 0;
  const cdp = await context.newCDPSession(page);

  cdp.on('Page.screencastFrame', (frame) => {
    // ack first: Chrome sends nothing further until the last frame is cleared
    cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
    const file = 'f' + String(++n).padStart(6, '0') + '.jpg';
    shots.push({ t: frame.metadata.timestamp, file });
    writing++;
    fs.promises
      .writeFile(path.join(FRAMES, file), Buffer.from(frame.data, 'base64'))
      .finally(() => { writing--; });
  });

  const startCast = () =>
    cdp.send('Page.startScreencast', {
      format: 'jpeg', quality: 95, maxWidth: W, maxHeight: H, everyNthFrame: 1,
    }).catch(() => {});

  // the screencast is torn down by a navigation, so it is put back each time
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) setTimeout(startCast, 120); });

  async function viaMenu(label) {
    await page.click('#menuBtn');
    await hold(1.6);
    await page.click(`.nav__list a:text-is("${label}")`);
    await page.waitForLoadState('load');
    await hold(1.7);
  }

  await page.goto(BASE + '/index.html');
  await startCast();

  // ---------------------------------------------------------------- film
  await hold(6.5); await hold(2.5);                       // loader, then the hero settles

  await page.click('#menuBtn');
  await hold(2.2);
  await page.hover('.nav__list a:text-is("Work")');
  await hold(0.8);

  await page.click('.nav__list a:text-is("Work")');
  await page.waitForLoadState('load');
  await hold(1.8);
  await scroll(page, SCROLLABLE.work, 14);
  await hold(1.4);
  await page.mouse.move(W * 0.70, H * 0.40);
  await hold(0.7);
  await page.mouse.move(W * 0.60, H * 0.58, { steps: 26 });
  await hold(1.6);

  await page.click('#reelLink');
  await page.waitForLoadState('load');
  await hold(1.6);
  await scroll(page, 2100, 9);
  await hold(1.4);
  await scroll(page, SCROLLABLE.project - 2100, 3.5);     // past the empty slots
  await hold(1.0);

  await page.click('.back--foot');
  await page.waitForLoadState('load');
  await hold(2.0);

  await viaMenu('Studio');
  await scroll(page, SCROLLABLE.studio, 12);
  await hold(1.2);
  await scroll(page, -SCROLLABLE.studio, 3.5);
  await hold(0.8);

  await page.click('.cta-line[href="director.html"]');
  await page.waitForLoadState('load');
  await hold(2.0);
  await scroll(page, SCROLLABLE.director, 6);
  await hold(1.4);

  await viaMenu('Contact');
  await hold(0.6);
  await page.click('#f-name');
  await page.type('#f-name', 'Dejan Tumenko', { delay: 55 });
  await hold(0.3);
  await page.click('#f-email');
  await page.type('#f-email', 'hello@flatgrid.studio', { delay: 45 });
  await hold(1.6);

  await viaMenu('Flatgrid Academy');
  await hold(2.2);

  await page.click('.logo');
  await page.waitForLoadState('load');
  await hold(3.2);

  await cdp.send('Page.stopScreencast').catch(() => {});
  while (writing > 0) await wait(50);                     // let the disk catch up
  await browser.close();

  // --------------------------------------------------------------- encode
  const span = shots[shots.length - 1].t - shots[0].t;
  console.log(`${shots.length} frames over ${span.toFixed(1)}s = ${(shots.length / span).toFixed(1)} fps`);

  /* Real per-frame durations, so the pacing survives a variable capture rate. */
  const list = shots.map((s, i) => {
    const next = shots[i + 1];
    const dur = next ? Math.max(0.008, next.t - s.t) : 0.04;
    return `file 'frames/${s.file}'\nduration ${dur.toFixed(4)}`;
  }).join('\n') + `\nfile 'frames/${shots[shots.length - 1].file}'\n`;
  fs.writeFileSync(path.join(OUT, 'frames.txt'), list);

  const mp4 = path.join(OUT, 'flatgrid-walkthrough.mp4');
  execFileSync(ffmpeg, [
    '-y', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'frames.txt'),
    '-vsync', 'cfr', '-r', '30',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
    mp4,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  console.log('mp4:', mp4, (fs.statSync(mp4).size / 1024 / 1024).toFixed(1), 'MB');
})();
