/* ============================================================
 * VNSafe — tiny allowlist sanitizer shared by the public site and admin.
 * Stored rich text (article blocks, Home/About documents) is HTML written
 * in the admin editor; it is cleaned before every innerHTML so a stored
 * payload (<img onerror>, javascript: links, <script>) can never execute.
 *   VNSafe.html(str)            -> cleaned HTML string
 *   VNSafe.url(str, {image})    -> safe URL or "" (http/https/mailto/tel/relative;
 *                                  with image: also data:image/* and blob:)
 *   VNSafe.cssUrl(str)          -> 'url("…")' for style.backgroundImage, or ""
 *   VNSafe.embed(link)          -> safe video/post embed info (YouTube, Vimeo,
 *                                  Instagram, TikTok, Spotify) or null
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

  /* ---------- media embeds (YouTube, Vimeo, Instagram, TikTok, Spotify) ----------
   * embed(linkOrIframeCode) -> { provider, label, src, thumb, w, h } or null.
   * The iframe src is REBUILT from a strictly validated ID — the pasted URL
   * itself never reaches an <iframe>. Idempotent: embed(result.src) works,
   * so the public page re-validates what the editor stored. */
  function ytSeconds(t) {
    if (!t) return 0;
    if (/^\d+$/.test(t)) return +t;
    var m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
    return m ? (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0)) : 0;
  }
  function embed(input) {
    var s = String(input == null ? "" : input).trim();
    var tag = /<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i.exec(s);   // pasted <iframe> embed code
    if (tag) s = tag[1].replace(/&amp;/g, "&");
    else if (s.indexOf("<") !== -1) {
      // Instagram / TikTok embed code is <blockquote …> + <script>: take the post URL
      var q = /\b(?:data-instgrm-permalink|cite)\s*=\s*["']([^"']+)["']/i.exec(s) || /https?:\/\/[^\s"'<>]+/i.exec(s);
      if (!q) return null;
      s = (q[1] || q[0]).replace(/&amp;/g, "&");
    }
    if (/^\/\//.test(s)) s = "https:" + s;
    if (!/^[a-z][a-z0-9+.\-]*:/i.test(s)) s = "https://" + s;
    var u;
    try { u = new URL(s); } catch (e) { return null; }
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    var host = u.hostname.toLowerCase().replace(/^(?:www|m|music)\./, "");
    var path = u.pathname, m, id;

    // YouTube: watch?v=, youtu.be/, /shorts/, /embed/, /live/, nocookie
    if (host === "youtu.be") id = path.split("/")[1];
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (path === "/watch") id = u.searchParams.get("v");
      else if (path === "/playlist") id = "videoseries";
      else if ((m = /^\/(?:embed|shorts|live|v)\/([^/]+)/.exec(path))) id = m[1];
    }
    if (id === "videoseries") {           // playlist (Share -> Embed on a playlist)
      var list = u.searchParams.get("list");
      if (!list || !/^[A-Za-z0-9_-]{10,64}$/.test(list)) return null;
      return {
        provider: "youtube", label: "YouTube",
        src: "https://www.youtube-nocookie.com/embed/videoseries?list=" + list,
        thumb: "", w: 480, h: 270
      };
    }
    if (id != null) {
      if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
      var start = ytSeconds(u.searchParams.get("t") || u.searchParams.get("start"));
      var tall = /^\/shorts\//.test(path);
      return {
        provider: "youtube", label: "YouTube",
        src: "https://www.youtube-nocookie.com/embed/" + id + (start ? "?start=" + start : ""),
        thumb: "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg",
        w: tall ? 270 : 480, h: tall ? 480 : 270
      };
    }
    // Vimeo: vimeo.com/ID[/hash], /channels/x/ID, player.vimeo.com/video/ID?h=hash
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      m = host === "player.vimeo.com"
        ? /^\/video\/(\d+)\/?$/.exec(path)
        : /^\/(?:[\w-]+\/)*?(\d{5,})(?:\/([0-9a-f]{6,}))?\/?$/.exec(path);
      if (!m) return null;
      // a showcase / album / event / channel / group page itself is not a video
      if (host === "vimeo.com" && /\/(?:showcase|album|event|channels|groups)\/\d+\/?$/.test(path)) return null;
      var hash = m[2] || u.searchParams.get("h") || "";
      if (hash && !/^[0-9a-f]{6,}$/.test(hash)) hash = "";
      return {
        provider: "vimeo", label: "Vimeo",
        src: "https://player.vimeo.com/video/" + m[1] + (hash ? "?h=" + hash : ""),
        thumb: "", w: 480, h: 270
      };
    }
    // Instagram: /p/CODE, /reel/CODE, /tv/CODE (optionally /user/ in front)
    if (host === "instagram.com") {
      m = /^\/(?:[\w.]+\/)?(p|reels?|tv)\/([A-Za-z0-9_-]{5,})/.exec(path);
      if (!m) return null;
      var kind = m[1] === "reels" ? "reel" : m[1];
      return {
        provider: "instagram", label: "Instagram",
        src: "https://www.instagram.com/" + kind + "/" + m[2] + "/embed/",
        thumb: "", w: 400, h: 560
      };
    }
    // TikTok: /@user/video|photo/ID, /embed/v2/ID, /player/v1/ID -> the official
    // inline player (fits any box; embed/v2 is a taller card that needs embed.js).
    // Short vm.tiktok.com links can't be resolved here.
    if (host === "tiktok.com") {
      m = /^\/(?:@[\w.\-]+\/(?:video|photo)|embed(?:\/v2)?|player\/v1)\/(\d{8,})/.exec(path);
      if (!m) return null;
      return {
        provider: "tiktok", label: "TikTok",
        src: "https://www.tiktok.com/player/v1/" + m[1],
        thumb: "", w: 325, h: 578
      };
    }
    // Spotify: open.spotify.com/[embed/][intl-xx/]track|album|playlist|episode|show|artist/ID
    if (host === "open.spotify.com") {
      m = /^\/(?:embed\/)?(?:intl-[a-z\-]+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{22})/.exec(path);
      if (!m) return null;
      var small = m[1] === "track" || m[1] === "episode";
      return {
        provider: "spotify", label: "Spotify",
        src: "https://open.spotify.com/embed/" + m[1] + "/" + m[2],
        thumb: "", w: 400, h: small ? 152 : 352
      };
    }
    return null;
  }

  // The player <iframe> for an embed() result — same attributes in the editor
  // preview and on the public page. Plays inline; no new window/tab.
  function embedFrame(info, title) {
    var f = document.createElement("iframe");
    f.src = info.src;
    f.title = title || info.label;
    f.loading = "lazy";
    f.allowFullscreen = true;
    f.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share");
    // YouTube refuses to play (error 153) when the embedding page sends no referrer
    f.referrerPolicy = "strict-origin-when-cross-origin";
    f.className = "vn-embed-frame";
    return f;
  }

  window.VNSafe = { html: html, url: url, cssUrl: cssUrl, embed: embed, embedFrame: embedFrame };
})();
