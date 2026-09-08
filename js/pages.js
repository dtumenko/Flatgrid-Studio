/* =============================================================
   FLATGRID STUDIO — services · contact · coming soon
   Smooth scrolling, reveals as each block arrives, and the contact
   form's submit.
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
      /* Either test is enough: the top has risen past nine tenths of the
         screen, or the block is wholly inside it — the second is what
         catches the last block, which the page can run out of height
         before it ever reaches the first. */
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

  if (lenis) { lenis.on('scroll', sweep); }
  else { window.addEventListener('scroll', sweep, { passive: true }); }
  window.addEventListener('resize', sweep, { passive: true });

  /* ---------------------------------------------------------
     3. THE CONTACT FORM
     The action is a placeholder until an endpoint is pasted in.
     Until then the form still works: it opens a message in the
     visitor's own mail client with everything already filled in,
     which is worse than a POST but far better than a dead button.
     --------------------------------------------------------- */
  var form = doc.getElementById('contactForm');

  if (form) {
    var note   = doc.getElementById('formNote');
    var button = form.querySelector('.form__send');
    var TO     = 'flatgrid.studio@gmail.com';

    function say(text, bad) {
      if (!note) return;
      note.textContent = text;
      note.classList.toggle('is-bad', !!bad);
      note.hidden = false;
    }

    function value(name) {
      var el = form.elements[name];
      return el ? String(el.value || '').trim() : '';
    }

    form.addEventListener('submit', function (e) {
      if (!form.checkValidity()) return;          // let the browser say so
      e.preventDefault();

      var action = form.getAttribute('action') || '';
      var body = [
        'Name: '    + value('name'),
        'Email: '   + value('email'),
        'Company: ' + (value('company') || '—'),
        'Project: ' + value('project'),
        '',
        value('message')
      ].join('\n');

      // no endpoint yet: hand it to the mail client instead
      if (action.indexOf('YOUR_FORM_ID') > -1 || !action) {
        window.location.href = 'mailto:' + TO
          + '?subject=' + encodeURIComponent('Project enquiry — ' + value('name'))
          + '&body='    + encodeURIComponent(body);
        say('Opening your mail app with this filled in. If nothing happens, write to '
            + TO + ' directly.');
        return;
      }

      if (button) { button.disabled = true; }
      say('Sending…');

      fetch(action, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form)
      }).then(function (res) {
        if (!res.ok) throw new Error(res.status);
        form.reset();
        say('Thank you — that has arrived. You will hear back within two working days.');
      }).catch(function () {
        say('That did not send. Please write to ' + TO + ' instead.', true);
      }).then(function () {
        if (button) { button.disabled = false; }
      });
    });
  }

  /* ---------------------------------------------------------
     4. LOCK SCROLL BEHIND THE MENU
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
