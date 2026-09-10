#!/usr/bin/env node
// Lokalni server za rad na sajtu — servira folder i daje /admin panelu dva
// endpointa da cita i pise content/work/*.md pravo na disk. Bez ovoga bi
// panel morao na GitHub, sto za rad na svom racunaru nema smisla.
//
// Pokretanje: npm run dev        (ili: node scripts/dev-server.mjs 5178)
// Sajt:       http://localhost:5178
// Panel:      http://localhost:5178/admin/
//
// Server slusa samo na 127.0.0.1 i pise iskljucivo u content/work i
// assets/uploads — namerno, da greska u panelu ne moze da pregazi nista
// drugo u projektu.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "..");
const PORT = Number(process.argv[2]) || 5178;

const CONTENT_DIR = path.join(ROOT, "content/work");
const WRITABLE = ["content/work", "assets/uploads"];

const MIME = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".gif": "image/gif", ".woff2": "font/woff2", ".mp4": "video/mp4", ".webm": "video/webm",
  ".txt": "text/plain", ".xml": "application/xml", ".md": "text/markdown",
};

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      // Ceo upload stize kao base64 u jednom JSON-u; 80 MB je granica posle
      // koje je ionako pogresno da slika ide u repozitorijum.
      if (size > 80 * 1024 * 1024) reject(new Error("Prevelik zahtev."));
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(new Error("Neispravan JSON."));
      }
    });
    req.on("error", reject);
  });
}

// Putanja mora da ostane unutar dozvoljenih foldera i posle razresavanja —
// "../" u imenu fajla inace izlazi bilo gde po disku.
function safeTarget(relative) {
  const clean = String(relative || "").replace(/^\/+/, "");
  if (!WRITABLE.some((dir) => clean.startsWith(dir + "/"))) return null;
  const full = path.resolve(ROOT, clean);
  if (!full.startsWith(ROOT + path.sep)) return null;
  return full;
}

function listContent() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((name) => name.endsWith(".md"))
    .map((name) => ({
      path: `content/work/${name}`,
      text: fs.readFileSync(path.join(CONTENT_DIR, name), "utf8"),
    }));
}

function runBuild() {
  const result = spawnSync(process.execPath, [path.join(ROOT, "scripts/build.mjs")], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error("Build nije uspeo:\n" + (result.stderr || result.stdout || "").trim());
  }
  process.stdout.write(result.stdout);
}

async function handleCommit(req, res) {
  const payload = await readBody(req);
  const files = Array.isArray(payload.files) ? payload.files : [];

  const written = [];
  for (const file of files) {
    const target = safeTarget(file.path);
    if (!target) {
      return json(res, 400, { ok: false, error: `Putanja nije dozvoljena: ${file.path}` });
    }
    if (file.remove) {
      if (fs.existsSync(target)) fs.rmSync(target);
      written.push("- " + file.path);
      continue;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(file.base64, "base64"));
    written.push("+ " + file.path);
  }

  console.log(`\n[cms] ${payload.message || "izmena"}`);
  written.forEach((line) => console.log("      " + line));

  runBuild();
  json(res, 200, { ok: true, written });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  const pathname = decodeURIComponent(parsed.pathname);

  if (pathname === "/api/local/list") {
    return json(res, 200, listContent());
  }

  if (pathname === "/api/local/commit" && req.method === "POST") {
    return handleCommit(req, res).catch((err) => {
      console.error("[cms]", err.message);
      json(res, 500, { ok: false, error: err.message });
    });
  }

  let filePath = path.join(ROOT, pathname);
  if (pathname.endsWith("/")) filePath = path.join(filePath, "index.html");

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // /admin bez kose crte na kraju -> /admin/index.html
      const asDir = path.join(ROOT, pathname, "index.html");
      if (fs.existsSync(asDir)) {
        res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
        return fs.createReadStream(asDir).pipe(res);
      }
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      // Bez ovoga browser servira staru work.html posle svake izmene u panelu.
      "Cache-Control": "no-store",
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Sajt   http://localhost:${PORT}`);
  console.log(`  CMS    http://localhost:${PORT}/admin/\n`);
});
