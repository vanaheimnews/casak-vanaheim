/* ============================================================
 * /api/logout   POST  — ends the session AND forgets the secret-link access
 *                       (on a shared computer nothing admin-related remains).
 * ============================================================ */
import { clearAdminCookie, clearAccessCookie } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  clearAdminCookie(res);
  clearAccessCookie(res);
  return res.status(200).json({ ok: true });
}
