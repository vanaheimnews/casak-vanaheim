/* ============================================================
 * /api/login   POST  { password }
 * Sets an httpOnly session cookie if the password matches
 * the ADMIN_PASSWORD env var.
 * ============================================================ */
import { setAdminCookie, clearAdminCookie, readJsonBody } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method === "GET") {
    // Convenience: report current session status.
    const ok = (req.headers.cookie || "").includes("vn_admin=");
    return res.status(200).json({ loggedIn: !!ok });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = await readJsonBody(req);
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) {
      return res.status(500).json({ error: "ADMIN_PASSWORD env var not set" });
    }
    if (!body || body.password !== expected) {
      // Same delay either way to make timing attacks marginally less useful.
      await new Promise((r) => setTimeout(r, 250));
      clearAdminCookie(res);
      return res.status(401).json({ error: "Wrong password" });
    }
    setAdminCookie(res, expected);
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(400).json({ error: "Bad request", detail: String(err.message || err) });
  }
}
