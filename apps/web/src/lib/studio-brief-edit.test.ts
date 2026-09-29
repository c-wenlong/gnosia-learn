import { describe, expect, it } from "vitest";

import type { PendingTopic } from "@/lib/studio-drafts";
import type { Brief } from "@/lib/studio-jobs";

import { checkEdit, fieldFor, fromEdit, isChanged, saveRefusal, toEdit, topicMenu, type BriefEdit } from "./studio-brief-edit";

/**
 * The confirm card's inline edit (phase 3): what goes back to the runner, what
 * is caught before it does, and where a refusal lands.
 */

const BRIEF: Brief = {
  intent: "Show how a packet finds its peer",
  topic: "networking",
  slug: "tailscale-path",
  title: "How Tailscale finds a path",
  mode: "new",
  elements: [{ label: "Laptop", note: "the client" }, { label: "DERP" }, { label: "Server" }],
  relations: [
    { from: "Laptop", to: "DERP", label: "relays via" },
    { from: "DERP", to: "Server" },
  ],
  concepts: ["nat-traversal"],
  layout: "flow-lr",
  model: "sonnet",
};

function ids() {
  let n = 0;
  return (prefix: string) => `${prefix}${++n}`;
}

describe("toEdit and fromEdit", () => {
  it("round-trips a brief untouched, keeping every field the card does not show", () => {
    const edit = toEdit(BRIEF, ids());
    expect(fromEdit(BRIEF, edit)).toEqual(BRIEF);
    expect(isChanged(BRIEF, edit)).toBe(false);
  });

  it("points arrows at elements, so a rename carries the arrows with it", () => {
    const edit = toEdit(BRIEF, ids());
    expect(edit.relations[0]).toMatchObject({ from: edit.elements[0]!.id, to: edit.elements[1]!.id, label: "relays via" });
    const renamed: BriefEdit = {
      ...edit,
      elements: edit.elements.map((element, at) => (at === 1 ? { ...element, label: "  Relay  " } : element)),
    };
    const out = fromEdit(BRIEF, renamed);
    expect(out.elements.map((element) => element.label)).toEqual(["Laptop", "Relay", "Server"]);
    expect(out.relations).toEqual([
      { from: "Laptop", to: "Relay", label: "relays via" },
      { from: "Relay", to: "Server" },
    ]);
    expect(out.elements[0]!.note).toBe("the client");
    expect(isChanged(BRIEF, renamed)).toBe(true);
  });

  it("drops an arrow label that was cleared, rather than sending an empty one", () => {
    const edit = toEdit(BRIEF, ids());
    edit.relations[0]!.label = "   ";
    expect(fromEdit(BRIEF, edit).relations[0]).toEqual({ from: "Laptop", to: "DERP" });
  });

  it("drops the concepts when the topic changes, since they were filed under the old one", () => {
    const edit = toEdit(BRIEF, ids());
    expect(fromEdit(BRIEF, { ...edit, topic: "security" }).concepts).toEqual([]);
    expect(fromEdit(BRIEF, edit).concepts).toEqual(["nat-traversal"]);
  });

  it("counts a new topic or title as a change and whitespace alone as none", () => {
    const edit = toEdit(BRIEF, ids());
    expect(isChanged(BRIEF, { ...edit, title: `${BRIEF.title}  ` })).toBe(false);
    expect(isChanged(BRIEF, { ...edit, topic: "security" })).toBe(true);
  });
});

describe("checkEdit", () => {
  it("passes a brief as it came", () => {
    expect(checkEdit(toEdit(BRIEF, ids()))).toEqual([]);
  });

  it("names each problem on its own field, in the card's order", () => {
    const edit = toEdit(BRIEF, ids());
    const [laptop, derp, server] = edit.elements;
    const broken: BriefEdit = {
      ...edit,
      title: " ",
      elements: [{ ...laptop!, label: "" }, derp!, { ...server!, label: "DERP" }],
      relations: [{ ...edit.relations[0]!, to: null }],
    };
    expect(checkEdit(broken).map((problem) => problem.field)).toEqual([
      "title",
      `element:${laptop!.id}`,
      `element:${server!.id}`,
      `relation:${edit.relations[0]!.id}:to`,
    ]);
  });

  it("refuses a brief with no elements", () => {
    expect(checkEdit({ ...toEdit(BRIEF, ids()), elements: [], relations: [] })).toEqual([
      { field: "elements", message: "A diagram needs at least one element." },
    ]);
  });
});

describe("where a refusal lands", () => {
  const edit = toEdit(BRIEF, ids());

  it("reads validateBrief's paths against the edit that was sent", () => {
    expect(fieldFor("title", edit)).toBe("title");
    expect(fieldFor("topic", edit)).toBe("topic");
    expect(fieldFor("elements[1].label", edit)).toBe(`element:${edit.elements[1]!.id}`);
    expect(fieldFor("relations[1].to", edit)).toBe(`relation:${edit.relations[1]!.id}:to`);
    expect(fieldFor("relations[0]", edit)).toBe(`relation:${edit.relations[0]!.id}:from`);
    expect(fieldFor("elements[9].label", edit)).toBe("elements");
    expect(fieldFor("slug", edit)).toBe("general");
    expect(fieldFor(null, edit)).toBe("general");
  });

  it("puts a 400 on its field in the validator's words, as a sentence", () => {
    const problem = saveRefusal(400, { error: '"title" is required and must be a non-empty string', detail: { field: "title" } }, edit);
    expect(problem).toEqual({ field: "title", message: '"title" is required and must be a non-empty string.' });
  });

  it("says a topic gone from the vocabulary without the CLI's advice", () => {
    const problem = saveRefusal(400, { error: 'no topic "networking" in the catalog\'s vocabulary. Add it with `catalog topic add`', detail: { field: "topic" } }, edit);
    expect(problem).toEqual({ field: "topic", message: "“networking” is not in the topic list any more. Pick another topic." });
  });

  it("says a 409 in plain words under the buttons", () => {
    expect(saveRefusal(409, { error: "a turn is running", detail: { reason: "in-flight" } }, edit)).toEqual({
      field: "general",
      message: "The planner is answering. Save again once its reply is in.",
    });
    expect(saveRefusal(409, { error: "x", detail: { reason: "drawing" } }, edit).message).toMatch(/already being drawn/);
    expect(saveRefusal(409, { error: "x", detail: { reason: "abandoned" } }, edit).message).toMatch(/moved on/);
    expect(saveRefusal(409, { error: "x", detail: { reason: "brief-changed", base: 9 } }, edit).message).toMatch(
      /changed while you were editing it, in a planner reply or another tab/,
    );
  });

  it("says a refused save in the runner's words, never as a conversation that is gone", () => {
    expect(saveRefusal(404, { error: "no route PUT /api/drafts/d/brief", detail: null }, edit)).toEqual({
      field: "general",
      message: "No route PUT /api/drafts/d/brief.",
    });
  });

  it("keeps the edits when the runner is not answering", () => {
    expect(saveRefusal(0, { error: "down", detail: null }, edit).message).toMatch(/Your edits are still here/);
    expect(saveRefusal(502, { error: "down", detail: null }, edit).message).toMatch(/Your edits are still here/);
  });
});

describe("topicMenu", () => {
  const topics = [
    { slug: "tls", title: "TLS", domain: "Security" },
    { slug: "networking", title: "Networking", domain: "Systems" },
    { slug: "dns", title: "DNS", domain: "Systems" },
    { slug: "misc", title: "Misc" },
  ];
  const pending: PendingTopic = {
    entry: { slug: "mesh-vpn", title: "Mesh VPNs", domain: "Systems", summary: null, aliases: [], relations: [] },
    nearMatches: [],
  };

  it("groups the vocabulary by domain, titles sorted, with no domain last", () => {
    const rows = topicMenu(topics, null, "networking");
    expect(rows.map((row) => `${row.section}/${row.label}`)).toEqual([
      "Security/TLS",
      "Systems/DNS",
      "Systems/Networking",
      "Other/Misc",
    ]);
  });

  it("puts a proposed topic first, as a proposal", () => {
    const rows = topicMenu(topics, pending, "mesh-vpn");
    expect(rows[0]).toEqual({
      value: "mesh-vpn",
      label: "Mesh VPNs",
      detail: "New topic, created when you draw",
      section: "Proposed",
    });
  });

  it("still shows a topic the vocabulary no longer lists", () => {
    expect(topicMenu(topics, null, "gone")[0]).toMatchObject({ value: "gone", section: "Current", detail: "Not in the topic list" });
  });

  it("does not call a topic missing when the list itself could not be read", () => {
    expect(topicMenu([], null, "networking")).toEqual([
      { value: "networking", label: "networking", detail: "The topic list could not be read", section: "Current" },
    ]);
  });
});
