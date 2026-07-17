import type { Course } from "@/lib/types";

export const cs4263: Course = {
  id: "cs4263",
  slug: "cs4263",
  code: "CS4263",
  title: "Artificial Intelligence Principles",
  credits: 4,
  track: "AI focus area, project-heavy",
  notes:
    "Core AI methodology with emphasis on design, integration, and independent inquiry.",
  inferred: true,
  tags: ["classical-ai"],
  modules: [
    {
      id: "cs4263-m1",
      slug: "m1-search-based-problem-solving",
      title: "Search-Based Problem Solving",
      order: 1,
      topics: [
        {
          id: "cs4263-m1-t1",
          title: "Problem formulation and state spaces",
          subtopics: ["States, actions, goals", "Formulating search problems"],
        },
        {
          id: "cs4263-m1-t2",
          title: "Uninformed search",
          subtopics: ["BFS", "DFS", "Uniform-cost search"],
        },
        {
          id: "cs4263-m1-t3",
          title: "Informed search",
          subtopics: ["A*", "Heuristic design", "Admissibility and consistency"],
        },
      ],
      resources: [
        {
          id: "cs4263-m1-r1",
          title: "AIMA — Artificial Intelligence: A Modern Approach",
          url: "https://aima.cs.berkeley.edu/",
          type: "book",
        },
        {
          id: "cs4263-m1-r2",
          title: "Red Blob Games — Introduction to A*",
          url: "https://www.redblobgames.com/pathfinding/a-star/introduction.html",
          type: "docs",
        },
      ],
    },
    {
      id: "cs4263-m2",
      slug: "m2-constraint-satisfaction",
      title: "Constraint Satisfaction",
      order: 2,
      topics: [
        {
          id: "cs4263-m2-t1",
          title: "CSP formulation and backtracking",
          subtopics: ["Variables, domains, constraints", "Backtracking search"],
        },
        {
          id: "cs4263-m2-t2",
          title: "Arc consistency and constraint propagation",
          subtopics: ["AC-3", "Forward checking"],
        },
        {
          id: "cs4263-m2-t3",
          title: "Local search methods",
          subtopics: ["Min-conflicts", "Simulated annealing"],
        },
      ],
      resources: [
        {
          id: "cs4263-m2-r1",
          title: "AIMA CSP chapter resources",
          url: "https://aima.cs.berkeley.edu/",
          type: "book",
        },
      ],
    },
    {
      id: "cs4263-m3",
      slug: "m3-adversarial-search",
      title: "Adversarial Search",
      order: 3,
      topics: [
        {
          id: "cs4263-m3-t1",
          title: "Minimax and alpha-beta pruning",
          subtopics: ["Game trees", "Optimal play assumptions", "Pruning"],
        },
        {
          id: "cs4263-m3-t2",
          title: "Evaluation functions",
          subtopics: ["Heuristic scoring of positions"],
        },
        {
          id: "cs4263-m3-t3",
          title: "Monte Carlo Tree Search",
          subtopics: ["Selection, expansion, simulation, backpropagation"],
        },
      ],
      resources: [
        {
          id: "cs4263-m3-r1",
          title: "Browne et al. — A Survey of Monte Carlo Tree Search Methods",
          url: "https://ieeexplore.ieee.org/document/6145622",
          type: "paper",
        },
      ],
    },
    {
      id: "cs4263-m4",
      slug: "m4-knowledge-representation-logical-reasoning",
      title: "Knowledge Representation & Logical Reasoning",
      order: 4,
      topics: [
        {
          id: "cs4263-m4-t1",
          title: "Propositional logic and inference",
          subtopics: ["Syntax and semantics", "Inference rules"],
        },
        {
          id: "cs4263-m4-t2",
          title: "First-order logic",
          subtopics: ["Unification", "Resolution"],
        },
        {
          id: "cs4263-m4-t3",
          title: "Limitations of logical representations",
          subtopics: ["Uncertainty", "Scale and brittleness"],
        },
      ],
      resources: [
        {
          id: "cs4263-m4-r1",
          title: "Stanford Encyclopedia — Classical Logic",
          url: "https://plato.stanford.edu/entries/logic-classical/",
          type: "docs",
        },
      ],
    },
    {
      id: "cs4263-m5",
      slug: "m5-automated-planning",
      title: "Automated Planning",
      order: 5,
      topics: [
        {
          id: "cs4263-m5-t1",
          title: "STRIPS-style planning and planning graphs",
          subtopics: ["Action schemas", "Graphplan ideas"],
        },
        {
          id: "cs4263-m5-t2",
          title: "PDDL basics",
          subtopics: ["Domains and problems", "Planner interfaces"],
        },
        {
          id: "cs4263-m5-t3",
          title: "Hierarchical / partial-order planning (survey)",
          subtopics: ["HTN overview", "Partial-order plans"],
        },
      ],
      resources: [
        {
          id: "cs4263-m5-r1",
          title: "PDDL — Planning Domain Definition Language",
          url: "https://planning.wiki/ref/pddl",
          type: "docs",
        },
      ],
    },
    {
      id: "cs4263-m6",
      slug: "m6-sequential-decision-making",
      title: "Sequential Decision-Making",
      order: 6,
      topics: [
        {
          id: "cs4263-m6-t1",
          title: "Markov Decision Processes",
          subtopics: ["Value iteration", "Policy iteration"],
        },
        {
          id: "cs4263-m6-t2",
          title: "Exploration vs. exploitation basics",
          subtopics: ["ε-greedy intuition", "Bandit-style trade-offs"],
        },
        {
          id: "cs4263-m6-t3",
          title: "Brief intro to POMDPs",
          subtopics: ["Belief states", "Why partial observability is hard"],
        },
      ],
      resources: [
        {
          id: "cs4263-m6-r1",
          title: "Sutton & Barto — Reinforcement Learning: An Introduction",
          url: "http://incompleteideas.net/book/the-book-2nd.html",
          type: "book",
        },
      ],
    },
    {
      id: "cs4263-m7",
      slug: "m7-responsible-ai-design",
      title: "Responsible AI Design",
      order: 7,
      topics: [
        {
          id: "cs4263-m7-t1",
          title: "Evaluating AI system behavior and failure modes",
          subtopics: ["Behavioral testing", "Common failure patterns"],
        },
        {
          id: "cs4263-m7-t2",
          title: "Bias, transparency, and open-ended problem framing",
          subtopics: ["Fairness considerations", "Specifying open problems carefully"],
        },
      ],
      resources: [
        {
          id: "cs4263-m7-r1",
          title: "Google — Responsible AI Practices",
          url: "https://ai.google/responsibility/responsible-ai-practices/",
          type: "docs",
        },
      ],
    },
  ],
  capstone:
    "Design, implement, and critically evaluate an AI agent on a chosen open-ended problem (own representation choices encouraged).",
};
