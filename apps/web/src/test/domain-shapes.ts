import type { GraphEdge } from "@/lib/concept-graph";
import type { DomainNode, DomainTopic } from "@/lib/domain-map";

/**
 * The shape of two of the owner's domains on `self_learn`, read on
 * 2026-10-05: the same concepts, topics and prerequisite edges, with the
 * slugs and titles replaced by `c01`, `t01` and so on, so a test lays out
 * the real structure without carrying the owner's notes. Algorithms is the
 * largest domain (56 concepts, 13 topics, 10 layers, one concept needed by
 * 30 others); HCI is the most crowded (14 concepts in one layer that nothing
 * else needs).
 */
const SHAPES = {
  algorithms: {
    topics: 13,
    /** Each concept's topic, concepts c01 onwards in slug order. */
    concepts: ["t04", "t04", "t02", "t02", "t02", "t13", "t01", "t01", "t05", "t02", "t09", "t01", "t07", "t02", "t12", "t05", "t06", "t06", "t06", "t10", "t08", "t10", "t10", "t11", "t08", "t08", "t01", "t01", "t09", "t05", "t05", "t02", "t03", "t03", "t09", "t09", "t11", "t11", "t04", "t10", "t13", "t02", "t11", "t05", "t12", "t07", "t07", "t08", "t03", "t03", "t07", "t06", "t03", "t08", "t01", "t09"],
    /** [prerequisite, dependant, kind] */
    edges: [
      ["c01", "c39", "assumes"],
      ["c02", "c01", "requires"],
      ["c02", "c39", "requires"],
      ["c03", "c04", "assumes"],
      ["c05", "c04", "assumes"],
      ["c07", "c02", "assumes"],
      ["c07", "c08", "assumes"],
      ["c07", "c10", "requires"],
      ["c07", "c12", "requires"],
      ["c07", "c27", "requires"],
      ["c07", "c42", "requires"],
      ["c07", "c53", "assumes"],
      ["c07", "c55", "requires"],
      ["c08", "c10", "requires"],
      ["c08", "c13", "requires"],
      ["c08", "c27", "assumes"],
      ["c08", "c42", "requires"],
      ["c08", "c55", "requires"],
      ["c10", "c02", "assumes"],
      ["c10", "c04", "requires"],
      ["c10", "c05", "requires"],
      ["c10", "c42", "assumes"],
      ["c10", "c49", "assumes"],
      ["c12", "c03", "assumes"],
      ["c12", "c28", "assumes"],
      ["c12", "c33", "requires"],
      ["c12", "c42", "assumes"],
      ["c12", "c50", "assumes"],
      ["c14", "c02", "assumes"],
      ["c14", "c04", "requires"],
      ["c14", "c05", "assumes"],
      ["c14", "c49", "assumes"],
      ["c14", "c50", "assumes"],
      ["c17", "c18", "requires"],
      ["c17", "c47", "requires"],
      ["c17", "c52", "requires"],
      ["c18", "c19", "requires"],
      ["c21", "c25", "requires"],
      ["c21", "c54", "requires"],
      ["c22", "c20", "requires"],
      ["c22", "c23", "requires"],
      ["c22", "c41", "requires"],
      ["c26", "c48", "requires"],
      ["c27", "c12", "assumes"],
      ["c28", "c04", "assumes"],
      ["c30", "c16", "requires"],
      ["c30", "c31", "requires"],
      ["c32", "c02", "requires"],
      ["c32", "c03", "requires"],
      ["c32", "c07", "assumes"],
      ["c32", "c10", "requires"],
      ["c32", "c14", "requires"],
      ["c32", "c49", "requires"],
      ["c33", "c04", "requires"],
      ["c33", "c34", "requires"],
      ["c33", "c52", "requires"],
      ["c34", "c04", "assumes"],
      ["c35", "c36", "requires"],
      ["c36", "c06", "requires"],
      ["c36", "c11", "requires"],
      ["c36", "c22", "requires"],
      ["c36", "c29", "requires"],
      ["c36", "c56", "requires"],
      ["c37", "c43", "requires"],
      ["c38", "c37", "requires"],
      ["c39", "c04", "requires"],
      ["c40", "c23", "requires"],
      ["c42", "c04", "assumes"],
      ["c44", "c09", "requires"],
      ["c47", "c45", "requires"],
      ["c47", "c46", "requires"],
      ["c47", "c48", "requires"],
      ["c48", "c25", "requires"],
      ["c49", "c17", "requires"],
      ["c49", "c33", "requires"],
      ["c49", "c50", "requires"],
      ["c49", "c53", "requires"],
      ["c50", "c33", "assumes"],
      ["c50", "c34", "assumes"],
      ["c50", "c53", "assumes"],
      ["c51", "c15", "requires"],
      ["c53", "c04", "requires"],
      ["c53", "c34", "assumes"],
      ["c55", "c03", "requires"],
      ["c55", "c10", "assumes"],
      ["c55", "c12", "assumes"],
      ["c55", "c28", "requires"],
      ["c56", "c24", "requires"],
    ],
  },
  hci: {
    topics: 9,
    /** Each concept's topic, concepts c01 onwards in slug order. */
    concepts: ["t04", "t01", "t04", "t06", "t02", "t09", "t06", "t07", "t03", "t04", "t03", "t01", "t04", "t02", "t01", "t03", "t07", "t07", "t05", "t01", "t08", "t02", "t06", "t03", "t01", "t05", "t02", "t09", "t04", "t07", "t03", "t05", "t03", "t02", "t08", "t05"],
    /** [prerequisite, dependant, kind] */
    edges: [
      ["c01", "c03", "assumes"],
      ["c05", "c14", "assumes"],
      ["c05", "c22", "assumes"],
      ["c11", "c08", "assumes"],
      ["c12", "c02", "assumes"],
      ["c13", "c33", "assumes"],
      ["c15", "c24", "assumes"],
      ["c15", "c27", "assumes"],
      ["c17", "c18", "requires"],
      ["c17", "c28", "assumes"],
      ["c18", "c08", "requires"],
      ["c20", "c02", "assumes"],
      ["c20", "c16", "assumes"],
      ["c22", "c34", "assumes"],
      ["c25", "c09", "assumes"],
      ["c25", "c13", "assumes"],
      ["c29", "c04", "assumes"],
      ["c29", "c10", "requires"],
      ["c30", "c06", "assumes"],
      ["c30", "c21", "assumes"],
      ["c30", "c35", "assumes"],
      ["c31", "c07", "assumes"],
      ["c33", "c06", "assumes"],
      ["c35", "c21", "assumes"],
      ["c36", "c19", "assumes"],
      ["c36", "c26", "assumes"],
      ["c36", "c32", "assumes"],
    ],
  },
} as const;

export type ShapeName = keyof typeof SHAPES;

/** One shape as the domain map reads it: every concept in `domain`, under topics `t01` onwards. */
export function domainShape(name: ShapeName): { nodes: DomainNode[]; edges: GraphEdge[]; topics: DomainTopic[]; domain: string } {
  const shape = SHAPES[name];
  const domain = name;
  const topics: DomainTopic[] = Array.from({ length: shape.topics }, (_, i) => {
    const slug = `t${String(i + 1).padStart(2, "0")}`;
    return { slug, title: `Topic ${slug}`, domain };
  });
  const nodes: DomainNode[] = shape.concepts.map((topic, i) => {
    const id = `c${String(i + 1).padStart(2, "0")}`;
    return { id, title: `Concept ${id}`, bucket: "untouched", pL: 0, courses: [], domain: null, topic };
  });
  const edges: GraphEdge[] = shape.edges.map(([from, to, kind]) => ({ from, to, kind }));
  return { nodes, edges, topics, domain };
}
