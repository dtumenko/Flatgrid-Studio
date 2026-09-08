/* =============================================================
   FLATGRID STUDIO — project
   Smooth scrolling, reveals as each block arrives, a slow drift on
   the cover, and chrome that turns dark when the paper reaches it.
   ============================================================= */
(function () {
  'use strict';

  var doc    = document;
  var body   = doc.body;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(pointer: coarse)').matches;

  /* ---------------------------------------------------------
     1. SMOOTH SCROLL
     Skipped on touch — mobile momentum is already good, and
     overriding it is what makes these pages feel broken.
     --------------------------------------------------------- */
  var lenis = null;

  if (window.Lenis && !reduce && !coarse) {
    lenis = new window.Lenis({
      duration: 1.05,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.6
    });

    var raf = function (time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }

  /* ---------------------------------------------------------
     2. REVEALS
     The observer drives it, but a manual sweep runs on load, on
     wake and on a timer — a throttled or unsupported observer
     must never be able to leave a block invisible.
     --------------------------------------------------------- */
  var blocks = doc.querySelectorAll('.up');

  function sweep() {
    var vh = window.innerHeight;
    Array.prototype.forEach.call(blocks, function (el) {
      if (el.classList.contains('is-seen')) return;
      var box = el.getBoundingClientRect();
      /* Two ways in, and a block needs only one of them:
         - its top has risen past nine tenths of the screen, the usual case;
         - it is wholly inside the screen, or wholly above it. The second
           test is what catches the last block on the page, which the page
           can run out of height before it ever reaches the first. */
      if (box.top < vh * 0.9 || box.bottom < vh) el.classList.add('is-seen');
    });
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-seen');
        io.unobserve(entry.target);            // reveal once, never re-hide
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.06 });

    Array.prototype.forEach.call(blocks, function (el) { io.observe(el); });
  }

  sweep();
  window.addEventListener('load', sweep);
  doc.addEventListener('visibilitychange', function () { if (!doc.hidden) sweep(); });
  window.setTimeout(sweep, 1500);

  /* ---------------------------------------------------------
     3. THE COVER DRIFTS
     Shift goes on `translate` and nothing transitions it. The scale
     stays on `scale`, which is free to ease — the two must never
     share a property, or every scroll update eases and the frame
     keeps travelling after the scrolling stops.
     --------------------------------------------------------- */
  var cover    = doc.querySelector('.cover');
  var coverImg = doc.querySelector('.cover__img');
  // the stylesheet builds the image taller by exactly this much, so the two
  // must agree — read it rather than repeat it
  var TRAVEL   = parseFloat(
    getComputedStyle(doc.body).getPropertyValue('--drift')) || 0;
  var ticking  = false;

  function place() {
    ticking = false;
    if (!cover || !coverImg) return;

    var box = cover.getBoundingClientRect();
    if (box.bottom < 0) return;        // scrolled clear of it

    var progress = Math.max(0, Math.min(1, -box.top / box.height));
    coverImg.style.setProperty('--shift', (progress * TRAVEL).toFixed(1) + 'px');
  }

  /* ---------------------------------------------------------
     4. CHROME OVER PAPER
     The wordmark and the rail are fixed, so they cross from ink to
     paper and back as the page moves under them. Each one is tested
     against its own position rather than a single page-wide flag —
     the rail sits at the middle of the screen and the wordmark at
     the top, and they do not cross the boundary at the same time.
     --------------------------------------------------------- */
  var paper  = doc.querySelector('.paper');
  var outro  = doc.querySelector('.outro');
  var chrome = [doc.querySelector('.logo'), doc.querySelector('.menu')]
                 .filter(Boolean);

  function tone() {
    if (!paper || !chrome.length) return;

    var top = paper.getBoundingClientRect().top;
    var bot = outro ? outro.getBoundingClientRect().top
                    : paper.getBoundingClientRect().bottom;

    chrome.forEach(function (el) {
      var r = el.getBoundingClientRect();
      var y = r.top + r.height / 2;
      el.classList.toggle('on-paper', y > top && y < bot);
    });
  }

  function onScroll() {
    sweep();
    tone();
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(place);
  }

  if (lenis) {
    lenis.on('scroll', onScroll);
  } else {
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  window.addEventListener('resize', onScroll, { passive: true });

  // first paint
  tone();
  if (!reduce) place();

  /* ---------------------------------------------------------
     5. LOCK SCROLL BEHIND THE MENU
     --------------------------------------------------------- */
  var nav = doc.getElementById('nav');

  if (nav && 'MutationObserver' in window) {
    new MutationObserver(function () {
      var open = nav.classList.contains('is-open');
      body.classList.toggle('is-navlocked', open);
      if (lenis) { open ? lenis.stop() : lenis.start(); }
    }).observe(nav, { attributes: true, attributeFilter: ['class'] });
  }
})();
