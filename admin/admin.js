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
    fDate.value = today();
    pendingImageUrl = "";
    updatePreview("");
    formTitle.textContent = "Nový příspěvek";
    submitBtn.textContent = "Vytvořit";
  }
  function populateForm(article) {
    fId.value       = article.id;
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
    var payload = {
      title:   fTitle.value,
      body:    fBody.value,
      image:   pendingImageUrl || fImageUrl.value || "",
      authors: fAuthors.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean),
      tags:    fTags.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean),
      date:    fDate.value || today(),
      kind:    fKind.value === "comic" ? "comic" : "article"
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
     Table
     ============================================================ */
  function refreshTable() {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Načítám…</td></tr>';
    api("/api/articles")
      .then(function (items) {
        if (!items || items.length === 0) {
          tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Zatím žádné příspěvky. Vytvořte první v levém panelu.</td></tr>';
          return;
        }
        tbody.innerHTML = items.map(function (a) {
          var thumb = a.image
            ? '<span class="thumb" style="background-image:url(\'' + a.image.replace(/'/g, "\\'") + '\')"></span>'
            : '<span class="thumb"></span>';
          // Base size = the article record itself (JSON, UTF-8 bytes).
          // The image size is added asynchronously below (HEAD request).
          var baseBytes = textBytes(JSON.stringify(a));
          return (
            '<tr data-id="' + escapeHtml(a.id) + '">' +
              "<td>" + thumb + "</td>" +
              "<td><strong>" + escapeHtml(a.title) + "</strong><br>" +
                '<span style="color:var(--muted); font-size:0.8rem;">' + escapeHtml((a.tags || []).join(", ")) + "</span></td>" +
              "<td>" + escapeHtml((a.authors || []).join(", ")) + "</td>" +
              "<td>" + escapeHtml(a.date || "") + "</td>" +
              '<td class="size-cell" data-base="' + baseBytes + '" title="Záznam + obrázek">' + formatBytes(baseBytes) + "</td>" +
              '<td><div class="row-actions">' +
                '<button type="button" data-action="edit">Upravit</button>' +
                '<button type="button" data-action="view">Zobrazit</button>' +
                '<button type="button" data-action="delete" class="danger">Smazat</button>' +
              "</div></td>" +
            "</tr>"
          );
        }).join("");

        // Refine each size cell with the actual image byte size.
        items.forEach(function (a) {
          if (!a.image) return;
          var cell = tbody.querySelector('tr[data-id="' + (window.CSS && CSS.escape ? CSS.escape(a.id) : a.id) + '"] .size-cell');
          if (!cell) return;
          fetchImageBytes(a.image).then(function (imgBytes) {
            var base = parseInt(cell.getAttribute("data-base"), 10) || 0;
            if (imgBytes != null) {
              cell.textContent = formatBytes(base + imgBytes);
              cell.title = "Záznam " + formatBytes(base) + " + obrázek " + formatBytes(imgBytes);
            } else {
              // Couldn't read image size (e.g. external host without CORS).
              cell.textContent = formatBytes(base) + " + obr.";
              cell.title = "Velikost obrázku nelze zjistit (externí zdroj)";
            }
          });
        });
      })
      .catch(function (err) {
        if (err.status === 401) { showLogin(); return; }
        tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Chyba: ' + escapeHtml(err.message) + "</td></tr>";
      });
  }

  tbody.addEventListener("click", function (event) {
    var btn = event.target.closest("button[data-action]");
    if (!btn) return;
    var row = btn.closest("tr");
    var id = row && row.dataset.id;
    if (!id) return;
    var action = btn.dataset.action;

    if (action === "view") {
      window.open("/article.html?id=" + encodeURIComponent(id), "_blank");
      return;
    }

    if (action === "edit") {
      api("/api/articles?id=" + encodeURIComponent(id))
        .then(populateForm)
        .catch(function (err) { toast("Chyba: " + err.message); });
      return;
    }

    if (action === "delete") {
      if (!confirm("Opravdu smazat tento příspěvek?")) return;
      api("/api/articles?id=" + encodeURIComponent(id), { method: "DELETE" })
        .then(function () {
          if (fId.value === id) resetForm();
          toast("Příspěvek smazán.");
          refreshTable();
        })
        .catch(function (err) { toast("Chyba: " + err.message); });
    }
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
