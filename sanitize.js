/* ============================================================
 * VNSafe — tiny allowlist sanitizer shared by the public site and admin.
 * Stored rich text (article blocks, Home/About documents) is HTML written
 * in the admin editor; it is cleaned before every innerHTML so a stored
 * payload (<img onerror>, javascript: links, <script>) can never execute.
 *   VNSafe.html(str)            -> cleaned HTML string
 *   VNSafe.url(str, {image})    -> safe URL or "" (http/https/mailto/tel/relative;
 *                                  with image: also data:image/* and blob:)
 *   VNSafe.cssUrl(str)          -> 'url("…")' for style.backgroundImage, or ""
 * ============================================================ */
(function () {
  "use strict";

  var ALLOWED_TAGS = {
    DIV: 1, P: 1, BR: 1, SPAN: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1,
    SUB: 1, SUP: 1, SMALL: 1, MARK: 1, CODE: 1, PRE: 1, BLOCKQUOTE: 1, HR: 1,
    UL: 1, OL: 1, LI: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1,
    A: 1, IMG: 1, FONT: 1, FIGURE: 1, FIGCAPTION: 1
  };
  // Removed together with their content; any other unknown tag is unwrapped.
  var DROP_TAGS = {
    SCRIPT: 1, STYLE: 1, IFRAME: 1, FRAME: 1, FRAMESET: 1, OBJECT: 1, EMBED: 1, APPLET: 1,
    NOSCRIPT: 1, TEMPLATE: 1, SVG: 1, MATH: 1, FORM: 1, INPUT: 1, BUTTON: 1, TEXTAREA: 1,
    SELECT: 1, OPTION: 1, LINK: 1, META: 1, BASE: 1, TITLE: 1, VIDEO: 1, AUDIO: 1, SOURCE: 1,
    TRACK: 1, CANVAS: 1, PORTAL: 1, DIALOG: 1
  };
  var GLOBAL_ATTRS = { style: 1, class: 1, title: 1, dir: 1, align: 1, lang: 1 };
  var TAG_ATTRS = {
    A: { href: 1, target: 1, rel: 1 },
    IMG: { src: 1, alt: 1, width: 1, height: 1, loading: 1 },
    FONT: { color: 1, size: 1, face: 1 },
    OL: { start: 1, type: 1 },
    LI: { value: 1 }
  };
  var BAD_CSS = /url\s*\(|expression\s*\(|javascript:|@import|behavior\s*:|-moz-binding|image-set\s*\(/i;

  function url(value, opts) {
    var raw = String(value == null ? "" : value).trim();
    if (!raw) return "";
    // Browsers ignore control chars/whitespace inside schemes ("java\tscript:").
    var probe = raw.replace(/[\u0000- \u007f-\u009f]/g, "");
    var m = /^([a-z][a-z0-9+.\-]*):/i.exec(probe);
    if (!m) return raw;                                  // relative URL
    var scheme = m[1].toLowerCase();
    if (scheme === "http" || scheme === "https") return raw;
    if (opts && opts.image) {
      if (scheme === "blob") return raw;
      if (scheme === "data" && /^data:image\/(png|jpe?g|gif|webp|avif);/i.test(probe)) return raw;
      return "";
    }
    if (scheme === "mailto" || scheme === "tel") return raw;
    return "";
  }

  function cssUrl(value) {
    var u = url(value, { image: true });
    if (!u) return "";
    return 'url("' + u.replace(/["\\\n\r\f]/g, function (c) {
      return "\\" + c.charCodeAt(0).toString(16) + " ";
    }) + '")';
  }

  function cleanNode(node) {
    var child = node.firstChild;
    while (child) {
      var next = child.nextSibling;
      if (child.nodeType === 1) {
        var tag = child.tagName.toUpperCase();
        if (DROP_TAGS[tag]) {
          node.removeChild(child);
        } else if (!ALLOWED_TAGS[tag]) {
          cleanNode(child);                              // unwrap: keep the text
          while (child.firstChild) node.insertBefore(child.firstChild, child);
          node.removeChild(child);
        } else {
          cleanAttrs(child, tag);
          if (tag === "IMG" && !child.getAttribute("src")) node.removeChild(child);   // unsafe src was stripped
          else cleanNode(child);
        }
      } else if (child.nodeType !== 3) {
        node.removeChild(child);                         // comments etc.
      }
      child = next;
    }
  }

  function cleanAttrs(el, tag) {
    var allowed = TAG_ATTRS[tag] || {};
    Array.prototype.slice.call(el.attributes).forEach(function (attr) {
      var name = attr.name.toLowerCase();
      var ok = GLOBAL_ATTRS[name] || allowed[name] || /^data-[a-z0-9\-]+$/.test(name);
      if (ok && name === "style" && BAD_CSS.test(attr.value)) ok = false;
      if (ok && name === "href" && !url(attr.value)) ok = false;
      if (ok && name === "src" && !url(attr.value, { image: true })) ok = false;
      if (!ok) el.removeAttribute(attr.name);
    });
    if (tag === "A") {
      if (el.getAttribute("target") && el.getAttribute("target") !== "_blank") el.removeAttribute("target");
      if (el.getAttribute("target") === "_blank") el.setAttribute("rel", "noopener noreferrer");
    }
  }

  function html(value) {
    var str = String(value == null ? "" : value);
    if (!str) return "";
    // <template> content is inert: nothing loads or runs while we clean it.
    var tpl = document.createElement("template");
    tpl.innerHTML = str;
    cleanNode(tpl.content);
    // Serialize inside the template's inert document (no image fetches).
    var box = tpl.content.ownerDocument.createElement("div");
    box.appendChild(tpl.content);
    return box.innerHTML;
  }

  window.VNSafe = { html: html, url: url, cssUrl: cssUrl };
})();
