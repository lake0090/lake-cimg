# lake-cimg

命令行批量压缩图片，默认输出 **WebP**；支持单文件、目录，以及递归子目录。基于 [sharp](https://sharp.pixelplumbing.com/)，可多任务并行处理。

## 特性

- 默认转为 WebP，可调质量；可选 `--no-webp` 保留原格式仅压缩
- 可选按最长边缩放（`--size`），不指定则只做编码压缩、不改变像素尺寸
- 目录批量处理；`-r` 递归子目录；配合 `-o` 时保持相对目录结构
- 处理过程输出体积对比；失败时非零退出码
- **`picture` 子命令**：从单张 PNG/JPEG/WebP 源图一次生成 **AVIF + WebP + JPEG**，配合前端 `<picture>` 做渐进增强（不支持 GIF 动图源）
- **`scan-code` 子命令**：扫描源码中的图片引用并结合真实像素尺寸给出 CLS / 比例等建议（只读）
- **Agent Skill**：通过 [`npx skills add`](https://www.npmjs.com/package/skills) 安装 [`skills/cimg-audit`](skills/cimg-audit/SKILL.md)（技能名 **`cimg-audit`**，好记），在 Cursor 等环境里用自然语言驱动 `npx lake-cimg@latest …`

## 环境要求

- **Node.js** ≥ 18

## 推荐用法

无需全局安装，建议直接用 npx 运行：

```bash
npx lake-cimg@latest <路径> [选项]
```

## 快速开始

```bash
# 查看帮助与版本
npx lake-cimg@latest --help
npx lake-cimg@latest --version

# 压缩当前目录下支持的图片（见下文「行为说明」）
npx lake-cimg@latest .

# 输出到单独目录，并限制最长边 1200px
npx lake-cimg@latest ./photos -o ./dist -s 1200

# 递归子目录，质量 80
npx lake-cimg@latest ./assets -r -q 80

# 生成 hero.avif / hero.webp / hero.jpg（输出目录须用 -O，与主命令 -o 区分）
npx lake-cimg@latest picture ./hero.png -O ./public/images --snippet --snippet-prefix /images
```

如果用本地 `npm run`，**必须在参数前加 `--`**，否则 npm 会吞掉 `--size` 等选项：

```bash
npm run compress -- ./photo.png --size 100
```

## 命令说明

### 用法

```text
npx lake-cimg@latest [options] [input]
```

`input` 为**文件或文件夹**路径（相对当前工作目录或绝对路径均可）。未传 `input` 或为空时会打印帮助并以状态码 `1` 退出。

### 选项

| 选项 | 说明 |
| --- | --- |
| `-o, --out-dir <dir>` | 输出根目录。指定后**不删除**源文件，结果写入该目录 |
| `-s, --size <px>` | 最长边像素上限（可选）。不指定则**不缩放**，仅压缩/转码 |
| `-q, --quality <1-100>` | WebP 质量，默认 `75` |
| `--no-webp` | 不转为 WebP，在原格式下压缩（jpeg/png/webp/gif 等） |
| `-r, --recursive` | 输入为目录时，递归处理子目录 |
| `-h, --help` | 显示帮助 |
| `-V, --version` | 显示版本 |

### 行为说明

**未指定 `-o` 时**：在源文件所在目录生成 `.webp`（或 `--no-webp` 时在原格式下写出新文件）。**当前实现不会删除源文件**；若需只保留一份，请在确认输出后自行删除原图，或使用 `-o` 写到单独目录再替换。

**指定 `-o` 且使用 `-r`**：会按源目录的相对路径在输出目录下重建子文件夹，避免不同子目录中的同名文件互相覆盖。

**并发**：按 CPU 核心数限制并行任务数，大目录下可显著快于单线程。

### 子命令：`picture`（`<picture>` 三格式）

从**单个**源文件生成同名 `basename.avif`、`.webp`、`.jpg`，适合静态头图、内容图。**不支持 GIF 动图**作源（请改用静态图）。

```text
npx lake-cimg@latest picture <input> -O <outDir> [选项]
```

| 选项 | 说明 |
| --- | --- |
| `-O, --stack-out <dir>` | 输出目录（**必填**；使用 `-O` 是为避免与主命令 `-o` 在 Commander 下冲突） |
| `-s, --size <px>` | 最长边上限（可选） |
| `-q, --quality <1-100>` | WebP / 默认 AVIF、JPEG 质量，默认 `75` |
| `--avif-quality` / `--jpeg-quality` | 单独调节 AVIF、JPEG |
| `--snippet` | 生成完成后打印一段 **React + `<picture>`** 示例 |
| `--snippet-prefix` | 片段里 URL 前缀，如 `/images` → `/images/hero.avif` |

### 子命令：`scan`

只读扫描，输出建议（不写入文件）。`npx lake-cimg@latest scan <路径> [-r] [--json]`。

### 子命令：`scan-code`（源码中的图片引用）

在 **html / htm / vue / pug / js / mjs / cjs / ts / tsx / jsx** 中查找图片引用（`<img>`、Pug `img(src=…)`、`import … from '…png'`、`new URL('…', import.meta.url)`、`url(…)` 等），将**可解析的本地路径**与 **sharp 读出的真实宽高**对比，只读输出 JSON（默认），用于：

- **CLS**：缺少 `width`/`height` 且无 `aspect-ratio` 等占位
- **比例**：声明的宽高比与素材像素比不一致（未使用 `object-fit: cover|contain|fill` 等时标为问题）
- **格式**：对 JPEG/PNG 等提示可考虑 WebP/AVIF 或 `picture` 子命令

```text
npx lake-cimg@latest scan-code [path] [--no-recursive] [--limit <n>] [--issues-only] [--plain]
```

| 参数 / 选项 | 说明 |
| --- | --- |
| `path` | 可选。省略时等价于 `.`（当前工作目录，一般在项目根执行）。可为**目录**（递归扫描其下源码）或**单个源码文件**（如某 `.pug` / `.vue`，只扫该文件） |
| `-r, --recursive` | 递归子目录（默认开启；仅对**目录**扫描有效） |
| `--limit <n>` | 最多输出多少条引用点（默认 `500`） |
| `--issues-only` | 仅输出 `issues` 非空的条目 |
| `--plain` | 简要文本而非 JSON（默认 stdout 为 JSON） |

目录扫描时默认会跳过 `node_modules`、`dist`、`.git` 等子目录。动态 `src`、远程 URL、别名路径会进入报告但通常无法解析到磁盘文件。

### 前端最佳实践（React / `<picture>`）

1. **顺序**：先 AVIF，再 WebP，最后 `<img src={jpg}>` 兜底；`type` 与 `srcSet`（React 里写 **`srcSet` 驼峰**）对应好。
2. **LCP 头图**：在 `<img>` 上加 `fetchPriority="high"`、`loading="eager"`（仅首屏大图；其余图用 `loading="lazy"`）。
3. **占位与 CLS**：保留真实 **`width` / `height`**，或用 `aspect-ratio`（与真实比例一致）。
4. **响应式**：若同一图有多套宽度，应为每条 `source`/`img` 提供 **`sizes`** 与多宽度 `srcSet`（需配合构建或 `npx lake-cimg@latest picture` 多次导出不同 `size`）；当前 CLI 一次导出的是单套 URL。
5. **路径**：把生成文件放到 **`public/`**（如 Next.js）或 CDN，片段里的路径与部署前缀一致。

`--snippet` 输出的是可直接改的模板；生产环境请按设计稿补上准确的 `width`/`height`/`alt`/`sizes`。

## 支持格式

输入：**jpg / jpeg、png、webp、gif**（gif 含动图，处理时由 sharp 按能力读写）。

输出：默认 **WebP**；`--no-webp` 时尽量保持原容器格式并压缩。

## 退出码

| 码 | 含义 |
| --- | --- |
| `0` | 全部成功，或没有可处理文件（目录下无匹配图片时也会以 `0` 退出并提示） |
| `1` | 存在处理失败、参数非法、输入路径不存在等错误 |

## 在代码中调用

包入口为 `lib/compress.js`（ESM），可导入例如：

- `run(options)` — 批量入口（与 CLI 行为一致）
- `processOne(inputPath, options)` — 单文件
- `collectFiles(inputPath, recursive)` — 枚举待处理路径
- `scanAssets(dir, options)` — `lib/scanAssets.js`，按文件体积筛选偏大图片并生成建议（供脚本或自建工具使用）
- `scanCodeReferences(path, options)` — `lib/scanCodeReferences.js`，`path` 为目录或单个支持的源码文件（或 `.`），扫描源码引用并结合像素尺寸给出 CLS / 比例 / 格式类建议（供 CLI 或脚本使用）
- `processPictureStack(inputPath, options)` — `lib/pictureStack.js`，一次写出 AVIF / WebP / JPEG

适合在构建脚本或 Node 服务中复用同一套逻辑。

## Agent Skill（Skills CLI / `npx skills add`）

本仓库按 [Skills CLI](https://www.npmjs.com/package/skills) 约定提供可安装 Skill，见目录 [`skills/`](skills/README.md)（与 [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) 的 `skills/<name>/SKILL.md` 布局一致）。技能目录名为 **`cimg-audit`**（短、与包名一致，便于 `-s cimg-audit`）。

**何时需要 / 触发条件（选用本 Skill 的典型场景）**

- 对话或任务涉及：**图片体积与格式**（WebP/AVIF）、**`<picture>` / `srcset`**、**LCP / CLS / layout shift**、首屏大图
- 要先做**只读**引用审计再改代码：用 **`npx lake-cimg@latest scan-code`** 出 JSON，再按需改标签或压缩
- 希望 Agent **按固定流程**：先 `scan-code` → 再按需 `npx lake-cimg@latest` 压缩或 `picture` 多格式输出

更细的英文说明见 [`skills/README.md` 的「When to use」一节](skills/README.md#when-to-use)。

**从 GitHub 安装**（需已推送；将 `lake0090/lake-cimg` 换成你的 fork 若不同）：

```bash
# 安装到用户级（-g），仅本 skill（-s），跳过确认（-y）
npx skills add lake0090/lake-cimg -s cimg-audit -g -y

# 仅安装到当前项目
npx skills add lake0090/lake-cimg -s cimg-audit -y
```

**本地克隆开发时**（在仓库根目录执行）：

```bash
npx skills add . -s cimg-audit -y
```

可选：`--agent cursor` 等，见 `npx skills add --help`。Skill 正文在 [`skills/cimg-audit/SKILL.md`](skills/cimg-audit/SKILL.md)，指导用 **`npx lake-cimg@latest scan-code`** 与压缩 / `picture` 子命令配合使用。

安装 Skill 后，在 Agent 对话里可直接让模型按 Skill 流程执行（例如：先 `scan-code` 再按需压缩）；CLI 与 `npx` 均在本地执行，图片不会上传到云端。

## 常见问题

- **写权限**：`-o` 指向的目录需可创建/写入；否则 sharp 或 `fs` 会报错。
- **路径**：Windows 与 Unix 路径均可；建议对含空格的路径加引号。
- **质量范围**：`--quality` 须为 **1–100** 的整数；`--size` 若提供则须为 **正整数**。

## 待办事项

- **Lighthouse 审计**：后续接入 [Lighthouse](https://developer.chrome.com/docs/lighthouse)（或 CI 中的 Lighthouse CI），对典型页面做性能 / 最佳实践等审计。
- **审计前后对比**：在引入 `scan-code`、压缩、`picture` 等优化前后各跑一轮，保存报告（JSON/HTML），对比 LCP、CLS、资源体积等指标，量化改动效果。
- **专项优化**：根据 Lighthouse 报告中的具体项（如 LCP 候选、未使用 CSS、图片尺寸等）做针对性迭代，与现有 CLI / Skill 工作流互补。

## 发布到 npm（维护者）

仓库通过 [`.github/workflows/publish-npm.yml`](.github/workflows/publish-npm.yml) 在发布 GitHub Release 或手动触发 workflow 时执行 `npm publish --provenance`。

### 本地自检（可选）

在项目根目录执行：

```bash
npm pkg fix
```

会按 npm 建议整理 `package.json`（例如 `repository` 等字段格式）。执行后用 `git diff` 查看变更，确认无误再提交。

### GitHub Actions Secrets

在 GitHub 仓库 **Settings → Secrets and variables → Actions** 中配置 **`NPM_TOKEN`**：使用 [npm](https://www.npmjs.com/) 帐号的 **Automation** 类型 token（或具备发布权限的 token），与 workflow 里 `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` 对应。未配置或 token 无效时，发布步骤会在认证阶段失败。

## 依赖说明

核心库：[sharp](https://sharp.pixelplumbing.com/)、[commander](https://github.com/tj/commander.js)。项目自身许可证以仓库根目录声明为准（若有）。
