/* ============================================================
 * /api/login   POST  { password }  -> sets a signed session cookie
 *              GET                 -> { loggedIn } (validates the cookie)
 * Logging in also requires the access cookie from the secret admin link
 * (/api/verify-admin), so the password can't be guessed by anyone who
 * doesn't know ADMIN_SECRET_KEY.
 * ============================================================ */
import {
  setAdminCookie, clearAdminCookie, readJsonBody, isAdmin, safeEqual, createSessionToken,
  adminPassword, hasAdminAccess, clientIp, attemptLimiter
} from "./_lib.js";

const limiter = attemptLimiter(8, 10 * 60 * 1000);   // 8 wrong passwords / 10 min / IP

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method === "GET") {
    // Validate the signature — a cookie that merely exists is not a session.
    return res.status(200).json({ loggedIn: await isAdmin(req) });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const expected = adminPassword();
    if (!expected) {
      return res.status(500).json({ error: "ADMIN_PASSWORD env var not set" });
    }
    if (!(await hasAdminAccess(req))) {
      return res.status(403).json({ error: "Přístup odepřen — otevřete administraci přes tajný odkaz." });
    }
    const ip = clientIp(req);
    if (limiter.locked(ip)) {
      return res.status(429).json({ error: "Příliš mnoho pokusů. Zkuste to znovu za několik minut." });
    }
    const body = await readJsonBody(req);
    const typed = String((body && body.password) == null ? "" : body.password).trim();
    if (!safeEqual(typed, expected)) {
      limiter.fail(ip);
      await new Promise((r) => setTimeout(r, 600));   // slow down guessing
      clearAdminCookie(res);
      return res.status(401).json({ error: "Wrong password" });
    }
    limiter.reset(ip);
    setAdminCookie(res, await createSessionToken());
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: "Bad request" });
  }
}
