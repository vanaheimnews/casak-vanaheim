/* ============================================================
 * /api/logout   POST  — clears the admin cookie.
 * ============================================================ */
import { clearAdminCookie, methodNotAllowed } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return methodNotAllowed(res, "POST");
  clearAdminCookie(res);
  return res.status(200).json({ ok: true });
}
