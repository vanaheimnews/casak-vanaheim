/* TEMPORARY diagnostic — lists blobs and dumps raw content.json. Remove after. */
import { list } from "@vercel/blob";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const out = { blobs: [], contentStatus: null, contentRaw: null, error: null };
  try {
    const r = await list({ limit: 100 });
    out.blobs = (r.blobs || []).map(function (b) {
      return { pathname: b.pathname, size: b.size, uploadedAt: b.uploadedAt, url: b.url };
    });
    const cj = out.blobs.find(function (b) { return b.pathname === "content.json"; });
    if (cj) {
      const resp = await fetch(cj.url + "?v=" + Date.now(), { cache: "no-store" });
      out.contentStatus = resp.status;
      out.contentRaw = (await resp.text()).slice(0, 500);
    } else {
      out.error = "content.json not found in list";
    }
  } catch (e) {
    out.error = String((e && e.message) || e);
  }
  res.status(200).json(out);
}
