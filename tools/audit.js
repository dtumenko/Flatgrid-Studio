/* =============================================================
   FLATGRID STUDIO — responsive audit

   Loads every page at every size that matters and measures the
   things that actually break: sideways overflow, type that has
   collapsed below readable, controls too small to hit with a
   thumb, and fixed chrome sitting on top of content.

   Screenshots go to audit/<viewport>/<page>.png, findings to
   audit/report.json and the console.

   node audit.js
   ============================================================= */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const OUT = path.join(__dirname, 'audit');

const VIEWPORTS = [
  { name: '1440-laptop',  width: 1440, height: 900,  dsf: 2, touch: false },
  { name: '1366-laptop',  width: 1366, height: 768,  dsf: 1, touch: false },
  { name: '1280-laptop',  width: 1280, height: 800,  dsf: 2, touch: false },
  { name: '1024-small',   width: 1024, height: 768,  dsf: 1, touch: false },
  { name: '834-tablet',   width: 834,  height: 1112, dsf: 2, touch: true  },
  { name: '390-phone',    width: 390,  height: 844,  dsf: 3, touch: true  },
  { name: '375-phone-se', width: 375,  height: 667,  dsf: 2, touch: true  },
];

const PAGES = ['index', 'work', 'studio', 'director', 'contact', 'academy', 'project-vellor'];

const MIN_TYPE = 11;      // below this, body copy stops being comfortable on a phone
const MIN_TAP  = 40;      // WCAG 2.5.8 asks 24, Apple and Google both say 44

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch();
  const findings = [];

  for (const vp of VIEWPORTS) {
    const dir = path.join(OUT, vp.name);
    fs.mkdirSync(dir, { recursive: true });

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.dsf,
      hasTouch: vp.touch,
      isMobile: vp.touch,
      userAgent: vp.touch ? devices['iPhone 13'].userAgent : undefined,
    });
    const page = await context.newPage();

    for (const name of PAGES) {
      await page.goto(`${BASE}/${name}.html`);
      await page.waitForTimeout(900);

      // let everything that reveals on scroll be present for the shot
      await page.evaluate(() => {
        document.querySelectorAll('.up, .slide, .plate').forEach((el) => el.classList.add('is-seen'));
        const l = document.getElementById('loader');
        if (l) { l.classList.add('is-done'); l.remove(); }
        document.body.classList.add('is-live');
      });
      await page.waitForTimeout(600);

      const m = await page.evaluate(({ MIN_TYPE, MIN_TAP }) => {
        const vw = document.documentElement.clientWidth;

        /* Sideways overflow: the single most common responsive failure, and
           invisible until someone on a phone swipes and the whole page slides. */
        const overflow = document.documentElement.scrollWidth - vw;
        const culprits = [];
        if (overflow > 1) {
          document.querySelectorAll('body *').forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0) return;
            if (r.right > vw + 1 || r.left < -1) {
              const s = getComputedStyle(el);
              if (s.position === 'fixed') return;             // chrome is meant to sit there
              culprits.push({
                sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
                  ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
                right: Math.round(r.right), left: Math.round(r.left),
              });
            }
          });
        }

        /* Type that has collapsed below readable. Only counts text that is
           actually rendered and actually visible. */
        const small = [];
        document.querySelectorAll('p, li, dd, dt, span, a, h1, h2, h3, label, input, textarea').forEach((el) => {
          if (!el.textContent.trim() && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return;
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return;
          const size = parseFloat(s.fontSize);
          if (size < MIN_TYPE) {
            small.push({
              sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
                ? '.' + el.className.trim().split(/\s+/)[0] : ''),
              size: +size.toFixed(1),
              text: el.textContent.trim().slice(0, 34),
            });
          }
        });

        /* Anything you have to hit with a thumb. */
        const taps = [];
        document.querySelectorAll('a, button, input, select, textarea').forEach((el) => {
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden') return;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          if (r.height < MIN_TAP || r.width < MIN_TAP) {
            taps.push({
              sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
                ? '.' + el.className.trim().split(/\s+/)[0] : ''),
              w: Math.round(r.width), h: Math.round(r.height),
              text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 28),
            });
          }
        });

        /* Does the fixed chrome land on top of anything readable? */
        const clashes = [];
        const chrome = [...document.querySelectorAll('.logo, .menu, .back--fixed')];
        chrome.forEach((c) => {
          const cr = c.getBoundingClientRect();
          if (cr.width === 0) return;
          document.querySelectorAll('h1, h2, .mag__text, .svc__text, .step__text, .brief__lead, .slide__name')
            .forEach((t) => {
              const tr = t.getBoundingClientRect();
              if (tr.width === 0 || tr.bottom < 0 || tr.top > innerHeight) return;
              const hit = !(tr.right < cr.left || tr.left > cr.right || tr.bottom < cr.top || tr.top > cr.bottom);
              if (hit) clashes.push({
                chrome: c.className.split(/\s+/)[0],
                over: t.tagName.toLowerCase() + '.' + (t.className.split(/\s+/)[0] || ''),
              });
            });
        });

        return {
          vw, docW: document.documentElement.scrollWidth, overflow,
          culprits: culprits.slice(0, 6), small: small.slice(0, 8),
          taps: taps.slice(0, 8), clashes: clashes.slice(0, 4),
          height: document.documentElement.scrollHeight,
        };
      }, { MIN_TYPE, MIN_TAP });

      await page.screenshot({ path: path.join(dir, name + '.png'), fullPage: true });
      findings.push({ viewport: vp.name, page: name, ...m });
    }

    await context.close();
    console.log('done', vp.name);
  }

  await browser.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(findings, null, 1));

  // ------------------------------------------------------------- summary
  const bad = findings.filter((f) => f.overflow > 1 || f.small.length || f.taps.length || f.clashes.length);
  console.log('\n================ FINDINGS ================');
  if (!bad.length) console.log('nothing flagged');
  for (const f of bad) {
    console.log(`\n${f.viewport}  ${f.page}`);
    if (f.overflow > 1) {
      console.log(`  OVERFLOW  page is ${f.overflow}px wider than the screen`);
      f.culprits.forEach((c) => console.log(`            ${c.sel}  left ${c.left} right ${c.right}`));
    }
    f.small.forEach((s) => console.log(`  TYPE      ${s.size}px  ${s.sel}  "${s.text}"`));
    f.taps.forEach((t) => console.log(`  TAP       ${t.w}x${t.h}  ${t.sel}  "${t.text}"`));
    f.clashes.forEach((c) => console.log(`  OVERLAP   ${c.chrome} sits on ${c.over}`));
  }
})();
