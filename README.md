# Flatgrid Studio — hero

Single-screen hero for the studio site. Static files, no build step.

```
index.html          hero
work.html           selected work
project-vellor.html    project-pletho.html     >  one page per project
project-nordarch.html  /
studio.html         about the studio, the process, the disciplines
director.html       the expanded creative director page
contact.html        the form
academy.html        templates.html      /  coming soon
css/style.css       shared: tokens, grid, chrome, menu page, curtain
css/work.css        work page only
css/project.css     project pages only
js/main.js          shared: loader, clock, parallax, menu, page transitions
js/work.js          work page: smooth scroll, reveals, thumbnail parallax
js/project.js       project pages: reveals, cover drift, chrome inversion
css/pages.css       studio, director, contact and the coming-soon pages
js/pages.js         those pages: reveals and the contact form
build-artifact.py   flattens a page into one self-contained file
build-demo.py       flattens the WHOLE site into one page — see Reviewing
.claude/launch.json dev server config for the preview pane
assets/
  loader.mp4          DRIBBBLE ANIMATION.mp4  — plays as the page-load animation
  hero-bg.jpg         background.jpg          — the desk photograph
  logo-wordmark.svg   Artboard 1 copy.svg     — stacked wordmark, viewBox tightened
  logo-mark.svg       Artboard 1 copy 4.svg   — F + dot brandmark
  favicon.svg         brandmark on a dark plate
  logo-wordmark.png / logo-mark.png           — raster fallbacks
```

Open `index.html`, or serve the folder:

```bash
npx serve . -l 5178
```

## Design notes

Built on the brand board and on the studio's own hero animation, balanced with the
two references: the Swiss grid discipline of *designcanada.com* and the dark,
technical, micro-typographic texture of *mattis.framer.website*.

**Grid.** Six equal columns with five hairline rules, exactly as in the studio's
own animation (measured at 1/6 divisions). Registration ticks mark where the head
rule crosses each column. The field drops to four columns under 900px and three
under 600px.

**Sequence.** The MP4 logo animation plays first; when it ends the curtain lifts
and the hero builds — rules draw downward, masthead and rail fade up, the three
headline lines rise out of their own masks in a stagger, and the photograph
resolves last.

**Disciplines.** Five even segments for five disciplines. `.services` is
`width: max-content`, so the block shrink-wraps the discipline line and the rule
above it measures exactly the same width — the two always agree, at any viewport
and however the line wraps. The travelling accent steps through the segments in
order.

**Type.** Neue Haas Grotesk Display for the headline, Roboto for everything small.
Both come from the brand board.

**CTA.** Fills the top-right cell of the grid outright — page edge on two sides,
the last column rule on the third, the head rule on the fourth. The head rule and
its last tick stop clear of it. On phones the label needs more room than one
column, so the block takes two.

**Alignment.** Everything in the statement — eyebrow, headline, disciplines, CTA
— starts flush on the first column rule, with no inset. Optical alignment comes
from the type's own side bearing.

**Loader plate.** The MP4's own ground is `#141414`; the page ink is `#141415`.
One value apart is enough to show a rectangle edge on a good display, so the
loader plate is set to `--ink-vid` and the video carries `mix-blend-mode:
lighten` — its ground can never be lighter than the plate, so it disappears,
while every glyph pixel is lighter and passes through untouched.

**Menu page.** Clean white takes the whole screen — light grid, black type,
brand orange on hover. It arrives as one panel per grid column sweeping in alternating
directions (odd from the top, even from the bottom), staggered left to right; it
leaves the same way in reverse. Panel count follows the column count at each
breakpoint.

**Persistent chrome.** The logo, the `||| Menu` control and the social icons live
outside `.hero`, so they ride above the overlay and invert when `body.nav-open`
is set — the rail survives the page change instead of being covered by it. The
logo holds both marks in one grid cell and cross-fades: the wordmark on the hero,
the brandmark (black F, orange circle — `assets/logo-mark-menu.svg`) on the menu
page. The control morphs into `✕ Close` in place; Escape and a click on empty
space also close.

The menu page is set in Neue Haas Grotesk Medium — declared as **`font-weight:
600`**, not 500. This family exposes Roman at 400 and 500 alike (both measure
identically), so `500` silently renders as Roman; Medium sits at 600 and Bold at
700. Change that one number to 700 for a heavier page.

Its line-height is 0.92 — the line box still sits inside the glyphs, which is what
gives the stack its density. Two
consequences are handled in CSS: descenders fall ~0.2em below the line box, so
each mask carries `padding-bottom: .26em` (cancelled by a matching negative
margin) to keep the rhythm; and because the mask is taller than the line, the
hide transform has to exceed mask ÷ line-height, hence `translateY(145%)`.

Size comes from `min(9vw, 14.3vh)` — six items at 0.8 leading are limited by
height, not width, so the vh term is usually the one that binds and the stack
fills ~98% of the space between the head rule and the footer at any window shape.

## Work page

Two columns of words against ink, four of photograph — the home page's
six-column field, carried across and drawn over the image. One project per
viewport; the photograph is pinned while a project's words scroll past it, then
resolves into the next.

The six-column field is drawn only where it doesn't cross a picture: rules 1 and
2 show, rules 3–5 are hidden behind the frame.

**The words** all hang off the first column rule: title, disciplines (16px, no
rules), description (12px), and a footer line carrying the year and the studio
credit in accent, spanning the same measure as the paragraph so the credit lands
on the paragraph's right edge. The block stops ~40px clear of the frame.

**The change between projects** is a directional wipe: the incoming frame clips
in from the edge the scroll came from — up from the bottom going forward, down
from the top going back — over the outgoing frame, which is held underneath
rather than faded. Its image settles from 1.11 to 1.04 scale on a longer curve,
so the frame arrives and lands.

**The pointer** is the affordance. Over the photograph the native cursor is
replaced by the words *View project* set in Neue Haas Regular, trailing the hand
with a light lerp. Mouse only; the static label is kept for keyboard focus.

**Two notes on the parallax**, both of which caused a visible snap:

1. `transform` carried the scroll shift *and* the hover scale, and it was
   transitioned — so every scroll-driven update eased over 1.1s. Split now:
   `translate` follows the scroll untransitioned, `scale` carries the hover.
   Never transition a property that scroll is driving.
2. `place()` measured only the *active* slide, so the instant the active project
   changed, the drift was computed from a different box and jumped. Each image
   now derives its shift from its own slide, which makes the value a continuous
   function of scroll for every frame independently. Fixing (1) alone made this
   one worse, because the transition had been smearing the jump into a drift.

If any residual drift is unwanted, `TRAVEL` in `js/work.js` is the dial — set it
to `0` to remove the effect entirely.

**Scrolling** uses Lenis (jsDelivr) to ease the native scroll position — wheel,
trackpad, keyboard and scrollbar all behave normally. Off on touch pointers and
under `prefers-reduced-motion`, where the layout stacks instead.

**Reveals** use IntersectionObserver with a manual sweep behind it (load, wake,
scroll, 1.5s timer). The sweep deliberately does *not* require a slide to still
be on screen — scroll past one fast and it must still reveal.

**Still to confirm:** the Pletho and Nordarch descriptions are drawn from the
studio's own artwork (poster copy, tube wordmark) and need sign-off plus a
second sentence about the brief. Project links are `#` until the case studies
exist.

Each item is marked by a rule at the left edge of the second column, aligned to
the cap line — sized in `em` of the heading so it tracks the type.

## Project pages

One file per project, reached from the photograph on the work page. Three parts:

**One left edge.** Everything on the page starts on the first grid rule —
`--edge`, at `calc(var(--col) * 1)`. That is the cover photograph, the plates,
the description, the project name and the outro. It also leaves the whole first
column free, so no photograph ever runs under the rail control.

**Cover** — the photograph alone at 90svh, from `--edge` to the right frame
edge, carrying no type at all. It drifts `--drift` (60px) as you scroll past it:
the image is built taller by exactly that much and `js/project.js` reads the same
value, so the two cannot fall out of step. Tune it in one place.

**Brief** — white ground, the six columns drawn on it, and three rows:

1. the project name, rising out of its own mask, with its line beneath it;
2. the description on columns 2–4 and the specification on 5–6, both set from
   the **bottom**, so the last line of the description lands on the last rule of
   the specification;
3. the way back, under that rule and clear of it — ink, underlined, right.

The specification is discipline, timeline, client, year, each row cut by a
hairline, the year in orange. The disciplines run on one line, split by the same
slash the home page uses; where the column is too narrow to hold the label and
the value side by side, the whole value drops onto its own line rather than
breaking mid-phrase. Add or remove a row by adding or removing one
`.spec__row`.

**Plates and chapters** — a single stack, all plates cut to one proportion so
every file can be optimised the same way:

```
2000 x 1250   (8:5)
```

A plate takes whatever you put in it:

```html
<figure class="plate up"><img src="assets/vellor-02.jpg" alt="..." width="2000" height="1250"></figure>
<figure class="plate up"><img src="assets/vellor-03.gif" alt="..." width="2000" height="1250"></figure>
<figure class="plate up"><video src="assets/vellor-04.mp4" autoplay muted loop playsinline></video></figure>
```

An empty slot states what it is waiting for. Replace the whole `<figure>` when
the file arrives:

```html
<figure class="plate plate--empty up" data-slot="Image 02 &middot; 2000 &times; 1250"></figure>
```

Text goes **between** plates, anywhere in the stack, as many times as the work
needs. The label sits on the second column, on the same rule as everything else;
the writing is indented one rule further, to the third:

```html
<section class="chapter">
  <p class="chapter__label up">The problem</p>
  <div class="chapter__body">
    <h2 class="chapter__head up">One sentence that states it.</h2>
    <p class="chapter__text up d1">The paragraph.</p>
  </div>
</section>
```

Drop the `<h2>` and add `chapter--plain` to the section for a single larger
paragraph with no heading. Every block carries `up` — that is what fades and
lifts it into place; leave it off and the block is simply always there.

**Back to projects** sits under the specification in Neue Haas regular, ink and
underlined, and again at the foot of the page next to the next project.

**Chrome over paper.** The wordmark and the rail are fixed, so they cross from the
ink cover onto white and back onto the ink footer. Each is tested against its own
position rather than a single page-wide flag — the rail sits at the middle of the
screen and the wordmark at the top, and they do not cross the boundary at the same
moment. Over paper the wordmark swaps to the brandmark, the same swap the menu
page uses. See `tone()` in `js/project.js`.

### Adding a project

1. Copy `project-vellor.html` to `project-<slug>.html`.
2. Change the title, description and og: tags in `<head>`, the cover image and
   its alt text, the name and the line under it, the brief and the spec rows.
3. Set the plates and chapters.
4. Point the footer's next-project link at the following project.
5. In `work.html`, add the slide, the `.shot` figure with `data-href`, and the
   `.slide__go` link that carries the narrow-screen way in.

## Studio, contact, coming soon

Three shapes on the one frame, all in `css/pages.css`. Everything starts on the
first grid rule (`--edge`), which is also what keeps the rail control clear.

**Studio** is the about page, and it carries the disciplines rather than giving
them a page of their own. The two brand lines sit on columns 4 and 5, the studio
plate runs across columns 2–5 at the site's 8:5 proportion with its caption
inside the foot, and column 6 holds two `cta-line` blocks — founder and
designer, and book a call. Beneath that, four `mag` blocks on columns 2–5 with the facts
alongside on 6, then the four-step approach, then the disciplines compact: name
on columns 2–3, description on 4–5.

The plate is the *studio*, not a portrait — the person is a way out from it
rather than the subject of it.

**The creative director page** (`director.html`) is the expanded version, set the
way the Design Canada designer pages are: the name at full size crossing the
portrait, then the location, the facts and the reading matter on columns 4, 5 and
6. `View more` on the studio portrait is the way in.

`.mag` is the shared magazine setting — an 18px label over 12.5px text on a
narrow measure. It is what makes a dark page read as a spread rather than a
screen, and it is worth keeping the measure narrow: the setting stops working the
moment the lines get long.

The disciplines still carry the site's SEO weight — the `<h3>` names, the copy
itself, and `ProfessionalService` JSON-LD on `studio.html` listing all five
separately, since UI/UX and web development are merged only in presentation.

**Contact** puts the details on columns 2–3 and the form on 4–6, with the guides
for columns 4, 5 and 6 switched off so nothing rules through the fields. Fields are
underline-only, orange on focus, red underline once a value is present and
invalid — never before someone has typed.

`.page-dark` is the shared ink ground — services and both coming-soon pages use
it; `.page-sheet` is the white one. The menu carries five items since services folded into studio, and
`.nav__list li` is sized to fill the page at that count — `min(9.6vw, 16.2vh)`.
Change the count and that number has to move with it.

**Coming soon** is the same frame on ink: the title held across four columns, the
status table on the left two, the note and the notify link on the right three.
`academy.html` and `templates.html` are the same page with different words.

### Making the contact form send

It posts nowhere yet. Until it does, `js/pages.js` catches the submit and opens
the visitor's own mail client with every field already filled in — worse than a
POST, far better than a dead button.

1. Make a form at **formspree.io** (free tier is 50 submissions a month).
2. Copy the endpoint it gives you, e.g. `https://formspree.io/f/xayzbwqr`.
3. Paste it over `YOUR_FORM_ID` in the `action` of `#contactForm` in
   `contact.html`.

Nothing else changes: the script sees a real endpoint, POSTs it with `fetch`,
and swaps the button for a thank-you. **Netlify Forms** is the alternative if you
host there — add `netlify` and `name="contact"` to the `<form>` and delete the
action.

## Page transition

Leaving through the menu, the panels are already covering the screen, so nothing
new has to animate: the words clear, a `sessionStorage` flag is set, and the
browser navigates 320ms later while the panels hold. The arriving page's boot
script reads that flag in `<head>` and stamps `html.is-arriving`, which makes an
identical set of panels visible before anything else paints. `main.js` then
commits that covering state with a forced reflow and releases it in the same
tick, so they retract to the edges each came from. Two loads, one sweep.

The release deliberately does **not** wait on `requestAnimationFrame` — rAF is
throttled whenever the page isn't painting, and a curtain that never lifts would
leave the screen blank. Anything that must become visible has to be driven
synchronously.

Every other internal link has no panels up yet, so it closes the same ones over
the page first and navigates while they hold, and the next page picks the move up
and retracts them. There are two directions, and a link says which it wants:

| | Columns | Out | In | Used by |
|---|---|---|---|---|
| **down** (default) | drop from top and bottom, alternating, white | 460ms, 28ms apart | 620ms, 45ms apart | the wordmark, back to projects, the next project |
| **ink** | as **down**, but the columns are ink | 460ms | 620ms | a menu link |
| **none** (`data-xfade="none"`) | — | — | — | the photograph on the work page |

`data-xfade="none"` opts a link out altogether: no `preventDefault`, no flag, no
columns at either end. It navigates the ordinary way. Opening a project is meant
to be immediate — you have already chosen it, and a sweep only delays the thing
you asked for.

The menu is the one case where the panels are already covering the screen, so
there is nothing left to reveal and retracting them would only show the page
being left. The columns come down over the menu in ink instead — the one colour
that reads against it — and the next page picks them up in the same ink and
takes them away off a photograph. That is why leaving through the menu has a
sweep of its own rather than only an arrival.

Set the exception per link:

```html
<a href="project-vellor.html" data-xfade="none">…</a>
```

The mode travels with the flag — `sessionStorage['fg:xfade']` holds `1` or
`ink`, and the arriving page's boot script stamps `is-arriving` and, for the
second, `is-ink`. A link that opts out sets no flag at all, so the page it opens
has nothing to pick up.

**The open state has to be committed before the sweep, with transitions off.**
This is the one thing in the whole file that will silently undo itself if it is
touched. The panels *rest* covering the screen, because that is what an arrival
needs. A departure needs them open first — but `transition` is already declared
on them, so adding `is-leaving` starts them easing *towards* open, and the
`is-in` a moment later merely retargets a transition already in flight. Start and
end land on the same value, the browser generates **no transition at all**, and
every page change reads as an instant cut. The classes all look right while this
is happening, which is what makes it so easy to miss.

So `sweep()` adds `.is-set` (`transition:none!important`), applies `is-leaving`
and the direction, forces a reflow, removes `.is-set`, forces another, and only
then adds `is-in`. Check it with `document.getAnimations()` rather than by eye —
a throttled or unfocused tab will not paint the sweep, but the animation object
is there either way:

```js
document.getAnimations().filter(a => a.effect.target === document.querySelector('#curtain i'))
// [] means no transition was generated — the bug is back
```

Off-site links, `mailto:`, in-page anchors and anything opened in a new tab are
left alone, and the whole path is skipped under `prefers-reduced-motion`. A page
restored from the back/forward cache clears the panels on `pageshow` — but only
clears `is-ink` when no arrival is under way, because `pageshow` fires on the
first load too and would otherwise cancel the sweep the boot script just asked
for.

**The intro plays once, on arriving at the site.** It is skipped whenever either
of two independent checks says the visitor is already here:

- `document.referrer` is on this host — they followed a link from another page
  of the site. This is the one that matters for the wordmark, and it needs no
  storage at all;
- `sessionStorage['fg:intro']` is set, which `main.js` marks on *every* page
  load rather than only when the animation runs.

Either alone is enough. Both are used because `sessionStorage` throws or is
isolated on `file://` and in some private modes, and some browsers strip the
referrer — so a single check can miss, and the animation would play again on the
way back to the home page. Set `ONCE_PER_SESSION = false` in `js/main.js` to have
it play on every load again.

*This is the one thing that cannot be judged from the published artifacts, or by
opening the files straight off disk: each artifact is its own origin, so nothing
carries between them, and `file://` has neither storage nor a referrer. Serve the
folder and click through it.*

**A link with a scheme still gets the sweep.** `mailto:` and `tel:` are turned
away because they are not page loads, but `http(s)` links are not — anything
meant to open elsewhere already carries `target="_blank"` and is turned away on
that. This matters more than it looks: `build-artifact.py` rewrites every
internal link to an absolute URL, so a handler that skipped anything with a
scheme left the review builds with no transition at all, on any link.

A page reached through the menu skips the intro outright: the curtain already
covered the change.

*Published artifacts each get their own origin, so `sessionStorage` doesn't carry
between them — the leave sweep plays but the arrival sweep can't. On the real
site, where both pages share an origin, it works end to end.*

## Reviewing

A published artifact runs inside a sandboxed frame, and a link from one artifact
to another is navigated by the host — it replaces the page before a single frame
of a transition can render. So the page transitions cannot be judged from a set
of separate artifact links, however correct the code is.

`build-demo.py` gets around it by putting every page in one document and swapping
them in place: same curtain, same classes, same timings, nothing navigates.

```bash
python build-demo.py     # writes one self-contained page
```

Or serve the real thing, which is always the last word:

```bash
npx serve . -l 5178
```

## Booking link — the one thing still to do

The CTA and the menu footer currently point at `mailto:flatgrid.studio@gmail.com`.
That works, but it puts a step between the visitor and the booking. To let people
book themselves, with a Google Meet link created automatically:

1. Google Calendar → **Create** → **Appointment schedule**.
2. Set the duration (30 min), your available hours, and a buffer between calls.
3. Under the event settings set **Add Google Meet video conferencing** — this is
   the step that generates a Meet link for each booking.
4. Under the booking form, ask for name, email and a project note.
5. **Share** → copy the public link. It looks like
   `https://calendar.app.google/XXXXXXXXXX`.
6. In `index.html`, replace the `.cta` href with that link and add
   `target="_blank" rel="noopener noreferrer"`.

Free personal Gmail accounts get one appointment schedule; Workspace accounts get
several. If the option is missing from your Calendar, **Cal.com** on its free plan
does the same job — it connects to Google Calendar and creates the Meet links —
and gives you a link to drop into the same place.

## Still to sign off

- **Pletho and Nordarch descriptions.** The one-liners on the work page are
  yours; everything under *The problem* and *The approach* on all three project
  pages is a **draft I wrote** from the artwork, not from the brief. Read it as a
  starting point and replace what is wrong.
- **Timelines.** `10 weeks` / `8 weeks` / `12 weeks` in the spec blocks are
  placeholders.
- **Client names.** The Client row currently repeats the project's own name.
  Swap in the real commissioning entity where there is one.
- **The plates.** Four empty slots per project, waiting on 2000 x 1250 files.
- **The booking link.** See below.
- **The contact form endpoint.** See *Making the contact form send*.
- **The director page prose is still a draft I wrote** — the bio and the notable
  work. The studio page is now the studio's own words throughout: the four
  principles (Discipline first, Real creativity, Built to last, True
  partnership) and the four approach steps (Research, Direction, Design,
  Longevity). The facts taken from your
  own mockup — Belgrade, Tuzla, Creative Director — are yours; the rest is not.
- **Book a call** points at the contact form. Point it at the booking link
  instead once that exists — see below.
- **One plate left.** `studio.html` wants a studio photograph at 2000 × 1250;
  the director portrait is in.
- **A Neue Haas Grotesk webfont licence** before this goes live.

## Tuning

| What | Where |
|---|---|
| Headline weight | `.headline { font-weight }` — 500 now; 400 matches the original animation, 700 pushes toward Design Canada |
| Photograph darkness | `.stage__img { filter: brightness() }` |
| Grain | `.stage__grain { opacity }` |
| Hairline strength | `--line` / `--line-2` |
| Reveal timing | the `--delay` values inline in `index.html`, plus the `riseLine` delays in `style.css` |
| Headline rise | `@keyframes riseLine` and the `.headline__line:nth-child()` delays |
| Menu sweep speed | `.nav__panels i { transition }` and the `45ms` stagger step |
| Menu type size | `.nav__list li { font-size }` |
| Project data | the `.project` blocks in `work.html` — name, tags, year |
| Thumbnail dimming | `.project__media img { filter }` |
| Scroll smoothing | `duration` in the Lenis options in `js/work.js` |
| Parallax travel | `TRAVEL` in `js/work.js` |
| Menu item marker | `.nav__dash { width, height, margin-top }` — all in `em` of the heading |
| Loader on every load | `ONCE_PER_SESSION` in `js/main.js` — `true` (the default) plays it once per visit; `false` plays it on every load |
| Loader mark size | `.loader__video { width }` — 50% desktop, 72% tablet, 88% phone |
| CTA copy | `.cta__title` in `index.html` |
| CTA size | `.cta { width, height }` — height tracks the head rule |
| Plate proportion | `--plate` in `css/project.css` |
| Air between plates | `--stack` in `css/project.css` — set `0` to butt them |
| Air around a chapter | `--bay` in `css/project.css` |
| Cover height | `.cover{height:90svh}` |
| Left edge of everything | `--edge` in `css/project.css` — also what keeps the rail control clear |
| Which links sweep | `data-xfade="none"` opts one out; timings in `LEAVE` in `js/main.js` |
| Cover drift | `--drift` in `css/project.css` — `0` turns it off; `js/project.js` reads it |

## Fonts

Neue Haas Grotesk Display Pro is installed on this machine, so it renders natively
here. It is a licensed Monotype face — **a webfont licence is required before this
goes live**. Until then the stack falls back to Inter (loaded from Google Fonts),
which is metrically close. Roboto also loads from Google Fonts.

## Support

Grid, flexbox, `clip-path`, CSS custom properties, `100svh`. Degrades cleanly:
without JS the loader is skipped and everything renders in place; with
`prefers-reduced-motion` the loader is skipped and all motion is disabled.
