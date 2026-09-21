#!/usr/bin/env node
// Provera da su content/pages.json i sidra u stranicama u skladu.
//
// Kolekcija "Stranice" u /admin menja rucno pisane stranice u mestu: nadje
// element sa data-cms="<id>" i upise novu vrednost u njega. Ako sidro nestane
// (neko prepravi stranicu i obrise atribut), polje u panelu se iskljuci i
// izmena tise ne prodje. Ovaj skript to nalazi pre nego sto se primeti na sajtu.
//
// Pokretanje: npm run check-pages
//
// Izlaz 0 — sve se poklapa. Izlaz 1 — ima sidara koja nedostaju ili se
// ponavljaju. Sidro koje postoji u stranici a nije u pages.json je samo
// napomena: znaci da polje nije izlozeno u panelu.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCHEMA_FILE = path.join(ROOT, "content/pages.json");

const schema = JSON.parse(fs.readFileSync(SCHEMA_FILE, "utf8"));
const pages = Object.keys(schema).filter((id) => !id.startsWith("_"));

const problems = [];
const notes = [];
let checked = 0;

for (const id of pages) {
  const entry = schema[id];
  const file = path.join(ROOT, entry.file);

  if (!fs.existsSync(file)) {
    problems.push(`${entry.file} — fajl ne postoji`);
    continue;
  }

  const html = fs.readFileSync(file, "utf8");
  const declared = new Set();

  for (const group of entry.groups || []) {
    for (const field of group.fields || []) {
      declared.add(field.id);
      checked += 1;

      const hits = html.split(`data-cms="${field.id}"`).length - 1;
      if (hits === 0) problems.push(`${entry.file} — nema sidra za "${field.id}" (${field.label})`);
      else if (hits > 1) problems.push(`${entry.file} — sidro "${field.id}" se pojavljuje ${hits} puta`);
    }
  }

  // Sidro u stranici koje sema ne pominje: stoji, ali ga panel ne prikazuje.
  for (const match of html.matchAll(/data-cms="([^"]+)"/g)) {
    if (!declared.has(match[1])) notes.push(`${entry.file} — sidro "${match[1]}" nije u pages.json`);
  }
}

for (const line of problems) console.error("  greska  " + line);
for (const line of notes) console.warn("  visak   " + line);

if (problems.length) {
  console.error(`\n${problems.length} problema u ${pages.length} stranica.`);
  process.exit(1);
}

console.log(`Provereno ${checked} polja u ${pages.length} stranica — sve na broju.`);
if (notes.length) console.log(`${notes.length} sidara nije izlozeno u panelu.`);
