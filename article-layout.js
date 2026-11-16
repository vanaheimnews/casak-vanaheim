/* ============================================================
 * VNArticle — the two-zone article page, shared by the editor
 * (admin/admin.js) and the reader page (article.html) so both lay an
 * article out with the SAME code and look 1:1.
 *
 * An article page is 820px wide and has two zones:
 *   hero  the black top section, heroHeight px tall: title, thumbnail,
 *         date, authors and one badge per tag
 *   body  the white section below it: the article itself
 * Every element has zone: "hero" or none (= body). y is measured from
 * the top of the page, so a body element always has y >= heroHeight.
 *
 * Hero elements that mirror the article's data carry a role:
 *   role "thumb"    image  — the thumbnail (article.image)
 *   role "date"     text   — the publish date         (text is locked)
 *   role "authors"  text   — the authors, ", " joined (text is locked)
 *   role "tag"      badge  — one per tag, el.tag = its name
 * The title is the element with isTitle (also in the hero).
 * Their text always comes from the article's data; the element keeps
 * the position, size and formatting the editor gave it.
 *
 * prepare(article) returns { elements, heroHeight } ready to draw:
 *   - an article saved before the zones existed (no heroHeight) gets a
 *     default hero built from its data, its old blocks become the body;
 *   - an article saved with zones is only reconciled with its current
 *     data (a tag renamed or deleted in „Upravit filtry", …).
 * Requires a browser (it measures text) and sanitize.js for nothing.
 * ============================================================ */
(function () {
  "use strict";

  var W = 820;             // page width
  var PAD = 40;            // margin of the default hero layout
  var HERO_MIN = 120;
  var MONTHS = ["ledna", "února", "března", "dubna", "května", "června",
                "července", "srpna", "září", "října", "listopadu", "prosince"];

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function uid() { return "el-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7); }
  function nameKey(n) {
    return String(n == null ? "" : n).normalize("NFC").replace(/\s+/g, " ").trim().toLocaleLowerCase("cs");
  }
  // "2026-10-30" or "2026-10-30T08:00" -> "30. října 2026" (a calendar date, no time zone maths)
  function formatDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ""));
    if (!m || !MONTHS[+m[2] - 1]) return "";
    return (+m[3]) + ". " + MONTHS[+m[2] - 1] + " " + m[1];
  }
  function textStyles(over) {
    var s = { fontSize: "16px", color: "#1a1a1a", bold: false, italic: false, underline: false, align: "left" };
    for (var k in (over || {})) s[k] = over[k];
    return s;
  }
  function isLocked(el) { return !!el && (el.role === "date" || el.role === "authors" || el.role === "tag"); }

  /* ---------- measuring (same box model as .ed-el-content / .ac-el--text) ---------- */
  function measureText(html, styles, width) {
    var d = document.createElement("div"), s = styles || {};
    d.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;box-sizing:border-box;" +
      "padding:6px 8px;white-space:pre-wrap;word-wrap:break-word;";
    d.style.width = (+width || 100) + "px";
    if (s.fontFamily) d.style.fontFamily = String(s.fontFamily);
    d.style.fontSize = s.fontSize || "16px";
    d.style.fontWeight = s.bold ? "700" : "400";
    d.style.fontStyle = s.italic ? "italic" : "normal";
    d.innerHTML = html || "&nbsp;";
    document.body.appendChild(d);
    var h = d.offsetHeight;
    d.remove();
    return h;
  }
  function measureBadge(text) {
    var d = document.createElement("div");
    d.style.cssText = "position:absolute;left:-9999px;top:0;visibility:hidden;";
    var b = document.createElement("span");
    b.className = "vn-badge";
    b.textContent = text;
    d.appendChild(b);
    document.body.appendChild(d);
    var size = { w: Math.ceil(b.offsetWidth) || 60, h: Math.ceil(b.offsetHeight) || 26 };
    d.remove();
    return size;
  }
  // Height an element takes on the page (auto-height text is measured).
  function heightOf(el) {
    if (typeof el.height === "number") return el.height;
    if (+el.height > 0) return +el.height;
    if (el.role === "tag") return measureBadge(el.tag || "").h;
    if (el.type === "text") return measureText(el.content, el.styles, el.width);
    return 40;
  }
  function heroBottom(elements) {
    var b = 0;
    elements.forEach(function (el) {
      if (el.zone === "hero") b = Math.max(b, (+el.y || 0) + heightOf(el));
    });
    return b;
  }

  /* ---------- data-driven hero elements ---------- */
  // role "thumb": data = url; "date": data = date string; "authors": data = [names]; "tag": data = name
  function makeMeta(role, data) {
    var el = { id: uid(), zone: "hero", role: role, x: PAD, y: PAD };
    if (role === "thumb") {
      el.type = "image"; el.content = data; el.width = 320; el.height = 220; el.styles = textStyles();
    } else if (role === "tag") {
      el.type = "text"; el.tag = data; el.content = esc(data);
      el.width = measureBadge(data).w; el.height = "auto"; el.styles = textStyles();
    } else if (role === "date") {
      el.type = "text"; el.value = data; el.content = esc(formatDate(data));
      el.width = 280; el.height = "auto"; el.styles = textStyles({ fontSize: "15px", color: "#aab6be" });
    } else {
      el.type = "text"; el.names = data.slice(); el.content = esc(data.join(", "));
      el.width = 380; el.height = "auto"; el.styles = textStyles({ fontSize: "15px", color: "#ffffff", bold: true });
    }
    return el;
  }
  // Text / picture of a data-driven element from the article's data.
  function fillMeta(el, meta) {
    if (el.role === "date") { el.value = meta.date; el.content = esc(formatDate(meta.date)); }
    else if (el.role === "authors") { el.names = meta.authors.slice(); el.content = esc(meta.authors.join(", ")); }
    else if (el.role === "tag") { el.content = esc(el.tag); el.width = measureBadge(el.tag).w; }
    else if (el.role === "thumb" && el.content !== meta.image) { el.content = meta.image; delete el.crop; }
  }
  /* Where a hero element added later goes: a tag next to the last tag
     (next row when the line is full), anything else under the hero's
     content. The caller grows the hero if it no longer fits. */
  function placeNew(elements, el) {
    var tags = elements.filter(function (e) { return e.role === "tag" && e !== el; });
    if (el.role === "tag" && tags.length) {
      var last = tags[tags.length - 1], x = (+last.x || 0) + (+last.width || 60) + 8;
      if (x + el.width <= W - PAD) { el.x = x; el.y = +last.y || 0; return; }
      var left = Math.min.apply(null, tags.map(function (t) { return +t.x || 0; }));
      el.x = left; el.y = (+last.y || 0) + heightOf(last) + 8;
      return;
    }
    var title = elements.filter(function (e) { return e.isTitle; })[0];
    el.x = title && title.zone === "hero" ? Math.max(0, Math.min(+title.x || PAD, W - (+el.width || 100))) : PAD;
    el.y = Math.round(heroBottom(elements.filter(function (e) { return e !== el; })) + 8);
  }

  /* The default hero: thumbnail on the left (when there is one), next to
     it the tags, the title, the date and the authors. Returns the new
     elements (the title is moved in place) and the hero's height. */
  function buildHero(title, meta) {
    var out = [], hasThumb = !!meta.image;
    var colX = hasThumb ? PAD + 320 + 30 : PAD, colW = W - colX - PAD, y = PAD;
    if (hasThumb) out.push(makeMeta("thumb", meta.image));
    var x = colX, rowH = 0;
    meta.tags.forEach(function (name) {
      var el = makeMeta("tag", name), h = measureBadge(name).h;
      if (x > colX && x + el.width > colX + colW) { x = colX; y += rowH + 8; }
      el.x = x; el.y = y;
      x += el.width + 8; rowH = h;
      out.push(el);
    });
    if (meta.tags.length) y += rowH + 12;
    title.zone = "hero";
    title.x = colX - 8;                       // text boxes have 8px inner padding: the letters line up with the column
    title.y = y;
    title.width = colW + 16;
    title.height = "auto";
    title.styles = title.styles || textStyles({ fontSize: "34px", bold: true, color: "#ffffff" });
    // the title on the black hero is white by default — also colours set
    // inside its text (imported articles) give way, or it would be unreadable
    title.styles.color = "#ffffff";
    var t = document.createElement("template");
    t.innerHTML = title.content || "";
    Array.prototype.forEach.call(t.content.querySelectorAll("[style], font[color]"), function (n) {
      if (n.style) n.style.color = "";
      n.removeAttribute("color");
      if (n.getAttribute("style") === "") n.removeAttribute("style");
    });
    title.content = t.innerHTML;
    y += measureText(title.content, title.styles, title.width) + 2;
    if (meta.date) {
      var d = makeMeta("date", meta.date);
      d.x = colX - 8; d.y = y; d.width = Math.min(d.width, colW + 16);
      y += heightOf(d) - 4;
      out.push(d);
    }
    if (meta.authors.length) {
      var a = makeMeta("authors", meta.authors);
      a.x = colX - 8; a.y = y; a.width = colW + 16;
      y += heightOf(a);
      out.push(a);
    }
    return { els: out, height: Math.max(HERO_MIN, Math.round(Math.max(hasThumb ? PAD + 220 : 0, y) + PAD - 6)) };
  }

  /* Bring the data-driven elements of a saved hero in line with the
     article's current data (it changes outside the editor too: a tag or
     author renamed / deleted in „Upravit filtry"). */
  function reconcile(elements, meta) {
    var out = elements.filter(function (el) {
      if (el.role === "date") { if (!meta.date) return false; fillMeta(el, meta); }
      else if (el.role === "authors") { if (!meta.authors.length) return false; fillMeta(el, meta); }
      else if (el.role === "thumb") { if (!meta.image) return false; fillMeta(el, meta); }
      return true;
    });
    // tags: keep the badges whose tag still exists; pair the others in order
    // (a rename keeps its badge's place); drop what is left over
    var want = {}, have = {};
    meta.tags.forEach(function (t) { want[nameKey(t)] = t; });
    out.forEach(function (el) { if (el.role === "tag") have[nameKey(el.tag)] = 1; });
    var missing = meta.tags.filter(function (t) { return !have[nameKey(t)]; });
    out = out.filter(function (el) {
      if (el.role !== "tag") return true;
      var k = nameKey(el.tag);
      if (want[k]) { el.tag = want[k]; fillMeta(el, meta); return true; }
      if (!missing.length) return false;
      var oldW = +el.width || 0;
      el.tag = missing.shift();                    // renamed: the badge keeps its place
      fillMeta(el, meta);
      var grew = (+el.width || 0) - oldW;
      if (grew > 0) {                              // a longer name pushes the badges to its right
        elements.forEach(function (o) {
          if (o !== el && o.role === "tag" && Math.abs((+o.y || 0) - (+el.y || 0)) < 6 && (+o.x || 0) > (+el.x || 0)) o.x = (+o.x || 0) + grew;
        });
      }
      return true;
    });
    missing.forEach(function (t) {
      var el = makeMeta("tag", t);
      placeNew(out, el);
      out.push(el);
    });
    return out;
  }

  function metaOf(a) {
    return {
      image: String(a.image || "").trim(),
      date: String(a.date || ""),
      authors: Array.isArray(a.authors) ? a.authors.filter(Boolean) : [],
      tags: Array.isArray(a.tags) ? a.tags.filter(Boolean) : []
    };
  }

  /* article: { elements, heroHeight, title, body, image, date, authors, tags }
     -> { elements, heroHeight } (a copy; the article is not changed). */
  function prepare(article) {
    var a = article || {};
    var els = JSON.parse(JSON.stringify(Array.isArray(a.elements) ? a.elements : []))
      .filter(function (el) { return el && typeof el === "object"; });
    var heroH = +a.heroHeight > 0 ? Math.round(+a.heroHeight) : 0;
    var meta = metaOf(a);
    var title = els.filter(function (el) { return el.isTitle; })[0];
    if (!title) {
      // no layout at all (plain-text article): title + one text block
      title = { id: uid(), type: "text", isTitle: true, content: esc(a.title || "Nadpis článku"),
                x: 40, y: 24, width: 640, height: "auto", styles: textStyles({ fontSize: "34px", bold: true, color: "#ffffff" }) };
      els.unshift(title);
      var bodyText = String(a.body || "").trim();
      var hasText = els.some(function (el) { return el.type === "text" && !el.isTitle; });
      if (bodyText && !hasText) {
        els.push({ id: uid(), type: "text", isTitle: false, content: esc(bodyText).replace(/\n/g, "<br>"),
                   x: 40, y: 120, width: 740, height: "auto", styles: textStyles() });
      }
      heroH = 0;
    }
    if (!heroH) {
      // saved before the zones existed: the old blocks become the body, moved
      // up to close the gap the title leaves, below a default hero
      var body = els.filter(function (el) { return el !== title; });
      var top = body.length ? Math.min.apply(null, body.map(function (el) { return +el.y || 0; })) : 0;
      var shift = Math.max(0, top - 24);
      var hero = buildHero(title, meta);
      heroH = hero.height;
      body.forEach(function (el) {
        delete el.zone; delete el.role;
        el.y = Math.round((+el.y || 0) - shift + heroH);
      });
      els = [title].concat(hero.els, body);
    } else {
      els = reconcile(els, meta);
      var need = Math.ceil(heroBottom(els));
      if (need > heroH) {                      // e.g. a longer tag name: the hero grows, the body moves down
        var delta = need + 8 - heroH;
        els.forEach(function (el) { if (el.zone !== "hero") el.y = (+el.y || 0) + delta; });
        heroH += delta;
      }
    }
    return { elements: els, heroHeight: heroH };
  }

  window.VNArticle = {
    W: W, PAD: PAD, HERO_MIN: HERO_MIN,
    prepare: prepare,
    reconcile: reconcile,
    makeMeta: makeMeta,
    fillMeta: fillMeta,
    placeNew: placeNew,
    heroBottom: heroBottom,
    heightOf: heightOf,
    isLocked: isLocked,
    formatDate: formatDate,
    nameKey: nameKey
  };
})();
