import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { learnCli } from "./learn-cli-fixture";
import { probe } from "./scratch-database";

/**
 * The files the `learn` CLI still owns, end to end, in a knowledge base
 * `LEARN_ROOT` names: notes added, checked, mapped, checked out and committed
 * back. The tests run in order: one restores the note the next reads.
 * learn-cli-fixture.ts describes the database and knowledge base.
 */

const reachable = await probe();

describe.skipIf(!reachable.ok)("learn CLI", () => {
  const cli = learnCli();
  const { learn, json } = cli;

  describe("files the CLI still owns", () => {
    it("concept add writes a note and warns it is not in the catalog", async () => {
      const { stdout } = await learn("concept", "add", "--title", "Widgets", "--domain", "fixtures");
      expect(stdout).toContain("learn/concepts/fixtures/widgets.md");
      expect(stdout).toContain("maps.concepts");
      await rm(path.join(cli.root, "learn", "concepts", "fixtures", "widgets.md"), { force: true });
    });

    it("doctor calls a note an orphan only when it has no edge of either kind", async () => {
      // `background` has an outgoing `assumes` edge and nothing else, and
      // `basis` only an incoming one (nothing requires it); the doc tells
      // authors to prefer that kind when in doubt, so neither direction may
      // be the thing the orphan warning fires on. `solo` has no edge at all.
      const dir = path.join(cli.root, "learn", "concepts", "fixtures");
      const fixtures = {
        basis: "---\nid: basis\ntitle: Basis\n---\n\n# Basis\n",
        background: "---\nid: background\ntitle: Background\nassumes: [basis]\n---\n\n# Background\n",
        solo: "---\nid: solo\ntitle: Solo\n---\n\n# Solo\n",
      };
      for (const [id, body] of Object.entries(fixtures)) await writeFile(path.join(dir, `${id}.md`), body, "utf8");
      try {
        const { stdout } = await learn("doctor", "--json").catch((error: { stdout: string }) => error);
        const report = JSON.parse(stdout) as { problems: { kind: string; message: string }[] };
        const orphans = report.problems.filter((p) => p.kind === "orphan").map((p) => p.message);
        expect(orphans).toEqual(["solo is connected to nothing — is a prerequisite missing?"]);
      } finally {
        for (const id of Object.keys(fixtures)) await rm(path.join(dir, `${id}.md`), { force: true });
      }
    });

    it("map prints the map, and writes a file only when --out names one", async () => {
      const { stdout } = await learn("map");
      expect(stdout).toContain("# Knowledge Map");
      await expect(readFile(path.join(cli.root, "learn", "map.md"), "utf8")).rejects.toThrow(/ENOENT/);
      await learn("map", "--out", path.join(cli.root, "out", "map.md"));
      const map = await readFile(path.join(cli.root, "out", "map.md"), "utf8");
      expect(map).toContain("# Knowledge Map");
      expect(map).toContain("Alpha");
    });

    it("check add stores the question in the note", async () => {
      await learn(
        "check", "add", "--concept", "alpha",
        "--question", "What is alpha?", "--answer", "The first one.",
      );
      const checks = await json<{ concept: string }[]>("check", "list", "--concept", "alpha");
      expect(checks).toHaveLength(1);
      // Left in place: the file is the fixture, and the next test wants it gone.
      await writeFile(
        path.join(cli.root, "learn", "concepts", "fixtures", "alpha.md"),
        "---\nid: alpha\ntitle: Alpha\nsummary: The first one.\n---\n\n# Alpha\n",
        "utf8",
      );
    });

    it("checks a note out to a work copy and commits it back to its file, refusing a moved one", async () => {
      const note = path.join(cli.root, "learn", "concepts", "fixtures", "beta.md");
      const original = await readFile(note, "utf8");
      try {
        const checkout = await json<{ id: string; path: string; revision: number | null }>(
          "concept", "checkout", "beta",
        );
        expect(checkout).toEqual({ id: "beta", path: path.join(cli.root, "work", "concepts", "beta.md"), revision: null });
        expect(await readFile(checkout.path, "utf8")).toBe(original);

        await writeFile(checkout.path, `${original}\nA line the session added.\n`, "utf8");
        // This fixture has no vocabulary, so the index after the write refuses,
        // and says the file was written anyway.
        const committed = await learn("concept", "commit", "beta", "--reason", "add a line").catch(
          (error: { stderr: string }) => error,
        );
        expect(committed.stderr).toContain("was written, but it is not in the catalog");
        expect(await readFile(note, "utf8")).toContain("A line the session added.");

        // A second checkout of an uncommitted copy is refused rather than lost,
        // and so is one whose sidecar is gone, since nothing vouches for it.
        await writeFile(checkout.path, "---\nid: beta\n---\n\nedited again\n", "utf8");
        const again = await learn("concept", "checkout", "beta").catch((error: { stderr: string }) => error);
        expect(again.stderr).toMatch(/has edits no commit has taken/);
        const sidecar = path.join(cli.root, "work", "concepts", "beta.checkout.json");
        const kept = await readFile(sidecar, "utf8");
        await rm(sidecar);
        const orphan = await learn("concept", "checkout", "beta").catch((error: { stderr: string }) => error);
        expect(orphan.stderr).toMatch(/has edits no commit has taken/);
        await writeFile(sidecar, kept, "utf8");

        // A copy checked out from another knowledge base is not committed here.
        await writeFile(sidecar, kept.replace(/"from": "[^"]*"/, '"from": "/elsewhere postgres://elsewhere/db"'), "utf8");
        const foreign = await learn("concept", "commit", "beta", "--reason", "wrong place").catch(
          (error: { stderr: string }) => error,
        );
        expect(foreign.stderr).toMatch(/was checked out from \/elsewhere/);
        await writeFile(sidecar, kept, "utf8");

        // A damaged opening fence is refused on the file branch too, not
        // written with the id filled back in and the frontmatter gone.
        const before = await readFile(note, "utf8");
        await writeFile(checkout.path, "--\nid: beta\ntitle: Beta\n---\n\nfence damaged\n", "utf8");
        const damaged = await learn("concept", "commit", "beta", "--reason", "damaged").catch(
          (error: { stderr: string }) => error,
        );
        expect(damaged.stderr).toMatch(/work\/concepts\/beta\.md has no frontmatter that parses/);
        expect(await readFile(note, "utf8")).toBe(before);
        await writeFile(checkout.path, "---\nid: beta\n---\n\nedited again\n", "utf8");

        // The note moved under the copy: the commit is refused and the file kept.
        await writeFile(note, `${original}\nSomeone else's edit.\n`, "utf8");
        const moved = await learn("concept", "commit", "beta", "--reason", "late").catch(
          (error: { stderr: string }) => error,
        );
        expect(moved.stderr).toMatch(/has changed since it was checked out/);
        expect(await readFile(note, "utf8")).toContain("Someone else's edit.");
      } finally {
        await writeFile(note, original, "utf8");
        await rm(path.join(cli.root, "work"), { recursive: true, force: true });
      }
    });
  });
});
