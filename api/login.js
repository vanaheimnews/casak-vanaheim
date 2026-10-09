/* ============================================================
 * /api/login   POST  { password }  -> sets a signed session cookie
 *              GET                 -> { loggedIn } (validates the cookie)
 * ============================================================ */
import {
  setAdminCookie, clearAdminCookie, readJsonBody, isAdmin, safeEqual, createSessionToken
} from "./_lib.js";

/* Best-effort brute-force brake: after MAX_FAILS wrong passwords from one IP
 * within WINDOW_MS, further attempts get 429. Serverless instances don't
 * share memory, so this only slows an attacker hitting a warm instance —
 * a hard limit needs shared storage (see SETUP-ADMIN.md). */
const FAILS = new Map();            // ip -> { count, resetAt }
const MAX_FAILS = 8;
const WINDOW_MS = 10 * 60 * 1000;

function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "");
  return fwd.split(",")[0].trim() || "unknown";
}
function isLocked(ip) {
  const f = FAILS.get(ip);
  if (!f) return false;
  if (Date.now() > f.resetAt) { FAILS.delete(ip); return false; }
  return f.count >= MAX_FAILS;
}
function noteFail(ip) {
  const now = Date.now();
  const f = FAILS.get(ip);
  if (!f || now > f.resetAt) FAILS.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else f.count++;
  if (FAILS.size > 5000) FAILS.clear();   // keep memory bounded
}

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
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) {
      return res.status(500).json({ error: "ADMIN_PASSWORD env var not set" });
    }
    const ip = clientIp(req);
    if (isLocked(ip)) {
      return res.status(429).json({ error: "Příliš mnoho pokusů. Zkuste to znovu za několik minut." });
    }
    const body = await readJsonBody(req);
    if (!body || !safeEqual(body.password, expected)) {
      noteFail(ip);
      await new Promise((r) => setTimeout(r, 600));   // slow down guessing
      clearAdminCookie(res);
      return res.status(401).json({ error: "Wrong password" });
    }
    FAILS.delete(ip);
    setAdminCookie(res, await createSessionToken());
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: "Bad request" });
  }
}
