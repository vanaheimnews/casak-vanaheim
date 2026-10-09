/* ============================================================
 * /api/upload   POST  (admin only)
 * Body: { filename: string, dataUrl: string }   (data:<mime>;base64,...)
 * Accepts JPG, PNG, WEBP, GIF and PDF.
 * Returns: { url, mime }  — public Blob URL of the uploaded file.
 * ============================================================ */
import { put } from "@vercel/blob";
import { requireAdmin, readJsonBody } from "./_lib.js";

// Whitelisted MIME types -> stored file extension.
const ALLOWED = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf"
};

// NOTE: Vercel caps the whole request at 4.5 MB regardless of sizeLimit,
// so the admin client compresses images and rejects files > ~3.2 MB
// (base64 adds ~33 %).
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
    const mime = (match[1] || "").toLowerCase();
    const ext = ALLOWED[mime];
    if (!ext) {
      return res.status(415).json({ error: "Nepodporovaný formát (" + (mime || "neznámý") + "). Povolené: JPG, PNG, WEBP, GIF, PDF." });
    }
    const buffer = Buffer.from(match[2] || "", "base64");
    if (!buffer.length) return res.status(400).json({ error: "Prázdný soubor" });

    // Safe pathname; strip the original extension so it isn't doubled.
    const safeName = String(filename || "file")
      .replace(/\.[^.]*$/, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 64) || "file";
    const folder = mime === "application/pdf" ? "files" : "images";
    const pathname = `${folder}/${Date.now()}-${safeName}.${ext}`;

    const result = await put(pathname, buffer, {
      access: "public",
      contentType: mime,
      addRandomSuffix: true
    });

    return res.status(200).json({ url: result.url, mime });
  } catch (err) {
    console.error("/api/upload error", err);
    return res.status(500).json({ error: "Upload failed", detail: String(err.message || err) });
  }
}
