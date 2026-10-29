/* ============================================================
 * /api/taxonomy — the global tag and author lists (see _taxonomy.js)
 *   GET   -> { tags: [...], authors: [...] }                  (public)
 *   POST  { list, action: add|rename|delete, name, to }       (admin only)
 *         -> { taxonomy, changed }   changed = articles rewritten
 *         409 { error: "duplicate" }, 400 { error: "reserved" | "empty" | … }
 * Rename / delete cascade into every article in the same request. Both
 * files are written with updateArticles / updateTaxonomy, so a parallel
 * save (another admin, another tab) is redone on top, never overwritten.
 * ============================================================ */
import {
  loadTaxonomy, ensureTaxonomy, updateArticles, updateTaxonomy, requireAdmin, readJsonBody, sendServerError
} from "./_lib.js";
import { applyTaxonomyAction, TaxonomyError } from "./_taxonomy.js";

/* The list write failed after the articles were rewritten: put back the
 * cascaded field of every post that is still exactly as the cascade left
 * it (posts changed since then are left alone). */
async function rollbackArticles(before, written, list) {
  const orig = new Map(before.map((a) => [a.id, a]));
  const ours = new Map(written.filter((a) => orig.get(a.id) !== a).map((a) => [a.id, a]));
  try {
    await updateArticles((items) => ({
      value: items.map((a) => {
        const w = ours.get(a.id);
        if (!w || JSON.stringify(a[list]) !== JSON.stringify(w[list])) return a;
        const o = orig.get(a.id);
        return { ...a, [list]: o[list], tagsUnspecified: !!o.tagsUnspecified };
      })
    }));
  } catch (e) { /* the caller reports the original error */ }
}

export default async function handler(req, res) {
  try {
    res.setHeader("Cache-Control", "no-store, max-age=0");

    if (req.method === "GET") {
      return res.status(200).json(await loadTaxonomy());
    }

    if (req.method === "POST") {
      if (!(await requireAdmin(req, res))) return;
      const body = await readJsonBody(req);
      let result;
      try {
        // 1) articles (the cascade), computed on the newest articles + lists
        result = await updateArticles(async (articles) => {
          const r = applyTaxonomyAction(await ensureTaxonomy(articles), articles, body);
          return r.changed ? { ...r, value: r.articles, before: articles } : r;
        });
        // 2) the lists: the same action on the newest lists
        const saved = await updateTaxonomy((taxonomy) => {
          const t = applyTaxonomyAction(taxonomy, [], body).taxonomy;
          return { value: t, taxonomy: t };
        });
        return res.status(200).json({ taxonomy: saved.taxonomy, changed: result.changed });
      } catch (e) {
        if (result && result.changed) await rollbackArticles(result.before, result.articles, body.list);
        if (e instanceof TaxonomyError) return res.status(e.status).json({ error: e.code });
        throw e;
      }
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return sendServerError(req, res, err, "/api/taxonomy");
  }
}
