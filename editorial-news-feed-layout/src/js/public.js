/* ============================================================
 * public.js — public feed renderer
 * ------------------------------------------------------------
 * Reads articles from StorageService and renders them into
 * the #feed grid using the template's existing markup classes.
 * Re-implements the search / sort / density / read / save /
 * hide behaviour from the original template script.
 * ============================================================ */
(function () {
  "use strict";

  // ---------- one-time seed so a fresh visitor sees content ----------
  StorageService.seedIfEmpty([
    {
      id: "zizala-s-pateri",
      title: "Žížala s páteří",
      body: "„Ale žížala přece nemá páteř!“ byste mi jistě rádi zakřičeli do obličeje. „Je to prvoústý kroužkovec, který nemá ani hloupou základní strunu,“ jistě byste se naparovali za své znalosti.",
      image: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?auto=format&fit=crop&w=900&q=80",
      categories: "Biologie, Příroda, Vzdělávání",
      author: "Vanaheim",
      date: "2026-05-18",
      variant: "feature"
    },
    {
      id: "divocina",
      title: "Divočina",
      body: "",
      image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=900&q=80",
      categories: "Biologie, Komiksy, Příroda",
      author: "Vanaheim",
      date: "2026-05-17",
      variant: "compact"
    },
    {
      id: "mluvis",
      title: "Mluvíš?",
      body: "",
      image: "https://images.unsplash.com/photo-1598488035139-bdbb2231bb19?auto=format&fit=crop&w=900&q=80",
      categories: "Kurzy, Společnost, Výjezd, Vzdělávání, Školní projekt",
      author: "Vanaheim",
      date: "2026-05-16",
      variant: "compact"
    },
    {
      id: "expedice-spanelsko",
      title: "Expedice Španělsko, aneb co vše jsme po cestě našli",
      body: "",
      image: "https://images.unsplash.com/photo-1551632811-561732d1e609?auto=format&fit=crop&w=900&q=80",
      categories: "Cestování, Expedice, Komiksy",
      author: "Vanaheim",
      date: "2026-05-15",
      variant: "wide"
    },
    {
      id: "architekti-oceanu",
      title: "Víte, kdo jsou architekti oceánů?",
      body: "",
      image: "https://images.unsplash.com/photo-1559827260-dc66d52bef19?auto=format&fit=crop&w=900&q=80",
      categories: "Biologie, Příroda, Vzdělávání, Životní prostředí",
      author: "Vanaheim",
      date: "2026-05-14",
      variant: "default"
    }
  ]);

  // ---------- DOM refs ----------
  var feed = document.querySelector("#feed");
  var searchInput = document.querySelector("#feed-search");
  var searchSuggestions = document.querySelector("#search-suggestions");
  var sortSelect = document.querySelector("#feed-sort");
  var restoreButton = document.querySelector("#restore-feed");
  var emptyState = document.querySelector("#empty-state");
  var visibleCount = document.querySelector("#visible-count");
  var readCount = document.querySelector("#read-count");
  var savedCount = document.querySelector("#saved-count");
  var densityControls = document.querySelectorAll("input[name='density']");

  // ---------- per-user UI state, persisted ----------
  var UI_KEY = "vanaheim-feed-state";
  var state = loadState();
  var activeSuggestionIndex = -1;

  // ---------- helpers ----------
  function loadState() {
    try {
      var parsed = JSON.parse(localStorage.getItem(UI_KEY));
      return {
        read:   Array.isArray(parsed && parsed.read)   ? parsed.read   : [],
        saved:  Array.isArray(parsed && parsed.saved)  ? parsed.saved  : [],
        hidden: Array.isArray(parsed && parsed.hidden) ? parsed.hidden : []
      };
    } catch (e) {
      return { read: [], saved: [], hidden: [] };
    }
  }
  function saveState() { localStorage.setItem(UI_KEY, JSON.stringify(state)); }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function formatDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    // Czech long-form date — mirrors the template's existing strings.
    var months = ["ledna","února","března","dubna","května","června",
                  "července","srpna","září","října","listopadu","prosince"];
    return d.getDate() + ". " + months[d.getMonth()] + " " + d.getFullYear();
  }

  // Build a single <article class="story ..."> matching the template structure.
  function buildStoryElement(article) {
    var el = document.createElement("article");
    var variantClass = "";
    if (article.variant === "feature") variantClass = " story--lead story--feature";
    else if (article.variant === "wide") variantClass = " story--wide";
    else if (article.variant === "compact") variantClass = " story--compact";

    el.className = "story" + variantClass;
    el.dataset.id = article.id;
    el.dataset.source = article.author || "Vanaheim";
    el.dataset.tags = article.categories || "";
    if (article.image) {
      // The CSS uses the --image custom property for the cover image.
      el.style.setProperty("--image", "url('" + article.image.replace(/'/g, "\\'") + "')");
    }

    var dekHtml = article.variant === "feature" && article.body
      ? '<p class="dek">' + escapeHtml(article.body) + "</p>"
      : "";

    el.innerHTML =
      '<div class="story-art" aria-hidden="true"></div>' +
      '<div class="story-content">' +
        '<p class="story-categories">' + escapeHtml(article.categories || "") + "</p>" +
        '<h3><a href="#" data-action="open">' + escapeHtml(article.title) + "</a></h3>" +
        dekHtml +
        '<p class="story-author">' + escapeHtml(article.author || "Vanaheim") + "</p>" +
        '<time class="pub-date" datetime="' + escapeHtml(article.date) + '">' +
          escapeHtml(formatDate(article.date)) +
        "</time>" +
        '<div class="story-actions">' +
          '<button class="story-action" type="button" data-action="open">Číst dál</button>' +
          '<button class="story-action" type="button" data-action="read">Přečteno</button>' +
          '<button class="story-action" type="button" data-action="save">Uložit</button>' +
          '<button class="story-action" type="button" data-action="dismiss">Skrýt</button>' +
        "</div>" +
      "</div>";

    return el;
  }

  // ---------- rendering ----------
  // Master render: clear the container and re-build from storage.
  function render() {
    var query = searchInput.value.trim().toLowerCase();
    var articles = StorageService.list();
    articles = sortArticles(articles, sortSelect.value);

    feed.innerHTML = "";
    var shown = 0;

    articles.forEach(function (article) {
      var el = buildStoryElement(article);
      var isHidden = state.hidden.indexOf(article.id) !== -1;
      var haystack = [article.title, article.body, article.categories, article.author]
        .join(" ").toLowerCase();
      var matches = !query || haystack.indexOf(query) !== -1;
      var visible = !isHidden && matches;

      el.hidden = !visible;
      applyStateClasses(el, article.id);
      feed.appendChild(el);
      if (visible) shown += 1;
    });

    visibleCount.textContent = shown;
    readCount.textContent = state.read.length;
    savedCount.textContent = state.saved.length;
    emptyState.hidden = shown !== 0;
    restoreButton.disabled = state.hidden.length === 0;
  }

  function sortArticles(items, mode) {
    var sorted = items.slice();
    sorted.sort(function (a, b) {
      if (mode === "oldest") return (a.date || "").localeCompare(b.date || "");
      if (mode === "source") return (a.author || "").localeCompare(b.author || "");
      if (mode === "title")  return (a.title  || "").localeCompare(b.title  || "");
      return (b.date || "").localeCompare(a.date || "");   // newest
    });
    return sorted;
  }

  function applyStateClasses(el, id) {
    var isRead = state.read.indexOf(id) !== -1;
    var isSaved = state.saved.indexOf(id) !== -1;
    el.classList.toggle("is-read", isRead);
    el.classList.toggle("is-saved", isSaved);
    var readBtn = el.querySelector('[data-action="read"]');
    var saveBtn = el.querySelector('[data-action="save"]');
    if (readBtn) {
      readBtn.textContent = "Přečteno";
      readBtn.setAttribute("aria-pressed", String(isRead));
    }
    if (saveBtn) {
      saveBtn.textContent = isSaved ? "Uloženo" : "Uložit";
      saveBtn.setAttribute("aria-pressed", String(isSaved));
    }
  }

  function toggleId(list, id) {
    var i = list.indexOf(id);
    if (i === -1) list.push(id); else list.splice(i, 1);
  }

  // ---------- event wiring ----------
  feed.addEventListener("click", function (event) {
    var btn = event.target.closest("[data-action]");
    if (!btn) return;
    var story = btn.closest(".story");
    if (!story) return;
    var id = story.dataset.id;

    if (btn.dataset.action === "open")    { event.preventDefault(); btn.blur(); return; }
    if (btn.dataset.action === "read")    { toggleId(state.read, id);  saveState(); applyStateClasses(story, id); updateCounters(); return; }
    if (btn.dataset.action === "save")    { toggleId(state.saved, id); saveState(); applyStateClasses(story, id); updateCounters(); return; }
    if (btn.dataset.action === "dismiss") { if (state.hidden.indexOf(id) === -1) state.hidden.push(id); saveState(); render(); return; }
  });

  function updateCounters() {
    readCount.textContent = state.read.length;
    savedCount.textContent = state.saved.length;
  }

  searchInput.addEventListener("input", function () { renderSuggestions(); render(); });
  searchInput.addEventListener("focus", renderSuggestions);
  searchInput.addEventListener("keydown", handleSuggestionKeys);
  searchInput.addEventListener("blur", function () { setTimeout(closeSuggestions, 130); });

  searchSuggestions.addEventListener("mousedown", function (e) { e.preventDefault(); });
  searchSuggestions.addEventListener("click", function (event) {
    var btn = event.target.closest(".search-suggestion");
    if (!btn) return;
    searchInput.value = btn.dataset.value;
    closeSuggestions();
    render();
    searchInput.focus();
  });

  sortSelect.addEventListener("change", render);
  restoreButton.addEventListener("click", function () {
    state.hidden = [];
    saveState();
    render();
  });

  densityControls.forEach(function (control) {
    control.addEventListener("change", function () {
      document.body.classList.toggle("compact", control.value === "compact" && control.checked);
    });
  });

  // ---------- search suggestions ----------
  function suggestionItems() {
    var terms = new Map();
    StorageService.list().forEach(function (a) {
      if (a.author) terms.set(a.author.toLowerCase(), { value: a.author, kind: "autor" });
      if (a.title)  terms.set(a.title.toLowerCase(),  { value: a.title,  kind: "příspěvek" });
    });
    return Array.from(terms.values());
  }

  function renderSuggestions() {
    var query = searchInput.value.trim().toLowerCase();
    if (!query) { closeSuggestions(); return; }
    var matches = suggestionItems()
      .filter(function (it) { return it.value.toLowerCase().indexOf(query) !== -1; })
      .sort(function (a, b) {
        var aStarts = a.value.toLowerCase().indexOf(query) === 0;
        var bStarts = b.value.toLowerCase().indexOf(query) === 0;
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
        return a.value.localeCompare(b.value);
      })
      .slice(0, 6);

    if (matches.length === 0) { closeSuggestions(); return; }
    activeSuggestionIndex = -1;
    searchInput.setAttribute("aria-expanded", "true");
    searchSuggestions.hidden = false;
    searchSuggestions.innerHTML = matches.map(function (item, i) {
      return '<button class="search-suggestion" type="button" role="option" data-index="' + i +
        '" data-value="' + escapeHtml(item.value) + '">' +
          "<span>" + escapeHtml(item.value) + "</span>" +
          '<span class="suggestion-kind">' + escapeHtml(item.kind) + "</span>" +
        "</button>";
    }).join("");
  }

  function handleSuggestionKeys(event) {
    var options = Array.from(searchSuggestions.querySelectorAll(".search-suggestion"));
    if (searchSuggestions.hidden || options.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(Math.min(activeSuggestionIndex + 1, options.length - 1), options);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(Math.max(activeSuggestionIndex - 1, 0), options);
    } else if (event.key === "Enter" && activeSuggestionIndex > -1) {
      event.preventDefault();
      searchInput.value = options[activeSuggestionIndex].dataset.value;
      closeSuggestions();
      render();
    } else if (event.key === "Escape") {
      closeSuggestions();
    }
  }
  function setActive(i, options) {
    activeSuggestionIndex = i;
    options.forEach(function (o, idx) { o.classList.toggle("is-active", idx === i); });
  }
  function closeSuggestions() {
    activeSuggestionIndex = -1;
    searchInput.setAttribute("aria-expanded", "false");
    searchSuggestions.hidden = true;
    searchSuggestions.innerHTML = "";
  }

  // ---------- boot ----------
  render();
})();
