import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NeighbourRef } from "@gnosia/tutor/concept-workspace-core";

import { noteResolvers } from "./session-page";

/**
 * `noteResolvers`: how a concept's note resolves on the workspace and the
 * session page, which both call it. The catalog read behind the embeds is
 * mocked, so which files were asked about is a recorded fact.
 */
const readFileProblems = vi.hoisted(() => vi.fn());
vi.mock("@/lib/asset-library", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/asset-library")>()),
  readFileProblems,
}));

const ref = (slug: string): NeighbourRef => ({ slug, title: slug, bucket: "untouched", pL: 0 });

const WORKSPACE = {
  slug: "vectors",
  requires: [ref("numbers")],
  assumes: [ref("arithmetic")],
  dependants: [ref("matrices")],
  // A concept whose `assumes` names this one, so a backlink and not a dependant.
  backlinks: [ref("matrices"), ref("dot-product")],
};

beforeEach(() => {
  readFileProblems.mockReset();
  readFileProblems.mockResolvedValue(new Map());
});

describe("noteResolvers", () => {
  it("links the concept, its neighbours and its backlinks, and nothing else", async () => {
    const { resolveNote } = await noteResolvers(WORKSPACE, "");
    for (const slug of ["vectors", "numbers", "arithmetic", "matrices", "dot-product"]) {
      expect(resolveNote(slug)).toBe(`/learn/${slug}`);
    }
    // A session log, or a concept the note never neighbours, stays plain text.
    expect(resolveNote("2026-10-01-vectors")).toBeUndefined();
    expect(resolveNote("eigenvalues")).toBeUndefined();
  });

  it("asks about each embed in the source once, and shows a known problem instead of a picture", async () => {
    readFileProblems.mockResolvedValue(
      new Map([
        ["diagram:learn/assets/gone.svg", "not-uploaded"],
        ["diagram:learn/assets/here.svg", null],
      ]),
    );
    const { resolveEmbed } = await noteResolvers(WORKSPACE, "![[gone.svg]]\n\n![[here.svg]]");

    expect(readFileProblems).toHaveBeenCalledTimes(1);
    expect(readFileProblems).toHaveBeenCalledWith(["diagram:learn/assets/gone.svg", "diagram:learn/assets/here.svg"]);
    expect(resolveEmbed("gone.svg")).toEqual({ problem: "not-uploaded" });
    const id = encodeURIComponent("diagram:learn/assets/here.svg");
    expect(resolveEmbed("here.svg")).toEqual({ src: `/api/assets/${id}/file`, statusHref: `/api/assets/${id}/status` });
  });

  it("reads nothing for an empty source, and still resolves an embed to the asset routes", async () => {
    const { resolveEmbed } = await noteResolvers(WORKSPACE, "");
    expect(readFileProblems).not.toHaveBeenCalled();
    const id = encodeURIComponent("diagram:learn/assets/a.svg");
    expect(resolveEmbed("a.svg")).toEqual({ src: `/api/assets/${id}/file`, statusHref: `/api/assets/${id}/status` });
  });
});
