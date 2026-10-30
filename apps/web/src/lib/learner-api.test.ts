import { describe, expect, it } from "vitest";

import { BodyTooLarge, readBodyText } from "./learner-api";

function streamed(chunks: Uint8Array[]): { request: Request; pulled: () => number } {
  let pulled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks[pulled];
      pulled += 1;
      if (next === undefined) controller.close();
      else controller.enqueue(next);
    },
  });
  const request = new Request("http://localhost:3000/api/learner/x", { method: "POST", body, duplex: "half" } as RequestInit & {
    duplex: string;
  });
  return { request, pulled: () => pulled };
}

describe("readBodyText", () => {
  it("reads a body within the limit", async () => {
    const request = new Request("http://localhost:3000/x", { method: "POST", body: '{"a":"γνῶσις"}' });
    await expect(readBodyText(request, 100)).resolves.toBe('{"a":"γνῶσις"}');
  });

  it("refuses a declared length past the limit before reading anything", async () => {
    const declared = new Request("http://localhost:3000/x", { method: "POST", body: "x", headers: { "content-length": "101" } });
    await expect(readBodyText(declared, 100)).rejects.toBeInstanceOf(BodyTooLarge);
    expect(declared.bodyUsed).toBe(false);
  });

  it("stops reading a chunked body as soon as it passes the limit", async () => {
    const chunks = Array.from({ length: 50 }, () => new Uint8Array(40));
    const { request, pulled } = streamed(chunks);
    await expect(readBodyText(request, 100)).rejects.toBeInstanceOf(BodyTooLarge);
    expect(pulled()).toBeLessThan(10);
  });

  it("counts bytes, not characters", async () => {
    // 40 three-byte characters: 40 UTF-16 units, 120 bytes.
    const request = new Request("http://localhost:3000/x", { method: "POST", body: "語".repeat(40) });
    await expect(readBodyText(request, 100)).rejects.toBeInstanceOf(BodyTooLarge);
  });

  it("reads an absent body as empty", async () => {
    await expect(readBodyText(new Request("http://localhost:3000/x", { method: "POST" }), 100)).resolves.toBe("");
  });
});
