/* ============================================================
 * /api/upload   POST  (admin only)
 * Body: { filename: string, dataUrl: string }   (data:<mime>;base64,...)
 * Accepts JPG, PNG, WEBP, GIF and PDF.
 * Returns: { url, mime }  — public Blob URL of the uploaded file.
 * ============================================================ */
import { createHash } from "node:crypto";
import { put, head, BlobNotFoundError } from "@vercel/blob";
import { requireAdmin, readJsonBody, sendServerError } from "./_lib.js";

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
    if (!(await requireAdmin(req, res))) return;

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
    /* The stored name comes from the file's content (SHA-256), so uploading
     * the same file again — a cover photo that is also in the text, a
     * re-import — reuses the stored copy: one head() ("simple" operation)
     * instead of a new upload ("advanced" operation, 2,000 a month on the
     * Hobby plan). PDFs keep their readable name after the hash. */
    const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 32);
    const pathname = mime === "application/pdf"
      ? `files/${hash}-${safeName}.${ext}`
      : `images/${hash}.${ext}`;
    const existing = async () => {
      try { return await head(pathname); } catch (e) { if (e instanceof BlobNotFoundError) return null; throw e; }
    };

    let stored = await existing();
    if (!stored) {
      try {
        stored = await put(pathname, buffer, {
          access: "public",
          contentType: mime,
          addRandomSuffix: false,
          allowOverwrite: false      // the same name is always the same content
        });
      } catch (e) {
        stored = await existing();   // a parallel upload of the same file got there first
        if (!stored) throw e;
      }
    }
    return res.status(200).json({ url: stored.url, mime });
  } catch (err) {
    return sendServerError(req, res, err, "/api/upload", "Upload failed");
  }
}
