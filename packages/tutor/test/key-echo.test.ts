import { describe, expect, it } from "vitest";

import { echoesKey } from "../src/server/key-echo";

/**
 * The chain write routes' key check (docs/TUTOR-MODELS.md, T11). Its answer
 * reaches the caller as refused or accepted, so it must depend on the key only
 * for an id that holds the whole key: a check that also refused a part of a key
 * answered guesses, and a session could walk a key out one character at a time.
 */
describe("echoesKey", () => {
  // Built, not written out, so it does not read as a real key to a secret scanner.
  const openrouter = `sk-or-v1-${"fedcba9876543210".repeat(4)}`;
  const plain = "my-own-gateway-token-for-gemini";
  const saved = { openrouter, gemini: plain };
  const noEnv = {};

  it("catches an id that is, or holds, a whole saved key of any shape", () => {
    expect(echoesKey(plain, saved, noEnv)).toBe(true);
    expect(echoesKey(`prefix/${plain}`, saved, noEnv)).toBe(true);
    expect(echoesKey(openrouter, saved, noEnv)).toBe(true);
    // A custom provider's key, which no built-in provider id names.
    expect(echoesKey("gw/x/custom-gateway-secret-key", { "custom-gw": "custom-gateway-secret-key" }, noEnv)).toBe(true);
  });

  it("catches a server key", () => {
    const env = { NVIDIA_API_KEY: "nvidia-server-key-example-1234" };
    expect(echoesKey("a/nvidia-server-key-example-1234", {}, env)).toBe(true);
  });

  it("answers a part of a key as it answers any unrelated id", () => {
    // Each probe of the old oracle: a fragment one character longer, slid
    // along the key. None may be told apart from an id unrelated to it.
    const unrelated = echoesKey("meta/llama-3.3-70b-instruct", saved, noEnv);
    expect(unrelated).toBe(false);
    for (const key of [openrouter, plain]) {
      for (let start = 0; start < key.length - 12; start += 1) {
        for (const length of [12, 13, 19, key.length - start - 1]) {
          const fragment = key.slice(start, start + length);
          if (fragment.length < 12 || fragment === key) continue;
          expect(echoesKey(fragment, saved, noEnv), fragment).toBe(unrelated);
        }
      }
    }
  });

  it("does not compare a server key too short to be a provider key", () => {
    expect(echoesKey("a/short-key", {}, { NVIDIA_API_KEY: "short-key" })).toBe(false);
  });
});
