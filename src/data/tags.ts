import type { TagMeta } from "@/lib/types";

export const TAGS: TagMeta[] = [
  {
    id: "hci",
    label: "HCI",
    description: "Human–computer interaction and interface design",
  },
  {
    id: "agentic-ai",
    label: "Agentic AI",
    description: "Tool-using agents, orchestration, and agentic workflows",
  },
  {
    id: "transformers",
    label: "Transformers",
    description: "Attention architectures and transformer-based generation",
  },
  {
    id: "generative-models",
    label: "Generative Models",
    description: "VAEs, GANs, diffusion, neural graphics generation",
  },
  {
    id: "graphics",
    label: "Graphics",
    description: "Rendering, geometry, and 3D scene representation",
  },
  {
    id: "classical-ai",
    label: "Classical AI",
    description: "Search, planning, logic, and sequential decisions",
  },
  {
    id: "recommenders",
    label: "Recommenders",
    description: "Recommendation systems and personalization",
  },
  {
    id: "product",
    label: "Product",
    description: "Product thinking, shipping, and digital markets",
  },
];

export function getTag(id: string): TagMeta | undefined {
  return TAGS.find((t) => t.id === id);
}
