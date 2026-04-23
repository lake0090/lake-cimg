import { randomBytes } from "crypto";
import { mkdir, mkdtemp, writeFile, readFile, rm, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { collectFiles, processOne } from "../lib/compress.js";

const MIN_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

test("collectFiles: unsupported file path returns []", async () => {
  const root = await mkdtemp(join(tmpdir(), "cimg-collect-"));
  const txt = join(root, "n.txt");
  try {
    await writeFile(txt, "x");
    const list = await collectFiles(txt, false);
    assert.deepEqual(list, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("collectFiles: single supported file returns absolute path", async () => {
  const root = await mkdtemp(join(tmpdir(), "cimg-collect-"));
  const png = join(root, "x.png");
  try {
    await writeFile(png, MIN_PNG);
    const list = await collectFiles(png, false);
    assert.equal(list.length, 1);
    assert.equal(list[0].toLowerCase(), png.toLowerCase());
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("collectFiles: directory matches scan.js behavior for nesting", async () => {
  const root = await mkdtemp(join(tmpdir(), "cimg-collect-"));
  try {
    await mkdir(join(root, "in"), { recursive: true });
    await writeFile(join(root, "p.png"), MIN_PNG);
    await writeFile(join(root, "in", "q.png"), MIN_PNG);
    const flat = await collectFiles(root, false);
    const rec = await collectFiles(root, true);
    assert.equal(flat.length, 1);
    assert.equal(rec.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processOne: under 10KB skips with reason small", async () => {
  const root = await mkdtemp(join(tmpdir(), "cimg-proc-"));
  const outDir = join(root, "out");
  const png = join(root, "tiny.png");
  try {
    await mkdir(outDir, { recursive: true });
    await writeFile(png, MIN_PNG);
    const r = await processOne(png, { outDir, toWebp: true });
    assert.equal(r.skipped, true);
    assert.equal(r.reason, "small");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("processOne: large PNG compresses to webp in outDir", async () => {
  const root = await mkdtemp(join(tmpdir(), "cimg-proc-"));
  const outDir = join(root, "out");
  const png = join(root, "big.png");
  try {
    const rw = 120;
    const rh = 90;
    const raw = randomBytes(rw * rh * 3);
    const buf = await sharp(raw, {
      raw: { width: rw, height: rh, channels: 3 },
    })
      .png()
      .toBuffer();
    assert.ok(
      buf.length > 10 * 1024,
      "sanity: noisy PNG should exceed 10KB skip threshold"
    );
    await mkdir(outDir, { recursive: true });
    await writeFile(png, buf);
    const r = await processOne(png, { outDir, toWebp: true, quality: 80 });
    assert.ok(!r.skipped);
    assert.equal(r.format, "webp");
    const st = await stat(r.outPath);
    assert.ok(st.isFile());
    const w = await readFile(r.outPath);
    const meta = await sharp(w).metadata();
    assert.equal(meta.format, "webp");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
