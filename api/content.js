/* ============================================================
 * /api/content
 *   GET  -> full site content (homepage, About, team, contacts) — public
 *   PUT  -> replace full content object (admin only)
 * Body for PUT = the whole content object; it is shaped/validated
 * server-side before saving.
 * ============================================================ */
import {
  loadContent, saveContent, requireAdmin, readJsonBody, sendServerError, setReadCache, methodNotAllowed
} from "./_lib.js";

/* bodyParser.sizeLimit is Next.js API-route syntax; plain Vercel functions
 * are not known to honour it, and Vercel caps every request at 4.5 MB
 * anyway. Kept until a deployment test proves it inert: if it is honoured,
 * it is the size limit of a content save (shapeLayout does not cut html). */
export const config = {
  api: { bodyParser: { sizeLimit: "2mb" } }
};

export default async function handler(req, res) {
  try {
    // Not cached by default (PUT, 405); a GET replaces this with
    // setReadCache() below (public reads: CDN-cached for 5 minutes).
    res.setHeader("Cache-Control", "no-store, max-age=0");

    if (req.method === "GET") {
      setReadCache(req, res);
      const content = await loadContent();
      return res.status(200).json(content);
    }

    if (req.method === "PUT") {
      if (!(await requireAdmin(req, res))) return;
      const body = await readJsonBody(req);
      const saved = await saveContent(body);
      return res.status(200).json(saved);
    }

    return methodNotAllowed(res, "GET, PUT");
  } catch (err) {
    return sendServerError(req, res, err, "/api/content");
  }
}
