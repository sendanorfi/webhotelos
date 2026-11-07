import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { Miniflare } from "miniflare";

const source = await readFile(new URL("./worker.mjs", import.meta.url), "utf8");
const expected = [{ name: "alpha" }, { name: "beta" }];

async function sqliteFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const found = await Promise.all(entries.map(async (entry) => {
    const name = path.join(dir, entry.name);
    return entry.isDirectory() ? sqliteFiles(name) : name.endsWith(".sqlite") ? [name] : [];
  }));
  return found.flat();
}

test("local D1 binding uses persistent SQLite and rolls back a failed batch", async () => {
  const state = await mkdtemp(path.join(tmpdir(), "webhotelos-sites-compat-"));
  let mf;
  const start = () => new Miniflare({
    modules: true,
    script: source,
    compatibilityDate: "2026-05-15",
    d1Databases: { DB: "synthetic-example" },
    d1Persist: state,
    host: "127.0.0.1",
    port: 0,
    cf: false,
    outboundService: () => new Response("Egress disabled", { status: 403 }),
  });
  try {
    mf = start();
    let response = await mf.dispatchFetch("http://local.test/seed", { method: "POST" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    response = await mf.dispatchFetch("http://local.test/items");
    assert.deepEqual(await response.json(), expected);
    response = await mf.dispatchFetch("http://local.test/rollback", { method: "POST" });
    assert.deepEqual(await response.json(), { rolledBack: true });
    response = await mf.dispatchFetch("http://local.test/items");
    assert.deepEqual(await response.json(), expected);
    await mf.dispose();
    mf = undefined;

    const databases = await sqliteFiles(state);
    assert.ok(databases.length >= 1);
    for (const database of databases) {
      assert.equal((await readFile(database)).subarray(0, 16).toString(), "SQLite format 3\0");
    }

    mf = start();
    response = await mf.dispatchFetch("http://local.test/items");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), expected);
  } finally {
    try {
      if (mf) await mf.dispose();
    } finally {
      await rm(state, { recursive: true, force: true });
    }
  }
});
