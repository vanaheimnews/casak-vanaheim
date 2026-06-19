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
  function today() { return new Date().toISOString().slice(0, 10); }

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
    shell.hidden = true;
    if (headerNav) headerNav.hidden = true;   // hide admin controls until logged in
    if (adminTag) adminTag.hidden = true;
    setTimeout(function () { loginPass.focus(); }, 0);
  }
  function showShell() {
    loginScreen.hidden = true;
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
      imagePreview.style.backgroundImage = "url('" + url.replace(/'/g, "\\'") + "')";
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
    submitBtn.disabled = true;
    submitBtn.textContent = "Nahrávám…";
    readAsDataUrl(file)
      .then(function (dataUrl) {
        return api("/api/upload", {
          method: "POST",
          body: { filename: file.name, dataUrl: dataUrl }
        });
      })
      .then(function (result) {
        pendingImageUrl = result.url;
        fImageUrl.value = "";
        updatePreview(pendingImageUrl);
        toast("Obrázek nahrán.");
      })
      .catch(function (err) {
        toast("Nahrání selhalo: " + err.message);
      })
      .finally(function () {
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
    fDate.value = today();
    pendingImageUrl = "";
    updatePreview("");
    formTitle.textContent = "Nový příspěvek";
    submitBtn.textContent = "Vytvořit";
  }
  function populateForm(article) {
    fId.value       = article.id;
    fElements.value = (article.elements && article.elements.length) ? JSON.stringify(article.elements) : "";
    fTitle.value    = article.title || "";
    fBody.value     = article.body || "";
    fAuthors.value  = (article.authors || []).join(", ");
    fDate.value     = article.date || "";
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
    if (!fTitle.value.trim()) { toast("Název je povinný."); fTitle.focus(); return; }
    var elements = [];
    if (fElements.value) { try { elements = JSON.parse(fElements.value); } catch (e) { elements = []; } }
    var payload = {
      title:   fTitle.value,
      body:    fBody.value,
      image:   pendingImageUrl || fImageUrl.value || "",
      authors: fAuthors.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean),
      tags:    fTags.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean),
      date:    fDate.value || today(),
      kind:    fKind.value === "comic" ? "comic" : "article",
      elements: elements
    };

    submitBtn.disabled = true;
    var savingId = fId.value;
    var req = savingId
      ? api("/api/articles?id=" + encodeURIComponent(savingId), { method: "PUT", body: payload })
      : api("/api/articles", { method: "POST", body: payload });

    req
      .then(function () {
        toast(savingId ? "Příspěvek uložen." : "Příspěvek vytvořen.");
        resetForm();
        refreshTable();
      })
      .catch(function (err) {
        if (err.status === 401) { toast("Vypršela platnost přihlášení."); showLogin(); return; }
        toast("Chyba: " + err.message);
      })
      .finally(function () {
        submitBtn.disabled = false;
      });
  });

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
  var adminSelectedTags = {};

  function articleThumb(a) {
    if (a.image) return a.image;
    if (Array.isArray(a.elements)) {
      for (var i = 0; i < a.elements.length; i++) {
        if (a.elements[i].type === "image" && a.elements[i].content) return a.elements[i].content;
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
    var todayStr = today();
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
      var future = a.date && a.date > todayStr;
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
        renderArticleFilter();
        renderArticleCards();
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
    fDate.value = today();
    edOpen();
  });

  /* ============================================================
     Generic image upload (reused by team photos)
     ============================================================ */
  function uploadImageFile(file) {
    return readAsDataUrl(file).then(function (dataUrl) {
      return api("/api/upload", { method: "POST", body: { filename: file.name, dataUrl: dataUrl } });
    }).then(function (r) { return r.url; });
  }

  /* ============================================================
     Tab switching
     ============================================================ */
  function showTab(name) {
    if (!sections[name]) name = "articles";
    Object.keys(sections).forEach(function (key) {
      if (sections[key]) sections[key].hidden = key !== name;
    });
    navLinks.forEach(function (link) {
      link.classList.toggle("is-active", link.dataset.tab === name);
    });
    // Lazy-load site content the first time About/Contact is opened.
    if ((name === "about" || name === "contact") && !contentLoaded) {
      loadContent();
    }
  }
  navLinks.forEach(function (link) {
    link.addEventListener("click", function () { showTab(link.dataset.tab); });
  });

  /* ============================================================
     Content (about / team / contact) — load + persist whole object
     ============================================================ */
  function loadContent() {
    return api("/api/content").then(function (c) {
      CONTENT = c;
      contentLoaded = true;
      renderAbout();
      renderTeamTable();
      renderContactTable();
      return c;
    }).catch(function (err) {
      if (err.status === 401) { showLogin(); return; }
      toast("Chyba načtení obsahu: " + err.message);
    });
  }
  // Persist the whole CONTENT object; returns the (shaped) saved content.
  function saveContent() {
    return api("/api/content", { method: "PUT", body: CONTENT }).then(function (saved) {
      CONTENT = saved;
      return saved;
    });
  }

  /* ---------- About: intro text ---------- */
  function renderAbout() {
    if (!CONTENT) return;
    aboutInput.value = (CONTENT.about && CONTENT.about.text) || "";
  }
  saveAboutBtn.addEventListener("click", function () {
    if (!CONTENT) return;
    CONTENT.about = { text: aboutInput.value };
    saveAboutBtn.disabled = true;
    saveContent()
      .then(function () { toast("Text byl uložen."); })
      .catch(function (err) {
        if (err.status === 401) { showLogin(); return; }
        toast("Chyba: " + (err.detail || err.message));
      })
      .finally(function () { saveAboutBtn.disabled = false; });
  });

  /* ---------- About: team members ---------- */
  function resetTeamForm() {
    teamForm.reset();
    tmId.value = "";
    tmPendingImage = "";
    tmPreview.hidden = true;
    teamTitle.textContent = "Nový člen";
    teamSubmit.textContent = "Přidat člena";
  }
  function tmUpdatePreview(url) {
    if (url) {
      tmPreview.style.backgroundImage = "url('" + url.replace(/'/g, "\\'") + "')";
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
    if (!Array.isArray(CONTENT.team)) CONTENT.team = [];
    var idx = CONTENT.team.findIndex(function (m) { return m.id === member.id; });
    if (idx === -1) CONTENT.team.push(member); else CONTENT.team[idx] = member;

    teamSubmit.disabled = true;
    saveContent()
      .then(function () { toast(idx === -1 ? "Člen přidán." : "Člen uložen."); resetTeamForm(); renderTeamTable(); })
      .catch(function (err) {
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
      var thumb = m.image
        ? '<span class="thumb round" style="background-image:url(\'' + m.image.replace(/'/g, "\\'") + '\')"></span>'
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
      teamForm.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (btn.dataset.action === "team-delete") {
      if (!confirm('Opravdu smazat „' + (member.name || "") + '"?')) return;
      CONTENT.team = (CONTENT.team || []).filter(function (m) { return m.id !== id; });
      saveContent()
        .then(function () { if (tmId.value === id) resetTeamForm(); renderTeamTable(); toast("Člen smazán."); })
        .catch(function (err) { toast("Chyba: " + (err.detail || err.message)); });
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
    if (!CONTENT.contact) CONTENT.contact = { subtitle: "", items: [] };
    if (!Array.isArray(CONTENT.contact.items)) CONTENT.contact.items = [];
    var item = {
      id: ctId.value || ("c-" + Date.now().toString(36)),
      type: ctType.value,
      label: ctLabel.value.trim(),
      url: ctUrl.value.trim()
    };
    var idx = CONTENT.contact.items.findIndex(function (c) { return c.id === item.id; });
    if (idx === -1) CONTENT.contact.items.push(item); else CONTENT.contact.items[idx] = item;

    contactSubmit.disabled = true;
    saveContent()
      .then(function () { toast(idx === -1 ? "Kontakt přidán." : "Kontakt uložen."); resetContactForm(); renderContactTable(); })
      .catch(function (err) {
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
      var link = c.url
        ? '<a href="' + escapeHtml(c.url) + '" target="_blank" rel="noopener">' + escapeHtml(c.url) + "</a>"
        : '<span style="color:var(--muted);">— text —</span>';
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
      CONTENT.contact.items = CONTENT.contact.items.filter(function (c) { return c.id !== id; });
      saveContent()
        .then(function () { if (ctId.value === id) resetContactForm(); renderContactTable(); toast("Kontakt smazán."); })
        .catch(function (err) { toast("Chyba: " + (err.detail || err.message)); });
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
    backChange:   document.querySelector("#ed-back-change"),
    deleteBtn:    document.querySelector("#ed-delete"),
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
    lastFs: 16,            // last valid font size (for revert)
    colorSyncing: false,
    currentColor: "#000000"
  };

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
    // 1) try to load an existing layout from the hidden form field
    if (fElements.value) {
      try {
        var parsed = JSON.parse(fElements.value);
        if (Array.isArray(parsed)) ED.elements = parsed;
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
    EDITOR.date.value = fDate.value || today();
    edUpdateSchedule();

    ED.snapshot = JSON.stringify(ED.elements);
    ED.selectedId = null;
    ED.editingId = null;
    document.body.classList.remove("visual-editor-active");   // open in preview state
    edRenderCanvas();
    edSetToolsVisible(false);
    EDITOR.overlay.hidden = false;
  }

  // purple border + hint when a future publish date is chosen
  function edUpdateSchedule() {
    var v = EDITOR.date.value;
    var future = !!v && v > today();   // yyyy-mm-dd string compare is chronological
    EDITOR.dateField.classList.toggle("is-scheduled", future);
    EDITOR.schedHint.hidden = !future;
  }
  EDITOR.date.addEventListener("input", edUpdateSchedule);
  EDITOR.date.addEventListener("change", edUpdateSchedule);
  function edClose() {
    edCloseColorPanel();
    document.body.classList.remove("visual-editor-active");
    EDITOR.overlay.hidden = true;
  }
  function edEnterVisual() { document.body.classList.add("visual-editor-active"); }
  // Commit the layout back into the article form (title + plain-text body + JSON)
  function edCommitToForm() {
    fElements.value = JSON.stringify(ED.elements);
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
    fDate.value = EDITOR.date.value || today();
  }

  /* ---------- rendering ---------- */
  function edRenderCanvas() {
    EDITOR.canvas.innerHTML = "";
    ED.elements.forEach(function (el) {
      EDITOR.canvas.appendChild(edBuildNode(el));
    });
  }

  function edApplyContentStyles(content, el) {
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
    if (ED.selectedId === el.id) node.classList.add("is-selected");
    if (ED.editingId === el.id) node.classList.add("is-editing");

    var content = document.createElement("div");
    content.className = "ed-el-content";
    if (el.type === "image") {
      var img = document.createElement("img");
      img.src = el.content;
      img.alt = "";
      content.appendChild(img);
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
      if (el.type === "text") { ev.preventDefault(); edEnterEdit(el.id); }
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

    function move(e2) {
      var dx = e2.clientX - startX, dy = e2.clientY - startY;
      if (!moved && Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      if (moved) {
        el.x = Math.max(0, origX + dx);
        el.y = Math.max(0, origY + dy);
        node.style.left = el.x + "px";
        node.style.top = el.y + "px";
      }
    }
    function up() {
      content.removeEventListener("pointermove", move);
      content.removeEventListener("pointerup", up);
      try { content.releasePointerCapture(ev.pointerId); } catch (e) {}
      if (moved) {
        if (!wasSelected) edSelect(el.id); else edUpdateToolbar();
      } else if (wasSelected && el.type === "text") {
        edEnterEdit(el.id);          // click on already-selected text -> edit
      } else {
        edSelect(el.id);             // first click -> select
      }
    }
    content.addEventListener("pointermove", move);
    content.addEventListener("pointerup", up);
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

    function move(e2) {
      var dx = e2.clientX - startX, dy = e2.clientY - startY;
      var w = origW, ht = origH, x = origX, y = origY;
      if (h.indexOf("e") > -1) w = origW + dx;
      if (h.indexOf("s") > -1) ht = origH + dy;
      if (h.indexOf("w") > -1) { w = origW - dx; x = origX + dx; }
      if (h.indexOf("n") > -1) { ht = origH - dy; y = origY + dy; }
      w = Math.max(40, w); ht = Math.max(24, ht);
      // clamp x/y so resizing from top/left can't invert
      if (h.indexOf("w") > -1) x = origX + (origW - w);
      if (h.indexOf("n") > -1) y = origY + (origH - ht);
      el.x = Math.max(0, x); el.y = Math.max(0, y);
      el.width = Math.round(w); el.height = Math.round(ht);
      node.style.left = el.x + "px"; node.style.top = el.y + "px";
      node.style.width = el.width + "px"; node.style.height = el.height + "px";
    }
    function up() {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      try { node.releasePointerCapture(ev.pointerId); } catch (e) {}
    }
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  function edSelect(id) {
    if (ED.editingId && ED.editingId !== id) edExitEdit();
    ED.selectedId = id;
    edRenderCanvas();
    var el = edFind(id);
    edSetToolsVisible(!!el && el.type === "text");
    edUpdateToolbar();
  }
  function edDeselect() {
    if (ED.editingId) edExitEdit();
    ED.selectedId = null;
    edRenderCanvas();
    edSetToolsVisible(false);
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
    edSetToolsVisible(false);
  }

  /* ---------- inline editing ---------- */
  function edEnterEdit(id) {
    var el = edFind(id);
    if (!el || el.type !== "text") return;
    edEnterVisual();                 // clicking into a text block opens full editor mode
    ED.editingId = id;
    ED.selectedId = id;
    edRenderCanvas();
    var node = EDITOR.canvas.querySelector('.ed-el[data-id="' + id + '"]');
    if (!node) return;
    var content = node.querySelector(".ed-el-content");
    content.contentEditable = "true";
    content.focus();
    edSetToolsVisible(true);
    edUpdateToolbar();
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
  EDITOR.imageFile.addEventListener("change", function () {
    var file = EDITOR.imageFile.files && EDITOR.imageFile.files[0];
    if (!file) return;
    toast("Nahrávám obrázek…");
    uploadImageFile(file)
      .then(function (url) {
        var w = 360;
        var el = {
          id: edUid(), type: "image", isTitle: false,
          content: url,
          x: edCanvasCenterX(w), y: edVisibleTop(), width: w, height: 220,
          styles: defaultStyles()
        };
        ED.elements.push(el);
        edSelect(el.id);
        toast("Obrázek přidán.");
      })
      .catch(function (err) { toast("Nahrání selhalo: " + err.message); })
      .finally(function () { EDITOR.imageFile.value = ""; });
  });

  // deselect when clicking empty canvas
  EDITOR.canvas.addEventListener("pointerdown", function (ev) {
    if (ev.target === EDITOR.canvas) edDeselect();
  });

  /* ---------- rich-text helpers ---------- */
  // remember the live text selection while editing
  document.addEventListener("selectionchange", function () {
    if (!ED.editingId) return;
    var node = EDITOR.canvas.querySelector('.ed-el[data-id="' + ED.editingId + '"]');
    if (!node) return;
    var content = node.querySelector(".ed-el-content");
    var sel = window.getSelection();
    if (sel && sel.rangeCount && content.contains(sel.anchorNode)) {
      ED.savedRange = sel.getRangeAt(0).cloneRange();
      edUpdateToolbar();
    }
  });

  function edEditingContent() {
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
  function edRangeIsActive(kind) {
    var n = edSelectionAnchorEl();
    var content = edEditingContent();
    if (!n || !content || !content.contains(n)) return false;
    var cs = window.getComputedStyle(n);
    if (kind === "bold") return (parseInt(cs.fontWeight, 10) || 400) >= 600 || cs.fontWeight === "bold";
    if (kind === "italic") return cs.fontStyle === "italic";
    if (kind === "underline") return (cs.textDecorationLine || cs.textDecoration || "").indexOf("underline") > -1;
    return false;
  }

  // context: are we formatting a text range (editing) or the whole box?
  function edContext() {
    return (ED.editingId && ED.editingId === ED.selectedId && ED.savedRange) ? "range" : "box";
  }

  /* ---------- toolbar: bold / italic / underline ---------- */
  function edToggle(kind) {
    var el = edFind(ED.selectedId);
    if (!el || el.type !== "text") return;
    if (edContext() === "range") {
      if (kind === "bold") edStyleSelection({ fontWeight: edRangeIsActive("bold") ? "normal" : "700" });
      if (kind === "italic") edStyleSelection({ fontStyle: edRangeIsActive("italic") ? "normal" : "italic" });
      if (kind === "underline") edStyleSelection({ textDecoration: edRangeIsActive("underline") ? "none" : "underline" });
    } else {
      el.styles[kind] = !el.styles[kind];
      var content = EDITOR.canvas.querySelector('.ed-el[data-id="' + el.id + '"] .ed-el-content');
      if (content) edApplyContentStyles(content, el);
    }
    edUpdateToolbar();
  }
  function edBtnMouseDownKeepFocus(e) { e.preventDefault(); }  // keep caret/selection
  [EDITOR.bold, EDITOR.italic, EDITOR.underline, EDITOR.colorBtn, EDITOR.fsDec, EDITOR.fsInc,
   EDITOR.alignL, EDITOR.alignC, EDITOR.alignR, EDITOR.ul, EDITOR.ol, EDITOR.indDec, EDITOR.indInc
  ].forEach(function (b) { if (b) b.addEventListener("mousedown", edBtnMouseDownKeepFocus); });
  EDITOR.bold.addEventListener("click", function () { edToggle("bold"); });
  EDITOR.italic.addEventListener("click", function () { edToggle("italic"); });
  EDITOR.underline.addEventListener("click", function () { edToggle("underline"); });

  /* ---------- paragraph helpers: align / list / indent ---------- */
  // The content node of whichever text element is active (editing OR selected).
  function edActiveContentEl() {
    var id = ED.editingId || ED.selectedId;
    if (!id) return null;
    var el = edFind(id);
    if (!el || el.type !== "text") return null;
    var node = EDITOR.canvas.querySelector('.ed-el[data-id="' + id + '"] .ed-el-content');
    return node || null;
  }
  function edCommitActiveContent() {
    var id = ED.editingId || ED.selectedId;
    var el = edFind(id);
    var content = edActiveContentEl();
    if (el && content) el.content = content.innerHTML;
  }
  // Normalize content so every top-level run of inline nodes lives in its own
  // block (div). Existing blocks are left in place; bare text/<span>/<br> beside
  // an (often empty) block would otherwise be unalignable. Returns leaf blocks.
  function edEnsureBlocks(content) {
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
    // otherwise render as a stray bullet/number. Always keep at least one block.
    while (leaves.length > 1) {
      var last = leaves[leaves.length - 1];
      if (!last.textContent.trim() && !last.querySelector("img")) { last.remove(); leaves.pop(); }
      else break;
    }
    return leaves;
  }
  // Blocks targeted by a paragraph op: the ones intersecting the live selection
  // when editing; otherwise the WHOLE element (applies to the selected block).
  function edSelectedBlocks() {
    var content = edActiveContentEl();
    if (!content) return [];
    var blocks = edEnsureBlocks(content);
    if (ED.editingId) {
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
  function edToggleList(tag) {
    var content = edActiveContentEl();
    if (!content) return;
    var blocks = edSelectedBlocks();
    if (!blocks.length) return;
    var TAG = tag.toUpperCase();

    // If every block is already an <li> inside a list of the SAME type -> unwrap
    var allInTarget = blocks.every(function (b) {
      var list = edAncestorList(b, content);
      return list && list.tagName === TAG && b.tagName === "LI";
    });
    if (allInTarget) {
      // unwrap: each <li> back to a <div>, then drop the now-empty list
      blocks.forEach(function (li) {
        var list = li.parentNode;
        var div = document.createElement("div");
        while (li.firstChild) div.appendChild(li.firstChild);
        if (li.style.textAlign) div.style.textAlign = li.style.textAlign;
        if (li.style.paddingLeft) div.style.paddingLeft = li.style.paddingLeft;
        list.parentNode.insertBefore(div, list);
        li.remove();
        if (!list.children.length) list.remove();
      });
    } else {
      var newList = document.createElement(tag);
      // marker color = current text color (matches selected text)
      newList.style.color = ED.currentColor || "#1a1a1a";
      // Insert before the source list (if the blocks already live in one) or
      // before the first block, so the new list is never nested in the old one.
      var anchor = edAncestorList(blocks[0], content) || blocks[0];
      anchor.parentNode.insertBefore(newList, anchor);
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

  /* ---------- keyboard shortcuts (Ctrl+Shift+L / E / R) ---------- */
  document.addEventListener("keydown", function (e) {
    if (!ED.editingId) return;
    if (!e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey) return;
    var k = e.key.toLowerCase();
    if (k === "l") { e.preventDefault(); edAlign("left"); }
    else if (k === "e") { e.preventDefault(); edAlign("center"); }
    else if (k === "r") { e.preventDefault(); edAlign("right"); }
  });

  /* ---------- toolbar: font size ---------- */
  function edCurrentFontSize() {
    if (edContext() === "range") {
      var n = edSelectionAnchorEl();
      if (n) return Math.round(parseFloat(window.getComputedStyle(n).fontSize)) || 16;
    }
    var el = edFind(ED.selectedId);
    if (el) return parseInt(el.styles.fontSize, 10) || 16;
    return 16;
  }
  function edSetFontSize(px) {
    px = Math.max(6, Math.min(300, px));
    ED.lastFs = px;
    EDITOR.fsVal.value = px;
    var el = edFind(ED.selectedId);
    if (!el || el.type !== "text") return;
    if (edContext() === "range") {
      edStyleSelection({ fontSize: px + "px" });
    } else {
      el.styles.fontSize = px + "px";
      var content = EDITOR.canvas.querySelector('.ed-el[data-id="' + el.id + '"] .ed-el-content');
      if (content) edApplyContentStyles(content, el);
    }
  }
  EDITOR.fsDec.addEventListener("click", function () { edSetFontSize(edCurrentFontSize() - 1); });
  EDITOR.fsInc.addEventListener("click", function () { edSetFontSize(edCurrentFontSize() + 1); });
  EDITOR.fsVal.addEventListener("focus", function () { ED.lastFs = parseInt(EDITOR.fsVal.value, 10) || ED.lastFs; });
  EDITOR.fsVal.addEventListener("change", function () {
    var v = parseInt(EDITOR.fsVal.value, 10);
    if (!v) return;
    edSetFontSize(v);
  });
  EDITOR.fsVal.addEventListener("blur", function () {
    // cleared and focused out -> revert to the pre-cleared value
    if (!EDITOR.fsVal.value.trim() || !parseInt(EDITOR.fsVal.value, 10)) {
      EDITOR.fsVal.value = ED.lastFs;
    }
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
  function edSyncColor(r, g, b) {
    r = clamp255(r); g = clamp255(g); b = clamp255(b);
    var hex = rgbToHex(r, g, b);
    ED.colorSyncing = true;
    EDITOR.rRange.value = r; EDITOR.rNum.value = r;
    EDITOR.gRange.value = g; EDITOR.gNum.value = g;
    EDITOR.bRange.value = b; EDITOR.bNum.value = b;
    EDITOR.hex.value = hex.toUpperCase();
    EDITOR.colorNative.value = hex;
    EDITOR.preview.style.background = hex;
    EDITOR.colorBtn.style.color = hex;
    ED.currentColor = hex;
    ED.colorSyncing = false;
  }
  function edApplyColorToText() {
    var el = edFind(ED.selectedId);
    if (!el || el.type !== "text") return;
    if (edContext() === "range") {
      edStyleSelection({ color: ED.currentColor });
    } else {
      el.styles.color = ED.currentColor;
      var content = EDITOR.canvas.querySelector('.ed-el[data-id="' + el.id + '"] .ed-el-content');
      if (content) edApplyContentStyles(content, el);
    }
    edUpdateToolbar();
  }
  function edOpenColorPanel() {
    // initialise from the current text/box color
    var rgb = hexToRgb(ED.currentColor) || { r: 0, g: 0, b: 0 };
    var el = edFind(ED.selectedId);
    if (el) {
      var c = (edContext() === "range")
        ? rgbStringToHex(window.getComputedStyle(edSelectionAnchorEl() || el).color)
        : el.styles.color;
      var parsed = hexToRgb(c); if (parsed) rgb = parsed;
    }
    edSyncColor(rgb.r, rgb.g, rgb.b);
    EDITOR.colorPanel.hidden = false;
  }
  function edCloseColorPanel() { if (EDITOR.colorPanel) EDITOR.colorPanel.hidden = true; }
  function rgbStringToHex(rgbStr) {
    var m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgbStr || "");
    if (!m) return ED.currentColor;
    return rgbToHex(+m[1], +m[2], +m[3]);
  }
  EDITOR.colorBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    if (EDITOR.colorPanel.hidden) edOpenColorPanel(); else edCloseColorPanel();
  });
  // close panel when clicking elsewhere
  document.addEventListener("pointerdown", function (e) {
    if (EDITOR.overlay.hidden || EDITOR.colorPanel.hidden) return;
    if (!EDITOR.colorPanel.contains(e.target) && e.target !== EDITOR.colorBtn) edCloseColorPanel();
  });
  // control listeners — sync live on input, apply to text on change
  function colorFromRgbInputs() {
    edSyncColor(EDITOR.rRange.value, EDITOR.gRange.value, EDITOR.bRange.value);
  }
  ["rRange", "gRange", "bRange"].forEach(function (k) {
    EDITOR[k].addEventListener("input", function () {
      if (ED.colorSyncing) return;
      // mirror the matching number live
      edSyncColor(EDITOR.rRange.value, EDITOR.gRange.value, EDITOR.bRange.value);
    });
    EDITOR[k].addEventListener("change", edApplyColorToText);
  });
  [["rNum", "rRange"], ["gNum", "gRange"], ["bNum", "bRange"]].forEach(function (pair) {
    EDITOR[pair[0]].addEventListener("input", function () {
      if (ED.colorSyncing) return;
      edSyncColor(EDITOR.rNum.value, EDITOR.gNum.value, EDITOR.bNum.value);
    });
    EDITOR[pair[0]].addEventListener("change", edApplyColorToText);
  });
  EDITOR.colorNative.addEventListener("input", function () {
    if (ED.colorSyncing) return;
    var rgb = hexToRgb(EDITOR.colorNative.value); if (rgb) edSyncColor(rgb.r, rgb.g, rgb.b);
  });
  EDITOR.colorNative.addEventListener("change", edApplyColorToText);
  EDITOR.hex.addEventListener("input", function () {
    if (ED.colorSyncing) return;
    var rgb = hexToRgb(EDITOR.hex.value); if (rgb) edSyncColor(rgb.r, rgb.g, rgb.b);
  });
  EDITOR.hex.addEventListener("change", function () {
    var rgb = hexToRgb(EDITOR.hex.value);
    if (rgb) { edSyncColor(rgb.r, rgb.g, rgb.b); edApplyColorToText(); }
  });

  /* ---------- toolbar visibility + active state ---------- */
  function edSetToolsVisible(on) {
    EDITOR.tools.classList.toggle("is-visible", !!on);
    EDITOR.tools.setAttribute("aria-hidden", on ? "false" : "true");
    if (!on) edCloseColorPanel();
  }
  function edUpdateToolbar() {
    var el = edFind(ED.selectedId);
    if (!el || el.type !== "text") return;
    EDITOR.fsVal.value = edCurrentFontSize();
    var ctx = edContext();
    var bActive, iActive, uActive, color;
    if (ctx === "range") {
      bActive = edRangeIsActive("bold");
      iActive = edRangeIsActive("italic");
      uActive = edRangeIsActive("underline");
      var n = edSelectionAnchorEl();
      color = n ? rgbStringToHex(window.getComputedStyle(n).color) : el.styles.color;
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
    var node = ED.editingId
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
    edOpenConfirm("discard", "Zpět bez změn", "Změny provedené v editoru nebudou uloženy. Pokračovat?");
  });
  EDITOR.backChange.addEventListener("click", function () {
    edOpenConfirm("save", "Zpět se změnami", "Rozvržení se převezme do formuláře článku. Pokračovat?");
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
    } else if (action === "save") {
      edExitEdit();
      edCommitToForm();
      edClose();
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
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

  // launch the editor from the article form (opens in preview state)
  var openEditorBtn = document.querySelector("#open-editor-btn");
  if (openEditorBtn) openEditorBtn.addEventListener("click", edOpen);
  // sidebar button -> enter full-screen visual editor mode
  var enterVisualBtn = document.querySelector("#ed-enter-visual");
  if (enterVisualBtn) enterVisualBtn.addEventListener("click", edEnterVisual);

  // sidebar "Vydat" -> commit layout + metadata to the form and save via the API
  var publishBtn = document.querySelector("#ed-publish");
  if (publishBtn) publishBtn.addEventListener("click", function () {
    edExitEdit();
    edCommitToForm();
    edClose();
    if (form.requestSubmit) form.requestSubmit();
    else form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  });
  // sidebar "Smazat" -> confirm + delete
  var sideDeleteBtn = document.querySelector("#ed-side-delete");
  if (sideDeleteBtn) sideDeleteBtn.addEventListener("click", function () {
    edOpenConfirm("delete", "Smazat příspěvek", "Tento příspěvek bude trvale smazán. Pokračovat?");
  });

  /* ============================================================
     Boot
     ============================================================ */
  fDate.value = today();

  // Probe session state — if cookie is missing, show login immediately.
  api("/api/login")
    .then(function (info) {
      if (info && info.loggedIn) showShell();
      else showLogin();
    })
    .catch(function () { showLogin(); });
})();
