# Image optimization reference

Supplement for [SKILL.md](SKILL.md). Browser share figures are **approximate** (global usage trends; check [Can I use](https://caniuse.com/) for current data).

## Format selection

| Format | Use case | Browser support (approx.) |
| --- | --- | --- |
| **AVIF** | Photos, best compression | 92%+ |
| **WebP** | Photos, good fallback | 97%+ |
| **PNG** | Graphics with transparency | Universal |
| **SVG** | Icons, logos, illustrations | Universal |

Pair with **`lake-cimg`** `picture` subcommand for AVIF + WebP + JPEG from one source when you need stacks; use PNG/SVG where vector or lossless transparency matters.

## Alt text

Write **`alt`** as: **图里是什么 / 与页面主题的关系** — what the image shows and why it belongs on this screen (one concise phrase or sentence).

- **Do:** name the subject, setting, or action that matters; match **language** and **tone** of the page.
- **Don’t:** repeat the page title, brand slogans, or comma‑separated “SEO” keywords; don’t start with “image of …” unless the medium itself matters (e.g. screenshot vs photo).

Decorative visuals: **`alt=""`** and ensure they’re not the only way to convey essential information.

## Responsive images (`<picture>` + `srcset` + `sizes`)

```html
<picture>
  <!-- AVIF for modern browsers -->
  <source
    type="image/avif"
    srcset="hero-400.avif 400w,
            hero-800.avif 800w,
            hero-1200.avif 1200w"
    sizes="(max-width: 600px) 100vw, 50vw">

  <!-- WebP fallback -->
  <source
    type="image/webp"
    srcset="hero-400.webp 400w,
            hero-800.webp 800w,
            hero-1200.webp 1200w"
    sizes="(max-width: 600px) 100vw, 50vw">

  <!-- JPEG fallback -->
  <img
    src="hero-800.jpg"
    srcset="hero-400.jpg 400w,
            hero-800.jpg 800w,
            hero-1200.jpg 1200w"
    sizes="(max-width: 600px) 100vw, 50vw"
    width="1200"
    height="600"
    alt="Short: what’s shown + why it’s on this page (no keyword stuffing)"
    loading="lazy"
    decoding="async">
</picture>
```

- Match **`sizes`** to real layout breakpoints; generate multiple widths with **`npx lake-cimg@latest picture … -s <px>`** runs or separate exports per width.
- In **React**, use **`srcSet`** and **`fetchPriority`** (camelCase) on `<img>`.

## LCP image priority

**Above-the-fold LCP candidate** — eager load and high fetch priority:

```html
<img
  src="hero.webp"
  fetchpriority="high"
  loading="eager"
  decoding="sync"
  alt="Hero: subject + role on this page (not SEO keywords)">
```

**Below-the-fold** — defer work off the critical path:

```html
<img
  src="product.webp"
  loading="lazy"
  decoding="async"
  alt="Product: what’s visible + relevance (no keyword list)">
```

Use **at most one** `fetchpriority="high"` (or `fetchPriority="high"` in React) per route/view for the true LCP image; lazy-load the rest.

## CLI tie-in

| Need | Command |
| --- | --- |
| Audit references + intrinsic size vs markup | `npx lake-cimg@latest scan-code [path]` — omit `path` for cwd, or pass a dir / one source file |
| One file → AVIF + WebP + JPEG | `npx lake-cimg@latest picture <input> -O <outDir>` |

Full options: repository **README.md** at package root.
