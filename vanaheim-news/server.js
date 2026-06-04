require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const db = require("./db");

const PORT = process.env.PORT || 3000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "changeme";
const SESSION_SECRET = process.env.SESSION_SECRET || "vanaheim-dev-secret-change-me";

const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

db.ensureDefaultAdmin(ADMIN_USERNAME, ADMIN_PASSWORD);
db.seedArticlesIfEmpty();

const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error("Only image uploads are allowed."));
  }
});

function requireAuth(req, res, next) {
  if (req.session?.adminId) return next();
  res.status(401).json({ error: "Unauthorized" });
}

app.use("/uploads", express.static(UPLOADS_DIR));

app.get("/api/settings", (_req, res) => {
  res.json(db.getSettings());
});

app.get("/api/articles", (_req, res) => {
  res.json(db.listArticles({ publishedOnly: true }));
});

app.get("/api/articles/:slug", (req, res) => {
  const article = db.getArticleBySlug(req.params.slug, { publishedOnly: true });
  if (!article) return res.status(404).json({ error: "Article not found" });
  res.json(article);
});

app.post("/api/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const admin = db.verifyAdmin(username, password);
  if (!admin) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  req.session.adminId = admin.id;
  req.session.adminUsername = admin.username;
  res.json({ username: admin.username });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get("/api/admin/me", (req, res) => {
  if (!req.session?.adminId) return res.status(401).json({ error: "Unauthorized" });
  res.json({ username: req.session.adminUsername });
});

app.get("/api/admin/articles", requireAuth, (_req, res) => {
  res.json(db.listArticles({ publishedOnly: false }));
});

app.post("/api/admin/articles", requireAuth, (req, res) => {
  if (!req.body.title?.trim()) {
    return res.status(400).json({ error: "Title is required" });
  }
  const article = db.createArticle(req.body);
  res.status(201).json(article);
});

app.put("/api/admin/articles/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!req.body.title?.trim()) {
    return res.status(400).json({ error: "Title is required" });
  }
  const article = db.updateArticle(id, req.body);
  if (!article) return res.status(404).json({ error: "Article not found" });
  res.json(article);
});

app.delete("/api/admin/articles/:id", requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const deleted = db.deleteArticle(id);
  if (!deleted) return res.status(404).json({ error: "Article not found" });
  res.json({ ok: true });
});

app.put("/api/admin/settings", requireAuth, (req, res) => {
  res.json(db.updateSettings(req.body));
});

app.post("/api/admin/upload", requireAuth, (req, res) => {
  upload.single("image")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    res.json({ url: `/uploads/${req.file.filename}` });
  });
});

app.get("/clanek/:slug", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "article.html"));
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.use(express.static(path.join(__dirname, "public")));

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Vanaheim News running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin`);
  console.log(`Default login: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);
});
