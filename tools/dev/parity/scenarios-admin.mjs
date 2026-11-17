// Parity scenarios — the admin outside the article editor: login, article
// list, tag/author lists, homepage layout editor, About, Contacts.
import { open, api, clean, sleep, logout } from "./core.mjs";
import { admin, openArticle } from "./scenarios-editor.mjs";

const toast = (p) => p.text("#toast");
const tab = async (p, name) => { await p.tap('.admin-nav-link[data-tab="' + name + '"]'); await p.settle(); };
const ops = async () => (await (await fetch("/__ops")).json()).advanced;
const content = async () => clean((await api("/api/content")).body);

export default {
  async "adm-login"(t) {
    await logout();
    const p = await admin();
    const state = () => ({ login: !p.q("#login-screen").hidden, shell: !p.q("#admin-shell").hidden,
                           nav: p.q("#admin-headernav") ? !p.q("#admin-headernav").hidden : null, tag: p.q("#admin-tag") ? !p.q("#admin-tag").hidden : null });
    t.fact("logged-out", state());
    await t.snap(p, "login");
    p.q("#login-password").value = "wrong"; p.q("#login-form").requestSubmit(); await p.settle();
    t.fact("wrong-password", { error: p.text("#login-error"), state: state() });
    await t.snap(p, "login-error");
    p.q("#login-password").value = " test "; p.q("#login-form").requestSubmit(); await p.settle();
    t.fact("logged-in", { state: state(), cards: p.texts("#article-grid .card-title"), field: p.q("#login-password").value });
    await t.snap(p, "list");
    await p.tap("#logout-btn"); await p.settle();
    t.fact("logged-out-again", state());
    t.fact("session", clean(await api("/api/login")));
    t.fact("errors", p.errors());
  },

  async "adm-list"(t) {
    const p = await admin();
    const cards = () => p.qa("#article-grid .card").map((c) => c.textContent.replace(/\s+/g, " ").trim());
    const tick = async (list, label) => {
      const i = p.qa(list + " label").find((x) => x.textContent.trim().startsWith(label)).querySelector("input");
      i.checked = !i.checked;
      i.dispatchEvent(new p.win.Event("change", { bubbles: true }));
      await p.settle(1);
    };
    t.fact("cards", { cards: cards(), thumbs: p.qa("#article-grid .card-media img").map((i) => i.getAttribute("src")),
                      tags: p.texts("#article-tag-list label"), authors: p.texts("#article-author-list label") });
    await tick("#article-tag-list", "Humor"); t.fact("humor", cards());
    await tick("#article-author-list", "Jan"); t.fact("humor-and-jan", cards());
    await t.snap(p, "filtered");
    await tick("#article-tag-list", "Sport"); t.fact("humor-or-sport-and-jan", cards());
    await p.tap("#article-clear-tags"); t.fact("cleared", { n: cards().length, ticked: p.qa("#article-tag-filter input:checked").length });
    // a card opens the editor by keyboard too
    const card = p.q("#article-grid .card"); card.focus();
    await p.key("Enter"); await p.settle();
    t.fact("enter-opens", { open: !p.q("#editor-overlay").hidden, body: p.doc.body.className });
    await p.tap("#ed-back-nochange"); await p.tap("#ed-confirm-ok");
    t.fact("closed", { open: !p.q("#editor-overlay").hidden, body: p.doc.body.className, toast: toast(p) });
    for (const name of ["home", "about", "contact", "articles"]) {
      await tab(p, name);
      t.fact("tab-" + name, { shown: p.qa(".admin-section").filter((s) => !s.hidden).map((s) => s.id),
                              active: p.qa(".admin-nav-link.is-active").map((l) => l.dataset.tab), docked: !!p.q(".ed-bar2.is-docked") });
      await t.snap(p, "tab-" + name);
    }
    t.fact("errors", p.errors());
    const n = await admin(700, 900);
    await t.snap(n, "narrow-list");
    await tab(n, "home"); await t.snap(n, "narrow-home");
    await tab(n, "about"); await t.snap(n, "narrow-about");
  },

  /* „Upravit filtry": add, duplicate warning, rename and delete with the cascade into articles. */
  async "adm-taxonomy"(t) {
    const p = await admin();
    const chipsOf = (list) => p.texts('.tx-chips[data-list="' + list + '"] .tx-chip');
    const chip = (name) => p.qa(".tx-chip").find((c) => c.dataset.name === name);
    const form = (list) => p.q('.tx-add[data-list="' + list + '"]');
    const typeIn = (f, value) => { const i = f.querySelector("input"); i.value = value; i.dispatchEvent(new p.win.Event("input", { bubbles: true })); };
    const dup = (f) => !f.querySelector(".tx-dup").hidden;
    const server = async () => {
      const list = (await api("/api/articles")).body;
      return clean({ lists: (await api("/api/taxonomy")).body,
        articles: list.map((a) => ({ id: a.id, tags: a.tags, authors: a.authors, none: a.tagsUnspecified,
                                     badges: (a.elements || []).filter((e) => e.role === "tag").map((e) => e.tag) })) });
    };
    await p.tap("#tx-open-btn"); await p.settle();
    t.fact("open", { tags: chipsOf("tags"), authors: chipsOf("authors") });
    await t.snap(p, "dialog");
    typeIn(form("tags"), "sport"); t.fact("dup-live", dup(form("tags")));
    form("tags").requestSubmit(); await p.settle();
    t.fact("dup-submit", { dup: dup(form("tags")), tags: chipsOf("tags") });
    await t.snap(p, "duplicate");
    typeIn(form("tags"), "Věda"); t.fact("dup-cleared", dup(form("tags")));
    form("tags").requestSubmit(); await p.settle();
    t.fact("added", { tags: chipsOf("tags"), toast: toast(p), field: form("tags").querySelector("input").value });
    typeIn(form("tags"), "  Nespecifikováno "); form("tags").requestSubmit(); await p.settle();
    t.fact("reserved", { toast: toast(p), tags: chipsOf("tags") });
    typeIn(form("tags"), "");
    typeIn(form("authors"), "Nová Autorka"); form("authors").requestSubmit(); await p.settle();
    t.fact("author-added", chipsOf("authors"));
    await p.tap(chip("Humor"));
    t.fact("menu", p.texts(".tx-menu button"));
    await t.snap(p, "menu");
    await p.tap('.tx-menu [data-tx="edit"]');
    await t.snap(p, "edit");
    typeIn(p.q(".tx-edit"), "škola"); t.fact("rename-dup", dup(p.q(".tx-edit")));
    typeIn(p.q(".tx-edit"), "Vtipy"); p.q(".tx-edit").requestSubmit(); await p.settle();
    t.fact("renamed", { tags: chipsOf("tags"), toast: toast(p), server: await server(), listFilter: p.texts("#article-tag-list label") });
    await p.tap(chip("Vtipy")); await p.tap('.tx-menu [data-tx="delete"]');
    t.fact("delete-confirm", p.text(".tx-menu-q"));
    await t.snap(p, "delete-confirm");
    await p.tap('.tx-menu [data-tx="cancel"]');
    t.fact("delete-cancelled", chipsOf("tags"));
    await p.tap(chip("Vtipy")); await p.tap('.tx-menu [data-tx="delete"]'); await p.tap('.tx-menu [data-tx="delete-yes"]'); await p.settle();
    t.fact("deleted", { tags: chipsOf("tags"), toast: toast(p), server: await server(),
                        cards: p.qa("#article-grid .card").map((c) => c.textContent.replace(/\s+/g, " ").trim()) });
    await p.tap(chip("Eva Malá")); await p.tap('.tx-menu [data-tx="edit"]');
    typeIn(p.q(".tx-edit"), "Eva M."); p.q(".tx-edit").requestSubmit(); await p.settle();
    await p.tap(chip("Petr Dlouhý")); await p.tap('.tx-menu [data-tx="delete"]'); await p.tap('.tx-menu [data-tx="delete-yes"]'); await p.settle();
    t.fact("authors-changed", { authors: chipsOf("authors"), toast: toast(p), server: await server() });
    await p.tap(chip("Sport")); await p.key("Escape");
    t.fact("escape-closes-menu", { menu: !!p.q(".tx-menu"), dialog: !p.q("#tx-dialog").hidden });
    await p.key("Escape"); t.fact("escape-closes-dialog", !p.q("#tx-dialog").hidden);
    await p.tap("#tx-open-btn"); await p.settle();
    const d = p.q("#tx-dialog"), r = d.getBoundingClientRect();
    await p.tap(d, [r.left + 5, r.top + 5]);
    t.fact("backdrop-closes", !d.hidden);
    // the editor follows: badges and authors of the article saved with zones
    await openArticle(p, "Vtipy o učitelích");
    t.fact("editor-after", { badges: p.qa("#ed-canvas .ed-role-tag").map((n) => n.textContent.trim() + "@" + n.style.left + "," + n.style.top),
      authors: p.text("#ed-canvas .ed-role-authors .ed-el-content"),
      panel: { tags: p.qa('.ed-picker[data-list="tags"] .ed-pick-chip').map((n) => n.firstChild.textContent),
               authors: p.qa('.ed-picker[data-list="authors"] .ed-pick-chip').map((n) => n.firstChild.textContent),
               options: p.qa('.ed-picker[data-list="tags"] option').map((o) => o.textContent) } });
    await t.snap(p, "editor-after");
    // renaming while the editor is open: the picked chips and the badge follow
    await p.tap("#ed-tx-open"); await p.settle();
    await p.tap(chip("Škola")); await p.tap('.tx-menu [data-tx="edit"]');
    typeIn(p.q(".tx-edit"), "Školní život"); p.q(".tx-edit").requestSubmit(); await p.settle();
    await p.tap("#tx-close");
    t.fact("renamed-under-editor", { badges: p.qa("#ed-canvas .ed-role-tag").map((n) => n.textContent.trim()),
      panel: p.qa('.ed-picker[data-list="tags"] .ed-pick-chip').map((n) => n.firstChild.textContent), editorOpen: !p.q("#editor-overlay").hidden });
    t.fact("errors", p.errors());
    const pub = await open("/article?id=a1", 1440, 900);            // the reader follows too
    t.fact("reader-after", { badges: pub.texts(".vn-badge"), heroTexts: pub.qa(".article-canvas--hero > *").map((n) => n.textContent.trim()) });
    await t.snap(pub, "reader-after");
  },

  /* Homepage layout editor: select, resize, add, pick an article, drag, arrows, preview, save. */
  async "adm-home"(t) {
    const p = await admin();
    await tab(p, "home");
    const host = () => p.q("#home-canvas-editor");
    const node = (id) => p.q('#home-canvas-editor .hl-block[data-block-id="' + id + '"]');
    const layout = () => p.qa("#home-canvas-editor .hl-row").map((r) => Array.from(r.children).map((b) =>
      (/^b-/.test(b.dataset.blockId) && b.dataset.blockId.length < 10 ? b.dataset.blockId : "new") + "[" + b.style.gridColumn + "]" +
      (b.classList.contains("is-selected") ? "*" : "") + (b.classList.contains("is-empty") ? "(empty)" : "")));
    const unsaved = () => !p.q("#hl-unsaved").hidden;
    const selected = () => p.qa("#home-canvas-editor .hl-block.is-selected").map((b) => b.dataset.blockId.length < 10 ? b.dataset.blockId : "new");
    t.fact("loaded", { layout: layout(), unsaved: unsaved(), titles: p.texts("#home-canvas-editor .hl-title"), badges: p.texts("#home-canvas-editor .hl-badge") });
    await t.snap(p, "loaded");
    await p.tap(node("b-a1"), p.point(node("b-a1"), 0.5, 0.7));
    t.fact("selected", { selected: selected(), chrome: p.qa('[data-block-id="b-a1"] .hl-chrome button').map((b) => b.textContent + (b.classList.contains("is-on") ? "!" : "")) });
    await t.snap(p, "selected");
    await p.tap('[data-block-id="b-a1"] .hl-chrome button[data-arg="2"]');
    t.fact("resized", { layout: layout(), unsaved: unsaved(), toast: toast(p) });
    await p.tap('[data-block-id="b-a1"] .hl-chrome button[data-arg="1"]');
    await p.tap(node("b-b"), p.point(node("b-b"), 0.5, 0.7));
    await p.tap('[data-block-id="b-b"] .hl-chrome button[data-act="delete"]');
    t.fact("deleted", layout());
    // drag the second card into the freed boxes of the same row
    const c = p.q("#home-canvas-editor .hl-canvas").getBoundingClientRect(), pitch = (c.width - 72) / 4 + 24;
    const from = node("b-a2").getBoundingClientRect();
    await p.drag(node("b-a2"), c.left + 3 * pitch - from.left, 0, { from: [0.5, 0.6], steps: 4 });
    t.fact("dragged-in-row", { layout: layout(), ghost: p.qa(".hl-ghost, .hl-gridlines, .hl-drop").length });
    // …and into the row below (r4 has free boxes 1-2... the block is 1 wide)
    const row4 = node("b-c").parentNode.getBoundingClientRect(), a2 = node("b-a2").getBoundingClientRect();
    await p.drag(node("b-a2"), c.left + 3 * pitch - a2.left - 0, row4.top + row4.height / 2 - (a2.top + a2.height * 0.6), { from: [0.5, 0.6], steps: 4 });
    t.fact("dragged-to-row", layout());
    // arrows move the selected block by one box, Esc deselects
    await p.tap(node("b-a1"), p.point(node("b-a1"), 0.5, 0.7));
    await p.key("ArrowRight"); t.fact("arrow-right", layout());
    await p.key("ArrowDown"); t.fact("arrow-down", layout());
    await p.key("ArrowUp"); await p.key("ArrowUp"); t.fact("arrow-up-twice", layout());
    await p.key("ArrowLeft"); await p.key("ArrowLeft"); t.fact("arrow-left", layout());
    await p.key("Escape"); t.fact("escape", selected());
    // palette: a text block (ready to type) and a post block with the picker
    await p.tap('#hl-palette button[data-add="text"]');
    t.fact("text-added", { layout: layout(), focus: p.doc.activeElement.className, selection: String(p.win.getSelection()) });
    p.type("Ahoj světe"); await p.settle(1);
    const body = () => p.q("#home-canvas-editor .hl-block.is-selected .hl-text-body");
    p.selectWord(body(), "světe"); await p.settle(1);
    await p.tap("#ed-bold"); await p.tap("#ed-align-center");
    t.fact("text-typed", { html: body().innerHTML, docked: !!p.q(".ed-bar2.is-docked"), tools: p.q("#ed-format-tools").classList.contains("is-visible") });
    await t.snap(p, "text-editing");
    await p.tap("#section-home .admin-section-title");
    t.fact("click-away", { selected: selected(), unsaved: unsaved() });
    await p.tap('#hl-palette button[data-add="B"]');
    t.fact("post-added", layout());
    await p.tap("#home-canvas-editor .hl-block.is-selected .hl-plus"); await p.settle();
    t.fact("picker", { open: !p.q("#hl-picker").hidden, items: p.texts("#hl-picker-list li") });
    await t.snap(p, "picker");
    p.input("#hl-picker-search", "výlet"); t.fact("picker-search", p.texts("#hl-picker-list li"));
    p.input("#hl-picker-search", "zzz"); t.fact("picker-none", p.texts("#hl-picker-list li"));
    p.input("#hl-picker-search", "výlet");
    await p.tap("#hl-picker-list button[data-id]");
    t.fact("assigned", { open: !p.q("#hl-picker").hidden, title: p.text("#home-canvas-editor .hl-block.is-selected .hl-title"), layout: layout() });
    await p.tap('#home-canvas-editor .hl-block.is-selected .hl-chrome button[data-act="pick"]'); await p.settle();
    await p.tap("#hl-picker-clear");
    t.fact("cleared", layout());
    await p.tap("#home-canvas-editor .hl-block.is-selected .hl-plus"); await p.settle();
    await p.key("Escape"); t.fact("picker-escape", !p.q("#hl-picker").hidden);
    // phone preview: layout changes are refused there
    await p.tap('#hl-palette button[data-view="mobile"]');
    t.fact("mobile", { cls: p.q("#home-frame-host").className, pressed: p.qa("#hl-palette button[data-view]").map((b) => b.getAttribute("aria-pressed")) });
    await t.snap(p, "mobile-preview");
    await p.tap(node("b-a1"), p.point(node("b-a1"), 0.5, 0.7)); await p.key("ArrowRight");
    t.fact("mobile-arrow", { toast: toast(p), layout: layout() });
    await p.tap('#hl-palette button[data-view="desktop"]');
    // page background from the docked toolbar
    await p.tap("#ed-bg"); p.input("#ed-bg-color", "#f0f8ff");
    t.fact("background", { bg: p.q("#home-frame").style.backgroundColor, cls: p.q("#home-frame").className, unsaved: unsaved() });
    await p.tap("#ed-bg");
    // other tabs keep the draft; saving publishes it
    await tab(p, "about"); await tab(p, "home");
    t.fact("draft-kept", { layout: layout(), unsaved: unsaved() });
    const before = await content();
    await p.tap("#save-home-btn"); await p.settle();
    const after = await content();
    t.fact("saved", { toast: toast(p), unsaved: unsaved(), changed: JSON.stringify(before.home) !== JSON.stringify(after.home), home: after.home });
    const stored = await ops();
    await p.tap("#save-home-btn"); await p.settle();
    t.fact("save-again", { stored: (await ops()) - stored, toast: toast(p) });
    t.fact("errors", p.errors());
    void host;
    const pub = await open("/#home", 1440, 900);
    t.fact("public", { titles: pub.texts("#home-canvas .hl-title"), bg: pub.q("#home-frame").style.backgroundColor });
    await t.snap(pub, "public-after");
  },

  /* „O nás": the document, the team members, the page background. */
  async "adm-about"(t) {
    const p = await admin();
    await tab(p, "about");
    const doc = () => p.q("#about-doc");
    const rows = () => p.qa("#team-tbody tr").map((r) => r.textContent.replace(/\s+/g, " ").trim() + (r.querySelector(".thumb[style]") ? " [photo]" : ""));
    t.fact("loaded", { html: doc().innerHTML, team: rows(), docked: !!p.q("#about-toolbar-slot .ed-bar2"), workspace: !p.q("#team-workspace").hidden });
    doc().focus();
    const last = doc().lastChild; p.select(last, last.childNodes.length, last, last.childNodes.length);
    p.type(" Nová věta."); await p.settle(1);
    p.selectWord(doc(), "Nová"); await p.settle(1);
    await p.tap("#ed-bold"); await p.tap("#ed-color"); await p.tap('#ed-swatches button[data-color="#15a34a"]'); await p.tap("#ed-color");
    t.fact("edited", doc().innerHTML);
    await t.snap(p, "edited");
    await p.tap("#save-about-btn"); await p.settle();
    t.fact("saved", { toast: toast(p), about: (await content()).about });
    const stored = await ops();
    await p.tap("#save-about-btn"); await p.settle();
    t.fact("save-again", { stored: (await ops()) - stored, toast: toast(p) });
    // team
    await p.tap("#team-add-btn");
    t.fact("workspace-open", { open: !p.q("#team-workspace").hidden, title: p.text("#team-form-title"), submit: p.text("#team-submit-btn") });
    await t.snap(p, "team-workspace");
    p.q("#team-form").requestSubmit(); await p.settle();
    t.fact("name-required", toast(p));
    p.q("#tm-name").value = "Test Člen"; p.q("#tm-role").value = "Fotograf";
    await p.file("#tm-image-file", "foto.png", 200, 200, "#3366cc");
    t.fact("photo", { preview: !p.q("#tm-preview").hidden, toast: toast(p) });
    p.q("#team-form").requestSubmit(); await p.settle();
    t.fact("member-added", { team: rows(), toast: toast(p), workspace: !p.q("#team-workspace").hidden, server: (await content()).team });
    await p.tap(p.qa('#team-tbody [data-action="team-edit"]')[1]);
    t.fact("edit-form", { name: p.q("#tm-name").value, role: p.q("#tm-role").value, title: p.text("#team-form-title"), submit: p.text("#team-submit-btn"),
                          open: !p.q("#team-workspace").hidden });
    p.q("#tm-role").value = "Korektor"; p.input("#tm-image-url", "/logo.png");
    p.q("#team-form").requestSubmit(); await p.settle();
    t.fact("member-edited", { team: rows(), toast: toast(p) });
    await p.tap(p.qa('#team-tbody [data-action="team-delete"]')[0]); await p.settle();
    t.fact("member-deleted", { team: rows(), toast: toast(p), server: (await content()).team });
    await p.tap("#team-add-btn"); p.q("#tm-name").value = "Zrušený"; await p.tap("#team-reset-btn");
    t.fact("reset", p.q("#tm-name").value);
    await p.tap("#team-close-btn"); t.fact("closed", !p.q("#team-workspace").hidden);
    // page background (saved by itself a moment after the change)
    await p.tap("#ed-bg"); p.input("#ed-bg-color", "#ffeedd");
    await sleep(900); await p.settle();
    t.fact("background", { bg: doc().style.backgroundColor, toast: toast(p), server: (await content()).about.background });
    await p.tap("#ed-bg-clear"); await sleep(900); await p.settle();
    t.fact("background-cleared", (await content()).about.background);
    t.fact("errors", p.errors());
    const pub = await open("/#about", 1440, 900);
    t.fact("public", { html: pub.q("#about-text").innerHTML, team: pub.texts("#team-grid > *") });
    await t.snap(pub, "public-after");
  },

  async "adm-contact"(t) {
    const p = await admin();
    await tab(p, "contact");
    const rows = () => p.qa("#contact-tbody tr").map((r) => r.textContent.replace(/\s+/g, " ").trim());
    const fill = (type, label, url) => { p.q("#ct-type").value = type; p.q("#ct-label").value = label; p.q("#ct-url").value = url; };
    t.fact("loaded", { subtitle: p.q("#contact-subtitle-input").value, rows: rows() });
    p.q("#contact-subtitle-input").value = "Nový podnadpis";
    await p.tap("#save-subtitle-btn"); await p.settle();
    t.fact("subtitle", { toast: toast(p), server: (await content()).contact.subtitle });
    p.q("#contact-form").requestSubmit(); await p.settle();
    t.fact("label-required", toast(p));
    fill("Odkaz", "Zlý odkaz", "javascript:alert(1)"); p.q("#contact-form").requestSubmit(); await p.settle();
    t.fact("bad-url", { toast: toast(p), rows: rows().length });
    fill("YouTube", "@kanal", "https://youtube.com/@kanal"); p.q("#contact-form").requestSubmit(); await p.settle();
    t.fact("added", { rows: rows(), toast: toast(p), form: [p.q("#ct-label").value, p.text("#contact-form-title"), p.text("#contact-submit-btn")] });
    await p.tap(p.qa('#contact-tbody [data-action="contact-edit"]')[0]);
    t.fact("edit-form", [p.q("#ct-type").value, p.q("#ct-label").value, p.q("#ct-url").value, p.text("#contact-form-title"), p.text("#contact-submit-btn")]);
    p.q("#ct-label").value = "redakce@skola.cz"; p.q("#ct-url").value = "mailto:redakce@skola.cz";
    p.q("#contact-form").requestSubmit(); await p.settle();
    t.fact("edited", { rows: rows(), toast: toast(p) });
    await p.tap(p.qa('#contact-tbody [data-action="contact-delete"]')[1]); await p.settle();
    t.fact("deleted", { rows: rows(), toast: toast(p), server: (await content()).contact });
    await p.tap(p.qa('#contact-tbody [data-action="contact-edit"]')[0]); await p.tap("#contact-reset-btn");
    t.fact("reset", [p.q("#ct-label").value, p.text("#contact-form-title")]);
    await t.snap(p, "contacts");
    t.fact("errors", p.errors());
    const pub = await open("/#contact", 1440, 900);
    t.fact("public", { subtitle: pub.text("#contact-subtitle"), items: pub.qa("#contact-list > li").map((li) => li.textContent.replace(/\s+/g, " ").trim()) });
    await t.snap(pub, "public-after");
  },

  // What the server answers to a signed-in admin.
  async "api-admin"(t) {
    for (const path of ["/api/articles", "/api/articles?id=a6", "/api/login", "/api/taxonomy"]) t.fact("GET " + path, clean(await api(path)));
    const calls = [
      ["POST", "/api/articles", { title: "  Z API  ", body: "text", tags: ["Sport", "neexistuje", "sport"], authors: "Eva Malá, Nikdo", date: "2026-05-05",
                                  publishAt: "2026-05-05T10:00:00.000Z", kind: "comic", heroHeight: 250.6, elements: [{ id: "x", type: "text", content: "a" }], id: "forged" }],
      ["PUT", "/api/articles?id=a4", { title: "Výlet do Brna", tags: [], tagsUnspecified: true }],
      ["PUT", "/api/articles?id=a7", { tags: ["Humor"] }],
      ["PUT", "/api/articles?id=missing", { title: "x" }],
      ["PUT", "/api/articles", { title: "x" }],
      ["DELETE", "/api/articles?id=a5"],
      ["DELETE", "/api/articles?id=a5"],
      ["DELETE", "/api/articles"],
      ["POST", "/api/taxonomy", { list: "tags", action: "add", name: "  Nový   štítek " }],
      ["POST", "/api/taxonomy", { list: "tags", action: "add", name: "nový štítek" }],
      ["POST", "/api/taxonomy", { list: "tags", action: "add", name: "nespecifikováno" }],
      ["POST", "/api/taxonomy", { list: "tags", action: "add", name: "" }],
      ["POST", "/api/taxonomy", { list: "colors", action: "add", name: "x" }],
      ["POST", "/api/taxonomy", { list: "tags", action: "explode", name: "x" }],
      ["POST", "/api/taxonomy", { list: "tags", action: "rename", name: "Humor", to: "Vtip" }],
      ["POST", "/api/taxonomy", { list: "tags", action: "rename", name: "Nope", to: "X" }],
      ["POST", "/api/taxonomy", { list: "authors", action: "delete", name: "Jan Novák" }],
      ["POST", "/api/taxonomy", { list: "tags", action: "delete", name: "Sport" }],
      ["PUT", "/api/content", { home: { layout: { rows: [{ blocks: [{ kind: "post", size: "Q", articleId: "a1", col: 9 }, { kind: "text", span: 9, html: "<p>x</p>" }, { kind: "bad" }] }] },
                                        background: { color: " #fff ", image: 5 } }, about: { text: 7 }, team: [{ name: " A " }], contact: { items: [{ label: "x" }] } }],
      ["POST", "/api/upload", { filename: "a.png", dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" }],
      ["POST", "/api/upload", { filename: "jiny nazev.png", dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" }],
      ["POST", "/api/upload", { filename: "Rozvrh hodin.pdf", dataUrl: "data:application/pdf;base64,JVBERi0xLjQgdGVzdA==" }],
      ["POST", "/api/upload", { filename: "a.svg", dataUrl: "data:image/svg+xml;base64,AAAA" }],
      ["POST", "/api/upload", { filename: "a.png", dataUrl: "nonsense" }],
      ["POST", "/api/upload", { filename: "a.png", dataUrl: "data:image/png;base64," }],
      ["GET", "/api/upload"]
    ];
    let n = 0;
    for (const [method, path, body] of calls) t.fact(String(++n).padStart(2, "0") + " " + method + " " + path, clean(await api(path, method, body)));
    t.fact("articles-after", clean((await api("/api/articles")).body));
    t.fact("taxonomy-after", clean((await api("/api/taxonomy")).body));
    t.fact("content-after", await content());
    t.fact("logout", clean(await api("/api/logout", "POST")));
    t.fact("after-logout", clean(await api("/api/login")));
    t.fact("login-wrong", clean(await api("/api/login", "POST", { password: "nope" })));
    t.fact("login-empty", clean(await api("/api/login", "POST", {})));
    t.fact("login-method", clean(await api("/api/login", "DELETE")));
  }
};
