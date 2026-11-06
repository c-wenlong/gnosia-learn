import { addCustomProvider, updateCustomProvider } from "@gnosia/catalog/state";
import { learner, LOCAL_LEARNER_ID } from "@gnosia/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { isCallable } from "../src/providers";
import { migratedScratchDatabase, probe, type Scratch } from "../../../services/catalog/test/scratch-database";

/**
 * A custom provider's saved key goes only to the base URL it was saved for
 * (docs/BYOK.md, D3; R3-1-01), even when a move lands between the two reads
 * a credential takes. The move here is the worst a session holding the
 * cookie can send: a URL of its own with a key of its own, which
 * `updateCustomProvider` accepts. It lands just after the saved keys are
 * read, so a reader that took the keys before the URL would pair the old key
 * with the new host.
 */

const reachable = await probe();
const SECRET = "custom-provider-move-secret-at-least-thirty-two-chars";
const OLD_KEY = "gw-key-0123456789abcdef0123456789abcdef";
const DUMMY_KEY = "attacker-key-0123456789abcdef01234567";
const OLD_URL = "https://gw.example/v1";
const EVIL_URL = "https://attacker.example/v1";

const move = vi.hoisted(() => ({ next: null as (() => Promise<void>) | null }));

vi.mock("../src/server/provider-keys", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/server/provider-keys")>();
  return {
    ...actual,
    openSavedKeys: async (...args: Parameters<typeof actual.openSavedKeys>) => {
      const saved = await actual.openSavedKeys(...args);
      const landing = move.next;
      move.next = null;
      if (landing !== null) await landing();
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
        { baseUrl: EVIL_URL },
        keys.keySealer(process.env, LOCAL_LEARNER_ID, DUMMY_KEY)("custom-gateway"),
      );
    };
  });

  it("never pairs the old key with the new URL for a model list or a Test", async () => {
    const credential = await credentials.entryCredential(Promise.resolve(scratch.db), LOCAL_LEARNER_ID, "custom-gateway", undefined, {});
    expect(move.next).toBeNull();
    expect(credential).not.toBeNull();
    expect(credential?.config.baseUrl === EVIL_URL && credential.apiKey === OLD_KEY).toBe(false);
    expect([credential?.config.baseUrl, credential?.apiKey]).toEqual([OLD_URL, OLD_KEY]);
  });

  it("never pairs the old key with the new URL for a tutor turn", async () => {
    const steps = await credentials.tutorCredentials(Promise.resolve(scratch.db), LOCAL_LEARNER_ID, {});
    expect(move.next).toBeNull();
    const step = steps[0];
    expect(step !== undefined && isCallable(step)).toBe(true);
    if (step === undefined || !isCallable(step)) return;
    expect(step.config.baseUrl === EVIL_URL && step.apiKey === OLD_KEY).toBe(false);
  });
});
