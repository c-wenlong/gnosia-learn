import { customProvider, learner, LOCAL_LEARNER_ID, providerKey, tutorModel } from "@self-learn/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  addCustomProvider,
  addTutorModel,
  deleteTutorProvider,
  readCustomProviders,
  readProviderKeys,
  readTutorModels,
  updateCustomProvider,
  writeProviderKey,
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
    const first = await addCustomProvider(scratch.db, LOCAL_LEARNER_ID, { label: "My gateway", baseUrl: "https://gw.example/v1/" });
    expect(first).toMatchObject({ id: "custom-my-gateway", label: "My gateway", baseUrl: "https://gw.example/v1" });
    const second = await addCustomProvider(scratch.db, LOCAL_LEARNER_ID, { label: "My  gateway", baseUrl: "http://localhost:11434/v1" });
    expect(second.id).toBe("custom-my-gateway-2");
    const moved = await updateCustomProvider(scratch.db, LOCAL_LEARNER_ID, first.id, { label: "Work gateway", baseUrl: "https://gw2.example/v1" });
    expect(moved).toMatchObject({ id: "custom-my-gateway", label: "Work gateway", baseUrl: "https://gw2.example/v1" });
    expect((await readCustomProviders(scratch.db, LOCAL_LEARNER_ID)).map((p) => p.label)).toEqual(["My gateway", "Work gateway"]);
  });

  it("refuses a bad name or base URL in the function, and the table refuses what a writer slips past it", async () => {
    await expect(addCustomProvider(scratch.db, LOCAL_LEARNER_ID, { label: "x", baseUrl: "http://gw.example/v1" })).rejects.toMatchObject({
      code: "INVALID",
    });
    await expect(addCustomProvider(scratch.db, LOCAL_LEARNER_ID, { label: "", baseUrl: "https://gw.example" })).rejects.toMatchObject({
      code: "INVALID",
    });
    for (const values of [
      { ownerId: LOCAL_LEARNER_ID, id: "custom-ok", label: "ok", baseUrl: "http://gw.example/v1" },
      { ownerId: LOCAL_LEARNER_ID, id: "custom-ok", label: "ok", baseUrl: "http://localhost.evil.example/v1" },
      { ownerId: LOCAL_LEARNER_ID, id: "not-custom", label: "ok", baseUrl: "https://gw.example" },
      { ownerId: LOCAL_LEARNER_ID, id: "custom-ok", label: "", baseUrl: "https://gw.example" },
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
  });

  it("holds at most ten per owner, and keeps owner B off owner A's", async () => {
    for (let i = 0; i < 10; i += 1) await addCustomProvider(scratch.db, LOCAL_LEARNER_ID, { label: `p${i}`, baseUrl: "https://gw.example/v1" });
    await expect(addCustomProvider(scratch.db, LOCAL_LEARNER_ID, { label: "one more", baseUrl: "https://gw.example/v1" })).rejects.toMatchObject({
      code: "FULL",
    });
    expect(await readCustomProviders(scratch.db, OTHER)).toEqual([]);
    await expect(updateCustomProvider(scratch.db, OTHER, "custom-p0", { label: "mine now" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await deleteTutorProvider(scratch.db, OTHER, "custom-p0")).keyRemoved).toBe(false);
    expect(await readCustomProviders(scratch.db, LOCAL_LEARNER_ID)).toHaveLength(10);
  });

  it("files a key and models under the custom id, and Delete removes the row, the key and the models together", async () => {
    const { id } = await addCustomProvider(scratch.db, LOCAL_LEARNER_ID, { label: "Gateway", baseUrl: "https://gw.example/v1" });
    await writeProviderKey(scratch.db, LOCAL_LEARNER_ID, id, sealed());
    await addTutorModel(scratch.db, LOCAL_LEARNER_ID, id, "gw/model-a", { requireKey: { server: false } });
    await addTutorModel(scratch.db, LOCAL_LEARNER_ID, "nvidia", "n/one", { requireKey: { server: true } });
    expect((await readTutorModels(scratch.db, LOCAL_LEARNER_ID)).map((r) => r.provider)).toEqual([id, "nvidia"]);

    const gone = await deleteTutorProvider(scratch.db, LOCAL_LEARNER_ID, id);
    expect(gone.keyRemoved).toBe(true);
    expect(gone.chain.map((r) => r.provider)).toEqual(["nvidia"]);
    expect(await readCustomProviders(scratch.db, LOCAL_LEARNER_ID)).toEqual([]);
    expect(await readProviderKeys(scratch.db, LOCAL_LEARNER_ID)).toEqual([]);
  });
});
