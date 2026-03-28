import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import test from "node:test";
import assert from "node:assert/strict";
import { scanCodeReferences } from "../lib/scanCodeReferences.js";

const MIN_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

test("resolves /images/... under public/ and @/... under src/", async () => {
  const root = await mkdtemp(join(tmpdir(), "cimg-scan-"));
  try {
    await mkdir(join(root, "public", "images"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "public", "images", "x.png"), MIN_PNG);
    await writeFile(join(root, "src", "logo.png"), MIN_PNG);
    await writeFile(
      join(root, "page.html"),
      `<img src="/images/x.png" width="1" height="1" alt="a" />
<img src="@/logo.png" width="1" height="1" alt="b" />`
    );

    const result = await scanCodeReferences(join(root, "page.html"), {
      cwd: root,
      recursive: false,
      limit: 50,
    });

    const byRef = new Map(result.items.map((r) => [r.rawRef, r]));
    const absX = byRef.get("/images/x.png")?.absolutePath;
    const absLogo = byRef.get("@/logo.png")?.absolutePath;
    assert.equal(absX, join(root, "public", "images", "x.png"));
    assert.equal(absLogo, join(root, "src", "logo.png"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("resolves custom @aaa alias and ~@/ as @/", async () => {
  const root = await mkdtemp(join(tmpdir(), "cimg-scan-"));
  try {
    await mkdir(join(root, "packages", "aaa"), { recursive: true });
    await writeFile(join(root, "packages", "aaa", "z.png"), MIN_PNG);
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "w.png"), MIN_PNG);
    await writeFile(
      join(root, "app.html"),
      `<img src="@aaa/z.png" width="1" height="1" alt="z" />
<img src="~@/w.png" width="1" height="1" alt="w" />`
    );

    const result = await scanCodeReferences(join(root, "app.html"), {
      cwd: root,
      recursive: false,
      limit: 50,
      aliases: { "@aaa": "packages/aaa" },
    });

    const byRef = new Map(result.items.map((r) => [r.rawRef, r]));
    assert.equal(
      byRef.get("@aaa/z.png")?.absolutePath,
      join(root, "packages", "aaa", "z.png")
    );
    assert.equal(
      byRef.get("~@/w.png")?.absolutePath,
      join(root, "src", "w.png")
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
