import { checkModelId, looksLikeKey } from "@self-learn/schema/shared";
import { describe, expect, it } from "vitest";

/**
 * A model id is not an API key (docs/TUTOR-MODELS.md, T11). A chain row is
 * stored in the clear and exported, so a key pasted into the model field is
 * refused before it is stored, and the refusal never repeats it.
 */

/** Real ids from the three providers' lists, which must all pass. */
const REAL = [
  "google/gemma-4-31b-it",
  "meta/llama-3.1-405b-instruct",
  "nvidia/llama-3.3-nemotron-super-49b-v1",
  "nv-mistralai/mistral-nemo-12b-instruct",
  "nvidia/nv-embedqa-e5-v5",
  "01-ai/yi-large",
  "ibm/granite-3.3-8b-instruct",
  "gemini-2.5-flash",
  "gemini-2.5-flash-preview-09-2025",
  "gemini-embedding-exp-03-07",
  "imagen-3.0-generate-002",
  "openrouter/free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "cognitivecomputations/dolphin3.0-mistral-24b:free",
  "deepseek/deepseek-r1-0528-qwen3-8b:free",
  "Qwen/Qwen2.5-Coder-32B-Instruct",
  "mistralai/mistral-small-3.1-24b-instruct-2503",
  "nousresearch/hermes-3-llama-3.1-405b",
];

/** Made-up keys in each provider's shape, and a bare random token. */
const KEYS = [
  "nvapi-Zk3xQ9vB7mW2pL5tR8yN4cH6dF1gJ0sAqWeRtYuIoPaSdFgHjKlZxCvBnM1234567",
  "sk-or-v1-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "sk-proj-abcdefghijklmnop",
  "AIzaSyExampleExampleExample0123456789",
  "3f9a1c7e5b2d4f6a8c0e1b3d5f7a9c1e",
  "openrouter/sk-or-v1-0123456789abcdef0123",
  "gemini-AbCdEf0123456789GhIjKl",
];

describe("checkModelId against keys", () => {
  it("passes every real model id", () => {
    for (const id of REAL) {
      expect(looksLikeKey(id), id).toBe(false);
      expect(checkModelId(id), id).toEqual({ ok: true, model: id });
    }
  });

  it("refuses anything shaped like a key, without repeating it", () => {
    for (const key of KEYS) {
      expect(looksLikeKey(key), key).toBe(true);
      const checked = checkModelId(`  ${key}\n`);
      expect(checked.ok, key).toBe(false);
      if (!checked.ok) {
        expect(checked.reason).toMatch(/API key/);
        expect(checked.reason).not.toContain(key.slice(0, 10));
      }
    }
  });
});
