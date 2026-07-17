import type { Course } from "@/lib/types";

export const cp4285: Course = {
  id: "cp4285",
  slug: "cp4285",
  code: "CP4285",
  title: "Modern Recommendation Systems",
  credits: 4,
  prereq: "CS2109S (or equivalent) or instructor's approval",
  notes:
    "Classical methods through modern neural approaches, with a strong ethics thread.",
  inferred: false,
  tags: ["recommenders"],
  modules: [
    {
      id: "cp4285-m1",
      slug: "m1-classical-recommendation-foundations",
      title: "Classical Recommendation Foundations",
      order: 1,
      topics: [
        {
          id: "cp4285-m1-t1",
          title: "Collaborative filtering",
          subtopics: ["User-based", "Item-based"],
        },
        {
          id: "cp4285-m1-t2",
          title: "Matrix factorization and content-based filtering",
          subtopics: ["Latent factors", "Item features"],
        },
      ],
      resources: [
        {
          id: "cp4285-m1-r1",
          title: "Koren et al. — Matrix Factorization Techniques for Recommender Systems",
          url: "https://datajobs.com/data-science-repo/Recommender-Systems-[Netflix].pdf",
          type: "paper",
        },
      ],
    },
    {
      id: "cp4285-m2",
      slug: "m2-evaluation-methodology",
      title: "Evaluation Methodology",
      order: 2,
      topics: [
        {
          id: "cp4285-m2-t1",
          title: "Offline metrics",
          subtopics: ["Precision@k", "NDCG", "Recall"],
        },
        {
          id: "cp4285-m2-t2",
          title: "Online evaluation and cold-start",
          subtopics: ["A/B testing", "Cold-start problem"],
        },
      ],
      resources: [
        {
          id: "cp4285-m2-r1",
          title: "Microsoft Recommenders — Evaluation",
          url: "https://github.com/recommenders-team/recommenders",
          type: "docs",
        },
      ],
    },
    {
      id: "cp4285-m3",
      slug: "m3-neural-recommendation-architectures",
      title: "Neural Recommendation Architectures",
      order: 3,
      topics: [
        {
          id: "cp4285-m3-t1",
          title: "Embedding-based models and two-tower architectures",
          subtopics: ["User/item towers", "Retrieval"],
        },
        {
          id: "cp4285-m3-t2",
          title: "Sequence-aware recommendation",
          subtopics: ["Session-based models"],
        },
      ],
      resources: [
        {
          id: "cp4285-m3-r1",
          title: "YouTube DNN recommender (Covington et al.)",
          url: "https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/45530.pdf",
          type: "paper",
        },
      ],
    },
    {
      id: "cp4285-m4",
      slug: "m4-modern-deep-architectures",
      title: "Modern Deep Architectures",
      order: 4,
      topics: [
        {
          id: "cp4285-m4-t1",
          title: "Transformer-based recommenders",
          subtopics: ["Sequential transformers", "Attention over history"],
        },
        {
          id: "cp4285-m4-t2",
          title: "Graph-based recommendation",
          subtopics: ["User-item graphs", "GNN recommenders"],
        },
      ],
      resources: [
        {
          id: "cp4285-m4-r1",
          title: "Kang & McAuley — Self-Attentive Sequential Recommendation (SASRec)",
          url: "https://arxiv.org/abs/1808.09781",
          type: "paper",
        },
      ],
    },
    {
      id: "cp4285-m5",
      slug: "m5-societal-impact-responsible-deployment",
      title: "Societal Impact & Responsible Deployment",
      order: 5,
      topics: [
        {
          id: "cp4285-m5-t1",
          title: "Bias, fairness, exposure, and filter bubbles",
          subtopics: ["Exposure inequality", "Filter-bubble effects"],
        },
        {
          id: "cp4285-m5-t2",
          title: "Privacy and transparency",
          subtopics: ["User data minimization", "Explainability"],
        },
      ],
      resources: [
        {
          id: "cp4285-m5-r1",
          title: "ACM FAccT resources on recommendation fairness",
          url: "https://facctconference.org/",
          type: "docs",
        },
      ],
    },
    {
      id: "cp4285-m6",
      slug: "m6-systems-deployment-considerations",
      title: "Systems & Deployment Considerations",
      order: 6,
      topics: [
        {
          id: "cp4285-m6-t1",
          title: "Real-time serving constraints",
          subtopics: ["Latency budgets", "Caching"],
        },
        {
          id: "cp4285-m6-t2",
          title: "Scalability trade-offs",
          subtopics: ["Retrieval vs ranking stages"],
        },
      ],
      resources: [
        {
          id: "cp4285-m6-r1",
          title: "System design for recommenders (industry overview)",
          url: "https://engineering.atspotify.com/2021/12/recommendation-systems-at-spotify/",
          type: "docs",
        },
      ],
    },
  ],
  capstone:
    "Build and evaluate an end-to-end recommendation pipeline, including an explicit fairness/bias audit.",
};
