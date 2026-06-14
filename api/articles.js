/* ============================================================
 * /api/articles
 *   GET                 -> list all articles (public)
 *   GET ?id=<id>        -> single article (public)
 *   POST                -> create new article (admin only)
 *   PUT  ?id=<id>       -> update article (admin only)
 *   DELETE ?id=<id>     -> delete article (admin only)
 * ============================================================ */
import {
  loadArticles, saveArticles, requireAdmin, isAdmin, readJsonBody, shapeArticle, uid
} from "./_lib.js";

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://x");
    const id = url.searchParams.get("id");

    if (req.method === "GET") {
      // Response varies by auth (admins see scheduled articles) — never cache it.
      res.setHeader("Cache-Control", "no-store, max-age=0");
      const items = await loadArticles();
      // Scheduling: articles with a future publish date are hidden from the
      // public until that calendar day; admins (signed-in) always see them.
      const today = new Date().toISOString().slice(0, 10);
      const admin = isAdmin(req);
      const isPublished = (a) => admin || !a.date || a.date <= today;

      if (id) {
        const found = items.find((a) => a.id === id);
        if (!found || !isPublished(found)) return res.status(404).json({ error: "Not found" });
        return res.status(200).json(found);
      }
      // Newest first, filtered for scheduling
      const visible = items.filter(isPublished);
      visible.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      return res.status(200).json(visible);
    }

    if (req.method === "POST") {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      const items = await loadArticles();
      const newArticle = shapeArticle({ ...body, id: body.id || uid() });
      items.push(newArticle);
      await saveArticles(items);
      return res.status(201).json(newArticle);
    }

    if (req.method === "PUT") {
      if (!requireAdmin(req, res)) return;
      if (!id) return res.status(400).json({ error: "Missing id" });
      const body = await readJsonBody(req);
      const items = await loadArticles();
      const idx = items.findIndex((a) => a.id === id);
      if (idx === -1) return res.status(404).json({ error: "Not found" });
      items[idx] = shapeArticle({ ...items[idx], ...body, id });
      await saveArticles(items);
      return res.status(200).json(items[idx]);
    }

    if (req.method === "DELETE") {
      if (!requireAdmin(req, res)) return;
      if (!id) return res.status(400).json({ error: "Missing id" });
      const items = await loadArticles();
      const next = items.filter((a) => a.id !== id);
      if (next.length === items.length) {
        return res.status(404).json({ error: "Not found" });
      }
      await saveArticles(next);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PUT, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("/api/articles error", err);
    return res.status(500).json({ error: "Server error", detail: String(err.message || err) });
  }
}
