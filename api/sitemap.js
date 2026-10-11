/* ============================================================
 * /sitemap.xml  (rewritten to /api/sitemap in vercel.json)
 * Lists the homepage and every PUBLISHED article for search engines.
 * Scheduled articles appear automatically once their time passes.
 * ============================================================ */
import { loadArticles, isLive, sendServerError } from "./_lib.js";

function xmlEscape(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);
}

export default async function handler(req, res) {
  try {
    // Use the domain the request came in on (works for a custom domain too).
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const base = "https://" + host;
    const now = Date.now();
    const articles = (await loadArticles()).filter((a) => isLive(a, now));

    const urls = [{ loc: base + "/", lastmod: new Date().toISOString().slice(0, 10) }]
      .concat(articles.map((a) => ({
        loc: base + "/article?id=" + encodeURIComponent(a.id),
        lastmod: String(a.updatedAt || a.publishAt || a.date || "").slice(0, 10)
      })));

    const body =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map((u) =>
        "  <url><loc>" + xmlEscape(u.loc) + "</loc>" +
        (u.lastmod ? "<lastmod>" + xmlEscape(u.lastmod) + "</lastmod>" : "") +
        "</url>").join("\n") +
      "\n</urlset>\n";

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=3600");
    return res.status(200).send(body);
  } catch (err) {
    return sendServerError(req, res, err, "/api/sitemap");
  }
}
