import { describe, expect, it } from "vitest";

import { REDACTED, redactSecrets } from "@gnosia/tutor/redact";

describe("redactSecrets", () => {
  const key = "sk-or-v1-8f2c7a91d04e6b35c8a1f7e2d9b40c6a";

  it("removes the whole key", () => {
    expect(redactSecrets(`bad key: ${key}.`, [key])).toBe(`bad key: ${REDACTED}.`);
  });

  it("removes a masked echo, a prefix and a suffix", () => {
    const out = redactSecrets("got sk-or-v1-8f2***0c6a, tail d9b40c6a, head sk-or-v1", [key]);
    expect(out).not.toMatch(/8f2|0c6a|d9b40/);
    expect(out).toBe(`got ${REDACTED}, tail ${REDACTED}, head ${REDACTED}`);
  });

  it("leaves text that shares nothing with the key", () => {
    const text = '{"error":{"message":"Rate limit exceeded","code":429}}';
    expect(redactSecrets(text, [key])).toBe(text);
  });

  it("handles several keys and ignores ones too short to match on", () => {
    const other = "AIzaSyD-Example0123456789abcdefghijklm";
    expect(redactSecrets(`${key} and ${other}`, [key, other, "abc"])).toBe(`${REDACTED} and ${REDACTED}`);
  });
});
