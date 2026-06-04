const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "vanaheim.db");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    excerpt TEXT DEFAULT '',
    content TEXT DEFAULT '',
    categories TEXT DEFAULT '',
    author TEXT DEFAULT 'Vanaheim',
    image_url TEXT DEFAULT '',
    layout TEXT DEFAULT 'normal',
    trending INTEGER DEFAULT 0,
    published INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const defaultSettings = {
  site_title: "Vanaheim News",
  logo_mark: "VN",
  logo_word: "vanaheim news",
  tagline:
    "Školní časopis Expediční Střední ScioŠkoly. Novinky ze světa kultury a nejenom.",
  nav_posts: "Příspěvky",
  nav_about: "O nás",
  nav_contact: "Kontakt",
  footer_credit: "Web je poháněn Vanaheim News."
};

const insertSetting = db.prepare(
  "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
);

for (const [key, value] of Object.entries(defaultSettings)) {
  insertSetting.run(key, value);
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "clanek";
}

function uniqueSlug(title, excludeId = null) {
  let base = slugify(title);
  let slug = base;
  let counter = 2;

  while (true) {
    const row = db
      .prepare("SELECT id FROM articles WHERE slug = ?")
      .get(slug);
    if (!row || (excludeId && row.id === excludeId)) return slug;
    slug = `${base}-${counter++}`;
  }
}

function getSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  return Object.fromEntries(rows.map((row) => [row.key, row.value]));
}

function updateSettings(partial) {
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  const allowed = Object.keys(defaultSettings);
  for (const key of allowed) {
    if (partial[key] !== undefined) {
      stmt.run(key, String(partial[key]));
    }
  }
  return getSettings();
}

function ensureDefaultAdmin(username, password) {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM admins").get();
  if (existing.count > 0) return;

  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    "INSERT INTO admins (username, password_hash) VALUES (?, ?)"
  ).run(username, hash);
}

function verifyAdmin(username, password) {
  const admin = db
    .prepare("SELECT id, username, password_hash FROM admins WHERE username = ?")
    .get(username);
  if (!admin) return null;
  if (!bcrypt.compareSync(password, admin.password_hash)) return null;
  return { id: admin.id, username: admin.username };
}

function listArticles({ publishedOnly = false } = {}) {
  const sql = publishedOnly
    ? "SELECT * FROM articles WHERE published = 1 ORDER BY datetime(created_at) DESC"
    : "SELECT * FROM articles ORDER BY datetime(created_at) DESC";
  return db.prepare(sql).all().map(formatArticle);
}

function getArticleBySlug(slug, { publishedOnly = false } = {}) {
  const row = db.prepare("SELECT * FROM articles WHERE slug = ?").get(slug);
  if (!row) return null;
  if (publishedOnly && !row.published) return null;
  return formatArticle(row);
}

function getArticleById(id) {
  const row = db.prepare("SELECT * FROM articles WHERE id = ?").get(id);
  return row ? formatArticle(row) : null;
}

function createArticle(data) {
  const slug = uniqueSlug(data.title);
  const stmt = db.prepare(`
    INSERT INTO articles (title, slug, excerpt, content, categories, author, image_url, layout, trending, published)
    VALUES (@title, @slug, @excerpt, @content, @categories, @author, @image_url, @layout, @trending, @published)
  `);
  const info = stmt.run({
    title: data.title.trim(),
    slug,
    excerpt: data.excerpt || "",
    content: data.content || "",
    categories: data.categories || "",
    author: data.author || "Vanaheim",
    image_url: data.image_url || "",
    layout: data.layout || "normal",
    trending: data.trending ? 1 : 0,
    published: data.published === false ? 0 : 1
  });
  return getArticleById(info.lastInsertRowid);
}

function updateArticle(id, data) {
  const existing = getArticleById(id);
  if (!existing) return null;

  const slug =
    data.title && data.title !== existing.title
      ? uniqueSlug(data.title, id)
      : existing.slug;

  db.prepare(`
    UPDATE articles SET
      title = @title,
      slug = @slug,
      excerpt = @excerpt,
      content = @content,
      categories = @categories,
      author = @author,
      image_url = @image_url,
      layout = @layout,
      trending = @trending,
      published = @published,
      updated_at = datetime('now')
    WHERE id = @id
  `).run({
    id,
    title: (data.title ?? existing.title).trim(),
    slug,
    excerpt: data.excerpt ?? existing.excerpt,
    content: data.content ?? existing.content,
    categories: data.categories ?? existing.categories,
    author: data.author ?? existing.author,
    image_url: data.image_url ?? existing.image_url,
    layout: data.layout ?? existing.layout,
    trending: data.trending ? 1 : 0,
    published: "published" in data ? (data.published ? 1 : 0) : existing.published ? 1 : 0
  });

  return getArticleById(id);
}

function deleteArticle(id) {
  const info = db.prepare("DELETE FROM articles WHERE id = ?").run(id);
  return info.changes > 0;
}

function seedArticlesIfEmpty() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM articles").get();
  if (count.count > 0) return;

  const samples = [
    {
      title: "Žížala s páteří",
      excerpt:
        "„Ale žížala přece nemá páteř!“ byste mi jistě rádi zakřičeli do obličeje.",
      content:
        "„Ale žížala přece nemá páteř!“ byste mi jistě rádi zakřičeli do obličeje. „Je to prvoústý kroužkovec, který nemá ani hloupou základní strunu,“ jistě byste se naparovali za své znalosti. A já bych vám to nevymlouvala, přece jen je to svatá pravda.",
      categories: "Biologie, Příroda, Vzdělávání",
      image_url:
        "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=900&q=80",
      layout: "feature",
      trending: 1
    },
    {
      title: "Divočina",
      categories: "Biologie, Komiksy, Příroda",
      image_url:
        "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=900&q=80",
      layout: "compact",
      trending: 1
    },
    {
      title: "Mluvíš?",
      categories: "Kurzy, Společnost, Výjezd, Vzdělávání, Školní projekt",
      image_url:
        "https://images.unsplash.com/photo-1598488035139-bdbb2231bb19?auto=format&fit=crop&w=900&q=80",
      layout: "compact",
      trending: 1
    },
    {
      title: "Expedice Španělsko, aneb co vše jsme po cestě našli",
      categories: "Cestování, Expedice, Komiksy",
      image_url:
        "https://images.unsplash.com/photo-1551632811-561732d1e609?auto=format&fit=crop&w=900&q=80",
      layout: "wide",
      trending: 1
    },
    {
      title: "Víte, kdo jsou architekti oceánů?",
      categories: "Biologie, Příroda, Vzdělávání, Životní prostředí",
      image_url:
        "https://images.unsplash.com/photo-1559827260-dc66d52bef19?auto=format&fit=crop&w=900&q=80",
      layout: "normal"
    }
  ];

  samples.forEach((article) => createArticle(article));
}

function formatArticle(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    content: row.content,
    categories: row.categories,
    author: row.author,
    image_url: row.image_url,
    layout: row.layout,
    trending: Boolean(row.trending),
    published: Boolean(row.published),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

module.exports = {
  ensureDefaultAdmin,
  verifyAdmin,
  getSettings,
  updateSettings,
  listArticles,
  getArticleBySlug,
  getArticleById,
  createArticle,
  updateArticle,
  deleteArticle,
  seedArticlesIfEmpty
};
