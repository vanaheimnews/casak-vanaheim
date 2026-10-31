import assert from "node:assert/strict";
import * as T from "../../api/_taxonomy.js";
const arts = [
  { id: "1", tags: ["Humor", "Sport"], authors: ["Jan Novák"] },
  { id: "2", tags: ["humor"], authors: ["Jan Novák", "Eva"] },
  { id: "3", tags: ["Věda"], authors: [] },
  { id: "4", tags: [], authors: ["Eva"] },
];
// seed: unique case-insensitive, sorted cs, reserved dropped
const seed = T.seedTaxonomy([...arts, { tags: ["nespecifikováno", "  Čtení  "] }]);
assert.deepEqual(seed.tags, ["Čtení", "Humor", "Sport", "Věda"]);
assert.deepEqual(seed.authors, ["Eva", "Jan Novák"]);
// add + duplicate + reserved + empty
assert.throws(() => T.applyTaxonomyAction(seed, arts, { list: "tags", action: "add", name: "HUMOR" }), (e) => e.code === "duplicate" && e.status === 409);
assert.throws(() => T.applyTaxonomyAction(seed, arts, { list: "tags", action: "add", name: "Nespecifikováno" }), (e) => e.code === "reserved");
assert.throws(() => T.applyTaxonomyAction(seed, arts, { list: "tags", action: "add", name: "   " }), (e) => e.code === "empty");
let r = T.applyTaxonomyAction(seed, arts, { list: "tags", action: "add", name: "Komiks" });
assert.deepEqual(r.taxonomy.tags, ["Čtení", "Humor", "Komiks", "Sport", "Věda"]); assert.equal(r.changed, 0); assert.equal(r.articles, arts);
// rename cascades (both spellings), dedupes, dup check excludes itself (case change ok)
r = T.applyTaxonomyAction(seed, arts, { list: "tags", action: "rename", name: "humor", to: "Vtipy" });
assert.equal(r.changed, 2); assert.deepEqual(r.articles[0].tags, ["Vtipy", "Sport"]); assert.deepEqual(r.articles[1].tags, ["Vtipy"]);
assert.ok(r.taxonomy.tags.includes("Vtipy") && !r.taxonomy.tags.includes("Humor"));
assert.equal(r.articles[2], arts[2]);                       // untouched articles keep identity
r = T.applyTaxonomyAction(seed, arts, { list: "tags", action: "rename", name: "Humor", to: "HUMOR" });
assert.ok(r.taxonomy.tags.includes("HUMOR"));
assert.throws(() => T.applyTaxonomyAction(seed, arts, { list: "tags", action: "rename", name: "Humor", to: "sport" }), (e) => e.code === "duplicate");
assert.throws(() => T.applyTaxonomyAction(seed, arts, { list: "tags", action: "rename", name: "Nope", to: "X" }), (e) => e.code === "not-found");
// delete cascade + fallback only for articles left with no tag
r = T.applyTaxonomyAction(seed, arts, { list: "tags", action: "delete", name: "HUMOR" });
assert.equal(r.changed, 2); assert.deepEqual(r.articles[0].tags, ["Sport"]); assert.equal(r.articles[0].tagsUnspecified, undefined);
assert.deepEqual(r.articles[1].tags, []); assert.equal(r.articles[1].tagsUnspecified, true);
assert.equal(r.articles[3], arts[3]);                       // never had tags: no placeholder
assert.ok(!r.taxonomy.tags.includes("Humor"));
// authors: cascade, no placeholder
r = T.applyTaxonomyAction(seed, arts, { list: "authors", action: "delete", name: "Eva" });
assert.deepEqual(r.articles[3].authors, []); assert.equal(r.articles[3].tagsUnspecified, undefined); assert.equal(r.changed, 2);
// restrict
assert.deepEqual(T.restrictNames(["humor", "X", "Sport", "SPORT"], seed.tags), ["Humor", "Sport"]);
assert.throws(() => T.applyTaxonomyAction(seed, arts, { list: "x", action: "add", name: "a" }), (e) => e.code === "bad-list");
console.log("taxonomy tests: all passed");
// existing long names are never cut; new ones are capped at 60
const long = "Žáci 9.A pod vedením Mgr. Jany Novákové (projekt Čtenářská dílna)";
assert.ok(T.seedTaxonomy([{ authors: [long] }]).authors[0] === long);
assert.deepEqual(T.restrictNames([long], [long]), [long]);
r = T.applyTaxonomyAction(seed, arts, { list: "tags", action: "add", name: "x".repeat(80) });
assert.ok(r.taxonomy.tags.includes("x".repeat(60)));
// NFC: decomposed look-alikes are duplicates / reserved
assert.throws(() => T.applyTaxonomyAction(seed, arts, { list: "tags", action: "add", name: "Věda".normalize("NFD") }), (e) => e.code === "duplicate");
assert.throws(() => T.applyTaxonomyAction(seed, arts, { list: "tags", action: "add", name: "nespecifikováno".normalize("NFD") }), (e) => e.code === "reserved");
console.log("extra tests: all passed");
