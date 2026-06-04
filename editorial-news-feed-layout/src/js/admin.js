/* ============================================================
 * admin.js — admin dashboard controller
 * ------------------------------------------------------------
 * Login gate, article create/edit form, and list manager.
 * Talks to StorageService and AuthService only.
 * ============================================================ */
(function () {
  "use strict";

  // ---------- DOM refs ----------
  var loginModal     = document.querySelector("#login-modal");
  var loginForm      = document.querySelector("#login-form");
  var loginPassword  = document.querySelector("#login-password");
  var loginError     = document.querySelector("#login-error");
  var logoutBtn      = document.querySelector("#logout-btn");

  var mainEl         = document.querySelector("#main");
  var formTitle      = document.querySelector("#form-title");
  var form           = document.querySelector("#article-form");
  var fId            = document.querySelector("#article-id");
  var fTitle         = document.querySelector("#f-title");
  var fBody          = document.querySelector("#f-body");
  var fImageUrl      = document.querySelector("#f-image-url");
  var fImageFile     = document.querySelector("#f-image-file");
  var fAuthor        = document.querySelector("#f-author");
  var fDate          = document.querySelector("#f-date");
  var fCategories    = document.querySelector("#f-categories");
  var fVariant       = document.querySelector("#f-variant");
  var imagePreview   = document.querySelector("#image-preview");
  var submitBtn      = document.querySelector("#submit-btn");
  var resetBtn       = document.querySelector("#reset-btn");
  var tbody          = document.querySelector("#article-tbody");
  var toastEl        = document.querySelector("#toast");

  // In-memory cache of the Base64 string for an uploaded file.
  var uploadedImageData = "";

  // ============================================================
  // Auth flow
  // ============================================================
  function showApp() {
    loginModal.hidden = true;
    mainEl.hidden = false;
    renderTable();
  }
  function showLogin() {
    loginModal.hidden = false;
    mainEl.hidden = true;
    setTimeout(function () { loginPassword.focus(); }, 0);
  }

  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (AuthService.login(loginPassword.value)) {
      loginError.textContent = "";
      loginPassword.value = "";
      showApp();
    } else {
      loginError.textContent = "Nesprávné heslo.";
      loginPassword.select();
    }
  });

  logoutBtn.addEventListener("click", function () {
    AuthService.logout();
    showLogin();
  });

  // ============================================================
  // Form: image handling
  // ============================================================
  function updatePreview() {
    var src = uploadedImageData || fImageUrl.value.trim();
    if (src) {
      imagePreview.style.backgroundImage = "url('" + src.replace(/'/g, "\\'") + "')";
      imagePreview.hidden = false;
    } else {
      imagePreview.hidden = true;
    }
  }

  fImageUrl.addEventListener("input", function () {
    // Typing a URL clears any previously chosen file.
    if (fImageUrl.value.trim()) {
      uploadedImageData = "";
      fImageFile.value = "";
    }
    updatePreview();
  });

  fImageFile.addEventListener("change", function () {
    var file = fImageFile.files && fImageFile.files[0];
    if (!file) { uploadedImageData = ""; updatePreview(); return; }
    var reader = new FileReader();
    reader.onload = function (ev) {
      uploadedImageData = ev.target.result;   // Base64 data URI
      fImageUrl.value = "";                   // URL field cleared
      updatePreview();
    };
    reader.readAsDataURL(file);
  });

  // ============================================================
  // Form: reset + populate
  // ============================================================
  function resetForm() {
    form.reset();
    fId.value = "";
    fAuthor.value = "Vanaheim";
    fDate.value = new Date().toISOString().slice(0, 10);
    uploadedImageData = "";
    updatePreview();
    formTitle.textContent = "Nový příspěvek";
    submitBtn.textContent = "Vytvořit";
  }

  function populateForm(article) {
    fId.value         = article.id;
    fTitle.value      = article.title;
    fBody.value       = article.body;
    fAuthor.value     = article.author || "Vanaheim";
    fDate.value       = article.date || "";
    fCategories.value = article.categories || "";
    fVariant.value    = article.variant || "default";

    // Distinguish a Base64 image from a regular URL.
    if (article.image && article.image.indexOf("data:") === 0) {
      uploadedImageData = article.image;
      fImageUrl.value = "";
    } else {
      uploadedImageData = "";
      fImageUrl.value = article.image || "";
    }
    fImageFile.value = "";
    updatePreview();

    formTitle.textContent = "Upravit příspěvek";
    submitBtn.textContent = "Uložit změny";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  resetBtn.addEventListener("click", resetForm);

  // ============================================================
  // Form: submit (create or update)
  // ============================================================
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!fTitle.value.trim()) {
      toast("Název je povinný.");
      fTitle.focus();
      return;
    }

    var payload = {
      title:      fTitle.value,
      body:       fBody.value,
      image:      uploadedImageData || fImageUrl.value,
      categories: fCategories.value,
      author:     fAuthor.value,
      date:       fDate.value || new Date().toISOString().slice(0, 10),
      variant:    fVariant.value
    };

    if (fId.value) {
      StorageService.update(fId.value, payload);
      toast("Příspěvek byl uložen.");
    } else {
      StorageService.create(payload);
      toast("Příspěvek byl vytvořen.");
    }

    resetForm();
    renderTable();
  });

  // ============================================================
  // Table rendering
  // ============================================================
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function renderTable() {
    var items = StorageService.list();
    if (items.length === 0) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Zatím žádné příspěvky. Vytvořte první výše.</td></tr>';
      return;
    }
    tbody.innerHTML = items.map(function (a) {
      var thumb = a.image
        ? '<span class="thumb" style="background-image:url(\'' + a.image.replace(/'/g, "\\'") + '\')"></span>'
        : '<span class="thumb"></span>';
      return (
        "<tr data-id=\"" + escapeHtml(a.id) + "\">" +
          "<td>" + thumb + "</td>" +
          "<td><strong>" + escapeHtml(a.title) + "</strong><br>" +
            "<span style=\"color:var(--grey); font-size:0.8rem;\">" + escapeHtml(a.categories || "") + "</span></td>" +
          "<td>" + escapeHtml(a.author || "") + "</td>" +
          "<td>" + escapeHtml(a.date || "") + "</td>" +
          "<td><div class=\"row-actions\">" +
            "<button type=\"button\" data-action=\"edit\">Upravit</button>" +
            "<button type=\"button\" data-action=\"delete\" class=\"danger\">Smazat</button>" +
          "</div></td>" +
        "</tr>"
      );
    }).join("");
  }

  tbody.addEventListener("click", function (event) {
    var btn = event.target.closest("button[data-action]");
    if (!btn) return;
    var row = btn.closest("tr");
    var id = row && row.dataset.id;
    if (!id) return;

    if (btn.dataset.action === "edit") {
      var article = StorageService.get(id);
      if (article) populateForm(article);
    } else if (btn.dataset.action === "delete") {
      var target = StorageService.get(id);
      var name = target ? target.title : "tento příspěvek";
      if (confirm('Opravdu smazat „' + name + '"?')) {
        StorageService.remove(id);
        // If we were editing it, clear the form.
        if (fId.value === id) resetForm();
        renderTable();
        toast("Příspěvek byl smazán.");
      }
    }
  });

  // ============================================================
  // Toast
  // ============================================================
  var toastTimer = null;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("is-visible");
    }, 2200);
  }

  // ============================================================
  // Boot
  // ============================================================
  fDate.value = new Date().toISOString().slice(0, 10);

  if (AuthService.isLoggedIn()) {
    showApp();
  } else {
    showLogin();
  }
})();
