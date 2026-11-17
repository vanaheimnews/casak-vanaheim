# Parity check — "does it still look and work exactly the same?"

A regression check for refactoring. It replays scripted scenarios (public
pages, the reader page at several widths, the admin, the article editor)
against **two versions of the site** and compares what they recorded:

- **facts** — DOM state, saved JSON, toast texts, API answers, …
- **render snapshots** — tag, box (position and size) and ~90 computed CSS
  properties of every visible element, plus ::before / ::after.

Two builds that paint the same pixels and save the same data give the same
records. Class names are shown in the report but not compared, so renaming a
class changes nothing as long as the look stays the same.

## Files

| File | What it is |
|---|---|
| `index.html` | Host page. `?auto` runs every scenario, `?auto&s=pub-home` only one |
| `run.mjs` | Runs scenarios one after another (`window.parity.run([...])`), progress in `window.__progress` |
| `core.mjs` | Helpers: open a page in a fixed-size iframe, click / type / drag, snapshot, data cleaning |
| `scenarios-public.mjs` | Homepage, pages, filter + sort, phone layout, the reader page, public API |
| `scenarios-editor.mjs` | Article editor: view, undo / redo, formatting, crop, two zones, copy / paste, layers, background, embeds, publish, expired session |
| `scenarios-admin.mjs` | Login, article list, „Upravit filtry", homepage editor, O nás, Kontakt, admin API |
| `pre.js` | Injected into every page in parity mode: deterministic animation frames and ResizeObserver (a hidden browser tab throttles both), `confirm()` answers yes, page errors are collected |
| `compare.mjs` | Compares two result folders and prints the differences |

Every scenario starts from the same sample data (`tools/dev/seed.mjs`).

## How to use

1. Keep the version you compare against in a second folder, e.g. a git worktree:

   ```bash
   git worktree add ../base HEAD
   ```

   Copy the current `tools/dev/` into it (`cp -r tools/dev/. ../base/tools/dev/`)
   so both sides run the same scenarios.

2. Start two dev servers in parity mode (each writes its results into `--out`):

   ```bash
   node --import ./tools/dev/register.mjs tools/dev/devserver.mjs --parity --out=../parity/new
   ```

   ```bash
   cd ../base && PORT=8766 node --import ./tools/dev/register.mjs tools/dev/devserver.mjs --parity --out=../parity/base
   ```

3. Open `http://localhost:8765/tools/dev/parity/?auto` and
   `http://localhost:8766/tools/dev/parity/?auto` (one after the other, or two
   windows; keep the tab visible — a background tab runs much slower). A full
   run takes about 3 minutes.

4. Compare:

   ```bash
   node tools/dev/parity/compare.mjs ../parity/base ../parity/new
   ```

   Exit code 0 and `✓ … identical` means no difference. Otherwise each
   differing file lists the changed facts or elements (`--all` prints
   everything).

5. Remove the worktree afterwards: `git worktree remove ../base`.

## Notes

- A scenario that throws records `SCENARIO_ERROR` in its facts file (and is
  listed in `window.__progress.failed`), so it always shows up as a difference.
- Snapshots are taken twice in a row until two readings agree; a reading in
  the middle of a repaint can still differ once in a while (seen with the
  auto margins of `main.content`). Re-run that scenario (`?auto&s=…`) before
  hunting for a cause.
- When a change is meant to look or behave differently, the comparison shows
  exactly that difference — check it, then treat the new run as the new
  baseline.
