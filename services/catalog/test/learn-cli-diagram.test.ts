import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ENTRY, execFileAsync, learnCli } from "./learn-cli-fixture";
import { markImported, probe } from "./scratch-database";
import { TOPIC_SLUG } from "./state-fixture";

/**
 * `learn diagram`, end to end: `catalog diagram` under the plugin's name,
 * attributed to the agent that runs it. learn-cli-fixture.ts describes the
 * database and knowledge base.
 */

const reachable = await probe();

describe.skipIf(!reachable.ok)("learn CLI", () => {
  const cli = learnCli();

  describe("diagram", () => {
    // `learn diagram` is `catalog diagram` under the plugin's name, attributed
    // to the agent that runs it. The checkouts go under a temp STUDIO_HOME and
    // the blobs under the temp GNOSIA_HOME vitest.setup.ts points at, so
    // neither the real studio's work directory nor ~/.gnosia is touched.
    let studioHome: string;

    beforeAll(async () => {
      studioHome = await mkdtemp(path.join(tmpdir(), "learn-cli-studio-"));
      // The files still own diagrams here, so a put writes them through
      // (D17) under the tree this database imported diagrams from.
      await markImported(cli.scratch.db, "diagrams", cli.root);
    });

    afterAll(async () => {
      if (studioHome !== undefined) await rm(studioHome, { recursive: true, force: true });
    });

    async function diagram(...args: string[]) {
      const { stdout } = await execFileAsync(process.execPath, ["--import", "tsx", ENTRY, "diagram", ...args, "--json"], {
        env: { ...process.env, LEARN_ROOT: cli.root, DATABASE_URL: cli.scratch.url, STUDIO_HOME: studioHome },
      });
      return JSON.parse(stdout) as Record<string, unknown>;
    }

    const document = JSON.stringify({
      tldrawFileFormatVersion: 1,
      schema: { schemaVersion: 2 },
      records: [
        { typeName: "shape", id: "shape:a", type: "geo", x: 0, y: 0, props: { w: 100, h: 50 } },
        {
          typeName: "document",
          id: "document:document",
          gridSize: 10,
          name: "",
          meta: { tldrawkc: { kc: 1, topic: TOPIC_SLUG, title: "Alpha, drawn", concepts: ["alpha"] } },
        },
        { typeName: "page", id: "page:page", name: "Page 1", index: "a1", meta: {} },
      ],
    });

    it("draws in the checkout it prints and commits it as the diagram-maker agent", async () => {
      const checkout = await diagram("checkout", "alpha");
      expect(checkout).toMatchObject({ ok: true, exists: false, path: path.join(studioHome, "work", "alpha.tldr") });
      await writeFile(checkout.path as string, document);
      const committed = await diagram("commit", "alpha", "--reason", "Draw alpha");
      expect(committed).toMatchObject({ ok: true, changed: true, topic: TOPIC_SLUG, concepts: ["alpha"] });
      const rows = await cli.scratch.db.execute<{ author: string; author_kind: string }>(
        "select author, author_kind from content_revision where entity_type = 'diagram' and entity_id = 'alpha'",
      );
      expect(rows.rows).toEqual([{ author: "diagram-maker", author_kind: "agent" }]);
    });

    it("stores an SVG drawn without the canvas, and refuses one for a slug that has a document", async () => {
      const svg = path.join(studioHome, "beta.svg");
      await writeFile(svg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>');
      const put = await diagram("put", "--slug", "beta", "--svg", svg, "--topic", TOPIC_SLUG, "--concept", "beta", "--reason", "By hand");
      expect(put).toMatchObject({ ok: true, changed: true, concepts: ["beta"] });
      const refused = await diagram("put", "--slug", "alpha", "--svg", svg, "--topic", TOPIC_SLUG, "--reason", "By hand").catch(
        (error: { stdout: string; code: number }) => ({ ...(JSON.parse(error.stdout) as object), exit: error.code }),
      );
      expect(refused).toMatchObject({ ok: false, exit: 1 });
    });

    it("exits 3 when the database is down, as catalog diagram does", async () => {
      const failed = await execFileAsync(process.execPath, ["--import", "tsx", ENTRY, "diagram", "list", "--json"], {
        env: { ...process.env, LEARN_ROOT: cli.root, DATABASE_URL: cli.unreachableUrl(), STUDIO_HOME: studioHome },
      }).catch((error: { code: number; stdout: string }) => error);
      expect((failed as { code: number }).code).toBe(3);
      expect(JSON.parse((failed as { stdout: string }).stdout)).toMatchObject({ ok: false });
    });
  });
});
