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
  var selectedTags = new Set();
  var PAGES = ["home", "articles", "about", "contact"];

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

  /* ============================================================
     RENDERERS
     ============================================================ */
  function renderHome() {
    var grid = $("#home-grid");
    if (!grid) return;
    var newest = ARTICLES.slice().sort(byDateDesc).slice(0, 6);
    grid.innerHTML = newest.length
      ? newest.map(buildCard).join("")
      : '<p class="empty-state" style="grid-column:1/-1;">Zatím žádné články.</p>';
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
    grid.innerHTML = TEAM.map(function (m) {
      return (
        '<article class="team-card">' +
          '<div class="team-photo">' +
            '<img src="' + escapeHtml(m.image) + '" alt="Fotografie: ' + escapeHtml(m.name) + '" loading="lazy" decoding="async">' +
          "</div>" +
          '<div class="team-body">' +
            '<h3 class="team-name">' + escapeHtml(m.name) + "</h3>" +
            '<p class="team-role">' + escapeHtml(m.role) + "</p>" +
          "</div>" +
        "</article>"
      );
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
  function loadArticles() {
    return fetch("/api/articles", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("API " + r.status);
        return r.json();
      })
      .then(function (items) {
        ARTICLES = Array.isArray(items) && items.length ? items : FALLBACK_ARTICLES;
      })
      .catch(function () {
        ARTICLES = FALLBACK_ARTICLES;
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
    renderTeam();

    loadArticles().then(function () {
      renderHome();
      renderTagFilter();
      renderArticles();
    });

    var initial = (location.hash || "#home").slice(1);
    showPage(initial);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
