import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The settings panel's save goes to the runner first (`PUT /api/settings/agent`,
 * which also drops health's cached copy of the row), and writes the row itself
 * only when the runner is not there to do it. A runner that looked at the value
 * and refused it is the answer, not something to route around.
 */

type Failure = { ok: false; reason: "down" | "refused"; status: number | null; undelivered?: boolean; headline: string; detail: string };

const mocks = vi.hoisted(() => ({
  studioApi: vi.fn(),
  readPreference: vi.fn(),
  writePreference: vi.fn(),
  withLearnerStore: vi.fn(),
  requireStudio: vi.fn(),
}));
vi.mock("@/lib/studio", () => ({ studioApi: mocks.studioApi, requireStudio: mocks.requireStudio }));
vi.mock("@gnosia/catalog/state", () => ({ readPreference: mocks.readPreference, writePreference: mocks.writePreference }));
vi.mock("@/lib/learner-store", () => ({ withLearnerStore: mocks.withLearnerStore }));
vi.mock("@/lib/owner", () => ({ currentOwner: async () => "local" }));

const { saveStudioAgent } = await import("@/app/(app)/studio/actions");

const db = { db: true };
/** Nothing listening: the request never left. */
const down: Failure = { ok: false, reason: "down", status: null, undelivered: true, headline: "The studio runner is not answering.", detail: "ECONNREFUSED" };
/** No answer in time, or a broken connection: the runner may hold the request. */
const silent: Failure = { ok: false, reason: "down", status: null, undelivered: false, headline: "The studio runner is not answering.", detail: "The operation was aborted due to timeout" };
const refused = (status: number, headline = "the runner said no"): Failure => ({ ok: false, reason: "refused", status, headline, detail: "{}" });

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}
const pick = (patch: Record<string, string> = {}) => form({ kind: "video", model: "opus", effort: "high", ...patch });

beforeEach(() => {
  mocks.readPreference.mockResolvedValue(null);
  mocks.writePreference.mockResolvedValue(undefined);
  mocks.withLearnerStore.mockImplementation(async (fn: (handle: unknown) => Promise<unknown>) => fn(db));
  mocks.studioApi.mockResolvedValue({ ok: true, data: {} });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("saveStudioAgent", () => {
  it("stores through the runner, with the owner's client, and writes nothing itself", async () => {
    expect(await saveStudioAgent(pick())).toEqual({ ok: true, error: null });
    expect(mocks.studioApi).toHaveBeenCalledTimes(1);
    const [path, init] = mocks.studioApi.mock.calls[0] as [string, { method: string; body: string; timeoutMs: number }];
    expect(path).toBe("/api/settings/agent");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body)).toEqual({ kind: "video", model: "opus", effort: "high" });
    expect(init.timeoutMs).toBeGreaterThan(0);
    expect(mocks.writePreference).not.toHaveBeenCalled();
  });

  it("shows a 4xx as the refusal and does not write the row behind the runner's back", async () => {
    mocks.studioApi.mockResolvedValue(refused(400, `"model" is "default" or a model name the claude CLI takes`));
    const saved = await saveStudioAgent(pick());
    expect(saved.ok).toBe(false);
    expect(saved.error).toContain(`"model" is "default"`);
    expect(mocks.writePreference).not.toHaveBeenCalled();
    expect(mocks.studioApi).toHaveBeenCalledTimes(1);
  });

  it("shows a 403 (another owner's runner) as a refusal too", async () => {
    mocks.studioApi.mockResolvedValue(refused(403, "this runner serves another owner"));
    expect((await saveStudioAgent(pick())).error).toContain("another owner");
    expect(mocks.writePreference).not.toHaveBeenCalled();
  });

  it("writes the row directly when the request certainly never reached the runner", async () => {
    mocks.studioApi.mockResolvedValue(down);
    expect(await saveStudioAgent(pick({ kind: "diagram", model: "sonnet", effort: "low" }))).toEqual({ ok: true, error: null });
    expect(mocks.writePreference).toHaveBeenCalledTimes(1);
    expect(mocks.writePreference).toHaveBeenCalledWith(db, "studioDiagramAgent", { model: "sonnet", effort: "low" }, "local");
  });

  it("writes nothing when the runner times out, since its own write may still land after a newer pick", async () => {
    mocks.studioApi.mockResolvedValue(silent);
    expect(await saveStudioAgent(pick())).toEqual({ ok: false, error: "Not saved: the studio did not answer in time. Try again." });
    expect(mocks.writePreference).not.toHaveBeenCalled();
  });

  it("treats a failure that does not say the request was undelivered as one that may have been", async () => {
    mocks.studioApi.mockResolvedValue({ ok: false, reason: "down", status: null, headline: "x", detail: "y" });
    expect((await saveStudioAgent(pick())).ok).toBe(false);
    expect(mocks.writePreference).not.toHaveBeenCalled();
  });

  it.each([500, 502, 503])("writes the row directly when the runner answers %i, being unable rather than refusing", async (status) => {
    mocks.studioApi.mockResolvedValue(refused(status));
    expect(await saveStudioAgent(pick())).toEqual({ ok: true, error: null });
    expect(mocks.writePreference).toHaveBeenCalledWith(db, "studioVideoAgent", { model: "opus", effort: "high" }, "local");
  });

  it.each([404, 405])("writes the row directly when an older runner answers %i for a route it does not have", async (status) => {
    mocks.studioApi.mockResolvedValue(refused(status));
    expect(await saveStudioAgent(pick())).toEqual({ ok: true, error: null });
    expect(mocks.writePreference).toHaveBeenCalledTimes(1);
  });

  it("says the catalog did not answer when the runner is down and the direct write fails", async () => {
    mocks.studioApi.mockResolvedValue(down);
    mocks.writePreference.mockRejectedValue(new Error("connection refused"));
    expect(await saveStudioAgent(pick())).toEqual({ ok: false, error: "Not saved: the catalog did not answer." });
  });

  it("says the same before calling the runner when the stored row cannot be read", async () => {
    mocks.readPreference.mockRejectedValue(new Error("connection refused"));
    expect(await saveStudioAgent(pick())).toEqual({ ok: false, error: "Not saved: the catalog did not answer." });
    expect(mocks.studioApi).not.toHaveBeenCalled();
  });

  it("checks the value as before, so neither writer sees a model the menu does not offer", async () => {
    const saved = await saveStudioAgent(pick({ model: "not-a-model-on-the-menu" }));
    expect(saved).toEqual({ ok: false, error: "That model or effort is not one the agent can run with." });
    expect(mocks.studioApi).not.toHaveBeenCalled();
    expect(mocks.writePreference).not.toHaveBeenCalled();
  });

  it("accepts the model already stored though the menu does not list it", async () => {
    mocks.readPreference.mockResolvedValue({ model: "claude-opus-4-1", effort: "low" });
    expect(await saveStudioAgent(pick({ model: "claude-opus-4-1", effort: "high" }))).toEqual({ ok: true, error: null });
    expect(JSON.parse((mocks.studioApi.mock.calls[0] as [string, { body: string }])[1].body)).toEqual({
      kind: "video",
      model: "claude-opus-4-1",
      effort: "high",
    });
  });

  it("refuses an unknown kind before reading or calling anything", async () => {
    expect(await saveStudioAgent(pick({ kind: "planner" }))).toEqual({ ok: false, error: "That is not a studio agent." });
    expect(mocks.withLearnerStore).not.toHaveBeenCalled();
    expect(mocks.studioApi).not.toHaveBeenCalled();
  });
});
