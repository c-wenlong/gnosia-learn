import { addCustomProvider, updateCustomProvider } from "@gnosia/catalog/state";
import { learner, LOCAL_LEARNER_ID } from "@gnosia/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { isCallable } from "../src/providers";
import { migratedScratchDatabase, probe, type Scratch } from "../../../services/catalog/test/scratch-database";

/**
 * A custom provider's saved key goes only to the base URL it was saved for
 * (docs/BYOK.md, D3; R3-1-01), even when a move lands between the separate
 * reads a credential takes of the URL and the key. A move replaces both in
 * one write; it lands just before or just after the keys are read, so a
 * reader that trusted either read order would pair a key with a host it was
 * not saved for: the old key with the attacker's URL, or the fresh key the
 * owner typed while leaving a compromised gateway with that gateway.
 */

const reachable = await probe();
const SECRET = "custom-provider-move-secret-at-least-thirty-two-chars";
const OLD_KEY = "gw-key-0123456789abcdef0123456789abcdef";
const NEW_KEY = "new-key-0123456789abcdef0123456789abcd";
const OLD_URL = "https://gw.example/v1";
const NEW_URL = "https://elsewhere.example/v1";

const move = vi.hoisted(() => ({ next: null as (() => Promise<void>) | null, when: "after" as "before" | "after" }));

vi.mock("../src/server/provider-keys", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/server/provider-keys")>();
  return {
    ...actual,
    openSavedKeysPinned: async (...args: Parameters<typeof actual.openSavedKeysPinned>) => {
      const landing = move.next;
      move.next = null;
      if (landing !== null && move.when === "before") await landing();
      const saved = await actual.openSavedKeysPinned(...args);
      if (landing !== null && move.when === "after") await landing();
      return saved;
    },
  };
});

describe.skipIf(!reachable.ok)("a custom provider moved while its key is read", () => {
  let scratch: Scratch;
  let credentials: typeof import("../src/server/credentials");
  let keys: typeof import("../src/server/provider-keys");
  const saved = process.env.AUTH_SECRET;

  beforeAll(async () => {
    process.env.AUTH_SECRET = SECRET;
    scratch = await migratedScratchDatabase();
    await scratch.db.insert(learner).values({ id: LOCAL_LEARNER_ID }).onConflictDoNothing();
    credentials = await import("../src/server/credentials");
    keys = await import("../src/server/provider-keys");
  }, 60_000);

  afterAll(async () => {
    if (saved === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = saved;
    await scratch?.drop();
  });

  beforeEach(async () => {
    await scratch.pool.query("delete from tutor_model; delete from provider_key; delete from custom_provider");
    await addCustomProvider(scratch.db, LOCAL_LEARNER_ID, { label: "Gateway", baseUrl: OLD_URL }, (id) =>
      keys.keySealer(process.env, LOCAL_LEARNER_ID, OLD_KEY)(id),
    );
    await scratch.pool.query(
      "insert into tutor_model (owner_id, position, provider, model) values ('local', 0, 'custom-gateway', 'gw/fast')",
    );
    move.next = async () => {
      await updateCustomProvider(
        scratch.db,
        LOCAL_LEARNER_ID,
        "custom-gateway",
        { baseUrl: NEW_URL },
        keys.keySealer(process.env, LOCAL_LEARNER_ID, NEW_KEY)("custom-gateway"),
      );
    };
  });

  /** The (URL, key) pair a read produced must be one a single write stored together. */
  const together = (pair: [string | undefined, string | undefined]) =>
    expect([[OLD_URL, OLD_KEY], [NEW_URL, NEW_KEY], [undefined, undefined]]).toContainEqual(pair);

  for (const when of ["before", "after"] as const) {
    it(`sends a key only to the URL it was saved with, for a model list or a Test, when the move lands ${when} the key read`, async () => {
      move.when = when;
      const credential = await credentials.entryCredential(Promise.resolve(scratch.db), LOCAL_LEARNER_ID, "custom-gateway", undefined, {});
      expect(move.next).toBeNull();
      together([credential?.config.baseUrl, credential?.apiKey]);
    });

    it(`sends a key only to the URL it was saved with, for a tutor turn, when the move lands ${when} the key read`, async () => {
      move.when = when;
      const steps = await credentials.tutorCredentials(Promise.resolve(scratch.db), LOCAL_LEARNER_ID, {});
      expect(move.next).toBeNull();
      const step = steps[0];
      together(step !== undefined && isCallable(step) ? [step.config.baseUrl, step.apiKey] : [undefined, undefined]);
    });
  }

  it("still pairs a URL with its key when nothing moves", async () => {
    move.next = null;
    const credential = await credentials.entryCredential(Promise.resolve(scratch.db), LOCAL_LEARNER_ID, "custom-gateway", undefined, {});
    expect([credential?.config.baseUrl, credential?.apiKey]).toEqual([OLD_URL, OLD_KEY]);
  });
});
