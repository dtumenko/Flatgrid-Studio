#!/usr/bin/env node
// Generise project-<slug>.html za svaki projekat iz content/work/*.md i
// ponovo ispisuje work.html (reel sa svim Live projektima) i sitemap.xml.
//
// Ostale stranice — index.html, studio.html, director.html, contact.html,
// academy.html, templates.html — ovaj skript NIKAD ne dira. One su rucno
// pisane i takve ostaju.
//
// Pokretanje: npm run build
//
// Vazno: work.html i project-*.html su GENERISANI fajlovi. Ako ih neko
// izmeni rukom, sledeci build ce te izmene pregaziti. Izmene idu ili u
// /admin (panel) ili u templates/*.html (izgled stranice).

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const ROOT = path.resolve(import.meta.dirname, "..");
const CONTENT_DIR = path.join(ROOT, "content/work");
const SITE_URL = "https://flatgrid.studio";

/* --------------------------------------------------------------- helpers */

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function isVideo(src) {
  return /\.(mp4|webm|mov|m4v)$/i.test(String(src || ""));
}

function list(value) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
}

// Prazan red deli pasuse — isto pravilo koje panel pokazuje u polju za tekst.
function paragraphs(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/* ---------------------------------------------------------------- ucitaj */

function loadProjects() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const { data } = matter(fs.readFileSync(path.join(CONTENT_DIR, f), "utf8"));
      return data;
    })
    .filter((p) => p && p.slug)
    .sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));
}

/* ------------------------------------------------------------- project.html */

// Ploca (plate) prima sta god se u nju stavi: fotografiju, GIF ili video.
// Prazan slot ispisuje sta ceka. Poglavlje (chapter) je tekst izmedju ploca.
function renderBlocks(blocks, coverSrc) {
  return list(blocks)
    .map((block, index) => {
      if (block.type === "empty") {
        const label = block.label || `Image ${String(index + 1).padStart(2, "0")}`;
        return `      <figure class="plate plate--empty up" data-slot="${esc(label)} &middot; 2000 &times; 1250"></figure>`;
      }

      if (block.type === "chapter") {
        const body = paragraphs(block.text)
          .map((p) => `          <p class="chapter__text up d1">${esc(p)}</p>`)
          .join("\n");
        const head = block.head
          ? `          <h2 class="chapter__head up">${esc(block.head)}</h2>\n`
          : "";
        // Bez naslova poglavlje ide u jedan veci pasus — zato chapter--plain.
        const plain = block.head ? "" : " chapter--plain";
        return `      <section class="chapter${plain}">
        <p class="chapter__label up">${esc(block.label || "")}</p>
        <div class="chapter__body">
${head}${body}
        </div>
      </section>`;
      }

      // plate
      const src = block.src || "";
      if (!src) return "";
      // Prva ploca se ucitava odmah kad je ista slika kao naslovna — vec je
      // u kesu iz <link rel=preload>, pa lazy ucitavanje tu nista ne stedi.
      const eager = index === 0 && src === coverSrc;
      if (isVideo(src)) {
        return `      <figure class="plate up">
        <video src="${esc(src)}" autoplay muted loop playsinline></video>
      </figure>`;
      }
      return `      <figure class="plate up">
        <img src="${esc(src)}" alt="${esc(block.alt || "")}" width="2000" height="1250"
             loading="${eager ? "eager" : "lazy"}" decoding="async"${eager ? ' fetchpriority="high"' : ""}>
      </figure>`;
    })
    .filter(Boolean)
    .join("\n");
}

function renderDisciplines(disciplines) {
  return list(disciplines)
    .map(esc)
    .join(' <span class="spec__slash">/</span> ');
}

function buildProjectPage(project, next, template) {
  const cover = project.cover || "";
  return template
    .replace(/\{\{TITLE\}\}/g, esc(project.title))
    .replace(/\{\{SLUG\}\}/g, esc(project.slug))
    .replace(/\{\{DESCRIPTION\}\}/g, esc(project.meta_description || project.summary || ""))
    .replace(/\{\{COVER_ALT\}\}/g, esc(project.cover_alt || project.title))
    .replace(/\{\{COVER\}\}/g, esc(cover))
    .replace(/\{\{LINE\}\}/g, esc(project.line || ""))
    .replace(/\{\{LEAD\}\}/g, esc(project.lead || project.summary || ""))
    .replace(/\{\{DISCIPLINES\}\}/g, renderDisciplines(project.disciplines))
    .replace(/\{\{TIMELINE\}\}/g, esc(project.timeline || "—"))
    .replace(/\{\{CLIENT\}\}/g, esc(project.client || project.title))
    .replace(/\{\{YEAR\}\}/g, esc(project.year || ""))
    .replace(/\{\{ROBOTS\}\}/g, project.noindex ? '<meta name="robots" content="noindex, nofollow">\n' : "")
    .replace("{{BLOCKS}}", renderBlocks(project.blocks, cover))
    .replace(/\{\{NEXT_SLUG\}\}/g, esc(next.slug))
    .replace(/\{\{NEXT_TITLE\}\}/g, esc(next.title));
}

/* ---------------------------------------------------------------- work.html */

const ARROW =
  '<svg viewBox="0 0 20 20" width="13" height="13" aria-hidden="true" focusable="false">' +
  '<path d="M5 15 15 5M6.5 5H15v8.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/></svg>';

function renderSlides(projects) {
  return projects
    .map((p) => {
      const tags = list(p.disciplines)
        .map((t) => `          <li>${esc(t)}</li>`)
        .join("\n");
      // Na telefonu je thumbnail i sam link na projekat, ne samo dugme ispod
      // teksta. Pravi <img> u <a>, umesto background-image preko ::before:
      // slika se tako moze kliknuti, a i putanja vise ne zavisi od toga
      // odakle se custom property cita.
      const thumb = p.thumb || p.cover || "";
      const shot = thumb
        ? `        <a class="slide__shot" data-xfade="none" href="project-${esc(p.slug)}.html" aria-hidden="true" tabindex="-1"><img src="${esc(thumb)}" alt="" loading="lazy" decoding="async"></a>
`
        : "";
      return `      <li class="slide" id="${esc(p.slug)}">
${shot}        <h2 class="slide__name">${esc(p.title)}</h2>
        <ul class="slide__tags slide__tags--plain">
${tags}
        </ul>
        <p class="slide__desc">${esc(p.summary || "")}</p>
        <span class="slide__foot">
          <span class="slide__year"><time datetime="${esc(p.year)}">${esc(p.year)}</time></span>
          <span class="slide__by">Flatgrid Studio</span>
        </span>
        <a class="slide__go" data-xfade="none" href="project-${esc(p.slug)}.html">Open project${ARROW}</a>
      </li>`;
    })
    .join("\n");
}

function renderShots(projects) {
  return projects
    .map((p, i) => {
      const first = i === 0;
      return `      <figure class="shot" data-href="project-${esc(p.slug)}.html" data-name="${esc(p.title)}">
        <img src="${esc(p.cover || "")}" alt="${esc(p.cover_alt || p.title)}" width="2000" height="1179" loading="${
        first ? "eager" : "lazy"
      }"${first ? ' fetchpriority="high"' : ""} decoding="async">
      </figure>`;
    })
    .join("\n");
}

function buildWorkPage(projects, template) {
  const first = projects[0] || { slug: "", title: "", cover: "" };
  return template
    .replace("{{SLIDES}}", renderSlides(projects))
    .replace("{{SHOTS}}", renderShots(projects))
    .replace(/\{\{FIRST_SLUG\}\}/g, esc(first.slug))
    .replace(/\{\{FIRST_TITLE\}\}/g, esc(first.title))
    .replace(/\{\{FIRST_COVER\}\}/g, esc(first.cover || ""))
    .replace(/\{\{COUNT\}\}/g, String(projects.length).padStart(2, "0"));
}

/* ---------------------------------------------------------------- sitemap */

const STATIC_PAGES = [
  { loc: "/", priority: "1.0" },
  { loc: "/work.html", priority: "0.9" },
  { loc: "/studio.html", priority: "0.8" },
  { loc: "/director.html", priority: "0.7" },
  { loc: "/contact.html", priority: "0.6" },
  { loc: "/academy.html", priority: "0.4" },
  { loc: "/templates.html", priority: "0.4" },
];

function buildSitemap(projects) {
  const today = new Date().toISOString().slice(0, 10);
  const entries = [
    ...STATIC_PAGES,
    ...projects
      .filter((p) => !p.noindex)
      .map((p) => ({ loc: `/project-${p.slug}.html`, priority: "0.7" })),
  ];
  const body = entries
    .map(
      (e) => `  <url>
    <loc>${esc(SITE_URL + e.loc)}</loc>
    <lastmod>${today}</lastmod>
    <priority>${e.priority}</priority>
  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

/* ----------------------------------------------------------------- cistka */

// Kad se projektu promeni slug ili se obrise, stara stranica bi ostala da visi
// na svom URL-u kao duplikat. Brise se SAMO ono sto je ovaj skript napravio —
// prepoznaje se po komentaru koji upisujemo na kraj svake generisane stranice.
const STAMP = "<!-- generated by scripts/build.mjs -->";

function pruneOrphans(slugs) {
  const keep = new Set(slugs.map((s) => `project-${s}.html`));
  const removed = [];
  for (const name of fs.readdirSync(ROOT)) {
    if (!/^project-.+\.html$/.test(name) || keep.has(name)) continue;
    const file = path.join(ROOT, name);
    if (!readIfExists(file).includes(STAMP)) continue;
    fs.rmSync(file);
    removed.push(name);
  }
  return removed;
}

/* ------------------------------------------------------------------- main */

function main() {
  const all = loadProjects();
  const live = all.filter((p) => (p.status || "Live") === "Live");
  const listed = live.filter((p) => !p.noindex);

  const projectTemplate = readIfExists(path.join(ROOT, "templates/project.html"));
  const workTemplate = readIfExists(path.join(ROOT, "templates/work.html"));
  if (!projectTemplate || !workTemplate) {
    console.error("Nedostaje templates/project.html ili templates/work.html — prekidam.");
    process.exit(1);
  }

  live.forEach((project, i) => {
    // "Sledeci projekat" u podnozju je sledeci na listi, u krug.
    const next = live[(i + 1) % live.length];
    const html = buildProjectPage(project, next, projectTemplate) + STAMP + "\n";
    fs.writeFileSync(path.join(ROOT, `project-${project.slug}.html`), html, "utf8");
    console.log(`built  project-${project.slug}.html`);
  });

  fs.writeFileSync(path.join(ROOT, "work.html"), buildWorkPage(listed, workTemplate) + STAMP + "\n", "utf8");
  console.log(`built  work.html (${listed.length} projekata)`);

  const orphans = pruneOrphans(live.map((p) => p.slug));
  if (orphans.length) console.log(`obrisano ${orphans.join(", ")} (nema projekat)`);

  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), buildSitemap(listed), "utf8");
  console.log(`built  sitemap.xml`);

  const drafts = all.length - live.length;
  console.log(`\nGotovo. ${live.length} objavljeno${drafts ? `, ${drafts} u draftu` : ""}.`);
}

main();
