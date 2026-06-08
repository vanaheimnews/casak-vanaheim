/* ============================================================
 * /api/content
 *   GET  -> full site content (about text, team, contact) — public
 *   PUT  -> replace full content object (admin only)
 * Body for PUT = the whole content object; it is shaped/validated
 * server-side before saving.
 * ============================================================ */
import { loadContent, saveContent, requireAdmin, readJsonBody } from "./_lib.js";

export const config = {
  api: { bodyParser: { sizeLimit: "2mb" } }
};

export default async function handler(req, res) {
  try {
    // Never let the CDN cache this API response.
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("X-Impl", "content-v3");

    if (req.method === "GET") {
      const content = await loadContent();
      return res.status(200).json(content);
    }

    if (req.method === "PUT") {
      if (!requireAdmin(req, res)) return;
      const body = await readJsonBody(req);
      const saved = await saveContent(body);
      return res.status(200).json(saved);
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("/api/content error", err);
    return res.status(500).json({ error: "Server error", detail: String(err.message || err) });
  }
}
