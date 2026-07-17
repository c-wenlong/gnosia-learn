import type { Course } from "@/lib/types";

export const cp4284: Course = {
  id: "cp4284",
  slug: "cp4284",
  code: "CP4284",
  title: "LLM Reasoning Agents",
  credits: 4,
  prereq: "120 units only",
  notes:
    "Strongest overlap with agent internals, tool use, and transformer architecture.",
  inferred: false,
  tags: ["agentic-ai", "transformers"],
  modules: [
    {
      id: "cp4284-m1",
      slug: "m1-llm-foundations-recap",
      title: "LLM Foundations Recap",
      order: 1,
      topics: [
        {
          id: "cp4284-m1-t1",
          title: "Transformer architecture and tokenization",
          subtopics: ["Self-attention", "Tokenization pipelines"],
        },
        {
          id: "cp4284-m1-t2",
          title: "Pretraining vs fine-tuning vs RLHF",
          subtopics: ["Contextual refresher on training stages"],
        },
      ],
      resources: [
        {
          id: "cp4284-m1-r1",
          title: "The Illustrated Transformer",
          url: "https://jalammar.github.io/illustrated-transformer/",
          type: "docs",
        },
        {
          id: "cp4284-m1-r2",
          title: "Vaswani et al. — Attention Is All You Need",
          url: "https://arxiv.org/abs/1706.03762",
          type: "paper",
        },
      ],
    },
    {
      id: "cp4284-m2",
      slug: "m2-chain-of-thought-prompting",
      title: "Chain-of-Thought & Prompting",
      order: 2,
      topics: [
        {
          id: "cp4284-m2-t1",
          title: "CoT prompting and few-shot vs zero-shot reasoning",
          subtopics: ["Prompt formats", "Reasoning traces"],
        },
        {
          id: "cp4284-m2-t2",
          title: "Self-consistency and prompt decomposition",
          subtopics: ["Sample-and-vote", "Breaking down hard tasks"],
        },
      ],
      resources: [
        {
          id: "cp4284-m2-r1",
          title: "Wei et al. — Chain-of-Thought Prompting",
          url: "https://arxiv.org/abs/2201.11903",
          type: "paper",
        },
        {
          id: "cp4284-m2-r2",
          title: "Wang et al. — Self-Consistency Improves CoT",
          url: "https://arxiv.org/abs/2203.11171",
          type: "paper",
        },
      ],
    },
    {
      id: "cp4284-m3",
      slug: "m3-agentic-frameworks",
      title: "Agentic Frameworks",
      order: 3,
      topics: [
        {
          id: "cp4284-m3-t1",
          title: "ReAct-style reasoning + acting loops",
          subtopics: ["Interleaved thought and tool calls"],
        },
        {
          id: "cp4284-m3-t2",
          title: "Tool use / function calling and multi-step decomposition",
          subtopics: ["Tool schemas", "Task graphs"],
        },
        {
          id: "cp4284-m3-t3",
          title: "Agent memory and state management",
          subtopics: ["Short-term context", "Long-term memory stores"],
        },
      ],
      resources: [
        {
          id: "cp4284-m3-r1",
          title: "Yao et al. — ReAct",
          url: "https://arxiv.org/abs/2210.03629",
          type: "paper",
        },
        {
          id: "cp4284-m3-r2",
          title: "OpenAI — Function calling guide",
          url: "https://platform.openai.com/docs/guides/function-calling",
          type: "docs",
        },
      ],
    },
    {
      id: "cp4284-m4",
      slug: "m4-thinking-model-paradigms",
      title: "Thinking-Model Paradigms",
      order: 4,
      topics: [
        {
          id: "cp4284-m4-t1",
          title: "Test-time compute scaling and self-reflection",
          subtopics: ["Self-critique loops", "Search over thoughts"],
        },
        {
          id: "cp4284-m4-t2",
          title: "Verifier models and reward modeling for reasoning",
          subtopics: ["Process vs outcome rewards"],
        },
      ],
      resources: [
        {
          id: "cp4284-m4-r1",
          title: "OpenAI o1 system card (reasoning models)",
          url: "https://openai.com/index/openai-o1-system-card/",
          type: "docs",
        },
      ],
    },
    {
      id: "cp4284-m5",
      slug: "m5-ai-assisted-code-generation",
      title: "AI-Assisted Code Generation & Synthesis",
      order: 5,
      topics: [
        {
          id: "cp4284-m5-t1",
          title: "Code generation architectures",
          subtopics: ["Execution-guided synthesis"],
        },
        {
          id: "cp4284-m5-t2",
          title: "Agent-driven coding workflows",
          subtopics: ["Diff application", "Tool orchestration"],
        },
      ],
      resources: [
        {
          id: "cp4284-m5-r1",
          title: "Chen et al. — Evaluating Large Language Models Trained on Code",
          url: "https://arxiv.org/abs/2107.03374",
          type: "paper",
        },
      ],
    },
    {
      id: "cp4284-m6",
      slug: "m6-distributed-training-inference",
      title: "Distributed Training & Inference",
      order: 6,
      topics: [
        {
          id: "cp4284-m6-t1",
          title: "Scalable inference strategies",
          subtopics: ["Batching", "Speculative decoding"],
        },
        {
          id: "cp4284-m6-t2",
          title: "Distributed training basics for large reasoning models",
          subtopics: ["Data/model parallelism overview"],
        },
      ],
      resources: [
        {
          id: "cp4284-m6-r1",
          title: "vLLM documentation",
          url: "https://docs.vllm.ai/",
          type: "docs",
        },
      ],
    },
  ],
  capstone:
    "Build a small tool-using reasoning agent end-to-end (plan → act → reflect loop).",
};
