import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { learner, LOCAL_LEARNER_ID, providerKey } from "@self-learn/schema";
import { eq, sql } from "drizzle-orm";
import ts from "typescript";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runExport } from "../src/commands/export";
import { runImportCommand } from "../src/commands/index-command";
import { REPO_ROOT } from "../src/env";
import { applyMigrations } from "../src/migrations";
import {
  deleteProviderKey,
  readLearnerSnapshot,
  readProviderKeys,
  type SealedProviderKey,
  writeProviderKey,
} from "../src/state";
import { SEED } from "./seed";
import { createScratchDatabase, probe, type Scratch, sqlstate } from "./scratch-database";

/**
 * `provider_key` (docs/BYOK.md): an owner's own model provider keys, sealed
 * by the web app and stored here as bytes.
 *
 * Three things are held here. The table's constraints hold whatever a writer
 * sends. The catalog's functions never cross owners. And the keys never leave
 * through an export: at run time, by exporting a database that holds one and
 * reading every byte written; and by source, since only one module may name
 * the table at all, which is what keeps the exports that are not run here
 * (the nightly export, which is `catalog export`, `learn vault pull`, and the
 * learner export) from ever reading it.
 */

const reachable = await probe();
const OTHER = "owner-b";

/** A stand-in for a sealed key: the catalog stores bytes and never opens them. */
function sealed(marker: string, last4 = "Wq7z"): SealedProviderKey {
  return {
    ciphertext: Buffer.from(`${marker}-${randomBytes(8).toString("hex")}`),
    iv: randomBytes(12),
    authTag: randomBytes(16),
    keyVersion: 1,
    last4,
  };
}

describe.skipIf(!reachable.ok)("provider_key", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    await scratch.db.insert(learner).values([{ id: LOCAL_LEARNER_ID }, { id: OTHER }]).onConflictDoNothing();
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  beforeEach(async () => {
    await scratch.db.delete(providerKey);
  });

  it("stores, replaces and removes one owner's key per provider", async () => {
    const first = await writeProviderKey(scratch.db, LOCAL_LEARNER_ID, "gemini", sealed("first", "aaaa"));
    const [stored] = await readProviderKeys(scratch.db, LOCAL_LEARNER_ID);
    expect(stored).toMatchObject({ provider: "gemini", last4: "aaaa", keyVersion: 1 });

    const second = await writeProviderKey(scratch.db, LOCAL_LEARNER_ID, "gemini", sealed("second", "bbbb"));
    const rows = await readProviderKeys(scratch.db, LOCAL_LEARNER_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.last4).toBe("bbbb");
    expect(rows[0]?.ciphertext.toString()).toMatch(/^second-/);
    expect(second.createdAt.getTime()).toBe(first.createdAt.getTime());

    expect(await deleteProviderKey(scratch.db, LOCAL_LEARNER_ID, "gemini")).toBe(true);
    expect(await deleteProviderKey(scratch.db, LOCAL_LEARNER_ID, "gemini")).toBe(false);
    expect(await readProviderKeys(scratch.db, LOCAL_LEARNER_ID)).toEqual([]);
  });

  it("never crosses owners: B reads none of A's keys and cannot remove them", async () => {
    await writeProviderKey(scratch.db, LOCAL_LEARNER_ID, "nvidia", sealed("owner-a"));
    expect(await readProviderKeys(scratch.db, OTHER)).toEqual([]);
    expect(await deleteProviderKey(scratch.db, OTHER, "nvidia")).toBe(false);
    expect(await readProviderKeys(scratch.db, LOCAL_LEARNER_ID)).toHaveLength(1);

    await writeProviderKey(scratch.db, OTHER, "nvidia", sealed("owner-b", "bbbb"));
    const [mine] = await readProviderKeys(scratch.db, LOCAL_LEARNER_ID);
    const [theirs] = await readProviderKeys(scratch.db, OTHER);
    expect(mine?.ciphertext.toString()).toMatch(/^owner-a-/);
    expect(theirs?.ciphertext.toString()).toMatch(/^owner-b-/);
  });

  it("refuses a provider it does not know, in the function and in the table", async () => {
    await expect(writeProviderKey(scratch.db, LOCAL_LEARNER_ID, "openai", sealed("x"))).rejects.toThrow(/not a model provider/);
    const error = await scratch.db
      .insert(providerKey)
      .values({ ownerId: LOCAL_LEARNER_ID, provider: "openai", ...sealed("x") })
      .catch((e: unknown) => e);
    expect(sqlstate(error)).toBe("23514");
  });

  it("holds its shape whatever a writer sends", async () => {
    const base = { ownerId: LOCAL_LEARNER_ID, provider: "gemini", ...sealed("shape") };
    const bad = [
      { ...base, iv: randomBytes(16) },
      { ...base, authTag: randomBytes(8) },
      { ...base, ciphertext: Buffer.alloc(0) },
      { ...base, ciphertext: randomBytes(2049) },
      { ...base, keyVersion: 0 },
      { ...base, last4: "abc" },
      { ...base, last4: "abcde" },
    ];
    for (const values of bad) {
      const error = await scratch.db.insert(providerKey).values(values).catch((e: unknown) => e);
      expect(sqlstate(error), JSON.stringify({ ...values, ciphertext: values.ciphertext.length })).toBe("23514");
    }
    // No default owner: a key is never filed under `local` by omission.
    const missingOwner = await scratch.db
      .execute(sql`insert into provider_key (provider, ciphertext, iv, auth_tag, key_version, last4)
        values ('gemini', ${base.ciphertext}, ${base.iv}, ${base.authTag}, 1, 'abcd')`)
      .catch((e: unknown) => e);
    expect(sqlstate(missingOwner)).toBe("23502");
    // One key per owner and provider.
    await scratch.db.insert(providerKey).values(base);
    const twice = await scratch.db.insert(providerKey).values(base).catch((e: unknown) => e);
    expect(sqlstate(twice)).toBe("23505");
  });

  it("goes with its owner: deleting the learner deletes their keys", async () => {
    await scratch.db.insert(learner).values({ id: "owner-gone" });
    await writeProviderKey(scratch.db, "owner-gone", "openrouter", sealed("gone"));
    await scratch.db.delete(learner).where(eq(learner.id, "owner-gone"));
    expect(await readProviderKeys(scratch.db, "owner-gone")).toEqual([]);
  });
});

/** Every file under `dir`, as bytes. */
async function everyFile(dir: string): Promise<{ path: string; bytes: Buffer }[]> {
  const out: { path: string; bytes: Buffer }[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    out.push({ path: file, bytes: await readFile(file) });
  }
  return out;
}

describe.skipIf(!reachable.ok)("provider keys never leave through an export", () => {
  let scratch: Scratch;
  let out: string;
  let home: string;
  const saved = {
    url: process.env["DATABASE_URL"],
    manimkc: process.env["MANIMKC_ROOT"],
    home: process.env["SELF_LEARN_HOME"],
  };

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await applyMigrations(scratch.db);
    out = await mkdtemp(path.join(tmpdir(), "catalog-byok-export-"));
    home = await mkdtemp(path.join(tmpdir(), "catalog-byok-home-"));
    process.env["DATABASE_URL"] = scratch.url;
    process.env["MANIMKC_ROOT"] = path.join(tmpdir(), "catalog-test-no-manimkc");
    process.env["SELF_LEARN_HOME"] = home;
  }, 60_000);

  afterAll(async () => {
    for (const [key, value] of [
      ["DATABASE_URL", saved.url],
      ["MANIMKC_ROOT", saved.manimkc],
      ["SELF_LEARN_HOME", saved.home],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await scratch?.drop();
    for (const dir of [out, home]) if (dir !== undefined) await rm(dir, { recursive: true, force: true });
  });

  it("writes no byte of a stored key into `catalog export`, and the learner snapshot carries none", async () => {
    await runImportCommand({ dir: SEED });
    const marker = `BYOK-MARKER-${randomBytes(6).toString("hex")}`;
    const key = sealed(marker, "Qz~9");
    await writeProviderKey(scratch.db, LOCAL_LEARNER_ID, "gemini", key);

    const result = await runExport({ out });
    expect(result.types.length).toBeGreaterThan(0);
    const files = await everyFile(out);
    // The seed has every type in it, so an empty export would pass for the wrong reason.
    expect(files.length).toBeGreaterThan(10);
    expect(files.some((f) => f.path.includes(`${path.sep}concepts${path.sep}`))).toBe(true);
    const needles = [
      key.ciphertext,
      Buffer.from(key.ciphertext.toString("hex")),
      Buffer.from(key.ciphertext.toString("base64")),
      Buffer.from(marker),
      key.iv,
      key.authTag,
      Buffer.from("Qz~9"),
      Buffer.from("provider_key"),
    ];
    for (const file of files) {
      for (const needle of needles) expect(file.bytes.includes(needle), `${file.path} holds part of a key`).toBe(false);
    }

    const snapshot = JSON.stringify(await readLearnerSnapshot(scratch.db, LOCAL_LEARNER_ID));
    expect(snapshot).not.toContain(marker);
    expect(snapshot).not.toContain(key.ciphertext.toString("base64"));
    expect(snapshot).not.toContain("Qz~9");
  }, 240_000);
});

/**
 * Whether code (not a comment) names the table: an identifier, or a string
 * or template holding the SQL name. The scanner skips comments, so prose
 * about the table is free to say its name.
 */
function namesTable(text: string): boolean {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.JSX, text);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    const value = scanner.getTokenValue() ?? "";
    if (token === ts.SyntaxKind.Identifier && (value === "providerKey" || value === "provider_key")) return true;
    if (
      (token === ts.SyntaxKind.StringLiteral ||
        token === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
        token === ts.SyntaxKind.TemplateHead) &&
      /\bprovider_key\b|\bproviderKey\b/.test(value)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * By source: the table is named in one module and nowhere else that ships.
 * An exporter, the vault, a snapshot or a route that wanted the keys would
 * have to name `providerKey` or `provider_key`, and this fails it the day it
 * does. The schema declares it, the migrations create it, the one door reads
 * and writes it, and tests may look at it.
 */
describe("the one door to provider_key", () => {
  const ALLOWED = new Set(
    [
      "packages/schema/src/state.ts",
      "packages/schema/src/index.ts",
      "services/catalog/src/state/provider-keys.ts",
    ].map((p) => path.join(REPO_ROOT, p)),
  );
  const ROOTS = ["apps", "services", "packages", "scripts"].map((p) => path.join(REPO_ROOT, p));
  const SKIP = /(^|\/)(node_modules|\.next|dist|coverage|drizzle)(\/|$)/;

  it("finds a reference the way it is meant to", () => {
    expect(namesTable("// the provider_key table\nconst x = 1;")).toBe(false);
    expect(namesTable("import { providerKey } from '@self-learn/schema';")).toBe(true);
    expect(namesTable("db.execute(sql`select * from provider_key`)")).toBe(true);
    expect(namesTable("db.execute(sql`select ${a} from provider_key`)")).toBe(true);
    expect(namesTable('query("delete from provider_key")')).toBe(true);
  });

  it("is named by no shipped source but the schema and the catalog's provider-keys module", async () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const entry of await readdir(root, { withFileTypes: true, recursive: true })) {
        if (!entry.isFile()) continue;
        const file = path.join(entry.parentPath, entry.name);
        const relative = path.relative(REPO_ROOT, file);
        if (SKIP.test(relative) || !/\.(ts|tsx|mts|mjs|js|cjs|sql)$/.test(file) || /\.test\.(ts|mjs)$/.test(file)) continue;
        if (relative.startsWith("services/catalog/test/")) continue;
        if (ALLOWED.has(file)) continue;
        const text = await readFile(file, "utf8");
        const named = file.endsWith(".sql") ? /\bprovider_key\b/i.test(text) : namesTable(text);
        if (named) offenders.push(relative);
      }
    }
    expect(offenders).toEqual([]);
  });
});
