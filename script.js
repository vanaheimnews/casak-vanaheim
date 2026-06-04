/* ============================================================
   SCHOOL MAGAZINE — script.js
   ------------------------------------------------------------
   Responsibilities (kept intentionally small + modular):
     1. Page switching driven by sidebar nav + URL hash.
     2. Mobile burger / drawer toggle.
     3. Render Home grid (newest 6 articles).
     4. Render Articles grid + tag filter (checkbox-based).
     5. Render Team grid for the About page.
   No external dependencies. Pure DOM API.
   ============================================================ */
(function () {
  "use strict";

  /* ============================================================
     SAMPLE DATA
     Replace these arrays with real content (or fetch from JSON).
     Each article: { id, title, date, authors, image, tags, kind }
       kind = "article" | "comic"
     Comics can carry multiple images in `images` (used in future
     detail pages); the card itself shows the cover thumbnail.
     ============================================================ */
  var ARTICLES = [
    {
      id: 1,
      title: "Jak vznikl náš magazín",
      date: "2026-05-22",
      authors: ["Anna Nováková"],
      image: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=900&q=80",
      tags: ["Redakce", "Příběhy"],
      kind: "article"
    },
    {
      id: 2,
      title: "Rozhovor s panem ředitelem",
      date: "2026-05-18",
      authors: ["Petr Svoboda"],
      image: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=900&q=80",
      tags: ["Rozhovor", "Škola"],
      kind: "article"
    },
    {
      id: 3,
      title: "Komiks: Den ve školní jídelně",
      date: "2026-05-15",
      authors: ["Klára Dvořáková", "Jan Bárta"],
      image: "https://images.unsplash.com/photo-1513151233558-d860c5398176?auto=format&fit=crop&w=900&q=80",
      tags: ["Komiks", "Humor"],
      kind: "comic",
      images: ["#", "#", "#", "#", "#", "#"]
    },
    {
      id: 4,
      title: "Reportáž z lyžařského výcviku",
      date: "2026-04-30",
      authors: ["Tomáš Marek"],
      image: "https://images.unsplash.com/photo-1551524559-8af4e6624178?auto=format&fit=crop&w=900&q=80",
      tags: ["Reportáž", "Sport"],
      kind: "article"
    },
    {
      id: 5,
      title: "Recenze knihy měsíce",
      date: "2026-04-22",
      authors: ["Eliška Horáková"],
      image: "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=900&q=80",
      tags: ["Recenze", "Kultura"],
      kind: "article"
    },
    {
      id: 6,
      title: "Fotoreportáž: Den otevřených dveří",
      date: "2026-04-15",
      authors: ["Martin Král"],
      image: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=900&q=80",
      tags: ["Fotoreportáž", "Škola"],
      kind: "article"
    },
    {
      id: 7,
      title: "Komiks: Cesta do knihovny",
      date: "2026-04-08",
      authors: ["Klára Dvořáková"],
      image: "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?auto=format&fit=crop&w=900&q=80",
      tags: ["Komiks", "Kultura"],
      kind: "comic",
      images: ["#", "#", "#", "#"]
    },
    {
      id: 8,
      title: "Sportovní turnaj očima diváka",
      date: "2026-04-02",
      authors: ["Petr Svoboda"],
      image: "https://images.unsplash.com/photo-1505842465776-3d90f616310d?auto=format&fit=crop&w=900&q=80",
      tags: ["Reportáž", "Sport"],
      kind: "article"
    }
  ];

  var TEAM = [
    { name: "Anna Nováková",   role: "Šéfredaktorka", image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80" },
    { name: "Petr Svoboda",    role: "Redaktor",      image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80" },
    { name: "Klára Dvořáková", role: "Ilustrátorka",  image: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=400&q=80" },
    { name: "Tomáš Marek",     role: "Fotograf",      image: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=400&q=80" },
    { name: "Eliška Horáková", role: "Korektorka",    image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80" },
    { name: "Martin Král",     role: "Grafik",        image: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80" },
    { name: "Jan Bárta",       role: "Autor komiksů", image: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=400&q=80" },
    { name: "Lucie Pokorná",   role: "Pedagogický dohled", image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80" }
  ];

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

  // Newest first.
  function byDateDesc(a, b) { return (b.date || "").localeCompare(a.date || ""); }

  /* ============================================================
     PAGE SWITCHING
     ============================================================ */
  var PAGES = ["home", "articles", "about", "contact"];

  function showPage(name) {
    if (PAGES.indexOf(name) === -1) name = "home";

    // Toggle sections
    PAGES.forEach(function (p) {
      var section = $("#page-" + p);
      var isActive = p === name;
      if (!section) return;
      section.hidden = !isActive;
      section.classList.toggle("is-active", isActive);
    });

    // Toggle nav active state
    $all(".nav-link").forEach(function (link) {
      link.classList.toggle("is-active", link.dataset.page === name);
    });

    // Sync hash (without adding a history entry on initial load)
    if (location.hash !== "#" + name) {
      history.replaceState(null, "", "#" + name);
    }

    // Reset scroll so each tab feels like its own page
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });

    // Close mobile drawer when navigating
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
    var sidebar = $("#sidebar");
    var burger = $("#burger");
    var backdrop = $("#sidebar-backdrop");
    sidebar.classList.add("is-open");
    burger.setAttribute("aria-expanded", "true");
    backdrop.hidden = false;
  }
  function closeDrawer() {
    var sidebar = $("#sidebar");
    var burger = $("#burger");
    var backdrop = $("#sidebar-backdrop");
    if (!sidebar) return;
    sidebar.classList.remove("is-open");
    burger.setAttribute("aria-expanded", "false");
    backdrop.hidden = true;
  }
  function wireDrawer() {
    $("#burger").addEventListener("click", function () {
      var open = $("#sidebar").classList.contains("is-open");
      if (open) closeDrawer(); else openDrawer();
    });
    $("#sidebar-backdrop").addEventListener("click", closeDrawer);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeDrawer();
    });
  }

  /* ============================================================
     CARD RENDERING
     ============================================================ */
  function buildCard(article) {
    var tagsHtml = (article.tags || []).map(function (t) {
      return '<span class="card-tag">' + escapeHtml(t) + "</span>";
    }).join("");

    var authors = (article.authors || []).join(", ");
    var kindLabel = article.kind === "comic" ? "Komiks" : "Článek";

    return (
      '<article class="card" data-id="' + article.id + '">' +
        '<div class="card-media">' +
          '<img src="' + escapeHtml(article.image) + '" alt="" loading="lazy" decoding="async">' +
        "</div>" +
        '<div class="card-body">' +
          '<h2 class="card-title">' + escapeHtml(article.title) + "</h2>" +
          '<div class="card-meta">' +
            '<time datetime="' + escapeHtml(article.date) + '">' + escapeHtml(formatDate(article.date)) + "</time>" +
            "<span>" + escapeHtml(authors) + "</span>" +
            '<span aria-label="Typ příspěvku">' + kindLabel + "</span>" +
          "</div>" +
        "</div>" +
        '<div class="card-tags">' + tagsHtml + "</div>" +
      "</article>"
    );
  }

  /* ============================================================
     HOME — newest 6
     ============================================================ */
  function renderHome() {
    var grid = $("#home-grid");
    var newest = ARTICLES.slice().sort(byDateDesc).slice(0, 6);
    grid.innerHTML = newest.map(buildCard).join("");
  }

  /* ============================================================
     ARTICLES — full list + tag filter
     ============================================================ */
  var selectedTags = new Set();

  function getAllTags() {
    var set = new Set();
    ARTICLES.forEach(function (a) {
      (a.tags || []).forEach(function (t) { set.add(t); });
    });
    return Array.from(set).sort(function (a, b) { return a.localeCompare(b); });
  }

  function renderTagFilter() {
    var list = $("#tag-list");
    list.innerHTML = getAllTags().map(function (tag) {
      return (
        '<label class="tag-checkbox">' +
          '<input type="checkbox" value="' + escapeHtml(tag) + '">' +
          "<span>" + escapeHtml(tag) + "</span>" +
        "</label>"
      );
    }).join("");

    // Wire change events (event delegation is fine for a small list).
    list.addEventListener("change", function (event) {
      var input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (input.checked) selectedTags.add(input.value);
      else selectedTags.delete(input.value);
      renderArticles();
    });

    $("#clear-tags").addEventListener("click", function () {
      selectedTags.clear();
      $all("#tag-list input[type='checkbox']").forEach(function (cb) { cb.checked = false; });
      renderArticles();
    });
  }

  function renderArticles() {
    var grid = $("#articles-grid");
    var empty = $("#articles-empty");

    var filtered = ARTICLES.slice().sort(byDateDesc).filter(function (a) {
      if (selectedTags.size === 0) return true;
      // Show post if it contains ANY of the selected tags.
      return (a.tags || []).some(function (t) { return selectedTags.has(t); });
    });

    if (filtered.length === 0) {
      grid.innerHTML = "";
      empty.hidden = false;
    } else {
      empty.hidden = true;
      grid.innerHTML = filtered.map(buildCard).join("");
    }
  }

  /* ============================================================
     ABOUT — team grid
     ============================================================ */
  function renderTeam() {
    var grid = $("#team-grid");
    grid.innerHTML = TEAM.map(function (member) {
      return (
        '<article class="team-card">' +
          '<div class="team-photo">' +
            '<img src="' + escapeHtml(member.image) + '" alt="Fotografie: ' + escapeHtml(member.name) + '" loading="lazy" decoding="async">' +
          "</div>" +
          '<div class="team-body">' +
            '<h3 class="team-name">' + escapeHtml(member.name) + "</h3>" +
            '<p class="team-role">' + escapeHtml(member.role) + "</p>" +
          "</div>" +
        "</article>"
      );
    }).join("");
  }

  /* ============================================================
     BOOT
     ============================================================ */
  function boot() {
    // Footer year
    var yearEl = $("#year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // Static pagination button — placeholder action so it visibly works
    // without changing layout.
    var olderBtn = $("#older-btn");
    if (olderBtn) {
      olderBtn.addEventListener("click", function () {
        olderBtn.disabled = true;
        olderBtn.textContent = "Žádné starší články";
      });
    }

    renderHome();
    renderTagFilter();
    renderArticles();
    renderTeam();

    wireNav();
    wireDrawer();

    // Initial page from URL hash (defaults to home).
    var initial = (location.hash || "#home").slice(1);
    showPage(initial);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
