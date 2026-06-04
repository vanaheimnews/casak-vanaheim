const loginScreen = document.querySelector("#login-screen");
const adminApp = document.querySelector("#admin-app");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const logoutButton = document.querySelector("#logout-button");
const articlesList = document.querySelector("#articles-list");
const articleDialog = document.querySelector("#article-dialog");
const articleForm = document.querySelector("#article-form");
const settingsForm = document.querySelector("#settings-form");
const settingsSuccess = document.querySelector("#settings-success");
const imagePreview = document.querySelector("#image-preview");

let articles = [];

init();

async function init() {
  bindEvents();
  const session = await checkSession();
  if (session) showAdmin();
}

function bindEvents() {
  loginForm.addEventListener("submit", handleLogin);
  logoutButton.addEventListener("click", handleLogout);

  document.querySelectorAll(".admin-nav-btn").forEach((button) => {
    button.addEventListener("click", () => switchPanel(button.dataset.panel));
  });

  document.querySelector("#new-article-btn").addEventListener("click", () => openArticleDialog());
  document.querySelector("#cancel-article").addEventListener("click", () => articleDialog.close());
  articleForm.addEventListener("submit", handleArticleSave);
  settingsForm.addEventListener("submit", handleSettingsSave);

  articleForm.image_file.addEventListener("change", handleImagePreview);
  articleForm.image_url.addEventListener("input", updateImagePreviewFromUrl);
}

async function checkSession() {
  try {
    return await api("/api/admin/me");
  } catch {
    return null;
  }
}

async function handleLogin(event) {
  event.preventDefault();
  loginError.hidden = true;

  const formData = new FormData(loginForm);
  try {
    await api("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: formData.get("username"),
        password: formData.get("password")
      })
    });
    loginForm.reset();
    showAdmin();
  } catch (error) {
    loginError.textContent = error.message;
    loginError.hidden = false;
  }
}

async function handleLogout() {
  await api("/api/admin/logout", { method: "POST" });
  adminApp.hidden = true;
  loginScreen.hidden = false;
}

async function showAdmin() {
  loginScreen.hidden = true;
  adminApp.hidden = false;
  await Promise.all([loadArticles(), loadSettings()]);
}

function switchPanel(name) {
  document.querySelectorAll(".admin-nav-btn").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.panel === name);
  });
  document.querySelectorAll(".admin-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `panel-${name}`);
  });
}

async function loadArticles() {
  articles = await api("/api/admin/articles");
  renderArticlesList();
}

function renderArticlesList() {
  if (articles.length === 0) {
    articlesList.innerHTML = `<p class="admin-empty">Zatím žádné články. Klikněte na „Nový článek“.</p>`;
    return;
  }

  articlesList.innerHTML = articles
    .map(
      (article) => `
      <article class="admin-article-row">
        <div>
          <strong>${escapeHtml(article.title)}</strong>
          <p class="admin-article-meta">
            ${article.published ? "Publikováno" : "Koncept"}
            ${article.trending ? " · Trending" : ""}
            · ${formatDate(article.created_at)}
          </p>
        </div>
        <div class="admin-row-actions">
          <a href="/clanek/${encodeURIComponent(article.slug)}" target="_blank" rel="noreferrer">Náhled</a>
          <button type="button" class="admin-button" data-edit="${article.id}">Upravit</button>
          <button type="button" class="admin-button admin-button--danger" data-delete="${article.id}">Smazat</button>
        </div>
      </article>
    `
    )
    .join("");

  articlesList.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const article = articles.find((item) => item.id === Number(button.dataset.edit));
      if (article) openArticleDialog(article);
    });
  });

  articlesList.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = Number(button.dataset.delete);
      const article = articles.find((item) => item.id === id);
      if (!article) return;
      if (!confirm(`Opravdu smazat „${article.title}“?`)) return;
      await api(`/api/admin/articles/${id}`, { method: "DELETE" });
      await loadArticles();
    });
  });
}

function openArticleDialog(article = null) {
  articleForm.reset();
  imagePreview.hidden = true;
  imagePreview.innerHTML = "";

  document.querySelector("#article-dialog-title").textContent = article
    ? "Upravit článek"
    : "Nový článek";

  if (article) {
    articleForm.id.value = article.id;
    articleForm.title.value = article.title;
    articleForm.excerpt.value = article.excerpt || "";
    articleForm.content.value = article.content || "";
    articleForm.categories.value = article.categories || "";
    articleForm.author.value = article.author || "Vanaheim";
    articleForm.image_url.value = article.image_url || "";
    articleForm.layout.value = article.layout || "normal";
    articleForm.trending.checked = article.trending;
    articleForm.published.checked = article.published;
    if (article.image_url) showImagePreview(article.image_url);
  } else {
    articleForm.id.value = "";
    articleForm.author.value = "Vanaheim";
    articleForm.published.checked = true;
  }

  articleDialog.showModal();
}

async function handleArticleSave(event) {
  event.preventDefault();

  const formData = new FormData(articleForm);
  let imageUrl = formData.get("image_url");

  const file = formData.get("image_file");
  if (file && file.size > 0) {
    const uploadData = new FormData();
    uploadData.append("image", file);
    const uploadResult = await api("/api/admin/upload", {
      method: "POST",
      body: uploadData
    });
    imageUrl = uploadResult.url;
  }

  const payload = {
    title: formData.get("title"),
    excerpt: formData.get("excerpt"),
    content: formData.get("content"),
    categories: formData.get("categories"),
    author: formData.get("author"),
    image_url: imageUrl || "",
    layout: formData.get("layout"),
    trending: formData.get("trending") === "on",
    published: formData.get("published") === "on"
  };

  const id = formData.get("id");
  if (id) {
    await api(`/api/admin/articles/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } else {
    await api("/api/admin/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }

  articleDialog.close();
  await loadArticles();
}

async function loadSettings() {
  const settings = await api("/api/settings");
  for (const [key, value] of Object.entries(settings)) {
    const field = settingsForm.elements[key];
    if (field) field.value = value;
  }
}

async function handleSettingsSave(event) {
  event.preventDefault();
  const formData = new FormData(settingsForm);
  const payload = Object.fromEntries(formData.entries());
  await api("/api/admin/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  settingsSuccess.hidden = false;
  setTimeout(() => {
    settingsSuccess.hidden = true;
  }, 2500);
}

function handleImagePreview() {
  const file = articleForm.image_file.files[0];
  if (!file) return;
  showImagePreview(URL.createObjectURL(file));
}

function updateImagePreviewFromUrl() {
  const url = articleForm.image_url.value.trim();
  if (url) showImagePreview(url);
  else {
    imagePreview.hidden = true;
    imagePreview.innerHTML = "";
  }
}

function showImagePreview(src) {
  imagePreview.hidden = false;
  imagePreview.innerHTML = `<img src="${escapeAttr(src)}" alt="Náhled obrázku">`;
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("cs-CZ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
