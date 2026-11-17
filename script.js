/* ============================================================
   SCHOOL MAGAZINE — script.js (public site: index.html)
   ------------------------------------------------------------
   Four pages in one document (Domů, Příspěvky, O nás, Kontakt),
   switched by the URL hash. The data comes from /api/articles,
   /api/content and /api/taxonomy; the last answers are kept in
   localStorage so a refresh paints at once.
   Requires vn-core.js (VN), sanitize.js (VNSafe), home-layout.js (VNHome).
   ============================================================ */
(function () {
  "use strict";

  /* ============================================================
     STATE
     (No built-in sample articles/team any more: an empty magazine shows an
     empty state, and an API failure shows the cached data or an error —
     never fake articles whose links 404.)
     ============================================================ */
  var ARTICLES = [];
  var articlesFailed = false;    // last /api/articles load failed and nothing is cached
  var CONTENT = null;            // about/team/contact, loaded from /api/content
  var TAXO = null;               // global tag / author lists, from /api/taxonomy
  var selectedTags = new Set();  // ticked list entries, by nameKey()
  var selectedAuthors = new Set();
  var sortOrder = "new";         // "new" (newest first) | "old"
  var PAGES = ["home", "articles", "about", "contact"];
  var articlesReady = false;     // articles came from cache or the API (or it failed)
  var contentFailed = false;     // /api/content failed and nothing was cached

  /* Inline SVG icons for contact cards, keyed by type. */
  var CONTACT_ICONS = {
    Email:     '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    YouTube:   '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="3"/><path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none"/></svg>',
    Instagram: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>',
    Facebook:  '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 8h3V4h-3a4 4 0 0 0-4 4v2H7v4h3v8h4v-8h3l1-4h-4V8a1 1 0 0 1 1-1z" fill="currentColor" stroke="none"/></svg>',
    Odkaz:     '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg>'
  };

  /* ============================================================
     HELPERS
     ============================================================ */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  var escapeHtml = VN.escapeHtml, nameKey = VN.nameKey, formatDate = VN.formatDate;

  /* ============================================================
     PAGE SWITCHING
     ============================================================ */
  function showPage(name) {
    if (PAGES.indexOf(name) === -1) name = "home";
    PAGES.forEach(function (p) {
      var section = $("#page-" + p);
      var isActive = p === name;
      section.hidden = !isActive;
      section.classList.toggle("is-active", isActive);
    });
    $all(".nav-link").forEach(function (link) {
      link.classList.toggle("is-active", link.dataset.page === name);
    });
    if (location.hash !== "#" + name) {
      history.replaceState(null, "", "#" + name);
    }
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function wireNav() {
    $all(".nav-link").forEach(function (link) {
      link.addEventListener("click", function (event) {
        event.preventDefault();
        showPage(link.dataset.page);
      });
    });
    window.addEventListener("hashchange", function () {
      var name = (location.hash || "#home").slice(1);
      // Only real pages switch tabs; other anchors (e.g. the „Přejít k obsahu"
      // skip link -> #main) keep their normal in-page jump.
      if (PAGES.indexOf(name) === -1) return;
      showPage(name);
    });
  }

  /* ============================================================
     CARD RENDERING — cards link to article.html?id=...
     ============================================================ */
  function buildCard(article) {
    var tagsHtml = (article.tags || []).map(function (t) {
      return '<span class="card-tag">' + escapeHtml(t) + "</span>";
    }).join("");
    // its only tag was deleted: a placeholder, not a real (filterable) tag
    if (!tagsHtml && article.tagsUnspecified) tagsHtml = '<span class="card-tag card-tag--none">nespecifikováno</span>';
    var authors = (article.authors || []).join(", ");
    var kindLabel = VN.kindLabel(article);
    var href = "./article.html?id=" + encodeURIComponent(article.id);
    var imgSrc = VNSafe.url(article.image, { image: true });
    var imgHtml = imgSrc
      ? '<img src="' + escapeHtml(imgSrc) + '" alt="" loading="lazy" decoding="async">'
      : "";

    return (
      '<article class="card" data-id="' + escapeHtml(article.id) + '">' +
        '<a class="card-media" href="' + href + '" aria-label="' + escapeHtml(article.title) + '">' +
          imgHtml +
        "</a>" +
        '<div class="card-body">' +
          '<h2 class="card-title"><a href="' + href + '">' + escapeHtml(article.title) + "</a></h2>" +
          '<div class="card-meta">' +
            '<time datetime="' + escapeHtml(article.date) + '">' + escapeHtml(formatDate(article.date)) + "</time>" +
            (authors ? "<span>" + escapeHtml(authors) + "</span>" : "") +
            '<span aria-label="Typ příspěvku">' + kindLabel + "</span>" +
          "</div>" +
        "</div>" +
        '<div class="card-tags">' + tagsHtml + "</div>" +
      "</article>"
    );
  }

  /* ============================================================
     RENDERERS
     ============================================================ */
  /* Homepage = the block layout built in the admin editor (home-layout.js,
     the same renderer the editor uses). Blocks whose article isn't
     published (yet) stay as blank space. Sites without a saved layout get
     VNHome.defaultLayout — exactly what the editor shows until it's saved. */
  function renderHome() {
    var host = $("#home-canvas");
    // wait for the layout AND the articles, so blocks don't flash empty;
    // if the content API failed (and nothing is cached) use the default layout
    if (!articlesReady || (!CONTENT && !contentFailed)) return;
    var home = (CONTENT && CONTENT.home) || {};
    var layout = VNHome.normalize(home.layout) || VNHome.defaultLayout(CONTENT || {}, ARTICLES);
    if (articlesFailed) {
      layout.rows.unshift({ id: "r-err", blocks: [{ id: "b-err", kind: "text", span: 4, col: 0,
        html: '<p class="empty-state">Články se nepodařilo načíst. Zkuste stránku obnovit.</p>' }] });
    }
    VNHome.render(host, layout, ARTICLES);
    VN.applyBackground($("#home-frame"), home.background);
  }

  /* ============================================================
     FILTER ("Filtrovat") + SORT ("Seřadit")
     Lists come from the global tag / author lists (/api/taxonomy); the
     number next to each entry is how many published posts use it.
     Within a section the choice is OR (any ticked tag), between the
     sections AND (a ticked tag AND a ticked author).
     ============================================================ */
  function facetNames(list) {
    // until the global lists are loaded: the names the posts use
    return TAXO && Array.isArray(TAXO[list]) ? TAXO[list] : VN.namesUsed(ARTICLES, list);
  }
  function renderFacet(listEl, list, selected) {
    var names = facetNames(list), known = {};
    names.forEach(function (n) { known[nameKey(n)] = 1; });
    // a ticked entry that no longer exists must not stay as an invisible filter
    selected.forEach(function (k) { if (!known[k]) selected.delete(k); });
    listEl.innerHTML = VN.facetHtml(names, VN.countNames(ARTICLES, list), function (k) { return selected.has(k); }, true);
  }
  function renderFilters() {
    renderFacet($("#tag-list"), "tags", selectedTags);
    renderFacet($("#author-list"), "authors", selectedAuthors);
  }
  function matchesAny(a, list, selected) {
    if (!selected.size) return true;
    return (a[list] || []).some(function (n) { return selected.has(nameKey(n)); });
  }

  function renderArticles() {
    var grid = $("#articles-grid");
    var empty = $("#articles-empty");
    var filtered = ARTICLES.filter(function (a) {
      return matchesAny(a, "tags", selectedTags) && matchesAny(a, "authors", selectedAuthors);
    }).sort(sortOrder === "old" ? function (a, b) { return VN.byNewest(b, a); } : VN.byNewest);
    var active = selectedTags.size + selectedAuthors.size;
    var badge = $("#filter-count");
    badge.textContent = active ? String(active) : "";
    badge.hidden = !active;
    if (filtered.length === 0) {
      grid.innerHTML = "";
      empty.textContent = ARTICLES.length
        ? "Žádné příspěvky neodpovídají vybraným filtrům."
        : (articlesFailed ? "Články se nepodařilo načíst. Zkuste stránku obnovit." : "Zatím žádné příspěvky.");
      empty.hidden = false;
    } else {
      empty.hidden = true;
      grid.innerHTML = filtered.map(buildCard).join("");
    }
  }

  function renderTeam() {
    var grid = $("#team-grid");
    var team = (CONTENT && Array.isArray(CONTENT.team)) ? CONTENT.team : [];
    // No members -> hide the whole „Náš tým" section.
    grid.closest(".team").hidden = team.length === 0;
    grid.innerHTML = team.map(function (m) {
      var src = VNSafe.url(m.image, { image: true });
      var img = src
        ? '<img src="' + escapeHtml(src) + '" alt="Fotografie: ' + escapeHtml(m.name) + '" loading="lazy" decoding="async">'
        : "";
      return (
        '<article class="team-card">' +
          '<div class="team-photo">' + img + "</div>" +
          '<div class="team-body">' +
            '<h3 class="team-name">' + escapeHtml(m.name) + "</h3>" +
            '<p class="team-role">' + escapeHtml(m.role || "") + "</p>" +
          "</div>" +
        "</article>"
      );
    }).join("");
  }

  /* ============================================================
     ABOUT TEXT (from content store)
     ============================================================ */
  function renderAbout() {
    var box = $("#about-text");
    if (!CONTENT || !CONTENT.about) return;
    VN.applyBackground($("#page-about"), CONTENT.about.background);
    // Prefer the rich document authored in the admin editor; fall back to the
    // plain-text field for content saved before the editor existed.
    var doc = VNSafe.html(CONTENT.about.doc);
    if (doc && VN.hasContent(doc)) { box.innerHTML = doc; return; }
    var text = CONTENT.about.text || "";
    // Split on blank lines into paragraphs.
    var paras = text.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean);
    box.innerHTML = paras.map(function (p) {
      return "<p>" + escapeHtml(p).replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }

  /* ============================================================
     CONTACTS (from content store)
     ============================================================ */
  function renderContacts() {
    var list = $("#contact-list");
    var subtitle = $("#contact-subtitle");
    if (!CONTENT || !CONTENT.contact) return;
    if (typeof CONTENT.contact.subtitle === "string") subtitle.textContent = CONTENT.contact.subtitle;
    var items = Array.isArray(CONTENT.contact.items) ? CONTENT.contact.items : [];
    if (items.length === 0) return; // keep fallback markup
    list.innerHTML = items.map(function (c) {
      var icon = CONTACT_ICONS[c.type] || CONTACT_ICONS.Odkaz;
      var inner =
        '<span class="contact-icon" aria-hidden="true">' + icon + "</span>" +
        '<span class="contact-text">' +
          '<span class="contact-label">' + escapeHtml(c.type) + "</span>" +
          '<span class="contact-value">' + escapeHtml(c.label) + "</span>" +
        "</span>";
      // Only http(s)/mailto/tel/relative links; e.g. javascript: renders as plain text.
      var href = VNSafe.url(c.url);
      if (href) {
        var external = /^https?:/i.test(href);
        var attrs = external ? ' target="_blank" rel="noopener noreferrer"' : "";
        return '<li><a class="contact-item" href="' + escapeHtml(href) + '"' + attrs + ">" + inner + "</a></li>";
      }
      return '<li><div class="contact-item">' + inner + "</div></li>";
    }).join("");
  }

  /* ============================================================
     FILTER + SORT EVENTS
     ============================================================ */
  function wireFeedTools() {
    var toggle = $("#filter-toggle"), panel = $("#filter-panel");
    var sortBtn = $("#sort-toggle"), sortMenu = $("#sort-menu");
    toggle.addEventListener("click", function () {
      panel.hidden = !panel.hidden;
      toggle.setAttribute("aria-expanded", panel.hidden ? "false" : "true");
    });
    [["#tag-list", selectedTags], ["#author-list", selectedAuthors]].forEach(function (pair) {
      var list = $(pair[0]), selected = pair[1];
      list.addEventListener("change", function (event) {
        var input = event.target;
        if (!(input instanceof HTMLInputElement)) return;
        if (input.checked) selected.add(input.value);
        else selected.delete(input.value);
        renderFilters();
        renderArticles();
      });
    });
    $("#clear-tags").addEventListener("click", function () {
      selectedTags.clear();
      selectedAuthors.clear();
      renderFilters();
      renderArticles();
    });
    function closeSort() { sortMenu.hidden = true; sortBtn.setAttribute("aria-expanded", "false"); }
    sortBtn.addEventListener("click", function () {
      sortMenu.hidden = !sortMenu.hidden;
      sortBtn.setAttribute("aria-expanded", sortMenu.hidden ? "false" : "true");
    });
    sortMenu.addEventListener("click", function (e) {
      var opt = e.target.closest("[data-sort]");
      if (!opt) return;
      sortOrder = opt.dataset.sort === "old" ? "old" : "new";
      $all("[data-sort]", sortMenu).forEach(function (b) {
        b.setAttribute("aria-checked", b === opt ? "true" : "false");
      });
      $("#sort-label").textContent = opt.textContent;
      closeSort();
      renderArticles();
    });
    document.addEventListener("click", function (e) {
      if (!sortMenu.hidden && !sortMenu.contains(e.target) && !sortBtn.contains(e.target)) closeSort();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSort(); });
  }

  function renderArticleViews() {
    renderHome();
    renderFilters();
    renderArticles();
  }
  function renderContentViews() {
    renderAbout();
    renderTeam();
    renderContacts();
    renderHome();
  }

  /* ============================================================
     DATA LOADING
     ============================================================ */
  /* ---- localStorage cache so refreshes paint the last-known (correct)
          data instantly, with no flash of default content. ---- */
  var ARTICLES_CACHE_KEY = "vanaheim-articles-cache";
  var CONTENT_CACHE_KEY = "vanaheim-content-cache";
  var TAXO_CACHE_KEY = "vanaheim-taxonomy-cache";
  function readCache(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function writeCache(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* quota/private mode */ }
  }

  function loadArticles() {
    return VN.getJson("/api/articles", { cache: "no-store" })
      .then(function (items) {
        ARTICLES = Array.isArray(items) ? items : [];   // an empty magazine stays empty
        articlesFailed = false;
        writeCache(ARTICLES_CACHE_KEY, ARTICLES);
      })
      .catch(function () {
        // API down: keep the cached articles if we painted any, else show an error.
        articlesFailed = ARTICLES.length === 0;
      });
  }

  function loadTaxonomy() {
    return VN.getJson("/api/taxonomy", { cache: "no-store" })
      .then(function (t) {
        TAXO = t;
        writeCache(TAXO_CACHE_KEY, t);
      })
      .catch(function () { /* keep the cached lists, else the names the posts use */ });
  }

  function loadContent() {
    return VN.getJson("/api/content", { cache: "no-store" })
      .then(function (c) {
        CONTENT = c;
        writeCache(CONTENT_CACHE_KEY, c);
        renderContentViews();
      })
      .catch(function () {
        // Offline / API down — keep whatever was rendered from cache; with no
        // cache the homepage falls back to the default layout.
        contentFailed = !CONTENT;
        renderHome();
      });
  }

  /* ============================================================
     BOOT
     ============================================================ */
  function boot() {
    $("#year").textContent = new Date().getFullYear();

    wireNav();
    wireFeedTools();

    // 1) Instant paint from cache (only what we actually have cached) so a
    //    refresh shows the correct content immediately — no flash of default,
    //    empty, or "no articles" states before the server responds.
    // (filter: older versions cached a built-in sample article)
    var cachedTaxo = readCache(TAXO_CACHE_KEY);
    if (cachedTaxo && Array.isArray(cachedTaxo.tags)) TAXO = cachedTaxo;
    var rawCached = readCache(ARTICLES_CACHE_KEY);
    var cachedArticles = Array.isArray(rawCached) ? rawCached.filter(function (a) { return a && a.id !== "sample-1"; }) : [];
    if (cachedArticles.length) {
      ARTICLES = cachedArticles;
      articlesReady = true;
      renderArticleViews();
    }
    var cachedContent = readCache(CONTENT_CACHE_KEY);
    if (cachedContent) {
      CONTENT = cachedContent;
      renderContentViews();
    }

    // 2) Reveal the initial tab (already populated from cache when available).
    var initial = (location.hash || "#home").slice(1);
    showPage(initial);

    // 3) Refresh from the server and re-render (updates cache too).
    loadArticles().then(function () {
      articlesReady = true;
      renderArticleViews();
    });
    loadTaxonomy().then(function () {
      if (!articlesReady) return;        // the articles' render shows the lists too
      renderFilters();
      renderArticles();
    });
    loadContent();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
