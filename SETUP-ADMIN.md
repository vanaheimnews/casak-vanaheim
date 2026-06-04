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

- Public site: `https://casak-vanaheim.vercel.app/`
- Admin: `https://casak-vanaheim.vercel.app/admin` (not linked anywhere)
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
