/* ============================================================
 * /api/logout   POST  — clears the admin cookie.
 * ============================================================ */
import { clearAdminCookie } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  clearAdminCookie(res);
  return res.status(200).json({ ok: true });
}
