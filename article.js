/* ============================================================
 * Article page (article.html) — loads one article and draws it
 * exactly as the editor shows it: the black hero (title, thumbnail,
 * date, authors, tag badges) and under it the white body, laid out
 * by the same code as the editor (VNArticle.prepare).
 * Requires vn-core.js (VN), sanitize.js (VNSafe), home-layout.js
 * (VNHome) and article-layout.js (VNArticle).
 * ============================================================ */
(function () {
  "use strict";

  /* The editor's page is VNArticle.W px wide; older articles may hold
     blocks placed further right (the editor used to be wider), so the
     public canvas grows to include every block, then scales to fit the
     column. Below FLOW_BELOW px the blocks are shown as one readable
     column in reading order instead — scaling would make text tiny. */
  var FLOW_BELOW = 560;
  var BACK_LINK = '<a class="article-back" href="./#articles">← Zpět na příspěvky</a>';
  var root = document.querySelector("#article-root");

  /* ============================================================
     DRAWING — the two zones
     ============================================================ */
  /* One zone as a canvas: its blocks positioned exactly as in the
     editor (y measured from offsetY, the top of the zone). */
  function buildCanvas(els, a, canvasW, offsetY, zoneClass, imgNo) {
    var canvas = document.createElement("div");
    canvas.className = "article-canvas " + zoneClass;
    canvas.style.width = canvasW + "px";
    // DOM in reading order (top->bottom, left->right) for the flow layout
    // and screen readers; z-index reproduces the editor's layers.
    var ordered = els.map(function (el, i) { return { el: el, i: i }; })
      .sort(function (p, q) {
        return ((+p.el.y || 0) - (+q.el.y || 0)) || ((+p.el.x || 0) - (+q.el.x || 0));
      });
    ordered.forEach(function (p) {
      var el = p.el, badge = el.role === "tag";
      var node = document.createElement(el.isTitle ? "h1" : "div");
      node.className = "ac-el ac-el--" + el.type + (el.isTitle ? " ac-title" : "") + (badge ? " ac-el--badge" : "");
      node.style.left = (+el.x || 0) + "px";
      node.style.top = ((+el.y || 0) - offsetY) + "px";
      if (!badge) node.style.width = (+el.width || 0) + "px";
      node.style.zIndex = typeof el.z === "number" ? el.z : p.i + 1;
      if (el.height && el.height !== "auto") {
        node.style.height = el.height + "px";
        node.classList.add("has-fixed-h");
      }
      if (el.type === "image") {
        var src = VNSafe.url(el.content, { image: true });
        if (!src) return;
        imgNo.n++;
        var alt = (a.title ? a.title + " — " : "") + (el.role === "thumb" ? "náhledový obrázek" : "obrázek " + imgNo.n);
        var crop = VNSafe.cropRect(el.crop);      // „Oříznout" in the editor
        if (crop) {
          node.appendChild(VNSafe.croppedImage(src, crop, alt));
        } else {
          var img = document.createElement("img");
          img.src = src;
          if (offsetY) img.loading = "lazy";       // the hero is on screen at once
          img.alt = alt;
          node.appendChild(img);
        }
      } else if (el.type === "embed") {
        // video / social post: the stored link is re-validated and the
        // player URL rebuilt by VNSafe.embed — plays inline in the article
        var info = VNSafe.embed(el.content);
        if (!info) return;
        node.appendChild(VNSafe.embedFrame(info, (a.title ? a.title + " — " : "") + info.label));
        // keeps the block's shape in the one-column phone layout
        var w = +el.width || info.w, h = +el.height || info.h;
        node.style.aspectRatio = w + " / " + h;
      } else if (el.type === "file") {
        var href = VNSafe.url(el.content);
        if (!href) return;
        var link = document.createElement("a");
        link.className = "ac-file";
        link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer";
        link.textContent = "📄 " + (el.name || "Dokument PDF");
        node.appendChild(link);
      } else if (badge) {
        var pill = document.createElement("span");
        pill.className = "vn-badge";
        pill.textContent = el.tag || "";
        node.appendChild(pill);
      } else {
        node.innerHTML = VNSafe.html(el.content);
        VNArticle.applyTextStyles(node, el.styles);
      }
      canvas.appendChild(node);
    });
    return canvas;
  }

  /* The article as the editor shows it. Articles saved before the two
     zones existed get the default hero from VNArticle.prepare — the same
     one the editor shows for them. */
  function renderArticle(a, heroWrap, bodyWrap) {
    var lay = VNArticle.prepare(a);
    var canvasW = VNArticle.W;
    lay.elements.forEach(function (el) {
      var right = (+el.x || 0) + (+el.width || 0);
      if (right > canvasW) canvasW = right;      // older, wider layouts
    });
    var imgNo = { n: 0 };
    var hero = buildCanvas(lay.elements.filter(function (el) { return el.zone === "hero"; }),
                           a, canvasW, 0, "article-canvas--hero", imgNo);
    var body = buildCanvas(lay.elements.filter(function (el) { return el.zone !== "hero"; }),
                           a, canvasW, lay.heroHeight, "article-canvas--body", imgNo);
    VN.applyBackground(body, a.background);      // page background from the editor
    heroWrap.innerHTML = "";
    heroWrap.appendChild(hero);
    bodyWrap.innerHTML = "";
    bodyWrap.appendChild(body);
    var doLayout = function () { layoutZones(heroWrap, hero, lay.heroHeight, bodyWrap, body, canvasW); };
    doLayout();
    window.addEventListener("resize", doLayout);
    // the column itself changing width (rotation, split screen) re-lays out too
    if (window.ResizeObserver) new ResizeObserver(doLayout).observe(bodyWrap);
    // re-measure once pictures and fonts have loaded (auto-height blocks may change)
    Array.prototype.forEach.call(document.querySelectorAll(".article-canvas img"), function (im) {
      if (!im.complete) im.addEventListener("load", doLayout);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(doLayout);
  }
  function contentBottom(canvas) {
    var h = 0;
    Array.prototype.forEach.call(canvas.children, function (n) {
      var b = n.offsetTop + n.offsetHeight;
      if (b > h) h = b;
    });
    return h;
  }
  // Both zones share one scale (the column's width); phones get one readable column.
  function layoutZones(heroWrap, hero, heroH, bodyWrap, body, canvasW) {
    var avail = bodyWrap.clientWidth || canvasW;
    var flow = avail < FLOW_BELOW;
    [hero, body].forEach(function (c) {
      c.classList.toggle("article-canvas--flow", flow);
      c.style.transform = "none";
    });
    if (flow) {
      hero.style.height = ""; heroWrap.style.height = "";
      body.style.height = ""; bodyWrap.style.height = "";
      return;
    }
    var scale = Math.min(1, avail / canvasW);
    // hero: the height set in the editor (taller only if its text needs it here)
    var hh = Math.max(heroH, contentBottom(hero) + 8);
    var bh = contentBottom(body) + 40;
    [[hero, heroWrap, hh], [body, bodyWrap, bh]].forEach(function (z) {
      z[0].style.height = z[2] + "px";
      z[0].style.transformOrigin = "top left";
      z[0].style.transform = "scale(" + scale + ")";
      z[1].style.height = (z[2] * scale) + "px";
    });
  }

  /* ============================================================
     SEO — description, canonical URL, link-preview tags and
     schema.org data. Google runs this script when it indexes the page.
     ============================================================ */
  function setMeta(selector, attr, value) {
    var el = document.head.querySelector(selector);
    if (el && value) el.setAttribute(attr, value);
  }
  function setSeo(a) {
    var url = location.origin + "/article?id=" + encodeURIComponent(a.id);
    var text = VNHome.plainText(a);
    var desc = text ? (text.length > 155 ? text.slice(0, 152).replace(/\s+\S*$/, "") + "…" : text)
                    : "Článek ze školního magazínu Vanaheim News.";
    var firstImg = (a.elements || []).filter(function (el) { return el.type === "image"; })[0];
    var image = VNSafe.url(a.image || (firstImg && firstImg.content), { image: true });
    if (!/^https?:/i.test(image)) image = "";
    setMeta('meta[name="description"]', "content", desc);
    setMeta('link[rel="canonical"]', "href", url);
    setMeta('meta[property="og:title"]', "content", a.title);
    setMeta('meta[property="og:description"]', "content", desc);
    setMeta('meta[property="og:image"]', "content", image);
    var og = document.createElement("meta");
    og.setAttribute("property", "og:url"); og.setAttribute("content", url);
    document.head.appendChild(og);
    var ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.textContent = JSON.stringify({
      "@context": "https://schema.org", "@type": "Article",
      headline: a.title, description: desc, url: url, inLanguage: "cs",
      datePublished: a.publishAt || a.date, dateModified: a.updatedAt || a.publishAt || a.date,
      image: image || undefined,
      author: (a.authors || []).map(function (n) { return { "@type": "Person", name: n }; }),
      publisher: { "@type": "Organization", name: "Vanaheim News" }
    });
    document.head.appendChild(ld);
  }
  // Missing / unpublished article: tell search engines not to index the error page.
  function noIndex() {
    var m = document.createElement("meta");
    m.name = "robots"; m.content = "noindex";
    document.head.appendChild(m);
  }

  /* ============================================================
     SIDE PANELS — the posts the editors placed on the homepage, as
     compact cards beside the article. Same data and rules as the
     homepage itself: content.home.layout, or the default layout
     (pinned first, then the newest) until one is saved. Never
     blocks or breaks the article.
     ============================================================ */
  function loadReco(currentId) {
    Promise.all([VN.getJson("/api/content"), VN.getJson("/api/articles")])
      .then(function (res) {
        var content = res[0] || {}, list = Array.isArray(res[1]) ? res[1] : [];
        var layout = VNHome.normalize((content.home || {}).layout) || VNHome.defaultLayout(content, list);
        var byId = {}, seen = {}, picks = [];
        list.forEach(function (a) { byId[a.id] = a; });
        layout.rows.forEach(function (row) {
          row.blocks.forEach(function (b) {
            var a = b.kind === "post" ? byId[b.articleId] : null;     // only published posts are in the list
            if (!a || a.id === currentId || seen[a.id]) return;
            seen[a.id] = 1;
            picks.push(a);
          });
        });
        picks = picks.slice(0, 8);
        // up to four go right; more are split between both sides
        var right = picks.length <= 4 ? picks : picks.slice(0, Math.ceil(picks.length / 2));
        fillReco(document.querySelector("#reco-right"), right, "Doporučujeme");
        fillReco(document.querySelector("#reco-left"), picks.slice(right.length), "Další příspěvky");
      })
      .catch(function () { /* no side panel; the article is unaffected */ });
  }
  function fillReco(box, items, heading) {
    if (!box || !items.length) return;
    var h = document.createElement("h2");
    h.className = "reco-heading";
    h.textContent = heading;
    var listEl = document.createElement("div");
    listEl.className = "reco-list";
    items.forEach(function (a) {
      var card = document.createElement("a");
      card.className = "reco-card";
      card.href = "/article?id=" + encodeURIComponent(a.id);
      var src = VNHome.thumb(a);
      if (src) {
        var t = document.createElement("span");
        t.className = "reco-thumb";
        var im = document.createElement("img");
        im.src = src; im.alt = ""; im.loading = "lazy"; im.decoding = "async";
        t.appendChild(im);
        card.appendChild(t);
      }
      var name = document.createElement("span");
      name.className = "reco-name";
      name.textContent = a.title || "(bez názvu)";
      card.appendChild(name);
      listEl.appendChild(card);
    });
    box.appendChild(h);
    box.appendChild(listEl);
    box.hidden = false;
  }

  /* ============================================================
     LOAD
     ============================================================ */
  function showError(message) {
    noIndex();
    root.innerHTML = BACK_LINK + '<p class="error-state"></p>';
    root.lastChild.textContent = message;
  }

  var id = new URLSearchParams(location.search).get("id");
  if (!id) { showError("Chybí ID článku."); return; }

  fetch("/api/articles?id=" + encodeURIComponent(id))
    .then(function (r) {
      if (!r.ok) throw new Error("Článek nenalezen.");
      return r.json();
    })
    .then(function (a) {
      document.title = (a.title || "Článek") + " — Vanaheim News";
      setSeo(a);
      loadReco(a.id);
      root.innerHTML = '<div class="article-canvas-wrap" id="article-canvas-wrap"></div>' + BACK_LINK;
      document.querySelector("#article-heroband").hidden = false;
      renderArticle(a, document.querySelector("#article-hero-wrap"), document.querySelector("#article-canvas-wrap"));
    })
    .catch(function (err) {
      showError(err.message || "Chyba při načítání.");
    });
})();
