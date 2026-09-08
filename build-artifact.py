"""Flatten a page into one self-contained file for publishing as an Artifact."""
import base64, os, re, sys

HERO_URL = "https://claude.ai/code/artifact/010042ad-c8ce-4f56-bcfc-c5470d49e5b9"

def b64(p):
    return base64.b64encode(open(p, "rb").read()).decode("ascii")

def inline_assets(text):
    for name, mime in sorted([("hero-bg.jpg","image/jpeg"), ("work-vellor.jpg","image/jpeg"),
                       ("work-pletho.jpg","image/jpeg"), ("work-nordarch.jpg","image/jpeg"),
                       ("work-vellor-blur.jpg","image/jpeg"), ("work-pletho-blur.jpg","image/jpeg"),
                       ("work-nordarch-blur.jpg","image/jpeg"),
                       ("work-vellor-m.jpg","image/jpeg"), ("work-pletho-m.jpg","image/jpeg"),
                       ("work-nordarch-m.jpg","image/jpeg"),
                       ("loader.mp4","video/mp4"), ("logo-wordmark.svg","image/svg+xml"),
                       ("logo-mark-menu.svg","image/svg+xml"),
                       ("studio.jpg","image/jpeg"), ("director.jpg","image/jpeg")], key=lambda t: -len(t[0])):
        # ../assets first: the shorter form is a substring of it, and
        # replacing that one first would leave a stray ../ in front of
        # the data: URI
        for ref in ('../assets/%s' % name, 'assets/%s' % name):
            if ref in text:
                text = text.replace(ref, "data:%s;base64,%s" % (mime, b64("assets/" + name)))
    return text

def build(page, out, extra_css=(), extra_js=(), body_class=None, links=(),
          title="Flatgrid Studio", drop_hero_bg=False, scheme="dark", lenis=False,
          arrive=None):
    css = open("css/style.css", encoding="utf-8").read()
    for f in extra_css:
        css += "\n" + open(f, encoding="utf-8").read()
    if drop_hero_bg:
        # .stage__img never renders on this page; don't ship its photograph
        css = css.replace('url("../assets/hero-bg.jpg")', 'none')
    css = inline_assets(css)
    css = css.replace(":root{\n  /* brand */", ":root{\n  color-scheme:%s;\n\n  /* brand */" % scheme)
    css = css.replace("html.no-js .loader{display:none}", "")

    html = open(page, encoding="utf-8").read()
    body = html.split("<body", 1)[1].split(">", 1)[1].rsplit("</body>", 1)[0]
    body = inline_assets(body)
    body = re.sub(r'<script src="(?!https)[^"]+"></script>', "", body)
    for a, b in links:
        body = body.replace(a, b)

    js = open("js/main.js", encoding="utf-8").read()
    for f in extra_js:
        js += "\n" + open(f, encoding="utf-8").read()

    boot = "document.documentElement.className='js';"
    if arrive:
        # Each artifact is its own origin, so the sessionStorage handover the
        # real site uses cannot cross between them and the arrival sweep would
        # never play. The referrer can cross, and for a review build it says
        # enough: if you got here by clicking something, sweep.
        boot += ("if(document.referrer){var c=document.documentElement.classList;"
                 "c.add('is-arriving');%s}" %
                 ("" if arrive == "down" else "c.add('is-%s');" % arrive))
    if body_class:
        boot += ("(function(){var f=function(){document.body.classList.add('%s')};"
                 "document.body?f():document.addEventListener('DOMContentLoaded',f);})();" % body_class)

    lenis_tag = ('<script src="https://cdn.jsdelivr.net/npm/lenis@1.1.20/dist/lenis.min.js"></script>\n'
             if lenis else "")

    out_text = (
        "<title>%s</title>\n"
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?'
        'family=Roboto:wght@300;400;500;700&family=Inter:wght@300;400;500;600&display=swap">\n'
        "<style>\n%s\n</style>\n"
        "<script>%s</script>\n"
        "%s\n%s<script>\n%s\n</script>\n" % (title, css, boot, body, lenis_tag, js)
    )
    open(out, "w", encoding="utf-8").write(out_text)
    print("%-26s %.2f MB" % (out.split("/")[-1], len(out_text.encode("utf-8")) / 1024 / 1024))
    return out_text

if __name__ == "__main__":
    S = ("C:/Users/dtume/AppData/Local/Temp/claude/A--CLOUDE/"
         "6a63e8d8-9e88-4ee2-8d36-64cc2266ec17/scratchpad/")

    # Published artifacts, filled in as each one gets its URL. Every artifact
    # sits on its own origin, so relative hrefs have to be rewritten to these.
    URL = {
        "index": HERO_URL,
        "work":  "https://claude.ai/code/artifact/e64862eb-1d84-49f0-ac2e-989fcb83ece5",
        "project-vellor":   "https://claude.ai/code/artifact/bdff430f-f5a3-47c2-9f8b-64c45f2ab712",
        "project-pletho":   "https://claude.ai/code/artifact/42222b89-bbf4-4e46-93bb-e7660201f381",
        "project-nordarch": "https://claude.ai/code/artifact/6a084556-be00-4763-96c1-cf2350876854",
    }

    def cross(page):
        """href rewrites for one page: every other page it can reach."""
        out = []
        for key, url in URL.items():
            if url is None or key + ".html" == page:
                continue
            out.append(('href="%s.html"' % key, 'href="%s"' % url))
        # a link back to this same page becomes a no-op rather than a 404
        out.append(('href="%s"' % page, 'href="#"'))
        return out

    NAMES = {"vellor": "Vellor Residency", "pletho": "Pletho", "nordarch": "Nordarch"}
    for slug in ("vellor", "pletho", "nordarch"):
        page = "project-%s.html" % slug
        build(page, S + "flatgrid-%s.html" % slug,
              extra_css=["css/project.css"], extra_js=["js/project.js"],
              body_class="page-project", links=cross(page),
              title=NAMES[slug],
              drop_hero_bg=True, scheme="light dark", lenis=True)

    build("index.html", S + "flatgrid-hero.html",
          links=cross("index.html"), title="Flatgrid Studio", arrive="ink")

    build("work.html", S + "flatgrid-work.html",
          extra_css=["css/work.css"], extra_js=["js/work.js"],
          body_class="page-work", links=cross("work.html"),
          title="Flatgrid Studio Work", drop_hero_bg=True, lenis=True, arrive="ink")
