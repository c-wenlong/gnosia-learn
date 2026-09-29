import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  buildSystemPrompt,
  corpusBlock,
  drawingSummary,
  evaluateReply,
  lastFencedBlock,
  mermaidBlocks,
  PLANNER_PROMPT,
  plannerArgv,
  plannerSettings,
  vocabularyBlock,
  type TopicChecker,
} from "../src/planner";
import { proposing } from "./fake-claude";
import { testVocabulary } from "./vocabulary";

/**
 * The planner's pure half: the seals on its argv, the system prompt it is
 * given, and how a reply is read. The spawn and the turn loop are in
 * `drafts.test.ts`, against a fake `claude`.
 */

const argvOf = (resume = false) =>
  plannerArgv({
    systemPrompt: "SYSTEM",
    settingsFile: "/abs/drafts/d/planner-settings.json",
    sessionId: "11111111-2222-4333-8444-555555555555",
    resume,
    model: "sonnet",
  });

/** The value after a flag. */
const after = (argv: string[], flag: string): string | undefined => argv[argv.indexOf(flag) + 1];

describe("the planner's argv", () => {
  it("carries every seal in the doc's planner table", () => {
    const argv = argvOf();
    // No built-in tool.
    expect(after(argv, "--tools")).toBe("");
    // No MCP server from anywhere: strict, and an empty config.
    expect(argv).toContain("--strict-mcp-config");
    expect(JSON.parse(after(argv, "--mcp-config") ?? "null")).toEqual({ mcpServers: {} });
    // No CLAUDE.md, memory, plugins, hooks or skills.
    expect(argv).toContain("--safe-mode");
    expect(argv).toContain("--disable-slash-commands");
    // No settings but the deny file.
    expect(after(argv, "--setting-sources")).toBe("");
    expect(after(argv, "--settings")).toBe("/abs/drafts/d/planner-settings.json");
    expect(after(argv, "--permission-prompts")).toBe("none");
    expect(after(argv, "--max-turns")).toBe("2");
    expect(after(argv, "--output-format")).toBe("stream-json");
    expect(argv).toContain("--verbose");
    expect(argv).toContain("--include-partial-messages");
    // The system prompt is replaced, never appended to Claude Code's own.
    expect(after(argv, "--system-prompt")).toBe("SYSTEM");
    expect(argv).not.toContain("--append-system-prompt");
  });

  it("names no tool anywhere, and allows nothing", () => {
    const argv = argvOf();
    for (const flag of ["--allowedTools", "--allowed-tools", "--add-dir", "--dangerously-skip-permissions"]) {
      expect(argv).not.toContain(flag);
    }
    // No argument but the system prompt is a tool's name.
    const values = argv.filter((_, i) => argv[i - 1] !== "--system-prompt");
    for (const tool of ["Bash", "Read", "Edit", "Write", "WebFetch", "WebSearch"]) expect(values).not.toContain(tool);
    const settings = plannerSettings();
    expect(settings.permissions.allow).toEqual([]);
    for (const tool of ["Bash", "Read", "Edit", "WebFetch", "WebSearch"]) expect(settings.permissions.deny).toContain(tool);
  });

  it("carries no prompt: the person's text goes on stdin, so it can never be read as a flag", () => {
    const argv = argvOf();
    expect(argv[0]).toBe("-p");
    // Every other element is a flag or the value of the flag before it.
    const valued = new Set(["--system-prompt", "--tools", "--mcp-config", "--setting-sources", "--settings", "--permission-prompts", "--max-turns", "--output-format", "--model", "--session-id", "--resume"]);
    for (let i = 1; i < argv.length; i += 1) {
      expect(argv[i]!.startsWith("--"), `argv[${i}] ${argv[i]}`).toBe(true);
      if (valued.has(argv[i]!)) i += 1;
    }
  });

  it("starts a session with its minted id and resumes it after", () => {
    expect(after(argvOf(false), "--session-id")).toBe("11111111-2222-4333-8444-555555555555");
    expect(argvOf(false)).not.toContain("--resume");
    expect(after(argvOf(true), "--resume")).toBe("11111111-2222-4333-8444-555555555555");
    expect(argvOf(true)).not.toContain("--session-id");
  });
});

describe("the system prompt", () => {
  it("is the prompt the design doc quotes, word for word", () => {
    // Read from the checkout this file sits in, never written: the doc and
    // the code are one prompt, and a change to either has to reach both.
    const doc = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "docs", "STUDIO-CHAT-FIRST.md"),
      "utf8",
    );
    const quoted = /````text\n([\s\S]*?)\n````/.exec(doc)?.[1];
    expect(quoted).toBe(PLANNER_PROMPT);
  });

  it("prefers a close existing domain for a new topic, and names a new one broadly only when none is close", () => {
    // Phase 2 measured: two networking drafts invented `networking` and
    // `computer-networks`, since neither can see the other's pending topic.
    expect(PLANNER_PROMPT).toContain("A new topic's `domain` is one of the domains in the VOCABULARY block\n  whenever one is close, by its name or by the topics filed under it. Only\n  when none is, name a new domain");
    expect(PLANNER_PROMPT).toContain("the broad field's usual name");
    expect(PLANNER_PROMPT).not.toContain("(one of the domains in the VOCABULARY block)");
  });

  it("proposes a new topic with the brief, without asking first", () => {
    // Phase 2 measured: the TCP draft asked leave before proposing one.
    expect(PLANNER_PROMPT).toContain("Never ask\n  first whether to propose one.");
    expect(PLANNER_PROMPT).toContain("that press is their approval");
  });

  it("lists, on extend, the existing shapes an arrow touches as elements", () => {
    // Phase 2 measured: the extend brief was refused once on `relations[1].to`
    // for an arrow to an existing shape it had not listed.
    expect(PLANNER_PROMPT).toContain(
      "On extend, a shape\n  already in the diagram that an arrow touches is an element too: copy its\n  label from the EXTENDING block",
    );
  });

  it("is the doc's prompt, then VOCABULARY and CORPUS, and EXTENDING only on extend", () => {
    const vocabulary = testVocabulary().entries;
    const plain = buildSystemPrompt({ vocabulary, corpus: [] });
    expect(plain.startsWith(PLANNER_PROMPT)).toBe(true);
    expect(plain).toContain("-----BEGIN VOCABULARY-----");
    expect(plain).toContain("-----BEGIN CORPUS-----");
    expect(plain).not.toContain("-----BEGIN EXTENDING-----");
    expect(buildSystemPrompt({ vocabulary, corpus: [], extending: "slug: x" })).toContain(
      "-----BEGIN EXTENDING-----\nslug: x\n-----END EXTENDING-----",
    );
  });

  it("lists each topic with its aliases, summary, relations and concepts, and the domains and kinds in use", () => {
    const [first, second] = testVocabulary().entries;
    const block = vocabularyBlock([
      { ...first!, relations: [{ kind: "broader", to: "tcp-congestion-control" }] },
      second!,
    ]);
    expect(block).toContain("domains: mathematics, networking");
    expect(block).toContain("relation kinds: broader, related, precedes");
    expect(block).toContain("tcp-congestion-control | TCP congestion control | networking | congestion control | How a sender backs off.");
    expect(block).toContain("  relations: broader -> tcp-congestion-control");
    expect(block).toContain("  concepts: dot-product, vector-projection");
  });

  it("lists the corpus one diagram a line", () => {
    expect(corpusBlock([{ name: "tailscale-mesh", title: "Tailscale mesh", topic: "tcp-congestion-control", shapes: 12 }])).toContain(
      "tailscale-mesh | Tailscale mesh | tcp-congestion-control | 12 shapes",
    );
    expect(corpusBlock([])).toContain("(no diagrams yet)");
  });

  it("summarises a drawing as labels and arrows, never geometry, capped", () => {
    const summary = drawingSummary(
      { slug: "dot-product", title: "Dot product", topic: "vector-and-linear-algebra-basics", concepts: ["dot-product"] },
      {
        shapes: [
          { id: "shape:a", type: "geo", text: "vector a" },
          { id: "shape:b", type: "geo", text: "vector b" },
          { id: "shape:arrow", type: "arrow", text: "projects onto" },
          { id: "shape:blank", type: "geo", text: null },
        ],
        bindings: [{ arrow: "shape:arrow", from: "shape:a", to: "shape:b" }],
      },
    );
    expect(summary).toContain("labels:\n  vector a\n  vector b\narrows:");
    expect(summary).toContain("  vector a -> vector b (projects onto)");
    expect(summary).not.toContain("shape:blank");

    const many = drawingSummary(
      { slug: "big", title: null, topic: null, concepts: [] },
      { shapes: Array.from({ length: 400 }, (_, i) => ({ id: `shape:${i}`, type: "geo", text: `box ${i}` })) },
    );
    expect(many.split("\n")).toHaveLength(200);
    expect(many.split("\n").at(-1)).toMatch(/more lines not shown/);
  });
});

/** A brief that passes against the test vocabulary. */
const good = {
  intent: "Show how a sender's window reacts to loss.",
  title: "TCP congestion window",
  topic: "tcp-congestion-control",
  slug: "tcp-congestion-window",
  mode: "new",
  layout: "flow-lr",
  elements: [{ label: "Sender" }, { label: "Receiver" }, { label: "Congestion window" }],
  relations: [
    { from: "Sender", to: "Receiver", label: "sends segments" },
    { from: "Receiver", to: "Sender", label: "acks" },
  ],
  concepts: [],
};

const noTopics: TopicChecker = { dryRun: vi.fn() };

describe("reading a reply", () => {
  it("takes the last brief block, so a quoted earlier brief is not the one proposed", () => {
    const text = `${proposing({ ...good, title: "Old" })}\n\nOn second thought:\n\n${proposing(good)}`;
    expect(JSON.parse(lastFencedBlock(text, "brief") ?? "{}").title).toBe("TCP congestion window");
    expect(lastFencedBlock("no fences here", "brief")).toBeNull();
    expect(mermaidBlocks("look:\n```mermaid\ngraph LR\nA-->B\n```\nand\n```mermaid\ngraph TD\nC\n```")).toEqual([
      "graph LR\nA-->B",
      "graph TD\nC",
    ]);
  });

  it("extracts and validates a brief from a recorded reply, dropping fields the planner may not set", async () => {
    const verdict = await evaluateReply(
      proposing({ ...good, model: "opus", mermaid: "graph LR", idempotencyKey: "x", source: "/etc/passwd" }),
      testVocabulary(),
      noTopics,
    );
    expect(verdict.kind).toBe("valid");
    if (verdict.kind !== "valid") return;
    expect(verdict.brief.slug).toBe("tcp-congestion-window");
    // Not even `sonnet`: a brief that names no model is what lets the
    // settings panel's Diagrams row choose one at job start (D53).
    expect(verdict.brief).not.toHaveProperty("model");
    expect(verdict.brief).not.toHaveProperty("mermaid");
    expect(verdict.brief).not.toHaveProperty("source");
    expect(verdict.brief).not.toHaveProperty("idempotencyKey");
    expect(verdict.pendingTopic).toBeNull();
  });

  it("is none for a reply that only asks", async () => {
    expect(await evaluateReply("Is this a new diagram, or an extension of tailscale-mesh?", testVocabulary(), noTopics)).toEqual({
      kind: "none",
    });
  });

  it("names the field and the validator's sentence on a refusal", async () => {
    const verdict = await evaluateReply(
      proposing({ ...good, relations: [{ from: "Sender", to: "Relay" }] }),
      testVocabulary(),
      noTopics,
    );
    expect(verdict).toMatchObject({ kind: "invalid", field: "relations[0].to" });
    if (verdict.kind === "invalid") expect(verdict.message).toMatch(/"Relay" is not one of the elements/);
    expect(await evaluateReply("```brief\nnot json\n```", testVocabulary(), noTopics)).toMatchObject({
      kind: "invalid",
      field: "brief",
    });
  });

  const newTopic = {
    slug: "mesh-vpn",
    title: "Mesh VPNs",
    domain: "networking",
    summary: "Peer-to-peer tunnels between a set of devices.",
    aliases: ["tailscale"],
    relations: [{ kind: "related", to: "tcp-congestion-control" }],
  };
  const topicBlock = (entry: Record<string, unknown>) => `\n\n\`\`\`topic\n${JSON.stringify(entry)}\n\`\`\``;

  it("checks a proposed topic with a dry run and the brief against the widened vocabulary, then stores it pending", async () => {
    const dryRun = vi.fn<TopicChecker["dryRun"]>(async () => ({
      ok: true,
      offline: false,
      error: null,
      json: { nearMatches: [{ slug: "tcp-congestion-control", title: "TCP congestion control", score: 0.4, field: "title" }] },
    }));
    const brief = { ...good, topic: "mesh-vpn", slug: "tailscale-tunnels" };
    const verdict = await evaluateReply(`${proposing(brief)}${topicBlock(newTopic)}`, testVocabulary(), { dryRun });
    expect(dryRun).toHaveBeenCalledTimes(1);
    expect(dryRun.mock.calls[0]?.[0]).toMatchObject({ slug: "mesh-vpn", domain: "networking", aliases: ["tailscale"] });
    expect(verdict.kind).toBe("valid");
    if (verdict.kind !== "valid") return;
    expect(verdict.brief.topic).toBe("mesh-vpn");
    expect(verdict.pendingTopic?.entry.slug).toBe("mesh-vpn");
    expect(verdict.pendingTopic?.nearMatches).toEqual([
      { slug: "tcp-congestion-control", title: "TCP congestion control", score: 0.4, field: "title" },
    ]);
  });

  it("refuses the same reply with a bad relation, on the relation, after the topic passed", async () => {
    const dryRun = vi.fn(async () => ({ ok: true, offline: false, error: null, json: { nearMatches: [] } }));
    const brief = { ...good, topic: "mesh-vpn", relations: [{ from: "Sender", to: "Relay" }] };
    expect(await evaluateReply(`${proposing(brief)}${topicBlock(newTopic)}`, testVocabulary(), { dryRun })).toMatchObject({
      kind: "invalid",
      field: "relations[0].to",
    });
  });

  it("refuses a topic block naming another slug, a refused dry run, or none at all, on topic", async () => {
    const dryRun = vi.fn(async () => ({ ok: true, offline: false, error: null, json: {} }));
    const brief = { ...good, topic: "mesh-vpn" };
    expect(await evaluateReply(`${proposing(brief)}${topicBlock({ ...newTopic, slug: "other" })}`, testVocabulary(), { dryRun })).toMatchObject({
      kind: "invalid",
      field: "topic",
    });
    expect(dryRun).not.toHaveBeenCalled();
    expect(await evaluateReply(proposing(brief), testVocabulary(), { dryRun })).toMatchObject({ kind: "invalid", field: "topic" });
    const refusing = vi.fn(async () => ({ ok: false, offline: false, error: 'topic "x": no such domain', json: null }));
    const refused = await evaluateReply(`${proposing(brief)}${topicBlock(newTopic)}`, testVocabulary(), { dryRun: refusing });
    expect(refused).toMatchObject({ kind: "invalid", field: "topic" });
    if (refused.kind === "invalid") expect(refused.message).toContain("no such domain");
    expect(
      await evaluateReply(`${proposing(brief)}${topicBlock({ ...newTopic, relations: [{ kind: "owns", to: "x" }] })}`, testVocabulary(), { dryRun }),
    ).toMatchObject({ kind: "invalid", field: "topic" });
  });
});
