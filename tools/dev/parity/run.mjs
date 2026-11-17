// Parity check — runs the scenarios one after another and sends what they
// record (facts + render snapshots) to the dev server. See README.md.
import { post, clean, login, logout, reset, stableSnapshot } from "./core.mjs";
import publicSite from "./scenarios-public.mjs";
import editor from "./scenarios-editor.mjs";
import adminPages from "./scenarios-admin.mjs";

export const scenarios = Object.assign({}, publicSite, editor, adminPages);

// run() -> all scenarios; run(["pub-home", …]) -> only those. Progress is in window.__progress.
export async function run(names) {
  names = names && names.length ? names : Object.keys(scenarios);
  const progress = window.__progress = { todo: names.length, done: [], failed: [], current: null, finished: false };
  for (const name of names) {
    progress.current = name;
    const facts = {};
    let shots = 0;
    const t = {
      name,
      fact(key, value) { facts[key] = clean(value === undefined ? null : value); },
      async snap(page, label) {
        await page.settle();
        await post(name + "--" + String(++shots).padStart(2, "0") + "-" + label, await stableSnapshot(page));
      }
    };
    try {
      await reset();                                   // every scenario starts from the same sample data
      try { localStorage.clear(); } catch (e) { /* private mode */ }
      if (/^(pub-|api-public)/.test(name)) await logout(); else await login();
      await scenarios[name](t);
    } catch (e) {
      facts.SCENARIO_ERROR = String((e && e.stack) || e);
      progress.failed.push(name);
    }
    await post(name + ".facts", facts);
    progress.done.push(name);
  }
  progress.current = null;
  progress.finished = true;
  return progress;
}
