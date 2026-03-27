# Skills (Skills CLI)

This directory follows the layout expected by **[Skills CLI](https://www.npmjs.com/package/skills)** (`npx skills add`), same idea as [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills): each subfolder is one skill with a `SKILL.md`.

| Skill | Summary |
| --- | --- |
| [cimg-audit](./cimg-audit/SKILL.md) | Audit `<img>` / Pug `img()` / imports / `url()` for CLS, aspect ratio, and format hints via `npx lake-cimg@latest scan-code` |

### When to use

Skill id **`cimg-audit`** — use it when the conversation or task touches:

- **Performance / layout:** CLS, layout shift, LCP, hero images, `fetchPriority`
- **Markup / assets:** `<img>` dimensions, `aspect-ratio`, `<picture>`, `srcset` / `sizes`, WebP / AVIF
- **Workflow:** run **`scan-code`** first (read-only JSON), then fix markup and/or compress with **`npx lake-cimg@latest`** / **`picture`**

The skill name `cimg-audit` is short for discovery; the YAML `description` in `SKILL.md` is what agents match against.

Install from GitHub (after push):

```bash
npx skills add lake0090/lake-cimg -s cimg-audit -g -y
```

Install only this repo’s skill into the **current project** (run from another repo):

```bash
npx skills add lake0090/lake-cimg -s cimg-audit -y
```

Develop locally from a clone of this repository:

```bash
cd /path/to/lake-cimg
npx skills add . -s cimg-audit -y
```

Use `-g` for a user-level install (`~/.cursor/skills/` etc., depending on agent). See `npx skills add --help` for `--agent` (e.g. `cursor`).

Browse the registry at [skills.sh](https://skills.sh/).
