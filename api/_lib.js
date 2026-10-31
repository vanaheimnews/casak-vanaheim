/* ============================================================
 * Shared serverless helpers — auth, JSON parsing, Blob article store.
 * Files prefixed with "_" are excluded from Vercel's route detection,
 * so this is import-only — not an HTTP endpoint.
 * ============================================================ */
import { list, put, head, BlobNotFoundError, BlobPreconditionFailedError } from "@vercel/blob";
import { webcrypto } from "node:crypto";
import { shapeTaxonomy, seedTaxonomy, restrictNames } from "./_taxonomy.js";

/* ----------------------------------------------------------------
 * Mutable JSON in Blob, frugal with operations.
 * The Hobby plan includes only 2,000 "advanced" operations (uploads and
 * list() calls) a month; past that Vercel blocks the store for 30 days
 * (every read answers 403). The old scheme wrote a new <base>-<random>.json
 * on every save and called list() on EVERY read, which used them up.
 * Now each file has one fixed pathname (articles.json, content.json,
 * taxonomy.json), overwritten in place:
 *   read   head() — a "simple" operation that always returns the current
 *          version's ETag — then fetch <url>?v=<etag>. A new version is a
 *          new URL, so the CDN never serves stale data, and reading the
 *          same version again is a free cache hit.
 *   write  put(allowOverwrite, ifMatch: <etag that was read>) — one
 *          advanced operation, and a real compare-and-swap: if another
 *          save landed in between it fails and the change is redone.
 * The first read of a file that only exists in the old <base>-<random>.json
 * form copies the newest of those (one list(), once) to the fixed name;
 * the old copies stay as a backup.
 * ---------------------------------------------------------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function headOrNull(pathname) {
  try {
    return await head(pathname);
  } catch (e) {
    if (e instanceof BlobNotFoundError) return null;
    throw e;
  }
}
async function fetchJson(url, baseName) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Blob read of " + baseName + " failed: HTTP " + response.status);
  return await response.json();
}
function versionUrl(meta) {
  return meta.url + (meta.url.indexOf("?") > -1 ? "&" : "?") + "v=" + encodeURIComponent(meta.etag || meta.uploadedAt || "");
}

// opts.etag: a string = only if still that version (compare-and-swap);
// null = only if the file does not exist yet; undefined = overwrite.
async function saveJson(baseName, value, opts = {}) {
  const options = {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: opts.etag !== null,
    cacheControlMaxAge: 60
  };
  if (opts.etag) options.ifMatch = opts.etag;
  return put(baseName + ".json", JSON.stringify(value, null, 2), options);
}

// Old format: the newest <base>-<random>.json (or a stray <base>.json listing).
async function readLegacy(baseName) {
  const result = await list({ prefix: baseName, limit: 1000 });
  const versions = (result.blobs || []).filter(function (b) {
    return b.pathname.startsWith(baseName + "-") && b.pathname.endsWith(".json");
  });
  if (!versions.length) return null;
  versions.sort(function (a, b) { return new Date(b.uploadedAt) - new Date(a.uploadedAt); });
  return { value: await fetchJson(versions[0].url, baseName) };
}

/* { value, etag } of the current version. `fallback` ONLY when the file
 * has never existed. Every failure (Blob down, blocked store, bad JSON)
 * THROWS: returning an empty list here would let the next save overwrite
 * the whole magazine with one article. */
async function loadJsonVersion(baseName, fallback) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const meta = await headOrNull(baseName + ".json");
    if (meta) return { value: await fetchJson(versionUrl(meta), baseName), etag: meta.etag };
    const legacy = await readLegacy(baseName);
    if (!legacy) {
      // never saved: create it from the default, so later reads need no list()
      if (fallback === null) return { value: null, etag: null };
      try { await saveJson(baseName, fallback, { etag: null }); continue; } catch (e) { return { value: fallback, etag: null }; }
    }
    try {
      await saveJson(baseName, legacy.value, { etag: null });   // migrate once
    } catch (e) {
      if (attempt === 2) throw e;                                // (a parallel request may have migrated it)
    }
  }
  throw new Error("Blob read of " + baseName + " failed: could not migrate the old copies");
}
async function loadJson(baseName, fallback) {
  return (await loadJsonVersion(baseName, fallback)).value;
}

/* Read -> change -> write without losing a parallel save (two admins, two
 * tabs): the write only succeeds if the file is still the version that was
 * read, otherwise the change is redone on the newer data. `mutate(value)`
 * returns { value: next, ...extra } to write, or an object without
 * `value` to write nothing; the whole result is returned. */
async function updateJson(baseName, fallback, mutate) {
  for (let attempt = 0; attempt < 8; attempt++) {
    // after a collision wait a little (random, growing) so parallel saves take turns
    if (attempt) await sleep(Math.random() * 120 * attempt);
    const read = await loadJsonVersion(baseName, fallback);
    const result = await mutate(read.value);
    if (!result || !("value" in result)) return result || {};
    try {
      await saveJson(baseName, result.value, { etag: read.etag });
      return result;
    } catch (e) {
      // someone saved in between (or created the file first): redo
      if (e instanceof BlobPreconditionFailedError || (read.etag === null && /exist/i.test(String(e && e.message)))) continue;
      throw e;
    }
  }
  const err = new Error("Data se právě měnila z jiného místa, zkuste to prosím znovu.");
  err.status = 409;
  throw err;
}
const COOKIE_NAME = "vn_admin";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 14; // 14 days

/* ---------------- cookies ---------------- */
export function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((part) => {
    const [k, ...v] = part.split("=");
    if (!k) return;
    const raw = (v.join("=") || "").trim();
    try { out[k.trim()] = decodeURIComponent(raw); } catch (e) { out[k.trim()] = raw; }
  });
  return out;
}

/* ---------------- signed session tokens ----------------
 * The cookie used to hold the admin password itself. Now it holds
 *   v1.<expiry>.<nonce>.<HMAC-SHA256 signature>
 * The HMAC key is derived from ADMIN_PASSWORD (+ optional SESSION_SECRET),
 * so the password never leaves the server and changing it invalidates
 * every existing session. Web Crypto keeps this code runtime-neutral.
 * ------------------------------------------------------- */
const enc = new TextEncoder();

function b64url(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Compare without an early exit, so response time doesn't reveal how many
// leading characters matched.
export function safeEqual(a, b) {
  a = String(a == null ? "" : a);
  b = String(b == null ? "" : b);
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/* ADMIN_PASSWORD from the Vercel settings, minus surrounding whitespace: the
 * Vercel value box is multi-line, so a stray Enter would add an invisible
 * newline and make the password impossible to type at /admin. */
export function adminPassword() {
  return String(process.env.ADMIN_PASSWORD || "").trim();
}

async function sessionKey() {
  const password = adminPassword();
  if (!password) return null;
  const material = enc.encode("vn-session-v1\u0000" + password + "\u0000" + (process.env.SESSION_SECRET || ""));
  return webcrypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
async function hmac(key, data) {
  return b64url(new Uint8Array(await webcrypto.subtle.sign("HMAC", key, enc.encode(data))));
}

export async function createSessionToken() {
  const key = await sessionKey();
  if (!key) throw new Error("ADMIN_PASSWORD env var not set");
  const exp = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE;
  const nonce = b64url(webcrypto.getRandomValues(new Uint8Array(12)));
  const payload = "v1." + exp + "." + nonce;
  return payload + "." + (await hmac(key, payload));
}

export async function verifySessionToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return false;
  const exp = Number(parts[1]);
  if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) return false;
  const key = await sessionKey();
  if (!key) return false;
  return safeEqual(parts[3], await hmac(key, parts.slice(0, 3).join(".")));
}

/* ---------------- admin host (Vercel Authentication) ----------------
 * The admin works ONLY on the Vercel branch URL of `main`. That URL is
 * guarded by Vercel Authentication (Settings -> Deployment Protection), so a
 * request can only reach a function under this host after the visitor
 * signed in to the Vercel account. On the public domains every admin action
 * is refused, even with a valid password or session cookie.
 * ADMIN_HOST env var can override it (e.g. after renaming the project/team).
 * ------------------------------------------------------------------ */
const DEFAULT_ADMIN_HOST = "casak-vanaheim-git-main-vanaheim-news-projects.vercel.app";
export function adminHost() {
  return String(process.env.ADMIN_HOST || DEFAULT_ADMIN_HOST).trim().toLowerCase();
}
export function requestHost(req) {
  return String(req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0].trim().toLowerCase().replace(/:\d+$/, "");
}
export function isAdminHost(req) {
  return requestHost(req) === adminHost();
}

/* Public GET answers may be cached by Vercel's CDN for a minute (then
 * refreshed in the background), so visitors don't each cost a Blob read.
 * The admin host (scheduled posts, fresh data) is never cached. */
export function setReadCache(req, res) {
  res.setHeader("Cache-Control", isAdminHost(req)
    ? "no-store, max-age=0"
    : "public, max-age=0, s-maxage=60, stale-while-revalidate=300");
}

export async function isAdmin(req) {
  if (!isAdminHost(req)) return false;
  return verifySessionToken(parseCookies(req)[COOKIE_NAME]);
}

export function setAdminCookie(res, value) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${COOKIE_MAX_AGE}`
  );
}

export function clearAdminCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
  );
}

export async function requireAdmin(req, res) {
  if (!(await isAdmin(req))) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

/* 500 response. Internal details (useful: e.g. a missing Blob token) are
 * shown only to signed-in admins; the public gets a generic message. */
export async function sendServerError(req, res, err, where, label = "Server error") {
  // a save that kept colliding with parallel saves (updateJson): not a crash
  if (err && err.status === 409) return res.status(409).json({ error: "busy", detail: String(err.message) });
  console.error(where + " error", err);
  let admin = false;
  try { admin = await isAdmin(req); } catch (e) { /* treat as public */ }
  return res.status(500).json(admin
    ? { error: label, detail: String((err && err.message) || err) }
    : { error: label });
}

/* ---------------- request body ---------------- */
export async function readJsonBody(req) {
  // Vercel Node functions don't auto-parse JSON for all runtimes.
  if (req.body && typeof req.body === "object") return req.body;
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

/* ---------------- article store (Blob) ----------------
 *  Articles live as a single JSON file (articles.json) in Blob.
 *  Public access so the static site can read it directly if needed.
 *  Writes go through the admin API endpoints only.
 * ------------------------------------------------------- */
export async function loadArticles() {
  const data = await loadJson("articles", []);
  return Array.isArray(data) ? data : [];
}

export async function saveArticles(articles) {
  await saveJson("articles", articles);
}

// Change the article list safely (see updateJson): mutate(items) -> { value, ... }.
export async function updateArticles(mutate) {
  return updateJson("articles", [], (data) => mutate(Array.isArray(data) ? data : []));
}

/* ---------------- tag / author lists (Blob) ----------------
 *  taxonomy.json holds the global lists (see _taxonomy.js). Until the
 *  first change is saved, the lists are the names the articles use.
 * ----------------------------------------------------------- */
/* The first time (no taxonomy.json yet) the lists seeded from the articles
 * are saved, once: an entry then never vanishes just because its last post
 * was edited or deleted, and later reads need no list() call. */
export async function ensureTaxonomy(articles) {
  const data = await loadJson("taxonomy", null);
  if (data) return shapeTaxonomy(data);
  const seeded = seedTaxonomy(articles || await loadArticles());
  try {
    await saveJson("taxonomy", seeded, { etag: null });      // create only
  } catch (e) {
    return shapeTaxonomy(await loadJson("taxonomy", seeded));  // a parallel request created it
  }
  return seeded;
}
export const loadTaxonomy = ensureTaxonomy;

export async function saveTaxonomy(taxonomy) {
  const shaped = shapeTaxonomy(taxonomy);
  await saveJson("taxonomy", shaped);
  return shaped;
}

// Change the lists safely: mutate(currentTaxonomy) -> { value, ... }.
export async function updateTaxonomy(mutate, articles) {
  return updateJson("taxonomy", null, (data) =>
    mutate(data ? shapeTaxonomy(data) : seedTaxonomy(articles || [])));
}

/* An article may only use names from the global lists (spelled as there).
 * Tags set again end the "nespecifikováno" fallback state. */
export function restrictToTaxonomy(article, taxonomy, stored) {
  const asked = (article.tags || []).length;
  article.tags = restrictNames(article.tags, taxonomy.tags);
  article.authors = restrictNames(article.authors, taxonomy.authors);
  // left with no tag because the stored post had the fallback, or because
  // the tags sent no longer exist (deleted meanwhile): show "nespecifikováno"
  article.tagsUnspecified = !article.tags.length && (!!(stored && stored.tagsUnspecified) || asked > 0);
  return article;
}

/* ---------------- site content store (Blob) ----------------
 *  About text, team members, contact subtitle and contact items
 *  live as a single JSON file (content.json) in Blob.
 * ----------------------------------------------------------- */
export const DEFAULT_CONTENT = {
  home: {
    doc: "",
    theme: { period: "měsíce", desc: "dané téma písmem" },
    pinned: [],
    background: { color: "", image: "" }
  },
  about: {
    doc: "",
    background: { color: "", image: "" },
    text:
      "Školní magazín vznikl v roce 2022 jako nápad několika studentů, kteří chtěli dát svým spolužákům prostor pro vlastní texty, ilustrace a komiksy. Z malého newsletteru se postupně stal pravidelně vycházející časopis, na kterém se podílí celá redakce.\n\n" +
      "Každý týden se scházíme ve čtvrtek odpoledne ve školní knihovně. Plánujeme nové vydání, rozdělujeme témata, společně čteme rozpracované texty a chystáme rozhovory. Jednou za měsíc vychází nové číslo — tištěné i online."
  },
  team: [
    { id: "t1", name: "Anna Nováková",   role: "Šéfredaktorka",      image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80" },
    { id: "t2", name: "Petr Svoboda",    role: "Redaktor",           image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80" },
    { id: "t3", name: "Klára Dvořáková", role: "Ilustrátorka",       image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=400&q=80" },
    { id: "t4", name: "Tomáš Marek",     role: "Fotograf",           image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=400&q=80" },
    { id: "t5", name: "Eliška Horáková", role: "Korektorka",         image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80" },
    { id: "t6", name: "Martin Král",     role: "Grafik",             image: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80" },
    { id: "t7", name: "Jan Bárta",       role: "Autor komiksů",      image: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80" },
    { id: "t8", name: "Lucie Pokorná",   role: "Pedagogický dohled", image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80" }
  ],
  contact: {
    subtitle: "Napište nám nebo nás sledujte na sítích.",
    items: [
      { id: "c1", type: "Email",     label: "magazin@skola.cz", url: "mailto:magazin@skola.cz" },
      { id: "c2", type: "Email",     label: "info@skola.cz",    url: "mailto:info@skola.cz" },
      { id: "c3", type: "YouTube",   label: "@nase-skola",      url: "https://youtube.com/" },
      { id: "c4", type: "Instagram", label: "@nase.skola",      url: "https://instagram.com/" },
      { id: "c5", type: "Facebook",  label: "/nase.skola",      url: "https://facebook.com/" }
    ]
  }
};

function shapeMember(m) {
  m = m || {};
  return {
    id:    m.id || uid(),
    name:  String(m.name || "").trim(),
    role:  String(m.role || "").trim(),
    image: String(m.image || "").trim()
  };
}
function shapeContactItem(c) {
  c = c || {};
  return {
    id:    c.id || uid(),
    type:  String(c.type || "Odkaz").trim(),
    label: String(c.label || "").trim(),
    url:   String(c.url || "").trim()
  };
}
/* Canvas background: a solid colour OR an image (image wins when both set). */
export function shapeBackground(b) {
  b = b || {};
  return {
    color: String(b.color || "").trim(),
    image: String(b.image || "").trim()
  };
}
/* Homepage block layout (see home-layout.js; same rules as VNHome.normalize):
 * a grid 4 boxes wide; every block starts at grid column col (0-3), blocks
 * never overlap or pass column 4; text {span 1-4, html} or post {size A-D,
 * articleId}. Old layouts without col (row.align) are packed in order.
 * null = no layout saved yet (the site then shows VNHome.defaultLayout). */
const POST_SIZES = { A: 1, B: 2, C: 3, D: 4 };
function shapeLayout(l) {
  if (!l || !Array.isArray(l.rows)) return null;
  const str = (v, max) => String(v == null ? "" : v).slice(0, max);
  const width = (b) => (b.kind === "post" ? POST_SIZES[b.size] : b.span);
  const rows = [];
  for (const r of l.rows.slice(0, 200)) {
    if (!r || !Array.isArray(r.blocks)) continue;
    const list = [];
    for (const b of r.blocks.slice(0, 4)) {
      if (!b) continue;
      let blk;
      if (b.kind === "post") {
        const size = POST_SIZES[b.size] ? b.size : "A";
        blk = { id: str(b.id, 64) || uid(), kind: "post", size, articleId: str(b.articleId, 100) };
      } else if (b.kind === "text") {
        const span = Math.max(1, Math.min(4, parseInt(b.span, 10) || 4));
        blk = { id: str(b.id, 64) || uid(), kind: "text", span, html: String(b.html == null ? "" : b.html) };   // no cut: the request size limit applies
      } else continue;
      const col = parseInt(b.col, 10);
      blk.col = col >= 0 && col <= 3 ? col : null;
      list.push(blk);
    }
    if (list.every((b) => b.col === null)) {             // old format: pack with its alignment
      const used = list.reduce((s, b) => s + width(b), 0);
      let start = r.align === "center" ? Math.floor(Math.max(0, 4 - used) / 2) : r.align === "end" ? Math.max(0, 4 - used) : 0;
      for (const b of list) { b.col = start; start += width(b); }
    }
    const cells = [false, false, false, false];
    const free = (c, w) => c >= 0 && c + w <= 4 && cells.slice(c, c + w).every((x) => !x);
    const blocks = [], overflow = [];
    for (const b of list) {
      const w = width(b);
      if (b.col === null || !free(b.col, w)) {          // nearest free columns, else a new row
        let best = -1;
        for (let c = 0; c + w <= 4; c++) if (free(c, w) && (best < 0 || Math.abs(c - (b.col || 0)) < Math.abs(best - (b.col || 0)))) best = c;
        b.col = best;
      }
      if (b.col < 0) { b.col = 0; overflow.push(b); continue; }
      for (let c = b.col; c < b.col + w; c++) cells[c] = true;
      blocks.push(b);
    }
    if (blocks.length) rows.push({ id: str(r.id, 64) || uid(), blocks: blocks.sort((x, y) => x.col - y.col) });
    for (const b of overflow) rows.push({ id: uid(), blocks: [b] });
  }
  return { rows };
}

/* Normalise an arbitrary object into the full content shape. */
export function shapeContent(d) {
  d = d || {};
  const home = d.home || {};
  const theme = home.theme || {};
  const about = d.about || {};
  const contact = d.contact || {};
  const DH = DEFAULT_CONTENT.home;
  return {
    home: {
      // Rich-text document (HTML) authored in the homepage editor.
      doc: typeof home.doc === "string" ? home.doc : DH.doc,
      theme: {
        period: typeof theme.period === "string" ? theme.period : DH.theme.period,
        desc:   typeof theme.desc   === "string" ? theme.desc   : DH.theme.desc
      },
      // Article ids locked to the top of the feed, in pin order.
      pinned: Array.isArray(home.pinned)
                ? home.pinned.map((id) => String(id).trim()).filter(Boolean)
                : DH.pinned,
      background: shapeBackground(home.background),
      // Block layout from the homepage editor (null until first saved)
      layout: shapeLayout(home.layout)
    },
    about: {
      text: typeof about.text === "string" ? about.text : DEFAULT_CONTENT.about.text,
      doc:  typeof about.doc  === "string" ? about.doc  : DEFAULT_CONTENT.about.doc,
      background: shapeBackground(about.background)
    },
    team: Array.isArray(d.team) ? d.team.map(shapeMember) : DEFAULT_CONTENT.team,
    contact: {
      subtitle: typeof contact.subtitle === "string" ? contact.subtitle : DEFAULT_CONTENT.contact.subtitle,
      items: Array.isArray(contact.items) ? contact.items.map(shapeContactItem) : DEFAULT_CONTENT.contact.items
    }
  };
}

export async function loadContent() {
  const data = await loadJson("content", DEFAULT_CONTENT);   // never saved: created once from the defaults
  return data ? shapeContent(data) : DEFAULT_CONTENT;
}

export async function saveContent(content) {
  const shaped = shapeContent(content);
  await saveJson("content", shaped);
  return shaped;
}

/* ---------------- article shape ---------------- */
export function uid() {
  return "a-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

/* ---------------- scheduling ----------------
 * An article is public once its publish moment has passed:
 *   - publishAt (exact ISO timestamp) when present,
 *   - otherwise the legacy `date` (YYYY-MM-DD) compared with today's date
 *     in Prague — the server runs in UTC, which hid same-day articles
 *     until 01:00/02:00 local time.
 * Evaluated on every request, so no cron job is needed: a scheduled
 * article simply starts appearing at its time.
 * ------------------------------------------- */
const SITE_TZ = "Europe/Prague";
export function pragueToday() {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: SITE_TZ }).format(new Date());
}
function normalizeIso(v) {
  if (!v) return "";
  const t = Date.parse(v);
  return isNaN(t) ? "" : new Date(t).toISOString();
}
export function publishTime(a) {
  const t = a.publishAt ? Date.parse(a.publishAt) : NaN;
  return isNaN(t) ? null : t;
}
export function isLive(a, now = Date.now()) {
  const t = publishTime(a);
  if (t !== null) return t <= now;
  return !a.date || a.date <= pragueToday();
}
// Newest first; publishAt wins over the date-only fallback.
const sortKey = (a) => publishTime(a) ?? (Date.parse(a.date) || 0);
export function compareNewest(a, b) {
  return sortKey(b) - sortKey(a);
}

export function shapeArticle(data) {
  const tags = Array.isArray(data.tags)
    ? data.tags.map((t) => String(t).trim()).filter(Boolean)
    : String(data.tags || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
  return {
    id:       data.id || uid(),
    title:    String(data.title || "").trim(),
    body:     String(data.body || "").trim(),
    image:    String(data.image || "").trim(),
    tags,
    // a deleted tag left the article with none: cards show "nespecifikováno"
    tagsUnspecified: data.tagsUnspecified === true && !tags.length,
    authors:  Array.isArray(data.authors)
                ? data.authors.map((a) => String(a).trim()).filter(Boolean)
                : String(data.authors || "")
                    .split(",")
                    .map((a) => a.trim())
                    .filter(Boolean),
    date:     data.date || pragueToday(),
    // Exact publish moment (ISO, UTC). Empty for legacy date-only records.
    publishAt: normalizeIso(data.publishAt),
    kind:     data.kind === "comic" ? "comic" : "article",
    // Visual-editor layout: array of positioned element objects (optional).
    // Each element may carry a `z` layer index; the page background sits
    // behind all of them and is stored separately.
    elements: Array.isArray(data.elements) ? data.elements : [],
    background: shapeBackground(data.background),
    updatedAt: new Date().toISOString()
  };
}
