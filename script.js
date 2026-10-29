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
    // its only tag was deleted: a placeholder, not a real (filterable) tag
    if (!tagsHtml && article.tagsUnspecified) tagsHtml = '<span class="card-tag card-tag--none">nespecifikováno</span>';
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

  /* ============================================================
     RENDERERS
     ============================================================ */
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
    var color = /^#[0-9a-f]{3,8}$/i.test(bg.color || "") ? bg.color : "";
    section.style.backgroundColor = color;
    section.classList.toggle("has-bg", !!(img || color));
  }

  /* Homepage = the block layout built in the admin editor (home-layout.js,
     the same renderer the editor uses). Blocks whose article isn't
     published (yet) stay as blank space. Sites without a saved layout get
     VNHome.defaultLayout — exactly what the editor shows until it's saved. */
  function renderHome() {
    var host = $("#home-canvas");
    // wait for the layout AND the articles, so blocks don't flash empty;
    // if the content API failed (and nothing is cached) use the default layout
    if (!host || !articlesReady || (!CONTENT && !contentFailed)) return;
    var home = (CONTENT && CONTENT.home) || {};
    var layout = VNHome.normalize(home.layout) || VNHome.defaultLayout(CONTENT || {}, ARTICLES);
    if (articlesFailed) {
      layout.rows.unshift({ id: "r-err", blocks: [{ id: "b-err", kind: "text", span: 4, col: 0,
        html: '<p class="empty-state">Články se nepodařilo načíst. Zkuste stránku obnovit.</p>' }] });
    }
    VNHome.render(host, layout, ARTICLES);
    applyPageBackground($("#home-frame"), home.background);
  }

  /* ============================================================
     FILTER ("Filtrovat") + SORT ("Seřadit")
     Lists come from the global tag / author lists (/api/taxonomy); the
     number next to each entry is how many published posts use it.
     Within a section the choice is OR (any ticked tag), between the
     sections AND (a ticked tag AND a ticked author).
     ============================================================ */
  function nameKey(n) { return String(n == null ? "" : n).replace(/\s+/g, " ").trim().toLocaleLowerCase("cs"); }
  function facetNames(list) {
    if (TAXO && Array.isArray(TAXO[list])) return TAXO[list];
    // lists not loaded (yet): the names the posts use
    var seen = {}, out = [];
    ARTICLES.forEach(function (a) {
      (a[list] || []).forEach(function (n) { if (!seen[nameKey(n)]) { seen[nameKey(n)] = 1; out.push(n); } });
    });
    return out.sort(function (a, b) { return a.localeCompare(b, "cs"); });
  }
  function facetCounts(list) {
    var counts = {};
    ARTICLES.forEach(function (a) {
      var seen = {};
      (a[list] || []).forEach(function (n) {
        var k = nameKey(n);
        if (!seen[k]) { seen[k] = 1; counts[k] = (counts[k] || 0) + 1; }
      });
    });
    return counts;
  }
  function renderFacet(listEl, list, selected) {
    if (!listEl) return;
    var names = facetNames(list), counts = facetCounts(list), known = {};
    names.forEach(function (n) { known[nameKey(n)] = 1; });
    // a ticked entry that no longer exists must not stay as an invisible filter
    selected.forEach(function (k) { if (!known[k]) selected.delete(k); });
    listEl.innerHTML = names.length ? names.map(function (n) {
      var k = nameKey(n), c = counts[k] || 0, on = selected.has(k);
      return (
        '<label class="tag-checkbox' + (c || on ? "" : " is-empty") + '">' +
          '<input type="checkbox" value="' + escapeHtml(k) + '"' + (on ? " checked" : "") + (c || on ? "" : " disabled") + ">" +
          "<span>" + escapeHtml(n) + ' <span class="tag-count">(' + c + ")</span></span>" +
        "</label>"
      );
    }).join("") : '<span class="tag-list-empty">Zatím nic.</span>';
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
    if (!grid) return;
    var filtered = ARTICLES.filter(function (a) {
      return matchesAny(a, "tags", selectedTags) && matchesAny(a, "authors", selectedAuthors);
    }).sort(sortOrder === "old" ? function (a, b) { return byDateDesc(b, a); } : byDateDesc);
    var active = selectedTags.size + selectedAuthors.size;
    var badge = $("#filter-count");
    if (badge) { badge.textContent = active ? String(active) : ""; badge.hidden = !active; }
    if (filtered.length === 0) {
      grid.innerHTML = "";
      if (empty) {
        empty.textContent = ARTICLES.length
          ? "Žádné příspěvky neodpovídají vybraným filtrům."
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
     FILTER + SORT EVENTS
     ============================================================ */
  function wireFeedTools() {
    var toggle = $("#filter-toggle"), panel = $("#filter-panel");
    var sortBtn = $("#sort-toggle"), sortMenu = $("#sort-menu");
    if (toggle && panel) {
      toggle.addEventListener("click", function () {
        panel.hidden = !panel.hidden;
        toggle.setAttribute("aria-expanded", panel.hidden ? "false" : "true");
      });
    }
    [["#tag-list", selectedTags], ["#author-list", selectedAuthors]].forEach(function (pair) {
      var list = $(pair[0]), selected = pair[1];
      if (!list) return;
      list.addEventListener("change", function (event) {
        var input = event.target;
        if (!(input instanceof HTMLInputElement)) return;
        if (input.checked) selected.add(input.value);
        else selected.delete(input.value);
        renderFilters();
        renderArticles();
      });
    });
    var clearBtn = $("#clear-tags");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        selectedTags.clear();
        selectedAuthors.clear();
        renderFilters();
        renderArticles();
      });
    }
    if (!sortBtn || !sortMenu) return;
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

  function loadTaxonomy() {
    return fetch("/api/taxonomy", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("API " + r.status);
        return r.json();
      })
      .then(function (t) {
        TAXO = t;
        writeCache(TAXO_CACHE_KEY, t);
      })
      .catch(function () { /* keep the cached lists, else the names the posts use */ });
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
        renderHome();
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
    var yearEl = $("#year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    wireNav();
    wireDrawer();
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
      renderHome();
      renderFilters();
      renderArticles();
    }
    var cachedContent = readCache(CONTENT_CACHE_KEY);
    if (cachedContent) {
      CONTENT = cachedContent;
      renderAbout();
      renderTeam();
      renderContacts();
      renderHome();
    }

    // 2) Reveal the initial tab (already populated from cache when available).
    var initial = (location.hash || "#home").slice(1);
    showPage(initial);

    // 3) Refresh from the server and re-render (updates cache too).
    Promise.all([loadArticles(), loadTaxonomy()]).then(function () {
      articlesReady = true;
      renderHome();
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
