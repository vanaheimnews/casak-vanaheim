// Parity scenarios — the visual article editor.
import { open, api, clean, sleep, logout } from "./core.mjs";

/* ---------- helpers shared by the editor scenarios ---------- */
export async function admin(w = 1440, h = 900) { return open("/admin/", w, h); }
export async function openArticle(p, title) {
  await p.tap(p.qa("#article-grid .card").find((c) => c.textContent.includes(title)));
  await p.settle();
}
const canvas = (p) => p.q("#ed-canvas");
const blocks = (p) => p.qa("#ed-canvas > .ed-el");
const byText = (p, text) => blocks(p).find((n) => n.querySelector(".ed-el-content").textContent.includes(text));
const byClass = (p, cls) => p.q("#ed-canvas > .ed-el." + cls);
const inner = (node) => node.querySelector(".ed-el-content");
const box = (n) => (n ? [n.style.left, n.style.top, n.style.width, n.style.height].join(" ") : null);
const hist = (p) => (p.q("#ed-undo").disabled ? "-" : "U") + (p.q("#ed-redo").disabled ? "-" : "R");
const heroH = (p) => (p.q("#ed-canvas > .ed-hero-zone") ? p.q("#ed-canvas > .ed-hero-zone").style.height : null);
const toast = (p) => p.text("#toast");
const describe = (p) => blocks(p).map((n) => ({
  cls: n.className.replace(/\bed-el\b/, "").trim(), box: box(n), z: n.style.zIndex,
  text: inner(n).textContent.slice(0, 40), img: (n.querySelector("img") || {}).src ? "img" : n.querySelector("svg") ? "svg" : ""
}));
const pageH = (p) => canvas(p).style.minHeight;
const away = async (p) => { const r = canvas(p).parentNode.getBoundingClientRect(); await p.tap(canvas(p).parentNode, [r.left + 4, r.top + 4]); };
// First click selects; a later click on the selected text block starts editing.
async function select(p, node) { await p.tap(inner(node)); }
async function edit(p, find) {
  await select(p, find());
  await sleep(560);                                 // not a double-click (that would select a word)
  await select(p, find());
  inner(find()).focus();
}
const selectAll = (p, el) => { el.focus(); p.select(el, 0, el, el.childNodes.length); };
const undo = (p) => p.tap("#ed-undo"), redo = (p) => p.tap("#ed-redo");
const chips = (p, list) => p.qa('.ed-picker[data-list="' + list + '"] .ed-pick-chip').map((n) => n.firstChild.textContent);
const pick = (p, list, name) => p.set(p.q('.ed-picker[data-list="' + list + '"] select'), name);
const badges = (p) => p.qa("#ed-canvas .ed-role-tag").map((n) => n.querySelector(".vn-badge").textContent + "@" + n.style.left + "," + n.style.top);
const toolbar = (p) => ({
  visible: p.q("#ed-format-tools").classList.contains("is-visible"), size: p.q("#ed-fs-val").value, font: p.q("#ed-font").value,
  b: p.q("#ed-bold").classList.contains("is-active"), i: p.q("#ed-italic").classList.contains("is-active"), u: p.q("#ed-underline").classList.contains("is-active"),
  color: p.q("#ed-color").style.color,
  align: ["left", "center", "right"].filter((a) => p.q("#ed-align-" + a).classList.contains("btn-active")).join(""),
  ul: p.q("#ed-ul").classList.contains("btn-active"), ol: p.q("#ed-ol").classList.contains("btn-active"),
  crop: !p.q("#ed-crop").hidden, layer: !p.q("#ed-layer-wrap").hidden
});
const saved = async (id) => {
  const a = (await api("/api/articles?id=" + id)).body;
  return clean(a);
};

export default {
  /* What the editor looks like in each state (snapshots), on the article saved with two zones. */
  async "adm-editor-view"(t) {
    const p = await admin();
    await openArticle(p, "Vtipy");
    t.fact("open", { blocks: describe(p), heroH: heroH(p), pageH: pageH(p), hist: hist(p), tools: toolbar(p),
                     panel: { authors: chips(p, "authors"), tags: chips(p, "tags"), kind: p.q("#ed-kind").value, date: p.q("#ed-date").value,
                              thumb: !p.q("#ed-thumb-preview").hidden, publish: p.text("#ed-publish") } });
    await t.snap(p, "open");
    await select(p, byText(p, "První odstavec"));
    t.fact("text-selected", toolbar(p));
    await t.snap(p, "text-selected");
    await edit(p, () => byText(p, "První odstavec"));
    t.fact("text-editing", { editable: inner(byText(p, "První odstavec")).isContentEditable, cls: byText(p, "První odstavec").className });
    await t.snap(p, "text-editing");
    p.selectWord(inner(byText(p, "První odstavec")), "barvou"); await p.settle(1);
    t.fact("word-selected", toolbar(p));
    await p.tap("#ed-color");
    t.fact("color-panel", { open: !p.q("#ed-color-panel").hidden, hex: p.q("#ed-hex").value, r: p.q("#ed-r-num").value });
    await t.snap(p, "color-panel");
    await p.tap("#ed-color");
    await away(p);
    t.fact("click-away", { selected: p.qa("#ed-canvas .is-selected").length, editing: p.qa("#ed-canvas .is-editing").length, tools: toolbar(p) });
    await select(p, byClass(p, "ed-el--image:not(.is-hero)"));
    t.fact("image-selected", toolbar(p));
    await t.snap(p, "image-selected");
    await p.tap("#ed-crop");
    t.fact("crop", { layer: box(p.q("#ed-canvas .ed-crop")), frame: box(p.q("#ed-canvas .ed-crop-frame")), active: p.q("#ed-crop").classList.contains("is-active") });
    await t.snap(p, "crop");
    await p.key("Escape");
    await p.tap("#ed-layer"); await t.snap(p, "layer-menu"); await p.tap("#ed-layer");
    await select(p, byClass(p, "ed-role-tag")); t.fact("badge-selected", toolbar(p)); await t.snap(p, "badge-selected");
    await select(p, byClass(p, "ed-role-date")); t.fact("date-selected", toolbar(p)); await t.snap(p, "date-selected");
    await select(p, byClass(p, "ed-role-thumb")); t.fact("thumb-selected", toolbar(p));
    await select(p, byClass(p, "ed-el--embed")); await t.snap(p, "embed-selected");
    await select(p, byClass(p, "ed-el--file")); await t.snap(p, "file-selected");
    await away(p);
    await p.tap("#ed-bg"); t.fact("bg-panel", !p.q("#ed-bg-panel").hidden); await t.snap(p, "bg-panel"); await p.tap("#ed-bg");
    await p.tap("#ed-meta-toggle");
    t.fact("meta-collapsed", { cls: p.q("#editor-overlay .ed-body").className, expanded: p.q("#ed-meta-toggle").getAttribute("aria-expanded") });
    await t.snap(p, "meta-collapsed");
    await p.tap("#ed-meta-toggle");
    await p.tap("#ed-back-nochange");
    t.fact("confirm", { open: !p.q("#ed-confirm").hidden, title: p.text("#ed-confirm-title"), text: p.text("#ed-confirm-text") });
    await t.snap(p, "confirm");
    await p.tap("#ed-confirm-cancel");
    await p.tap("#ed-delete"); t.fact("confirm-delete", { title: p.text("#ed-confirm-title"), text: p.text("#ed-confirm-text") }); await p.tap("#ed-confirm-cancel");
    await p.tap("#ed-add-embed");
    await t.snap(p, "embed-dialog");
    p.input("#ed-embed-url", "https://youtu.be/dQw4w9WgXcQ"); await p.settle();
    t.fact("embed-check", { status: p.text("#ed-embed-status"), disabled: p.q("#ed-embed-ok").disabled });
    p.input("#ed-embed-url", "https://example.com/nothing"); await p.settle();
    t.fact("embed-check-bad", { status: p.text("#ed-embed-status"), disabled: p.q("#ed-embed-ok").disabled });
    await p.tap("#ed-embed-cancel");
    await p.tap("#ed-tx-open"); await p.settle(); await t.snap(p, "lists-over-editor"); await p.tap("#tx-close");
    t.fact("unchanged", hist(p));
    t.fact("errors", p.errors());
    const n = await admin(700, 900);                              // narrow window: stacked layout
    await openArticle(n, "Vtipy");
    await select(n, byText(n, "První odstavec"));
    await t.snap(n, "narrow");
    t.fact("errors-narrow", n.errors());
  },

  /* Undo / redo: steps, typing groups, drag, resize, format, delete. */
  async "adm-editor-history"(t) {
    const p = await admin();
    await p.tap("#new-article-btn"); await p.settle();
    const body = () => blocks(p).find((n) => !n.classList.contains("is-hero"));
    const txt = () => (body() ? inner(body()).innerText.replace(/\n+/g, "|") : null);
    t.fact("new", { hist: hist(p), blocks: describe(p), heroH: heroH(p) });
    await p.tap("#ed-add-text");
    t.fact("add", { hist: hist(p), n: blocks(p).length, box: box(body()) });
    await undo(p); t.fact("undo-add", { hist: hist(p), n: blocks(p).length });
    await redo(p); t.fact("redo-add", { hist: hist(p), n: blocks(p).length });
    await edit(p, body);
    selectAll(p, inner(body()));
    p.type("aaa"); p.enter(); p.type("bbb"); await p.settle(1);
    t.fact("typed", { text: txt(), hist: hist(p) });
    await undo(p); t.fact("undo-typing-1", { text: txt(), editing: !!byClass(p, "is-editing") });
    await undo(p); t.fact("undo-typing-2", txt());
    await redo(p); await redo(p); t.fact("redo-typing", txt());
    await p.key("z", { ctrlKey: true }); t.fact("ctrl-z", txt());
    await p.key("y", { ctrlKey: true }); t.fact("ctrl-y", txt());
    await p.key("z", { ctrlKey: true }); await p.key("z", { ctrlKey: true, shiftKey: true }); t.fact("ctrl-shift-z", txt());
    await away(p);
    await p.drag(inner(body()), 50, 80, { from: [0.1, 0.3] });
    t.fact("drag", { box: box(body()), selected: body().classList.contains("is-selected") });
    await undo(p); t.fact("undo-drag", box(body())); await redo(p);
    await p.tap("#ed-bold"); t.fact("bold", p.win.getComputedStyle(inner(body())).fontWeight);
    await undo(p); t.fact("undo-bold", p.win.getComputedStyle(inner(body())).fontWeight); await redo(p);
    await p.drag(body().querySelector('.ed-handle[data-h="e"]'), 80, 0);
    t.fact("resize-e", box(body()));
    await p.drag(body().querySelector('.ed-handle[data-h="se"]'), 30, 40);
    t.fact("resize-se", box(body()));
    await p.drag(body().querySelector('.ed-handle[data-h="nw"]'), -20, -10);
    t.fact("resize-nw", box(body()));
    await undo(p); await undo(p); await undo(p); t.fact("undo-resizes", box(body())); await redo(p); await redo(p); await redo(p);
    await p.tap(body().querySelector(".ed-el-delete"));
    t.fact("delete", { gone: !body(), hist: hist(p) });
    await undo(p); t.fact("undo-delete", txt());
    let steps = 0;
    while (!p.q("#ed-undo").disabled && steps < 60) { await undo(p); steps++; }
    t.fact("all-steps", { steps, blocks: blocks(p).length, hist: hist(p) });
    for (let i = 0; i < steps; i++) await redo(p);
    t.fact("all-redone", { text: txt(), hist: hist(p), pageH: pageH(p) });
    t.fact("errors", p.errors());
  },

  /* Rich text: the toolbar applied to a selection inside a text block, then to a whole block. */
  async "adm-editor-format"(t) {
    const p = await admin();
    await openArticle(p, "Fotbalový");
    const body = () => byText(p, "Turnaj");
    const html = () => inner(body()).innerHTML;
    const word = async (w) => { p.selectWord(inner(body()), w); await p.settle(1); };
    await edit(p, body);
    await word("pondělí"); await p.tap("#ed-bold"); t.fact("bold-on", { html: html(), tools: toolbar(p) });
    await p.tap("#ed-bold"); t.fact("bold-off", html());
    await word("Turnaj"); await p.tap("#ed-italic"); t.fact("italic", html());
    await p.tap("#ed-underline"); t.fact("underline-on", { html: html(), u: toolbar(p).u });
    await p.tap("#ed-underline"); t.fact("underline-off", { html: html(), u: toolbar(p).u });
    await word("začal"); await p.tap("#ed-color");
    await p.tap('#ed-swatches button[data-color="#dc2626"]'); t.fact("swatch", html());
    p.q("#ed-r-range").focus();
    for (const v of [50, 120, 200]) { p.input("#ed-r-range", v); await p.settle(1); }
    t.fact("slider", { html: html(), hex: p.q("#ed-hex").value });
    const hex = p.q("#ed-hex"); hex.focus(); hex.value = "";
    for (const ch of "#1a2b3c") { hex.value += ch; hex.dispatchEvent(new p.win.Event("input", { bubbles: true })); }
    await p.settle(1);
    t.fact("hex-typed", { html: html(), field: hex.value });
    hex.value = "#f0f"; hex.dispatchEvent(new p.win.Event("input", { bubbles: true }));
    t.fact("hex-short-before-enter", html());
    await p.key("Enter");
    t.fact("hex-enter", { html: html(), panelOpen: !p.q("#ed-color-panel").hidden, selection: String(p.win.getSelection()) });
    await word("Hrálo"); p.q("#ed-font").focus(); await p.set("#ed-font", "'Roboto', system-ui, sans-serif");
    t.fact("font", { html: html(), tools: toolbar(p) });
    await p.set("#ed-font", ""); t.fact("font-default", html());
    await word("týden"); const fs = p.q("#ed-fs-val"); fs.focus(); p.input(fs, "24"); await p.settle(1);
    t.fact("size-typed", html());
    await p.key("Enter"); t.fact("size-enter", { active: p.doc.activeElement.className, selection: String(p.win.getSelection()) });
    await p.tap("#ed-fs-inc"); await p.tap("#ed-fs-inc"); await p.tap("#ed-fs-dec");
    t.fact("size-buttons", { html: html(), size: p.q("#ed-fs-val").value });
    await word("Turnaj"); await p.tap("#ed-align-center"); t.fact("align-center", { html: html(), align: toolbar(p).align });
    await p.tap("#ed-align-right"); t.fact("align-right", html());
    await p.key("l", { ctrlKey: true, shiftKey: true }); t.fact("align-shortcut-left", html());
    await p.tap("#ed-ul"); t.fact("ul", { html: html(), ul: toolbar(p).ul });
    await p.tap("#ed-ol"); t.fact("ol", { html: html(), ol: toolbar(p).ol });
    await p.tap("#ed-indent-inc"); t.fact("indent", html());
    await p.tap("#ed-indent-dec"); await p.tap("#ed-ol"); t.fact("list-off", html());
    // caret only: the next typed text gets the style
    const lastText = () => { const w = p.doc.createTreeWalker(inner(body()), 4); let n, last = null; while ((n = w.nextNode())) last = n; return last; };
    p.caret(lastText(), lastText().nodeValue.length); await p.settle(1);
    await p.tap("#ed-bold"); p.type(" konec"); await p.settle(1);
    t.fact("caret-bold-typing", html());
    await away(p);
    t.fact("saved-into-block", { tools: toolbar(p), steps: hist(p) });
    // the whole block
    await select(p, body());
    await p.tap("#ed-bold"); await p.tap("#ed-italic"); await p.tap("#ed-fs-inc");
    await p.tap("#ed-color"); await p.tap('#ed-swatches button[data-color="#1d4ed8"]'); await p.tap("#ed-color");
    await p.set("#ed-font", "'Merriweather', Georgia, serif");
    await p.tap("#ed-align-right");
    t.fact("box-format", { style: inner(body()).getAttribute("style"), html: html(), tools: toolbar(p) });
    await p.tap("#ed-ul"); t.fact("box-list", html());
    let steps = 0;
    while (!p.q("#ed-undo").disabled && steps < 80) { await undo(p); steps++; }
    t.fact("undo-everything", { steps, html: html(), style: inner(body()).getAttribute("style") });
    t.fact("errors", p.errors());
  },

  /* Crop: frame, handles, confirm / cancel, re-crop, undo, saved result. */
  async "adm-editor-crop"(t) {
    const p = await admin();
    await p.tap("#new-article-btn"); await p.settle();
    await p.file("#ed-image-file", "test.png", 400, 200, "#dd0000");
    const pic = () => byClass(p, "ed-el--image");
    const frame = () => p.q("#ed-canvas .ed-crop-frame"), layer = () => p.q("#ed-canvas .ed-crop");
    const handle = (h) => p.q('#ed-canvas .ed-crop-h[data-h="' + h + '"]');
    const svg = () => { const s = pic().querySelector("svg.vn-crop"); return s ? s.getAttribute("viewBox") + " / " + s.firstChild.getAttribute("viewBox") : null; };
    t.fact("inserted", { box: box(pic()), uploading: pic().classList.contains("is-uploading"), tools: toolbar(p), hist: hist(p) });
    await undo(p); t.fact("undo-insert", !!pic());
    await redo(p); t.fact("redo-insert", { there: !!pic(), blob: /^blob:/.test(pic().querySelector("img").src) });
    await select(p, pic());
    await p.tap("#ed-crop");
    t.fact("start", { layer: box(layer()), frame: box(frame()), handles: p.qa("#ed-canvas .ed-crop-h").length,
                      hidden: p.win.getComputedStyle(pic()).visibility, active: p.q("#ed-crop").classList.contains("is-active") });
    await p.drag(handle("e"), -180, 0); t.fact("handle-e", box(frame()));
    await p.key("Escape"); t.fact("escape", { layer: !!layer(), box: box(pic()), svg: svg() });
    await p.tap("#ed-crop"); await p.drag(handle("e"), -180, 0); await p.key("Enter");
    t.fact("enter", { box: box(pic()), svg: svg(), selected: pic().classList.contains("is-selected"), hist: hist(p) });
    await undo(p); t.fact("undo-crop", { box: box(pic()), svg: svg() });
    await redo(p); t.fact("redo-crop", { box: box(pic()), svg: svg() });
    await select(p, pic()); await p.tap("#ed-crop");
    t.fact("recrop-start", { layer: box(layer()), frame: box(frame()) });
    await p.drag(handle("e"), 90, 0); await p.drag(handle("s"), 0, -90); await p.drag(handle("nw"), 30, 20);
    t.fact("three-handles", box(frame()));
    await p.drag(frame(), 600, 40); t.fact("frame-moved", box(frame()));
    await p.drag(handle("w"), -2000, 0); await p.drag(handle("n"), 0, -2000); t.fact("clamped", box(frame()));
    await away(p);
    t.fact("click-away-confirms", { layer: !!layer(), box: box(pic()), svg: svg(), selected: pic().classList.contains("is-selected"), crop: !p.q("#ed-crop").hidden });
    await select(p, pic()); await p.tap("#ed-crop"); await p.tap("#ed-crop");
    t.fact("button-confirms-unchanged", { box: box(pic()), svg: svg() });
    await select(p, pic()); await p.tap("#ed-crop");
    await p.drag(handle("e"), 2000, 0); await p.drag(handle("s"), 0, 2000); await p.drag(handle("w"), -2000, 0); await p.drag(handle("n"), 0, -2000);
    await p.key("Enter");
    t.fact("whole-picture-again", { box: box(pic()), svg: svg() });
    await undo(p);
    // save and read back
    const title = byClass(p, "is-title");
    await edit(p, () => byClass(p, "is-title")); selectAll(p, inner(byClass(p, "is-title"))); p.type("Ořez"); await away(p);
    await p.tap("#ed-publish"); await p.settle();
    const list = (await api("/api/articles")).body;
    const a = list.find((x) => x.title === "Ořez");
    t.fact("saved", a ? clean(a.elements.filter((e) => e.type === "image")) : null);
    t.fact("errors", p.errors());
    void title;
  },

  /* Two zones: boundary lock, locked boxes, badges, Data panel <-> canvas. */
  async "adm-editor-zones"(t) {
    const p = await admin();
    await openArticle(p, "Fotbalový");                              // saved before the zones existed
    const body = () => byText(p, "Turnaj"), title = () => byClass(p, "is-title");
    t.fact("migrated", { blocks: describe(p), heroH: heroH(p), panel: { authors: chips(p, "authors"), tags: chips(p, "tags") }, hist: hist(p) });
    await t.snap(p, "migrated");
    await p.drag(inner(title()), 0, 600, { from: [0.1, 0.3] }); t.fact("title-down", { box: box(title()), heroH: heroH(p) });
    await p.drag(inner(title()), 0, -600, { from: [0.1, 0.3] }); t.fact("title-up", box(title()));
    await p.drag(inner(body()), 0, -500, { from: [0.1, 0.3] }); t.fact("body-up", box(body()));
    await p.drag(body().querySelector('.ed-handle[data-h="n"]'), 0, -300); t.fact("body-resize-up", box(body()));
    await select(p, title());
    await p.drag(title().querySelector('.ed-handle[data-h="s"]'), 0, 700); t.fact("title-resize-down", { box: box(title()), heroH: heroH(p) });
    await undo(p);
    // locked date box
    const date = () => byClass(p, "ed-role-date");
    await edit(p, date);
    t.fact("date-locked", { editable: inner(date()).isContentEditable, editing: date().classList.contains("is-editing"), tools: toolbar(p), title: inner(date()).title });
    await p.tap("#ed-fs-inc"); await p.tap("#ed-align-center"); await p.tap("#ed-bold"); await p.tap("#ed-ul"); await p.tap("#ed-indent-inc");
    t.fact("date-format", { style: inner(date()).getAttribute("style"), html: inner(date()).innerHTML, tools: toolbar(p) });
    await p.key("c", { ctrlKey: true }); t.fact("date-copy", toast(p));
    // badges
    const badge = (name) => p.qa("#ed-canvas .ed-role-tag").find((n) => n.querySelector(".vn-badge").textContent === name);
    await select(p, badge("Sport"));
    t.fact("badge", { tools: toolbar(p), handles: badge("Sport").querySelectorAll(".ed-handle").length, del: !!badge("Sport").querySelector(".ed-el-delete") });
    await p.drag(inner(badge("Sport")), 300, 60); t.fact("badge-moved", badges(p));
    await p.drag(inner(badge("Sport")), 0, 900); t.fact("badge-clamped", { badges: badges(p), heroH: heroH(p) });
    await away(p);
    // Data panel -> canvas
    await pick(p, "tags", "Humor"); t.fact("tag-added", { badges: badges(p), heroH: heroH(p) });
    await pick(p, "tags", "Škola"); t.fact("tag-added-2", badges(p));
    await p.tap(p.q('.ed-picker[data-list="tags"] [data-remove="Sport"]')); t.fact("tag-removed", badges(p));
    // canvas -> Data panel
    await select(p, badge("Humor")); await p.key("Delete");
    t.fact("badge-deleted", { badges: badges(p), panel: chips(p, "tags") });
    const authors = () => byClass(p, "ed-role-authors");
    await select(p, authors()); await p.tap(authors().querySelector(".ed-el-delete"));
    t.fact("authors-deleted", { box: !!authors(), panel: chips(p, "authors") });
    await pick(p, "authors", "Jan Novák"); await pick(p, "authors", "Petr Dlouhý");
    t.fact("authors-picked", { text: authors() && inner(authors()).textContent, box: box(authors()), panel: chips(p, "authors") });
    await p.set("#ed-date", "2026-03-05T10:00"); t.fact("date-changed", inner(date()).textContent);
    await select(p, date()); await p.key("Backspace");
    t.fact("date-deleted", { box: !!date(), panel: p.q("#ed-date").value, toast: toast(p) });
    await pick(p, "tags", "Cestování"); t.fact("date-stays-hidden", !date());
    await p.set("#ed-date", "2026-03-07T10:00"); t.fact("date-back", { text: date() && inner(date()).textContent, box: box(date()) });
    // undo / redo keep the panel in step
    await undo(p); t.fact("undo-1", { date: !!date(), tags: chips(p, "tags") });
    await undo(p); t.fact("undo-2", { tags: chips(p, "tags"), badges: badges(p) });
    await undo(p); await undo(p); t.fact("undo-4", { tags: chips(p, "tags"), authors: chips(p, "authors"), date: p.q("#ed-date").value });
    await redo(p); await redo(p); await redo(p); await redo(p);
    t.fact("redo-4", { tags: chips(p, "tags"), authors: chips(p, "authors"), date: p.q("#ed-date").value, dateText: date() && inner(date()).textContent });
    // thumbnail
    const thumb = () => byClass(p, "ed-role-thumb");
    await p.file("#ed-thumb-file", "nahled.png", 400, 300, "#ee8800");
    t.fact("thumb-uploaded", { box: box(thumb()), heroH: heroH(p), body: box(body()), panel: !p.q("#ed-thumb-preview").hidden });
    await select(p, thumb()); t.fact("thumb-tools", toolbar(p));
    await p.key("Delete"); t.fact("thumb-deleted", { box: !!thumb(), panel: !p.q("#ed-thumb-preview").hidden });
    await p.key("z", { ctrlKey: true }); t.fact("thumb-undo", { box: box(thumb()), panel: !p.q("#ed-thumb-preview").hidden });
    await p.tap("#ed-thumb-remove"); t.fact("thumb-removed-in-panel", { box: !!thumb(), panel: !p.q("#ed-thumb-preview").hidden });
    await undo(p);
    // the dividing line, auto-fit, new blocks
    await p.drag("#ed-canvas > .ed-hero-divider", 0, 60, { from: [0.2, 0.5] }); t.fact("divider-down", { heroH: heroH(p), body: box(body()) });
    await p.drag("#ed-canvas > .ed-hero-divider", 0, -900, { from: [0.2, 0.5] }); t.fact("divider-up-min", { heroH: heroH(p), body: box(body()) });
    await edit(p, title); selectAll(p, inner(title()));
    p.type("Velmi dlouhý titulek článku, který se zalomí na několik řádků a zvětší černou část stránky"); await p.settle(2);
    t.fact("long-title", { heroH: heroH(p), body: box(body()), title: box(title()), h: title().offsetHeight });
    await away(p);
    await p.tap("#ed-add-text"); t.fact("new-block-in-body", { box: box(p.q("#ed-canvas .is-selected")), hero: p.q("#ed-canvas .is-selected").classList.contains("is-hero") });
    await p.key("c", { ctrlKey: true }); await p.key("v", { ctrlKey: true });
    t.fact("paste", { n: blocks(p).length, box: box(p.q("#ed-canvas .is-selected")) });
    await select(p, thumb()); await p.key("c", { ctrlKey: true }); await p.key("v", { ctrlKey: true });
    t.fact("paste-thumb-copy", { cls: p.q("#ed-canvas .is-selected").className, box: box(p.q("#ed-canvas .is-selected")), thumbs: p.qa("#ed-canvas .ed-role-thumb").length });
    await t.snap(p, "edited");
    const edited = describe(p);
    await away(p);
    await p.tap("#ed-publish"); await p.settle();
    t.fact("published", { closed: p.q("#editor-overlay").hidden, toast: toast(p), article: await saved("a2") });
    const r = await open("/article?id=a2", 1440, 900);               // the reader shows the same layout
    const origin = (sel) => r.q(sel).getBoundingClientRect();
    const hr = origin(".article-canvas--hero");
    t.fact("reader", {
      heroH: Math.round(hr.height),
      hero: r.qa(".article-canvas--hero > *").map((n) => { const b = n.getBoundingClientRect(); return [n.textContent.slice(0, 20), Math.round(b.left - hr.left), Math.round(b.top - hr.top)]; }),
      editor: edited.filter((e) => /is-hero/.test(e.cls)).map((e) => [e.text.slice(0, 20), e.box])
    });
    await t.snap(r, "reader");
    t.fact("errors", p.errors().concat(r.errors()));
  },

  /* Everything else in the editor: blocks, layers, background, embeds, files, drop, publish, schedule, delete. */
  async "adm-editor-misc"(t) {
    const p = await admin();
    await p.tap("#new-article-btn"); await p.settle();
    const sel = () => p.q("#ed-canvas .is-selected");
    await edit(p, () => byClass(p, "is-title")); selectAll(p, inner(byClass(p, "is-title"))); p.type("Nový článek z testu"); await away(p);
    await p.tap("#ed-add-text"); const first = box(sel());
    await p.key("c", { ctrlKey: true }); t.fact("copy", toast(p));
    await p.key("v", { ctrlKey: true }); await p.key("v", { ctrlKey: true });
    t.fact("paste-twice", { first, boxes: blocks(p).filter((n) => !n.classList.contains("is-hero")).map(box), toast: toast(p) });
    const zs = () => blocks(p).filter((n) => !n.classList.contains("is-hero")).map((n) => n.style.zIndex);
    t.fact("z-start", zs());
    for (const action of ["back", "forward", "front", "backward"]) {
      await p.tap("#ed-layer"); await p.tap('#ed-layer-menu [data-layer="' + action + '"]');
      t.fact("layer-" + action, { z: zs(), menuHidden: p.q("#ed-layer-menu").hidden });
    }
    await away(p);
    await p.tap("#ed-bg");
    p.input("#ed-bg-color", "#ffeecc"); t.fact("bg-color", { bg: canvas(p).style.backgroundColor, hex: p.q("#ed-bg-hex").value });
    await p.set("#ed-bg-hex", "#112233"); t.fact("bg-hex", canvas(p).style.backgroundColor);
    await p.set("#ed-bg-hex", "nonsense"); t.fact("bg-hex-bad", { bg: canvas(p).style.backgroundColor, field: p.q("#ed-bg-hex").value });
    await p.file("#ed-bg-file", "pozadi.png", 300, 200, "#00aa88"); t.fact("bg-image", { img: /url\(/.test(canvas(p).style.backgroundImage), toast: toast(p) });
    await p.tap("#ed-bg-clear"); t.fact("bg-clear", { bg: canvas(p).style.backgroundColor, img: canvas(p).style.backgroundImage });
    p.input("#ed-bg-color", "#f5f5dc");
    await p.tap("#ed-bg");
    // video
    await p.tap("#ed-add-embed");
    p.input("#ed-embed-url", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"); await p.settle();
    t.fact("embed-ready", { status: p.text("#ed-embed-status"), disabled: p.q("#ed-embed-ok").disabled });
    p.q("#ed-embed-form").requestSubmit(); await p.settle();
    t.fact("embed-inserted", { dialog: p.q("#ed-embed-dialog").hidden, cls: sel().className, box: box(sel()), tools: toolbar(p) });
    // PDF through the picker, a picture dropped onto the page
    const pdf = new p.win.DataTransfer();
    pdf.items.add(new p.win.File(["%PDF-1.4 parity"], "rozvrh hodin.pdf", { type: "application/pdf" }));
    p.q("#ed-image-file").files = pdf.files; p.q("#ed-image-file").dispatchEvent(new p.win.Event("change", { bubbles: true }));
    await sleep(60); await p.settle(4);
    t.fact("pdf", { cls: sel().className, text: sel().textContent.trim(), box: box(sel()), toast: toast(p) });
    const bad = new p.win.DataTransfer();
    bad.items.add(new p.win.File(["x"], "notes.txt", { type: "text/plain" }));
    p.q("#ed-image-file").files = bad.files; p.q("#ed-image-file").dispatchEvent(new p.win.Event("change", { bubbles: true }));
    await p.settle(); t.fact("bad-type", toast(p));
    const cv = p.doc.createElement("canvas"); cv.width = 120; cv.height = 80; cv.getContext("2d").fillRect(0, 0, 120, 80);
    const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
    const dropped = new p.win.DataTransfer(); dropped.items.add(new p.win.File([blob], "drop.png", { type: "image/png" }));
    const cr = canvas(p).getBoundingClientRect();
    canvas(p).dispatchEvent(new p.win.DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dropped, clientX: cr.left + 600, clientY: cr.top + 700 }));
    canvas(p).dispatchEvent(new p.win.DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dropped, clientX: cr.left + 600, clientY: cr.top + 700 }));
    await sleep(60); await p.settle(4);
    t.fact("drop", { cls: sel() && sel().className, box: box(sel()) });
    // embed: click a selected video = live preview, another block stops it
    const video = byClass(p, "ed-el--embed");
    await select(p, video); await select(p, byClass(p, "ed-el--embed"));
    t.fact("embed-play", !!byClass(p, "ed-el--embed").querySelector("iframe"));
    await away(p); t.fact("embed-stop", !!byClass(p, "ed-el--embed").querySelector("iframe"));
    // Data panel
    await pick(p, "authors", "Eva Malá"); await pick(p, "tags", "Sport"); await p.set("#ed-kind", "comic");
    t.fact("before-publish", { blocks: describe(p), heroH: heroH(p), pageH: pageH(p), publish: p.text("#ed-publish") });
    await p.tap("#ed-publish"); await p.settle();
    let list = (await api("/api/articles")).body;
    const made = list.find((a) => a.title === "Nový článek z testu");
    t.fact("published", { closed: p.q("#editor-overlay").hidden, toast: toast(p), article: made ? clean(made) : null,
                          cards: p.texts("#article-grid .card-title") });
    // open again and publish with no change: nothing is stored
    const ops = async () => (await (await fetch("/__ops")).json()).advanced;
    await openArticle(p, "Nový článek z testu");
    const before = await ops();
    await p.tap("#ed-publish"); await p.settle();
    t.fact("no-change", { toast: toast(p), closed: p.q("#editor-overlay").hidden, stored: (await ops()) - before });
    // schedule
    await openArticle(p, "Nový článek z testu");
    await p.set("#ed-date", "2031-05-05T10:00");
    t.fact("schedule-ui", { publish: p.text("#ed-publish"), hint: p.text("#ed-sched-hint"), cls: p.q("#ed-date-field").className });
    await t.snap(p, "scheduled-ui");
    await p.tap("#ed-publish"); await p.settle();
    t.fact("scheduled", { toast: toast(p), badge: p.qa("#article-grid .card").filter((c) => c.querySelector(".sched-badge")).map((c) => c.querySelector(".card-title").textContent) });
    await logout();
    t.fact("public-does-not-see-it", ((await api("/api/articles")).body || []).some((a) => a.title === "Nový článek z testu"));
    await api("/api/login", "POST", { password: "test" });
    // discard, then delete
    await openArticle(p, "Nový článek z testu");
    await p.tap("#ed-add-text");
    await p.tap("#ed-back-nochange"); await p.tap("#ed-confirm-ok");
    t.fact("discard", { closed: p.q("#editor-overlay").hidden, toast: toast(p) });
    await openArticle(p, "Nový článek z testu");
    t.fact("discarded-not-saved", blocks(p).length);
    await p.tap("#ed-delete"); await p.tap("#ed-confirm-ok"); await p.settle();
    t.fact("deleted", { closed: p.q("#editor-overlay").hidden, toast: toast(p), cards: p.texts("#article-grid .card-title") });
    // a new article thrown away before it was ever saved
    await p.tap("#new-article-btn"); await p.settle(); await p.tap("#ed-delete"); await p.tap("#ed-confirm-ok"); await p.settle();
    t.fact("new-discarded", { closed: p.q("#editor-overlay").hidden, toast: toast(p) });
    // a title is required
    await p.tap("#new-article-btn"); await p.settle();
    await edit(p, () => byClass(p, "is-title")); selectAll(p, inner(byClass(p, "is-title"))); p.doc.execCommand("delete"); await away(p);
    await p.tap("#ed-publish"); await p.settle();
    t.fact("no-title", { closed: p.q("#editor-overlay").hidden, toast: toast(p) });
    t.fact("errors", p.errors());
  },

  /* The session ends while the editor is open: log in again on top of it, nothing is lost. */
  async "adm-session"(t) {
    const p = await admin();
    await openArticle(p, "Výlet");
    await p.tap("#ed-add-text");
    await logout();
    await p.tap("#ed-publish"); await p.settle();
    t.fact("expired", { login: !p.q("#login-screen").hidden, modal: p.q("#login-screen").classList.contains("is-modal"),
                        editorOpen: !p.q("#editor-overlay").hidden, toast: toast(p), blocks: blocks(p).length });
    await t.snap(p, "login-over-editor");
    p.q("#login-password").value = "test"; p.q("#login-form").requestSubmit(); await p.settle();
    t.fact("logged-in-again", { login: p.q("#login-screen").hidden, editorOpen: !p.q("#editor-overlay").hidden, blocks: blocks(p).length });
    await p.tap("#ed-publish"); await p.settle();
    t.fact("saved", { closed: p.q("#editor-overlay").hidden, toast: toast(p), article: await saved("a4") });
    t.fact("errors", p.errors());
  }
};
