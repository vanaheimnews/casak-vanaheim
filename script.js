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
     FALLBACK SAMPLE DATA (only used if the API can't be reached)
     ============================================================ */
  var FALLBACK_ARTICLES = [
    {
      id: "sample-1",
      title: "Vítejte ve školním magazínu",
      date: new Date().toISOString().slice(0, 10),
      authors: ["Redakce"],
      image: "",
      tags: ["Redakce"],
      kind: "article",
      body: "Toto je ukázkový článek. Až přidáte první vlastní článek v administraci, nahradí tento text."
    }
  ];

  var TEAM = [
    { name: "Anna Nováková",   role: "Šéfredaktorka",      image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80" },
    { name: "Petr Svoboda",    role: "Redaktor",           image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80" },
    { name: "Klára Dvořáková", role: "Ilustrátorka",       image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=400&q=80" },
    { name: "Tomáš Marek",     role: "Fotograf",           image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=400&q=80" },
    { name: "Eliška Horáková", role: "Korektorka",         image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80" },
    { name: "Martin Král",     role: "Grafik",             image: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80" },
    { name: "Jan Bárta",       role: "Autor komiksů",      image: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80" },
    { name: "Lucie Pokorná",   role: "Pedagogický dohled", image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80" }
  ];

  /* ============================================================
     STATE
     ============================================================ */
  var ARTICLES = [];
  var CONTENT = null;            // about/team/contact, loaded from /api/content
  var selectedTags = new Set();
  var PAGES = ["home", "articles", "about", "contact"];

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

  function formatDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    var months = ["ledna","února","března","dubna","května","června",
                  "července","srpna","září","října","listopadu","prosince"];
    return d.getDate() + ". " + months[d.getMonth()] + " " + d.getFullYear();
  }

  function byDateDesc(a, b) { return (b.date || "").localeCompare(a.date || ""); }

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
    var imgHtml = article.image
      ? '<img src="' + escapeHtml(article.image) + '" alt="" loading="lazy" decoding="async">'
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
    var imgHtml = article.image
      ? '<img src="' + escapeHtml(article.image) + '" alt="" loading="lazy" decoding="async">'
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
  function renderHome() {
    var grid = $("#home-grid");
    if (!grid) return;
    var newest = ARTICLES.slice().sort(byDateDesc).slice(0, 6);
    if (newest.length === 0) {
      grid.innerHTML = '<p class="empty-state" style="grid-column:1/-1;">Zatím žádné články.</p>';
      return;
    }
    // First (newest) article is the featured card; the rest are normal cards.
    grid.innerHTML = buildFeaturedCard(newest[0]) + newest.slice(1).map(buildCard).join("");
    renderQuickTags();
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
    list.innerHTML = getAllTags().map(function (tag) {
      return (
        '<label class="tag-checkbox">' +
          '<input type="checkbox" value="' + escapeHtml(tag) + '">' +
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
      if (empty) empty.hidden = false;
    } else {
      if (empty) empty.hidden = true;
      grid.innerHTML = filtered.map(buildCard).join("");
    }
  }

  function renderTeam() {
    var grid = $("#team-grid");
    if (!grid) return;
    // Prefer team from the content store; fall back to the built-in list.
    var team = (CONTENT && Array.isArray(CONTENT.team) && CONTENT.team.length) ? CONTENT.team : TEAM;
    grid.innerHTML = team.map(function (m) {
      var img = m.image
        ? '<img src="' + escapeHtml(m.image) + '" alt="Fotografie: ' + escapeHtml(m.name) + '" loading="lazy" decoding="async">'
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
    var text = CONTENT.about.text || "";
    // Split on blank lines into paragraphs.
    var paras = text.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean);
    if (paras.length === 0) return;
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
      if (c.url) {
        var external = /^https?:/i.test(c.url);
        var attrs = external ? ' target="_blank" rel="noopener"' : "";
        return '<li><a class="contact-item" href="' + escapeHtml(c.url) + '"' + attrs + ">" + inner + "</a></li>";
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
        ARTICLES = Array.isArray(items) && items.length ? items : FALLBACK_ARTICLES;
        writeCache(ARTICLES_CACHE_KEY, ARTICLES);
      })
      .catch(function () {
        if (!ARTICLES.length) ARTICLES = FALLBACK_ARTICLES;
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
        renderAbout();
        renderTeam();
        renderContacts();
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
        olderBtn.disabled = true;
        olderBtn.textContent = "Žádné starší články";
      });
    }

    wireNav();
    wireDrawer();
    wireTagFilter();

    // 1) Instant paint from cache (only what we actually have cached) so a
    //    refresh shows the correct content immediately — no flash of default,
    //    empty, or "no articles" states before the server responds.
    var cachedArticles = readCache(ARTICLES_CACHE_KEY);
    if (Array.isArray(cachedArticles) && cachedArticles.length) {
      ARTICLES = cachedArticles;
      renderHome();
      renderTagFilter();
      renderArticles();
    }
    var cachedContent = readCache(CONTENT_CACHE_KEY);
    if (cachedContent) {
      CONTENT = cachedContent;
      renderAbout();
      renderTeam();
      renderContacts();
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
