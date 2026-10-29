/* ============================================================
 * /api/taxonomy — the global tag and author lists (see _taxonomy.js)
 *   GET   -> { tags: [...], authors: [...] }                  (public)
 *   POST  { list, action: add|rename|delete, name, to }       (admin only)
 *         -> { taxonomy, changed }   changed = articles rewritten
 *         409 { error: "duplicate" }, 400 { error: "reserved" | "empty" | … }
 * Rename / delete cascade into every article in the same request.
 * ============================================================ */
import {
  loadArticles, saveArticles, loadTaxonomy, saveTaxonomy, ensureTaxonomy, requireAdmin, readJsonBody, sendServerError
} from "./_lib.js";
import { applyTaxonomyAction, TaxonomyError } from "./_taxonomy.js";

export default async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "no-store, max-age=0");

    if (req.method === "GET") {
      return res.status(200).json(await loadTaxonomy());
    }

    if (req.method === "POST") {
      if (!(await requireAdmin(req, res))) return;
      const body = await readJsonBody(req);
      const articles = await loadArticles();
      const taxonomy = await ensureTaxonomy(articles);
      let result;
      try {
        result = applyTaxonomyAction(taxonomy, articles, body);
      } catch (e) {
        if (e instanceof TaxonomyError) return res.status(e.status).json({ error: e.code });
        throw e;
      }
      // Articles first; if the list write then fails they are rolled back.
      if (result.changed) await saveArticles(result.articles);
      let saved;
      try {
        saved = await saveTaxonomy(result.taxonomy);
      } catch (e) {
        // keep both files consistent: put the articles back as they were
        if (result.changed) { try { await saveArticles(articles); } catch (e2) { /* report the first error */ } }
        throw e;
      }
      return res.status(200).json({ taxonomy: saved, changed: result.changed });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return sendServerError(req, res, err, "/api/taxonomy");
  }
}
