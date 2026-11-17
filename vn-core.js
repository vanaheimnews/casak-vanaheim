/* ============================================================
 * VN — small helpers shared by every page: the public site
 * (script.js), the article page (article.js), the admin
 * (admin/admin.js) and the two layout modules. Load it first.
 * No dependencies; applyBackground() uses sanitize.js (VNSafe)
 * when it is called.
 * ============================================================ */
(function () {
  "use strict";

  var MONTHS = ["ledna", "února", "března", "dubna", "května", "června",
                "července", "srpna", "září", "října", "listopadu", "prosince"];

  /* ---------- text ---------- */
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  // Does an HTML string show anything — text or a picture? (An emptied
  // editor leaves "<div><br></div>" or a zero-width space behind.)
  function hasContent(html) {
    var t = document.createElement("template");
    t.innerHTML = html;
    return (t.content.textContent || "").replace(/[\s\u200B]/g, "") !== "" || !!t.content.querySelector("img");
  }

  /* ---------- tag / author names ----------
     Two names are the same entry when they match after NFC, collapsed
     spaces and lower-casing — the same rule as api/_taxonomy.js. */
  function cleanName(n) { return String(n == null ? "" : n).normalize("NFC").replace(/\s+/g, " ").trim(); }
  function nameKey(n) { return cleanName(n).toLocaleLowerCase("cs"); }
  // How many articles use each name of `list` ("tags" | "authors") -> { nameKey: count }
  function countNames(articles, list) {
    var counts = {};
    articles.forEach(function (a) {
      var seen = {};
      (a[list] || []).forEach(function (n) {
        var k = nameKey(n);
        if (!seen[k]) { seen[k] = 1; counts[k] = (counts[k] || 0) + 1; }
      });
    });
    return counts;
  }
  // The names the articles themselves use, A–Z (until the global lists are loaded).
  function namesUsed(articles, list) {
    var seen = {}, out = [];
    articles.forEach(function (a) {
      (a[list] || []).forEach(function (n) { if (!seen[nameKey(n)]) { seen[nameKey(n)] = 1; out.push(n); } });
    });
    return out.sort(function (a, b) { return a.localeCompare(b, "cs"); });
  }
  /* The tick-box list of a filter section ("Filtrovat"): one entry per
     name with its article count. isOn(key) says whether it is ticked;
     disableEmpty greys out entries no article uses (public site only). */
  function facetHtml(names, counts, isOn, disableEmpty) {
    if (!names.length) return '<span class="tag-list-empty">Zatím nic.</span>';
    return names.map(function (n) {
      var k = nameKey(n), c = counts[k] || 0, on = !!isOn(k);
      return (
        '<label class="tag-checkbox' + (c || on ? "" : " is-empty") + '">' +
          '<input type="checkbox" value="' + escapeHtml(k) + '"' + (on ? " checked" : "") +
            (disableEmpty && !c && !on ? " disabled" : "") + ">" +
          "<span>" + escapeHtml(n) + ' <span class="tag-count">(' + c + ")</span></span>" +
        "</label>"
      );
    }).join("");
  }

  /* ---------- articles ---------- */
  // "YYYY-MM-DD…" is a calendar date — build it in LOCAL time. new Date(iso)
  // means UTC midnight, which showed the previous day west of UTC.
  function formatDate(iso) {
    if (!iso) return "";
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    var d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.getDate() + ". " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }
  // Newest first: the exact publish time when known, else the calendar date.
  function publishKey(a) { return String(a.publishAt || a.date || ""); }
  function byNewest(a, b) { return publishKey(b).localeCompare(publishKey(a)); }
  function kindLabel(a) { return a.kind === "comic" ? "Komiks" : "Článek"; }
  function uid(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- network ---------- */
  // GET a JSON API; rejects with Error("API <status>") when the answer is not OK.
  function getJson(url, options) {
    return fetch(url, options).then(function (r) {
      if (!r.ok) throw new Error("API " + r.status);
      return r.json();
    });
  }

  /* ---------- page background ----------
     Set in the admin: a cover image (wins) or a hex colour. An empty
     background clears both; `has-bg` lets the stylesheet add padding. */
  function applyBackground(node, bg) {
    if (!node || !bg) return;
    var img = bg.image ? VNSafe.cssUrl(bg.image) : "";
    if (img) {
      node.style.backgroundImage = img;
      node.style.backgroundSize = "cover";
      node.style.backgroundPosition = "center";
    } else {
      node.style.backgroundImage = "";
    }
    var color = /^#[0-9a-f]{3,8}$/i.test(bg.color || "") ? bg.color : "";
    node.style.backgroundColor = color;
    node.classList.toggle("has-bg", !!(img || color));
  }

  window.VN = {
    MONTHS: MONTHS,
    escapeHtml: escapeHtml,
    hasContent: hasContent,
    cleanName: cleanName,
    nameKey: nameKey,
    countNames: countNames,
    namesUsed: namesUsed,
    facetHtml: facetHtml,
    formatDate: formatDate,
    publishKey: publishKey,
    byNewest: byNewest,
    kindLabel: kindLabel,
    uid: uid,
    getJson: getJson,
    applyBackground: applyBackground
  };
})();
