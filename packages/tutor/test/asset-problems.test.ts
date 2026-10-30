import { describe, expect, it } from "vitest";

import {
  ASSET_PROBLEMS,
  assetProblem,
  CLIENT_PROBLEM_CODES,
  ROUTE_PROBLEM_CODES,
  isAssetProblemCode,
  probeAssetProblem,
  problemFromStatus,
  problemSource,
  STUDIO_SOURCE,
} from "../src/asset-problems";

const ALL = [...ROUTE_PROBLEM_CODES, ...CLIENT_PROBLEM_CODES];

/** A fetch that answers with one body and status, and records what it was asked. */
function answering(body: unknown, status = 200) {
  const asked: { url: string; init?: RequestInit }[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    asked.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { impl, asked };
}

describe("the problem table", () => {
  it("has a label and a reason for every code, and nothing else", () => {
    expect(Object.keys(ASSET_PROBLEMS).sort()).toEqual([...ALL].sort());
    for (const code of ALL) {
      expect(ASSET_PROBLEMS[code].label.length, code).toBeGreaterThan(0);
      expect(ASSET_PROBLEMS[code].reason.length, code).toBeGreaterThan(0);
    }
  });

  it("never puts a path, a stack or an id in front of the reader", () => {
    for (const code of ALL) {
      const { label, reason, fix } = ASSET_PROBLEMS[code];
      for (const text of [label, reason, fix?.text ?? ""]) {
        expect(text, code).not.toMatch(/\bout\/|learn\/assets|\/Users\/|\.mp4|\.svg|at \S+:\d+/);
        // No em dashes in anything the reader sees.
        expect(text, code).not.toContain("\u2014");
      }
    }
  });

  it("gives the fixable states a command to type", () => {
    expect(ASSET_PROBLEMS["not-uploaded"].fix).toEqual({
      kind: "command",
      text: "npm run catalog -- asset upload --source manimkc",
    });
    expect(ASSET_PROBLEMS["not-in-catalog"].fix?.text).toBe("npm run catalog -- import");
    expect(ASSET_PROBLEMS["not-flipped"].fix?.text).toContain("npm run catalog -- flip");
  });

  it("names the upload of the tool that made the render, when the surface knows it", () => {
    expect(assetProblem("not-uploaded", "remotionkc").fix).toEqual({
      kind: "command",
      text: "npm run catalog -- asset upload --source remotionkc",
    });
    expect(assetProblem("not-uploaded", "revideokc").fix).toEqual({
      kind: "command",
      text: "npm run catalog -- asset upload --source revideokc",
    });
    expect(assetProblem("not-uploaded", "blenderkc").fix).toEqual({
      kind: "command",
      text: "npm run catalog -- asset upload --source blenderkc",
    });
    expect(assetProblem("not-uploaded", "manimkc")).toEqual(ASSET_PROBLEMS["not-uploaded"]);
    // Not a render, or not known: the table's own sentence.
    expect(assetProblem("not-uploaded", "tldrawkc")).toBe(ASSET_PROBLEMS["not-uploaded"]);
    expect(assetProblem("not-uploaded")).toBe(ASSET_PROBLEMS["not-uploaded"]);
    // Only the upload names a tool.
    expect(assetProblem("catalog-unreachable", "remotionkc")).toBe(ASSET_PROBLEMS["catalog-unreachable"]);
  });

  it("tells a studio video with no stored copy to make it again from the studio, not to upload it", () => {
    const fix = assetProblem("not-uploaded", STUDIO_SOURCE).fix;
    expect(fix?.kind).toBe("note");
    expect(fix?.text).toContain("Change");
    expect(fix?.text).not.toContain("asset upload");
    // Every other code reads as the table has it.
    expect(assetProblem("catalog-unreachable", STUDIO_SOURCE)).toBe(ASSET_PROBLEMS["catalog-unreachable"]);
  });

  it("reads a studio video, its sidecars and its poster as the studio's, and anything else by its row", () => {
    expect(problemSource("video:attention", "gnosia")).toBe(STUDIO_SOURCE);
    expect(problemSource("video:attention.vtt", "gnosia")).toBe(STUDIO_SOURCE);
    expect(problemSource("poster:video:attention", "gnosia")).toBe(STUDIO_SOURCE);
    expect(problemSource("manimkc:out/a/b.mp4", "manimkc")).toBe("manimkc");
    expect(problemSource("diagram:learn/assets/x.svg", "gnosia")).toBe("gnosia");
    expect(problemSource("note:x", null)).toBeNull();
  });

  it("offers Try again only where asking again could change the answer", () => {
    const retryable = ALL.filter((code) => ASSET_PROBLEMS[code].retry).sort();
    expect(retryable).toEqual(
      [
        "blob-store-unavailable",
        "catalog-unreachable",
        "server-unreachable",
        "undecodable",
        "unknown",
      ].sort(),
    );
  });

  it("recognises its own codes and nothing else", () => {
    for (const code of ALL) expect(isAssetProblemCode(code)).toBe(true);
    for (const other of ["", "missing", 404, null, undefined, {}]) {
      expect(isAssetProblemCode(other)).toBe(false);
    }
  });
});

describe("problemFromStatus", () => {
  it("reads a refusal's code", () => {
    for (const code of ROUTE_PROBLEM_CODES) {
      expect(problemFromStatus({ ok: false, code })).toBe(code);
    }
  });

  it("reads a file the server can serve, after the element failed, as undecodable", () => {
    expect(problemFromStatus({ ok: true })).toBe("undecodable");
  });

  it("falls back to unknown for anything it does not recognise", () => {
    for (const body of [null, "nope", 3, {}, { ok: false }, { ok: false, code: "from-the-future" }]) {
      expect(problemFromStatus(body)).toBe("unknown");
    }
  });
});

describe("probeAssetProblem", () => {
  it("asks the status route, uncached, and returns its code", async () => {
    const { impl, asked } = answering({ ok: false, code: "not-uploaded" }, 404);
    expect(await probeAssetProblem("/api/assets/x/status", impl)).toBe("not-uploaded");
    expect(asked).toHaveLength(1);
    expect(asked[0].url).toBe("/api/assets/x/status");
    expect(asked[0].init?.cache).toBe("no-store");
  });

  it("says undecodable when the server says the file is fine", async () => {
    expect(await probeAssetProblem("/s", answering({ ok: true }).impl)).toBe("undecodable");
  });

  it("says unknown for a body that is not JSON", async () => {
    expect(await probeAssetProblem("/s", answering("<html>502</html>", 502).impl)).toBe("unknown");
  });

  it("says the server is unreachable when the request itself fails", async () => {
    const down = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await probeAssetProblem("/s", down)).toBe("server-unreachable");
  });

  it("asks nobody when there is nobody to ask", async () => {
    const { impl, asked } = answering({ ok: true });
    expect(await probeAssetProblem(undefined, impl)).toBe("unknown");
    expect(asked).toHaveLength(0);
  });

  it("rethrows when the caller aborted, so a stale answer is never painted", async () => {
    const controller = new AbortController();
    const slow = ((_: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("", "AbortError")));
      })) as unknown as typeof fetch;
    const pending = probeAssetProblem("/s", slow, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
  });
});
