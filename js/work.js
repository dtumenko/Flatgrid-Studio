/* =============================================================
   FLATGRID STUDIO — work
   Smooth scrolling, section reveals, and a light parallax on the
   thumbnails. Nothing here hijacks input: Lenis eases the native
   scroll position, so wheel, trackpad, keyboard, scrollbar and
   touch all keep behaving the way people expect.
   ============================================================= */
(function () {
  'use strict';

  var doc    = document;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(pointer: coarse)').matches;

  /* ---------------------------------------------------------
     1. SMOOTH SCROLL
     Skipped on touch — mobile momentum scrolling is already good
     and overriding it is what makes these pages feel broken.
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

    // anchor links still need to work
    doc.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a || a.getAttribute('href') === '#') return;
      var target = doc.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: 0 });
    });
  }

  /* ---------------------------------------------------------
     2. SECTION REVEALS
     The observer drives the stagger, but it is never the only way
     in: a manual sweep runs on load, on wake, and on a timer, so a
     throttled or unsupported observer can't leave the page blank.
     --------------------------------------------------------- */
  var sections = doc.querySelectorAll('.slide');

  function reveal(el) { el.classList.add('is-seen'); }

  function sweep() {
    var vh = window.innerHeight;
    Array.prototype.forEach.call(sections, function (el) {
      if (el.classList.contains('is-seen')) return;
      // no `bottom > 0` test: a tile scrolled past quickly must still be
      // revealed, or it stays invisible for the rest of the session
      if (el.getBoundingClientRect().top < vh * 0.88) reveal(el);
    });
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        reveal(entry.target);
        io.unobserve(entry.target);          // reveal once, never re-hide
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

    Array.prototype.forEach.call(sections, function (el) { io.observe(el); });
  }

  sweep();
  window.addEventListener('load', sweep);
  doc.addEventListener('visibilitychange', function () { if (!doc.hidden) sweep(); });
  window.setTimeout(sweep, 1500);

  /* ---------------------------------------------------------
     3. PARALLAX
     Every photograph drifts against its OWN slide.

     This used to measure whichever slide was active, so the moment the
     active one changed the drift was suddenly computed from a different
     box and jumped — the snap. Each image now has a progress that is a
     continuous function of its own slide's position, so nothing can
     discontinue when the active project changes.
     --------------------------------------------------------- */
  var media = doc.querySelectorAll('.shot');
  var TRAVEL = 18;                            // px of drift, top to bottom
  var ticking = false;

  function place() {
    ticking = false;
    var vh = window.innerHeight;

    Array.prototype.forEach.call(media, function (fig, i) {
      var slide = sections[i];
      var img   = fig.firstElementChild;
      if (!slide || !img) return;

      var top = slide.getBoundingClientRect().top;
      if (top > vh * 1.6 || top < vh * -1.6) return;   // nowhere near the screen

      var progress = Math.max(-1, Math.min(1, -top / vh * 2 - 1));
      img.style.setProperty('--shift', (progress * TRAVEL).toFixed(1) + 'px');
    });
  }

  function onScroll() {
    sweep();
    count();
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(place);
  }

  if (!reduce && media.length) {
    if (lenis) {
      lenis.on('scroll', onScroll);
    } else {
      window.addEventListener('scroll', onScroll, { passive: true });
    }
    window.addEventListener('resize', onScroll, { passive: true });
  }

  /* ---------------------------------------------------------
     4. POSITION IN THE REEL
     --------------------------------------------------------- */
  var swapTimer = null;
  var readout  = doc.getElementById('countNow');
  var shots    = doc.querySelectorAll('.shot');
  var reelLink = doc.getElementById('reelLink');
  var current  = -1;

  function count() {
    if (!sections.length) return;
    var mid = window.innerHeight / 2;
    var best = 0, bestGap = Infinity;

    Array.prototype.forEach.call(sections, function (t, i) {
      var box = t.getBoundingClientRect();
      var gap = Math.abs(box.top + box.height / 2 - mid);
      if (gap < bestGap) { bestGap = gap; best = i; }
    });

    if (best === current) return;

    var prev = current;
    var down = best > prev;            // the edge the scroll came from
    current = best;

    if (readout) readout.textContent = ('0' + (best + 1)).slice(-2);

    Array.prototype.forEach.call(shots, function (fig, i) {
      fig.classList.remove('is-prev', 'is-entering', 'from-above');
      fig.classList.toggle('is-active', i === best);
    });

    if (prev > -1 && shots[prev] && !reduce) {
      // the frame being replaced stays drawn underneath the wipe
      shots[prev].classList.add('is-prev');
      shots[best].classList.add('is-entering');
      if (!down) shots[best].classList.add('from-above');

      window.clearTimeout(swapTimer);
      swapTimer = window.setTimeout(function () {
        Array.prototype.forEach.call(shots, function (fig) {
          fig.classList.remove('is-prev', 'is-entering', 'from-above');
        });
      }, 1300);
    }

    if (reelLink && shots[best]) {
      reelLink.setAttribute('href', shots[best].dataset.href || '#');
      reelLink.setAttribute('aria-label', 'Open ' + (shots[best].dataset.name || 'project'));
    }
  }

  // first paint
  count();
  place();

  /* ---------------------------------------------------------
     5. THE POINTER
     Over the photograph the cursor is replaced by the invitation
     itself. Mouse only — there is nothing to hover on touch.
     --------------------------------------------------------- */
  var cursor = doc.getElementById('cursor');
  var link   = doc.getElementById('reelLink');
  var fine   = window.matchMedia('(hover:hover) and (pointer:fine)').matches;

  if (cursor && link && fine) {
    var px = 0, py = 0, cxp = 0, cyp = 0, craf = null, over = false;

    function follow() {
      // a touch of lag, so it trails the hand rather than sticking to it
      cxp += (px - cxp) * 0.22;
      cyp += (py - cyp) * 0.22;
      cursor.style.setProperty('translate', cxp.toFixed(1) + 'px ' + cyp.toFixed(1) + 'px');
      craf = (over || Math.abs(px - cxp) > 0.4 || Math.abs(py - cyp) > 0.4)
        ? requestAnimationFrame(follow) : null;
    }

    link.addEventListener('pointerenter', function (e) {
      over = true;
      px = cxp = e.clientX; py = cyp = e.clientY;
      cursor.style.setProperty('translate', px + 'px ' + py + 'px');
      cursor.classList.add('is-on');
      doc.body.classList.add('has-cursor');
      if (!craf) craf = requestAnimationFrame(follow);
    });

    link.addEventListener('pointermove', function (e) {
      px = e.clientX; py = e.clientY;
      if (!craf) craf = requestAnimationFrame(follow);
    }, { passive: true });

    function drop() {
      over = false;
      cursor.classList.remove('is-on');
      doc.body.classList.remove('has-cursor');
    }
    link.addEventListener('pointerleave', drop);
    window.addEventListener('blur', drop);
    doc.addEventListener('visibilitychange', function () { if (doc.hidden) drop(); });
  }

  /* ---------------------------------------------------------
     6. LOCK SCROLL BEHIND THE MENU
     --------------------------------------------------------- */
  var nav = doc.getElementById('nav');

  if (nav && 'MutationObserver' in window) {
    new MutationObserver(function () {
      var open = nav.classList.contains('is-open');
      doc.body.classList.toggle('is-navlocked', open);
      if (lenis) { open ? lenis.stop() : lenis.start(); }
    }).observe(nav, { attributes: true, attributeFilter: ['class'] });
  }
})();
