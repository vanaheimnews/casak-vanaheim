// In-memory stand-in for @vercel/blob 2.x (list / put / head / del + errors), served by devserver.mjs at /__blob/.
export const STORE = new Map();   // pathname -> { pathname, url, uploadedAt, etag, body }
export const OPS = { advanced: 0, simple: 0 };
let seq = 0;
const base = () => "http://localhost:" + (process.env.PORT || 8765) + "/__blob/";

export class BlobError extends Error {}
export class BlobNotFoundError extends BlobError { constructor() { super("Vercel Blob: The requested blob does not exist"); } }
export class BlobPreconditionFailedError extends BlobError { constructor() { super("Vercel Blob: Precondition failed: ETag mismatch."); } }

export async function list({ prefix = "" } = {}) {
  OPS.advanced++;
  const blobs = [...STORE.values()].filter((b) => b.pathname.startsWith(prefix))
    .map(({ pathname, url, uploadedAt }) => ({ pathname, url, uploadedAt }));
  return { blobs };
}
export async function head(urlOrPathname) {
  OPS.simple++;
  const p = String(urlOrPathname).replace(base(), "");
  const b = STORE.get(p);
  if (!b) throw new BlobNotFoundError();
  return { pathname: b.pathname, url: b.url, uploadedAt: b.uploadedAt, etag: b.etag };
}
export async function put(pathname, body, opts = {}) {
  OPS.advanced++;
  await new Promise((r) => setTimeout(r, 5));     // let parallel requests interleave
  if (opts.addRandomSuffix) {
    const dot = pathname.lastIndexOf(".");
    pathname = pathname.slice(0, dot) + "-" + (++seq).toString(36) + Math.random().toString(36).slice(2, 6) + pathname.slice(dot);
  }
  const cur = STORE.get(pathname);
  if (cur && !opts.allowOverwrite) throw new BlobError("Vercel Blob: This blob already exists, use `allowOverwrite: true` if you want to overwrite it.");
  if (opts.ifMatch && (!cur || cur.etag !== opts.ifMatch)) throw new BlobPreconditionFailedError();
  const uploadedAt = new Date(Date.now() + ++seq).toISOString();
  const rec = { pathname, url: base() + pathname, uploadedAt, etag: '"' + seq.toString(36) + Math.random().toString(36).slice(2, 8) + '"', body: String(body) };
  STORE.set(pathname, rec);
  return { pathname, url: rec.url, uploadedAt, etag: rec.etag };
}
export async function del(urls) {
  for (const u of [].concat(urls)) for (const [k, v] of STORE) if (v.url === u || k === u) STORE.delete(k);
}
