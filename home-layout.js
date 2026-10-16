/* ============================================================
 * VNHome — the homepage layout (Google-Sites-like grid), shared by the
 * public site (index.html) and the admin editor. Both call render() with
 * the same data and the same CSS (style.css "HOMEPAGE LAYOUT GRID"), so the
 * editor shows the page 1:1 as readers see it.
 *
 * Data: content.home.layout = { rows: [ { id, align, blocks: [ ... ] } ] }
 *   text block: { id, kind: "text", span: 1..4, html }
 *   post block: { id, kind: "post", size: "A"|"B"|"C"|"D", articleId }
 * One row = 4 width units. A=1x1, B=2x1, C=3x1.5, D=4x2 (height in units;
 * a unit is a bit taller than wide). Text blocks are span units wide, auto
 * height. An empty post block (or one whose article isn't published) is
 * blank space for readers and a "+" placeholder in the editor.
 * Requires sanitize.js (VNSafe) to be loaded first.
 * ============================================================ */
(function () {
  "use strict";

  var POST_SIZES = { A: 1, B: 2, C: 3, D: 4 };
  var ALIGNS = { start: 1, center: 1, end: 1 };
  var MONTHS = ["ledna", "února", "března", "dubna", "května", "června",
                "července", "srpna", "září", "října", "listopadu", "prosince"];

  function uid(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }
  function blockWidth(b) {
    return b.kind === "post" ? POST_SIZES[b.size] : b.span;
  }
  function rowUsed(row, exceptId) {
    return row.blocks.reduce(function (sum, b) { return b.id === exceptId ? sum : sum + blockWidth(b); }, 0);
  }

  /* Same rules as shapeLayout() in api/_lib.js: max 4 units per row, known
     kinds/sizes only. Returns a fresh, safe copy (or null for no layout). */
  function normalize(layout) {
    if (!layout || !Array.isArray(layout.rows)) return null;
    var rows = [];
    layout.rows.slice(0, 200).forEach(function (r) {
      if (!r || !Array.isArray(r.blocks)) return;
      var blocks = [], used = 0;
      r.blocks.slice(0, 4).forEach(function (b) {
        if (!b) return;
        var blk;
        if (b.kind === "post") {
          blk = { id: String(b.id || uid("b")), kind: "post",
                  size: POST_SIZES[b.size] ? b.size : "A", articleId: String(b.articleId || "") };
        } else if (b.kind === "text") {
          var span = Math.max(1, Math.min(4, parseInt(b.span, 10) || 4));
          blk = { id: String(b.id || uid("b")), kind: "text", span: span, html: String(b.html || "") };
        } else return;
        var w = blockWidth(blk);
        if (used + w > 4) return;
        used += w;
        blocks.push(blk);
      });
      if (blocks.length) rows.push({ id: String(r.id || uid("r")), align: ALIGNS[r.align] ? r.align : "start", blocks: blocks });
    });
    return { rows: rows };
  }

  /* Layout for sites saved before the grid existed: the old fixed heading,
     lead and the „Téma" document become ordinary text blocks, followed by the
     newest published articles (pinned first). Used identically by the public
     page and the editor until the admin saves a layout. */
  function defaultLayout(content, liveArticles) {
    var home = (content && content.home) || {};
    var rows = [{
      id: uid("r"), align: "start",
      blocks: [{ id: uid("b"), kind: "text", span: 4,
                 html: "<h1>Domovská stránka</h1><p style=\"color: #5b6770;\">Nejnovější příspěvky našeho magazínu.</p>" }]
    }];
    if (home.doc && docHasText(home.doc)) {
      rows.push({ id: uid("r"), align: "start", blocks: [{ id: uid("b"), kind: "text", span: 4, html: home.doc }] });
    }
    var pinned = Array.isArray(home.pinned) ? home.pinned : [];
    var list = (liveArticles || []).slice().sort(function (a, b) {
      return String(b.publishAt || b.date || "").localeCompare(String(a.publishAt || a.date || ""));
    });
    var ordered = pinned.map(function (id) { return list.filter(function (a) { return a.id === id; })[0]; })
      .filter(Boolean)
      .concat(list.filter(function (a) { return pinned.indexOf(a.id) === -1; }))
      .slice(0, 9);
    if (ordered.length) {
      rows.push({ id: uid("r"), align: "start",
                  blocks: [{ id: uid("b"), kind: "post", size: "D", articleId: ordered[0].id }] });
      for (var i = 1; i < ordered.length; i += 4) {
        rows.push({ id: uid("r"), align: "start",
                    blocks: ordered.slice(i, i + 4).map(function (a) {
                      return { id: uid("b"), kind: "post", size: "A", articleId: a.id };
                    }) });
      }
    }
    return { rows: rows };
  }

  function docHasText(html) {
    var t = document.createElement("template");
    t.innerHTML = html;
    return (t.content.textContent || "").replace(/[\s​]/g, "") !== "" || !!t.content.querySelector("img");
  }
  function formatDate(iso) {
    if (!iso) return "";
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    var d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.getDate() + ". " + MONTHS[d.getMonth()] + " " + d.getFullYear();
  }
  // Card picture: thumbnail, else the first image block, else a YouTube thumbnail.
  function thumb(a) {
    var src = a.image;
    var els = Array.isArray(a.elements) ? a.elements : [];
    for (var i = 0; !src && i < els.length; i++) if (els[i].type === "image") src = els[i].content;
    for (var j = 0; !src && j < els.length; j++) {
      var info = els[j].type === "embed" && VNSafe.embed(els[j].content);
      if (info && info.thumb) src = info.thumb;
    }
    return VNSafe.url(src, { image: true });
  }
  // Plain-text excerpt for C/D cards (body or the article's text blocks).
  function excerpt(a) {
    var t = document.createElement("template");
    t.innerHTML = (Array.isArray(a.elements) ? a.elements : [])
      .filter(function (el) { return el.type === "text" && !el.isTitle; })
      .map(function (el) { return "<p>" + VNSafe.html(el.content) + "</p>"; }).join(" ");
    return ((a.body || "") + " " + t.content.textContent).replace(/\s+/g, " ").trim().slice(0, 1200);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // Article card for a post block; editing -> <div> (no navigation), else <a>.
  function buildCard(a, size, editing) {
    var card = el(editing ? "div" : "a", "hl-card hl-card--" + size);
    if (!editing) {
      card.href = "/article?id=" + encodeURIComponent(a.id);
      card.setAttribute("aria-label", a.title || "(bez názvu)");   // not the whole excerpt
    }
    var media = el("div", "hl-media");
    var src = thumb(a);
    if (src) {
      var img = el("img");
      img.src = src; img.alt = ""; img.loading = "lazy"; img.decoding = "async";
      media.appendChild(img);
    }
    card.appendChild(media);
    var body = el("div", "hl-body");
    body.appendChild(el("h2", "hl-title", a.title || "(bez názvu)"));
    var meta = el("div", "hl-meta");
    var time = el("time", null, formatDate(a.date));
    time.dateTime = a.date || "";
    meta.appendChild(time);
    if ((a.authors || []).length) meta.appendChild(el("span", null, a.authors.join(", ")));
    meta.appendChild(el("span", null, a.kind === "comic" ? "Komiks" : "Článek"));
    body.appendChild(meta);
    if (size === "C" || size === "D") {
      var ex = excerpt(a);
      if (ex) body.appendChild(el("p", "hl-excerpt", ex));
    }
    card.appendChild(body);
    return card;
  }

  /* Render the layout into `root`.
   *   articles: list to resolve articleId (public: published only)
   *   opts.editing: editor mode (text is contenteditable, empty posts show "+",
   *                 cards are not links); opts.decorate(node, block, row) adds
   *                 editor chrome without touching the layout itself. */
  function render(root, layout, articles, opts) {
    opts = opts || {};
    var byId = {};
    (articles || []).forEach(function (a) { byId[a.id] = a; });
    var canvas = el("div", "hl-canvas" + (opts.editing ? " is-editing" : ""));
    ((layout && layout.rows) || []).forEach(function (row) {
      var rowEl = el("div", "hl-row hl-row--" + row.align);
      rowEl.dataset.rowId = row.id;
      row.blocks.forEach(function (b) {
        var node = el("div", "hl-block");
        node.dataset.blockId = b.id;
        node.style.setProperty("--span", blockWidth(b));
        if (b.kind === "text") {
          node.classList.add("hl-text");
          var bodyEl = el("div", "hl-text-body");
          bodyEl.innerHTML = VNSafe.html(b.html);
          if (opts.editing) {
            bodyEl.contentEditable = "true";
            bodyEl.spellcheck = false;
            bodyEl.setAttribute("aria-label", "Textový blok");
          }
          node.appendChild(bodyEl);
        } else {
          node.classList.add("hl-post", "hl-post--" + b.size);
          var a = b.articleId && byId[b.articleId];
          if (a) node.appendChild(buildCard(a, b.size, opts.editing));
          else {
            node.classList.add("is-empty");
            if (opts.editing) {
              var plus = el("button", "hl-plus", "+");
              plus.type = "button";
              plus.title = "Vybrat příspěvek";
              plus.setAttribute("aria-label", "Vybrat příspěvek do bloku");
              node.appendChild(plus);
            }
          }
        }
        if (opts.decorate) opts.decorate(node, b, row);
        rowEl.appendChild(node);
      });
      if (opts.decorateRow) opts.decorateRow(rowEl, row);
      canvas.appendChild(rowEl);
    });
    root.innerHTML = "";
    root.appendChild(canvas);
    return canvas;
  }

  window.VNHome = {
    POST_SIZES: POST_SIZES,
    normalize: normalize,
    defaultLayout: defaultLayout,
    render: render,
    blockWidth: blockWidth,
    rowUsed: rowUsed,
    uid: uid,
    thumb: thumb,
    formatDate: formatDate
  };
})();
