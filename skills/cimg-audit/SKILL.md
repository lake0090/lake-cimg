---
name: cimg-audit
description: Audits HTML, Vue, Pug, JS, TS, TSX, and JSX image references against intrinsic
  dimensions for CLS risk, aspect-ratio mismatches, and modern-format hints.
  Use when optimizing images, fixing layout shift, LCP heroes, picture/srcset,
  or running lake-cimg scan-code via npx lake-cimg@latest.
disable-model-invocation: true
---

# cimg image audit

Run **`npx lake-cimg@latest`** from the **project root** (no global install).

<a id="invoke-scan-code"></a>

## Invoke `scan-code`

Use **one** command starting with `npx` — **not** `cd … && npx …` (PowerShell 5.1 on Windows does not support `&&`).

| `path` | Behavior |
| --- | --- |
| *(omitted)* | Scans **`.`** (current working directory). Run from repo root to cover the tree. |
| **Directory** | Recursively scans supported sources under that folder (honors `--no-recursive`). |
| **Single file** | Only that file. Extension must be `.html`, `.htm`, `.vue`, `.pug`, `.js`, `.mjs`, `.cjs`, `.ts`, `.tsx`, or `.jsx`. |

**Output:** stdout is **only** pretty-printed JSON: `items[]` with `issues`, `hints`, `snippet`, `intrinsicWidth` / `intrinsicHeight` when metadata was read, plus top-level `summary` and scan metadata. **`--issues-only`** drops rows with empty `issues`. For **`missing_dimensions`**, use **`intrinsicWidth` / `intrinsicHeight`** on the same item and/or the English hint that repeats them.

**`scan-code` flags (path resolution and filtering):**

| Flag | Role |
| --- | --- |
| `--issues-only` | Only emit items that have non-empty `issues`. |
| `--project-root <dir>` | Root used when resolving **`/…`** URL paths and alias bases (default: current working directory). |
| `--public-dir <dir>` | Folder(s) under `project-root` where root-absolute paths like `/images/x.png` live; **repeatable**. If you pass this at least once, **only** the listed dirs are tried (defaults when omitted: **`public`**, **`static`**). |
| `--alias <key=path>` | Map `key/…` to files under `project-root` / `path`; **repeatable**. Example: `--alias @=src` (built-in default), `--alias @aaa=packages/aaa`. Later pairs override the same `key`. |
| `--limit <n>`, `--no-recursive` | Cap rows (default 500); disable directory recursion. |

**Examples:**

```bash
npx lake-cimg@latest scan-code
npx lake-cimg@latest scan-code /absolute/path/to/src
npx lake-cimg@latest scan-code /absolute/path/to/about.pug
npx lake-cimg@latest scan-code --issues-only .
npx lake-cimg@latest scan-code --project-root /abs/repo --public-dir dist --alias @=src
```

More flags: `npx lake-cimg@latest scan-code --help`. Prefer an **absolute** `path` if the shell cwd may not be the repo root.

## Workflow

- [ ] **1. Scan (read-only):** From the **project root**, run `npx lake-cimg@latest scan-code [path]` — see **Invoke `scan-code`** above.
- [ ] **2. Triage:** Read **`hints`** first; group work by **`issues`**. Common codes: `missing_dimensions`, `aspect_ratio_mismatch`, `suggest_modern_format`, `needs_manual_review`, `missing_src`, `cannot_resolve`, `cannot_read_metadata`. How to mark up (default **single WebP**, **`<picture>`** only if the user asks): [reference.md](reference.md) and **Rules of thumb** below.
- [ ] **3. Fix then optimize:**
  - Update markup for **every** affected raster, not only one hero — follow [reference.md](reference.md).
  - If you change a `public` asset’s extension (e.g. `.png` → `.webp`), **search the whole repo** for that path or **centralize** it in one constant — avoid updating only one page.
  - On **repo static** files that need WebP or compression, run `npx lake-cimg@latest <path> [options]`.
  - **Only if** the user wants a full `<picture>` stack: `npx lake-cimg@latest picture <input> -O <outDir>` — flags: `npx lake-cimg@latest picture --help`. Narrative docs (work when this skill lives outside the **lake-cimg** repo): [GitHub `lake0090/lake-cimg`](https://github.com/lake0090/lake-cimg).

## Rules of thumb

- **Aspect ratio:** Match display ratio to intrinsic (w÷h), or use **`object-fit`** + explicit box / `aspect-ratio` for crop/letterbox.
- **CLS:** Add `width` and `height` to `<img>`, or use CSS `aspect-ratio`. For `missing_dimensions`, fill in the exact `intrinsicWidth` / `intrinsicHeight`.
- **Responsive:** **`srcset` + `sizes`** on `<img>` (works with a single WebP). **`<picture>`** only when the user wants multiple formats in HTML; each `<source type="…">` must match the real file type. Width variants: separate files or `picture … -s <px>` when building a stack.
- **LCP:** At most one hero per view: **`fetchPriority="high"`**, **`loading="eager"`**; lazy-load the rest.
- **Alt:** Describe content and purpose; no keyword stuffing; **`alt=""`** only for decorative images.

## What the scanner cannot resolve

Dynamic **`src`** without a static path → **`needs_manual_review`**. **`http(s):`** and **`data:`** → **`cannot_resolve`** (no network fetch / decode). **`~/…`** only resolves if you pass **`--alias "~=relativeDir"`** (quote as needed in your shell); there is no default for `~`.

**Next.js:** If `next.config.*` sets **`images.unoptimized: true`**, `next/image` does **not** auto-optimize or auto-convert PNG→WebP. Changing `<Image>` props alone is not a substitute for format work on **local** rasters — still use `lake-cimg` (or your build/CDN pipeline) when you want WebP (or other) output.

**Aliases and root URLs:** Built-in default is **`@/` → `<project-root>/src/`**. Override or extend with **`--alias`**, set **`--project-root`** when the shell cwd is not the repo root, and use **`--public-dir`** when static assets live outside the default **`public`** / **`static`** folders. If a ref still does not map to a file on disk → **`cannot_resolve`**.

Use **`rawRef`** plus project config when you need to reason about Vite/webpack paths the CLI does not know. With a **real filesystem path**, run `npx lake-cimg@latest scan <resolved-path>` on assets or re-run **`scan-code`** with the flags above. If unresolved, triage without intrinsic dimensions.

## Other CLI (after scan-code)

| Command | Role |
| --- | --- |
| `npx lake-cimg@latest <path>` | Compress / WebP — see `npx lake-cimg@latest --help` (`-o`, `-s`, `-q`, `-r`). |
| `npx lake-cimg@latest picture <input> -O <outDir>` | One raster → AVIF + WebP + JPEG **when the user wants `<picture>` / multi-format**; not the default if single WebP is enough. |
