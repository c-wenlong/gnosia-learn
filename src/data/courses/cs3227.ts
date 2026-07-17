import type { Course } from "@/lib/types";

export const cs3227: Course = {
  id: "cs3227",
  slug: "cs3227",
  code: "CS3227",
  title: "Agentic Software Engineering",
  credits: 4,
  prereq: "CS2103",
  notes: "Transition from AI-assisted coding to agentic software engineering.",
  inferred: true,
  tags: ["agentic-ai"],
  modules: [
    {
      id: "cs3227-m1",
      slug: "m1-landscape-overview",
      title: "Landscape Overview",
      order: 1,
      topics: [
        {
          id: "cs3227-m1-t1",
          title: "AI-assisted coding vs agentic software engineering",
          subtopics: ["What changes when agents act autonomously"],
        },
        {
          id: "cs3227-m1-t2",
          title: "Where agents sit in the SDLC today",
          subtopics: ["Design, implement, test, maintain touchpoints"],
        },
      ],
      resources: [
        {
          id: "cs3227-m1-r1",
          title: "GitHub Copilot workspace / agentic coding overview",
          url: "https://github.blog/ai-and-ml/github-copilot/",
          type: "docs",
        },
      ],
    },
    {
      id: "cs3227-m2",
      slug: "m2-supervising-bounding-agent-behavior",
      title: "Supervising & Bounding Agent Behavior",
      order: 2,
      topics: [
        {
          id: "cs3227-m2-t1",
          title: "Guardrails, permission scoping, sandboxing",
          subtopics: ["Least privilege", "Isolation"],
        },
        {
          id: "cs3227-m2-t2",
          title: "Designing tasks agents can be trusted with",
          subtopics: ["Task boundaries", "Human checkpoints"],
        },
      ],
      resources: [
        {
          id: "cs3227-m2-r1",
          title: "OWASP LLM Top 10",
          url: "https://owasp.org/www-project-top-10-for-large-language-model-applications/",
          type: "docs",
        },
      ],
    },
    {
      id: "cs3227-m3",
      slug: "m3-agents-across-the-sdlc",
      title: "Agents Across the SDLC",
      order: 3,
      topics: [
        {
          id: "cs3227-m3-t1",
          title: "Agent-assisted design, implementation, testing, maintenance",
          subtopics: ["Per-phase agent roles"],
        },
        {
          id: "cs3227-m3-t2",
          title: "Multi-agent collaboration patterns",
          subtopics: ["Specialist agents", "Handoffs"],
        },
      ],
      resources: [
        {
          id: "cs3227-m3-r1",
          title: "AutoGen / multi-agent systems overview",
          url: "https://microsoft.github.io/autogen/",
          type: "docs",
        },
      ],
    },
    {
      id: "cs3227-m4",
      slug: "m4-evaluating-ai-generated-artifacts",
      title: "Evaluating AI-Generated Artifacts",
      order: 4,
      topics: [
        {
          id: "cs3227-m4-t1",
          title: "Code review practices for AI output",
          subtopics: ["What to trust, what to re-check"],
        },
        {
          id: "cs3227-m4-t2",
          title: "Static/dynamic analysis as a safety net",
          subtopics: ["Linters", "Tests", "Typechecks"],
        },
      ],
      resources: [
        {
          id: "cs3227-m4-r1",
          title: "Google Eng Practices — Code Review",
          url: "https://google.github.io/eng-practices/review/",
          type: "docs",
        },
      ],
    },
    {
      id: "cs3227-m5",
      slug: "m5-safety-security-agentic-systems",
      title: "Safety & Security of Agentic Systems",
      order: 5,
      topics: [
        {
          id: "cs3227-m5-t1",
          title: "Prompt injection and tool-use risks",
          subtopics: ["Supply-chain risks", "Indirect injection"],
        },
        {
          id: "cs3227-m5-t2",
          title: "Failure mode analysis for autonomous agents",
          subtopics: ["Cascading errors", "Irreversible actions"],
        },
      ],
      resources: [
        {
          id: "cs3227-m5-r1",
          title: "OWASP — LLM Prompt Injection",
          url: "https://owasp.org/www-community/attacks/PromptInjection",
          type: "docs",
        },
      ],
    },
    {
      id: "cs3227-m6",
      slug: "m6-human-ai-collaboration-practices",
      title: "Human–AI Collaboration Practices",
      order: 6,
      topics: [
        {
          id: "cs3227-m6-t1",
          title: "Pairing patterns, trust calibration, escalation design",
          subtopics: ["When to escalate to a human"],
        },
        {
          id: "cs3227-m6-t2",
          title: "Capabilities vs hype",
          subtopics: ["Critical evaluation of agentic AI claims"],
        },
      ],
      resources: [
        {
          id: "cs3227-m6-r1",
          title: "Human-AI collaboration design patterns (overview)",
          url: "https://pair.withgoogle.com/guidebook/",
          type: "docs",
        },
      ],
    },
  ],
  capstone:
    "Design and evaluate an agentic coding workflow for a real (small) codebase, including its guardrails.",
};
