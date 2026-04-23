import { mkdir, mkdtemp, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import test from "node:test";
import assert from "node:assert/strict";
import { scanFiles } from "../lib/scan.js";

const MIN_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

test("scanFiles: tiny PNG has skip suggestion and valid metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "cimg-scanfiles-"));
  const pngPath = join(root, "a.png");
  try {
    await writeFile(pngPath, MIN_PNG);
    const { files, totalBytes } = await scanFiles(pngPath, { recursive: false });
    assert.equal(files.length, 1);
    assert.equal(files[0].format, "png");
    assert.equal(files[0].sizeBytes, MIN_PNG.length);
    assert.equal(totalBytes, MIN_PNG.length);
    assert.ok(
      /不处理|体积过小/.test(files[0].suggestion),
      `unexpected suggestion: ${files[0].suggestion}`
    );
    assert.ok(files[0].width >= 1);
    assert.ok(files[0].height >= 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scanFiles: directory non-recursive only top-level images", async () => {
  const root = await mkdtemp(join(tmpdir(), "cimg-scanfiles-"));
  try {
    await mkdir(join(root, "sub"), { recursive: true });
    await writeFile(join(root, "a.png"), MIN_PNG);
    await writeFile(join(root, "sub", "b.png"), MIN_PNG);
    const { files } = await scanFiles(root, { recursive: false });
    const names = files.map((f) => f.path.replace(/\\/g, "/").split("/").pop());
    assert.equal(files.length, 1);
    assert.equal(names[0], "a.png");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scanFiles: directory recursive includes nested images", async () => {
  const root = await mkdtemp(join(tmpdir(), "cimg-scanfiles-"));
  try {
    await mkdir(join(root, "sub"), { recursive: true });
    await writeFile(join(root, "a.png"), MIN_PNG);
    await writeFile(join(root, "sub", "b.png"), MIN_PNG);
    const { files } = await scanFiles(root, { recursive: true });
    const names = new Set(
      files.map((f) => f.path.replace(/\\/g, "/").split("/").pop())
    );
    assert.equal(files.length, 2);
    assert.ok(names.has("a.png"));
    assert.ok(names.has("b.png"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
