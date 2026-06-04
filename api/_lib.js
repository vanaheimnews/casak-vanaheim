/* ============================================================
 * Shared serverless helpers — auth, JSON parsing, Blob article store.
 * Files prefixed with "_" are excluded from Vercel's route detection,
 * so this is import-only — not an HTTP endpoint.
 * ============================================================ */
import { list, put } from "@vercel/blob";

const ARTICLES_PATHNAME = "articles.json";
const COOKIE_NAME = "vn_admin";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 14; // 14 days

/* ---------------- cookies ---------------- */
export function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};
  header.split(";").forEach((part) => {
    const [k, ...v] = part.split("=");
    if (!k) return;
    out[k.trim()] = decodeURIComponent((v.join("=") || "").trim());
  });
  return out;
}

export function isAdmin(req) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  const cookies = parseCookies(req);
  return cookies[COOKIE_NAME] === password;
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

export function requireAdmin(req, res) {
  if (!isAdmin(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
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
async function findArticlesBlob() {
  const result = await list({ prefix: ARTICLES_PATHNAME, limit: 5 });
  // Pick the most recently uploaded match.
  const sorted = (result.blobs || [])
    .filter((b) => b.pathname === ARTICLES_PATHNAME)
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  return sorted[0] || null;
}

export async function loadArticles() {
  try {
    const blob = await findArticlesBlob();
    if (!blob) return [];
    const response = await fetch(blob.url, { cache: "no-store" });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("loadArticles failed", err);
    return [];
  }
}

export async function saveArticles(articles) {
  await put(ARTICLES_PATHNAME, JSON.stringify(articles, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true
  });
}

/* ---------------- article shape ---------------- */
export function uid() {
  return "a-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
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
    date:     data.date || new Date().toISOString().slice(0, 10),
    kind:     data.kind === "comic" ? "comic" : "article",
    updatedAt: new Date().toISOString()
  };
}
