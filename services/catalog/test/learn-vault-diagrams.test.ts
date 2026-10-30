import { createHash } from "node:crypto";
import { readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import fsPromises from "node:fs/promises";

import { describe, expect, it, vi } from "vitest";

import { openBlobStore } from "../src/content/blob";
import { putDiagram } from "../src/content/diagrams";
import { pullVault } from "../src/learn/vault";
import { diagramDocument, learnVault } from "./learn-vault-fixture";
import { probe } from "./scratch-database";

/**
 * `learn vault pull|push` and the diagrams' SVGs, pulled read-only into
 * `assets/` and never pushed. learn-vault-fixture.ts describes the fixture.
 */

const reachable = await probe();

describe.skipIf(!reachable.ok)("learn vault", () => {
  const v = learnVault();
  const { pull, push, newVault, read, exists, manifest } = v;

  it("pulls each diagram's SVG into assets/, read-only, and push leaves it alone", async () => {
    const work = await newVault();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><title>alpha</title></svg>';
    await writeFile(path.join(work, "alpha-map.tldr"), diagramDocument());
    await writeFile(path.join(work, "alpha-map.svg"), svg);
    await putDiagram(v.scratch.db, openBlobStore(), {
      slug: "alpha-map",
      tldr: path.join(work, "alpha-map.tldr"),
      svg: path.join(work, "alpha-map.svg"),
      reason: "a diagram for the vault test",
      author: "local",
      authorKind: "person",
    });

    const vault = await newVault();
    const pulled = await pull(vault);
    expect(pulled).toMatchObject({ assets: 1, problems: [] });
    expect(pulled.written).toContain("assets/alpha-map.svg");
    expect(await read(vault, "assets/alpha-map.svg")).toBe(svg);
    expect((await manifest(vault)).files["assets/alpha-map.svg"]).toMatchObject({ kind: "asset", id: "alpha-map" });
    expect((await pull(vault)).unchanged).toContain("assets/alpha-map.svg");

    // Edited here: never pushed, never overwritten, and said so.
    await writeFile(path.join(vault, "assets/alpha-map.svg"), `${svg}\n<!-- mine -->\n`);
    const pushed = await push(vault);
    expect(pushed).toMatchObject({ pushed: [], refused: [], code: 0 });
    expect(pushed.unchanged).not.toContain("assets/alpha-map.svg");
    const again = await pull(vault);
    expect(again.modified).toEqual([
      { path: "assets/alpha-map.svg", incoming: null, note: expect.stringMatching(/read-only in the vault/) },
    ]);
    expect(await read(vault, "assets/alpha-map.svg")).toBe(`${svg}\n<!-- mine -->\n`);
    // Deleted, it comes back from the store.
    await rm(path.join(vault, "assets/alpha-map.svg"));
    expect((await pull(vault)).written).toEqual(["assets/alpha-map.svg"]);

    // A new SVG in the database, and two saves racing the pull that replaces
    // the old one: one lands just before the pull moves the file aside, one
    // just after. Both are kept; the second where it was saved.
    const newer = svg.replace("<title>alpha</title>", "<title>alpha, redrawn</title>");
    await writeFile(path.join(work, "alpha-map.svg"), newer);
    await writeFile(path.join(work, "alpha-map.tldr"), diagramDocument().replace("Alpha map", "Alpha map, redrawn"));
    await putDiagram(v.scratch.db, openBlobStore(), {
      slug: "alpha-map",
      tldr: path.join(work, "alpha-map.tldr"),
      svg: path.join(work, "alpha-map.svg"),
      reason: "redrawn",
      author: "local",
      authorKind: "person",
    });
    const target = path.join(vault, "assets/alpha-map.svg");
    const renameOriginal = fsPromises.rename;
    const spy = vi.spyOn(fsPromises, "rename").mockImplementation(async (from, to) => {
      if (from !== target) return renameOriginal(from, to);
      await fsPromises.writeFile(target, "<svg>first save</svg>");
      await renameOriginal(from, to);
      await fsPromises.writeFile(target, "<svg>second save</svg>");
    });
    try {
      await pullVault(v.scratch.db, { dir: vault });
    } finally {
      spy.mockRestore();
    }
    expect(await read(vault, "assets/alpha-map.svg")).toBe("<svg>second save</svg>");
    const kept = (await readdir(path.join(vault, "assets"))).filter((name) => /^alpha-map\.kept-\d+\.svg$/.test(name));
    expect(kept).toHaveLength(1);
    expect(await read(vault, `assets/${kept[0]}`)).toBe("<svg>first save</svg>");
  }, 60_000);

  it("removes an unedited SVG whose diagram is gone, judged by its bytes", async () => {
    const vault = await newVault();
    await pull(vault);
    // Not valid UTF-8, as an SVG's bytes need not be.
    const bytes = Buffer.from([0x3c, 0x73, 0x76, 0x67, 0xff, 0xfe, 0x3e]);
    await writeFile(path.join(vault, "assets/old-diagram.svg"), bytes);
    const recorded = await manifest(vault);
    recorded.files["assets/old-diagram.svg"] = {
      kind: "asset",
      id: "old-diagram",
      base: null,
      hash: createHash("sha256").update(bytes).digest("hex"),
    };
    await writeFile(path.join(vault, ".vault.json"), JSON.stringify(recorded, null, 2));
    expect((await pull(vault)).removed).toEqual(["assets/old-diagram.svg"]);
    expect(await exists(vault, "assets/old-diagram.svg")).toBe(false);
  }, 60_000);
});
