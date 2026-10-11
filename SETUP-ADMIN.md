# Admin setup — one-time Vercel configuration

The site now has a hidden admin dashboard at **`/admin`** backed by Vercel Blob.
Before it works on the deployment, set two environment variables.

## 1. Set `ADMIN_PASSWORD`

In Vercel → Project → **Settings → Environment Variables**, add:

| Key             | Value                           | Environments |
|-----------------|---------------------------------|--------------|
| `ADMIN_PASSWORD`| (any strong password you choose)| Production, Preview, Development |

This is the password admins type at `/admin`.

## 2. Verify the Blob token exists

When you connected the Blob store, Vercel automatically added:

| Key                       | Value                | Environments |
|---------------------------|----------------------|--------------|
| `BLOB_READ_WRITE_TOKEN`   | (auto-generated)     | All          |

If it's missing, go to **Storage → your Blob store → .env.local** and copy it
in manually.

## 3. Redeploy

After saving env vars, trigger a redeploy (push any commit, or hit
**Deployments → ⋯ → Redeploy**). Env vars are baked in at build time for
serverless functions.

## How to use

- Public site: `https://www.vanaheim-news.cz/`
- Admin: `https://casak-vanaheim-git-main-vanaheim-news-projects.vercel.app` (opens `/admin`).
  Guarded by Vercel Authentication (Settings → Deployment Protection →
  Standard Protection): only people signed in to the Vercel account get in,
  then they enter `ADMIN_PASSWORD`. On every other address `/admin` redirects
  to the homepage and admin API calls are refused (`isAdminHost` in `api/_lib.js`).
- Article detail: `/article.html?id=<id>` (cards on the public site link here)

## Endpoints (for reference)

| Method | Path                       | Auth   | Purpose                |
|--------|----------------------------|--------|------------------------|
| GET    | `/api/articles`            | public | list all articles      |
| GET    | `/api/articles?id=<id>`    | public | single article         |
| POST   | `/api/articles`            | admin  | create                 |
| PUT    | `/api/articles?id=<id>`    | admin  | update                 |
| DELETE | `/api/articles?id=<id>`    | admin  | delete                 |
| POST   | `/api/upload`              | admin  | upload image to Blob   |
| POST   | `/api/login`               | public | start admin session    |
| GET    | `/api/login`               | public | check session state    |
| POST   | `/api/logout`              | public | end admin session      |

Articles are stored as a single JSON file (`articles.json`) inside the Blob
store; uploaded images live under `images/`.

Each save writes a new version of the JSON; the newest three versions are
kept as backups (Vercel → Storage → Blob → `articles-*.json`). If a save ever
goes wrong, the previous version can be restored by deleting the newest file.

## Sessions & security

- The login cookie is a signed, 14-day token — it never contains the password.
  **Changing `ADMIN_PASSWORD` logs out every device** (use it after a leak).
- Optional `SESSION_SECRET` env var (any long random string) adds extra
  server-only entropy to the token signature.
- Wrong-password attempts are slowed and capped per IP (best effort: each
  serverless instance counts on its own). For a hard limit, add a Vercel
  Firewall rate-limit rule for `POST /api/login`, or keep the counter in a
  shared store such as Upstash Redis.
- Logging out removes the cookie from that browser; a copied cookie stays
  valid until it expires or the password changes (true server-side logout
  would need a session store).
