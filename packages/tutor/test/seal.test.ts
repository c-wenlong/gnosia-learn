import { describe, expect, it } from "vitest";

import { MIN_SECRET_LENGTH } from "@gnosia/schema/shared";

import { checkKeyShape, CURRENT_KEY_VERSION, openKey, sealKey, type Sealed } from "../src/server/seal";

/**
 * The seal around an owner's provider key (docs/BYOK.md, decision 2):
 * AES-256-GCM under HKDF-SHA256 over AUTH_SECRET, bound to owner, provider
 * and version. Every way a stored key can fail to open must come back as
 * null, the "treat it as missing" the tutor and Settings act on, and never
 * as a throw.
 *
 * This is the copy that runs: the web routes, the sidecar and
 * `provider-keys.ts` all seal and open through `src/server/seal.ts`.
 */

const SECRET = "a-test-secret-that-is-at-least-thirty-two-characters";
const KEY = "nvapi-Zk3xQ9vB7mW2pL5tR8yN4cH6dF1gJ0sAexample";
const CONTEXT = { secret: SECRET, owner: "local", provider: "nvidia" as const };

function flip(buffer: Buffer, at = 0): Buffer {
  const copy = Buffer.from(buffer);
  copy[at] = (copy[at] ?? 0) ^ 0x01;
  return copy;
}

describe("sealKey and openKey", () => {
  it("round-trips a key, and keeps only the last four characters in the clear", () => {
    const sealed = sealKey(KEY, CONTEXT);
    expect(openKey(sealed, CONTEXT)).toBe(KEY);
    expect(sealed.last4).toBe("mple");
    expect(sealed.keyVersion).toBe(CURRENT_KEY_VERSION);
    expect(sealed.iv).toHaveLength(12);
    expect(sealed.authTag).toHaveLength(16);
    expect(sealed.ciphertext).toHaveLength(Buffer.byteLength(KEY));
    // Nothing of the key survives in the bytes that are stored.
    const stored = Buffer.concat([sealed.ciphertext, sealed.iv, sealed.authTag]);
    expect(stored.includes(Buffer.from("nvapi-"))).toBe(false);
    expect(stored.toString("utf8")).not.toContain(KEY.slice(6, 20));
  });

  it("draws a fresh nonce every time, so one key sealed twice is two different rows", () => {
    const a = sealKey(KEY, CONTEXT);
    const b = sealKey(KEY, CONTEXT);
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it("treats any change to the ciphertext, the tag or the nonce as missing, without throwing", () => {
    const sealed = sealKey(KEY, CONTEXT);
    const tampered: Sealed[] = [
      { ...sealed, ciphertext: flip(sealed.ciphertext) },
      { ...sealed, ciphertext: flip(sealed.ciphertext, sealed.ciphertext.length - 1) },
      { ...sealed, authTag: flip(sealed.authTag) },
      { ...sealed, iv: flip(sealed.iv) },
      { ...sealed, ciphertext: sealed.ciphertext.subarray(1) },
      { ...sealed, authTag: sealed.authTag.subarray(0, 8) },
      { ...sealed, iv: Buffer.alloc(0) },
    ];
    for (const row of tampered) expect(openKey(row, CONTEXT)).toBeNull();
  });

  it("does not open under a rotated AUTH_SECRET", () => {
    const sealed = sealKey(KEY, CONTEXT);
    expect(openKey(sealed, { ...CONTEXT, secret: `${SECRET}-rotated` })).toBeNull();
    expect(openKey(sealed, { ...CONTEXT, secret: "" })).toBeNull();
  });

  it("does not open for another owner or as another provider, so a moved row is useless", () => {
    const sealed = sealKey(KEY, CONTEXT);
    expect(openKey(sealed, { ...CONTEXT, owner: "owner-b" })).toBeNull();
    expect(openKey(sealed, { ...CONTEXT, provider: "gemini" })).toBeNull();
  });

  it("does not open a version this build cannot derive, or one relabelled", () => {
    const sealed = sealKey(KEY, CONTEXT);
    expect(openKey({ ...sealed, keyVersion: 2 }, CONTEXT)).toBeNull();
    expect(openKey({ ...sealed, keyVersion: 0 }, CONTEXT)).toBeNull();
  });

  it("refuses to seal with no secret", () => {
    expect(() => sealKey(KEY, { ...CONTEXT, secret: "" })).toThrow(/AUTH_SECRET/);
  });

  it("holds the sign-in floor on the secret: one character short neither seals nor opens", () => {
    const short = "s".repeat(MIN_SECRET_LENGTH - 1);
    const enough = "s".repeat(MIN_SECRET_LENGTH);
    expect(() => sealKey(KEY, { ...CONTEXT, secret: short })).toThrow(/AUTH_SECRET/);
    const sealed = sealKey(KEY, { ...CONTEXT, secret: enough });
    expect(openKey(sealed, { ...CONTEXT, secret: enough })).toBe(KEY);
    expect(openKey(sealed, { ...CONTEXT, secret: short })).toBeNull();
  });
});

describe("checkKeyShape", () => {
  it("accepts a key, dropping the whitespace a paste carries around it", () => {
    expect(checkKeyShape(`  ${KEY}\n`)).toEqual({ ok: true, key: KEY });
  });

  it("refuses what is not a key, without repeating it", () => {
    const refusals = [
      undefined,
      42,
      "",
      "   ",
      "short-key",
      "has a space in the middle of it",
      "tab\tinside-a-key-long-enough",
      "non-ascii-kéy-long-enough-to-pass",
      "x".repeat(513),
    ];
    for (const value of refusals) {
      const shape = checkKeyShape(value);
      expect(shape.ok, String(value)).toBe(false);
      if (!shape.ok && typeof value === "string" && value.trim().length > 0) expect(shape.reason).not.toContain(value.trim());
    }
  });
});
