/* ============================================================
 * Admin dashboard controller
 * ------------------------------------------------------------
 * Talks to:
 *   POST   /api/login            { password }
 *   GET    /api/login            -> { loggedIn }
 *   POST   /api/logout
 *   GET    /api/articles
 *   POST   /api/articles         body = article
 *   PUT    /api/articles?id=X    body = patch
 *   DELETE /api/articles?id=X
 *   POST   /api/upload           { filename, dataUrl }
 * ============================================================ */
(function () {
  "use strict";

  /* ----- DOM ----- */
  var loginScreen = document.querySelector("#login-screen");
  var loginForm   = document.querySelector("#login-form");
  var loginPass   = document.querySelector("#login-password");
  var loginError  = document.querySelector("#login-error");
  var shell       = document.querySelector("#admin-shell");
  var logoutBtn   = document.querySelector("#logout-btn");
  var headerNav   = document.querySelector("#admin-headernav");  // admin buttons in the header
  var adminTag    = document.querySelector("#admin-tag");

  var form        = document.querySelector("#article-form");
  var fId         = document.querySelector("#f-id");
  var fElements   = document.querySelector("#f-elements");
  var fTitle      = document.querySelector("#f-title");
  var fBody       = document.querySelector("#f-body");
  var fImageUrl   = document.querySelector("#f-image-url");
  var fImageFile  = document.querySelector("#f-image-file");
  var fAuthors    = document.querySelector("#f-authors");
  var fDate       = document.querySelector("#f-date");
  var fTags       = document.querySelector("#f-tags");
  var fKind       = document.querySelector("#f-kind");
  var imagePreview= document.querySelector("#image-preview");
  var submitBtn   = document.querySelector("#submit-btn");
  var resetBtn    = document.querySelector("#reset-btn");
  var tbody       = document.querySelector("#article-tbody");
  var formTitle   = document.querySelector("#form-title");
  var toastEl     = document.querySelector("#toast");

  /* ----- Tab navigation + sections ----- */
  var navLinks    = Array.prototype.slice.call(document.querySelectorAll(".admin-nav-link[data-tab]"));
  var sections    = {
    articles: document.querySelector("#section-articles"),
    home:     document.querySelector("#section-home"),
    about:    document.querySelector("#section-about"),
    contact:  document.querySelector("#section-contact")
  };

  /* ----- About tab refs ----- */
  var aboutInput   = document.querySelector("#about-text-input");
  var saveAboutBtn = document.querySelector("#save-about-btn");
  var teamForm     = document.querySelector("#team-form");
  var tmId         = document.querySelector("#tm-id");
  var tmName       = document.querySelector("#tm-name");
  var tmRole       = document.querySelector("#tm-role");
  var tmImageUrl   = document.querySelector("#tm-image-url");
  var tmImageFile  = document.querySelector("#tm-image-file");
  var tmPreview    = document.querySelector("#tm-preview");
  var teamSubmit   = document.querySelector("#team-submit-btn");
  var teamReset    = document.querySelector("#team-reset-btn");
  var teamTitle    = document.querySelector("#team-form-title");
  var teamTbody    = document.querySelector("#team-tbody");

  /* ----- Contact tab refs ----- */
  var subtitleInput = document.querySelector("#contact-subtitle-input");
  var saveSubBtn    = document.querySelector("#save-subtitle-btn");
  var contactForm   = document.querySelector("#contact-form");
  var ctId          = document.querySelector("#ct-id");
  var ctType        = document.querySelector("#ct-type");
  var ctLabel       = document.querySelector("#ct-label");
  var ctUrl         = document.querySelector("#ct-url");
  var contactSubmit = document.querySelector("#contact-submit-btn");
  var contactReset  = document.querySelector("#contact-reset-btn");
  var contactTitle  = document.querySelector("#contact-form-title");
  var contactTbody  = document.querySelector("#contact-tbody");

  /* ----- State ----- */
  var pendingImageUrl = "";  // resolved URL after a file upload OR a URL the user typed (articles).
  var tmPendingImage  = "";  // same, for the team member photo.
  var CONTENT = null;        // cached site content (about/team/contact).
  var contentLoaded = false;

  /* ============================================================
     Helpers
     ============================================================ */
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  /* ---------- publish date/time (scheduling) ----------
     The editor uses <input type="datetime-local"> ("YYYY-MM-DDTHH:MM",
     local time). Articles store `publishAt` as an absolute ISO timestamp
     plus `date` (local YYYY-MM-DD) for display. The API hides an article
     from the public until publishAt <= now, so a past/current value is
     live immediately and a future one stays scheduled until that minute. */
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function toLocalInput(d) {
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
           "T" + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  function nowLocalInput() { return toLocalInput(new Date()); }
  // Parse "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" as LOCAL time (Date.parse of a
  // date-only string would be UTC). Returns a Date or null.
  function parseLocalInput(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(v || "");
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  }
  // Editor value for a stored article (falls back to legacy date-only records).
  function articleLocalInput(a) {
    if (a.publishAt) { var d = new Date(a.publishAt); if (!isNaN(d)) return toLocalInput(d); }
    return a.date ? a.date + "T00:00" : "";
  }
  function articlePublishTime(a) {
    if (a.publishAt) { var t = Date.parse(a.publishAt); if (!isNaN(t)) return t; }
    var d = parseLocalInput(a.date);
    return d ? d.getTime() : 0;
  }
  function isScheduled(a) { return articlePublishTime(a) > Date.now(); }
  function formatLocalInput(v) {
    var d = parseLocalInput(v);
    return d ? d.getDate() + ". " + (d.getMonth() + 1) + ". " + d.getFullYear() + " v " +
               pad2(d.getHours()) + ":" + pad2(d.getMinutes()) : "";
  }

  /* Byte length of a string in UTF-8 (for the article record size). */
  function textBytes(str) {
    if (window.TextEncoder) return new TextEncoder().encode(str).length;
    return new Blob([str]).size; // fallback
  }
  /* Human-readable size. */
  function formatBytes(bytes) {
    if (bytes == null || isNaN(bytes)) return "—";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1).replace(".", ",") + " KB";
    return (bytes / (1024 * 1024)).toFixed(2).replace(".", ",") + " MB";
  }
  /* Try to read an image's byte size via a HEAD request (Content-Length).
     Resolves to a number or null if it can't be determined. */
  function fetchImageBytes(url) {
    if (!url || /^data:/i.test(url) || !/^https?:/i.test(url)) {
      return Promise.resolve(null);
    }
    return fetch(url, { method: "HEAD" })
      .then(function (r) {
        var len = r.headers.get("content-length");
        return len ? parseInt(len, 10) : null;
      })
      .catch(function () { return null; });
  }

  function readAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function api(path, options) {
    options = options || {};
    options.headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
    if (options.body && typeof options.body !== "string") {
      options.body = JSON.stringify(options.body);
    }
    options.credentials = "same-origin";
    return fetch(path, options).then(function (r) {
      return r.text().then(function (text) {
        var json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
        if (!r.ok) {
          // Prefer the detailed message so real causes (e.g. missing Blob
          // token) surface in the toast instead of a generic "Server error".
          var msg = (json && (json.detail || json.error)) || ("HTTP " + r.status);
          var err = new Error(msg);
          err.status = r.status;
          err.body = json;
          throw err;
        }
        return json;
      });
    });
  }

  var toastTimer = null;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-visible"); }, 2400);
  }

  /* ============================================================
     Login flow
     ============================================================ */
  function showLogin() {
    loginScreen.hidden = false;
    // Session expired while the article editor is open: show the login as a
    // modal ABOVE the editor so the unsaved work stays put underneath.
    var editorOpen = !document.querySelector("#editor-overlay").hidden;
    loginScreen.classList.toggle("is-modal", editorOpen);
    if (editorOpen) { setTimeout(function () { loginPass.focus(); }, 0); return; }
    shell.hidden = true;
    if (headerNav) headerNav.hidden = true;   // hide admin controls until logged in
    if (adminTag) adminTag.hidden = true;
    setTimeout(function () { loginPass.focus(); }, 0);
  }
  function showShell() {
    loginScreen.hidden = true;
    loginScreen.classList.remove("is-modal");
    shell.hidden = false;
    if (headerNav) headerNav.hidden = false;   // reveal admin controls in the header
    if (adminTag) adminTag.hidden = false;
    refreshTable();
  }

  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    loginError.textContent = "";
    api("/api/login", { method: "POST", body: { password: loginPass.value } })
      .then(function () {
        loginPass.value = "";
        showShell();
      })
      .catch(function (err) {
        loginError.textContent = err.status === 401 ? "Nesprávné heslo." : "Chyba: " + err.message;
        loginPass.select();
      });
  });

  logoutBtn.addEventListener("click", function () {
    api("/api/logout", { method: "POST" })
      .finally(function () { showLogin(); });
  });

  /* ============================================================
     Image handling
     ============================================================ */
  function updatePreview(url) {
    if (url) {
      imagePreview.style.backgroundImage = VNSafe.cssUrl(url);
      imagePreview.hidden = false;
    } else {
      imagePreview.hidden = true;
    }
  }

  fImageUrl.addEventListener("input", function () {
    if (fImageUrl.value.trim()) {
      pendingImageUrl = fImageUrl.value.trim();
      fImageFile.value = "";
    } else {
      pendingImageUrl = "";
    }
    updatePreview(pendingImageUrl);
  });

  fImageFile.addEventListener("change", function () {
    var file = fImageFile.files && fImageFile.files[0];
    if (!file) return;
    // Instant local preview while the upload runs.
    var localUrl = URL.createObjectURL(file);
    var previous = pendingImageUrl;
    updatePreview(localUrl);
    submitBtn.disabled = true;
    submitBtn.textContent = "Nahrávám…";
    uploadImageFile(file)
      .then(function (url) {
        pendingImageUrl = url;
        fImageUrl.value = "";
        updatePreview(pendingImageUrl);
        toast("Obrázek nahrán.");
      })
      .catch(function (err) {
        updatePreview(previous);
        fImageFile.value = "";
        toast("Nahrání selhalo: " + err.message);
      })
      .finally(function () {
        URL.revokeObjectURL(localUrl);
        submitBtn.disabled = false;
        submitBtn.textContent = fId.value ? "Uložit změny" : "Vytvořit";
      });
  });

  /* ============================================================
     Form: reset + populate + submit
     ============================================================ */
  function resetForm() {
    form.reset();
    fId.value = "";
    fElements.value = "";
    fBackground.value = "";
    fDate.value = nowLocalInput();
    pendingImageUrl = "";
    updatePreview("");
    formTitle.textContent = "Nový příspěvek";
    submitBtn.textContent = "Vytvořit";
  }
  function populateForm(article) {
    fId.value       = article.id;
    fElements.value = (article.elements && article.elements.length) ? JSON.stringify(article.elements) : "";
    fBackground.value = article.background ? JSON.stringify(article.background) : "";
    fTitle.value    = article.title || "";
    fBody.value     = article.body || "";
    fAuthors.value  = (article.authors || []).join(", ");
    fDate.value     = articleLocalInput(article);
    fTags.value     = (article.tags || []).join(", ");
    fKind.value     = article.kind || "article";
    pendingImageUrl = article.image || "";
    fImageUrl.value = pendingImageUrl;
    fImageFile.value = "";
    updatePreview(pendingImageUrl);
    formTitle.textContent = "Upravit příspěvek";
    submitBtn.textContent = "Uložit změny";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  resetBtn.addEventListener("click", resetForm);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    saveArticle();
  });

  /* Save the article in the form. Resolves true on success, false otherwise
     (validation error, upload still running, API error, expired session) —
     callers such as Vydat keep the editor open until it resolves true. */
  var articleSaving = false;
  function saveArticle() {
    if (articleSaving) return Promise.resolve(false);   // no double POST
    if (uploadsBusy()) return Promise.resolve(false);
    if (!fTitle.value.trim()) { toast("Název je povinný."); return Promise.resolve(false); }
    var elements = [];
    if (fElements.value) { try { elements = JSON.parse(fElements.value); } catch (e) { elements = []; } }
    // Empty/invalid date -> publish now. Past or current -> live immediately;
    // future -> scheduled (the API hides it until publishAt).
    var when = parseLocalInput(fDate.value) || new Date();
    var scheduled = when.getTime() > Date.now();
    var payload = {
      title:   fTitle.value,
      body:    fBody.value,
      image:   pendingImageUrl || fImageUrl.value || "",
      authors: fAuthors.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean),
      tags:    fTags.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean),
      date:    toLocalInput(when).slice(0, 10),
      publishAt: when.toISOString(),
      kind:    fKind.value === "comic" ? "comic" : "article",
      elements: elements,
      background: edParseJson(fBackground.value, {})
    };

    articleSaving = true;
    submitBtn.disabled = true;
    var savingId = fId.value;
    var req = savingId
      ? api("/api/articles?id=" + encodeURIComponent(savingId), { method: "PUT", body: payload })
      : api("/api/articles", { method: "POST", body: payload });

    return req
      .then(function () {
        toast(scheduled
          ? "Naplánováno — vyjde " + formatLocalInput(toLocalInput(when)) + "."
          : (savingId ? "Příspěvek uložen a zveřejněn." : "Příspěvek zveřejněn."));
        resetForm();
        refreshTable();
        return true;
      })
      .catch(function (err) {
        if (err.status === 401) {
          toast("Vypršela platnost přihlášení — přihlaste se a klikněte znovu na Vydat.");
          showLogin();
          return false;
        }
        toast("Uložení selhalo: " + err.message);
        return false;
      })
      .finally(function () {
        articleSaving = false;
        submitBtn.disabled = false;
      });
  }

  /* ============================================================
     Article list — public-style cards + tag filter.
     Clicking a card opens that article in the editor (detail/preview).
     ============================================================ */
  var articleGrid      = document.querySelector("#article-grid");
  var articleEmpty     = document.querySelector("#article-empty");
  var articleTagList   = document.querySelector("#article-tag-list");
  var articleClearTags = document.querySelector("#article-clear-tags");
  var newArticleBtn    = document.querySelector("#new-article-btn");
  var ADMIN_ARTICLES = [];
  var articlesLoaded = false;   // true after the first successful /api/articles
  var adminSelectedTags = {};

  function articleThumb(a) {
    if (a.image) return a.image;
    if (Array.isArray(a.elements)) {
      for (var i = 0; i < a.elements.length; i++) {
        if (a.elements[i].type === "image" && a.elements[i].content) return a.elements[i].content;
      }
      // no picture: a YouTube block's thumbnail
      for (var j = 0; j < a.elements.length; j++) {
        var info = a.elements[j].type === "embed" && VNSafe.embed(a.elements[j].content);
        if (info && info.thumb) return info.thumb;
      }
    }
    return "";
  }
  function allArticleTags() {
    var set = {};
    ADMIN_ARTICLES.forEach(function (a) { (a.tags || []).forEach(function (t) { set[t] = true; }); });
    return Object.keys(set).sort(function (x, y) { return x.localeCompare(y); });
  }
  function renderArticleFilter() {
    articleTagList.innerHTML = allArticleTags().map(function (t) {
      return '<label class="tag-checkbox"><input type="checkbox" value="' + escapeHtml(t) + '"' +
        (adminSelectedTags[t] ? " checked" : "") + "><span>" + escapeHtml(t) + "</span></label>";
    }).join("");
  }
  function renderArticleCards() {
    var sel = Object.keys(adminSelectedTags);
    var list = ADMIN_ARTICLES.filter(function (a) {
      if (sel.length === 0) return true;
      return (a.tags || []).some(function (t) { return adminSelectedTags[t]; });
    });
    if (list.length === 0) { articleGrid.innerHTML = ""; articleEmpty.hidden = false; return; }
    articleEmpty.hidden = true;
    articleGrid.innerHTML = list.map(function (a) {
      var thumb = articleThumb(a);
      var media = thumb ? '<img src="' + escapeHtml(thumb) + '" alt="" loading="lazy">' : "";
      var authors = (a.authors || []).join(", ");
      var future = isScheduled(a);
      var tagsHtml = (a.tags || []).map(function (t) { return '<span class="card-tag">' + escapeHtml(t) + "</span>"; }).join("");
      return (
        '<article class="card" data-id="' + escapeHtml(a.id) + '" role="button" tabindex="0">' +
          '<div class="card-media">' + media + "</div>" +
          '<div class="card-body">' +
            '<h2 class="card-title">' + escapeHtml(a.title || "(bez názvu)") + "</h2>" +
            '<div class="card-meta">' +
              "<time>" + escapeHtml(a.date || "") + "</time>" +
              (authors ? "<span>" + escapeHtml(authors) + "</span>" : "") +
              "<span>" + (a.kind === "comic" ? "Komiks" : "Článek") + "</span>" +
              (future ? '<span class="sched-badge">Naplánováno</span>' : "") +
            "</div>" +
          "</div>" +
          '<div class="card-tags">' + tagsHtml + "</div>" +
        "</article>"
      );
    }).join("");
  }
  // name kept (refreshTable) so existing callers — submit / delete / showShell — work
  function refreshTable() {
    api("/api/articles")
      .then(function (items) {
        ADMIN_ARTICLES = Array.isArray(items) ? items : [];
        articlesLoaded = true;
        renderArticleFilter();
        renderArticleCards();
        homeArticlesChanged();       // homepage cards depend on the article list
      })
      .catch(function (err) {
        if (err.status === 401) { showLogin(); return; }
        articleEmpty.hidden = false;
        articleEmpty.textContent = "Chyba: " + err.message;
      });
  }

  function openArticleForEdit(id) {
    var a = null;
    for (var i = 0; i < ADMIN_ARTICLES.length; i++) { if (ADMIN_ARTICLES[i].id === id) { a = ADMIN_ARTICLES[i]; break; } }
    if (!a) return;
    populateForm(a);
    edOpen();
  }
  articleGrid.addEventListener("click", function (event) {
    var card = event.target.closest(".card[data-id]");
    if (card) openArticleForEdit(card.dataset.id);
  });
  articleGrid.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    var card = event.target.closest(".card[data-id]");
    if (card) { event.preventDefault(); openArticleForEdit(card.dataset.id); }
  });
  articleTagList.addEventListener("change", function (event) {
    var inp = event.target;
    if (!inp || inp.type !== "checkbox") return;
    if (inp.checked) adminSelectedTags[inp.value] = true; else delete adminSelectedTags[inp.value];
    renderArticleCards();
  });
  articleClearTags.addEventListener("click", function () {
    adminSelectedTags = {};
    renderArticleFilter();
    renderArticleCards();
  });
  newArticleBtn.addEventListener("click", function () {
    resetForm();
    fDate.value = nowLocalInput();
    edOpen();
  });

  /* ============================================================
     File upload (images + PDF)
     Vercel rejects request bodies over 4.5 MB *before* our function
     runs (HTTP 413, non-JSON) — that was the "sometimes fails" bug.
     Base64 adds ~33 %, so: big JPG/PNG/WEBP are downscaled in the
     browser; GIF (animation) and PDF can't be, so they get a hard cap.
     ============================================================ */
  var UPLOAD_MAX_BYTES = 3.2 * 1024 * 1024;
  var UPLOAD_TYPES = {
    "image/jpeg": "image", "image/jpg": "image", "image/png": "image",
    "image/webp": "image", "image/gif": "image", "application/pdf": "pdf"
  };
  var UPLOAD_EXT = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
                     webp: "image/webp", gif: "image/gif", pdf: "application/pdf" };
  var pendingUploads = 0;   // saves are blocked while > 0 (no blob: URLs get persisted)

  // Some browsers/OSes leave file.type empty — fall back to the extension.
  function fileMime(file) {
    var t = (file.type || "").toLowerCase();
    if (UPLOAD_TYPES[t]) return t;
    var ext = (file.name.split(".").pop() || "").toLowerCase();
    return UPLOAD_EXT[ext] || t;
  }
  function fileKind(file) { return UPLOAD_TYPES[fileMime(file)] || null; }

  // Downscale a raster image to fit 2400 px and the size cap. Resolves a Blob.
  function compressImage(file, mime) {
    return new Promise(function (resolve, reject) {
      var src = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(src);
        var scale = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * scale);
        c.height = Math.round(img.naturalHeight * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        // PNG keeps transparency but compresses badly -> WEBP; JPG stays JPG.
        var outType = mime === "image/jpeg" ? "image/jpeg" : "image/webp";
        (function tryQuality(q) {
          c.toBlob(function (blob) {
            if (!blob) { reject(new Error("Obrázek nelze zpracovat.")); return; }
            if (blob.size <= UPLOAD_MAX_BYTES || q <= 0.5) resolve(blob);
            else tryQuality(q - 0.1);
          }, outType, q);
        })(0.88);
      };
      img.onerror = function () { URL.revokeObjectURL(src); reject(new Error("Soubor není platný obrázek.")); };
      img.src = src;
    });
  }

  // Validates, compresses if needed, uploads. Resolves { url, kind, name }.
  // opts.allowPdf: whether PDF is acceptable for this input.
  function uploadFile(file, opts) {
    opts = opts || {};
    var mime = fileMime(file);
    var kind = UPLOAD_TYPES[mime];
    if (!kind || (kind === "pdf" && !opts.allowPdf)) {
      return Promise.reject(new Error(opts.allowPdf
        ? "Nepodporovaný formát. Povolené: JPG, PNG, WEBP, GIF, PDF."
        : "Nepodporovaný formát. Povolené: JPG, PNG, WEBP, GIF."));
    }
    var needsCompress = kind === "image" && mime !== "image/gif" && file.size > 1.5 * 1024 * 1024;
    var prepared = needsCompress ? compressImage(file, mime) : Promise.resolve(file);

    var outMime = mime;
    pendingUploads++;
    return prepared
      .then(function (blob) {
        if (blob.size > UPLOAD_MAX_BYTES) {
          throw new Error("Soubor je příliš velký (" + (blob.size / 1048576).toFixed(1) + " MB, max 3 MB).");
        }
        if (needsCompress && blob.type) outMime = blob.type;
        return readAsDataUrl(blob);
      })
      .then(function (dataUrl) {
        // Force the real MIME (an empty file.type yields "application/octet-stream").
        dataUrl = dataUrl.replace(/^data:[^;,]*/, "data:" + outMime);
        return api("/api/upload", { method: "POST", body: { filename: file.name, dataUrl: dataUrl } });
      })
      .then(function (r) {
        if (!r || !r.url) throw new Error("Server nevrátil adresu souboru.");
        return { url: r.url, kind: kind, name: file.name };
      })
      .catch(function (err) {
        if (err.status === 413) err = new Error("Soubor je na server příliš velký.");
        throw err;
      })
      .finally(function () { pendingUploads--; });
  }
  // Image-only inputs (cover, team photo, page background).
  function uploadImageFile(file) {
    return uploadFile(file, { allowPdf: false }).then(function (r) { return r.url; });
  }
  function uploadsBusy() {
    if (pendingUploads > 0) { toast("Počkejte, až se dokončí nahrávání souborů."); return true; }
    return false;
  }

  /* ============================================================
     Tab switching
     ============================================================ */
  var currentTab = "articles";
  function showTab(name) {
    if (!sections[name]) name = "articles";
    // leaving the homepage editor would drop an image still uploading into it
    if (DOC.key === "home" && name !== "home" && pendingUploads > 0) {
      toast("Počkejte, až se dokončí nahrávání obrázku.");
      return;
    }
    currentTab = name;
    Object.keys(sections).forEach(function (key) {
      if (sections[key]) sections[key].hidden = key !== name;
    });
    navLinks.forEach(function (link) {
      link.classList.toggle("is-active", link.dataset.tab === name);
    });
    // Lazy-load site content the first time Home/About/Contact is opened.
    if ((name === "home" || name === "about" || name === "contact") && !contentLoaded) {
      loadContent().then(function () {
        // The admin may have moved on while it loaded: mount only the tab that
        // is still shown, never under an open article editor (it would steal
        // the shared toolbar).
        if (currentTab === name && EDITOR.overlay.hidden) docMountFor(name);
      });
    } else {
      docMountFor(name);
    }
  }
  navLinks.forEach(function (link) {
    link.addEventListener("click", function () { showTab(link.dataset.tab); });
  });

  /* ============================================================
     Content (about / team / contact) — load + persist whole object
     ============================================================ */
  var contentRequest = null;   // one in-flight load shared by quick tab clicks
  function loadContent() {
    if (contentRequest) return contentRequest;
    contentRequest = api("/api/content").then(function (c) {
      CONTENT = c;
      contentLoaded = true;
      renderAbout();
      renderTeamTable();
      renderContactTable();
      homeArticlesChanged();
      return c;
    }).catch(function (err) {
      if (err.status === 401) { showLogin(); return; }
      toast("Chyba načtení obsahu: " + err.message);
    }).finally(function () { contentRequest = null; });
    return contentRequest;
  }
  // Persist the whole CONTENT object; returns the (shaped) saved content.
  var contentDirty = false;   // document edits flushed into CONTENT but not saved
  function saveContent() {
    return api("/api/content", { method: "PUT", body: CONTENT }).then(function (saved) {
      CONTENT = saved;
      contentDirty = false;
      return saved;
    });
  }
  // Apply a change to CONTENT and save it; if the save fails the change is
  // rolled back. (Before, a failed add stayed in memory — retry = duplicate —
  // and a failed delete left a row the next unrelated save removed anyway.)
  function saveContentChange(mutate) {
    var before = JSON.stringify(CONTENT);
    mutate(CONTENT);
    return saveContent().catch(function (err) {
      CONTENT = JSON.parse(before);
      throw err;
    });
  }

  /* ---------- About: intro text ---------- */
  function renderAbout() {
    if (!CONTENT) return;
    aboutInput.value = (CONTENT.about && CONTENT.about.text) || "";
  }
  // Saves the rich document (and its plain-text mirror) without dropping
  // the other about fields — docFlush() writes them into CONTENT first.
  saveAboutBtn.addEventListener("click", function () {
    docSave("about", saveAboutBtn, "Stránka „O nás“ byla uložena.");
  });

  /* ---------- About: team members ---------- */
  function resetTeamForm() {
    teamForm.reset();
    tmId.value = "";
    tmPendingImage = "";
    // the photo inputs live in the workspace sidebar, outside the form,
    // so form.reset() does not clear them
    tmImageUrl.value = "";
    tmImageFile.value = "";
    tmPreview.hidden = true;
    teamTitle.textContent = "Nový člen";
    teamSubmit.textContent = "Přidat člena";
  }
  function tmUpdatePreview(url) {
    if (url) {
      tmPreview.style.backgroundImage = VNSafe.cssUrl(url);
      tmPreview.hidden = false;
    } else { tmPreview.hidden = true; }
  }
  tmImageUrl.addEventListener("input", function () {
    if (tmImageUrl.value.trim()) { tmPendingImage = tmImageUrl.value.trim(); tmImageFile.value = ""; }
    else { tmPendingImage = ""; }
    tmUpdatePreview(tmPendingImage);
  });
  tmImageFile.addEventListener("change", function () {
    var file = tmImageFile.files && tmImageFile.files[0];
    if (!file) return;
    teamSubmit.disabled = true;
    teamSubmit.textContent = "Nahrávám…";
    uploadImageFile(file)
      .then(function (url) { tmPendingImage = url; tmImageUrl.value = ""; tmUpdatePreview(url); toast("Fotka nahrána."); })
      .catch(function (err) { toast("Nahrání selhalo: " + err.message); })
      .finally(function () { teamSubmit.disabled = false; teamSubmit.textContent = tmId.value ? "Uložit změny" : "Přidat člena"; });
  });
  teamReset.addEventListener("click", resetTeamForm);

  teamForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!CONTENT) return;
    if (!tmName.value.trim()) { toast("Jméno je povinné."); tmName.focus(); return; }
    var member = {
      id: tmId.value || ("t-" + Date.now().toString(36)),
      name: tmName.value.trim(),
      role: tmRole.value.trim(),
      image: tmPendingImage || tmImageUrl.value.trim() || ""
    };
    var idx = (CONTENT.team || []).findIndex(function (m) { return m.id === member.id; });

    teamSubmit.disabled = true;
    saveContentChange(function (c) {
      if (!Array.isArray(c.team)) c.team = [];
      if (idx === -1) c.team.push(member); else c.team[idx] = member;
    })
      .then(function () {
        toast(idx === -1 ? "Člen přidán." : "Člen uložen.");
        resetTeamForm(); closeTeamWorkspace(); renderTeamTable();
      })
      .catch(function (err) {
        renderTeamTable();
        if (err.status === 401) { showLogin(); return; }
        toast("Chyba: " + (err.detail || err.message));
      })
      .finally(function () { teamSubmit.disabled = false; });
  });

  function renderTeamTable() {
    if (!CONTENT) return;
    var list = CONTENT.team || [];
    if (list.length === 0) {
      teamTbody.innerHTML = '<tr class="empty-row"><td colspan="4">Zatím žádní členové.</td></tr>';
      return;
    }
    teamTbody.innerHTML = list.map(function (m) {
      var bg = VNSafe.cssUrl(m.image);   // validated + quoted; escaped for the attribute
      var thumb = bg
        ? '<span class="thumb round" style="background-image:' + escapeHtml(bg) + '"></span>'
        : '<span class="thumb round"></span>';
      return (
        '<tr data-id="' + escapeHtml(m.id) + '">' +
          "<td>" + thumb + "</td>" +
          "<td><strong>" + escapeHtml(m.name) + "</strong></td>" +
          "<td>" + escapeHtml(m.role || "") + "</td>" +
          '<td><div class="row-actions">' +
            '<button type="button" data-action="team-edit">Upravit</button>' +
            '<button type="button" data-action="team-delete" class="danger">Smazat</button>' +
          "</div></td>" +
        "</tr>"
      );
    }).join("");
  }

  teamTbody.addEventListener("click", function (event) {
    var btn = event.target.closest("button[data-action]");
    if (!btn || !CONTENT) return;
    var id = btn.closest("tr").dataset.id;
    var member = (CONTENT.team || []).find(function (m) { return m.id === id; });
    if (!member) return;
    if (btn.dataset.action === "team-edit") {
      tmId.value = member.id;
      tmName.value = member.name || "";
      tmRole.value = member.role || "";
      tmPendingImage = member.image || "";
      tmImageUrl.value = member.image || "";
      tmImageFile.value = "";
      tmUpdatePreview(tmPendingImage);
      teamTitle.textContent = "Upravit člena";
      teamSubmit.textContent = "Uložit změny";
      openTeamWorkspace();   // modular workspace in place — no separate page view
      teamWorkspace.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (btn.dataset.action === "team-delete") {
      if (!confirm('Opravdu smazat „' + (member.name || "") + '"?')) return;
      saveContentChange(function (c) {
        c.team = (c.team || []).filter(function (m) { return m.id !== id; });
      })
        .then(function () { if (tmId.value === id) resetTeamForm(); renderTeamTable(); toast("Člen smazán."); })
        .catch(function (err) {
          renderTeamTable();
          if (err.status === 401) { showLogin(); return; }
          toast("Chyba: " + (err.detail || err.message));
        });
    }
  });

  /* ---------- Contact: subtitle ---------- */
  function renderContactSubtitle() {
    if (!CONTENT) return;
    subtitleInput.value = (CONTENT.contact && CONTENT.contact.subtitle) || "";
  }
  saveSubBtn.addEventListener("click", function () {
    if (!CONTENT) return;
    if (!CONTENT.contact) CONTENT.contact = { subtitle: "", items: [] };
    CONTENT.contact.subtitle = subtitleInput.value;
    saveSubBtn.disabled = true;
    saveContent()
      .then(function () { toast("Podnadpis uložen."); })
      .catch(function (err) {
        if (err.status === 401) { showLogin(); return; }
        toast("Chyba: " + (err.detail || err.message));
      })
      .finally(function () { saveSubBtn.disabled = false; });
  });

  /* ---------- Contact: items ---------- */
  function resetContactForm() {
    contactForm.reset();
    ctId.value = "";
    contactTitle.textContent = "Nový kontakt";
    contactSubmit.textContent = "Přidat kontakt";
  }
  contactReset.addEventListener("click", resetContactForm);

  contactForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!CONTENT) return;
    if (!ctLabel.value.trim()) { toast("Zobrazený text je povinný."); ctLabel.focus(); return; }
    var item = {
      id: ctId.value || ("c-" + Date.now().toString(36)),
      type: ctType.value,
      label: ctLabel.value.trim(),
      url: ctUrl.value.trim()
    };
    if (item.url && !VNSafe.url(item.url)) {
      toast("Odkaz musí začínat https://, http://, mailto: nebo tel:");
      ctUrl.focus();
      return;
    }
    var items = (CONTENT.contact && Array.isArray(CONTENT.contact.items)) ? CONTENT.contact.items : [];
    var idx = items.findIndex(function (c) { return c.id === item.id; });

    contactSubmit.disabled = true;
    saveContentChange(function (c) {
      if (!c.contact) c.contact = { subtitle: "", items: [] };
      if (!Array.isArray(c.contact.items)) c.contact.items = [];
      if (idx === -1) c.contact.items.push(item); else c.contact.items[idx] = item;
    })
      .then(function () { toast(idx === -1 ? "Kontakt přidán." : "Kontakt uložen."); resetContactForm(); renderContactTable(); })
      .catch(function (err) {
        renderContactTable();
        if (err.status === 401) { showLogin(); return; }
        toast("Chyba: " + (err.detail || err.message));
      })
      .finally(function () { contactSubmit.disabled = false; });
  });

  function renderContactTable() {
    if (!CONTENT) return;
    renderContactSubtitle();
    var list = (CONTENT.contact && CONTENT.contact.items) || [];
    if (list.length === 0) {
      contactTbody.innerHTML = '<tr class="empty-row"><td colspan="4">Zatím žádné kontakty.</td></tr>';
      return;
    }
    contactTbody.innerHTML = list.map(function (c) {
      var safeHref = VNSafe.url(c.url);
      var link = safeHref
        ? '<a href="' + escapeHtml(safeHref) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(c.url) + "</a>"
        : (c.url ? escapeHtml(c.url) : '<span style="color:var(--muted);">— text —</span>');
      return (
        '<tr data-id="' + escapeHtml(c.id) + '">' +
          "<td><strong>" + escapeHtml(c.type) + "</strong></td>" +
          "<td>" + escapeHtml(c.label) + "</td>" +
          '<td style="font-size:0.82rem; word-break:break-all;">' + link + "</td>" +
          '<td><div class="row-actions">' +
            '<button type="button" data-action="contact-edit">Upravit</button>' +
            '<button type="button" data-action="contact-delete" class="danger">Smazat</button>' +
          "</div></td>" +
        "</tr>"
      );
    }).join("");
  }

  contactTbody.addEventListener("click", function (event) {
    var btn = event.target.closest("button[data-action]");
    if (!btn || !CONTENT) return;
    var id = btn.closest("tr").dataset.id;
    var item = ((CONTENT.contact && CONTENT.contact.items) || []).find(function (c) { return c.id === id; });
    if (!item) return;
    if (btn.dataset.action === "contact-edit") {
      ctId.value = item.id;
      ctType.value = item.type || "Odkaz";
      ctLabel.value = item.label || "";
      ctUrl.value = item.url || "";
      contactTitle.textContent = "Upravit kontakt";
      contactSubmit.textContent = "Uložit změny";
      contactForm.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (btn.dataset.action === "contact-delete") {
      if (!confirm('Opravdu smazat „' + (item.label || "") + '"?')) return;
      saveContentChange(function (c) {
        c.contact.items = c.contact.items.filter(function (x) { return x.id !== id; });
      })
        .then(function () { if (ctId.value === id) resetContactForm(); renderContactTable(); toast("Kontakt smazán."); })
        .catch(function (err) {
          renderContactTable();
          if (err.status === 401) { showLogin(); return; }
          toast("Chyba: " + (err.detail || err.message));
        });
    }
  });

  /* ============================================================
     VISUAL ARTICLE EDITOR (Canva + Google-Docs hybrid)
     ============================================================ */
  var EDITOR = {
    overlay:   document.querySelector("#editor-overlay"),
    canvas:    document.querySelector("#ed-canvas"),
    addImage:  document.querySelector("#ed-add-image"),
    addText:   document.querySelector("#ed-add-text"),
    addEmbed:  document.querySelector("#ed-add-embed"),
    embedDialog: document.querySelector("#ed-embed-dialog"),
    embedForm:   document.querySelector("#ed-embed-form"),
    embedUrl:    document.querySelector("#ed-embed-url"),
    embedStatus: document.querySelector("#ed-embed-status"),
    embedOk:     document.querySelector("#ed-embed-ok"),
    embedCancel: document.querySelector("#ed-embed-cancel"),
    imageFile: document.querySelector("#ed-image-file"),
    tools:     document.querySelector("#ed-format-tools"),
    fsVal:     document.querySelector("#ed-fs-val"),
    fsDec:     document.querySelector("#ed-fs-dec"),
    fsInc:     document.querySelector("#ed-fs-inc"),
    bold:      document.querySelector("#ed-bold"),
    italic:    document.querySelector("#ed-italic"),
    underline: document.querySelector("#ed-underline"),
    colorBtn:  document.querySelector("#ed-color"),
    colorPanel:document.querySelector("#ed-color-panel"),
    colorNative:document.querySelector("#ed-color-native"),
    rRange:    document.querySelector("#ed-r-range"),
    gRange:    document.querySelector("#ed-g-range"),
    bRange:    document.querySelector("#ed-b-range"),
    rNum:      document.querySelector("#ed-r-num"),
    gNum:      document.querySelector("#ed-g-num"),
    bNum:      document.querySelector("#ed-b-num"),
    hex:       document.querySelector("#ed-hex"),
    preview:   document.querySelector("#ed-color-preview"),
    confirm:   document.querySelector("#ed-confirm"),
    confirmTitle: document.querySelector("#ed-confirm-title"),
    confirmText:  document.querySelector("#ed-confirm-text"),
    confirmOk: document.querySelector("#ed-confirm-ok"),
    confirmCancel: document.querySelector("#ed-confirm-cancel"),
    backNoChange: document.querySelector("#ed-back-nochange"),
    deleteBtn:    document.querySelector("#ed-delete"),
    publish:      document.querySelector("#ed-publish"),
    metaToggle:   document.querySelector("#ed-meta-toggle"),
    side:         document.querySelector("#metadata-sidebar"),
    body:         document.querySelector("#editor-overlay .ed-body"),
    author:    document.querySelector("#ed-author"),
    tags:      document.querySelector("#ed-tags"),
    kind:      document.querySelector("#ed-kind"),
    date:      document.querySelector("#ed-date"),
    dateField: document.querySelector("#ed-date-field"),
    schedHint: document.querySelector("#ed-sched-hint"),
    alignL:    document.querySelector("#ed-align-left"),
    alignC:    document.querySelector("#ed-align-center"),
    alignR:    document.querySelector("#ed-align-right"),
    ul:        document.querySelector("#ed-ul"),
    ol:        document.querySelector("#ed-ol"),
    indDec:    document.querySelector("#ed-indent-dec"),
    indInc:    document.querySelector("#ed-indent-inc")
  };

  // ----- editor state -----
  var ED = {
    elements: [],          // array of element objects (the article layout)
    selectedId: null,
    editingId: null,
    snapshot: "",          // JSON for "discard"
    pendingAction: null,   // 'discard' | 'save' | 'delete'
    savedRange: null,      // last text selection inside the editing content
    liveSpan: null,        // span being restyled live by the size box / colour panel
    playingId: null,       // video/post block currently showing its live player preview
    lastFs: 16,            // last valid font size (for revert)
    colorSyncing: false,
    currentColor: "#000000"
  };

  /* Google-Docs document mode. While DOC.root is set, every formatting tool
     (size, B/I/U, colour, align, lists, indent) targets this one contenteditable
     document instead of a positioned canvas element — see edEditingContent()
     and edActiveContentEl(), the two funnels all of them go through. */
  var DOC = {
    root: null,     // the contenteditable document element
    key: null,      // "home" | "about"
    dirty: false
  };

  // Page width of the article canvas; article.html renders the same 820px.
  var ED_CANVAS_W = 820;
  function edUid() { return "el-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6); }
  function edStripHtml(html) {
    var d = document.createElement("div");
    d.innerHTML = html || "";
    return (d.textContent || "").trim();
  }
  function defaultStyles(over) {
    return Object.assign({
      fontSize: "16px", color: "#1a1a1a",
      bold: false, italic: false, underline: false, align: "left"
    }, over || {});
  }

  /* ---------- open / close / seed ---------- */
  function edOpen() {
    ED.elements = [];
    ED.background = edParseJson(fBackground.value, { color: "", image: "" });
    // 1) try to load an existing layout from the hidden form field
    if (fElements.value) {
      try {
        var parsed = JSON.parse(fElements.value);
        if (Array.isArray(parsed)) ED.elements = parsed;
        // stored HTML is cleaned before it ever reaches a contenteditable
        ED.elements.forEach(function (el) {
          if (el && el.type === "text") el.content = VNSafe.html(el.content);
        });
      } catch (e) { ED.elements = []; }
    }
    // 2) ensure a mandatory, non-deletable title element exists
    var hasTitle = ED.elements.some(function (el) { return el.isTitle; });
    if (!hasTitle) {
      ED.elements.unshift({
        id: edUid(), type: "text", isTitle: true,
        content: escapeHtml(fTitle.value || "Nadpis článku"),
        x: 40, y: 24, width: 640, height: "auto",
        styles: defaultStyles({ fontSize: "34px", bold: true })
      });
      // 3) seed a body text element from the plain-text body, if any and no other text exists
      var bodyText = (fBody.value || "").trim();
      var hasBody = ED.elements.some(function (el) { return el.type === "text" && !el.isTitle; });
      if (bodyText && !hasBody) {
        ED.elements.push({
          id: edUid(), type: "text", isTitle: false,
          content: escapeHtml(bodyText).replace(/\n/g, "<br>"),
          x: 40, y: 120, width: 640, height: "auto",
          styles: defaultStyles()
        });
      }
    }
    // load metadata into the left sidebar (mirrors the article form)
    EDITOR.author.value = fAuthors.value || "";
    EDITOR.tags.value = fTags.value || "";
    EDITOR.kind.value = fKind.value || "article";
    EDITOR.date.value = fDate.value || nowLocalInput();
    edUpdateSchedule();
    edThumbLoad(pendingImageUrl || fImageUrl.value.trim());

    ED.session = (ED.session || 0) + 1;  // lets late async results detect a new editor session
    ED.selectedId = null;
    ED.editingId = null;
    ED.liveSpan = null;
    ED.playingId = null;
    // Straight into the visual editor — there is no separate preview step.
    document.body.classList.add("visual-editor-active");
    edSetMetaOpen(edMetaPref());
    edApplyBackground(EDITOR.canvas, ED.background);
    edRenderCanvas();
    edSetToolsVisible(false);
    edSetLayerVisible(false);
    EDITOR.overlay.hidden = false;
    ED.pageH = 0;                        // a new article starts from one sheet + its content
    edAutoHeight();
    ED.snapshot = edStateSnapshot();     // compared by the leave-page warning
  }
  // Everything Vydat would save — compared with the state at open time.
  function edStateSnapshot() {
    return JSON.stringify([ED.elements, ED.background || null, EDITOR.author.value, EDITOR.tags.value,
      EDITOR.kind.value, EDITOR.date.value, ED.thumbUrl || ""]);
  }

  /* ---------- collapsible metadata drawer ---------- */
  var META_PREF_KEY = "vn-editor-meta-open";
  function edMetaPref() {
    try { return localStorage.getItem(META_PREF_KEY) !== "0"; } catch (e) { return true; }
  }
  function edSetMetaOpen(open, remember) {
    EDITOR.body.classList.toggle("is-meta-collapsed", !open);
    EDITOR.metaToggle.setAttribute("aria-expanded", open ? "true" : "false");
    EDITOR.side.inert = !open;            // keep collapsed fields out of the tab order
    if (remember) { try { localStorage.setItem(META_PREF_KEY, open ? "1" : "0"); } catch (e) {} }
  }
  EDITOR.metaToggle.addEventListener("click", function () {
    edSetMetaOpen(EDITOR.body.classList.contains("is-meta-collapsed"), true);
  });

  // Purple border + hint + "Naplánovat" label when the chosen time is in the future.
  function edUpdateSchedule() {
    var d = parseLocalInput(EDITOR.date.value);
    var future = !!d && d.getTime() > Date.now();
    EDITOR.dateField.classList.toggle("is-scheduled", future);
    EDITOR.schedHint.hidden = !future;
    EDITOR.schedHint.textContent = future
      ? "Naplánováno — vyjde " + formatLocalInput(EDITOR.date.value) + "."
      : "";
    EDITOR.publish.textContent = future ? "Naplánovat" : "Vydat";
    EDITOR.publish.classList.toggle("is-scheduled", future);
  }
  EDITOR.date.addEventListener("input", edUpdateSchedule);
  EDITOR.date.addEventListener("change", edUpdateSchedule);
  /* ---------- thumbnail (Náhledový obrázek) in the metadata drawer ----------
     Flow: pick/drop file -> instant preview from a blob: URL -> upload
     through uploadImageFile() (validation + compression + Blob storage)
     -> the server URL replaces the preview. Only that URL goes into the
     article (`image`), never Base64, so articles.json stays small.
     State lives in ED.thumbUrl until Vydat commits it
     (edCommitToForm), so "Zpět" really discards a new thumbnail.
     Every blob: URL is revoked as soon as it is replaced, removed, or the
     editor closes. A token drops results of uploads that were superseded. */
  var THUMB = {
    file:    document.querySelector("#ed-thumb-file"),
    drop:    document.querySelector("#ed-thumb-drop"),
    preview: document.querySelector("#ed-thumb-preview"),
    img:     document.querySelector("#ed-thumb-img"),
    status:  document.querySelector("#ed-thumb-status"),
    remove:  document.querySelector("#ed-thumb-remove"),
    change:  document.querySelector("#ed-thumb-change")
  };
  var THUMB_TYPES = { "image/jpeg": 1, "image/png": 1, "image/webp": 1 };
  ED.thumbUrl = "";        // committed server URL ("" = no thumbnail)
  ED.thumbLocal = "";      // current blob: preview URL, if any
  ED.thumbToken = 0;       // bumps on every pick/remove; stale uploads are ignored

  function edThumbRevoke() {
    if (ED.thumbLocal) { URL.revokeObjectURL(ED.thumbLocal); ED.thumbLocal = ""; }
  }
  function edThumbRender(src, uploading) {
    var has = !!src;
    THUMB.drop.hidden = has;
    THUMB.preview.hidden = !has;
    THUMB.preview.classList.toggle("is-uploading", !!uploading);
    THUMB.status.hidden = !uploading;
    if (has) THUMB.img.src = src; else THUMB.img.removeAttribute("src");
  }
  // Called from edOpen(): show the article's existing thumbnail.
  function edThumbLoad(url) {
    ED.thumbToken++;
    edThumbRevoke();
    ED.thumbUrl = url || "";
    THUMB.file.value = "";
    edThumbRender(ED.thumbUrl, false);
  }
  function edThumbPick(file) {
    if (!file) return;
    if (!THUMB_TYPES[fileMime(file)]) { toast("Náhled musí být JPG, PNG nebo WEBP."); return; }
    var token = ++ED.thumbToken;
    var previousUrl = ED.thumbUrl;
    edThumbRevoke();                              // drop the preview being replaced
    ED.thumbLocal = URL.createObjectURL(file);
    edThumbRender(ED.thumbLocal, true);           // instant local preview
    uploadImageFile(file)
      .then(function (url) {
        if (token !== ED.thumbToken) return;      // user picked/removed meanwhile
        ED.thumbUrl = url;
        edThumbRender(url, false);
        edThumbRevoke();
        toast("Náhled nahrán.");
      })
      .catch(function (err) {
        if (token !== ED.thumbToken) return;
        edThumbRevoke();
        ED.thumbUrl = previousUrl;                // keep the previous thumbnail
        edThumbRender(previousUrl, false);
        toast("Nahrání náhledu selhalo: " + err.message);
      })
      .finally(function () { THUMB.file.value = ""; });  // same file can be re-picked
  }
  function edThumbClear() {
    ED.thumbToken++;                              // an in-flight upload is ignored
    edThumbRevoke();
    ED.thumbUrl = "";
    THUMB.file.value = "";
    edThumbRender("", false);
  }
  THUMB.drop.addEventListener("click", function () { THUMB.file.click(); });
  THUMB.change.addEventListener("click", function () { THUMB.file.click(); });
  THUMB.remove.addEventListener("click", edThumbClear);
  THUMB.file.addEventListener("change", function () {
    edThumbPick(THUMB.file.files && THUMB.file.files[0]);
  });
  // drag & drop onto the empty zone
  ["dragenter", "dragover"].forEach(function (t) {
    THUMB.drop.addEventListener(t, function (e) { e.preventDefault(); THUMB.drop.classList.add("is-dragover"); });
  });
  ["dragleave", "drop"].forEach(function (t) {
    THUMB.drop.addEventListener(t, function () { THUMB.drop.classList.remove("is-dragover"); });
  });
  THUMB.drop.addEventListener("drop", function (e) {
    e.preventDefault();
    edThumbPick(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
  });

  function edClose() {
    edThumbRevoke();
    edCloseColorPanel();
    // Leave no editing state behind: a stale editingId kept the global
    // shortcuts (and selection tracking) aimed at a closed editor.
    ED.editingId = null;
    ED.selectedId = null;
    ED.savedRange = null;
    ED.liveSpan = null;
    ED.playingId = null;     // stops a playing video preview
    edCloseEmbedDialog();
    document.body.classList.remove("visual-editor-active");
    EDITOR.overlay.hidden = true;
  }
  // Commit the layout back into the article form (title + plain-text body + JSON)
  function edCommitToForm() {
    // thumbnail -> the form state the submit payload reads (`image`)
    pendingImageUrl = ED.thumbUrl;
    fImageUrl.value = "";
    updatePreview(pendingImageUrl);
    fElements.value = JSON.stringify(ED.elements);
    fBackground.value = JSON.stringify(ED.background || { color: "", image: "" });
    var titleEl = ED.elements.filter(function (el) { return el.isTitle; })[0];
    if (titleEl) fTitle.value = edStripHtml(titleEl.content);
    var bodyText = ED.elements
      .filter(function (el) { return el.type === "text" && !el.isTitle; })
      .map(function (el) { return edStripHtml(el.content); })
      .filter(Boolean)
      .join("\n\n");
    fBody.value = bodyText;
    // commit metadata from the left sidebar back into the article form
    fAuthors.value = EDITOR.author.value;
    fTags.value = EDITOR.tags.value;
    fKind.value = EDITOR.kind.value;
    fDate.value = EDITOR.date.value || nowLocalInput();
  }

  /* ---------- rendering ---------- */
  function edRenderCanvas() {
    var keep = edKeepSelection();
    EDITOR.canvas.innerHTML = "";
    if (edResizeObs) edResizeObs.disconnect();
    // Elements created before layering existed (or newly added, which are
    // pushed last) get a z by array order — so new blocks land on top.
    ED.elements.forEach(function (el, i) {
      if (typeof el.z !== "number") el.z = i + 1;
    });
    ED.elements.forEach(function (el) {
      var node = edBuildNode(el);
      EDITOR.canvas.appendChild(node);
      if (edResizeObs) edResizeObs.observe(node);   // typing / image load -> page grows
    });
    edRestoreKeptSelection(keep);
    edScheduleAutoHeight();
  }

  /* A re-render (upload finishing, layer change…) replaces the node being
     edited. ED.savedRange then pointed into the removed node and the next
     colour / font / size change silently did nothing until the text was
     selected again. Carry the selection over as text offsets instead. */
  function edTextOffset(root, node, offset) {
    var r = document.createRange();
    r.selectNodeContents(root);
    r.setEnd(node, offset);
    return r.toString().length;
  }
  // isStart: a point exactly between two text runs belongs to the next run
  // (else the toolbar would read the size / font of the run before it)
  function edTextPoint(root, chars, isStart) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n, last = null;
    while ((n = w.nextNode())) {
      if (chars < n.nodeValue.length || (!isStart && chars === n.nodeValue.length)) return { node: n, offset: chars };
      chars -= n.nodeValue.length;
      last = n;
    }
    return last ? { node: last, offset: last.nodeValue.length } : { node: root, offset: root.childNodes.length };
  }
  function edKeepSelection() {
    if (DOC.root || !ED.editingId || !ED.savedRange) return null;
    var old = EDITOR.canvas.querySelector('.ed-el[data-id="' + ED.editingId + '"] .ed-el-content');
    var r = ED.savedRange;
    if (!old || !old.contains(r.startContainer) || !old.contains(r.endContainer)) return null;
    return {
      id: ED.editingId,
      start: edTextOffset(old, r.startContainer, r.startOffset),
      end: edTextOffset(old, r.endContainer, r.endOffset),
      focused: old === document.activeElement || old.contains(document.activeElement)
    };
  }
  function edRestoreKeptSelection(keep) {
    if (!keep || keep.id !== ED.editingId) return;
    var content = edEditingContent();
    if (!content) return;
    var a = edTextPoint(content, keep.start, keep.start !== keep.end), b = edTextPoint(content, keep.end);
    var r = document.createRange();
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
    ED.liveSpan = null;               // its node is gone; the styling is already in el.content
    ED.savedRange = r;
    if (keep.focused) {
      content.focus();
      var sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(r.cloneRange());
    }
  }

  /* Whole-box formatting (block selected, not being edited). The box style
     alone stayed hidden wherever earlier range formatting had left an inline
     style for the same property, so it seemed to do nothing there. Clear
     those first — like formatting all of the text in Google Docs. */
  function edBoxStyle(el, props) {
    var content = EDITOR.canvas.querySelector('.ed-el[data-id="' + el.id + '"] .ed-el-content');
    if (!content) return;
    Array.prototype.forEach.call(content.querySelectorAll("[style]"), function (n) {
      props.forEach(function (p) { n.style[p] = ""; });
      if (!n.getAttribute("style")) n.removeAttribute("style");
    });
    edApplyContentStyles(content, el);
    el.content = content.innerHTML;
  }
  function edApplyContentStyles(content, el) {
    content.style.fontFamily = el.styles.fontFamily || "";
    content.style.fontSize = el.styles.fontSize || "16px";
    content.style.color = el.styles.color || "#1a1a1a";
    content.style.fontWeight = el.styles.bold ? "700" : "400";
    content.style.fontStyle = el.styles.italic ? "italic" : "normal";
    content.style.textDecoration = el.styles.underline ? "underline" : "none";
    content.style.textAlign = el.styles.align || "left";
  }

  function edBuildNode(el) {
    var node = document.createElement("div");
    node.className = "ed-el ed-el--" + el.type + (el.isTitle ? " is-title" : "");
    node.dataset.id = el.id;
    node.style.left = el.x + "px";
    node.style.top = el.y + "px";
    node.style.width = el.width + "px";
    node.style.height = (el.height === "auto" || el.height == null) ? "auto" : (el.height + "px");
    node.style.zIndex = el.z || 1;   // page background stays behind (z:0 on the canvas)
    if (ED.selectedId === el.id) node.classList.add("is-selected");
    if (ED.editingId === el.id) node.classList.add("is-editing");
    if (el.uploading) node.classList.add("is-uploading");

    var content = document.createElement("div");
    content.className = "ed-el-content";
    if (el.type === "image") {
      var img = document.createElement("img");
      img.src = el.content;
      img.alt = "";
      content.appendChild(img);
    } else if (el.type === "file") {
      var fileLink = document.createElement("span");   // not a live link inside the editor
      fileLink.className = "ed-file";
      fileLink.textContent = "📄 " + (el.name || "Dokument PDF");
      content.appendChild(fileLink);
    } else if (el.type === "embed") {
      edBuildEmbedContent(content, el);
    } else {
      content.innerHTML = el.content || "";
      edApplyContentStyles(content, el);
      content.contentEditable = (ED.editingId === el.id) ? "true" : "false";
    }
    node.appendChild(content);

    if (el.isTitle) {
      var badge = document.createElement("span");
      badge.className = "ed-el-title-badge";
      badge.textContent = "Titulek";
      node.appendChild(badge);
    }

    // selection chrome: handles + delete
    if (ED.selectedId === el.id) {
      ["nw", "n", "ne", "e", "se", "s", "sw", "w"].forEach(function (h) {
        var hd = document.createElement("div");
        hd.className = "ed-handle";
        hd.dataset.h = h;
        hd.addEventListener("pointerdown", function (ev) { edStartResize(ev, el, node, h); });
        node.appendChild(hd);
      });
      if (!el.isTitle) {
        var del = document.createElement("button");
        del.type = "button";
        del.className = "ed-el-delete";
        del.innerHTML = "&times;";
        del.title = "Smazat blok";
        del.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
        del.addEventListener("click", function (ev) {
          ev.stopPropagation();
          edDeleteElement(el.id);
        });
        node.appendChild(del);
      }
    }

    // pointer interactions (drag / select / enter-edit)
    content.addEventListener("pointerdown", function (ev) { edPointerDownOnElement(ev, el, node, content); });
    content.addEventListener("dblclick", function (ev) {
      // already editing: keep the browser's own double-click word selection
      // (re-entering edit mode re-rendered the box and threw it away)
      if (el.type === "text") { if (ED.editingId === el.id) return; ev.preventDefault(); edEnterEdit(el.id, ev.clientX, ev.clientY); }
      else if (el.type === "embed") { ev.preventDefault(); edPlayEmbed(el.id); }
    });
    // keep state in sync while editing
    if (el.type === "text") {
      content.addEventListener("input", function () {
        el.content = content.innerHTML;
      });
    }
    return node;
  }

  /* ---------- selection / drag / resize ---------- */
  /* ---------- smart guides (snap to other blocks while moving / resizing) ----------
     Snap lines: left / centre / right and top / middle / bottom of every
     other block, plus the page edges and centre. When an edge or the centre
     of the moving box comes within GUIDE_SNAP px of a line it snaps onto it
     and a dashed guide shows which block it lines up with. Alt = no snapping. */
  var GUIDE_SNAP = 5;
  function edGuideLines(exceptId) {
    var pageH = Math.max(EDITOR.canvas.scrollHeight, EDITOR.canvas.offsetHeight);
    var v = [0, ED_CANVAS_W / 2, ED_CANVAS_W].map(function (p) { return { pos: p, from: 0, to: pageH }; });
    var h = [];
    Array.prototype.forEach.call(EDITOR.canvas.querySelectorAll(":scope > .ed-el"), function (n) {
      if (n.dataset.id === exceptId) return;
      var l = n.offsetLeft, t = n.offsetTop, w = n.offsetWidth, ht = n.offsetHeight;
      [l, l + w / 2, l + w].forEach(function (p) { v.push({ pos: p, from: t, to: t + ht }); });
      [t, t + ht / 2, t + ht].forEach(function (p) { h.push({ pos: p, from: l, to: l + w }); });
    });
    return { v: v, h: h };
  }
  // Closest line to any of the moving box's `edges` within GUIDE_SNAP (or null).
  function edSnap(edges, lines) {
    var best = null;
    edges.forEach(function (e) {
      lines.forEach(function (L) {
        var d = L.pos - e;
        if (Math.abs(d) <= GUIDE_SNAP && (!best || Math.abs(d) < Math.abs(best.delta))) best = { delta: d, line: L };
      });
    });
    return best;
  }
  // Draw the guides: each spans from the aligned block to the moving box.
  function edShowGuides(gx, gy, box) {
    [["v", gx], ["h", gy]].forEach(function (pair) {
      var kind = pair[0], g = pair[1];
      var line = EDITOR.canvas.querySelector(":scope > .ed-guide--" + kind);
      if (!g) { if (line) line.hidden = true; return; }
      if (!line) {
        line = document.createElement("div");
        line.className = "ed-guide ed-guide--" + kind;
        EDITOR.canvas.appendChild(line);
      }
      line.hidden = false;
      var a = kind === "v" ? Math.min(g.line.from, box.y) : Math.min(g.line.from, box.x);
      var b = kind === "v" ? Math.max(g.line.to, box.y + box.h) : Math.max(g.line.to, box.x + box.w);
      if (kind === "v") { line.style.left = g.line.pos + "px"; line.style.top = a + "px"; line.style.height = (b - a) + "px"; }
      else { line.style.top = g.line.pos + "px"; line.style.left = a + "px"; line.style.width = (b - a) + "px"; }
    });
  }
  function edHideGuides() {
    Array.prototype.forEach.call(EDITOR.canvas.querySelectorAll(":scope > .ed-guide"), function (n) { n.remove(); });
  }

  /* ---------- page auto-expansion (Word / Google Docs style) ----------
     The paper is never one fixed sheet. It always keeps ED_PAGE_STEP px of
     free room under the lowest block (so typing, resizing or dragging a block
     down grows it live), and the pointer or the scrolled view coming within
     ED_GROW_ZONE px of the bottom edge adds another step — every time, so the
     page never ends. Room nobody used is given back after a drop / delete
     (only below the visible area, so nothing jumps). Dragging / resizing near
     the top or bottom of the visible area scrolls the canvas along.
     Editor-only: article.html sizes the public page from the blocks. */
  var ED_PAGE_MIN = 1100;      // one sheet — the old fixed height
  var ED_PAGE_STEP = 600;
  var ED_GROW_ZONE = 100;
  ED.pageH = 0;
  function edContentBottom() {
    var b = 0;
    Array.prototype.forEach.call(EDITOR.canvas.querySelectorAll(":scope > .ed-el"), function (n) {
      // the inline top is the layout value; offsetTop can lag behind a running transition
      var top = parseFloat(n.style.top);
      b = Math.max(b, (isNaN(top) ? n.offsetTop : top) + n.offsetHeight);
    });
    return b;
  }
  // Canvas y of the bottom edge of the visible area.
  function edSeenBottom() {
    return EDITOR.canvas.parentNode.getBoundingClientRect().bottom - EDITOR.canvas.getBoundingClientRect().top;
  }
  // near (optional): canvas y of the pointer / moving block / visible bottom —
  // inside the grow zone it adds a step. opts.shrink gives back unused room,
  // but never what is on screen.
  function edAutoHeight(near, opts) {
    if (EDITOR.overlay.hidden) return;
    opts = opts || {};
    var base = Math.max(ED_PAGE_MIN, edContentBottom() + ED_PAGE_STEP);
    var h = Math.max(ED.pageH || 0, base);
    // (the kept margin below the visible bottom stops a shrink from landing in the grow zone)
    if (opts.shrink) h = Math.max(base, Math.min(h, Math.ceil(edSeenBottom()) + ED_GROW_ZONE));
    if (typeof near === "number" && h - near < ED_GROW_ZONE) h += ED_PAGE_STEP;
    h = Math.round(h);
    if (h !== ED.pageH) {
      ED.pageH = h;
      EDITOR.canvas.style.minHeight = h + "px";
    }
  }
  // Any block changing size (typing, image load, font change) re-checks the page.
  var edAutoRaf = 0;
  function edScheduleAutoHeight() {
    if (edAutoRaf) return;
    edAutoRaf = requestAnimationFrame(function () { edAutoRaf = 0; edAutoHeight(); });
  }
  var edResizeObs = window.ResizeObserver ? new ResizeObserver(edScheduleAutoHeight) : null;
  EDITOR.canvas.parentNode.addEventListener("pointermove", function (e) {
    var y = e.clientY - EDITOR.canvas.getBoundingClientRect().top;
    if ((ED.pageH || 0) - y < ED_GROW_ZONE) edAutoHeight(y);
  });
  // Scrolling (wheel, keys, scrollbar) to the end of the page also extends it.
  var edScrollRaf = 0;
  EDITOR.canvas.parentNode.addEventListener("scroll", function () {
    if (edScrollRaf) return;
    edScrollRaf = requestAnimationFrame(function () {
      edScrollRaf = 0;
      var seen = edSeenBottom();
      if ((ED.pageH || 0) - seen < ED_GROW_ZONE) edAutoHeight(seen);
    });
  }, { passive: true });
  // While a block is dragged / resized with the pointer near the top or bottom
  // edge of the visible canvas, scroll it; onScroll re-runs the move so the
  // block stays under the pointer (and the page keeps growing under it).
  function edEdgeScroller(onScroll) {
    var wrap = EDITOR.canvas.parentNode, raf = 0, lastY = null, EDGE = 48;
    function tick() {
      raf = 0;
      if (lastY === null) return;
      var r = wrap.getBoundingClientRect(), v = 0;
      var zone = Math.min(EDGE, r.height / 4);        // a short (phone) view must not be all edge
      if (lastY > r.bottom - zone) v = Math.min(zone, lastY - (r.bottom - zone));
      else if (lastY < r.top + zone) v = -Math.min(zone, r.top + zone - lastY);
      if (!v) return;
      var before = wrap.scrollTop;
      wrap.scrollTop += Math.ceil(Math.abs(v) / 3) * (v < 0 ? -1 : 1);
      if (wrap.scrollTop !== before) onScroll();      // the move it re-runs may already have queued the next tick
      if (!raf) raf = requestAnimationFrame(tick);    // exactly one loop, never a second one
    }
    return {
      update: function (clientY) { lastY = clientY; if (!raf) raf = requestAnimationFrame(tick); },
      stop: function () { lastY = null; if (raf) cancelAnimationFrame(raf); raf = 0; }
    };
  }

  function edPointerDownOnElement(ev, el, node, content) {
    if (ev.button !== 0) return;
    // already editing this text box -> let the caret/selection work
    if (ED.editingId === el.id) return;

    var wasSelected = (ED.selectedId === el.id);
    var startX = ev.clientX, startY = ev.clientY;
    var origX = el.x, origY = el.y;
    var moved = false;
    // Do NOT re-render here (that would destroy the node mid-drag); just move
    // the existing node live, then commit selection on pointerup.
    try { content.setPointerCapture(ev.pointerId); } catch (e) {}

    var guides = null;                 // snap lines of the other blocks (built on first move)
    // the canvas may scroll under a held block (edge auto-scroll, wheel)
    var wrap = EDITOR.canvas.parentNode, sx0 = wrap.scrollLeft, sy0 = wrap.scrollTop, last = null;
    var edge = edEdgeScroller(function () { if (last) move(last); });
    function move(e2) {
      last = e2;
      // a re-render (upload finishing, Ctrl+V…) replaced the block mid-drag:
      // its pointerup will never come, so end the gesture here
      if (!node.isConnected) { up(); return; }
      var dx = e2.clientX - startX + (wrap.scrollLeft - sx0), dy = e2.clientY - startY + (wrap.scrollTop - sy0);
      if (!moved && Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      if (moved) {
        var w = node.offsetWidth, hgt = node.offsetHeight, maxX = Math.max(0, ED_CANVAS_W - w);
        var x = Math.min(Math.max(0, origX + dx), maxX), y = Math.max(0, origY + dy);
        // smart guides: edges/centre snap to other blocks (Alt = move freely)
        var gx = null, gy = null;
        if (!e2.altKey) {
          guides = guides || edGuideLines(el.id);
          gx = edSnap([x, x + w / 2, x + w], guides.v);
          gy = edSnap([y, y + hgt / 2, y + hgt], guides.h);
          if (gx) x = Math.min(Math.max(0, x + gx.delta), maxX);
          if (gy) y = Math.max(0, y + gy.delta);
        }
        el.x = Math.round(x);
        el.y = Math.round(y);
        node.style.left = el.x + "px";
        node.style.top = el.y + "px";
        edShowGuides(gx, gy, { x: el.x, y: el.y, w: w, h: hgt });
        edAutoHeight(el.y + hgt);
        edge.update(e2.clientY);
      }
    }
    function up(e3) {
      content.removeEventListener("pointermove", move);
      content.removeEventListener("pointerup", up);
      content.removeEventListener("pointercancel", up);
      try { content.releasePointerCapture(ev.pointerId); } catch (e) {}
      edge.stop();
      edHideGuides();
      if (moved) edAutoHeight(null, { shrink: true });
      if (!e3 || e3.type === "pointercancel") return;  // the browser took the gesture over / the block was re-rendered away
      var dbl = !moved && edIsDoubleClick(el.id, e3);
      if (moved) {
        if (!wasSelected) edSelect(el.id); else edUpdateToolbar();
      } else if (wasSelected && el.type === "embed") {
        edPlayEmbed(el.id);          // click on already-selected video -> live preview
      } else if (wasSelected && el.type === "text") {
        // click on already-selected text -> edit with the caret at the click
        // (a double-click selects the word there)
        edEnterEdit(el.id, e3.clientX, e3.clientY, dbl);
      } else {
        edSelect(el.id);             // first click -> select
      }
    }
    content.addEventListener("pointermove", move);
    content.addEventListener("pointerup", up);
    content.addEventListener("pointercancel", up);
  }

  function edStartResize(ev, el, node, h) {
    ev.preventDefault();
    ev.stopPropagation();
    // element is already selected (handles only exist when selected) -> no re-render
    var startX = ev.clientX, startY = ev.clientY;
    var origX = el.x, origY = el.y;
    var origW = node.offsetWidth;
    var origH = node.offsetHeight;
    try { node.setPointerCapture(ev.pointerId); } catch (e) {}
    var guides = edGuideLines(el.id);
    var wrap = EDITOR.canvas.parentNode, sx0 = wrap.scrollLeft, sy0 = wrap.scrollTop, last = null;
    var edge = edEdgeScroller(function () { if (last) move(last); });

    function move(e2) {
      last = e2;
      if (!node.isConnected) { up(); return; }
      var dx = e2.clientX - startX + (wrap.scrollLeft - sx0), dy = e2.clientY - startY + (wrap.scrollTop - sy0);
      var w = origW, ht = origH, x = origX, y = origY;
      if (h.indexOf("e") > -1) w = origW + dx;
      if (h.indexOf("s") > -1) ht = origH + dy;
      if (h.indexOf("w") > -1) { w = origW - dx; x = origX + dx; }
      if (h.indexOf("n") > -1) { ht = origH - dy; y = origY + dy; }
      // smart guides: the dragged edge snaps to other blocks (Alt = free)
      var gx = null, gy = null;
      if (!e2.altKey) {
        if (h.indexOf("e") > -1 && (gx = edSnap([x + w], guides.v))) w += gx.delta;
        if (h.indexOf("w") > -1 && (gx = edSnap([x], guides.v))) { x += gx.delta; w -= gx.delta; }
        if (h.indexOf("s") > -1 && (gy = edSnap([y + ht], guides.h))) ht += gy.delta;
        if (h.indexOf("n") > -1 && (gy = edSnap([y], guides.h))) { y += gy.delta; ht -= gy.delta; }
      }
      w = Math.max(40, w); ht = Math.max(24, ht);
      // clamp x/y so resizing from top/left can't invert
      if (h.indexOf("w") > -1) x = origX + (origW - w);
      if (h.indexOf("n") > -1) y = origY + (origH - ht);
      // keep the box inside the page — the public article is exactly ED_CANVAS_W wide
      if (x < 0) { if (h.indexOf("w") > -1) w += x; x = 0; }
      if (x + w > ED_CANVAS_W) w = Math.max(40, ED_CANVAS_W - x);
      el.x = x; el.y = Math.max(0, y);
      el.width = Math.round(w); el.height = Math.round(ht);
      node.style.left = el.x + "px"; node.style.top = el.y + "px";
      node.style.width = el.width + "px"; node.style.height = el.height + "px";
      edShowGuides(gx, gy, { x: el.x, y: el.y, w: el.width, h: el.height });
      edAutoHeight(el.y + el.height);
      if (/[ns]/.test(h)) edge.update(e2.clientY);    // a sideways resize must not scroll
    }
    function up() {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.removeEventListener("pointercancel", up);
      try { node.releasePointerCapture(ev.pointerId); } catch (e) {}
      edge.stop();
      edHideGuides();
      edAutoHeight(null, { shrink: true });
    }
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
  }

  function edSelect(id) {
    if (ED.editingId && ED.editingId !== id) edExitEdit();
    if (ED.playingId !== id) ED.playingId = null;   // another block -> stop the live preview
    ED.selectedId = id;
    edRenderCanvas();
    var el = edFind(id);
    edSetToolsVisible(!!el && el.type === "text");
    edSetLayerVisible(!!el);       // layers work for every block type
    edUpdateToolbar();
  }
  function edDeselect() {
    if (ED.editingId) edExitEdit();
    ED.playingId = null;
    ED.selectedId = null;
    edRenderCanvas();
    edSetToolsVisible(false);
    edSetLayerVisible(false);
    edCloseColorPanel();
  }
  function edFind(id) {
    for (var i = 0; i < ED.elements.length; i++) if (ED.elements[i].id === id) return ED.elements[i];
    return null;
  }
  function edDeleteElement(id) {
    var el = edFind(id);
    if (!el || el.isTitle) return;     // title is non-deletable
    ED.elements = ED.elements.filter(function (e) { return e.id !== id; });
    if (ED.selectedId === id) ED.selectedId = null;
    if (ED.editingId === id) ED.editingId = null;
    edRenderCanvas();
    edAutoHeight(null, { shrink: true });
    edSetToolsVisible(false);
    edSetLayerVisible(false);
  }

  /* ---------- inline editing ---------- */
  // Our own double-click detection: the first click re-renders the block, and
  // Chrome drops the native dblclick when its target node was replaced.
  var edLastClick = null;
  function edIsDoubleClick(id, e) {
    var prev = edLastClick;
    edLastClick = { id: id, t: e.timeStamp, x: e.clientX, y: e.clientY };
    return !!prev && prev.id === id && e.timeStamp - prev.t < 500 &&
      Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y) < 8;
  }
  // The word around a caret (Czech letters included: anything but spaces/punctuation).
  function edWordAt(r) {
    var n = r.startContainer, i = r.startOffset;
    if (n.nodeType !== 3) return r;
    var s = n.nodeValue, a = i, b = i, W = /[^\s.,;:!?()[\]{}"'„“”«»\/\\​]/;
    while (a > 0 && W.test(s.charAt(a - 1))) a--;
    while (b < s.length && W.test(s.charAt(b))) b++;
    if (a === b) return r;
    var w = document.createRange();
    w.setStart(n, a); w.setEnd(n, b);
    return w;
  }
  // x / y (optional): the click that opened editing — the caret goes there
  // instead of to the start of the text, like a click into a Word document;
  // word: it was a double-click, so the word there gets selected.
  function edEnterEdit(id, x, y, word) {
    var el = edFind(id);
    if (!el || el.type !== "text") return;
    if (ED.editingId === id) { edSetToolsVisible(true); edUpdateToolbar(); return; }   // never rebuild the box being edited
    ED.editingId = id;
    ED.selectedId = id;
    edRenderCanvas();
    var node = EDITOR.canvas.querySelector('.ed-el[data-id="' + id + '"]');
    if (!node) return;
    var content = node.querySelector(".ed-el-content");
    content.contentEditable = "true";
    content.focus();
    var caret = typeof x === "number" ? edCaretAt(x, y) : null;
    if (caret && content.contains(caret.startContainer)) {
      if (word) caret = edWordAt(caret);
      var sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(caret);
      ED.savedRange = caret.cloneRange();
    }
    edSetToolsVisible(true);
    edUpdateToolbar();
  }
  function edCaretAt(x, y) {
    if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
    if (document.caretPositionFromPoint) {
      var p = document.caretPositionFromPoint(x, y);
      if (!p) return null;
      var r = document.createRange();
      r.setStart(p.offsetNode, p.offset);
      r.collapse(true);
      return r;
    }
    return null;
  }
  function edExitEdit() {
    if (!ED.editingId) return;
    var node = EDITOR.canvas.querySelector('.ed-el[data-id="' + ED.editingId + '"]');
    if (node) {
      var content = node.querySelector(".ed-el-content");
      var el = edFind(ED.editingId);
      if (el && content) el.content = content.innerHTML;
      if (content) content.contentEditable = "false";
    }
    ED.editingId = null;
    ED.savedRange = null;
    ED.liveSpan = null;
  }

  /* ---------- add elements ---------- */
  function edCanvasCenterX(w) {
    var cw = EDITOR.canvas.clientWidth || 800;
    return Math.max(20, Math.round((cw - w) / 2));
  }
  function edVisibleTop() {
    var wrap = EDITOR.canvas.parentNode;
    return (wrap ? wrap.scrollTop : 0) + 80;
  }
  EDITOR.addText.addEventListener("click", function () {
    var w = 300;
    var el = {
      id: edUid(), type: "text", isTitle: false,
      content: "textové pole",
      x: edCanvasCenterX(w), y: edVisibleTop(), width: w, height: "auto",
      styles: defaultStyles()
    };
    ED.elements.push(el);
    edSelect(el.id);
  });
  EDITOR.addImage.addEventListener("click", function () { EDITOR.imageFile.click(); });

  /* ---------- video / social post blocks ("Vložit video / příspěvek") ----------
     Stored as { type: "embed", content: <embed URL from VNSafe.embed>, provider }.
     In the editor the block shows a still preview (YouTube thumbnail or a
     provider card) so it selects, drags, resizes and layers like any block —
     a live <iframe> would swallow the mouse and reload on every re-render.
     Clicking an already-selected block (or double-click) plays a live
     preview until another block is selected. */
  function edBuildEmbedContent(content, el) {
    var info = VNSafe.embed(el.content);
    if (!info) { content.textContent = "Neplatný odkaz na video"; return; }
    if (ED.playingId === el.id) {
      content.appendChild(VNSafe.embedFrame(info, "Náhled — " + info.label));
      return;
    }
    var prev = document.createElement("div");
    prev.className = "ed-embed ed-embed--" + info.provider;
    if (info.thumb) {
      var img = document.createElement("img");
      img.src = info.thumb;
      img.alt = "";
      prev.appendChild(img);
    }
    var badge = document.createElement("span");
    badge.className = "ed-embed-badge";
    badge.textContent = "▶ " + info.label;
    var hint = document.createElement("span");
    hint.className = "ed-embed-hint";
    hint.textContent = ED.selectedId === el.id ? "Klikněte znovu pro přehrání náhledu" : "Video / příspěvek";
    prev.appendChild(badge);
    prev.appendChild(hint);
    content.appendChild(prev);
  }
  function edPlayEmbed(id) {
    ED.playingId = id;
    ED.selectedId = id;
    edRenderCanvas();
  }
  function edInsertEmbed(info) {
    var w = Math.min(info.w, ED_CANVAS_W), h = info.h;
    var el = {
      id: edUid(), type: "embed", isTitle: false,
      content: info.src, provider: info.provider,
      x: edCanvasCenterX(w), y: edVisibleTop(), width: w, height: h,
      styles: defaultStyles()
    };
    ED.elements.push(el);
    edSelect(el.id);
  }

  // dialog: paste a link -> live check -> insert
  var embedPending = null;
  function edEmbedCheck() {
    var v = EDITOR.embedUrl.value.trim();
    embedPending = v ? VNSafe.embed(v) : null;
    EDITOR.embedOk.disabled = !embedPending;
    var msg = "";
    if (embedPending) msg = "✓ " + embedPending.label + " — připraveno k vložení";
    else if (/^(https?:\/\/)?(vm|vt)\.tiktok\.com\//i.test(v)) msg = "Zkrácený odkaz TikToku nejde vložit — otevřete video a zkopírujte celou adresu z prohlížeče.";
    else if (v) msg = "Tento odkaz neumím vložit. Podporováno: YouTube, Vimeo, Instagram, TikTok, Spotify.";
    EDITOR.embedStatus.textContent = msg;
    EDITOR.embedStatus.classList.toggle("is-error", !!v && !embedPending);
  }
  function edOpenEmbedDialog() {
    EDITOR.embedUrl.value = "";
    edEmbedCheck();
    EDITOR.embedDialog.hidden = false;
    setTimeout(function () { EDITOR.embedUrl.focus(); }, 0);
  }
  function edCloseEmbedDialog() {
    if (EDITOR.embedDialog) EDITOR.embedDialog.hidden = true;
  }
  EDITOR.addEmbed.addEventListener("click", edOpenEmbedDialog);
  EDITOR.embedUrl.addEventListener("input", edEmbedCheck);
  EDITOR.embedForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!embedPending) return;
    var info = embedPending;
    edCloseEmbedDialog();
    edInsertEmbed(info);
    toast(info.label + " vloženo — přesuňte a zvětšete ho jako ostatní bloky.");
  });
  EDITOR.embedCancel.addEventListener("click", edCloseEmbedDialog);
  EDITOR.embedDialog.addEventListener("click", function (e) { if (e.target === EDITOR.embedDialog) edCloseEmbedDialog(); });
  EDITOR.embedDialog.addEventListener("keydown", function (e) { if (e.key === "Escape") edCloseEmbedDialog(); });
  EDITOR.imageFile.addEventListener("change", function () {
    var file = EDITOR.imageFile.files && EDITOR.imageFile.files[0];
    EDITOR.imageFile.value = "";
    if (!file) return;
    var kind = fileKind(file);
    if (!kind) { toast("Nepodporovaný formát. Povolené: JPG, PNG, WEBP, GIF, PDF."); return; }
    if (DOC.root) edInsertIntoDoc(file, kind);
    else if (DOC.key) toast("Nejdřív klikněte do textového bloku, kam má obrázek přijít.");   // homepage, no text in focus
    else edInsertIntoCanvas(file, kind);
  });

  // Article canvas: the block appears immediately with a local blob: URL,
  // then its content is swapped for the server URL (or removed on failure).
  // pos (optional): canvas coordinates of a drop point.
  function edInsertIntoCanvas(file, kind, pos) {
    var localUrl = URL.createObjectURL(file);
    var w = kind === "pdf" ? 300 : 360;
    var x = pos ? Math.min(Math.max(0, Math.round(pos.x - w / 2)), ED_CANVAS_W - w) : edCanvasCenterX(w);
    var y = pos ? Math.max(0, Math.round(pos.y - 20)) : edVisibleTop();
    var el = {
      id: edUid(), type: kind === "pdf" ? "file" : "image", isTitle: false,
      content: localUrl, name: file.name, uploading: true,
      x: x, y: y, width: w, height: kind === "pdf" ? "auto" : 220,
      styles: defaultStyles()
    };
    ED.elements.push(el);
    edSelect(el.id);
    uploadFile(file, { allowPdf: true })
      .then(function (r) {
        el.content = r.url;
        delete el.uploading;
        toast(kind === "pdf" ? "PDF přidáno." : "Obrázek přidán.");
      })
      .catch(function (err) {
        ED.elements = ED.elements.filter(function (x) { return x !== el; });
        if (ED.selectedId === el.id) ED.selectedId = null;
        toast("Nahrání selhalo: " + err.message);
      })
      .finally(function () {
        URL.revokeObjectURL(localUrl);
        edRenderCanvas();
      });
  }

  // Home/About document mode: insert at the caret inside the document
  // itself (previously it went to the hidden article canvas instead).
  function edInsertIntoDoc(file, kind) {
    var root = DOC.root;
    var localUrl = URL.createObjectURL(file);
    var node;
    if (kind === "pdf") {
      node = document.createElement("a");
      node.className = "doc-file";
      node.target = "_blank";
      node.rel = "noopener";
      node.textContent = "📄 " + file.name;
    } else {
      node = document.createElement("img");
      node.alt = "";
      node.style.maxWidth = "100%";
    }
    node.setAttribute(kind === "pdf" ? "href" : "src", localUrl);
    node.classList.add("is-uploading");

    var range = (edRestoreRange() && ED.savedRange) || null;
    if (range && root.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(node);
      range.setStartAfter(node);
      range.collapse(true);
    } else {
      var p = document.createElement("p");
      p.appendChild(node);
      root.appendChild(p);
    }
    DOC.dirty = true;
    if (DOC.key === "home") homeMarkDirty();   // programmatic insert fires no input event

    uploadFile(file, { allowPdf: true })
      .then(function (r) {
        node.setAttribute(kind === "pdf" ? "href" : "src", r.url);
        node.classList.remove("is-uploading");
        if (!node.classList.length) node.removeAttribute("class");
        DOC.dirty = true;
        if (DOC.key === "home") homeMarkDirty();
        toast(kind === "pdf" ? "PDF vloženo." : "Obrázek vložen.");
      })
      .catch(function (err) {
        if (node.parentNode) node.parentNode.removeChild(node);
        toast("Nahrání selhalo: " + err.message);
      })
      .finally(function () { URL.revokeObjectURL(localUrl); });
  }

  /* ---------- global click-away ----------
     A press anywhere outside the blocks, the two toolbars and the open
     pop-ups / dialogs ends the selection like in Word / Google Docs: the
     outline and resize handles go, edit mode ends (the text is saved into
     the layout), every floating panel closes and a focused field or text box
     is blurred so its value commits. Pressing another block is left to that
     block — it selects itself. Touch and pen act on a tap, so swiping to scroll
     keeps the selection. */
  var ED_AWAY_KEEP = ".ed-bar1, .ed-bar2, .ed-pop, .ed-color-panel, .ed-confirm, .toast, .login-screen";
  function edOnScrollbar(t, x, y) {
    if (!t || t.nodeType !== 1 || (t.scrollHeight <= t.clientHeight && t.scrollWidth <= t.clientWidth)) return false;
    var r = t.getBoundingClientRect();
    return x - r.left - t.clientLeft >= t.clientWidth || y - r.top - t.clientTop >= t.clientHeight;
  }
  function edClosePopovers() {
    edCloseColorPanel();
    Array.prototype.forEach.call(EDITOR.overlay.querySelectorAll(".ed-pop"), function (p) { p.hidden = true; });
  }
  // Is a press on `t` a press "away"? Decided at press time, while `t` is
  // still in the page (a block's own handler may re-render it before pointerup).
  function edIsAway(t, x, y) {
    if (EDITOR.overlay.hidden || !t || !t.closest) return false;
    if (t.closest(ED_AWAY_KEEP)) return false;                             // toolbars, panels, dialogs
    if (EDITOR.canvas.contains(t) && t.closest(".ed-el")) return false;    // a block handles its own press
    return !edOnScrollbar(t, x, y);                                        // scrollbar = just scrolling
  }
  function edClickAway(t) {
    // blur first: a field's change / blur handler (size box, HEX…) must still
    // commit against the live selection before the selection is dropped
    var a = document.activeElement;
    if (a && a !== document.body && EDITOR.overlay.contains(a) && !a.contains(t) && a.blur) a.blur();
    edClosePopovers();
    if (ED.selectedId || ED.editingId || ED.playingId) edDeselect();
  }
  // Mouse acts on the press; touch and pen on a tap, so a swipe that pans
  // the canvas keeps the selection.
  var edAwayTap = null;
  document.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "touch" || e.pointerType === "pen") {
      edAwayTap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.target, away: edIsAway(e.target, e.clientX, e.clientY) };
      return;
    }
    if (e.button === 0 && edIsAway(e.target, e.clientX, e.clientY)) edClickAway(e.target);
  });
  document.addEventListener("pointerup", function (e) {
    var tap = edAwayTap;
    edAwayTap = null;
    if (!tap || !tap.away || tap.id !== e.pointerId || Math.abs(e.clientX - tap.x) + Math.abs(e.clientY - tap.y) > 10) return;
    edClickAway(tap.t);
  });
  document.addEventListener("pointercancel", function () { edAwayTap = null; });

  /* ---------- rich-text helpers ---------- */
  // remember the live text selection while editing
  document.addEventListener("selectionchange", function () {
    var content;
    if (DOC.root) {
      content = DOC.root;
    } else {
      if (!ED.editingId) return;
      var node = EDITOR.canvas.querySelector('.ed-el[data-id="' + ED.editingId + '"]');
      if (!node) return;
      content = node.querySelector(".ed-el-content");
    }
    if (!content) return;
    var sel = window.getSelection();
    if (sel && sel.rangeCount && content.contains(sel.anchorNode)) {
      // While a toolbar control has focus (colour slider / picker, font menu)
      // the user cannot be selecting text: the selection only moved because
      // the styling itself rewrote the DOM (wrapping the text in a span
      // collapses it). Taking that as a new selection ended the live session
      // and every further change landed on an empty caret span instead of the
      // highlighted words — the "works only on the second try" bug.
      if (edToolbarHasFocus()) return;
      var r = sel.getRangeAt(0);
      // A genuinely new selection ends the live-styling session (see edLiveStyle).
      if (ED.liveSpan && !edRangeIsLiveSpan(r)) edCommitLive();
      ED.savedRange = r.cloneRange();
      edUpdateToolbar();
    }
  });
  function edToolbarHasFocus() {
    var a = document.activeElement;
    return !!(a && a.closest && a.closest(".ed-bar2"));
  }

  function edEditingContent() {
    if (DOC.root) return DOC.root;   // Google-Docs mode: the whole document is the editable
    if (!ED.editingId) return null;
    var node = EDITOR.canvas.querySelector('.ed-el[data-id="' + ED.editingId + '"]');
    return node ? node.querySelector(".ed-el-content") : null;
  }
  function edRestoreRange() {
    var content = edEditingContent();
    if (!content || !ED.savedRange) return false;
    content.focus();
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(ED.savedRange);
    return true;
  }
  function edCommitEditingContent() {
    if (DOC.root) { DOC.dirty = true; if (DOC.key === "home") homeMarkDirty(); return; }
    var content = edEditingContent();
    var el = edFind(ED.editingId);
    if (content && el) el.content = content.innerHTML;
  }

  // Apply an inline style to the current selection (range) or to subsequent
  // typing (collapsed cursor -> zero-width styled span).
  function edStyleSelection(styleObj) {
    var content = edEditingContent();
    if (!content) return;
    edRestoreRange();
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    if (!content.contains(range.commonAncestorContainer)) return;

    if (range.collapsed) {
      // future-typing: insert a styled zero-width span, drop the caret inside it
      var span = document.createElement("span");
      applyStyleObj(span, styleObj);
      span.appendChild(document.createTextNode(String.fromCharCode(0x200B))); // ZWSP holds the caret
      range.insertNode(span);
      var r = document.createRange();
      r.setStart(span.firstChild, 1);
      r.collapse(true);
      sel.removeAllRanges(); sel.addRange(r);
      ED.savedRange = r.cloneRange();
    } else {
      var wrap = document.createElement("span");
      applyStyleObj(wrap, styleObj);
      try {
        range.surroundContents(wrap);
      } catch (e) {
        // selection spans multiple nodes -> extract + wrap + reinsert
        var frag = range.extractContents();
        wrap.appendChild(frag);
        range.insertNode(wrap);
      }
      var r2 = document.createRange();
      r2.selectNodeContents(wrap);
      sel.removeAllRanges(); sel.addRange(r2);
      ED.savedRange = r2.cloneRange();
    }
    edCommitEditingContent();
    edUpdateToolbar();
  }
  function applyStyleObj(node, styleObj) {
    Object.keys(styleObj).forEach(function (k) { node.style[k] = styleObj[k]; });
  }

  // detect whether the current selection/anchor already has a style on
  function edSelectionAnchorEl() {
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    var n = sel.anchorNode;
    if (n && n.nodeType === 3) n = n.parentNode;
    return n;
  }
  // Read from the remembered range (ED.savedRange / live span), not the live
  // window selection: that has often moved to a toolbar control, and the
  // first B/I/U click then re-applied a style instead of removing it.
  function edRangeIsActive(kind) {
    var n = edRangeAnchorEl();
    var content = edEditingContent();
    if (!n || !content || !content.contains(n)) return false;
    var cs = window.getComputedStyle(n);
    if (kind === "bold") return (parseInt(cs.fontWeight, 10) || 400) >= 600 || cs.fontWeight === "bold";
    if (kind === "italic") return cs.fontStyle === "italic";
    if (kind === "underline") return edUnderlineHosts(n, content).length > 0;
    return false;
  }
  // Underline is not inherited (it is drawn by the ancestor that declares it),
  // so look at every element from `n` up to and including the text box.
  function edUnderlineHosts(n, content) {
    var hosts = [];
    for (; n && n.nodeType === 1; n = n.parentNode) {
      var cs = window.getComputedStyle(n);
      if ((cs.textDecorationLine || cs.textDecoration || "").indexOf("underline") > -1) hosts.push(n);
      if (n === content) break;
    }
    return hosts;
  }
  /* Remove the underline from just the selected text. A "text-decoration:
     none" span inside an underlined parent cannot do that, so the parent
     that draws the line loses it and every text outside the selection gets
     its own underline back (works for the whole-box underline too). */
  function edRemoveUnderline() {
    var content = edEditingContent();
    edRestoreRange();
    var sel = window.getSelection();
    if (!content || !sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    if (range.collapsed || !content.contains(range.commonAncestorContainer)) return;
    // cut boundary text nodes so the selection starts / ends between nodes
    var sN = range.startContainer, sO = range.startOffset, eN = range.endContainer, eO = range.endOffset;
    if (eN.nodeType === 3 && eO < eN.nodeValue.length) eN.splitText(eO);
    if (sN.nodeType === 3 && sO > 0) {
      var rest = sN.splitText(sO);
      if (eN === sN) { eN = rest; eO = eO - sO; }
      sN = rest; sO = 0;
    }
    range = document.createRange();
    if (sN.nodeType === 3) range.setStartBefore(sN); else range.setStart(sN, sO);
    if (eN.nodeType === 3) range.setEndAfter(eN); else range.setEnd(eN, eO);
    // every element drawing a line under any selected text
    var hosts = [];
    var tw = document.createTreeWalker(range.commonAncestorContainer.nodeType === 3
      ? range.commonAncestorContainer.parentNode : range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    for (var tn = tw.nextNode(); tn; tn = tw.nextNode()) {
      if (!range.intersectsNode(tn)) continue;
      edUnderlineHosts(tn.parentNode, content).forEach(function (h) { if (hosts.indexOf(h) < 0) hosts.push(h); });
    }
    hosts.forEach(function (host) {
      var outside = [];
      var w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      for (var t = w.nextNode(); t; t = w.nextNode()) {
        if (!range.intersectsNode(t) && t.nodeValue) outside.push(t);
      }
      if (host === content) {
        var el = edFind(ED.editingId || ED.selectedId);
        if (el) el.styles.underline = false;
        content.style.textDecoration = "none";
      } else if (host.tagName === "U") {
        var plain = document.createElement("span");
        while (host.firstChild) plain.appendChild(host.firstChild);
        host.parentNode.replaceChild(plain, host);
      } else {
        host.style.textDecoration = "";
        host.style.textDecorationLine = "";
        if (!host.getAttribute("style")) host.removeAttribute("style");
      }
      outside.forEach(function (t) {
        var u = document.createElement("span");
        u.style.textDecoration = "underline";
        t.parentNode.insertBefore(u, t);
        u.appendChild(t);
      });
    });
    sel.removeAllRanges(); sel.addRange(range);
    ED.savedRange = range.cloneRange();
    edCommitEditingContent();
  }

  // context: are we formatting a text range (editing) or the whole box?
  // A remembered range that is no longer inside the text box (its node was
  // replaced) must not count — every change then silently did nothing.
  function edContext() {
    if (DOC.root) return "range";   // doc mode always formats the live text range
    var content = ED.editingId && ED.editingId === ED.selectedId && ED.savedRange ? edEditingContent() : null;
    return (content && content.contains(ED.savedRange.commonAncestorContainer)) ? "range" : "box";
  }

  /* ---------- toolbar: bold / italic / underline ---------- */
  function edToggle(kind) {
    var el = edFind(ED.selectedId);
    if (!DOC.root && (!el || el.type !== "text")) return;
    if (edContext() === "range") {
      if (kind === "bold") edStyleSelection({ fontWeight: edRangeIsActive("bold") ? "normal" : "700" });
      if (kind === "italic") edStyleSelection({ fontStyle: edRangeIsActive("italic") ? "normal" : "italic" });
      if (kind === "underline") {
        if (edRangeIsActive("underline")) edRemoveUnderline();
        else edStyleSelection({ textDecoration: "underline" });
      }
    } else {
      el.styles[kind] = !el.styles[kind];
      edBoxStyle(el, kind === "bold" ? ["fontWeight"] : kind === "italic" ? ["fontStyle"] : ["textDecoration", "textDecorationLine"]);
    }
    edUpdateToolbar();
  }
  // A press anywhere on the toolbar — buttons, swatches, the gaps between
  // them, the pop-up panels — must not take focus (and with it the text
  // selection) away from the text being edited. Only real form fields (size
  // box, font menu, colour inputs, their labels) take focus; they style the
  // remembered range (ED.savedRange) instead.
  function edToolbarKeepFocus(e) {
    if (e.target.closest && e.target.closest("input, select, textarea, label, .ed-bg-panel")) return;
    e.preventDefault();
  }
  var edBar2 = document.querySelector(".ed-bar2");
  if (edBar2) edBar2.addEventListener("mousedown", edToolbarKeepFocus);
  EDITOR.bold.addEventListener("click", function () { edToggle("bold"); });
  EDITOR.italic.addEventListener("click", function () { edToggle("italic"); });
  EDITOR.underline.addEventListener("click", function () { edToggle("underline"); });

  /* ---------- paragraph helpers: align / list / indent ---------- */
  // The content node of whichever text element is active (editing OR selected).
  function edActiveContentEl() {
    if (DOC.root) return DOC.root;   // Google-Docs mode
    var id = ED.editingId || ED.selectedId;
    if (!id) return null;
    var el = edFind(id);
    if (!el || el.type !== "text") return null;
    var node = EDITOR.canvas.querySelector('.ed-el[data-id="' + id + '"] .ed-el-content');
    return node || null;
  }
  function edCommitActiveContent() {
    if (DOC.root) { DOC.dirty = true; if (DOC.key === "home") homeMarkDirty(); return; }
    var id = ED.editingId || ED.selectedId;
    var el = edFind(id);
    var content = edActiveContentEl();
    if (el && content) el.content = content.innerHTML;
  }
  // Normalize content so every top-level run of inline nodes lives in its own
  // block (div). Existing blocks are left in place; bare text/<span>/<br> beside
  // an (often empty) block would otherwise be unalignable. Returns leaf blocks.
  function edEnsureBlocks(content, keepNode) {
    var BLOCK = /^(DIV|P|LI|UL|OL|H[1-6]|BLOCKQUOTE)$/;
    var run = [];
    function flush(before) {
      if (!run.length) return;
      var hasReal = run.some(function (n) {
        return n.nodeType === 1 || (n.nodeType === 3 && n.nodeValue.trim() !== "");
      });
      if (hasReal) {
        var wrap = document.createElement("div");
        run.forEach(function (n) { wrap.appendChild(n); });
        content.insertBefore(wrap, before);
      } else {
        run.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
      }
      run = [];
    }
    Array.prototype.slice.call(content.childNodes).forEach(function (n) {
      if (n.nodeType === 1 && BLOCK.test(n.tagName)) flush(n);
      else run.push(n);
    });
    flush(null);
    if (!content.querySelector("div,p,li,h1,h2,h3,h4,h5,h6")) {
      content.appendChild(document.createElement("div"));
    }
    var leaves = Array.prototype.slice.call(content.querySelectorAll("div,p,li,h1,h2,h3,h4,h5,h6"))
      .filter(function (b) { return !b.querySelector("div,p,li,h1,h2,h3,h4,h5,h6"); });
    // Trim trailing empty blocks (blank or <br>-only) — editor cruft that would
    // otherwise render as a stray bullet/number. Always keep at least one block,
    // and never the one holding the caret (Enter at the end, then "center" or
    // "list", must act on that new empty line — not on the whole text).
    while (leaves.length > 1) {
      var last = leaves[leaves.length - 1];
      var holdsCaret = keepNode && (last === keepNode || last.contains(keepNode));
      if (!holdsCaret && !last.textContent.trim() && !last.querySelector("img")) { last.remove(); leaves.pop(); }
      else break;
    }
    return leaves;
  }
  // Blocks targeted by a paragraph op: the ones intersecting the live selection
  // when editing; otherwise the WHOLE element (applies to the selected block).
  function edSelectedBlocks() {
    var content = edActiveContentEl();
    if (!content) return [];
    var editing = !!(ED.editingId || DOC.root);
    // Remember the selection's boundary nodes BEFORE normalising: moving nodes
    // collapses live Ranges onto the container, after which every block
    // looked "selected" and the op hit the whole text.
    var r0 = (editing && ED.savedRange && content.contains(ED.savedRange.startContainer)) ? ED.savedRange : null;
    var sN = r0 && r0.startContainer, sO = r0 && r0.startOffset;
    var eN = r0 && r0.endContainer, eO = r0 && r0.endOffset;
    var blocks = edEnsureBlocks(content, sN && sN !== content ? sN : null);
    if (editing) {
      if (sN && sN !== content && eN !== content && content.contains(sN) && content.contains(eN)) {
        try {
          var rr = document.createRange();
          rr.setStart(sN, sO); rr.setEnd(eN, eO);
          ED.savedRange = rr;
        } catch (e) { /* keep whatever the live range became */ }
      }
      edRestoreRange();
      var sel = window.getSelection();
      if (sel && sel.rangeCount) {
        var range = sel.getRangeAt(0);
        if (content.contains(range.commonAncestorContainer)) {
          var hit = blocks.filter(function (b) { try { return range.intersectsNode(b); } catch (e) { return false; } });
          if (hit.length === 0) {
            var n = range.startContainer;
            while (n && n !== content && (n.nodeType !== 1 || !/^(DIV|P|LI|H[1-6])$/.test(n.tagName))) n = n.parentNode;
            if (n && n !== content) hit = [n];
          }
          if (hit.length) return hit;
        }
      }
    }
    // not editing (block merely selected) -> whole element
    return blocks;
  }

  /* ---------- alignment ---------- */
  function edAlign(value) {
    var blocks = edSelectedBlocks();
    if (!blocks.length) return;
    blocks.forEach(function (b) { b.style.textAlign = value; });
    edCommitActiveContent();
    edUpdateToolbar();
  }
  EDITOR.alignL.addEventListener("click", function () { edAlign("left"); });
  EDITOR.alignC.addEventListener("click", function () { edAlign("center"); });
  EDITOR.alignR.addEventListener("click", function () { edAlign("right"); });

  /* ---------- lists (UL / OL) ---------- */
  function edAncestorList(node, content) {
    while (node && node !== content) {
      if (node.nodeType === 1 && (node.tagName === "UL" || node.tagName === "OL")) return node;
      node = node.parentNode;
    }
    return null;
  }
  // Move every <li> after `li` into a new list of the same type (returned,
  // not yet inserted); null when `li` is the last item.
  function edSplitListAfter(li) {
    if (!li.nextSibling) return null;
    var tail = li.parentNode.cloneNode(false);
    tail.removeAttribute("start");
    while (li.nextSibling) tail.appendChild(li.nextSibling);
    return tail;
  }
  function edToggleList(tag) {
    var content = edActiveContentEl();
    if (!content) return;
    var blocks = edSelectedBlocks();   // („Téma" is an ordinary text block now)
    if (!blocks.length) return;
    var TAG = tag.toUpperCase();

    // If every block is already an <li> inside a list of the SAME type -> unwrap
    var allInTarget = blocks.every(function (b) {
      var list = edAncestorList(b, content);
      return list && list.tagName === TAG && b.tagName === "LI";
    });
    if (allInTarget) {
      // unwrap: each <li> becomes a <div> IN PLACE — the list is split around
      // it (A, B, C with B unlisted -> list[A], B, list[C]); it used to jump
      // above the whole list.
      blocks.forEach(function (li) {
        var list = li.parentNode;
        var tail = edSplitListAfter(li);
        var div = document.createElement("div");
        while (li.firstChild) div.appendChild(li.firstChild);
        if (li.style.textAlign) div.style.textAlign = li.style.textAlign;
        if (li.style.paddingLeft) div.style.paddingLeft = li.style.paddingLeft;
        list.parentNode.insertBefore(div, list.nextSibling);
        if (tail) {
          // numbered lists continue counting after the unlisted line
          if (list.tagName === "OL") {
            var startAt = (parseInt(list.getAttribute("start"), 10) || 1) +
              Array.prototype.indexOf.call(list.children, li);
            tail.setAttribute("start", startAt);
          }
          div.parentNode.insertBefore(tail, div.nextSibling);
        }
        li.remove();
        if (!list.children.length) list.remove();
      });
    } else {
      var newList = document.createElement(tag);
      // Marker colour follows the text only when ALL of it has one colour —
      // forcing the caret's colour recoloured every uncoloured word.
      var colors = {};
      blocks.forEach(function (b) {
        var w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
        for (var t = w.nextNode(); t; t = w.nextNode()) {
          if (t.nodeValue.replace(/[\s​]/g, "")) colors[window.getComputedStyle(t.parentNode).color] = 1;
        }
      });
      if (Object.keys(colors).length === 1) newList.style.color = Object.keys(colors)[0];
      // Insert where the first block is: inside a list (UL<->OL switch) the
      // source list is split there, so the converted items keep their place.
      var srcAtFirst = edAncestorList(blocks[0], content);
      if (srcAtFirst && blocks[0].parentNode === srcAtFirst) {
        var rest = edSplitListAfter(blocks[0]);
        if (rest) {
          if (srcAtFirst.tagName === "OL") {
            rest.setAttribute("start", (parseInt(srcAtFirst.getAttribute("start"), 10) || 1) +
              Array.prototype.indexOf.call(srcAtFirst.children, blocks[0]));
          }
          srcAtFirst.parentNode.insertBefore(rest, srcAtFirst.nextSibling);
        }
        srcAtFirst.parentNode.insertBefore(newList, srcAtFirst.nextSibling);
      } else {
        blocks[0].parentNode.insertBefore(newList, blocks[0]);
      }
      var srcLists = [];
      blocks.forEach(function (b) {
        var srcList = edAncestorList(b, content);
        if (srcList && srcLists.indexOf(srcList) < 0) srcLists.push(srcList);
        var li = document.createElement("li");
        while (b.firstChild) li.appendChild(b.firstChild);
        if (b.style.textAlign) li.style.textAlign = b.style.textAlign;
        if (b.style.paddingLeft) li.style.paddingLeft = b.style.paddingLeft;
        b.remove();
        newList.appendChild(li);
      });
      // Drop any source list left empty after moving its items out.
      srcLists.forEach(function (l) { if (!l.children.length) l.remove(); });
    }
    edCommitActiveContent();
    edUpdateToolbar();
  }
  EDITOR.ul.addEventListener("click", function () { edToggleList("ul"); });
  EDITOR.ol.addEventListener("click", function () { edToggleList("ol"); });

  /* ---------- indent ---------- */
  function edIndent(delta) {
    var blocks = edSelectedBlocks();
    if (!blocks.length) return;
    blocks.forEach(function (b) {
      var cur = parseInt(b.style.paddingLeft, 10) || 0;
      var next = Math.max(0, cur + delta);
      b.style.paddingLeft = next ? next + "px" : "";
    });
    edCommitActiveContent();
  }
  EDITOR.indInc.addEventListener("click", function () { edIndent(40); });
  EDITOR.indDec.addEventListener("click", function () { edIndent(-40); });

  /* ---------- copy & paste blocks (Ctrl/Cmd + C / V) ----------
     With a block selected (and not typing inside it), Ctrl+C keeps a copy of
     the whole block — text, font, size, colour, box size — in the editor's
     own clipboard; Ctrl+V adds a clone 20px lower-right (each further paste
     another 20px). Works across articles while the admin stays open. While
     typing in a text box the keys do the normal text copy/paste. */
  var ED_CLIP = null;
  document.addEventListener("keydown", function (e) {
    if (EDITOR.overlay.hidden || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (k !== "c" && k !== "v") return;
    if (ED.editingId) return;                                  // native text copy/paste
    var a = document.activeElement;
    if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;  // typing in a field
    if (a && a.isContentEditable) return;
    if (k === "c") {
      var el = edFind(ED.selectedId);
      if (!el) return;
      e.preventDefault();
      edExitEdit();
      ED_CLIP = { data: JSON.parse(JSON.stringify(el)), pastes: 0 };
      toast("Blok zkopírován — Ctrl+V vloží kopii.");
      return;
    }
    if (!ED_CLIP || ED_CLIP.data.uploading) return;
    e.preventDefault();
    ED_CLIP.pastes++;
    var copy = JSON.parse(JSON.stringify(ED_CLIP.data)), off = 20 * ED_CLIP.pastes;
    copy.id = edUid();
    copy.isTitle = false;                                      // only one title per article
    var w = +copy.width || 0;
    copy.x = Math.min(Math.max(0, (+copy.x || 0) + off), Math.max(0, ED_CANVAS_W - w));
    copy.y = Math.max(0, (+copy.y || 0) + off);
    copy.z = ED.elements.reduce(function (m, x) { return Math.max(m, x.z || 0); }, 0) + 1;   // on top
    if (copy.type === "text") copy.content = VNSafe.html(copy.content);
    ED.elements.push(copy);
    edSelect(copy.id);
    toast("Kopie bloku vložena.");
  });

  /* ---------- keyboard shortcuts (Ctrl+Shift+L / E / R) ---------- */
  document.addEventListener("keydown", function (e) {
    if (!e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return;
    // Only while the caret is in the text being edited — elsewhere the keys
    // keep their browser meaning (Ctrl+Shift+R = hard reload).
    var content = edEditingContent();
    if (!content || !(content === document.activeElement || content.contains(document.activeElement))) return;
    var k = e.key.toLowerCase();
    if (k === "l") { e.preventDefault(); edAlign("left"); }
    else if (k === "e") { e.preventDefault(); edAlign("center"); }
    else if (k === "r") { e.preventDefault(); edAlign("right"); }
  });

  /* ---------- live styling (Google-Docs style, no Enter needed) ----------
     The size box and the colour controls restyle text on every `input`
     event. In "range" context the FIRST live change wraps the saved
     selection in one <span> (ED.liveSpan); every later event only updates
     that span's style. So: no span nesting per keystroke/slider tick, and
     focus stays in the control (we never move the caret while the user is
     typing in an input). The session ends — the change is already in the
     DOM, edCommitLive() just persists it — on blur, Enter, colour-panel
     close, a new text selection, or leaving edit mode. */
  function edLiveStyle(styleObj) {
    var content = edEditingContent();
    if (!content) return;
    var span = ED.liveSpan;
    if (!span || !span.isConnected || !content.contains(span)) {
      var range = ED.savedRange;
      if (!range || !content.contains(range.commonAncestorContainer)) return;
      range = range.cloneRange();
      span = document.createElement("span");
      if (range.collapsed) {
        // caret only -> style what gets typed next (ZWSP keeps the caret inside)
        span.appendChild(document.createTextNode("​"));
        range.insertNode(span);
        range.setStart(span.firstChild, 1);
        range.collapse(true);
      } else {
        try { range.surroundContents(span); }
        catch (e) {                        // selection crosses element boundaries
          span.appendChild(range.extractContents());
          range.insertNode(span);
        }
        range.selectNodeContents(span);
      }
      ED.savedRange = range.cloneRange();
      ED.liveSpan = span;
      // Toolbar-button path (focus still in the text): keep the visible
      // selection on the span. Input path: leave focus where the user types.
      if (content.contains(document.activeElement) || content === document.activeElement) {
        var sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(range);
      }
    }
    applyStyleObj(span, styleObj);
    // Older inline styles of the same property inside the span would win
    // over the new value — clear them.
    Array.prototype.forEach.call(span.querySelectorAll("[style]"), function (n) {
      Object.keys(styleObj).forEach(function (k) { n.style[k] = ""; });
      if (!n.getAttribute("style")) n.removeAttribute("style");
    });
    edCommitEditingContent();
  }
  // Is `r` still "the live span" (vs. a new selection the user made)?
  function edRangeIsLiveSpan(r) {
    var s = ED.liveSpan;
    if (!s || !s.isConnected) return false;
    if (r.collapsed) return s.textContent === "​" && s.contains(r.startContainer);
    return (s === r.commonAncestorContainer || s.contains(r.commonAncestorContainer) ||
            r.commonAncestorContainer.contains(s)) && r.toString() === s.textContent;
  }
  // End the live session and persist the result (canvas element or doc).
  function edCommitLive() {
    if (!ED.liveSpan) return;
    ED.liveSpan = null;
    edCommitEditingContent();
  }
  // Element the toolbar should read styles from in range context.
  function edRangeAnchorEl() {
    if (ED.liveSpan && ED.liveSpan.isConnected) return ED.liveSpan;
    var r = ED.savedRange;
    var n = (r && !r.collapsed && edRangeFirstText(r)) || (r ? r.startContainer : edSelectionAnchorEl());
    if (n && n.nodeType === 3) n = n.parentNode;
    return n;
  }
  // First text node with a selected character — a drag often starts at the
  // very end of the previous run (or on an element boundary), whose size /
  // font / colour is not what the user selected.
  function edRangeFirstText(r) {
    var s = r.startContainer;
    if (s.nodeType === 3 && r.startOffset < s.nodeValue.length) return s;
    var root = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (var t = w.nextNode(); t; t = w.nextNode()) {
      if (t === s || !t.nodeValue || !r.intersectsNode(t)) continue;
      if (r.comparePoint(t, 0) >= 0) return t;      // starts inside the range
    }
    return null;
  }

  /* ---------- toolbar: font size ---------- */
  var FS_MIN = 6, FS_MAX = 300;
  function edCurrentFontSize() {
    if (edContext() === "range") {
      var n = edRangeAnchorEl();
      if (n && n.nodeType === 1) return Math.round(parseFloat(window.getComputedStyle(n).fontSize)) || 16;
    }
    var el = edFind(ED.selectedId);
    if (el) return parseInt(el.styles.fontSize, 10) || 16;
    return 16;
  }
  // Apply a size to the active text (box or live range). No clamping here.
  function edApplyFontSize(px) {
    var el = edFind(ED.selectedId);
    if (!DOC.root && (!el || el.type !== "text")) return;
    ED.lastFs = px;
    if (edContext() === "range") {
      edLiveStyle({ fontSize: px + "px" });
    } else {
      el.styles.fontSize = px + "px";
      edBoxStyle(el, ["fontSize"]);
    }
  }
  // Clamp + show + apply (buttons, committed values).
  function edSetFontSize(px) {
    px = Math.max(FS_MIN, Math.min(FS_MAX, px));
    EDITOR.fsVal.value = px;
    edApplyFontSize(px);
  }
  EDITOR.fsDec.addEventListener("click", function () { edSetFontSize(edCurrentFontSize() - 1); });
  EDITOR.fsInc.addEventListener("click", function () { edSetFontSize(edCurrentFontSize() + 1); });
  EDITOR.fsVal.addEventListener("focus", function () {
    ED.lastFs = parseInt(EDITOR.fsVal.value, 10) || ED.lastFs;
    EDITOR.fsVal.select();
  });
  // input: every keystroke / spinner step / arrow key -> canvas updates now.
  // Partial values ("1" on the way to "18") are below the minimum and skipped.
  EDITOR.fsVal.addEventListener("input", function () {
    var v = parseInt(EDITOR.fsVal.value, 10);
    if (v >= FS_MIN && v <= FS_MAX) edApplyFontSize(v);
  });
  // change (fires on blur too): clamp out-of-range values and apply them.
  EDITOR.fsVal.addEventListener("change", function () {
    var v = parseInt(EDITOR.fsVal.value, 10);
    if (v) edSetFontSize(v);
  });
  // blur = clicked anywhere else: keep (commit) the value; an emptied box
  // reverts to the last applied size instead of discarding the state.
  EDITOR.fsVal.addEventListener("blur", function () {
    if (!parseInt(EDITOR.fsVal.value, 10)) EDITOR.fsVal.value = ED.lastFs;
    edCommitLive();
  });
  // Enter is optional now: it just commits and hands the caret back to the text.
  EDITOR.fsVal.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    var v = parseInt(EDITOR.fsVal.value, 10);
    if (v) edSetFontSize(v);
    edCommitLive();
    edRestoreRange();
  });

  /* ---------- toolbar: color picker (bi-directional sync) ---------- */
  function clamp255(n) { n = parseInt(n, 10); if (isNaN(n)) n = 0; return Math.max(0, Math.min(255, n)); }
  function rgbToHex(r, g, b) {
    return "#" + [r, g, b].map(function (x) { return ("0" + clamp255(x).toString(16)).slice(-2); }).join("");
  }
  function hexToRgb(hex) {
    hex = String(hex || "").replace("#", "");
    if (hex.length === 3) hex = hex.split("").map(function (c) { return c + c; }).join("");
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
  }
  // single source of truth: set all controls to one rgb (no text apply)
  // src: the control the user is typing in / dragging. It is left as typed
  // (rewriting "#1a2" to "#11AA22" ate keystrokes). Every other control,
  // focused or not, is updated, so a swatch click never leaves one stale.
  function edSyncColor(r, g, b, src) {
    r = clamp255(r); g = clamp255(g); b = clamp255(b);
    var hex = rgbToHex(r, g, b);
    ED.colorSyncing = true;
    function put(input, v) { if (input !== src) input.value = v; }
    put(EDITOR.rRange, r); put(EDITOR.rNum, r);
    put(EDITOR.gRange, g); put(EDITOR.gNum, g);
    put(EDITOR.bRange, b); put(EDITOR.bNum, b);
    put(EDITOR.hex, hex.toUpperCase());
    if (src !== EDITOR.hex) ED.hexTyped = false;   // HEX shows the live colour again
    put(EDITOR.colorNative, hex);
    EDITOR.preview.style.background = hex;
    EDITOR.colorBtn.style.color = hex;
    ED.currentColor = hex;
    ED.colorSyncing = false;
  }
  // Apply ED.currentColor to the active text right away (box or live range).
  // Also works in the Home/About document mode (no selected canvas element).
  function edApplyColorLive() {
    var el = edFind(ED.selectedId);
    if (!DOC.root && (!el || el.type !== "text")) return;
    edRecallSelection();      // the selection remembered when the colour button was pressed
    if (edContext() === "range") {
      edLiveStyle({ color: ED.currentColor });
    } else {
      el.styles.color = ED.currentColor;
      edBoxStyle(el, ["color"]);
    }
  }
  function edOpenColorPanel() {
    // initialise from the current text/box color
    var rgb = hexToRgb(ED.currentColor) || { r: 0, g: 0, b: 0 };
    var el = edFind(ED.selectedId);
    var c = null;
    if (edContext() === "range") {
      var n = edRangeAnchorEl();
      if (n && n.nodeType === 1) c = rgbStringToHex(window.getComputedStyle(n).color);
    } else if (el) {
      c = el.styles.color;
    }
    var parsed = hexToRgb(c); if (parsed) rgb = parsed;
    edSyncColor(rgb.r, rgb.g, rgb.b);
    EDITOR.colorPanel.hidden = false;
  }
  // Closing the panel (button, click-away, tools hidden) commits the colour.
  function edCloseColorPanel() {
    if (!EDITOR.colorPanel || EDITOR.colorPanel.hidden) return;
    EDITOR.colorPanel.hidden = true;
    edCommitLive();
    edUpdateToolbar();
  }
  function rgbStringToHex(rgbStr) {
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgbStr || "");
    if (!m) return ED.currentColor;
    return rgbToHex(+m[1], +m[2], +m[3]);
  }
  /* The text selection must survive the trip to the colour panel: it is
     remembered when the colour button is pressed (before anything can steal
     focus) and every colour is applied to exactly that range; afterwards the
     caret/selection goes back into the text. */
  function edRememberSelection() {
    var content = edEditingContent();
    ED.colorRange = (content && ED.savedRange && content.contains(ED.savedRange.commonAncestorContainer))
      ? ED.savedRange.cloneRange() : null;
  }
  function edRecallSelection() {
    var content = edEditingContent();
    if (!content || !ED.colorRange || !content.contains(ED.colorRange.commonAncestorContainer)) return;
    if (!ED.savedRange || !content.contains(ED.savedRange.commonAncestorContainer)) ED.savedRange = ED.colorRange.cloneRange();
  }
  EDITOR.colorBtn.addEventListener("pointerdown", edRememberSelection);
  EDITOR.colorBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (EDITOR.colorPanel.hidden) edOpenColorPanel();
    else { edCloseColorPanel(); edRestoreRange(); }      // back to the text
  });
  // Quick swatches: mousedown is cancelled, so focus and the selection stay
  // in the text; the colour lands on the selection immediately.
  var swatches = document.querySelector("#ed-swatches");
  if (swatches) {
    swatches.addEventListener("mousedown", function (e) { e.preventDefault(); });
    swatches.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-color]");
      var rgb = b && hexToRgb(b.dataset.color);
      if (!rgb) return;
      edRecallSelection();
      edColorInput(rgb.r, rgb.g, rgb.b);
      if (ED.liveSpan || DOC.root) edRestoreRange();
    });
  }

  /* ---------- toolbar: font family ---------- */
  var fontSel = document.querySelector("#ed-font");
  // Which menu entry matches a computed font-family ("Inter", system-ui… -> Inter)
  function edFontOption(family) {
    var first = String(family || "").split(",")[0].replace(/["']/g, "").trim().toLowerCase();
    var hit = Array.prototype.filter.call(fontSel.options, function (o) {
      return o.value && o.value.split(",")[0].replace(/["']/g, "").trim().toLowerCase() === first;
    })[0];
    return hit ? hit.value : "";
  }
  // How many different fonts the remembered (non-empty) selection is set in.
  function edRangeFontCount() {
    var r = ED.savedRange, content = edEditingContent();
    if (!r || r.collapsed || !content || !content.contains(r.commonAncestorContainer)) return 0;
    var root = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), seen = {}, n = 0;
    for (var t = w.nextNode(); t; t = w.nextNode()) {
      if (!t.nodeValue.replace(/[\s​]/g, "") || !r.intersectsNode(t)) continue;
      var f = edFontOption(window.getComputedStyle(t.parentNode).fontFamily) || "?";
      if (!seen[f]) { seen[f] = 1; n++; }
      if (n > 1) break;
    }
    return n;
  }
  if (fontSel) {
    fontSel.addEventListener("pointerdown", edRememberSelection);
    fontSel.addEventListener("change", function () {
      var font = fontSel.value;
      var el = edFind(ED.selectedId);
      if (!DOC.root && (!el || el.type !== "text")) return;
      edRecallSelection();
      if (edContext() === "range") {
        // "Výchozí písmo" inside text that has a font must be a real value —
        // an empty one just inherits the surrounding font and changes nothing
        var c = edEditingContent();
        var base = (el && el.styles.fontFamily) || (c && c.parentNode ? window.getComputedStyle(c.parentNode).fontFamily : "");
        edLiveStyle({ fontFamily: font || base });    // the selected words (or what's typed next)
        edCommitLive();
        edRestoreRange();                             // straight back to typing
      } else {
        el.styles.fontFamily = font;                  // the whole text box
        edBoxStyle(el, ["fontFamily"]);
      }
    });
  }
  // close panel when clicking elsewhere
  document.addEventListener("pointerdown", function (e) {
    if (EDITOR.overlay.hidden || EDITOR.colorPanel.hidden) return;
    if (!EDITOR.colorPanel.contains(e.target) && e.target !== EDITOR.colorBtn) edCloseColorPanel();
  });
  // Control listeners: every `input` (slider drag, number typing, native
  // picker browsing, valid HEX) syncs all controls AND recolours the text
  // immediately. No `change`/Enter step is needed to see or keep it.
  function edColorInput(r, g, b, src) {
    if (ED.colorSyncing) return;
    edSyncColor(r, g, b, src);
    edApplyColorLive();
  }
  ["rRange", "gRange", "bRange"].forEach(function (k) {
    EDITOR[k].addEventListener("input", function () {
      edColorInput(EDITOR.rRange.value, EDITOR.gRange.value, EDITOR.bRange.value, EDITOR[k]);
    });
  });
  ["rNum", "gNum", "bNum"].forEach(function (k) {
    EDITOR[k].addEventListener("input", function () {
      if (EDITOR[k].value === "") return;          // mid-edit, wait for a digit
      edColorInput(EDITOR.rNum.value, EDITOR.gNum.value, EDITOR.bNum.value, EDITOR[k]);
    });
    // blur: normalise an emptied/out-of-range number back to the live colour
    EDITOR[k].addEventListener("blur", function () {
      var rgb = hexToRgb(ED.currentColor); if (rgb) edSyncColor(rgb.r, rgb.g, rgb.b);
    });
  });
  EDITOR.colorNative.addEventListener("input", function () {
    var rgb = hexToRgb(EDITOR.colorNative.value); if (rgb) edColorInput(rgb.r, rgb.g, rgb.b, EDITOR.colorNative);
  });
  // A complete #RRGGBB applies while typing; the #RGB shorthand only on Enter
  // or leaving the field — applying "#1a2" on the way to "#1a2b3c" used to
  // rewrite the field to #11AA22 and maxlength swallowed the other digits.
  EDITOR.hex.addEventListener("input", function () {
    ED.hexTyped = true;
    var v = EDITOR.hex.value.trim();
    var rgb = /^#?[0-9a-f]{6}$/i.test(v) && hexToRgb(v);
    if (rgb) edColorInput(rgb.r, rgb.g, rgb.b, EDITOR.hex);
  });
  // only what the user typed is committed: a stale value left in the field
  // (e.g. after a swatch click) must not undo the colour on blur
  function edHexCommit() {
    if (!ED.hexTyped) return;
    var rgb = hexToRgb(EDITOR.hex.value.trim());
    if (rgb && rgbToHex(rgb.r, rgb.g, rgb.b) !== ED.currentColor) edColorInput(rgb.r, rgb.g, rgb.b, EDITOR.hex);
  }
  EDITOR.hex.addEventListener("change", edHexCommit);
  // blur: an incomplete HEX snaps back to the last valid (already applied) colour.
  EDITOR.hex.addEventListener("blur", function () {
    edHexCommit();
    var rgb = hexToRgb(ED.currentColor);
    if (rgb) edSyncColor(rgb.r, rgb.g, rgb.b);
  });
  EDITOR.hex.addEventListener("focus", function () { EDITOR.hex.select(); });
  // Enter inside the panel: commit + close + caret back to the text.
  EDITOR.colorPanel.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (e.target === EDITOR.hex) edHexCommit();
    edCloseColorPanel();
    edRestoreRange();
  });

  /* ---------- toolbar visibility + active state ---------- */
  function edSetToolsVisible(on) {
    EDITOR.tools.classList.toggle("is-visible", !!on);
    EDITOR.tools.setAttribute("aria-hidden", on ? "false" : "true");
    if (!on) edCloseColorPanel();
  }
  // "Zarovnat vrstvy" is shown whenever ANY block is selected (not only text).
  function edSetLayerVisible(on) {
    var wrap = document.querySelector("#ed-layer-wrap");
    if (wrap) wrap.hidden = !on;
    var menu = document.querySelector("#ed-layer-menu");
    if (menu && !on) menu.hidden = true;
  }
  function edUpdateToolbar() {
    var el = edFind(ED.selectedId);
    if (!DOC.root && (!el || el.type !== "text")) return;
    EDITOR.fsVal.value = edCurrentFontSize();
    if (fontSel && document.activeElement !== fontSel) {   // font menu shows the font at the caret / of the box
      var fNode = edContext() === "range" ? edRangeAnchorEl() : null;
      fontSel.value = edFontOption(fNode && fNode.nodeType === 1 ? window.getComputedStyle(fNode).fontFamily : (el && el.styles.fontFamily) || "");
      // selection in several fonts -> no entry is current, so picking the
      // font shown for the first word still fires `change` and applies
      if (fNode && edRangeFontCount() > 1) fontSel.selectedIndex = -1;
    }
    var ctx = edContext();
    var bActive, iActive, uActive, color;
    if (ctx === "range") {
      bActive = edRangeIsActive("bold");
      iActive = edRangeIsActive("italic");
      uActive = edRangeIsActive("underline");
      var n = edRangeAnchorEl();
      color = (n && n.nodeType === 1) ? rgbStringToHex(window.getComputedStyle(n).color)
                : (el ? el.styles.color : ED.currentColor);
    } else {
      bActive = !!el.styles.bold;
      iActive = !!el.styles.italic;
      uActive = !!el.styles.underline;
      color = el.styles.color;
    }
    EDITOR.bold.classList.toggle("is-active", bActive);
    EDITOR.italic.classList.toggle("is-active", iActive);
    EDITOR.underline.classList.toggle("is-active", uActive);
    ED.currentColor = color || "#000000";
    EDITOR.colorBtn.style.color = ED.currentColor;

    // alignment + list active state (anchor block when editing, else first block)
    var alignVal = "", inUL = false, inOL = false;
    var content = edActiveContentEl();
    var node = (ED.editingId || DOC.root)
      ? edSelectionAnchorEl()
      : (content ? content.querySelector("div,p,li,h1,h2,h3,h4,h5,h6") : null);
    while (node && content && content.contains(node)) {
      if (node.nodeType === 1) {
        if (!alignVal) { var ta = (node.style && node.style.textAlign) || ""; if (ta) alignVal = ta; }
        if (node.tagName === "UL") inUL = true;
        if (node.tagName === "OL") inOL = true;
      }
      node = node.parentNode;
    }
    if (!alignVal) alignVal = "left";
    if (EDITOR.alignL) EDITOR.alignL.classList.toggle("btn-active", alignVal === "left");
    if (EDITOR.alignC) EDITOR.alignC.classList.toggle("btn-active", alignVal === "center");
    if (EDITOR.alignR) EDITOR.alignR.classList.toggle("btn-active", alignVal === "right");
    if (EDITOR.ul)     EDITOR.ul.classList.toggle("btn-active", inUL);
    if (EDITOR.ol)     EDITOR.ol.classList.toggle("btn-active", inOL);
  }

  /* ---------- Bar 1: confirm-gated actions ---------- */
  function edOpenConfirm(action, title, text) {
    ED.pendingAction = action;
    EDITOR.confirmTitle.textContent = title;
    EDITOR.confirmText.textContent = text;
    EDITOR.confirm.hidden = false;
  }
  EDITOR.backNoChange.addEventListener("click", function () {
    edOpenConfirm("discard", "Zpět", "Změny provedené v editoru nebudou uloženy. Pokračovat?");
  });
  EDITOR.deleteBtn.addEventListener("click", function () {
    edOpenConfirm("delete", "Smazat příspěvek", "Tento příspěvek bude trvale smazán. Pokračovat?");
  });
  EDITOR.confirmCancel.addEventListener("click", function () {
    EDITOR.confirm.hidden = true;
    ED.pendingAction = null;
  });
  EDITOR.confirmOk.addEventListener("click", function () {
    var action = ED.pendingAction;
    EDITOR.confirm.hidden = true;
    ED.pendingAction = null;
    if (action === "discard") {
      edClose();
      toast("Editor zavřen bez uložení.");
    } else if (action === "delete") {
      var id = fId.value;
      if (id) {
        api("/api/articles?id=" + encodeURIComponent(id), { method: "DELETE" })
          .then(function () { edClose(); resetForm(); refreshTable(); toast("Příspěvek smazán."); })
          .catch(function (err) {
            if (err.status === 401) { showLogin(); return; }
            toast("Chyba: " + (err.detail || err.message));
          });
      } else {
        edClose(); resetForm(); toast("Rozpracovaný příspěvek zahozen.");
      }
    }
  });

  // launch the editor from the (hidden) article form
  var openEditorBtn = document.querySelector("#open-editor-btn");
  if (openEditorBtn) openEditorBtn.addEventListener("click", edOpen);

  // Bar 1 "Vydat" / "Naplánovat" -> commit layout + metadata and save via the API.
  /* Leaving the page (refresh, „Zobrazit web", closing the tab) with unsaved
     work asks first: editor changes, unsaved Home/About edits, uploads. */
  window.addEventListener("beforeunload", function (e) {
    var unsaved = pendingUploads > 0 || DOC.dirty || contentDirty || HOME.dirty ||
      (!EDITOR.overlay.hidden && edStateSnapshot() !== ED.snapshot);
    if (!unsaved) return;
    e.preventDefault();
    e.returnValue = "";
  });

  /* A file dropped anywhere used to make the browser open it — navigating
     away and losing all unsaved work. File drops are swallowed everywhere;
     on the article canvas or a Home/About document they insert the file. */
  function dragHasFiles(e) {
    var types = e.dataTransfer && e.dataTransfer.types;
    return !!types && Array.prototype.indexOf.call(types, "Files") > -1;
  }
  document.addEventListener("dragover", function (e) { if (dragHasFiles(e)) e.preventDefault(); });
  document.addEventListener("drop", function (e) {
    if (!dragHasFiles(e) || e.defaultPrevented) return;   // e.g. the thumbnail zone handled it
    e.preventDefault();
    var file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    var onCanvas = !EDITOR.overlay.hidden && EDITOR.canvas.contains(e.target);
    var onDoc = DOC.root && DOC.root.contains(e.target);
    if (!onDoc && DOC.key === "home") {           // homepage: any text block accepts the drop
      var hb = e.target.closest && e.target.closest(".hl-text-body");
      if (hb) { DOC.root = hb; onDoc = true; }
    }
    if (!onCanvas && !onDoc) return;
    var kind = fileKind(file);
    if (!kind) { toast("Nepodporovaný formát. Povolené: JPG, PNG, WEBP, GIF, PDF."); return; }
    if (onCanvas) {
      var r = EDITOR.canvas.getBoundingClientRect();
      edInsertIntoCanvas(file, kind, { x: e.clientX - r.left, y: e.clientY - r.top });
    } else {
      // put the caret where the file was dropped
      var caret = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
      if (caret && DOC.root.contains(caret.startContainer)) ED.savedRange = caret;
      edInsertIntoDoc(file, kind);
    }
  });

  // saveArticle() decides live vs. scheduled from the chosen date/time. The
  // editor closes only AFTER a successful save — on any failure (API error,
  // expired login, missing title) it stays open with the work intact.
  EDITOR.publish.addEventListener("click", function () {
    if (uploadsBusy() || EDITOR.publish.disabled) return;
    edCommitLive();
    edExitEdit();
    edCommitToForm();
    var label = EDITOR.publish.textContent;
    EDITOR.publish.disabled = true;
    EDITOR.publish.textContent = "Ukládám…";
    saveArticle().then(function (ok) {
      EDITOR.publish.disabled = false;
      EDITOR.publish.textContent = label;
      if (ok) edClose();
      else edRenderCanvas();     // edit mode was exited above — redraw the canvas
    });
  });

  /* ============================================================
     GOOGLE-DOCS DOCUMENT EDITORS (homepage + „O nás")
     The shared formatting toolbar (.ed-bar2) is MOVED into the
     section's dock slot rather than duplicated, so every handler
     that is already wired keeps working with no drift.
     ============================================================ */
  var fBackground = document.querySelector("#f-background");
  function edParseJson(str, fallback) {
    if (!str) return fallback;
    try { var v = JSON.parse(str); return v || fallback; } catch (e) { return fallback; }
  }

  var DOC_TARGETS = {
    // home: a block layout — DOC.root follows the text block being edited
    home:  { root: document.querySelector("#home-canvas-editor"), slot: document.querySelector("#home-toolbar-slot"),
             frame: document.querySelector("#home-frame"), layout: true },
    about: { root: document.querySelector("#about-doc"), slot: document.querySelector("#about-toolbar-slot") }
  };
  var bar2El     = document.querySelector(".ed-bar2");
  var bar2Parent = bar2El ? bar2El.parentNode : null;
  var bar2Anchor = bar2El ? bar2El.nextSibling : null;

  function docDock(slot) {
    if (!bar2El || !slot) return;
    bar2El.classList.add("is-docked");
    slot.appendChild(bar2El);
    if (typeof edSetToolsVisible === "function") edSetToolsVisible(true);
  }
  function docUndock() {
    if (!bar2El || !bar2Parent || bar2El.parentNode === bar2Parent) return;
    bar2El.classList.remove("is-docked");
    bar2Parent.insertBefore(bar2El, bar2Anchor);
  }

  function docLoad(key) {
    var root = DOC_TARGETS[key] && DOC_TARGETS[key].root;
    if (!root || !CONTENT) return;
    var html = (CONTENT[key] && CONTENT[key].doc) || "";
    // „O nás" saved before the document editor existed has only plain text:
    // turn it into paragraphs instead of opening (and later saving) it empty.
    if (!html && key === "about" && CONTENT.about && CONTENT.about.text) {
      html = CONTENT.about.text.split(/\n\s*\n/)
        .map(function (p) { return p.trim(); }).filter(Boolean)
        .map(function (p) { return "<div>" + escapeHtml(p).replace(/\n/g, "<br>") + "</div>"; })
        .join("");
    }
    root.innerHTML = VNSafe.html(html);
    if (!root.querySelector("div,p,h1,h2,h3,h4,h5,h6,ul,ol")) {
      var d = document.createElement("div");
      d.innerHTML = "<br>";
      root.appendChild(d);
    }
  }
  function docPlainText(root) {
    return Array.prototype.slice.call(root.children)
      .map(function (b) { return (b.textContent || "").trim(); })
      .filter(Boolean).join("\n\n");
  }
  // Serialized copy without images/PDFs still uploading (their blob: URL is
  // only valid in this tab); the finished upload lands on the next flush.
  function docCleanCopy(node) {
    var copy = node.cloneNode(true);
    Array.prototype.forEach.call(copy.querySelectorAll(".is-uploading"), function (n) { n.remove(); });
    return copy;
  }
  // Write the live document back into CONTENT (no network call).
  function docFlush() {
    if (!DOC.key || !CONTENT) return;
    var key = DOC.key;
    if (!CONTENT[key]) CONTENT[key] = {};
    if (key === "home") {
      // the homepage stays a draft (HOME) — CONTENT, which every save sends,
      // changes only on „Uložit stránku" (homeSave)
      homeSyncText();
      if (DOC.dirty) homeMarkDirty();
      DOC.dirty = false;
      return;
    } else {
      if (!DOC.root) return;
      var copy = docCleanCopy(DOC.root);
      var hasContent = (copy.textContent || "").replace(/[\s​]/g, "") !== "" || !!copy.querySelector("img,a");
      CONTENT[key].doc = hasContent ? copy.innerHTML : "";
      if (key === "about") {
        // keep the plain-text mirror the public page's existing renderer reads
        CONTENT.about.text = docPlainText(copy);
        if (aboutInput) aboutInput.value = CONTENT.about.text;
      }
    }
    if (DOC.dirty) contentDirty = true;   // in CONTENT now, not yet on the server
    DOC.dirty = false;
  }

  function docMountFor(tab) {
    var target = DOC_TARGETS[tab];
    if (!target || !target.root || !CONTENT) { docUnmount(); return; }
    // Same document already mounted (e.g. its tab clicked again): keep the
    // live, possibly unsaved edits — reloading from CONTENT discarded them.
    if (DOC.key === tab) { docDock(target.slot); return; }
    if (DOC.key) docUnmount();
    DOC.key = tab;
    DOC.dirty = false;
    if (target.layout) {
      DOC.root = null;                 // set when a text block gets focus
      homeLoad();
    } else {
      DOC.root = target.root;
      docLoad(tab);
    }
    docDock(target.slot);
    edApplyBackground(target.frame || target.root,
      target.layout ? (HOME.bg || {}) : (CONTENT[tab] && CONTENT[tab].background) || {});
  }
  function docUnmount() {
    if (DOC.key) docFlush();
    DOC.root = null;
    DOC.key = null;
    docUndock();
  }
  Object.keys(DOC_TARGETS).forEach(function (key) {
    var root = DOC_TARGETS[key].root;
    if (root) root.addEventListener("input", function () {
      if (key === "home") homeMarkDirty(); else DOC.dirty = true;
    });
  });

  /* ---------- save ---------- */
  function docSave(key, btn, okMsg) {
    if (!CONTENT || uploadsBusy()) return;
    docFlush();
    if (btn) btn.disabled = true;
    saveContent()
      .then(function () { toast(okMsg); })
      .catch(function (err) {
        if (err.status === 401) { showLogin(); return; }
        toast("Chyba: " + (err.detail || err.message));
      })
      .finally(function () { if (btn) btn.disabled = false; });
  }
  var saveHomeBtn = document.querySelector("#save-home-btn");
  if (saveHomeBtn) saveHomeBtn.addEventListener("click", homeSave);

  /* ============================================================
     HOMEPAGE LAYOUT EDITOR (Google-Sites-like box grid)
     The canvas is drawn by VNHome.render() — the same renderer and CSS the
     public page uses — so what the admin sees is 1:1 what readers get.
     Every block sits on an invisible grid 4 boxes wide (block.col = first
     box). Blocks are dragged by grabbing them anywhere and snap to the
     nearest free boxes. All changes live in a DRAFT (HOME.layout/HOME.bg)
     and reach readers only on „Uložit stránku" (homeSave); other saves
     (team, contacts, „O nás") never publish the draft. Text blocks are
     contenteditable and use the docked toolbar: DOC.root = the text block
     being edited.
     ============================================================ */
  var HOME = {
    layout: null,            // the draft layout (null until loaded)
    bg: null,                // the draft page background
    dirty: false,            // draft differs from what readers see
    host: DOC_TARGETS.home.root,
    frameHost: document.querySelector("#home-frame-host"),
    unsavedEl: document.querySelector("#hl-unsaved"),
    selectedId: null,
    pickerFor: null,         // post block id the article picker is open for
    press: null,             // pointer pressed on a block, drag not started yet
    drag: null
  };
  var HL_GAP = 24;
  var hlPicker = {
    box: document.querySelector("#hl-picker"),
    search: document.querySelector("#hl-picker-search"),
    list: document.querySelector("#hl-picker-list"),
    clear: document.querySelector("#hl-picker-clear"),
    cancel: document.querySelector("#hl-picker-cancel")
  };
  var HL_SIZE_LABEL = { 1: "¼", 2: "½", 3: "¾", 4: "1" };
  var HL_POST_BY_WIDTH = { 1: "A", 2: "B", 3: "C", 4: "D" };

  function homeLiveArticles() {
    return ADMIN_ARTICLES.filter(function (a) { return !isScheduled(a); });
  }
  // Load the draft: an unsaved draft from earlier in this session wins (tab
  // switches keep it); otherwise the saved layout, or the default the public
  // page shows until a layout is saved (that one needs the article list).
  function homeLoad() {
    if (!CONTENT) return;
    if (!HOME.bg) HOME.bg = JSON.parse(JSON.stringify((CONTENT.home && CONTENT.home.background) || { color: "", image: "" }));
    var saved = VNHome.normalize(CONTENT.home && CONTENT.home.layout);
    // an unedited default is rebuilt each time, so it follows the newest
    // articles exactly like the public page does
    if (!HOME.layout || (!saved && !HOME.dirty)) {
      if (saved) HOME.layout = saved;
      else if (articlesLoaded) HOME.layout = VNHome.defaultLayout(CONTENT, homeLiveArticles());
      else { HOME.host.innerHTML = '<p class="empty-state">Načítám příspěvky…</p>'; return; }
    }
    homeRender();
    homeUpdateUnsaved();
  }
  function homeMarkDirty() {
    HOME.dirty = true;
    HOME.rev = (HOME.rev || 0) + 1;   // lets a running save tell whether the draft moved on
    homeUpdateUnsaved();
  }
  function homeUpdateUnsaved() {
    if (HOME.unsavedEl) HOME.unsavedEl.hidden = !HOME.dirty;
  }
  // „Uložit stránku": publish the draft (layout + background) to readers.
  function homeSave() {
    if (!CONTENT || !HOME.layout || uploadsBusy()) return;
    homeSyncText();
    DOC.dirty = false;                                // everything typed so far is in this save
    var prevLayout = CONTENT.home && CONTENT.home.layout, prevBg = CONTENT.home && CONTENT.home.background;
    if (!CONTENT.home) CONTENT.home = {};
    CONTENT.home.layout = VNHome.normalize(HOME.layout);
    CONTENT.home.background = JSON.parse(JSON.stringify(HOME.bg || { color: "", image: "" }));
    saveHomeBtn.disabled = true;
    var rev = HOME.rev;
    saveContent()
      .then(function () {
        // edits made while the request ran are not on the server yet: stay unsaved
        if (HOME.rev === rev && !DOC.dirty) { HOME.dirty = false; homeUpdateUnsaved(); }
        toast("Domovská stránka byla uložena — čtenáři ji teď vidí.");
      })
      .catch(function (err) {
        CONTENT.home.layout = prevLayout;             // readers keep the previous version
        CONTENT.home.background = prevBg;
        if (err.status === 401) { showLogin(); return; }
        toast("Uložení selhalo: " + (err.detail || err.message));
      })
      .finally(function () { saveHomeBtn.disabled = false; });
  }
  // Article list changed (loaded, saved, deleted) -> refresh the cards.
  function homeArticlesChanged() {
    if (DOC.key !== "home") return;
    if (pendingUploads > 0) { setTimeout(homeArticlesChanged, 500); return; }   // see homeBusy
    var unsavedDefault = !(CONTENT && CONTENT.home && CONTENT.home.layout) && !HOME.dirty;
    if (HOME.layout && !unsavedDefault) { homeSyncText(); homeRender(); } else homeLoad();
  }
  // A redraw rebuilds every text block, which would orphan an image still
  // uploading into one (its blob: node is not saved). Refuse layout changes
  // until the upload is done.
  function homeBusy() {
    if (pendingUploads > 0) { toast("Počkejte, až se dokončí nahrávání obrázku."); return true; }
    return false;
  }
  // The renderer's own nodes only (:scope paths) — pasted text may contain
  // markup that looks like layout blocks.
  function homeBlockNodes() {
    return HOME.host.querySelectorAll(":scope > .hl-canvas > .hl-row > .hl-block");
  }
  function homeRowNodes() {
    return Array.prototype.slice.call(HOME.host.querySelectorAll(":scope > .hl-canvas > .hl-row"));
  }
  function homeBlockNode(id) {
    return Array.prototype.filter.call(homeBlockNodes(), function (n) { return n.dataset.blockId === id; })[0] || null;
  }
  function homeOwnBlock(target) {
    var n = target.closest && target.closest(".hl-block");
    while (n && !(n.parentNode && n.parentNode.classList.contains("hl-row") &&
                  n.parentNode.parentNode && n.parentNode.parentNode.parentNode === HOME.host)) {
      n = n.parentNode && n.parentNode.closest ? n.parentNode.closest(".hl-block") : null;
    }
    return n;
  }
  // Pull the live text of every text block back into the draft.
  function homeSyncText() {
    if (!HOME.layout) return;
    Array.prototype.forEach.call(homeBlockNodes(), function (node) {
      if (!node.classList.contains("hl-text")) return;
      var f = homeFind(node.dataset.blockId);
      var body = node.querySelector(":scope > .hl-text-body");
      if (!f || !body) return;
      var copy = docCleanCopy(body);
      // drop layout markers that came in with pasted page markup
      Array.prototype.forEach.call(copy.querySelectorAll("[data-block-id],[data-row-id],[class*='hl-']"), function (n) {
        n.removeAttribute("data-block-id");
        n.removeAttribute("data-row-id");
        n.removeAttribute("contenteditable");
        if (n.className && typeof n.className === "string") {
          var keep = n.className.split(/\s+/).filter(function (c) { return c && c.indexOf("hl-") !== 0; }).join(" ");
          if (keep) n.className = keep; else n.removeAttribute("class");
        }
      });
      f.block.html = copy.innerHTML;
    });
  }
  function homeFind(id) {
    var rows = HOME.layout ? HOME.layout.rows : [];
    for (var ri = 0; ri < rows.length; ri++) {
      for (var bi = 0; bi < rows[ri].blocks.length; bi++) {
        if (rows[ri].blocks[bi].id === id) return { row: rows[ri], ri: ri, bi: bi, block: rows[ri].blocks[bi] };
      }
    }
    return null;
  }
  function homeNewRow(block) { return { id: VNHome.uid("r"), blocks: [block] }; }
  // A structural change: tidy rows, mark the draft unsaved, redraw.
  function homeChanged() {
    HOME.layout.rows = HOME.layout.rows.filter(function (r) { return r.blocks.length; });
    HOME.layout.rows.forEach(function (r) { r.blocks.sort(function (x, y) { return x.col - y.col; }); });
    homeMarkDirty();
    homeRender();
  }

  function homeRender() {
    if (!HOME.layout) return;
    // the old text nodes are about to be replaced: stop formatting into them
    DOC.root = null; ED.savedRange = null; ED.liveSpan = null; HOME.editingId = null;
    if (HOME.selectedId && !homeFind(HOME.selectedId)) HOME.selectedId = null;
    VNHome.render(HOME.host, HOME.layout, ADMIN_ARTICLES, { editing: true, decorate: homeDecorate });
  }
  function hlButton(label, title, act, arg, on) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.dataset.act = act;
    if (arg != null) b.dataset.arg = arg;
    if (on) b.classList.add("is-on");
    return b;
  }
  function hlSep() { var s = document.createElement("span"); s.className = "hl-sep"; return s; }
  // Context toolbar of a selected block: size, (article), delete.
  function homeDecorate(node, b) {
    if (b.id === HOME.selectedId) node.classList.add("is-selected");
    var bar = document.createElement("div");
    bar.className = "hl-chrome";
    var w = VNHome.blockWidth(b);
    [1, 2, 3, 4].forEach(function (n) {
      var title = b.kind === "post"
        ? (["", "Čtvrtina (1×1)", "Polovina (2×1)", "Tři čtvrtiny (3×1)", "Celá šířka (4×2)"])[n]
        : "Šířka " + HL_SIZE_LABEL[n] + " řádku";
      bar.appendChild(hlButton(HL_SIZE_LABEL[n], title, "size", n, n === w));
    });
    bar.appendChild(hlSep());
    if (b.kind === "post") bar.appendChild(hlButton("↻", b.articleId ? "Změnit příspěvek" : "Vybrat příspěvek", "pick"));
    bar.appendChild(hlButton("✕", "Smazat blok", "delete"));
    node.appendChild(bar);
    // scheduled article: visible here, blank on the public page until it's out
    var a = b.kind === "post" && b.articleId && ADMIN_ARTICLES.filter(function (x) { return x.id === b.articleId; })[0];
    if (a && isScheduled(a)) {
      var badge = document.createElement("span");
      badge.className = "hl-badge";
      badge.textContent = "Naplánováno — čtenáři ho zatím nevidí";
      node.appendChild(badge);
    }
  }
  function homeSelect(id) {
    HOME.selectedId = id;
    Array.prototype.forEach.call(homeBlockNodes(), function (n) {
      n.classList.toggle("is-selected", n.dataset.blockId === id);
    });
  }
  // Click-away: close the context toolbar and drop the selection.
  function homeDeselect() {
    if (!HOME.selectedId) return;
    homeStopEditing();
    homeSelect(null);
  }
  // Leave text editing (the block stays selected, draggable again).
  function homeStopEditing() {
    var body = DOC.root;
    if (body && (document.activeElement === body || body.contains(document.activeElement))) body.blur();
    HOME.editingId = null;
    DOC.root = null;
  }
  // A canvas in the phone layout (mobile preview) ignores grid columns, so
  // grid moves there would change positions the admin can't see.
  function homePhoneLayout() {
    var cv = HOME.host.querySelector(":scope > .hl-canvas");
    return !!cv && cv.getBoundingClientRect().width <= 640;
  }

  /* ---------- placing a block on the grid ---------- */
  // Put block f.block at (rowIndex, col) — or into a new row inserted at
  // newRowIndex when rowIndex is null. Columns are validated by the caller.
  function homePlace(f, rowIndex, col, newRowIndex) {
    var rows = HOME.layout.rows;
    var target = rowIndex == null ? null : rows[rowIndex];
    f.row.blocks.splice(f.bi, 1);                  // empty rows are tidied in homeChanged
    f.block.col = col;
    if (target) target.blocks.push(f.block);
    else rows.splice(newRowIndex, 0, homeNewRow(f.block));
  }
  function homeResize(f, width) {
    width = Math.max(1, Math.min(4, width | 0));
    if (f.block.kind === "post") f.block.size = HL_POST_BY_WIDTH[width];
    else f.block.span = width;
    // keep it in its row if there are enough free boxes (nearest to where it was)
    var col = VNHome.nearestFreeCol(f.row, width, f.block.col, f.block.id);
    if (col >= 0) { f.block.col = col; return; }
    homePlace(f, null, 0, f.ri + 1);               // otherwise: its own row below
    toast("Blok se do řádku nevešel — je na novém řádku.");
  }
  function homeAction(id, act, arg) {
    var f = homeFind(id);
    if (!f) return;
    if (act === "pick") { homeOpenPicker(id); return; }
    if (homeBusy()) return;
    homeSyncText();
    if (act === "size") homeResize(f, +arg);
    else if (act === "delete") { f.row.blocks.splice(f.bi, 1); HOME.selectedId = null; }
    else return;
    homeChanged();
  }
  // Palette: the new block takes the first free boxes of the last row, else
  // a new row at the end of the page.
  function homeAdd(kind) {
    if (!HOME.layout || homeBusy()) return;
    homeSyncText();
    var b = kind === "text"
      ? { id: VNHome.uid("b"), kind: "text", span: 4, col: 0, html: "<p>Nový textový blok</p>" }
      : { id: VNHome.uid("b"), kind: "post", size: kind, col: 0, articleId: "" };
    var w = VNHome.blockWidth(b), rows = HOME.layout.rows, last = rows[rows.length - 1];
    var col = last ? VNHome.nearestFreeCol(last, w, 0) : -1;
    if (col >= 0) { b.col = col; last.blocks.push(b); } else rows.push(homeNewRow(b));
    HOME.selectedId = b.id;
    homeChanged();
    var node = homeBlockNode(b.id);
    if (!node) return;
    node.scrollIntoView({ block: "nearest", behavior: "smooth" });
    var body = node.querySelector(".hl-text-body");
    if (body) {                                    // ready to type over the placeholder
      body.focus();
      var r = document.createRange(); r.selectNodeContents(body);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    }
  }

  /* ---------- pointer: select / grab anywhere / edit text ---------- */
  HOME.host.addEventListener("mousedown", function (e) {
    // toolbar buttons must not steal focus from the text being edited
    if (e.target.closest(".hl-chrome")) e.preventDefault();
  });
  // Editing state is explicit (HOME.editingId), not "where is focus": focus
  // may sit in a toolbar input (font size, colour) while a block is edited.
  function homeIsEditing(node) { return HOME.editingId === node.dataset.blockId; }
  function hlTouch(type) { return type === "touch" || type === "pen"; }
  HOME.host.addEventListener("pointerdown", function (e) {
    if (e.button !== 0 || HOME.drag) return;
    var node = homeOwnBlock(e.target);
    if (!node) return;
    if (e.target.closest(".hl-chrome, .hl-plus")) return;          // their own click handlers
    // inside the text being edited: normal text editing (caret, selection)
    if (homeIsEditing(node) && e.target.closest(".hl-text-body")) return;
    // touch / pen: a swipe must scroll the page — only an already selected
    // block can be dragged; a tap selects (see the click handler)
    if (hlTouch(e.pointerType) && node.dataset.blockId !== HOME.selectedId) return;
    e.preventDefault();          // no focus / text selection: this may become a drag
    HOME.press = { id: node.dataset.blockId, node: node, x0: e.clientX, y0: e.clientY, pointerId: e.pointerId,
                   wasSelected: HOME.selectedId === node.dataset.blockId };
    document.addEventListener("pointermove", homePressMove);
    document.addEventListener("pointerup", homePressUp);
    document.addEventListener("pointercancel", homePressCancel);
  });
  function homePressCleanup() {
    document.removeEventListener("pointermove", homePressMove);
    document.removeEventListener("pointerup", homePressUp);
    document.removeEventListener("pointercancel", homePressCancel);
    HOME.press = null;
  }
  function homePressCancel() { homePressCleanup(); }
  function homePressMove(e) {
    var p = HOME.press;
    if (!p) return;
    if (Math.abs(e.clientX - p.x0) + Math.abs(e.clientY - p.y0) < 6) return;   // still a click
    homePressCleanup();
    if (homePhoneLayout()) { toast("Rozložení upravujte v náhledu Počítač."); return; }
    homeDragStart(p, e);
  }
  // A click (no drag). First click selects the block (it stays draggable);
  // a click on an already selected text block starts editing at that spot.
  function homePressUp(e) {
    var p = HOME.press;
    homePressCleanup();
    if (!p) return;
    homeClickBlock(p.node, p.wasSelected, e.clientX, e.clientY);
  }
  function homeClickBlock(node, wasSelected, x, y) {
    var id = node.dataset.blockId;
    if (HOME.editingId && HOME.editingId !== id) homeStopEditing();
    homeSelect(id);
    var body = node.querySelector(":scope > .hl-text-body");
    if (!body || !wasSelected) return;
    HOME.editingId = id;
    body.focus({ preventScroll: true });
    var r = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
    if (r && body.contains(r.startContainer)) {
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    }
  }
  HOME.host.addEventListener("click", function (e) {
    var node = homeOwnBlock(e.target);
    if (!node) return;
    var plus = e.target.closest(".hl-plus");
    if (plus && plus.parentNode === node) { homeSelect(node.dataset.blockId); homeOpenPicker(node.dataset.blockId); return; }
    var bar = e.target.closest(".hl-chrome");
    var btn = bar && bar.parentNode === node && e.target.closest("button");
    if (btn) { homeAction(node.dataset.blockId, btn.dataset.act, btn.dataset.arg); return; }
    // a touch tap (mouse clicks are handled on pointerup)
    if (hlTouch(HOME.lastPointer) && !homeIsEditing(node)) {
      homeClickBlock(node, HOME.selectedId === node.dataset.blockId, e.clientX, e.clientY);
    }
  });
  // a text block in focus becomes the formatting target of the docked toolbar
  HOME.host.addEventListener("focusin", function (e) {
    var body = e.target.closest && e.target.closest(".hl-text-body");
    if (!body || DOC.key !== "home") return;
    if (DOC.root !== body) { edCommitLive(); DOC.root = body; ED.savedRange = null; }
    var node = body.closest(".hl-block");
    if (node) { HOME.editingId = node.dataset.blockId; homeSelect(node.dataset.blockId); }
  });
  // Smart blur: a click anywhere outside the selected block, its toolbar,
  // the formatting toolbar or the article picker closes the menu and
  // deselects. Touch uses "click", so starting to scroll doesn't deselect.
  function homeClickAway(e) {
    if (DOC.key !== "home" || !HOME.selectedId || HOME.drag) return;
    var t = e.target;
    var node = homeBlockNode(HOME.selectedId);
    if (node && node.contains(t)) return;
    if (t.closest && t.closest(".ed-bar2, #hl-picker, .toast")) return;
    homeDeselect();
  }
  document.addEventListener("pointerdown", function (e) {
    HOME.lastPointer = e.pointerType;
    if (!hlTouch(e.pointerType)) homeClickAway(e);
  }, true);
  document.addEventListener("click", function (e) { if (hlTouch(HOME.lastPointer)) homeClickAway(e); }, true);

  /* ---------- drag & drop with grid snapping ---------- */
  function homeDragStart(p, e) {
    if (homeBusy()) return;
    homeSyncText();
    var f = homeFind(p.id);
    if (!f) return;
    if (HOME.editingId && HOME.editingId !== p.id) homeStopEditing();
    homeSelect(p.id);
    var node = p.node, r = node.getBoundingClientRect();
    var ghost = node.cloneNode(true);
    ghost.classList.remove("is-selected");
    ghost.classList.add("hl-ghost");
    ghost.style.width = r.width + "px";
    ghost.style.height = r.height + "px";
    document.body.appendChild(ghost);
    var grid = document.createElement("div");           // the 4 boxes become visible
    grid.className = "hl-gridlines";
    grid.innerHTML = "<i></i><i></i><i></i><i></i>";
    var drop = document.createElement("div");
    drop.className = "hl-drop";
    drop.hidden = true;
    HOME.frameHost.appendChild(grid);
    HOME.frameHost.appendChild(drop);
    node.classList.add("is-dragging");
    document.body.classList.add("hl-dragging");
    HOME.drag = { id: p.id, node: node, ghost: ghost, grid: grid, drop: drop, w: VNHome.blockWidth(f.block),
                  h: r.height, dx: p.x0 - r.left, dy: p.y0 - r.top, target: null };
    homeDragPaint();
    document.addEventListener("pointermove", homeDragMove);
    document.addEventListener("pointerup", homeDragEnd);
    document.addEventListener("pointercancel", homeDragCancel);
    document.addEventListener("keydown", homeDragKey);
    homeDragMove(e);
  }
  function homeDragPaint() {
    var d = HOME.drag, canvas = HOME.host.querySelector(":scope > .hl-canvas");
    if (!d || !canvas) return;
    var host = HOME.frameHost.getBoundingClientRect(), c = canvas.getBoundingClientRect();
    d.grid.style.left = (c.left - host.left) + "px";
    d.grid.style.top = (c.top - host.top) + "px";
    d.grid.style.width = c.width + "px";
    d.grid.style.height = c.height + "px";
  }
  function homeDragMove(e) {
    var d = HOME.drag;
    if (!d) return;
    d.ghost.style.left = (e.clientX - d.dx) + "px";
    d.ghost.style.top = (e.clientY - d.dy) + "px";
    // near the window edge: scroll, so far away rows can be reached
    if (e.clientY < 60) window.scrollBy(0, -14);
    else if (e.clientY > window.innerHeight - 60) window.scrollBy(0, 14);
    d.target = homeDropTarget(e.clientX - d.dx, e.clientY);
    var t = d.target, box = d.drop;
    if (!t) { box.hidden = true; return; }
    var host = HOME.frameHost.getBoundingClientRect();
    box.hidden = false;
    box.classList.toggle("is-newrow", t.rowIndex == null);
    box.style.left = (t.left - host.left) + "px";
    box.style.top = (t.top - host.top) + "px";
    box.style.width = t.width + "px";
    box.style.height = t.height + "px";
  }
  /* Snap the dragged block to the grid. The column comes from the block's
     left edge (nearest box); the row from the pointer. If those boxes are
     taken, the nearest free boxes of that row are used; a full row (or the
     gap between rows) makes a new row there. */
  function homeDropTarget(blockLeft, y) {
    var d = HOME.drag, f = homeFind(d.id);
    var canvas = HOME.host.querySelector(":scope > .hl-canvas");
    if (!f || !canvas) return null;
    var c = canvas.getBoundingClientRect(), w = d.w;
    var colW = (c.width - 3 * HL_GAP) / 4, pitch = colW + HL_GAP;
    var want = Math.max(0, Math.min(4 - w, Math.round((blockLeft - c.left) / pitch)));
    var width = w * colW + (w - 1) * HL_GAP;
    function boxAt(col) { return c.left + col * pitch; }
    function newRow(index, yLine) {
      return { rowIndex: null, newRowIndex: index, col: want, left: boxAt(want), width: width,
               top: yLine - 10, height: 20 };
    }
    var rowEls = homeRowNodes();
    for (var i = 0; i < rowEls.length; i++) {
      var rr = rowEls[i].getBoundingClientRect();
      if (y < rr.top) return newRow(i, rr.top - HL_GAP / 2);
      if (y > rr.bottom) continue;
      var rel = (y - rr.top) / Math.max(1, rr.height);
      var row = HOME.layout.rows[i];
      var col = VNHome.spanFree(VNHome.rowCells(row, d.id), want, w) ? want : VNHome.nearestFreeCol(row, w, want, d.id);
      // thin bands at the row edges = "put it in a new row above/below"
      if (col < 0 || rel < 0.12 || rel > 0.88) {
        return rel < 0.5 ? newRow(i, rr.top - HL_GAP / 2) : newRow(i + 1, rr.bottom + HL_GAP / 2);
      }
      return { rowIndex: i, col: col, left: boxAt(col), width: width, top: rr.top, height: Math.max(d.h, 24) };
    }
    var last = rowEls.length ? rowEls[rowEls.length - 1].getBoundingClientRect() : c;
    return newRow(rowEls.length, last.bottom + HL_GAP / 2);
  }
  function homeDragCleanup() {
    var d = HOME.drag;
    document.removeEventListener("pointermove", homeDragMove);
    document.removeEventListener("pointerup", homeDragEnd);
    document.removeEventListener("pointercancel", homeDragCancel);
    document.removeEventListener("keydown", homeDragKey);
    document.body.classList.remove("hl-dragging");
    if (!d) return;
    d.ghost.remove(); d.grid.remove(); d.drop.remove();
    d.node.classList.remove("is-dragging");
    HOME.drag = null;
  }
  function homeDragCancel() { homeDragCleanup(); }
  function homeDragKey(e) { if (e.key === "Escape") homeDragCleanup(); }
  function homeDragEnd() {
    var d = HOME.drag, t = d && d.target;
    homeDragCleanup();
    if (!t) return;
    var f = homeFind(d.id);
    if (!f) return;
    if (t.rowIndex === f.ri && t.col === f.block.col) return;   // dropped where it was
    homePlace(f, t.rowIndex, t.col, t.newRowIndex);
    HOME.selectedId = f.block.id;
    homeChanged();
  }

  /* ---------- keyboard: arrows move the selected block by one box ---------- */
  document.addEventListener("keydown", function (e) {
    if (DOC.key !== "home" || !HOME.selectedId || HOME.drag || !hlPicker.box.hidden) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Escape"].indexOf(e.key) < 0) return;
    var node = homeBlockNode(HOME.selectedId);
    if (!node) return;
    if (homeIsEditing(node)) {                    // while typing, arrows move the caret
      if (e.key === "Escape") { e.preventDefault(); homeStopEditing(); }   // Esc: back to "selected"
      return;
    }
    var a = document.activeElement;
    if (a && a !== document.body && !node.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;
    e.preventDefault();
    if (e.key === "Escape") { homeDeselect(); return; }
    if (homePhoneLayout()) { toast("Rozložení upravujte v náhledu Počítač."); return; }
    if (homeBusy()) return;
    homeSyncText();
    var f = homeFind(HOME.selectedId), w = VNHome.blockWidth(f.block), rows = HOME.layout.rows;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      var step = e.key === "ArrowLeft" ? -1 : 1, cells = VNHome.rowCells(f.row, f.block.id);
      for (var c = f.block.col + step; c >= 0 && c + w <= 4; c += step) {
        if (VNHome.spanFree(cells, c, w)) { f.block.col = c; homeChanged(); return; }
      }
      return;                                     // nothing free that way: no change
    }
    var dir = e.key === "ArrowUp" ? -1 : 1, j = f.ri + dir;
    if (j < 0 || j >= rows.length) {
      if (f.row.blocks.length === 1) return;      // already the first/last row
      homePlace(f, null, f.block.col, dir < 0 ? f.ri : f.ri + 1);   // own new row at the edge
      homeChanged();
      return;
    }
    var col = VNHome.nearestFreeCol(rows[j], w, f.block.col, f.block.id);
    if (col >= 0) homePlace(f, j, col);
    else if (f.row.blocks.length === 1) {
      // alone in its row and the neighbour row is full: jump over it
      homePlace(f, null, f.block.col, dir < 0 ? f.ri - 1 : f.ri + 2);
    } else homePlace(f, null, f.block.col, dir < 0 ? f.ri : f.ri + 1);
    homeChanged();
  });

  /* ---------- article picker for "+" ---------- */
  function homeOpenPicker(blockId) {
    HOME.pickerFor = blockId;
    hlPicker.search.value = "";
    homeRenderPicker();
    hlPicker.box.hidden = false;
    setTimeout(function () { hlPicker.search.focus(); }, 0);
  }
  function homeClosePicker() { hlPicker.box.hidden = true; HOME.pickerFor = null; }
  function homeRenderPicker() {
    var q = hlPicker.search.value.trim().toLowerCase();
    var placed = {};
    (HOME.layout ? HOME.layout.rows : []).forEach(function (r) {
      r.blocks.forEach(function (b) { if (b.kind === "post" && b.articleId) placed[b.articleId] = true; });
    });
    var list = ADMIN_ARTICLES.slice()
      .sort(function (x, y) { return articlePublishTime(y) - articlePublishTime(x); })
      .filter(function (a) { return !q || String(a.title || "").toLowerCase().indexOf(q) > -1; });
    if (!list.length) { hlPicker.list.innerHTML = '<li class="empty-state">Žádné příspěvky.</li>'; return; }
    hlPicker.list.innerHTML = list.map(function (a) {
      var img = VNHome.thumb(a);
      var flags = (isScheduled(a) ? '<span class="hl-pick-flag">Naplánováno</span>' : "") +
                  (placed[a.id] ? '<span class="hl-pick-flag" style="color:var(--muted)">už na stránce</span>' : "");
      return '<li><button type="button" data-id="' + escapeHtml(a.id) + '">' +
        '<span class="hl-pick-img"' + (img ? ' style="background-image:' + escapeHtml(VNSafe.cssUrl(img)) + '"' : "") + "></span>" +
        "<span><strong>" + escapeHtml(a.title || "(bez názvu)") + "</strong>" +
        "<small>" + escapeHtml(VNHome.formatDate(a.date)) + flags + "</small></span></button></li>";
    }).join("");
  }
  function homeAssign(articleId) {
    if (homeBusy()) return;
    var f = HOME.pickerFor && homeFind(HOME.pickerFor);
    homeClosePicker();
    if (!f) return;
    homeSyncText();
    f.block.articleId = articleId;
    HOME.selectedId = f.block.id;
    homeChanged();
  }
  hlPicker.search.addEventListener("input", homeRenderPicker);
  hlPicker.list.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-id]");
    if (b) homeAssign(b.dataset.id);
  });
  hlPicker.clear.addEventListener("click", function () { homeAssign(""); });
  hlPicker.cancel.addEventListener("click", homeClosePicker);
  hlPicker.box.addEventListener("click", function (e) { if (e.target === hlPicker.box) homeClosePicker(); });
  hlPicker.box.addEventListener("keydown", function (e) { if (e.key === "Escape") homeClosePicker(); });

  /* ---------- palette + desktop/mobile preview ---------- */
  document.querySelector("#hl-palette").addEventListener("click", function (e) {
    var add = e.target.closest("button[data-add]");
    if (add) { homeAdd(add.dataset.add); return; }
    var view = e.target.closest("button[data-view]");
    if (!view) return;
    var mobile = view.dataset.view === "mobile";
    HOME.frameHost.classList.toggle("is-mobile", mobile);
    Array.prototype.forEach.call(this.querySelectorAll("button[data-view]"), function (b) {
      b.setAttribute("aria-pressed", String(b === view));
    });
  });

  /* ============================================================
     Team members — modular workspace (opens in place)
     ============================================================ */
  var teamWorkspace = document.querySelector("#team-workspace");
  var teamAddBtn    = document.querySelector("#team-add-btn");
  var teamCloseBtn  = document.querySelector("#team-close-btn");
  function openTeamWorkspace() {
    if (!teamWorkspace) return;
    teamWorkspace.hidden = false;
    if (tmName) tmName.focus();
  }
  function closeTeamWorkspace() {
    if (teamWorkspace) teamWorkspace.hidden = true;
  }
  if (teamAddBtn) teamAddBtn.addEventListener("click", function () {
    resetTeamForm();
    openTeamWorkspace();
  });
  if (teamCloseBtn) teamCloseBtn.addEventListener("click", closeTeamWorkspace);

  /* ============================================================
     LAYERS — „Zarovnat vrstvy" (z-index).
     The page background is a style on the canvas itself, never an
     element, so it always sits behind everything and is unaffected.
     ============================================================ */
  function edNormalizeLayers() {
    ED.elements.slice()
      .sort(function (a, b) { return (a.z || 0) - (b.z || 0); })
      .forEach(function (el, i) { el.z = i + 1; });
  }
  function edLayer(action) {
    var el = edFind(ED.selectedId);
    if (!el) { toast("Nejdřív vyberte prvek."); return; }
    edNormalizeLayers();
    var max = ED.elements.length;
    // Fractional nudges land between neighbours; normalising then snaps to
    // whole steps. The most recent call always wins — that is the priority rule.
    if (action === "front")         el.z = max + 1;
    else if (action === "back")     el.z = 0;
    else if (action === "forward")  el.z = (el.z || 1) + 1.5;
    else if (action === "backward") el.z = (el.z || 1) - 1.5;
    edNormalizeLayers();
    // only z-index changes: update the nodes in place — a full re-render would
    // throw away the text selection of a box being edited
    ED.elements.forEach(function (e) {
      var n = EDITOR.canvas.querySelector('.ed-el[data-id="' + e.id + '"]');
      if (n) n.style.zIndex = e.z || 1;
    });
  }
  var layerBtn  = document.querySelector("#ed-layer");
  var layerMenu = document.querySelector("#ed-layer-menu");
  if (layerBtn) {
    layerBtn.addEventListener("mousedown", function (e) { e.preventDefault(); });
    layerBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (layerMenu) layerMenu.hidden = !layerMenu.hidden;
    });
  }
  if (layerMenu) layerMenu.addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-layer]");
    if (!btn) return;
    edLayer(btn.dataset.layer);
    layerMenu.hidden = true;
  });

  /* ============================================================
     PAGE BACKGROUND — solid colour OR image, locked behind all
     ============================================================ */
  function edApplyBackground(target, bg) {
    if (!target) return;
    bg = bg || {};
    if (bg.image) {
      target.style.backgroundImage = VNSafe.cssUrl(bg.image);
      target.style.backgroundSize = "cover";
      target.style.backgroundPosition = "center";
      target.style.backgroundColor = bg.color || "";
    } else {
      target.style.backgroundImage = "";
      target.style.backgroundColor = bg.color || "";
    }
    // the homepage frame gets the same padding as on the public page
    target.classList.toggle("has-bg", !!(bg.image || bg.color));
  }
  // Which background is the toolbar currently editing?
  function edCurrentBg() {
    if (DOC.key === "home") {                 // homepage: part of the draft (published on save)
      if (!HOME.bg) HOME.bg = { color: "", image: "" };
      return HOME.bg;
    }
    if (DOC.key && CONTENT) {
      if (!CONTENT[DOC.key]) CONTENT[DOC.key] = {};
      if (!CONTENT[DOC.key].background) CONTENT[DOC.key].background = { color: "", image: "" };
      return CONTENT[DOC.key].background;
    }
    if (!ED.background) ED.background = { color: "", image: "" };
    return ED.background;
  }
  function edBgTargetEl() {
    if (DOC.key && DOC_TARGETS[DOC.key].frame) return DOC_TARGETS[DOC.key].frame;   // homepage frame
    return DOC.root ? DOC.root : EDITOR.canvas;
  }
  // The colour input fires continuously while dragging, so the (networked)
  // document save is debounced; the local preview updates immediately.
  var bgSaveTimer = null;
  function edBgChanged() {
    var bg = edCurrentBg();
    edApplyBackground(edBgTargetEl(), bg);
    if (!DOC.key) { fBackground.value = JSON.stringify(bg); return; }
    if (DOC.key === "home") { homeMarkDirty(); return; }   // waits for „Uložit stránku"
    var key = DOC.key;
    clearTimeout(bgSaveTimer);
    bgSaveTimer = setTimeout(function () {
      docSave(key, null, "Pozadí bylo uloženo.");
    }, 600);
  }

  var bgBtn   = document.querySelector("#ed-bg");
  var bgPanel = document.querySelector("#ed-bg-panel");
  var bgColor = document.querySelector("#ed-bg-color");
  var bgHex   = document.querySelector("#ed-bg-hex");
  var bgFile  = document.querySelector("#ed-bg-file");
  var bgClear = document.querySelector("#ed-bg-clear");

  if (bgBtn) {
    bgBtn.addEventListener("mousedown", function (e) { e.preventDefault(); });
    bgBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (!bgPanel) return;
      if (bgPanel.hidden) {
        var bg = edCurrentBg();
        if (bg.color && bgColor) { bgColor.value = bg.color; bgHex.value = bg.color; }
      }
      bgPanel.hidden = !bgPanel.hidden;
    });
  }
  if (bgPanel) bgPanel.addEventListener("click", function (e) { e.stopPropagation(); });
  if (bgColor) bgColor.addEventListener("input", function () {
    var bg = edCurrentBg();
    bg.color = bgColor.value;
    bg.image = "";                       // a colour replaces an image
    if (bgHex) bgHex.value = bgColor.value;
    edBgChanged();
  });
  if (bgHex) bgHex.addEventListener("change", function () {
    var v = bgHex.value.trim();
    if (!/^#[0-9a-f]{6}$/i.test(v)) { bgHex.value = bgColor ? bgColor.value : ""; return; }
    var bg = edCurrentBg();
    bg.color = v; bg.image = "";
    if (bgColor) bgColor.value = v;
    edBgChanged();
  });
  if (bgFile) bgFile.addEventListener("change", function () {
    var file = bgFile.files && bgFile.files[0];
    if (!file) return;
    bgFile.disabled = true;
    // Remember WHAT was being edited when the file was picked: the upload can
    // finish after the admin switched pages and must not land on the new one.
    var targetKey = DOC.key || null;
    var session = ED.session;
    uploadImageFile(file)
      .then(function (url) {
        var sameTarget = (DOC.key || null) === targetKey &&
          (targetKey || (!EDITOR.overlay.hidden && ED.session === session));
        if (sameTarget) {
          var bg = edCurrentBg();
          bg.image = url;
          edBgChanged();
          toast("Pozadí nahráno.");
        } else if (targetKey === "home") {      // finished after leaving the tab: into the draft
          if (!HOME.bg) HOME.bg = { color: "", image: "" };
          HOME.bg.image = url;
          homeMarkDirty();
          toast("Pozadí domovské stránky nahráno — uloží se tlačítkem „Uložit stránku“.");
        } else if (targetKey && CONTENT) {
          if (!CONTENT[targetKey]) CONTENT[targetKey] = {};
          var old = CONTENT[targetKey].background || {};
          CONTENT[targetKey].background = { color: old.color || "", image: url };
          docSave(targetKey, null, "Pozadí bylo uloženo.");
        } else {
          toast("Editor byl mezitím zavřen — pozadí se nepoužilo.");
        }
      })
      .catch(function (err) { toast("Nahrání selhalo: " + err.message); })
      .finally(function () { bgFile.disabled = false; bgFile.value = ""; });
  });
  if (bgClear) bgClear.addEventListener("click", function () {
    var bg = edCurrentBg();
    bg.color = ""; bg.image = "";
    edBgChanged();
  });
  // click-away closes the popovers
  document.addEventListener("click", function () {
    if (bgPanel && !bgPanel.hidden) bgPanel.hidden = true;
    if (layerMenu && !layerMenu.hidden) layerMenu.hidden = true;
  });

  /* ============================================================
     Boot
     ============================================================ */
  fDate.value = nowLocalInput();

  // Probe session state — if cookie is missing, show login immediately.
  api("/api/login")
    .then(function (info) {
      if (info && info.loggedIn) showShell();
      else showLogin();
    })
    .catch(function () { showLogin(); });
})();
