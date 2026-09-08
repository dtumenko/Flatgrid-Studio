# -*- coding: utf-8 -*-
"""Build ONE self-contained page holding the whole site, for review.

A published artifact runs inside a sandboxed frame, and a link from one
artifact to another is navigated by the host: it replaces the page before a
single frame of a page transition can render. There is no way to show the
sweeps across two artifacts.

So this build puts the pages in one document and swaps them in place. Nothing
navigates, the curtain is the same curtain with the same classes, and the
transitions are the real ones. The site itself is untouched — this is a review
vehicle, not a second codebase.
"""
import base64, re, io, os

ROOT = "."


def b64(p):
    return base64.b64encode(open(p, "rb").read()).decode("ascii")


ASSETS = [("hero-bg.jpg", "image/jpeg"), ("work-vellor.jpg", "image/jpeg"),
          ("work-pletho.jpg", "image/jpeg"), ("work-nordarch.jpg", "image/jpeg"),
          ("work-vellor-m.jpg", "image/jpeg"), ("work-pletho-m.jpg", "image/jpeg"),
          ("work-nordarch-m.jpg", "image/jpeg"),
          ("loader.mp4", "video/mp4"), ("logo-wordmark.svg", "image/svg+xml"),
          ("logo-mark-menu.svg", "image/svg+xml"),
          ("studio.jpg", "image/jpeg"), ("director.jpg", "image/jpeg")]


def inline_assets(text):
    for name, mime in sorted(ASSETS, key=lambda t: -len(t[0])):
        if not os.path.exists("assets/" + name):
            continue                      # not delivered yet
        uri = "data:%s;base64,%s" % (mime, b64("assets/" + name))
        for ref in ("../assets/%s" % name, "assets/%s" % name):
            if ref in text:
                text = text.replace(ref, uri)
    return text


def body_of(path):
    html = io.open(path, encoding="utf-8").read()
    body = html.split("<body", 1)[1].split(">", 1)[1].rsplit("</body>", 1)[0]
    return re.sub(r'<script src="(?!https)[^"]+"></script>', "", body)


def cut(body, pattern):
    """Lift one block out of a page body and hand it back separately."""
    m = re.search(pattern, body, re.S)
    if not m:
        return body, ""
    return body[:m.start()] + body[m.end():], m.group(0)


# ---------------------------------------------------------------- the pages
PAGES = [("index", "index.html"), ("work", "work.html"),
         ("vellor", "project-vellor.html"), ("studio", "studio.html"),
         ("director", "director.html"), ("contact", "contact.html"),
         ("academy", "academy.html"), ("templates", "templates.html")]

bodies = dict((name, body_of(f)) for name, f in PAGES)

# The chrome belongs to the document, not to any one page. Take one copy of
# each from the pages that have the fullest version and drop the rest.
CHROME = [
    (r'<div class="curtain".*?</div>', 'curtain'),
    (r'<a class="logo[^"]*"[^>]*>.*?</a>', 'logo'),
    (r'<button class="menu[^"]*"[^>]*>.*?</button>', 'menu'),
    (r'<nav class="nav".*?</nav>', 'nav'),
]

# Every page carries its own copy; the work page's is the one kept, because
# the home page's wordmark points at "/" and wears the intro's reveal classes.
kept = {}
for pat, name in CHROME:
    bodies['work'], kept[name] = cut(bodies['work'], pat)
    for key in bodies:
        if key != 'work':
            bodies[key], _ = cut(bodies[key], pat)

bodies['index'], kept['social'] = cut(bodies['index'], r'<ul class="social">.*?</ul>')
bodies['work'], kept['cursor'] = cut(bodies['work'], r'<div class="cursor".*?</div>')

VIEWS = [(name, bodies[name]) for name, _ in PAGES]

# ---------------------------------------------------------------- the styles
css = "\n".join(io.open("css/%s" % f, encoding="utf-8").read()
                for f in ("style.css", "work.css", "project.css", "pages.css"))
css = css.replace("html.no-js .loader{display:none}", "")
css = css.replace(":root{\n  /* brand */", ":root{\n  color-scheme:light dark;\n\n  /* brand */")

css += """

/* =============================================================
   REVIEW SHELL
   One page at a time. Only the visible one is laid out, so the
   scripts that measure things see nothing they should not.
   ============================================================= */
.view{display:none}
.view.is-on{display:block}
/* the social rail belongs to the home page only */
body.page-work .social,
body.page-project .social{display:none}
"""

css = inline_assets(css)

# ---------------------------------------------------------------- the scripts
js_main = io.open("js/main.js", encoding="utf-8").read()
js_work = io.open("js/work.js", encoding="utf-8").read()
js_proj = io.open("js/project.js", encoding="utf-8").read()
js_pages = io.open("js/pages.js", encoding="utf-8").read()

ROUTER = r"""
/* =============================================================
   REVIEW ROUTER
   Swaps the page under the curtain instead of navigating, using the
   same classes and the same timings as the real site. Runs in the
   capture phase so it takes the click before the site's own leave
   handler, which would otherwise try to navigate.
   ============================================================= */
(function () {
  'use strict';

  var doc = document, html = doc.documentElement, body = doc.body;
  var curtain = doc.getElementById('curtain');
  var nav = doc.getElementById('nav');
  var menuBtn = doc.getElementById('menuBtn');

  var views = {};
  Array.prototype.forEach.call(doc.querySelectorAll('.view'), function (v) {
    views[v.getAttribute('data-view')] = v;
  });

  var ROUTE = {
    'index.html': 'index',
    'work.html': 'work',
    'project-vellor.html': 'vellor',
    'studio.html': 'studio',
    'director.html': 'director',
    'contact.html': 'contact',
    'academy.html': 'academy',
    'templates.html': 'templates'
  };
  var BODY = {
    index: '', work: 'page-work', vellor: 'page-project',
    studio: 'page-dark page-studio', director: 'page-dark page-who',
    contact: 'page-sheet page-contact',
    academy: 'page-dark page-soon', templates: 'page-dark page-soon'
  };
  var HOLD = { '1': 560, ink: 560 };

  var busy = false;

  function show(name) {
    for (var k in views) views[k].classList.toggle('is-on', k === name);

    var live = body.classList.contains('is-live') ? ' is-live' : '';
    body.className = BODY[name] + live;

    if (nav) nav.classList.remove('is-open', 'is-leaving');
    if (nav) nav.setAttribute('aria-hidden', 'true');
    if (menuBtn) {
      menuBtn.classList.remove('is-active');
      menuBtn.setAttribute('aria-expanded', 'false');
    }
    window.scrollTo(0, 0);
    // let anything watching the scroll re-measure against the new page
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('scroll'));
  }

  /* The open state is committed with transitions off before the sweep is
     asked for — otherwise the panels ease towards open and the sweep has no
     distance left to travel. Same reason as sweep() in main.js. */
  function set(fn) {
    curtain.classList.add('is-set');
    fn();
    void curtain.offsetHeight;
    curtain.classList.remove('is-set');
    void curtain.offsetHeight;
  }

  function go(name, mode) {
    if (busy) return;
    busy = true;

    set(function () {
      html.classList.add('is-leaving');
      if (mode !== '1') html.classList.add('is-' + mode);
    });
    curtain.classList.add('is-in');                 // columns close

    window.setTimeout(function () {
      show(name);

      set(function () {                             // hand over to the arrival
        html.classList.remove('is-leaving');
        html.classList.add('is-arriving');
        curtain.classList.remove('is-in');
      });
      curtain.classList.add('is-out');              // columns leave

      window.setTimeout(function () {
        html.classList.remove('is-arriving', 'is-ink');
        curtain.classList.remove('is-out');
        busy = false;
      }, 1100);
    }, HOLD[mode] || HOLD['1']);
  }

  doc.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;

    var href = (a.getAttribute('href') || '').split('/').pop();
    if (!ROUTE[href]) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();                            // the site's handler stays out

    /* the photographs opt out of the columns entirely — opening a project
       is meant to be immediate */
    if (a.getAttribute('data-xfade') === 'none') {
      show(ROUTE[href]);
      return;
    }
    go(ROUTE[href], a.closest('.nav') ? 'ink' : '1');
  }, true);

  show('index');
})();
"""

boot = ("document.documentElement.className='js';"
        "(function(){var f=function(){document.body.classList.add('is-demo')};"
        "document.body?f():document.addEventListener('DOMContentLoaded',f);})();")

parts = []
for name, markup in VIEWS:
    parts.append('<div class="view" data-view="%s">\n%s\n</div>' % (name, markup))

page = (
    "<title>Flatgrid Walkthrough</title>\n"
    '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
    'family=Roboto:wght@300;400;500;700&family=Inter:wght@300;400;500;600&display=swap">\n'
    "<style>\n%s\n</style>\n"
    "<script>%s</script>\n"
    "%s\n%s\n%s\n%s\n"
    "%s\n"
    '<script src="https://cdn.jsdelivr.net/npm/lenis@1.1.20/dist/lenis.min.js"></script>\n'
    "<script>\n%s\n</script>\n"
    "<script>\n%s\n</script>\n"
    "<script>window.Lenis=null;</script>\n"    "<script>\n%s\n</script>\n"      # one smooth-scroll instance is enough
    "<script>\n%s\n</script>\n"
    "<script>\n%s\n</script>\n"
) % (css, boot,
     inline_assets(kept['curtain']), inline_assets(kept['logo']),
     inline_assets(kept['menu']), inline_assets(kept['nav']),
     inline_assets(kept['social']) + "\n" + inline_assets(kept['cursor']) + "\n"
     + inline_assets("\n".join(parts)),
     js_main, js_work, js_pages, js_proj, ROUTER)

out = ("C:/Users/dtume/AppData/Local/Temp/claude/A--CLOUDE/"
       "6a63e8d8-9e88-4ee2-8d36-64cc2266ec17/scratchpad/flatgrid-site.html")
io.open(out, "w", encoding="utf-8", newline="\n").write(page)
print("%-24s %.2f MB" % ("flatgrid-site.html", len(page.encode("utf-8")) / 1024 / 1024))
for k in kept:
    print("   chrome kept: %-8s %d chars" % (k, len(kept[k])))
