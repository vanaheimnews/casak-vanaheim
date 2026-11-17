// Parity check — compares what two runs recorded.
//   node tools/dev/parity/compare.mjs <dir of run A> <dir of run B> [--all]
// Prints every scenario fact and every rendered element that differs
// (first few per file; --all lists everything). Exit code 1 when anything differs.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { STYLE } from "./core.mjs";

const [dirA, dirB] = process.argv.slice(2);
const ALL = process.argv.includes("--all");
if (!dirA || !dirB) { console.error("usage: node compare.mjs <dirA> <dirB> [--all]"); process.exit(2); }
const files = (d) => readdirSync(d).filter((f) => f.endsWith(".json")).sort();
const load = (d, f) => JSON.parse(readFileSync(path.join(d, f), "utf8"));
const short = (v) => { const s = typeof v === "string" ? v : JSON.stringify(v); return s === undefined ? "undefined" : s.length > 300 ? s.slice(0, 300) + "…" : s; };

function diffFacts(a, b, at, out) {
  if (JSON.stringify(a) === JSON.stringify(b)) return;
  const both = a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b);
  if (!both) { out.push(at + "\n      A: " + short(a) + "\n      B: " + short(b)); return; }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diffFacts(a[k], b[k], at ? at + "." + k : k, out);
}

// One element as a comparable record. Classes are shown but not compared
// (renaming a class changes nothing on screen).
function records(snap) {
  return snap.els.map((e) => {
    const [tag, cls, x, y, w, h, style, text, state, ...pseudo] = e;
    const rec = { tag, cls, box: [x, y, w, h], style: snap.dict[style], text, state: state || null,
                  pseudo: pseudo.map((p) => p.replace(/ (\d+)$/, (m, i) => " " + snap.dict[+i])) };
    rec.key = JSON.stringify([tag, rec.box, rec.style, text, rec.state, rec.pseudo]);
    return rec;
  });
}
const label = (r) => "<" + r.tag + (r.cls ? "." + r.cls.split(" ").join(".") : "") + ">" + (r.text ? " “" + r.text.slice(0, 40) + "”" : "") + " @" + r.box.join(",");
function styleDiff(a, b) {
  const x = a.split("|"), y = b.split("|"), out = [];
  STYLE.forEach((prop, i) => { if (x[i] !== y[i]) out.push(prop + ": " + x[i] + " -> " + y[i]); });
  return out;
}
function diffSnap(a, b, out) {
  for (const k of ["url", "title"]) if (a[k] !== b[k]) out.push(k + ": " + a[k] + " -> " + b[k]);
  if (String(a.size) !== String(b.size)) out.push("viewport: " + a.size + " -> " + b.size);
  const ra = records(a), rb = records(b), left = new Map();
  ra.forEach((r) => { if (!left.has(r.key)) left.set(r.key, []); left.get(r.key).push(r); });
  const onlyB = [];
  rb.forEach((r) => { const l = left.get(r.key); if (l && l.length) l.pop(); else onlyB.push(r); });
  const onlyA = [...left.values()].flat();
  // pair leftovers that are the same element with a different look / place
  const used = new Set();
  const pair = (r, same) => { const i = onlyB.findIndex((o, j) => !used.has(j) && same(o)); if (i > -1) used.add(i); return i > -1 ? onlyB[i] : null; };
  for (const r of onlyA) {
    const twin = pair(r, (o) => o.tag === r.tag && o.text === r.text && String(o.box) === String(r.box)) ||
                 pair(r, (o) => o.tag === r.tag && o.text === r.text && o.cls === r.cls) ||
                 pair(r, (o) => o.tag === r.tag && o.text === r.text);
    if (!twin) { out.push("only in A: " + label(r)); continue; }
    const d = [];
    if (String(twin.box) !== String(r.box)) d.push("box: " + r.box + " -> " + twin.box);
    d.push(...styleDiff(r.style, twin.style));
    if (JSON.stringify(twin.state) !== JSON.stringify(r.state)) d.push("state: " + short(r.state) + " -> " + short(twin.state));
    if (JSON.stringify(twin.pseudo) !== JSON.stringify(r.pseudo)) d.push("pseudo-elements differ");
    out.push(label(r) + "\n      " + d.join("\n      "));
  }
  onlyB.forEach((r, j) => { if (!used.has(j)) out.push("only in B: " + label(r)); });
  return ra.length;
}

let different = 0, same = 0, elements = 0;
const names = [...new Set([...files(dirA), ...files(dirB)])].sort();
for (const f of names) {
  const inA = files(dirA).includes(f), inB = files(dirB).includes(f);
  if (!inA || !inB) { different++; console.log("\n✗ " + f + " — only in " + (inA ? "A" : "B")); continue; }
  const out = [], a = load(dirA, f), b = load(dirB, f);
  if (f.endsWith(".facts.json")) diffFacts(a, b, "", out);
  else elements += diffSnap(a, b, out) || 0;
  if (!out.length) { same++; continue; }
  different++;
  console.log("\n✗ " + f + " — " + out.length + " difference" + (out.length > 1 ? "s" : ""));
  (ALL ? out : out.slice(0, 12)).forEach((line) => console.log("    " + line));
  if (!ALL && out.length > 12) console.log("    … " + (out.length - 12) + " more (--all)");
}
console.log("\n" + (different ? "✗ " + different + " file(s) differ, " : "✓ ") + same + " identical (" + elements + " rendered elements compared)");
process.exit(different ? 1 : 0);
