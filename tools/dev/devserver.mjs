// Local dev server: the repo's static files + the REAL api/*.js handlers on an
// in-memory stand-in for Vercel Blob (fake-blob.mjs). Nothing touches the real
// store; the data is the fixed sample set in seed.mjs and is gone on restart.
//
//   node --import ./tools/dev/register.mjs tools/dev/devserver.mjs [--parity] [--out=<dir>]
//
// then open http://localhost:8765 (site) and http://localhost:8765/admin
// (password: test). PORT env changes the port.
//   --parity   every page gets parity/pre.js first (deterministic animation
//              frames / ResizeObserver) — used by the regression check, see
//              tools/dev/parity/README.md
//   --out=dir  where POST /__snap?name=x stores what the check records
// Helper endpoints: POST /__reset (sample data again), GET /__ops (Blob
// operations used so far — handy when touching the storage code).
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { STORE, put, OPS } from "./fake-blob.mjs";
import { articles, content } from "./seed.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");                      // the repository
const PORT = Number(process.env.PORT || 8765);
const PARITY = process.argv.includes("--parity");
const OUT = (process.argv.find((a) => a.startsWith("--out=")) || "").slice(6) || path.join(HERE, "parity", "out");
process.env.PORT = String(PORT);
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "test";
process.env.ADMIN_HOST = process.env.ADMIN_HOST || "localhost";

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json",
  ".txt": "text/plain; charset=utf-8", ".md": "text/plain; charset=utf-8" };

async function seed() {
  STORE.clear();
  OPS.advanced = OPS.simple = 0;
  await put("articles.json", JSON.stringify(articles), { contentType: "application/json" });
  await put("content.json", JSON.stringify(content), { contentType: "application/json" });
}
await seed();

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Vercel's res.status() / res.json() / res.send() on a plain Node response.
const handlers = {};
async function api(name, req, res) {
  if (!handlers[name]) handlers[name] = (await import(pathToFileURL(path.join(ROOT, "api", name + ".js")).href)).default;
  res.status = (code) => { res.statusCode = code; return res; };
  res.send = (body) => { res.end(body); return res; };
  res.json = (obj) => {
    if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(obj));
    return res;
  };
  await handlers[name](req, res);
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let p = decodeURIComponent(url.pathname);
    if (p.startsWith("/__blob/")) {                             // a stored file (JSON, uploaded picture / PDF)
      const b = STORE.get(p.slice(8));
      if (!b) { res.statusCode = 404; return res.end("gone"); }
      res.setHeader("Content-Type", b.contentType || "application/json");
      return res.end(b.body);
    }
    if (p === "/__ops") { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify(OPS)); }
    if (p === "/__reset" && req.method === "POST") { await seed(); return res.end("ok"); }
    if (p === "/__snap" && req.method === "POST") {
      const name = String(url.searchParams.get("name") || "snap").replace(/[^\w.-]/g, "_");
      await mkdir(OUT, { recursive: true });
      await writeFile(path.join(OUT, name + ".json"), await readBody(req));
      return res.end("ok");
    }
    const m = p.match(/^\/api\/([a-z]+)$/);
    if (m) return await api(m[1], req, res);
    if (p === "/sitemap.xml") return await api("sitemap", req, res);              // vercel.json rewrite
    if (p === "/" || p === "/admin" || p === "/admin/") p = p.startsWith("/admin") ? "/admin/index.html" : "/index.html";
    if (p.endsWith("/")) p += "index.html";
    let file = path.join(ROOT, p);
    if (!path.extname(file)) file += ".html";                                     // cleanUrls: /article -> article.html
    let body = await readFile(file);
    const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
    if (PARITY && type.startsWith("text/html") && !p.startsWith("/tools/")) {
      body = body.toString("utf8").replace(/<head>/i, '<head>\n  <script src="/tools/dev/parity/pre.js"></script>');
    }
    res.setHeader("Content-Type", type);
    res.setHeader("Cache-Control", "no-store");
    res.end(body);
  } catch (e) {
    res.statusCode = e.code === "ENOENT" || e.code === "EISDIR" ? 404 : 500;
    res.end(res.statusCode === 404 ? "not found" : String(e.stack || e));
  }
}).listen(PORT, () => console.log("dev server on http://localhost:" + PORT + (PARITY ? " (parity mode, results -> " + OUT + ")" : "")));
