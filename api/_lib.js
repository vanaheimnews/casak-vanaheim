/* ============================================================
 * Shared serverless helpers — auth, JSON parsing, Blob article store.
 * Files prefixed with "_" are excluded from Vercel's route detection,
 * so this is import-only — not an HTTP endpoint.
 * ============================================================ */
import { list, put } from "@vercel/blob";

const ARTICLES_PATHNAME = "articles.json";
const CONTENT_PATHNAME = "content.json";
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

/* ---------------- site content store (Blob) ----------------
 *  About text, team members, contact subtitle and contact items
 *  live as a single JSON file (content.json) in Blob.
 * ----------------------------------------------------------- */
export const DEFAULT_CONTENT = {
  about: {
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
/* Normalise an arbitrary object into the full content shape. */
export function shapeContent(d) {
  d = d || {};
  const about = d.about || {};
  const contact = d.contact || {};
  return {
    about: {
      text: typeof about.text === "string" ? about.text : DEFAULT_CONTENT.about.text
    },
    team: Array.isArray(d.team) ? d.team.map(shapeMember) : DEFAULT_CONTENT.team,
    contact: {
      subtitle: typeof contact.subtitle === "string" ? contact.subtitle : DEFAULT_CONTENT.contact.subtitle,
      items: Array.isArray(contact.items) ? contact.items.map(shapeContactItem) : DEFAULT_CONTENT.contact.items
    }
  };
}

async function findContentBlob() {
  const result = await list({ prefix: CONTENT_PATHNAME, limit: 5 });
  const sorted = (result.blobs || [])
    .filter((b) => b.pathname === CONTENT_PATHNAME)
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  return sorted[0] || null;
}

export async function loadContent() {
  try {
    const blob = await findContentBlob();
    if (!blob) return DEFAULT_CONTENT;
    const response = await fetch(blob.url, { cache: "no-store" });
    if (!response.ok) return DEFAULT_CONTENT;
    const data = await response.json();
    return shapeContent(data);
  } catch (err) {
    console.error("loadContent failed", err);
    return DEFAULT_CONTENT;
  }
}

export async function saveContent(content) {
  const shaped = shapeContent(content);
  await put(CONTENT_PATHNAME, JSON.stringify(shaped, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true
  });
  return shaped;
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
