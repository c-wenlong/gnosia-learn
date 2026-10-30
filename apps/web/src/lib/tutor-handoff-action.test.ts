import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `openConceptConversation`, the server action behind a tagged message in the
 * concept tutor (D65 of docs/STUDIO-TUTOR-HANDOFF.md): it reads the concept
 * for the signed-in owner on the server and posts `POST /api/drafts
 * { concept, tutor, idempotencyKey }`, in the shapes the runner's phase 1
 * takes.
 */

const mocks = vi.hoisted(() => ({
  studioApi: vi.fn(),
  requireStudio: vi.fn(),
  readConceptWorkspace: vi.fn(),
  currentOwner: vi.fn(async () => "kai"),
}));
vi.mock("@/lib/studio", () => ({ studioApi: mocks.studioApi, requireStudio: mocks.requireStudio }));
vi.mock("@gnosia/catalog/state", () => ({ readPreference: vi.fn(), writePreference: vi.fn() }));
vi.mock("@/lib/learner-store", () => ({ withLearnerStore: vi.fn() }));
vi.mock("@/lib/owner", () => ({ currentOwner: mocks.currentOwner }));
vi.mock("@/lib/concept-workspace", () => ({ readConceptWorkspace: mocks.readConceptWorkspace }));

const { openConceptConversation } = await import("@/app/(app)/studio/actions");

const NOTE = "---\ntitle: The TCP handshake\nsources: []\n---\n\n# The handshake\n\nSYN, SYN-ACK, ACK.\n";

function workspace(patch: Record<string, unknown> = {}) {
  return {
    state: "ok",
    workspace: {
      slug: "tcp-handshake",
      title: "The TCP three-way handshake",
      summary: "How two hosts agree on sequence numbers.",
      note: { available: true, path: "learn/concepts/net/tcp-handshake.md", source: NOTE },
      ...patch,
    },
  };
}

const turns = [
  { role: "user", content: "what does the SYN carry?" },
  { role: "assistant", content: "Its initial sequence number [1]." },
];

beforeEach(() => {
  mocks.studioApi.mockReset();
  mocks.studioApi.mockResolvedValue({ ok: true, data: { draftId: "d-1", state: "open", note: "a conversation about the concept tcp-handshake" } });
  mocks.requireStudio.mockReset();
  mocks.readConceptWorkspace.mockReset();
  mocks.readConceptWorkspace.mockResolvedValue(workspace());
  mocks.currentOwner.mockClear();
});

function posted(): Record<string, unknown> {
  const [path, init] = mocks.studioApi.mock.calls[0] as [string, { method: string; body: string }];
  expect(path).toBe("/api/drafts");
  expect(init.method).toBe("POST");
  return JSON.parse(init.body) as Record<string, unknown>;
}

describe("openConceptConversation", () => {
  it("is gated before it reads or posts anything", async () => {
    mocks.requireStudio.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    await expect(openConceptConversation({ slug: "tcp-handshake", tutor: [], idempotencyKey: "k" })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.readConceptWorkspace).not.toHaveBeenCalled();
    expect(mocks.studioApi).not.toHaveBeenCalled();
  });

  it("reads the concept as the signed-in owner and posts it with the turns and the key", async () => {
    expect(await openConceptConversation({ slug: "tcp-handshake", tutor: turns, idempotencyKey: "studio-ui:tutor:1" })).toEqual({
      ok: true,
      draftId: "d-1",
    });
    expect(mocks.readConceptWorkspace).toHaveBeenCalledWith("tcp-handshake", "kai");
    expect(posted()).toEqual({
      concept: {
        slug: "tcp-handshake",
        title: "The TCP three-way handshake",
        summary: "How two hosts agree on sequence numbers.",
        // The note without its front matter, as the tutor reads it.
        body: "# The handshake\n\nSYN, SYN-ACK, ACK.",
      },
      tutor: turns,
      idempotencyKey: "studio-ui:tutor:1",
    });
  });

  it("leaves `tutor` out when there are no turns: the runner refuses an empty list", async () => {
    await openConceptConversation({ slug: "tcp-handshake", tutor: [], idempotencyKey: "k" });
    expect(posted()).not.toHaveProperty("tutor");
  });

  it("sends an unreadable note as none, and an empty summary as null (H10)", async () => {
    mocks.readConceptWorkspace.mockResolvedValue(
      workspace({ summary: " ", note: { available: false, code: "too-large", message: "too large" } }),
    );
    await openConceptConversation({ slug: "tcp-handshake", tutor: [], idempotencyKey: "k" });
    expect(posted().concept).toEqual({ slug: "tcp-handshake", title: "The TCP three-way handshake", summary: null, body: "" });
  });

  it("cuts a title past the runner's 200 characters rather than have the whole hand-off refused", async () => {
    mocks.readConceptWorkspace.mockResolvedValue(workspace({ title: `A ${"very ".repeat(60)}long title` }));
    await openConceptConversation({ slug: "tcp-handshake", tutor: [], idempotencyKey: "k" });
    expect(((posted().concept as { title: string }).title).length).toBe(200);
  });

  it("refuses an input that cannot be a hand-off without reading or posting", async () => {
    expect(await openConceptConversation({ slug: "../x", tutor: [], idempotencyKey: "k" })).toMatchObject({ ok: false, where: "input" });
    expect(mocks.readConceptWorkspace).not.toHaveBeenCalled();
    expect(mocks.studioApi).not.toHaveBeenCalled();
  });

  it("says so when the concept cannot be read for this owner, and posts nothing", async () => {
    mocks.readConceptWorkspace.mockResolvedValue({ state: "not-found" });
    expect(await openConceptConversation({ slug: "tcp-handshake", tutor: [], idempotencyKey: "k" })).toEqual({
      ok: false,
      where: "concept",
      reason: "not-found",
      status: null,
      said: null,
    });
    mocks.readConceptWorkspace.mockResolvedValue({ state: "unreachable", message: "down" });
    expect(await openConceptConversation({ slug: "tcp-handshake", tutor: [], idempotencyKey: "k" })).toMatchObject({ where: "concept", reason: "unreachable" });
    expect(mocks.studioApi).not.toHaveBeenCalled();
  });

  it("hands back the runner's refusal with its reason, and a runner that is down as down", async () => {
    mocks.studioApi.mockResolvedValue({
      ok: false,
      reason: "refused",
      status: 404,
      headline: "no concept tcp-handshake that this studio's owner can read",
      detail: JSON.stringify({ reason: "no-concept", field: "concept", slug: "tcp-handshake" }),
      refusal: {
        error: "no concept tcp-handshake that this studio's owner can read",
        detail: { reason: "no-concept", field: "concept", slug: "tcp-handshake" },
      },
    });
    expect(await openConceptConversation({ slug: "tcp-handshake", tutor: [], idempotencyKey: "k" })).toEqual({
      ok: false,
      where: "runner",
      reason: "no-concept",
      status: 404,
      said: "no concept tcp-handshake that this studio's owner can read",
    });
    mocks.studioApi.mockResolvedValue({
      ok: false,
      reason: "down",
      status: null,
      undelivered: true,
      headline: "The studio runner is not answering.",
      detail: "ECONNREFUSED",
    });
    expect(await openConceptConversation({ slug: "tcp-handshake", tutor: [], idempotencyKey: "k" })).toEqual({
      ok: false,
      where: "runner",
      reason: "down",
      status: null,
      said: null,
      undelivered: true,
    });
    // A timeout: the runner may have the request, and may make the draft yet.
    mocks.studioApi.mockResolvedValue({
      ok: false,
      reason: "down",
      status: null,
      undelivered: false,
      headline: "The studio runner is not answering.",
      detail: "The operation was aborted due to timeout",
    });
    expect(await openConceptConversation({ slug: "tcp-handshake", tutor: [], idempotencyKey: "k" })).toMatchObject({
      reason: "down",
      undelivered: false,
    });
  });
});
