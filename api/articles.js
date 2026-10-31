/* ============================================================
 * /api/articles
 *   GET                 -> list all articles (public)
 *   GET ?id=<id>        -> single article (public)
 *   POST                -> create new article (admin only)
 *   PUT  ?id=<id>       -> update article (admin only)
 *   DELETE ?id=<id>     -> delete article (admin only)
 * ============================================================ */
import {
  loadArticles, updateArticles, requireAdmin, isAdmin, readJsonBody, shapeArticle, uid,
  isLive, compareNewest, sendServerError, setReadCache, ensureTaxonomy, restrictToTaxonomy
} from "./_lib.js";

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://x");
    const id = url.searchParams.get("id");

    if (req.method === "GET") {
      // admins (only on the admin host) see scheduled articles: that host is never cached
      setReadCache(req, res);
      const items = await loadArticles();
      // Scheduling: an article with a future publish time is hidden from the
      // public until that moment; admins (signed-in) always see them.
      const admin = await isAdmin(req);
      const now = Date.now();
      const isPublished = (a) => admin || isLive(a, now);

      if (id) {
        const found = items.find((a) => a.id === id);
        if (!found || !isPublished(found)) return res.status(404).json({ error: "Not found" });
        return res.status(200).json(found);
      }
      // Newest first, filtered for scheduling
      const visible = items.filter(isPublished);
      visible.sort(compareNewest);
      return res.status(200).json(visible);
    }

    if (req.method === "POST") {
      if (!(await requireAdmin(req, res))) return;
      const body = await readJsonBody(req);
      // updateArticles: a parallel save is never overwritten (redone on newer data)
      const r = await updateArticles(async (items) => {
        const taxonomy = await ensureTaxonomy(items);
        const article = shapeArticle({ ...body, id: uid() });   // never trust a client id
        restrictToTaxonomy(article, taxonomy);                    // tags / authors only from the lists
        return { value: items.concat([article]), article };
      });
      return res.status(201).json(r.article);
    }

    if (req.method === "PUT") {
      if (!(await requireAdmin(req, res))) return;
      if (!id) return res.status(400).json({ error: "Missing id" });
      const body = await readJsonBody(req);
      const r = await updateArticles(async (items) => {
        const idx = items.findIndex((a) => a.id === id);
        if (idx === -1) return { notFound: true };
        const taxonomy = await ensureTaxonomy(items);
        const next = items.slice();
        next[idx] = restrictToTaxonomy(shapeArticle({ ...items[idx], ...body, id }), taxonomy, items[idx]);
        return { value: next, article: next[idx] };
      });
      if (r.notFound) return res.status(404).json({ error: "Not found" });
      return res.status(200).json(r.article);
    }

    if (req.method === "DELETE") {
      if (!(await requireAdmin(req, res))) return;
      if (!id) return res.status(400).json({ error: "Missing id" });
      const r = await updateArticles(async (items) => {
        const next = items.filter((a) => a.id !== id);
        if (next.length === items.length) return { notFound: true };
        await ensureTaxonomy(items);   // the post's names stay in the lists
        return { value: next };
      });
      if (r.notFound) return res.status(404).json({ error: "Not found" });
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PUT, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return sendServerError(req, res, err, "/api/articles");
  }
}
