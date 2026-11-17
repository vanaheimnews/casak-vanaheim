// Parity check — core: drives a page inside an iframe of a fixed size and
// records what it renders. Runs in the browser (see README.md).

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- results go to the dev server (--out directory) ---------- */
export function post(name, data) {
  return fetch("/__snap?name=" + encodeURIComponent(name), { method: "POST", body: JSON.stringify(data) });
}
export async function api(path, method, body) {
  const r = await fetch(path, { method: method || "GET", headers: { "Content-Type": "application/json" },
                                body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = text; }
  return { status: r.status, body: json };
}
export const login = () => api("/api/login", "POST", { password: "test" });
export const logout = () => api("/api/logout", "POST");
export const reset = () => fetch("/__reset", { method: "POST" });

/* Make recorded data comparable between two runs: no origins, no random ids,
   no "now". Seed ids (a1, e-title, b-head…) are short and stay. */
const DAY = 864e5;
export function clean(value) {
  const today = new Date();
  const local = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const near = [local(new Date(today - DAY)), local(today), local(new Date(+today + DAY))];
  const fix = (s) => s
    .replace(/https?:\/\/localhost:\d+/g, "")
    .replace(/blob:[^"'\s)]*/g, "blob:")
    .replace(/\b(el|a|b|r)-[a-z0-9]{6,}-[a-z0-9]{3,8}\b/g, "$1-*")
    .replace(/\b([tc])-[a-z0-9]{8,}\b/g, "$1-*")
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z?/g, (m) => {
      const t = Date.parse(m);
      return !isNaN(t) && Math.abs(t - today) < 2 * DAY ? "<now>" : m;
    })
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, (m) => (near.includes(m) ? "<today>" : m));
  return JSON.parse(JSON.stringify(value, (k, v) => {
    if (k === "updatedAt") return undefined;
    return typeof v === "string" ? fix(v) : v;
  }));
}

/* ---------- the page under test ---------- */
let frame = null;
export async function open(url, width = 1440, height = 900) {
  if (frame) frame.remove();
  frame = document.createElement("iframe");
  frame.style.cssText = "position:absolute;left:0;top:0;border:0;background:#fff;width:" + width + "px;height:" + height + "px";
  document.body.appendChild(frame);
  await new Promise((r) => { frame.addEventListener("load", r, { once: true }); frame.src = url; });
  const page = new Page(frame.contentWindow);
  await page.settle();
  return page;
}

export class Page {
  constructor(win) { this.win = win; this.doc = win.document; }
  q(sel, root) { return (root || this.doc).querySelector(sel); }
  qa(sel, root) { return Array.from((root || this.doc).querySelectorAll(sel)); }
  text(sel) { const n = typeof sel === "string" ? this.q(sel) : sel; return n ? n.textContent.replace(/\s+/g, " ").trim() : null; }
  texts(sel) { return this.qa(sel).map((n) => n.textContent.replace(/\s+/g, " ").trim()); }
  errors() { return (this.win.__parity && this.win.__parity.errors) || []; }

  // Wait until nothing is loading and pending frames / size checks have run.
  async settle(rounds = 3) {
    const P = this.win.__parity;
    for (let i = 0, quiet = 0; i < 240 && quiet < rounds; i++) {
      if (P) P.flush();
      await sleep(25);
      quiet = P && P.pending() > 0 ? 0 : quiet + 1;
    }
    if (this.doc.fonts && this.doc.fonts.ready) await Promise.race([this.doc.fonts.ready, sleep(4000)]);
    const imgs = this.qa("img").filter((im) => !im.complete);
    if (imgs.length) await Promise.race([Promise.all(imgs.map((im) => new Promise((r) => { im.onload = im.onerror = r; }))), sleep(4000)]);
    if (P) P.flush();
    await sleep(10);
  }

  /* --- synthetic input: the same events a mouse / keyboard produces --- */
  point(el, fx = 0.5, fy = 0.5) { const r = el.getBoundingClientRect(); return [r.left + r.width * fx, r.top + r.height * fy]; }
  fire(type, el, pt, init) {
    const Ctor = type.startsWith("pointer") ? this.win.PointerEvent : this.win.MouseEvent;
    const [x, y] = pt || this.point(el);
    const down = /down|move/.test(type);
    const e = new Ctor(type, Object.assign({ bubbles: true, cancelable: true, composed: true, view: this.win, clientX: x, clientY: y,
      button: 0, buttons: down ? 1 : 0, pointerId: 1, pointerType: "mouse", isPrimary: true }, init || {}));
    el.dispatchEvent(e);
    return e;
  }
  // Like a real press: unless a handler cancelled it, focus moves to the pressed
  // control (or away from the focused one when the target cannot take focus).
  press(el, pt, init) {
    const pd = this.fire("pointerdown", el, pt, init);
    const md = this.fire("mousedown", el.isConnected ? el : this.doc.body, pt, init);
    if (pd.defaultPrevented || md.defaultPrevented || !el.isConnected) return;
    const target = el.closest('input, select, textarea, button, a[href], [tabindex], [contenteditable="true"]');
    const active = this.doc.activeElement;
    if (target && !target.disabled) { if (target !== active) target.focus({ preventScroll: true }); }
    else if (active && active !== this.doc.body) active.blur();
  }
  release(el, pt, init) { this.fire("pointerup", el, pt, init); this.fire("mouseup", el, pt, init); }
  async tap(el, pt, init) {
    if (typeof el === "string") el = this.q(el);
    pt = pt || this.point(el);
    this.press(el, pt, init);
    this.release(el.isConnected ? el : this.doc.body, pt, init);
    if (el.isConnected) this.fire("click", el, pt, init);
    await this.settle(1);
  }
  // Press on el, move by (dx, dy) in steps, release. No click (it was a drag).
  async drag(el, dx, dy, opts = {}) {
    if (typeof el === "string") el = this.q(el);
    const [x, y] = opts.from ? this.point(el, opts.from[0], opts.from[1]) : this.point(el);
    const steps = opts.steps || 3;
    this.press(el, [x, y], opts.init);
    for (let i = 1; i <= steps; i++) {
      this.fire("pointermove", el.isConnected ? el : this.doc.body, [x + dx * i / steps, y + dy * i / steps], opts.init);
      if (opts.hold) await this.settle(1);
    }
    if (opts.keep) return [x + dx, y + dy];                    // caller releases later
    this.release(el.isConnected ? el : this.doc.body, [x + dx, y + dy], opts.init);
    await this.settle(1);
  }
  async key(key, init = {}) {
    const target = this.doc.activeElement || this.doc.body;
    const o = Object.assign({ key, bubbles: true, cancelable: true, composed: true, view: this.win }, init);
    const down = new this.win.KeyboardEvent("keydown", o);
    target.dispatchEvent(down);
    (target.isConnected ? target : this.doc.body).dispatchEvent(new this.win.KeyboardEvent("keyup", o));
    await this.settle(1);
    return down;
  }
  // Real typing into the focused editable (fires genuine input events).
  type(text) { for (const ch of text) this.doc.execCommand("insertText", false, ch); }
  enter() { this.doc.execCommand("insertParagraph"); }
  caret(node, offset) { this.select(node, offset, node, offset); }
  select(startNode, startOffset, endNode, endOffset) {
    const r = this.doc.createRange();
    r.setStart(startNode, startOffset);
    r.setEnd(endNode || startNode, endOffset == null ? startOffset : endOffset);
    const s = this.win.getSelection();
    s.removeAllRanges(); s.addRange(r);
    this.doc.dispatchEvent(new this.win.Event("selectionchange"));
  }
  // Select the first occurrence of `word` inside root (an editable element).
  selectWord(root, word) {
    const walker = this.doc.createTreeWalker(root, 4);   // SHOW_TEXT
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = n.nodeValue.indexOf(word);
      if (i > -1) { root.focus(); this.select(n, i, n, i + word.length); return true; }
    }
    return false;
  }
  async set(el, value) {                                        // typed / picked value: input + change
    if (typeof el === "string") el = this.q(el);
    el.value = value;
    el.dispatchEvent(new this.win.Event("input", { bubbles: true }));
    el.dispatchEvent(new this.win.Event("change", { bubbles: true }));
    await this.settle(1);
  }
  input(el, value) {                                            // still typing / dragging a slider: input only
    if (typeof el === "string") el = this.q(el);
    el.value = value;
    el.dispatchEvent(new this.win.Event("input", { bubbles: true }));
  }
  // A generated picture (w × h, two colours) chosen in a file input.
  async file(input, name, w, h, color) {
    if (typeof input === "string") input = this.q(input);
    const cv = this.doc.createElement("canvas");
    cv.width = w; cv.height = h;
    const g = cv.getContext("2d");
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    g.fillStyle = "#ffffff"; g.fillRect(Math.round(w / 4), Math.round(h / 4), Math.round(w / 2), Math.round(h / 2));
    const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
    const dt = new this.win.DataTransfer();
    dt.items.add(new this.win.File([blob], name, { type: "image/png" }));
    input.files = dt.files;
    input.dispatchEvent(new this.win.Event("change", { bubbles: true }));
    await sleep(60);
    await this.settle(4);
  }
}

/* ---------- render snapshot ----------
   Every visible element: tag, classes, box (document coordinates), the
   computed styles that decide how it looks, its own text and a few state
   attributes. Two builds that paint the same pixels give the same records. */
const SKIP = new Set(["script", "style", "link", "meta", "template", "noscript", "head", "title", "br", "option", "optgroup"]);
export const STYLE = ("display position float clear z-index box-sizing overflow-x overflow-y opacity top right bottom left " +
  "color background-color background-image background-size background-position-x background-position-y background-repeat " +
  "font-family font-size font-weight font-style line-height letter-spacing text-align text-decoration-line text-decoration-color " +
  "text-transform white-space word-break overflow-wrap text-overflow vertical-align list-style-type " +
  "border-top-width border-right-width border-bottom-width border-left-width border-top-style border-right-style border-bottom-style border-left-style " +
  "border-top-color border-right-color border-bottom-color border-left-color " +
  "border-top-left-radius border-top-right-radius border-bottom-right-radius border-bottom-left-radius " +
  "outline-style outline-width outline-color outline-offset " +
  "padding-top padding-right padding-bottom padding-left margin-top margin-right margin-bottom margin-left " +
  "box-shadow cursor transform object-fit object-position aspect-ratio filter " +
  "flex-direction flex-wrap justify-content align-items align-self flex-grow flex-shrink flex-basis order row-gap column-gap " +
  "grid-template-columns grid-column-start grid-column-end min-width min-height max-width max-height " +
  "user-select pointer-events resize table-layout border-collapse").split(" ");
// the server address and blob: ids differ from run to run — they are not part of the look
const styleString = (cs) => STYLE.map((p) => cs.getPropertyValue(p)).join("|")
  .replace(/blob:[^")|]*/g, "blob:").replace(/https?:[/][/]localhost:[0-9]+/g, "");
const norm = (s) => String(s || "").replace(/^https?:\/\/localhost:\d+/, "").replace(/^blob:.*/, "blob:").replace(/([?&]id=)a-[a-z0-9]{6,}-[a-z0-9]+/, "$1*");
const r1 = (v) => Math.round(v * 10) / 10;

function stateOf(el) {
  const a = {}, tag = el.tagName;
  if (tag === "IMG" || tag === "IFRAME") a.src = norm(el.getAttribute("src"));
  if (tag === "image") a.href = norm(el.getAttribute("href"));
  if (tag === "A") a.href = norm(el.getAttribute("href"));
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    a.value = el.type === "datetime-local" ? String(el.value).slice(0, 10) : el.type === "file" ? "" : String(el.value);
    if (el.type === "checkbox" || el.type === "radio") a.checked = el.checked;
    if (el.placeholder) a.ph = el.placeholder;
  }
  if (el.disabled) a.disabled = true;
  if (el.getAttribute("contenteditable") != null) a.editable = el.isContentEditable;
  ["title", "aria-expanded", "aria-pressed", "aria-checked", "aria-hidden"].forEach((n) => {
    const v = el.getAttribute(n);
    if (v != null && v !== "") a[n] = v;
  });
  return Object.keys(a).length ? a : 0;
}
function ownText(el) {
  let t = "";
  for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue;
  return t.replace(/\s+/g, " ").trim().slice(0, 80);
}

// Reads the page until two readings in a row agree (a reading taken in the
// middle of a repaint can be off by one value).
export async function stableSnapshot(page) {
  let last = snapshot(page), text = JSON.stringify(last);
  for (let i = 0; i < 5; i++) {
    await sleep(40);
    const next = snapshot(page), nextText = JSON.stringify(next);
    if (nextText === text) return next;
    last = next; text = nextText;
  }
  return last;
}

export function snapshot(page) {
  const { win, doc } = page;
  const dict = new Map(), list = [];
  const id = (s) => { let i = dict.get(s); if (i === undefined) { i = list.length; dict.set(s, i); list.push(s); } return i; };
  const els = [];
  for (const el of doc.body.querySelectorAll("*")) {
    const tag = el.tagName.toLowerCase();
    if (SKIP.has(tag) || el.closest(".toast")) continue;       // the toast comes and goes on a timer
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const cs = win.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const rec = [tag, typeof el.className === "string" ? el.className.trim().replace(/\s+/g, " ") : String(el.getAttribute("class") || ""),
      r1(r.left + win.scrollX), r1(r.top + win.scrollY), r1(r.width), r1(r.height), id(styleString(cs)), ownText(el), stateOf(el)];
    for (const which of ["::before", "::after"]) {
      const ps = win.getComputedStyle(el, which);
      const content = ps.getPropertyValue("content");
      if (content && content !== "none" && content !== "normal") {
        rec.push(which + " " + id(styleString(ps) + "|" + ps.getPropertyValue("width") + "|" + ps.getPropertyValue("height") + "|" + content));
      }
    }
    els.push(rec);
  }
  return { url: norm(win.location.pathname + win.location.search + win.location.hash), size: [win.innerWidth, win.innerHeight],
           scroll: [win.scrollX, win.scrollY], title: doc.title, dict: list, els };
}
