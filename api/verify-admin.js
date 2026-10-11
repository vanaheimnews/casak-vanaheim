/* ============================================================
 * /api/verify-admin — the secret admin entry.
 *   POST { token } -> compares it with ADMIN_SECRET_KEY on the server.
 *                     Match: sets the signed, HttpOnly "vn_access" cookie
 *                     (without it /admin redirects home and login is refused).
 *   GET            -> { access } — is this browser's access cookie valid?
 * The key lives only in the Vercel environment, never in client code.
 * ============================================================ */
import {
  readJsonBody, safeEqual, accessSecret, createAccessToken, setAccessCookie,
  clearAccessCookie, hasAdminAccess, clientIp, attemptLimiter
} from "./_lib.js";

const limiter = attemptLimiter(8, 10 * 60 * 1000);   // 8 wrong keys / 10 min / IP

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method === "GET") {
    return res.status(200).json({ access: await hasAdminAccess(req) });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const secret = accessSecret();
    if (!secret) return res.status(500).json({ error: "ADMIN_SECRET_KEY env var not set" });
    const ip = clientIp(req);
    if (limiter.locked(ip)) return res.status(429).json({ ok: false });

    const body = await readJsonBody(req);
    const token = String((body && body.token) == null ? "" : body.token).trim();
    if (!safeEqual(token, secret)) {
      limiter.fail(ip);
      await new Promise((r) => setTimeout(r, 600));
      clearAccessCookie(res);
      return res.status(403).json({ ok: false });
    }
    limiter.reset(ip);
    setAccessCookie(res, await createAccessToken());
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(400).json({ ok: false });
  }
}
