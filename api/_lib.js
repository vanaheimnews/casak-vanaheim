/* ============================================================
 * Shared serverless helpers — auth, JSON parsing, Blob article store.
 * Files prefixed with "_" are excluded from Vercel's route detection,
 * so this is import-only — not an HTTP endpoint.
 * ============================================================ */
import { list, put, del } from "@vercel/blob";
import { webcrypto } from "node:crypto";

const ARTICLES_PATHNAME = "articles.json";
const CONTENT_PATHNAME = "content.json";
const KEEP_VERSIONS = 3;   // newest JSON versions never deleted (backup)

/* ----------------------------------------------------------------
 * Mutable-JSON-in-Blob helper.
 * Vercel Blob serves public URLs through a CDN whose edge cache is
 * NOT purged when you overwrite the same pathname — so reads stay
 * stale for the cache TTL. The reliable fix is to write a NEW unique
 * URL every time (addRandomSuffix:true), read the most-recently
 * uploaded one, and delete the older copies.
 * ---------------------------------------------------------------- */
// baseName is e.g. "articles" or "content" (the file is <base>.json).
async function listVersions(baseName) {
  const result = await list({ prefix: baseName, limit: 1000 });
  const matches = (result.blobs || []).filter(function (b) {
    return b.pathname === baseName + ".json" ||
           b.pathname.startsWith(baseName + "-");
  });
  matches.sort(function (a, b) { return new Date(b.uploadedAt) - new Date(a.uploadedAt); });
  return matches; // newest first
}

async function saveJson(baseName, value) {
  const written = await put(baseName + ".json", JSON.stringify(value, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: true,     // brand-new URL each save -> never a stale CDN hit
    cacheControlMaxAge: 0
  });
  // Best-effort cleanup. Only versions OLDER than the one we just wrote are
  // removed (a parallel save that landed after ours must survive), and the
  // newest KEEP_VERSIONS copies always stay as a safety net / backup.
  try {
    const versions = await listVersions(baseName);   // newest first
    const mine = versions.find(function (b) { return b.url === written.url; });
    if (mine) {
      const myTime = new Date(mine.uploadedAt).getTime();
      const stale = versions.slice(KEEP_VERSIONS)
        .filter(function (b) { return new Date(b.uploadedAt).getTime() < myTime; })
        .map(function (b) { return b.url; });
      if (stale.length) await del(stale);
    }
  } catch (e) { /* cleanup is non-critical */ }
  return written;
}

/* Read the newest version. `fallback` is returned ONLY when no version
 * exists yet. Every failure (Blob API down, network error, bad JSON) THROWS:
 * returning an empty list here made the next save overwrite the store with
 * just one article — i.e. a short outage could wipe the whole magazine. */
async function loadJson(baseName, fallback) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const versions = await listVersions(baseName);
    if (!versions.length) return fallback;
    const response = await fetch(versions[0].url, { cache: "no-store" });
    // 404: that version was cleaned up between list() and fetch() -> re-list.
    if (response.status === 404) continue;
    if (!response.ok) throw new Error("Blob read of " + baseName + " failed: HTTP " + response.status);
    return await response.json();
  }
  throw new Error("Blob read of " + baseName + " failed: version disappeared while reading");
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
  const data = await loadJson("content", null);
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
  return {
    id:       data.id || uid(),
    title:    String(data.title || "").trim(),
    body:     String(data.body || "").trim(),
    image:    String(data.image || "").trim(),
    tags:     Array.isArray(data.tags)
                ? data.tags.map((t) => String(t).trim()).filter(Boolean)
                : String(data.tags || "")
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
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
