/* ============================================================
 * Global lists ("číselníky") of tags and authors — pure logic, no I/O,
 * shared by /api/taxonomy and /api/articles (and unit-testable).
 *
 * Data architecture
 *   taxonomy.json  { tags: ["Humor", …], authors: ["Jan Novák", …] }
 *                  The ONLY place a tag / author is created, renamed or
 *                  deleted. Sorted, unique case-insensitively.
 *   articles.json  [{ …, tags: ["Humor"], authors: ["Jan Novák"],
 *                     tagsUnspecified: false }]
 *                  Articles reference list entries by name, so every
 *                  reader (cards, article page, homepage) works unchanged.
 *                  Counts such as "Humor (5)" are computed from the
 *                  articles on the fly, so they can never drift. A rename
 *                  or delete rewrites the articles in the same request.
 *   tagsUnspecified  set when deleting a tag left an article with no tag:
 *                  cards show "nespecifikováno" there. It is NOT a tag —
 *                  never in the lists, never filterable, reserved name.
 * ============================================================ */
export const UNSPECIFIED = "nespecifikováno";
export const LISTS = ["tags", "authors"];
const MAX_NAME = 60;

export function cleanName(v) {
  return String(v == null ? "" : v).normalize("NFC").replace(/\s+/g, " ").trim();
}
// new names typed by the admin are capped; existing ones are never cut
function newName(v) { return cleanName(v).slice(0, MAX_NAME).trim(); }
export function nameKey(v) {
  return cleanName(v).toLocaleLowerCase("cs");
}
function sortNames(list) {
  return list.sort((a, b) => a.localeCompare(b, "cs"));
}
// Clean, drop empties / duplicates (first spelling wins) / the reserved name.
function uniqueNames(list, reserved) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const n = cleanName(raw);
    const k = nameKey(n);
    if (!n || seen.has(k) || (reserved && k === nameKey(reserved))) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

export function shapeTaxonomy(d) {
  d = d || {};
  return {
    tags: sortNames(uniqueNames(d.tags, UNSPECIFIED)),
    authors: sortNames(uniqueNames(d.authors))
  };
}

// First use (no taxonomy.json yet): every name the articles already use.
export function seedTaxonomy(articles) {
  const tags = [];
  const authors = [];
  for (const a of articles || []) {
    tags.push(...(a.tags || []));
    authors.push(...(a.authors || []));
  }
  return shapeTaxonomy({ tags, authors });
}

// Keep only the names that exist in `list`, spelled as in the list.
export function restrictNames(names, list) {
  const canon = new Map((list || []).map((n) => [nameKey(n), n]));
  return uniqueNames((Array.isArray(names) ? names : []).map((n) => canon.get(nameKey(n))).filter(Boolean));
}

export class TaxonomyError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;       // "duplicate" | "reserved" | "empty" | "not-found" | "bad-list" | "bad-action"
    this.status = status;
  }
}

/* One change to a list:
 *   { list: "tags"|"authors", action: "add", name }
 *   { list, action: "rename", name, to }
 *   { list, action: "delete", name }
 * Returns { taxonomy, articles, changed } — `articles` is a new array in
 * which only the touched articles are new objects; `changed` counts them.
 * Throws TaxonomyError for a duplicate / reserved / unknown name. */
export function applyTaxonomyAction(taxonomy, articles, req) {
  req = req || {};
  const list = req.list;
  if (!LISTS.includes(list)) throw new TaxonomyError("bad-list", 400);
  const tax = shapeTaxonomy(taxonomy);
  const names = tax[list];
  const indexOf = (n) => names.findIndex((x) => nameKey(x) === nameKey(n));
  const checkNew = (n, self) => {
    if (!n) throw new TaxonomyError("empty", 400);
    if (list === "tags" && nameKey(n) === nameKey(UNSPECIFIED)) throw new TaxonomyError("reserved", 400);
    const at = indexOf(n);
    if (at > -1 && at !== self) throw new TaxonomyError("duplicate", 409);
  };
  articles = Array.isArray(articles) ? articles : [];
  let changed = 0;
  let out = articles;

  if (req.action === "add") {
    const n = newName(req.name);
    checkNew(n, -1);
    names.push(n);
  } else if (req.action === "rename" || req.action === "delete") {
    const at = indexOf(req.name);
    if (at < 0) throw new TaxonomyError("not-found", 404);
    const old = nameKey(names[at]);
    const uses = (a) => (a[list] || []).some((n) => nameKey(n) === old);
    if (req.action === "rename") {
      const to = newName(req.to);
      checkNew(to, at);
      names[at] = to;
      out = articles.map((a) => {
        if (!uses(a)) return a;
        changed++;
        return { ...a, [list]: uniqueNames(a[list].map((n) => (nameKey(n) === old ? to : n))) };
      });
    } else {
      names.splice(at, 1);
      out = articles.map((a) => {
        if (!uses(a)) return a;
        changed++;
        const next = a[list].filter((n) => nameKey(n) !== old);
        const b = { ...a, [list]: next };
        if (list === "tags" && !next.length) b.tagsUnspecified = true;   // fallback state
        return b;
      });
    }
  } else {
    throw new TaxonomyError("bad-action", 400);
  }
  return { taxonomy: shapeTaxonomy(tax), articles: out, changed };
}
