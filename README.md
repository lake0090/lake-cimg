# lake-cimg · `cimg`

命令行批量压缩图片，默认输出 **WebP**；支持单文件、目录，以及递归子目录。基于 [sharp](https://sharp.pixelplumbing.com/)，可多任务并行处理。

## 特性

- 默认转为 WebP，可调质量；可选 `--no-webp` 保留原格式仅压缩
- 可选按最长边缩放（`--size`），不指定则只做编码压缩、不改变像素尺寸
- 目录批量处理；`-r` 递归子目录；配合 `-o` 时保持相对目录结构
- 处理过程输出体积对比；失败时非零退出码

## 环境要求

- **Node.js** ≥ 18

## 安装

```bash
# 全局安装后，任意目录可直接使用 cimg
npm install -g lake-cimg
```

```bash
# 在本项目目录内开发或本地使用时
cd /path/to/cimg
npm install
node bin/cimg.js --help
```

通过 `npx` 单次运行（无需全局安装）：

```bash
npx lake-cimg <路径> [选项]
```

## 快速开始

```bash
# 查看帮助与版本
cimg --help
cimg --version

# 压缩当前目录下支持的图片（见下文「行为说明」：未指定 -o 时会替换源文件）
cimg .

# 输出到单独目录，并限制最长边 1200px
cimg ./photos -o ./dist -s 1200

# 递归子目录，质量 80
cimg ./assets -r -q 80
```

使用本地 `npm run` 时，**必须在参数前加 `--`**，否则 npm 会吞掉 `--size` 等选项：

```bash
npm run compress -- ./photo.png --size 100
```

## 命令说明

### 用法

```text
cimg [options] [input]
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

**未指定 `-o` 时**：在源文件所在目录生成 `.webp`（或 `--no-webp` 时覆盖原格式文件），并**删除原始图片**。批量处理前请确认已备份或使用 `-o` 写到单独目录。

**指定 `-o` 且使用 `-r`**：会按源目录的相对路径在输出目录下重建子文件夹，避免不同子目录中的同名文件互相覆盖。

**并发**：按 CPU 核心数限制并行任务数，大目录下可显著快于单线程。

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

适合在构建脚本或 Node 服务中复用同一套逻辑。

## 常见问题

- **写权限**：`-o` 指向的目录需可创建/写入；否则 sharp 或 `fs` 会报错。
- **路径**：Windows 与 Unix 路径均可；建议对含空格的路径加引号。
- **质量范围**：`--quality` 须为 **1–100** 的整数；`--size` 若提供则须为 **正整数**。

## 依赖说明

核心库：[sharp](https://sharp.pixelplumbing.com/)、[commander](https://github.com/tj/commander.js)。项目自身许可证以仓库根目录声明为准（若有）。
