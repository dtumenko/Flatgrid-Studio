/* =============================================================
   FLATGRID STUDIO — walkthrough recorder

   Drives the real site through every animation and transition at
   real speed while Playwright records it. Headless Chromium runs
   CSS animations properly and its screencast is frame-accurate,
   which is why this beats filming a browser window by hand: the
   pacing is repeatable and nothing waits on a person finding the
   next link.

   Scroll distances are the measured scrollHeight of each page, not
   guesses — the first cut overshot the work reel by 2.4x and sat
   on one project for forty seconds.

   node record.js  →  out/*.webm
   ============================================================= */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const OUT = path.join(__dirname, 'out');
const W = 1920, H = 1080;

/* measured at 1920x1080 by measure.js */
const SCROLLABLE = {
  work: 2160,
  project: 6921,
  studio: 2435,
  director: 1058,
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const hold = (s) => wait(s * 1000);

/* Paced by the wall clock, not by a step count: each mouse.wheel is an
   IPC round trip of its own, so a fixed 30-steps-a-second loop ran about
   40% long and the whole film drifted. This asks the clock how far through
   it should be and sends only the difference, so the duration is the
   duration. Small deltas also let Lenis ease them, which is what makes it
   read like a hand on a trackpad. */
async function scroll(page, distance, seconds) {
  const t0 = Date.now(), ms = seconds * 1000;
  let sent = 0;
  for (;;) {
    const t = Math.min(1, (Date.now() - t0) / ms);
    const target = distance * t;
    const delta = target - sent;
    if (Math.abs(delta) >= 1) { await page.mouse.wheel(0, delta); sent = target; }
    if (t >= 1) break;
    await wait(16);
  }
}

async function viaMenu(page, label) {
  await page.click('#menuBtn');
  await hold(1.6);                             // panels close, the words rise
  await page.click(`.nav__list a:text-is("${label}")`);
  await page.waitForLoadState('load');
  await hold(1.7);                             // ink columns retract on arrival
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f));

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    recordVideo: { dir: OUT, size: { width: W, height: H } },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',            // never let the site skip its own motion
  });
  const page = await context.newPage();

  // ------------------------------------------------------ 1. arrival  (~9s)
  await page.goto(BASE + '/index.html');
  await hold(6.5);                             // the logo animation plays out
  await hold(2.5);                             // rules draw, headline rises, CTA opens

  // ------------------------------------------------------ 2. the menu  (~3s)
  await page.click('#menuBtn');
  await hold(2.2);
  await page.hover('.nav__list a:text-is("Work")');
  await hold(0.8);

  // ------------------------------------------------------ 3. the reel  (~19s)
  await page.click('.nav__list a:text-is("Work")');
  await page.waitForLoadState('load');
  await hold(1.8);

  // the photograph holds while the words pass, then wipes to the next
  await scroll(page, SCROLLABLE.work, 14);
  await hold(1.4);

  // the pointer becomes the invitation
  await page.mouse.move(W * 0.70, H * 0.40);
  await hold(0.7);
  await page.mouse.move(W * 0.60, H * 0.58, { steps: 26 });
  await hold(1.6);

  // ------------------------------------------------------ 4. a project  (~15s)
  await page.click('#reelLink');
  await page.waitForLoadState('load');
  await hold(1.6);
  await scroll(page, 2100, 9);                 // cover drift, name, brief on the rule
  await hold(1.4);
  /* The remaining plates are still empty slots. Pass them quickly rather
     than lingering — re-run this once real project photography is in and
     the middle of the film fills itself. */
  await scroll(page, SCROLLABLE.project - 2100, 3.5);
  await hold(1.0);

  // ------------------------------------------------------ 5. back out  (~2s)
  await page.click('.back--foot');
  await page.waitForLoadState('load');
  await hold(2.0);

  // ------------------------------------------------------ 6. the studio  (~20s)
  await viaMenu(page, 'Studio');
  await scroll(page, SCROLLABLE.studio, 12);   // principles, approach, disciplines
  await hold(1.2);
  await scroll(page, -SCROLLABLE.studio, 3.5); // ride back up rather than cut
  await hold(0.8);

  // ------------------------------------------------------ 7. the profile  (~10s)
  await page.click('.cta-line[href="director.html"]');
  await page.waitForLoadState('load');
  await hold(2.0);
  await scroll(page, SCROLLABLE.director, 6);
  await hold(1.4);

  // ------------------------------------------------------ 8. contact  (~9s)
  await viaMenu(page, 'Contact');
  await hold(0.6);
  await page.click('#f-name');
  await page.type('#f-name', 'Dejan Tumenko', { delay: 55 });
  await hold(0.3);
  await page.click('#f-email');
  await page.type('#f-email', 'hello@flatgrid.studio', { delay: 45 });
  await hold(1.6);

  // ------------------------------------------------------ 9. coming soon  (~5s)
  await viaMenu(page, 'Flatgrid Academy');
  await hold(2.2);

  // ------------------------------------------------------ 10. home  (~4s)
  await page.click('.logo');
  await page.waitForLoadState('load');
  await hold(3.2);                             // no logo animation: it is a return

  await context.close();                       // flushes the video file
  await browser.close();

  const file = fs.readdirSync(OUT).filter((f) => f.endsWith('.webm')).pop();
  console.log('recorded:', path.join(OUT, file));
})();
