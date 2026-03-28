# Image markup templates

Supplement for [SKILL.md](SKILL.md). Copy-paste starting points; adjust paths, dimensions, and `sizes` to match your assets and layout.

## Basic `<img>`

**When:** Single raster URL; reserve space for CLS. **Check:** `width` / `height` match intrinsic pixels (or use `aspect-ratio` for fluid); meaningful `alt` or `alt=""` if decorative.

```html
<img
  srcset="
    maine-coon-nap-320w.webp 320w,
    maine-coon-nap-480w.webp 480w,
    maine-coon-nap-800w.webp 800w
  "
  sizes="(max-width: 320px) 280px, (max-width: 480px) 440px, 800px"
  src="maine-coon-nap-800w.webp"
  alt="A watercolor illustration of a maine coon napping leisurely in front of a fireplace"
/>
```

## `<picture>` + `srcset` + `sizes`

**When:** AVIF/WebP stack with JPEG (or similar) fallback; responsive widths. **Check:** Each `<source type="…">` matches the real file type; `sizes` matches breakpoints; `<img>` is the final fallback with matching `srcset` / `sizes`.

```html
<picture>
  <source
    type="image/avif"
    srcset="hero-400.avif 400w, hero-800.avif 800w, hero-1200.avif 1200w"
    sizes="(max-width: 600px) 100vw, 50vw"
  />
  <source
    type="image/webp"
    srcset="hero-400.webp 400w, hero-800.webp 800w, hero-1200.webp 1200w"
    sizes="(max-width: 600px) 100vw, 50vw"
  />
  <img
    src="hero-800.jpg"
    srcset="hero-400.jpg 400w, hero-800.jpg 800w, hero-1200.jpg 1200w"
    sizes="(max-width: 600px) 100vw, 50vw"
    width="1200"
    height="600"
    alt="Describe subject and purpose on this page"
    loading="lazy"
    decoding="async"
  />
</picture>
```
