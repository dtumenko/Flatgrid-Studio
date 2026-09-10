/* =============================================================
   FLATGRID STUDIO — hero
   ============================================================= */
(function () {
  'use strict';

  var doc    = document;
  var body   = doc.body;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------
     0. THE CURTAIN
     Set covering by the boot script when the previous page handed
     over. Retract on the first frame so the two loads read as one
     continuous sweep.
     --------------------------------------------------------- */
  var arriving = doc.documentElement.classList.contains('is-arriving');
  var curtain  = doc.getElementById('curtain');

  if (arriving) {
    try { sessionStorage.removeItem('fg:xfade'); } catch (e) {}

    if (curtain) {
      // Commit the covering state with a forced reflow, then release it in
      // the same tick. requestAnimationFrame is throttled whenever the page
      // isn't painting, and a curtain that never lifts would leave the
      // screen blank — this must not depend on a frame arriving.
      void curtain.offsetHeight;
      curtain.classList.add('is-out');

      window.setTimeout(function () {
        doc.documentElement.classList.remove('is-arriving', 'is-ink');
        curtain.classList.remove('is-out');
      }, 1400);                       // 620ms sweep + 5 x 45ms stagger, plus air
    } else {
      doc.documentElement.classList.remove('is-arriving', 'is-ink');
    }
  }

  /* ---------------------------------------------------------
     0b. LEAVING BY A LINK
     The menu has its own way out: its panels are already covering
     the screen, so it only has to hold them. Every other internal
     link closes the same panels over the page first, so the next
     load picks up a move already under way instead of cutting.
     --------------------------------------------------------- */
  /* .46s of sweep plus 5 x 28ms of stagger, less a beat, so the browser is
     already fetching while the last column lands. */
  var LEAVE  = { '1': 560, ink: 560 };
  var going  = false;

  /* Start a sweep in `mode` and hand back how long to wait before leaving.

     The order here is the whole trick. The panels rest covering the screen,
     because that is what an arrival needs; a departure needs them open first.
     Simply adding `is-leaving` sets that open state — but `transition` is
     already declared on them, so the browser starts easing *towards* open,
     and the `is-in` that follows a moment later just retargets a transition
     already in flight. The panels wobble a few percent and settle back, which
     is why every one of these read as an instant cut with no animation at all.

     So the opening state is committed with transitions switched off, and only
     then are they switched back on and the sweep asked for. */
  function sweep(mode) {
    var html = doc.documentElement;

    curtain.classList.add('is-set');            // nothing may animate yet
    html.classList.add('is-leaving');
    if (mode !== '1') html.classList.add('is-' + mode);
    void curtain.offsetHeight;                  // open, in one jump

    curtain.classList.remove('is-set');         // transitions come back
    void curtain.offsetHeight;
    curtain.classList.add('is-in');             // and now it travels

    return LEAVE[mode] || LEAVE['1'];
  }

  doc.addEventListener('click', function (e) {
    if (going || reduce || !curtain) return;

    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || a.closest('.nav')) return;                  // the menu handles its own
    if (a.hasAttribute('target') || a.hasAttribute('download')) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;

    var href = a.getAttribute('href') || '';
    if (!href || href.charAt(0) === '#') return;          // in-page anchor
    /* mailto:, tel: and the rest are not page loads, so they get nothing.
       http(s) links DO get the sweep: anything opening elsewhere already
       carries target=_blank and was turned away above, and the flattened
       review builds rewrite every internal link to an absolute URL — a
       scheme test that turned those away is what left the artifacts with
       no transition at all. */
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^https?:/i.test(href)) return;

    /* data-xfade="none" opts a link out: it navigates the ordinary way, with
       no columns at either end. The photographs on the work page use it —
       opening a project is meant to be immediate. */
    if (a.getAttribute('data-xfade') === 'none') return;

    e.preventDefault();
    going = true;
    try { sessionStorage.setItem('fg:xfade', '1'); } catch (err) {}

    var hold = sweep('1');
    window.setTimeout(function () { window.location.href = href; }, hold);
  });

  /* Restored from the back/forward cache, a page comes back exactly as it
     was left — and it was left mid-departure. Every part of that state has
     to be undone here or the visitor lands on the leftovers of a transition
     that will never finish.

     There are two halves to it. The curtain is one; the menu is the other,
     and the menu was the half that was missing: pressing Back arrived on
     panels still up with their words faded out and the chrome faded out
     with them, which is a white screen with nothing on it. */
  window.addEventListener('pageshow', function () {
    going = false;

    doc.documentElement.classList.remove('is-leaving');
    if (curtain) curtain.classList.remove('is-in');

    /* `is-ink` belongs to the arrival as much as to the departure, and
       pageshow fires on every load — including this one. Clearing it
       unconditionally would cancel the very sweep the boot script just
       asked for, so it goes only when no arrival is under way. */
    if (!doc.documentElement.classList.contains('is-arriving')) {
      doc.documentElement.classList.remove('is-ink');
    }

    /* `is-open` deliberately stays: the menu is what the visitor was
       looking at when they left, so that is what Back should give them
       back. Only the leaving is undone. */
    body.classList.remove('is-leaving');
    if (nav) nav.classList.remove('is-leaving');
  });

  /* ---------------------------------------------------------
     1. LOADER  —  the studio logo animation (MP4)
     --------------------------------------------------------- */
  var loader   = doc.getElementById('loader');
  var video    = doc.getElementById('loaderVideo');
  var progress = doc.getElementById('loaderProgress');
  var skipBtn  = doc.getElementById('loaderSkip');

  /* The logo animation belongs to the arrival. It plays on the first page
     of a visit and never again — coming back to the home page from the
     wordmark, or from any other page, goes straight in. */
  var ONCE_PER_SESSION = true;

  var MAX_WAIT = 5800;   // never hold the page longer than this
  var released = false;

  /* Two independent ways of knowing the visitor is already here, because
     neither is reliable on its own:

       - they followed a link from another page of this site. This is the one
         that matters for the wordmark, and it needs no storage at all;
       - this browser has already been shown the intro this session.

     sessionStorage throws or is isolated on file:// and in some private
     modes, and some browsers strip the referrer — so either check alone can
     miss, and the intro would play again on the way back to the home page. */
  var seen = false;

  try {
    seen = !!doc.referrer &&
           new URL(doc.referrer).host === window.location.host;
  } catch (e) {}

  try {
    seen = seen || (ONCE_PER_SESSION && sessionStorage.getItem('fg:intro') === '1');
    /* Marked here rather than in start(), so a visit that lands on the work
       page first has still spent its intro by the time the wordmark is used. */
    sessionStorage.setItem('fg:intro', '1');
  } catch (e) {}

  function release() {
    if (released) return;
    released = true;

    loader.classList.add('is-done');
    loader.setAttribute('aria-hidden', 'true');
    if (video) { try { video.pause(); } catch (e) {} }

    // Set this synchronously. requestAnimationFrame never fires while the
    // tab is in the background, so deferring to it would leave anyone who
    // opened the page in a background tab looking at an empty screen.
    body.classList.add('is-live');

    window.setTimeout(function () {
      if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
    }, 900);
  }

  function start() {
    // progress hairline follows real playback
    if (video) {
      video.addEventListener('timeupdate', function () {
        if (!video.duration) return;
        progress.style.width = (video.currentTime / video.duration * 100) + '%';
      });
      video.addEventListener('ended', function () {
        progress.style.width = '100%';
        release();
      });
      // autoplay blocked, missing codec, or the file cannot be fetched
      video.addEventListener('error', function () {
        loader.classList.add('is-fallback');
        window.setTimeout(release, 1400);
      });

      var playAttempt = video.play();
      if (playAttempt && typeof playAttempt.catch === 'function') {
        playAttempt.catch(function () {
          loader.classList.add('is-fallback');
          window.setTimeout(release, 1600);
        });
      }
    } else {
      window.setTimeout(release, 1200);
    }

    // hard ceiling
    window.setTimeout(release, MAX_WAIT);

    // let people out early
    window.setTimeout(function () {
      if (!released) skipBtn.classList.add('is-shown');
    }, 1100);

    skipBtn.addEventListener('click', release);
    loader.addEventListener('click', release);
    doc.addEventListener('keydown', function (e) {
      if (!released && (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) release();
    });
  }

  if (!loader) {
    // pages other than the home page carry no intro
    body.classList.add('is-live');
  } else if (arriving) {
    // arrived through the menu: the curtain already covered the change
    release();
  } else if (reduce || seen) {
    release();
  } else if (doc.hidden) {
    // opened in a background tab — don't play the intro to an empty room
    doc.addEventListener('visibilitychange', function once() {
      doc.removeEventListener('visibilitychange', once);
      start();
    });
  } else {
    start();
  }

  /* ---------------------------------------------------------
     2. LOCAL CLOCK
     --------------------------------------------------------- */
  var clock = doc.getElementById('clock');
  if (clock) {
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    var tick = function () {
      var d = new Date();
      clock.textContent = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
      clock.setAttribute('datetime', d.toISOString());
    };
    tick();
    window.setInterval(tick, 1000);
  }

  /* ---------------------------------------------------------
     3. POINTER PARALLAX  —  photograph drifts behind the grid
     --------------------------------------------------------- */
  var plate = doc.querySelector('.stage__img');
  var fine  = window.matchMedia('(hover:hover) and (pointer:fine)').matches;

  if (plate && fine && !reduce) {
    var tx = 0, ty = 0, cx = 0, cy = 0, raf = null;

    window.addEventListener('pointermove', function (e) {
      tx = (e.clientX / window.innerWidth  - 0.5) * -18;
      ty = (e.clientY / window.innerHeight - 0.5) * -12;
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });

    function loop() {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      plate.style.setProperty('translate', cx.toFixed(2) + 'px ' + cy.toFixed(2) + 'px');
      raf = (Math.abs(tx - cx) > 0.1 || Math.abs(ty - cy) > 0.1)
        ? requestAnimationFrame(loop)
        : null;
    }
  }

  /* ---------------------------------------------------------
     4. NAV OVERLAY
     The rail control is the only toggle: it morphs into the close X
     in place, so the way out sits where the way in was.
     --------------------------------------------------------- */
  var nav     = doc.getElementById('nav');
  var menuBtn = doc.getElementById('menuBtn');

  function setNav(open) {
    nav.classList.toggle('is-open', open);
    body.classList.toggle('nav-open', open);
    nav.setAttribute('aria-hidden', String(!open));
    menuBtn.classList.toggle('is-active', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  if (nav && menuBtn) {
    menuBtn.addEventListener('click', function () {
      setNav(!nav.classList.contains('is-open'));
    });

    // the empty area of the overlay closes it too
    nav.addEventListener('click', function (e) {
      if (!e.target.closest('a')) setNav(false);
    });

    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) {
        setNav(false);
        menuBtn.focus();
      }
    });

    /* A menu link leads to a real page: the panels are already covering
       the screen, so clear the words and navigate while they hold. The
       next page picks the same panels up and sweeps them away. */
    nav.addEventListener('click', function (e) {
      var a = e.target.closest('.nav__list a');
      if (!a) return;

      var href = a.getAttribute('href') || '';
      if (!href || href.charAt(0) === '#' || a.hasAttribute('target')) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;   // let it open elsewhere

      e.preventDefault();

      /* The panels are already up, so retracting them would only show the
         page being left. Instead the columns come down over the menu in ink
         — the one colour that reads against it — and the next page picks
         them up in the same ink and takes them away. */
      try { sessionStorage.setItem('fg:xfade', 'ink'); } catch (err) {}

      nav.classList.add('is-leaving');
      body.classList.add('is-leaving');

      if (curtain && !reduce) {
        var hold = sweep('ink');
        window.setTimeout(function () { window.location.href = href; }, hold);
      } else {
        window.setTimeout(function () { window.location.href = href; }, 320);
      }
    });

    setNav(false);
  }

})();
