// Sample data for the local dev server — fixed (no random ids, no "now"), so
// two server runs hold exactly the same data (the parity check relies on it).
// Covers every shape the site knows: an article saved with the two zones, one
// saved before them (blocks, no hero), plain-text ones, a comic, one whose last
// tag was deleted, a scheduled one; a homepage layout, About, team, contacts.

const styles = (over) => ({ fontSize: "16px", color: "#1a1a1a", bold: false, italic: false, underline: false, align: "left", ...over });
const bg = { color: "", image: "" };
const IMG = "/logo.png";                       // a real picture that exists in the repo

const zoned = {
  id: "a1", title: "Vtipy o učitelích", body: "První odstavec článku. Druhý řádek s barvou a tučným písmem.",
  image: IMG, tags: ["Humor", "Škola"], authors: ["Jan Novák", "Eva Malá"], tagsUnspecified: false,
  date: "2026-11-10", publishAt: "2026-11-10T08:00:00.000Z", kind: "article", background: bg, heroHeight: 330,
  elements: [
    { id: "e-title", type: "text", isTitle: true, zone: "hero", content: "Vtipy o učitelích", x: 382, y: 84, width: 396, height: "auto", z: 1,
      styles: styles({ fontSize: "34px", bold: true, color: "#ffffff" }) },
    { id: "e-thumb", type: "image", role: "thumb", zone: "hero", content: IMG, x: 40, y: 40, width: 320, height: 220, z: 2, styles: styles(),
      crop: { x: 40, y: 20, w: 300, h: 150, nw: 714, nh: 280 } },
    { id: "e-tag1", type: "text", role: "tag", zone: "hero", tag: "Humor", content: "Humor", x: 390, y: 40, width: 73, height: "auto", z: 3, styles: styles() },
    { id: "e-tag2", type: "text", role: "tag", zone: "hero", tag: "Škola", content: "Škola", x: 471, y: 40, width: 65, height: "auto", z: 4, styles: styles() },
    { id: "e-date", type: "text", role: "date", zone: "hero", value: "2026-11-10T09:00", content: "10. listopadu 2026", x: 382, y: 190, width: 280, height: "auto", z: 5,
      styles: styles({ fontSize: "15px", color: "#aab6be" }) },
    { id: "e-auth", type: "text", role: "authors", zone: "hero", names: ["Jan Novák", "Eva Malá"], content: "Jan Novák, Eva Malá", x: 382, y: 222, width: 396, height: "auto", z: 6,
      styles: styles({ fontSize: "15px", color: "#ffffff", bold: true, align: "right" }) },
    { id: "e-text1", type: "text", content: "<div>První odstavec článku.</div><div style=\"text-align: center;\">Druhý řádek s <span style=\"color: rgb(220, 38, 38);\">barvou</span> a <span style=\"font-weight: 700;\">tučným</span> písmem.</div><ul><li>bod jedna</li><li>bod dvě</li></ul><ol><li>první</li><li style=\"padding-left: 40px;\">druhý</li></ol>",
      x: 40, y: 354, width: 440, height: "auto", z: 7, styles: styles() },
    { id: "e-img", type: "image", content: IMG, x: 500, y: 354, width: 280, height: 160, z: 8, styles: styles() },
    { id: "e-crop", type: "image", content: IMG, x: 500, y: 530, width: 200, height: 100, z: 9, styles: styles(), crop: { x: 100, y: 50, w: 200, h: 100, nw: 714, nh: 280 } },
    { id: "e-file", type: "file", content: "/robots.txt", name: "rozvrh.pdf", x: 40, y: 600, width: 300, height: "auto", z: 10, styles: styles() },
    { id: "e-embed", type: "embed", content: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", provider: "youtube", x: 40, y: 680, width: 480, height: 270, z: 11, styles: styles() },
    { id: "e-text2", type: "text", content: "Závěrečný text s <span style=\"font-size: 24px;\">větším</span> písmem.", x: 40, y: 980, width: 740, height: 60, z: 12,
      styles: styles({ fontFamily: "'Merriweather', Georgia, serif", italic: true, underline: true, color: "#1d4ed8" }) }
  ]
};

const legacyBlocks = {
  id: "a2", title: "Fotbalový turnaj", body: "Turnaj začal v pondělí.", image: "",
  tags: ["Sport"], authors: ["Eva Malá"], date: "2026-11-08", publishAt: "2026-11-08T08:00:00.000Z", kind: "article", background: { color: "#fff7e6", image: "" },
  elements: [
    { id: "l-title", type: "text", isTitle: true, content: "Fotbalový turnaj", x: 40, y: 24, width: 640, height: "auto", styles: styles({ fontSize: "34px", bold: true }) },
    { id: "l-text", type: "text", content: "Turnaj začal v pondělí.<br>Hrálo se celý týden.", x: 40, y: 120, width: 420, height: "auto", styles: styles() },
    { id: "l-img", type: "image", content: IMG, x: 480, y: 120, width: 300, height: 180, styles: styles() }
  ]
};

const plain = (id, title, date, tags, authors, extra) => ({
  id, title, body: title + " — první odstavec.\n\nDruhý odstavec textu.", image: "", tags, authors,
  date, publishAt: date + "T08:00:00.000Z", kind: "article", elements: [], background: bg, ...extra
});

export const articles = [
  zoned,
  legacyBlocks,
  plain("a3", "Komiks: Kočka", "2026-11-06", ["Humor"], ["Eva Malá", "Jan Novák"], { kind: "comic", image: IMG }),
  plain("a4", "Výlet do Prahy", "2026-11-01", ["Škola", "Cestování"], ["Petr Dlouhý"]),
  plain("a5", "Starý článek", "2026-09-20", ["humor"], []),
  plain("a6", "Naplánovaný", "2030-01-15", ["Sport"], ["Jan Novák"]),
  plain("a7", "Bez štítku", "2026-10-15", [], ["Petr Dlouhý"], { tagsUnspecified: true })
];

export const content = {
  home: {
    doc: "", theme: { period: "měsíce", desc: "dané téma písmem" }, pinned: [],
    background: { color: "", image: "" },
    layout: { rows: [
      { id: "r1", blocks: [{ id: "b-head", kind: "text", span: 4, col: 0, html: "<h1>Vanaheim News</h1><p style=\"color: rgb(91, 103, 112);\">Nejnovější příspěvky našeho magazínu.</p>" }] },
      { id: "r2", blocks: [{ id: "b-d", kind: "post", size: "D", col: 0, articleId: "a1" }] },
      { id: "r3", blocks: [{ id: "b-a1", kind: "post", size: "A", col: 0, articleId: "a2" }, { id: "b-a2", kind: "post", size: "A", col: 1, articleId: "a3" },
                           { id: "b-b", kind: "post", size: "B", col: 2, articleId: "a4" }] },
      { id: "r4", blocks: [{ id: "b-c", kind: "post", size: "C", col: 0, articleId: "a5" }, { id: "b-empty", kind: "post", size: "A", col: 3, articleId: "" }] },
      { id: "r5", blocks: [{ id: "b-t2", kind: "text", span: 2, col: 1, html: "<p>Text uprostřed s <b>tučným</b> slovem.</p><ul><li>jedna</li><li>dvě</li></ul>" },
                           { id: "b-sched", kind: "post", size: "A", col: 3, articleId: "a6" }] }
    ] }
  },
  about: {
    text: "Školní magazín vznikl v roce 2022.\n\nScházíme se každý čtvrtek.",
    doc: "<div>Školní magazín vznikl v roce <b>2022</b>.</div><div style=\"text-align: center;\">Scházíme se každý čtvrtek.</div><ul><li>redakce</li><li>grafika</li></ul>",
    background: { color: "", image: "" }
  },
  team: [
    { id: "t1", name: "Anna Nováková", role: "Šéfredaktorka", image: IMG },
    { id: "t2", name: "Petr Svoboda", role: "Redaktor", image: "" }
  ],
  contact: {
    subtitle: "Napište nám nebo nás sledujte na sítích.",
    items: [
      { id: "c1", type: "Email", label: "magazin@skola.cz", url: "mailto:magazin@skola.cz" },
      { id: "c2", type: "Instagram", label: "@nase.skola", url: "https://instagram.com/" },
      { id: "c3", type: "Odkaz", label: "Jen text bez odkazu", url: "" }
    ]
  }
};
