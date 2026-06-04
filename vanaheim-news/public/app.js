let settings = {};
let articles = [];
let searchQuery = "";

const isArticlePage = document.body.dataset.page === "article";

init();

async function init() {
  try {
    settings = await fetchJSON("/api/settings");
    renderChrome();

    if (isArticlePage) {
      await loadArticlePage();
      return;
    }

    articles = await fetchJSON("/api/articles");
    bindHomeEvents();
    renderFeed();
  } catch (error) {
    showFatal(error.message);
  }
}

function bindHomeEvents() {
  const sortSelect = document.querySelector("#feed-sort");
  const searchInput = document.querySelector("#feed-search");

  sortSelect?.addEventListener("change", renderFeed);
  searchInput?.addEventListener("input", () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    renderFeed();
  });
}

function renderChrome() {
  document.title = settings.site_title || "Vanaheim News";

  const header = document.querySelector("#site-header");
  if (header) {
    header.innerHTML = `
      <div class="header-inner">
        ${isArticlePage ? "" : `
        <form class="site-search" role="search" aria-label="Hledat na webu">
          <label class="visually-hidden" for="feed-search">Hledat</label>
          <input id="feed-search" type="search" placeholder="Hledat">
        </form>`}
        <div class="brand">
          <a href="/" class="site-logo" aria-label="${escapeHtml(settings.site_title)}">
            <span class="logo-mark">${escapeHtml(settings.logo_mark)}</span>
            <span class="logo-word">${escapeHtml(settings.logo_word)}</span>
          </a>
          <p class="site-title"><a href="/">${escapeHtml(settings.site_title)}</a></p>
        </div>
        <nav class="site-nav" aria-label="Hlavní navigace">
          <a href="/">${escapeHtml(settings.nav_posts)}</a>
          <a href="/#about">${escapeHtml(settings.nav_about)}</a>
          <a href="/#contact">${escapeHtml(settings.nav_contact)}</a>
        </nav>
      </div>
    `;
  }

  const footer = document.querySelector("#site-footer");
  if (footer) {
    footer.innerHTML = `
      <p class="footer-tagline" id="about">${escapeHtml(settings.tagline)}</p>
      <nav class="footer-nav" aria-label="Patička" id="contact">
        <a href="/">${escapeHtml(settings.nav_posts)}</a>
        <a href="/#about">${escapeHtml(settings.nav_about)}</a>
        <a href="/#contact">${escapeHtml(settings.nav_contact)}</a>
      </nav>
      <p class="footer-credit">${escapeHtml(settings.footer_credit)}</p>
    `;
  }
}

function renderFeed() {
  const feed = document.querySelector("#feed");
  const emptyState = document.querySelector("#empty-state");
  const visibleCount = document.querySelector("#visible-count");
  const sortSelect = document.querySelector("#feed-sort");
  if (!feed) return;

  let visible = [...articles];

  if (searchQuery) {
    visible = visible.filter((article) => getSearchText(article).includes(searchQuery));
  }

  visible = sortArticles(visible, sortSelect?.value || "newest");

  feed.innerHTML = visible.map((article) => renderStoryCard(article)).join("");
  emptyState.hidden = visible.length > 0;
  if (visibleCount) visibleCount.textContent = visible.length;

  renderTrending();
}

function renderTrending() {
  const section = document.querySelector("#trending-section");
  const grid = document.querySelector("#trending-grid");
  if (!section || !grid) return;

  const trending = articles.filter((a) => a.trending).slice(0, 4);
  section.hidden = trending.length === 0;
  grid.innerHTML = trending.map((article) => renderTrendingCard(article)).join("");
}

function renderStoryCard(article) {
  const layoutClass = layoutToClass(article.layout);
  const imageStyle = article.image_url
    ? `style="--image:url('${escapeAttr(article.image_url)}')"`
    : "";
  const date = formatDate(article.created_at);

  return `
    <article class="story ${layoutClass}">
      <div class="story-art" ${imageStyle} aria-hidden="true"></div>
      <div class="story-content">
        ${article.categories ? `<p class="story-categories">${escapeHtml(article.categories)}</p>` : ""}
        <h3><a href="/clanek/${encodeURIComponent(article.slug)}">${escapeHtml(article.title)}</a></h3>
        ${article.excerpt ? `<p class="dek">${escapeHtml(article.excerpt)}</p>` : ""}
        <p class="story-author">${escapeHtml(article.author)}</p>
        <time class="pub-date" datetime="${article.created_at}">${date}</time>
      </div>
    </article>
  `;
}

function renderTrendingCard(article) {
  const imageStyle = article.image_url
    ? `style="--image:url('${escapeAttr(article.image_url)}')"`
    : "";

  return `
    <article class="trending-card">
      <div class="trending-art" ${imageStyle}></div>
      <div class="trending-content">
        ${article.categories ? `<p class="story-categories">${escapeHtml(article.categories)}</p>` : ""}
        <h3><a href="/clanek/${encodeURIComponent(article.slug)}">${escapeHtml(article.title)}</a></h3>
        <p class="story-author">${escapeHtml(article.author)}</p>
      </div>
    </article>
  `;
}

async function loadArticlePage() {
  const slug = window.location.pathname.replace(/^\/clanek\//, "");
  const container = document.querySelector("#article-page");
  if (!slug || !container) return;

  try {
    const article = await fetchJSON(`/api/articles/${encodeURIComponent(slug)}`);
    document.title = `${article.title} – ${settings.site_title}`;

    const imageStyle = article.image_url
      ? `style="--image:url('${escapeAttr(article.image_url)}')"`
      : "";

    container.innerHTML = `
      <a class="back-link" href="/">← Zpět na příspěvky</a>
      ${article.image_url ? `<div class="article-hero" ${imageStyle}></div>` : ""}
      ${article.categories ? `<p class="story-categories">${escapeHtml(article.categories)}</p>` : ""}
      <h1 class="article-title">${escapeHtml(article.title)}</h1>
      <p class="article-meta">${escapeHtml(article.author)} · ${formatDate(article.created_at)}</p>
      ${article.excerpt ? `<p class="article-excerpt">${escapeHtml(article.excerpt)}</p>` : ""}
      <div class="article-body">${formatContent(article.content)}</div>
    `;
  } catch {
    container.innerHTML = `
      <h1 class="article-title">Článek nenalezen</h1>
      <p><a href="/">Zpět na hlavní stránku</a></p>
    `;
  }
}

function sortArticles(items, mode) {
  return [...items].sort((a, b) => {
    if (mode === "oldest") {
      return new Date(a.created_at) - new Date(b.created_at);
    }
    if (mode === "title") {
      return a.title.localeCompare(b.title, "cs");
    }
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

function layoutToClass(layout) {
  if (layout === "feature") return "story--lead story--feature";
  if (layout === "compact") return "story--compact";
  if (layout === "wide") return "story--wide";
  return "";
}

function getSearchText(article) {
  return [article.title, article.excerpt, article.categories, article.author, article.content]
    .join(" ")
    .toLowerCase();
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function formatContent(text) {
  if (!text) return "";
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`)
    .join("");
}

function showFatal(message) {
  const main = document.querySelector("#main") || document.body;
  main.innerHTML = `<p class="empty-state">Web se nepodařilo načíst. Spusťte server pomocí <code>npm start</code>. (${escapeHtml(message)})</p>`;
}

async function fetchJSON(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || response.statusText);
  return data;
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
