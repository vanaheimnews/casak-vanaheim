// Local dev server: repo static files + the REAL api/*.js handlers on a fake Blob store.
// Run from the repository root:  node --import ./tools/dev/register.mjs tools/dev/devserver.mjs
// then open http://localhost:8765 (site) and http://localhost:8765/admin (password: test).
// Nothing touches the real Vercel Blob store: data lives in memory and is gone on restart.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { STORE, put, OPS } from "./fake-blob.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");   // the repository
const PORT = Number(process.env.PORT || 8765);
process.env.PORT = String(PORT);
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "test";
process.env.ADMIN_HOST = process.env.ADMIN_HOST || "localhost";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json", ".txt": "text/plain" };

// sample data (only once per process)
const day = (d) => new Date(Date.now() + d * 864e5);
const art = (id, title, d, tags, authors) => ({ id, title, body: title + " text", image: "", tags, authors,
  date: day(d).toISOString().slice(0, 10), publishAt: day(d).toISOString(), kind: "article", elements: [], background: { color: "", image: "" } });
await put("articles.json", JSON.stringify([
  art("a1", "Vtipy o učitelích", -1, ["Humor", "Škola"], ["Jan Novák"]),
  art("a2", "Fotbalový turnaj", -3, ["Sport"], ["Eva Malá"]),
  art("a3", "Komiks: Kočka", -5, ["Humor"], ["Eva Malá", "Jan Novák"]),
  art("a4", "Výlet do Prahy", -10, ["Škola", "Cestování"], ["Petr Dlouhý"]),
  art("a5", "Starý článek", -40, ["humor"], []),
  art("a6", "Naplánovaný", 5, ["Sport"], ["Jan Novák"]),
]), { addRandomSuffix: true });

const handlers = {};
async function api(name, req, res) {
  const file = path.join(ROOT, "api", name + ".js");
  if (!handlers[name]) handlers[name] = (await import(pathToFileURL(file).href)).default;
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); return res; };
  await handlers[name](req, res);
}

http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost");
    let p = decodeURIComponent(u.pathname);
    if (p.startsWith("/__blob/")) {
      const b = STORE.get(p.slice(8));
      if (!b) { res.statusCode = 404; return res.end("gone"); }
      res.setHeader("Content-Type", "application/json");
      return res.end(b.body);
    }
    if (p === "/__ops") { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify(OPS)); }
    const m = p.match(/^\/api\/([a-z]+)$/);
    if (m && !m[1].startsWith("_")) return await api(m[1], req, res);
    if (p === "/" || p === "/admin" || p === "/admin/") p = p.startsWith("/admin") ? "/admin/index.html" : "/index.html";
    let file = path.join(ROOT, p);
    if (!path.extname(file)) file += ".html";
    const body = await readFile(file);
    res.setHeader("Content-Type", TYPES[path.extname(file).toLowerCase()] || "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.end(body);
  } catch (e) {
    res.statusCode = e.code === "ENOENT" ? 404 : 500;
    res.end(String(e.code === "ENOENT" ? "not found" : (e.stack || e)));
  }
}).listen(PORT, () => console.log("dev server on " + PORT));
