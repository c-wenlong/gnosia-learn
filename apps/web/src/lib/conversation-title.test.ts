import { describe, expect, it } from "vitest";

import { conversationTitle } from "./conversation-title";

describe("conversationTitle", () => {
  it("takes the owner's name, then the planner's title, then the concept, then the first message", () => {
    const all = { name: "Mine", title: "Planner's", concept: { title: "Cosine" }, firstMessage: "Explain cosines" };
    expect(conversationTitle(all)).toEqual({ text: "Mine", quoted: false, from: "name" });
    expect(conversationTitle({ ...all, name: null })).toEqual({ text: "Planner's", quoted: false, from: "title" });
    expect(conversationTitle({ ...all, name: null, title: null })).toEqual({ text: "Cosine", quoted: false, from: "concept" });
    expect(conversationTitle({ firstMessage: "Explain cosines" })).toEqual({ text: "Explain cosines", quoted: true, from: "first-message" });
  });

  it("passes over words with nothing in them, and is null when nothing is left", () => {
    expect(conversationTitle({ name: "   ", title: " Planner's " })).toMatchObject({ text: "Planner's", from: "title" });
    expect(conversationTitle({ name: "", title: "", concept: { title: " " }, firstMessage: "\n" })).toBeNull();
    expect(conversationTitle({})).toBeNull();
    expect(conversationTitle({ concept: null })).toBeNull();
  });
});
