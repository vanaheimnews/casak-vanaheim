/* ============================================================
   SCHOOL MAGAZINE — script.js (public site)
   ------------------------------------------------------------
   Loads articles from /api/articles (backed by Vercel Blob).
   Falls back to a small sample if the API is unreachable so the
   page is still usable in local preview.
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
  var selectedTags = new Set();
  var PAGES = ["home", "articles", "about", "contact"];
  var HOME_PAGE_SIZE = 6;
  var homeVisible = HOME_PAGE_SIZE;   // grows with „Starší články"

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

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  // Does an HTML string contain visible text? (an emptied editor leaves "<div><br></div>")
  function docHasText(html) {
    var t = document.createElement("template");
    t.innerHTML = html;
    return (t.content.textContent || "").replace(/[\s​]/g, "") !== "";
  }

  // "YYYY-MM-DD" is a calendar date — build it in LOCAL time. new Date(iso)
  // means UTC midnight, which showed the previous day west of UTC.
  function formatDate(iso) {
    if (!iso) return "";
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    var d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
    if (isNaN(d.getTime())) return iso;
    var months = ["ledna","února","března","dubna","května","června",
                  "července","srpna","září","října","listopadu","prosince"];
    return d.getDate() + ". " + months[d.getMonth()] + " " + d.getFullYear();
  }

  // Newest first: exact publish time when known, else the calendar date.
  function publishKey(a) { return a.publishAt || a.date || ""; }
  function byDateDesc(a, b) { return publishKey(b).localeCompare(publishKey(a)); }

  /* ============================================================
     PAGE SWITCHING
     ============================================================ */
  function showPage(name) {
    if (PAGES.indexOf(name) === -1) name = "home";
    PAGES.forEach(function (p) {
      var section = $("#page-" + p);
      if (!section) return;
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
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    closeDrawer();
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
     MOBILE DRAWER
     ============================================================ */
  function openDrawer() {
    $("#sidebar").classList.add("is-open");
    $("#burger").setAttribute("aria-expanded", "true");
    $("#sidebar-backdrop").hidden = false;
  }
  function closeDrawer() {
    var sidebar = $("#sidebar");
    if (!sidebar) return;
    sidebar.classList.remove("is-open");
    $("#burger").setAttribute("aria-expanded", "false");
    $("#sidebar-backdrop").hidden = true;
  }
  function wireDrawer() {
    $("#burger").addEventListener("click", function () {
      var open = $("#sidebar").classList.contains("is-open");
      if (open) closeDrawer(); else openDrawer();
    });
    $("#sidebar-backdrop").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeDrawer(); });
  }

  /* ============================================================
     CARD RENDERING — cards link to article.html?id=...
     ============================================================ */
  function buildCard(article) {
    var tagsHtml = (article.tags || []).map(function (t) {
      return '<span class="card-tag">' + escapeHtml(t) + "</span>";
    }).join("");
    var authors = (article.authors || []).join(", ");
    var kindLabel = article.kind === "comic" ? "Komiks" : "Článek";
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

  /* Featured card — full width, image left + title/meta/excerpt right. */
  function buildFeaturedCard(article) {
    var tagsHtml = (article.tags || []).map(function (t) {
      return '<span class="card-tag">' + escapeHtml(t) + "</span>";
    }).join("");
    var authors = (article.authors || []).join(", ");
    var kindLabel = article.kind === "comic" ? "Komiks" : "Článek";
    var href = "./article.html?id=" + encodeURIComponent(article.id);
    var imgSrc = VNSafe.url(article.image, { image: true });
    var imgHtml = imgSrc
      ? '<img src="' + escapeHtml(imgSrc) + '" alt="" loading="lazy" decoding="async">'
      : "";
    // Build a short excerpt from the body.
    var excerpt = String(article.body || "").trim().replace(/\s+/g, " ");
    if (excerpt.length > 220) excerpt = excerpt.slice(0, 220).replace(/\s+\S*$/, "") + "…";

    return (
      '<article class="card card--featured" data-id="' + escapeHtml(article.id) + '">' +
        '<a class="card-media" href="' + href + '" aria-label="' + escapeHtml(article.title) + '">' +
          imgHtml +
        "</a>" +
        '<div class="card-body">' +
          '<p class="card-eyebrow">Doporučujeme</p>' +
          '<h2 class="card-title"><a href="' + href + '">' + escapeHtml(article.title) + "</a></h2>" +
          '<div class="card-meta">' +
            '<time datetime="' + escapeHtml(article.date) + '">' + escapeHtml(formatDate(article.date)) + "</time>" +
            (authors ? "<span>" + escapeHtml(authors) + "</span>" : "") +
            '<span aria-label="Typ příspěvku">' + kindLabel + "</span>" +
          "</div>" +
          (excerpt ? '<p class="card-excerpt">' + escapeHtml(excerpt) + "</p>" : "") +
          '<div class="card-tags">' + tagsHtml + "</div>" +
        "</div>" +
      "</article>"
    );
  }

  /* ============================================================
     RENDERERS
     ============================================================ */
  /* Pinned articles lock to the top of the feed, in pin order. */
  function feedOrdered() {
    var pinned = (CONTENT && CONTENT.home && Array.isArray(CONTENT.home.pinned))
      ? CONTENT.home.pinned : [];
    var byDate = ARTICLES.slice().sort(byDateDesc);
    if (!pinned.length) return byDate;
    var top = [];
    pinned.forEach(function (id) {
      var hit = byDate.filter(function (a) { return a.id === id; })[0];
      if (hit) top.push(hit);
    });
    return top.concat(byDate.filter(function (a) { return pinned.indexOf(a.id) === -1; }));
  }

  /* Page background: solid colour or cover image (admin-configured). */
  function applyPageBackground(section, bg) {
    if (!section || !bg) return;
    var img = bg.image ? VNSafe.cssUrl(bg.image) : "";
    if (img) {
      section.style.backgroundImage = img;
      section.style.backgroundSize = "cover";
      section.style.backgroundPosition = "center";
    } else {
      section.style.backgroundImage = "";
    }
    section.style.backgroundColor = /^#[0-9a-f]{3,8}$/i.test(bg.color || "") ? bg.color : "";
  }

  /* Homepage rich document (incl. the „Téma" block) from the content store. */
  function renderHomeDoc() {
    var box = $("#home-doc-view");
    if (!box || !CONTENT || !CONTENT.home) return;
    box.innerHTML = VNSafe.html(CONTENT.home.doc);
    applyPageBackground($("#page-home"), CONTENT.home.background);
  }

  function renderHome() {
    var grid = $("#home-grid");
    if (!grid) return;
    var feed = feedOrdered();
    var newest = feed.slice(0, homeVisible);
    updateOlderBtn(feed.length);
    if (newest.length === 0) {
      grid.innerHTML = '<p class="empty-state" style="grid-column:1/-1;">' +
        (articlesFailed ? "Články se nepodařilo načíst. Zkuste stránku obnovit." : "Zatím žádné články.") +
        "</p>";
      return;
    }
    // First (newest) article is the featured card; the rest are normal cards.
    grid.innerHTML = buildFeaturedCard(newest[0]) + newest.slice(1).map(buildCard).join("");
    renderQuickTags();
  }
  // „Starší články" reveals the next HOME_PAGE_SIZE articles; disabled at the end.
  function updateOlderBtn(total) {
    var btn = $("#older-btn");
    if (!btn) return;
    var more = total > homeVisible;
    btn.disabled = !more;
    btn.textContent = more ? "Starší články" : "Žádné starší články";
  }

  /* Quick-tags widget — top categories as badges. */
  function renderQuickTags() {
    var box = $("#quick-tags");
    if (!box) return;
    var tags = getAllTags().slice(0, 5);
    box.innerHTML = tags.map(function (t) {
      return '<span class="badge">' + escapeHtml(t) + "</span>";
    }).join("");
  }

  function getAllTags() {
    var set = new Set();
    ARTICLES.forEach(function (a) {
      (a.tags || []).forEach(function (t) { set.add(t); });
    });
    return Array.from(set).sort(function (a, b) { return a.localeCompare(b); });
  }

  function renderTagFilter() {
    var list = $("#tag-list");
    if (!list) return;
    var tags = getAllTags();
    // Keep the user's ticks across re-renders (cache paint -> server data);
    // drop selections whose tag no longer exists so no invisible filter stays.
    selectedTags.forEach(function (t) { if (tags.indexOf(t) === -1) selectedTags.delete(t); });
    list.innerHTML = tags.map(function (tag) {
      return (
        '<label class="tag-checkbox">' +
          '<input type="checkbox" value="' + escapeHtml(tag) + '"' + (selectedTags.has(tag) ? " checked" : "") + ">" +
          "<span>" + escapeHtml(tag) + "</span>" +
        "</label>"
      );
    }).join("");
  }

  function renderArticles() {
    var grid = $("#articles-grid");
    var empty = $("#articles-empty");
    if (!grid) return;
    var filtered = ARTICLES.slice().sort(byDateDesc).filter(function (a) {
      if (selectedTags.size === 0) return true;
      return (a.tags || []).some(function (t) { return selectedTags.has(t); });
    });
    if (filtered.length === 0) {
      grid.innerHTML = "";
      if (empty) {
        empty.textContent = ARTICLES.length
          ? "Žádné příspěvky neodpovídají vybraným štítkům."
          : (articlesFailed ? "Články se nepodařilo načíst. Zkuste stránku obnovit." : "Zatím žádné příspěvky.");
        empty.hidden = false;
      }
    } else {
      if (empty) empty.hidden = true;
      grid.innerHTML = filtered.map(buildCard).join("");
    }
  }

  function renderTeam() {
    var grid = $("#team-grid");
    if (!grid) return;
    var team = (CONTENT && Array.isArray(CONTENT.team)) ? CONTENT.team : [];
    // No members -> hide the whole „Náš tým" section instead of stock photos.
    var section = grid.closest(".team");
    if (section) section.hidden = team.length === 0;
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
    if (!box || !CONTENT || !CONTENT.about) return;
    applyPageBackground($("#page-about"), CONTENT.about.background);
    // Prefer the rich document authored in the admin editor; fall back to the
    // plain-text field for content saved before the editor existed.
    var doc = VNSafe.html(CONTENT.about.doc);
    if (doc && (/<img\b/i.test(doc) || docHasText(doc))) { box.innerHTML = doc; return; }
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
    if (subtitle && typeof CONTENT.contact.subtitle === "string") {
      subtitle.textContent = CONTENT.contact.subtitle;
    }
    if (!list) return;
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
     TAG FILTER EVENTS
     ============================================================ */
  function wireTagFilter() {
    var list = $("#tag-list");
    var clearBtn = $("#clear-tags");
    if (!list) return;
    list.addEventListener("change", function (event) {
      var input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (input.checked) selectedTags.add(input.value);
      else selectedTags.delete(input.value);
      renderArticles();
    });
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        selectedTags.clear();
        $all("#tag-list input[type='checkbox']").forEach(function (cb) { cb.checked = false; });
        renderArticles();
      });
    }
  }

  /* ============================================================
     DATA LOADING
     ============================================================ */
  /* ---- localStorage cache so refreshes paint the last-known (correct)
          data instantly, with no flash of default content. ---- */
  var ARTICLES_CACHE_KEY = "vanaheim-articles-cache";
  var CONTENT_CACHE_KEY = "vanaheim-content-cache";
  function readCache(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function writeCache(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* quota/private mode */ }
  }

  function loadArticles() {
    return fetch("/api/articles", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("API " + r.status);
        return r.json();
      })
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

  function loadContent() {
    return fetch("/api/content", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("API " + r.status);
        return r.json();
      })
      .then(function (c) {
        CONTENT = c;
        writeCache(CONTENT_CACHE_KEY, c);
        renderHomeDoc();
        renderAbout();
        renderTeam();
        renderContacts();
        if (ARTICLES.length) renderHome();   // pin order depends on content
      })
      .catch(function () {
        // Offline / API down — keep whatever was rendered from cache.
      });
  }

  /* ============================================================
     BOOT
     ============================================================ */
  function boot() {
    var yearEl = $("#year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    var olderBtn = $("#older-btn");
    if (olderBtn) {
      olderBtn.addEventListener("click", function () {
        homeVisible += HOME_PAGE_SIZE;
        renderHome();
      });
    }

    wireNav();
    wireDrawer();
    wireTagFilter();

    // 1) Instant paint from cache (only what we actually have cached) so a
    //    refresh shows the correct content immediately — no flash of default,
    //    empty, or "no articles" states before the server responds.
    // (filter: older versions cached a built-in sample article)
    var rawCached = readCache(ARTICLES_CACHE_KEY);
    var cachedArticles = Array.isArray(rawCached) ? rawCached.filter(function (a) { return a && a.id !== "sample-1"; }) : [];
    if (cachedArticles.length) {
      ARTICLES = cachedArticles;
      renderHome();
      renderTagFilter();
      renderArticles();
    }
    var cachedContent = readCache(CONTENT_CACHE_KEY);
    if (cachedContent) {
      CONTENT = cachedContent;
      renderHomeDoc();
      renderAbout();
      renderTeam();
      renderContacts();
      if (ARTICLES.length) renderHome();
    }

    // 2) Reveal the initial tab (already populated from cache when available).
    var initial = (location.hash || "#home").slice(1);
    showPage(initial);

    // 3) Refresh from the server and re-render (updates cache too).
    loadArticles().then(function () {
      renderHome();
      renderTagFilter();
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
