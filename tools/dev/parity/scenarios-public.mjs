// Parity scenarios — the public site and the public API.
import { open, api, clean } from "./core.mjs";

const seo = (p) => ({
  title: p.doc.title,
  description: (p.q('meta[name="description"]') || {}).content,
  canonical: (p.q('link[rel="canonical"]') || {}).href,
  og: p.qa('meta[property^="og:"]').map((m) => m.getAttribute("property") + "=" + m.content),
  robots: (p.q('meta[name="robots"]') || {}).content || null,
  ld: p.qa('script[type="application/ld+json"]').map((s) => s.textContent)
});

export default {
  async "pub-home"(t) {
    for (const [w, h] of [[1440, 900], [900, 800], [400, 800]]) {
      const p = await open("/#home", w, h);
      t.fact("home-" + w, { titles: p.texts("#home-canvas .hl-title"), blocks: p.qa("#home-canvas .hl-block").length,
                            links: p.qa("#home-canvas a.hl-card").map((a) => a.getAttribute("href")), errors: p.errors() });
      await t.snap(p, "home-" + w);
    }
  },

  async "pub-pages"(t) {
    const p = await open("/", 1440, 900);
    const state = () => ({ hash: p.win.location.hash, active: p.qa(".page.is-active").map((n) => n.id),
                           shown: p.qa(".page").filter((n) => !n.hidden).map((n) => n.id), nav: p.qa(".nav-link.is-active").map((n) => n.dataset.page) });
    t.fact("start", state());
    for (const name of ["articles", "about", "contact", "home"]) {
      await p.tap('.nav-link[data-page="' + name + '"]');
      t.fact("nav-" + name, state());
      await t.snap(p, "page-" + name);
    }
    p.win.location.hash = "#about"; await p.settle();
    t.fact("hash-about", state());
    p.win.location.hash = "#main"; await p.settle();           // an in-page anchor is not a page
    t.fact("hash-anchor", state());
    t.fact("about", { text: p.q("#about-text") ? p.q("#about-text").innerHTML : null, team: p.texts("#team-grid .team-card, #team-grid > *") });
    t.fact("contact", { subtitle: p.text("#contact-subtitle"), items: p.qa("#contact-list > li").map((li) => li.innerHTML) });
    const q = await open("/#nonsense", 1440, 900);
    t.fact("unknown-hash", { hash: q.win.location.hash, active: q.qa(".page.is-active").map((n) => n.id) });
    t.fact("errors", p.errors().concat(q.errors()));
  },

  async "pub-filter"(t) {
    const p = await open("/#articles", 1440, 900);
    const titles = () => p.texts("#articles-grid .card-title");
    const tick = async (list, label) => {
      const l = p.qa(list + " label").find((x) => x.textContent.trim().startsWith(label));
      const i = l.querySelector("input");
      i.checked = !i.checked;
      i.dispatchEvent(new p.win.Event("change", { bubbles: true }));
      await p.settle(1);
    };
    t.fact("initial", { titles: titles(), cards: p.qa("#articles-grid .card").map((c) => c.textContent.replace(/\s+/g, " ").trim()),
                        panelHidden: p.q("#filter-panel").hidden });
    await p.tap("#filter-toggle");
    t.fact("panel", { tags: p.texts("#tag-list label"), authors: p.texts("#author-list label"),
                      disabled: p.qa("#filter-panel input:disabled").length, expanded: p.q("#filter-toggle").getAttribute("aria-expanded") });
    await t.snap(p, "panel-open");
    await tick("#tag-list", "Humor"); t.fact("humor", titles());
    await tick("#tag-list", "Sport"); t.fact("humor-or-sport", titles());
    await tick("#author-list", "Eva"); t.fact("and-eva", { titles: titles(), badge: p.text("#filter-count") });
    await t.snap(p, "filtered");
    await p.tap("#sort-toggle");
    await t.snap(p, "sort-menu");
    await p.tap('[data-sort="old"]');
    t.fact("oldest", { titles: titles(), label: p.text("#sort-label"), menuHidden: p.q("#sort-menu").hidden,
                       checked: p.qa("[data-sort]").map((b) => b.getAttribute("aria-checked")) });
    await tick("#author-list", "Eva"); await tick("#tag-list", "Sport"); await tick("#tag-list", "Humor");
    t.fact("oldest-all", titles());
    await tick("#tag-list", "Cestování"); await tick("#author-list", "Jan");
    t.fact("no-match", { titles: titles(), empty: p.text("#articles-empty"), emptyHidden: p.q("#articles-empty").hidden });
    await t.snap(p, "empty");
    await p.tap("#clear-tags");
    t.fact("cleared", { titles: titles(), badgeHidden: p.q("#filter-count").hidden, ticked: p.qa("#filter-panel input:checked").length });
    await p.tap("#sort-toggle"); await p.tap("#articles-title");
    t.fact("sort-closes-outside", p.q("#sort-menu").hidden);
    await p.tap("#sort-toggle"); await p.key("Escape");
    t.fact("sort-closes-escape", p.q("#sort-menu").hidden);
    await p.tap("#filter-toggle");
    t.fact("panel-closed", p.q("#filter-panel").hidden);
    t.fact("errors", p.errors());
  },

  async "pub-mobile"(t) {
    const p = await open("/#articles", 400, 800);
    await t.snap(p, "articles");
    await p.tap('.nav-link[data-page="contact"]');
    t.fact("nav", p.qa(".page.is-active").map((n) => n.id));
    await t.snap(p, "contact");
    await p.tap('.nav-link[data-page="about"]'); await t.snap(p, "about");
    await p.tap('.nav-link[data-page="articles"]'); await p.tap("#filter-toggle"); await p.tap("#sort-toggle");
    await t.snap(p, "filter-and-sort");
    t.fact("errors", p.errors());
  },

  async "pub-article"(t) {
    const views = [["a1", 1440, 900], ["a1", 1100, 900], ["a1", 700, 900], ["a1", 400, 800], ["a2", 1440, 900], ["a2", 400, 800],
                   ["a3", 1440, 900], ["a3", 400, 800], ["a4", 1440, 900], ["a7", 1440, 900], ["a5", 1300, 900]];
    for (const [id, w, h] of views) {
      const p = await open("/article?id=" + id, w, h);
      const hero = p.q(".article-canvas--hero"), body = p.q(".article-canvas--body");
      t.fact(id + "-" + w, {
        h1: p.texts("h1"), badges: p.texts(".vn-badge"), reco: p.qa(".reco").map((r) => p.texts(".reco-name").length + ":" + r.hidden),
        recoNames: p.texts(".reco-name"), recoLinks: p.qa(".reco-card").map((a) => a.getAttribute("href")),
        flow: hero ? hero.classList.contains("article-canvas--flow") : null,
        transform: [hero && hero.style.transform, body && body.style.transform],
        back: p.qa(".article-back").map((a) => a.getAttribute("href")), errors: p.errors()
      });
      if (w === 1440) t.fact(id + "-seo", clean(seo(p)));
      await t.snap(p, id + "-" + w);
    }
    for (const [label, url] of [["no-id", "/article"], ["unknown", "/article?id=nope"], ["scheduled", "/article?id=a6"]]) {
      const p = await open(url, 1440, 900);
      t.fact(label, { text: p.text("#article-root"), band: p.q("#article-heroband") ? p.q("#article-heroband").hidden : null,
                      seo: clean(seo(p)), errors: p.errors() });
      await t.snap(p, label);
    }
  },

  // What the server answers, logged out — must stay byte-identical in meaning.
  async "api-public"(t) {
    for (const path of ["/api/articles", "/api/articles?id=a1", "/api/articles?id=a2", "/api/articles?id=a6", "/api/articles?id=nope",
                        "/api/content", "/api/taxonomy", "/api/login"]) {
      t.fact("GET " + path, clean(await api(path)));
    }
    for (const [method, path, body] of [["POST", "/api/articles", { title: "x" }], ["PUT", "/api/articles?id=a1", { title: "x" }],
                                        ["DELETE", "/api/articles?id=a1"], ["PUT", "/api/content", {}],
                                        ["POST", "/api/taxonomy", { list: "tags", action: "add", name: "x" }],
                                        ["POST", "/api/upload", { filename: "a.png", dataUrl: "data:image/png;base64,AAAA" }],
                                        ["PATCH", "/api/articles"], ["DELETE", "/api/content"], ["PUT", "/api/taxonomy", {}]]) {
      t.fact(method + " " + path, clean(await api(path, method, body)));
    }
    const sm = await fetch("/sitemap.xml");
    t.fact("sitemap", clean({ status: sm.status, type: sm.headers.get("content-type"), body: await sm.text() }));
    const headers = {};
    for (const path of ["/api/articles", "/api/content", "/api/taxonomy"]) headers[path] = (await fetch(path)).headers.get("cache-control");
    t.fact("cache-control", headers);
  }
};
