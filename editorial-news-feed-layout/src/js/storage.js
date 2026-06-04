/* ============================================================
 * StorageService
 * ------------------------------------------------------------
 * Tiny CRUD layer for articles persisted in localStorage.
 * Public API:
 *   StorageService.list()             -> Article[]
 *   StorageService.get(id)            -> Article | null
 *   StorageService.create(data)       -> Article
 *   StorageService.update(id, patch)  -> Article | null
 *   StorageService.remove(id)         -> boolean
 *   StorageService.seedIfEmpty(seed)  -> void
 *
 * An Article looks like:
 *   {
 *     id:         string,
 *     title:      string,
 *     body:       string,   // plain text (newlines preserved)
 *     image:      string,   // URL or Base64 data-URI
 *     categories: string,   // comma separated
 *     author:     string,
 *     date:       string,   // ISO yyyy-mm-dd
 *     variant:    "default" | "feature" | "wide" | "compact"
 *   }
 * ============================================================ */
(function (global) {
  "use strict";

  var KEY = "vanaheim-articles";

  // ---------- internal helpers ----------
  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn("StorageService: read failed", err);
      return [];
    }
  }

  function write(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
  }

  function uid() {
    return "a-" + Date.now().toString(36) + "-" +
      Math.random().toString(36).slice(2, 8);
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  // Normalises user input into a clean Article record.
  function shape(data) {
    return {
      id:         data.id || uid(),
      title:      (data.title || "").trim(),
      body:       (data.body || "").trim(),
      image:      (data.image || "").trim(),
      categories: (data.categories || "").trim(),
      author:     (data.author || "Vanaheim").trim(),
      date:       data.date || today(),
      variant:    data.variant || "default"
    };
  }

  // ---------- public API ----------
  var StorageService = {
    list: function () {
      // Newest first by default.
      return read().slice().sort(function (a, b) {
        return (b.date || "").localeCompare(a.date || "");
      });
    },

    get: function (id) {
      var found = read().find(function (a) { return a.id === id; });
      return found || null;
    },

    create: function (data) {
      var items = read();
      var article = shape(data);
      items.push(article);
      write(items);
      return article;
    },

    update: function (id, patch) {
      var items = read();
      var idx = items.findIndex(function (a) { return a.id === id; });
      if (idx === -1) return null;
      // Preserve id, merge patch, re-shape to keep fields tidy.
      items[idx] = shape(Object.assign({}, items[idx], patch, { id: id }));
      write(items);
      return items[idx];
    },

    remove: function (id) {
      var items = read();
      var next = items.filter(function (a) { return a.id !== id; });
      if (next.length === items.length) return false;
      write(next);
      return true;
    },

    seedIfEmpty: function (seed) {
      if (read().length > 0) return;
      write(seed.map(shape));
    },

    // Exposed for debugging / a "reset" button.
    _clear: function () { localStorage.removeItem(KEY); }
  };

  global.StorageService = StorageService;
})(window);
