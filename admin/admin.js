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

  /* ----- State ----- */
  var pendingImageUrl = "";  // resolved URL after a file upload OR a URL the user typed.

  /* ============================================================
     Helpers
     ============================================================ */
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function today() { return new Date().toISOString().slice(0, 10); }
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
    setTimeout(function () { loginPass.focus(); }, 0);
  }
  function showShell() {
    loginScreen.hidden = true;
    shell.hidden = false;
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
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Načítám…</td></tr>';
    api("/api/articles")
      .then(function (items) {
        if (!items || items.length === 0) {
          tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Zatím žádné příspěvky. Vytvořte první v levém panelu.</td></tr>';
          return;
        }
        tbody.innerHTML = items.map(function (a) {
          var thumb = a.image
            ? '<span class="thumb" style="background-image:url(\'' + a.image.replace(/'/g, "\\'") + '\')"></span>'
            : '<span class="thumb"></span>';
          return (
            '<tr data-id="' + escapeHtml(a.id) + '">' +
              "<td>" + thumb + "</td>" +
              "<td><strong>" + escapeHtml(a.title) + "</strong><br>" +
                '<span style="color:var(--muted); font-size:0.8rem;">' + escapeHtml((a.tags || []).join(", ")) + "</span></td>" +
              "<td>" + escapeHtml((a.authors || []).join(", ")) + "</td>" +
              "<td>" + escapeHtml(a.date || "") + "</td>" +
              '<td><div class="row-actions">' +
                '<button type="button" data-action="edit">Upravit</button>' +
                '<button type="button" data-action="view">Zobrazit</button>' +
                '<button type="button" data-action="delete" class="danger">Smazat</button>' +
              "</div></td>" +
            "</tr>"
          );
        }).join("");
      })
      .catch(function (err) {
        if (err.status === 401) { showLogin(); return; }
        tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Chyba: ' + escapeHtml(err.message) + "</td></tr>";
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
