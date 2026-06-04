/* ============================================================
 * /api/upload   POST  (admin only)
 * Body: { filename: string, dataUrl: string }   (data:image/...;base64,...)
 * Returns: { url }  — public Blob URL of the uploaded image.
 * ============================================================ */
import { put } from "@vercel/blob";
import { requireAdmin, readJsonBody } from "./_lib.js";

export const config = {
  api: { bodyParser: { sizeLimit: "8mb" } }
};

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).json({ error: "Method not allowed" });
    }
    if (!requireAdmin(req, res)) return;

    const body = await readJsonBody(req);
    const { filename, dataUrl } = body || {};
    if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
      return res.status(400).json({ error: "Missing or invalid dataUrl" });
    }

    // Parse data URL — split off "data:<mime>;base64," prefix.
    const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(dataUrl);
    if (!match) return res.status(400).json({ error: "Could not parse dataUrl" });
    const mime = match[1] || "application/octet-stream";
    const base64 = match[2] || "";
    const buffer = Buffer.from(base64, "base64");

    // Pick a safe pathname under images/.
    const ext = (mime.split("/")[1] || "bin").replace(/[^a-z0-9]/gi, "").toLowerCase();
    const safeName = String(filename || "image")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 64);
    const pathname = `images/${Date.now()}-${safeName}.${ext}`;

    const result = await put(pathname, buffer, {
      access: "public",
      contentType: mime,
      addRandomSuffix: true
    });

    return res.status(200).json({ url: result.url });
  } catch (err) {
    console.error("/api/upload error", err);
    return res.status(500).json({ error: "Upload failed", detail: String(err.message || err) });
  }
}
