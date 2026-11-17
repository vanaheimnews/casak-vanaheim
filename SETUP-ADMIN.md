# Admin setup — one-time Vercel configuration

The site has an admin dashboard at **`/admin`** backed by Vercel Blob.
Before it works on a new deployment, set the environment variables below.
Everything else (how the site and the storage work, limits, backups,
troubleshooting) is in **`DOKUMENTACE.md`** (Czech).

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

Optional: `SESSION_SECRET` (see *Sessions & security*) and `ADMIN_HOST` —
the address the admin works on, needed only when the project or team is
renamed (the redirects in `vercel.json` name the same address and must be
changed with it).

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
- Article detail: `/article?id=<id>` (`/article.html?id=<id>` redirects there).

## Endpoints (for reference)

| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| GET | `/api/articles` | public / admin | published articles as a short list for cards; the admin gets every article in full (scheduled too) |
| GET | `/api/articles?id=<id>` | public | one published article |
| POST | `/api/articles` | admin | create |
| PUT | `/api/articles?id=<id>` | admin | update |
| DELETE | `/api/articles?id=<id>` | admin | delete |
| GET | `/api/content` | public | homepage layout, O nás, team, contacts |
| PUT | `/api/content` | admin | save them |
| GET | `/api/taxonomy` | public | global tag and author lists |
| POST | `/api/taxonomy` | admin | add / rename / delete an entry (also rewrites the articles using it) |
| POST | `/api/upload` | admin | upload a picture (JPG, PNG, WEBP, GIF → `images/`) or a PDF (→ `files/`) |
| POST | `/api/login` | admin address only | start a session (403 on any other address) |
| GET | `/api/login` | anyone | is this browser logged in? |
| POST | `/api/logout` | anyone | end the session |
| GET | `/sitemap.xml` | public | sitemap for search engines (`api/sitemap.js`) |

Data lives in the Blob store as `articles.json`, `content.json` and
`taxonomy.json`, uploads under `images/` and `files/`. The old
`articles-*.json` copies are backups from before 31 Oct 2026: keep them.

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
