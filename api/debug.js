/* ============================================================
 * /api/debug — TEMPORARY diagnostic endpoint.
 * Reports (without leaking secret VALUES) whether the Blob store
 * is wired up and whether read/write actually work.
 * Remove after diagnosis.
 * ============================================================ */
import { list, put } from "@vercel/blob";

export default async function handler(req, res) {
  const out = {
    hasAdminPassword: !!process.env.ADMIN_PASSWORD,
    blobEnvVarNames: Object.keys(process.env).filter(function (k) {
      return k.toUpperCase().includes("BLOB");
    }),
    listOk: false,
    listError: null,
    blobCount: null,
    putOk: false,
    putError: null,
    putUrl: null
  };

  // Try a read.
  try {
    const r = await list({ limit: 1 });
    out.listOk = true;
    out.blobCount = (r.blobs || []).length;
  } catch (e) {
    out.listError = String((e && e.message) || e);
  }

  // Try a write.
  try {
    const r = await put("debug-test.txt", "ok " + Date.now(), {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "text/plain"
    });
    out.putOk = true;
    out.putUrl = r.url;
  } catch (e) {
    out.putError = String((e && e.message) || e);
  }

  res.status(200).json(out);
}
