import { customProvider, learner, LOCAL_LEARNER_ID, providerKey, tutorModel } from "@gnosia/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  addCustomProvider,
  addTutorModel,
  deleteTutorProvider,
  readCustomProviders,
  readProviderKeys,
  readTutorModels,
  saveCustomProviderKey,
  updateCustomProvider,
} from "../src/state";
import { migratedScratchDatabase, probe, type Scratch, sqlstate } from "./scratch-database";

/**
 * `custom_provider` (docs/TUTOR-MODELS.md, T14): the providers an owner adds
 * by name and base URL. Held here: ids are made unique from the name, the
 * base URL and the name are checked in the function and in the table, an
 * owner has at most ten, owner B never sees owner A's, and Delete removes the
 * row, its key and its models together.
 */

const reachable = await probe();
const OTHER = "owner-b";

function sealed(last4 = "abcd") {
  return { ciphertext: Buffer.from("cipher"), iv: Buffer.alloc(12, 1), authTag: Buffer.alloc(16, 2), keyVersion: 1, last4 };
}

/** Add with a key, as the route does, and return the provider. */
async function add(db: Scratch["db"], owner: string, input: { label: unknown; baseUrl: unknown }) {
  return (await addCustomProvider(db, owner, input, () => sealed())).provider;
}

describe.skipIf(!reachable.ok)("custom_provider", () => {
  let scratch: Scratch;

  beforeAll(async () => {
    scratch = await migratedScratchDatabase();
    await scratch.db.insert(learner).values([{ id: LOCAL_LEARNER_ID }, { id: OTHER }]).onConflictDoNothing();
  }, 60_000);

  afterAll(async () => {
    await scratch?.drop();
  });

  beforeEach(async () => {
    await scratch.db.delete(tutorModel);
    await scratch.db.delete(providerKey);
    await scratch.db.delete(customProvider);
  });

  it("adds a provider under an id made from its name, unique among the owner's, and renames or moves it", async () => {
    const first = await add(scratch.db, LOCAL_LEARNER_ID, { label: "My gateway", baseUrl: "https://gw.example/v1/" });
    expect(first).toMatchObject({ id: "custom-my-gateway", label: "My gateway", baseUrl: "https://gw.example/v1" });
    const second = await add(scratch.db, LOCAL_LEARNER_ID, { label: "My  gateway", baseUrl: "http://localhost:11434/v1" });
    expect(second.id).toBe("custom-my-gateway-2");
    const moved = (await updateCustomProvider(scratch.db, LOCAL_LEARNER_ID, first.id, { label: "Work gateway", baseUrl: "https://gw2.example/v1" })).provider;
    expect(moved).toMatchObject({ id: "custom-my-gateway", label: "Work gateway", baseUrl: "https://gw2.example/v1" });
    expect((await readCustomProviders(scratch.db, LOCAL_LEARNER_ID)).map((p) => p.label)).toEqual(["My gateway", "Work gateway"]);
  });

  it("refuses a bad name or base URL in the function, and the table refuses what a writer slips past it", async () => {
    await expect(add(scratch.db, LOCAL_LEARNER_ID, { label: "x", baseUrl: "http://gw.example/v1" })).rejects.toMatchObject({
      code: "INVALID",
    });
    await expect(add(scratch.db, LOCAL_LEARNER_ID, { label: "", baseUrl: "https://gw.example" })).rejects.toMatchObject({
      code: "INVALID",
    });
    for (const values of [
      { ownerId: LOCAL_LEARNER_ID, id: "custom-ok", label: "ok", baseUrl: "http://gw.example/v1" },
      { ownerId: LOCAL_LEARNER_ID, id: "custom-ok", label: "ok", baseUrl: "http://localhost.evil.example/v1" },
      { ownerId: LOCAL_LEARNER_ID, id: "not-custom", label: "ok", baseUrl: "https://gw.example" },
      { ownerId: LOCAL_LEARNER_ID, id: "custom-ok", label: "", baseUrl: "https://gw.example" },
      // What `checkBaseUrl` never writes: no host, a user, a query, a fragment, a space, a trailing slash.
      { ownerId: LOCAL_LEARNER_ID, id: "custom-ok", label: "ok", baseUrl: "https://" },
      { ownerId: LOCAL_LEARNER_ID, id: "custom-ok", label: "ok", baseUrl: "https:///v1" },
      { ownerId: LOCAL_LEARNER_ID, id: "custom-ok", label: "ok", baseUrl: "https://user:pw@gw.example/v1" },
      { ownerId: LOCAL_LEARNER_ID, id: "custom-ok", label: "ok", baseUrl: "https://gw.example/v1?x=1" },
      { ownerId: LOCAL_LEARNER_ID, id: "custom-ok", label: "ok", baseUrl: "https://gw.example/v1#top" },
      { ownerId: LOCAL_LEARNER_ID, id: "custom-ok", label: "ok", baseUrl: "https://gw.example/v 1" },
      { ownerId: LOCAL_LEARNER_ID, id: "custom-ok", label: "ok", baseUrl: "https://gw.example/v1/" },
      { ownerId: LOCAL_LEARNER_ID, id: "custom-ok", label: "ok", baseUrl: "http://localhost:11434/v1?x=1" },
    ]) {
      let code: string | undefined;
      try {
        await scratch.db.insert(customProvider).values(values);
      } catch (error) {
        code = sqlstate(error);
      }
      expect(code, JSON.stringify(values)).toBe("23514");
    }
    // A loopback model server over plain http is allowed in the table too.
    await scratch.db.insert(customProvider).values({ ownerId: LOCAL_LEARNER_ID, id: "custom-ollama", label: "Ollama", baseUrl: "http://127.0.0.1:11434/v1" });
    await scratch.db.insert(customProvider).values({ ownerId: LOCAL_LEARNER_ID, id: "custom-v6", label: "v6", baseUrl: "https://[2001:db8::1]:8443" });
  });

  it("holds at most ten per owner, and keeps owner B off owner A's", async () => {
    for (let i = 0; i < 10; i += 1) await add(scratch.db, LOCAL_LEARNER_ID, { label: `p${i}`, baseUrl: "https://gw.example/v1" });
    await expect(add(scratch.db, LOCAL_LEARNER_ID, { label: "one more", baseUrl: "https://gw.example/v1" })).rejects.toMatchObject({
      code: "FULL",
    });
    expect(await readCustomProviders(scratch.db, OTHER)).toEqual([]);
    await expect(updateCustomProvider(scratch.db, OTHER, "custom-p0", { label: "mine now" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await deleteTutorProvider(scratch.db, OTHER, "custom-p0")).keyRemoved).toBe(false);
    expect(await readCustomProviders(scratch.db, LOCAL_LEARNER_ID)).toHaveLength(10);
  });

  it("files a key and models under the custom id, and Delete removes the row, the key and the models together", async () => {
    const { id } = await add(scratch.db, LOCAL_LEARNER_ID, { label: "Gateway", baseUrl: "https://gw.example/v1" });
    expect((await readProviderKeys(scratch.db, LOCAL_LEARNER_ID)).map((k) => k.provider)).toEqual([id]);
    await addTutorModel(scratch.db, LOCAL_LEARNER_ID, id, "gw/model-a", { requireKey: { server: false } });
    await addTutorModel(scratch.db, LOCAL_LEARNER_ID, "nvidia", "n/one", { requireKey: { server: true } });
    expect((await readTutorModels(scratch.db, LOCAL_LEARNER_ID)).map((r) => r.provider)).toEqual([id, "nvidia"]);

    const gone = await deleteTutorProvider(scratch.db, LOCAL_LEARNER_ID, id);
    expect(gone.keyRemoved).toBe(true);
    expect(gone.chain.map((r) => r.provider)).toEqual(["nvidia"]);
    expect(await readCustomProviders(scratch.db, LOCAL_LEARNER_ID)).toEqual([]);
    expect(await readProviderKeys(scratch.db, LOCAL_LEARNER_ID)).toEqual([]);
  });

  it("writes a provider and its key together, or neither", async () => {
    const refused = addCustomProvider(scratch.db, LOCAL_LEARNER_ID, { label: "Gateway", baseUrl: "https://gw.example/v1" }, () => {
      throw new Error("seal failed");
    });
    await expect(refused).rejects.toThrow("seal failed");
    expect(await readCustomProviders(scratch.db, LOCAL_LEARNER_ID)).toEqual([]);
    expect(await readProviderKeys(scratch.db, LOCAL_LEARNER_ID)).toEqual([]);

    const made = await addCustomProvider(scratch.db, LOCAL_LEARNER_ID, { label: "Gateway", baseUrl: "https://gw.example/v1" }, () => sealed("1111"));
    expect(made.key.last4).toBe("1111");
    // A key the row write cannot take back leaves the name and URL as they were.
    const bad = { ...sealed("2222"), iv: Buffer.alloc(3) };
    await expect(updateCustomProvider(scratch.db, LOCAL_LEARNER_ID, made.provider.id, { label: "Moved", baseUrl: "https://gw2.example/v1" }, bad)).rejects.toBeDefined();
    expect(await readCustomProviders(scratch.db, LOCAL_LEARNER_ID)).toMatchObject([{ label: "Gateway", baseUrl: "https://gw.example/v1" }]);
    expect((await readProviderKeys(scratch.db, LOCAL_LEARNER_ID)).map((k) => k.last4)).toEqual(["1111"]);
    const both = await updateCustomProvider(scratch.db, LOCAL_LEARNER_ID, made.provider.id, { baseUrl: "https://gw2.example/v1" }, sealed("3333"));
    expect(both).toMatchObject({ provider: { baseUrl: "https://gw2.example/v1" }, key: { last4: "3333" } });
  });

  it("files a key under a custom id only while the owner has it, so a Delete cannot leave one behind", async () => {
    await expect(saveCustomProviderKey(scratch.db, LOCAL_LEARNER_ID, "custom-gone", sealed())).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { id } = await add(scratch.db, LOCAL_LEARNER_ID, { label: "Gateway", baseUrl: "https://gw.example/v1" });
    await expect(saveCustomProviderKey(scratch.db, OTHER, id, sealed())).rejects.toMatchObject({ code: "NOT_FOUND" });
    // A save and a Delete at once: whichever goes second sees the first's result, never a key with no provider.
    await Promise.allSettled([deleteTutorProvider(scratch.db, LOCAL_LEARNER_ID, id), saveCustomProviderKey(scratch.db, LOCAL_LEARNER_ID, id, sealed("9999"))]);
    const rows = await readCustomProviders(scratch.db, LOCAL_LEARNER_ID);
    const keys = await readProviderKeys(scratch.db, LOCAL_LEARNER_ID);
    expect(keys.length).toBe(rows.length);
    expect(rows).toEqual([]);
  });
});
