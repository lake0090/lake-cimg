---
name: cimg-audit
description: >-
  Audits HTML, Vue, Pug, JS, TS, TSX, and JSX image references against intrinsic
  dimensions for CLS risk, aspect-ratio mismatches, and modern-format hints.
  Use when optimizing images, fixing layout shift, LCP heroes, picture/srcset,
  or running lake-cimg scan-code via npx lake-cimg@latest.
---

# cimg image audit

Use **`npx lake-cimg@latest`** from the project root (no global install).

## Workflow

Copy into a task list and tick as you go:

- [ ] **1. Scan (read-only):** `npx lake-cimg@latest scan-code <dir>` — **stdout is JSON** (default); **`--plain`** for a short text summary. Prefer an **absolute** path for `<dir>`.
- [ ] **2. Triage `issues`:** Each JSON row has `issues` (string codes) and **`hints`** (human-readable, often Chinese)—use **`hints` first** when choosing a fix; codes are for filtering and grouping. Possible codes: `missing_dimensions`, `aspect_ratio_mismatch`, `suggest_modern_format`, `needs_manual_review`, `missing_src`, `cannot_resolve`, `cannot_read_metadata`.
- [ ] **3. Fix markup:** add `width`/`height`, CSS `aspect-ratio`, or intentional `object-fit: cover|contain` when the box ratio must differ from the asset.
- [ ] **4. Optimize assets last:** `npx lake-cimg@latest <path> [options]`; for AVIF+WebP+JPEG stacks: `npx lake-cimg@latest picture <input> -O <outDir>` (see package README).

## Rules of thumb

- **Aspect ratio:** For undistorted display, match **display ratio** to **intrinsic** (width ÷ height). For crop/letterbox, use **`object-fit`** with explicit size/aspect-ratio.
- **CLS:** Prefer **`width` and `height`** on `<img>` (or **`aspect-ratio`** when fluid) so space is reserved before paint.
- **Responsive:** `<picture>` / **`srcset` + `sizes`**; align `type` with AVIF/WebP/JPEG; React uses **`srcSet`**. Use `picture` (and `-s`) to emit multiple width variants if needed.
- **LCP:** At most one hero: **`fetchPriority="high"`**, **`loading="eager"`**; lazy-load the rest.
- **Alt:** Describe **what’s in the image** and **how it supports the page** (subject + role in context). **Do not** stack keywords for SEO; empty **`alt=""`** only when the image is decorative.

## Limits

Dynamic **`src`** (e.g. `:src` without a static path) → **`needs_manual_review`**. Remote URLs, **`data:`**, and aliases (**`@/`**) → **`cannot_resolve`** until mapped to real paths. The scanner does not fetch network images.

## CLI

| Command | Role |
| --- | --- |
| `npx lake-cimg@latest scan-code <dir>` | Reference audit (JSON default; `--plain` for text) |
| `npx lake-cimg@latest <path>` | Compress / WebP (`--help` for `-o`, `-s`, `-q`, `-r`) |
| `npx lake-cimg@latest picture <input> -O <outDir>` | One source → AVIF + WebP + JPEG for `<picture>` |

`npx lake-cimg@latest --help` — global options. `npx lake-cimg@latest scan-code --help` — `--limit`, `--issues-only`, `--no-recursive`, `--plain`.

## Examples

**Read-only audit (stdout = JSON for parsing):**

```bash
npx lake-cimg@latest scan-code /absolute/path/to/project
```

Use **`--plain`** when you want a short **text** summary in the terminal instead of JSON.

## Additional resources

- **Alt text** (decorative `alt=""`, tone, anti-keyword-stuffing): [reference.md — Alt text](reference.md#alt-text)
- Format choice, responsive `<picture>` patterns, and LCP markup examples: [reference.md](reference.md)
