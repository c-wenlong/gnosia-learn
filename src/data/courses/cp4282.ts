import type { Course } from "@/lib/types";

export const cp4282: Course = {
  id: "cp4282",
  slug: "cp4282",
  code: "CP4282",
  title: "Gaussian Splatting",
  credits: 4,
  prereq: "120 units, CS3241, Linear Algebra, Calculus",
  notes:
    "Mathematical foundations through state-of-the-art 3D Gaussian Splatting research.",
  inferred: false,
  tags: ["graphics", "generative-models"],
  modules: [
    {
      id: "cp4282-m1",
      slug: "m1-math-rendering-foundations",
      title: "Math & Rendering Foundations",
      order: 1,
      topics: [
        {
          id: "cp4282-m1-t1",
          title: "3D Gaussian representations and covariance",
          subtopics: ["Anisotropic Gaussians", "Covariance matrices"],
        },
        {
          id: "cp4282-m1-t2",
          title: "Projective geometry and camera models",
          subtopics: ["Pinhole camera", "Projection"],
        },
        {
          id: "cp4282-m1-t3",
          title: "Rendering equation basics",
          subtopics: ["Rasterization vs ray tracing"],
        },
      ],
      resources: [
        {
          id: "cp4282-m1-r1",
          title: "Multiple View Geometry (Hartley & Zisserman) — overview",
          url: "https://www.robots.ox.ac.uk/~vgg/hzbook/",
          type: "book",
        },
      ],
    },
    {
      id: "cp4282-m2",
      slug: "m2-core-3d-gaussian-splatting",
      title: "Core 3D Gaussian Splatting",
      order: 2,
      topics: [
        {
          id: "cp4282-m2-t1",
          title: "Kerbl et al. (2023) 3DGS",
          subtopics: ["Optimization loop", "Adaptive densification"],
        },
        {
          id: "cp4282-m2-t2",
          title: "Tile-based differentiable rasterization",
          subtopics: ["Splat projection", "Alpha blending"],
        },
      ],
      resources: [
        {
          id: "cp4282-m2-r1",
          title: "Kerbl et al. — 3D Gaussian Splatting (SIGGRAPH 2023)",
          url: "https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/",
          type: "paper",
        },
      ],
    },
    {
      id: "cp4282-m3",
      slug: "m3-fast-rendering-compression",
      title: "Fast Rendering & Compression",
      order: 3,
      topics: [
        {
          id: "cp4282-m3-t1",
          title: "Acceleration structures for splat rendering",
          subtopics: ["Sorting and tiling", "Realtime viewers"],
        },
        {
          id: "cp4282-m3-t2",
          title: "Compression techniques for splat storage",
          subtopics: ["Parameter quantization", "Compact representations"],
        },
      ],
      resources: [
        {
          id: "cp4282-m3-r1",
          title: "Compressed 3DGS literature starting point",
          url: "https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/",
          type: "docs",
        },
      ],
    },
    {
      id: "cp4282-m4",
      slug: "m4-large-scale-scenes",
      title: "Large-Scale Scenes",
      order: 4,
      topics: [
        {
          id: "cp4282-m4-t1",
          title: "Scaling to city / building-scale captures",
          subtopics: ["Partitioning", "Streaming"],
        },
        {
          id: "cp4282-m4-t2",
          title: "Level-of-detail strategies",
          subtopics: ["LOD hierarchies", "View-dependent detail"],
        },
      ],
      resources: [
        {
          id: "cp4282-m4-r1",
          title: "City-scale Gaussian splatting papers (arXiv search)",
          url: "https://arxiv.org/search/?query=large+scale+gaussian+splatting&searchtype=all",
          type: "paper",
        },
      ],
    },
    {
      id: "cp4282-m5",
      slug: "m5-dynamic-4d-splatting",
      title: "Dynamic (4D) Splatting",
      order: 5,
      topics: [
        {
          id: "cp4282-m5-t1",
          title: "Temporal Gaussian splatting",
          subtopics: ["Video / dynamic scenes"],
        },
        {
          id: "cp4282-m5-t2",
          title: "Deformation fields over time",
          subtopics: ["Canonical + deformation models"],
        },
      ],
      resources: [
        {
          id: "cp4282-m5-r1",
          title: "4D Gaussian Splatting literature hub",
          url: "https://arxiv.org/search/?query=4D+Gaussian+Splatting&searchtype=all",
          type: "paper",
        },
      ],
    },
    {
      id: "cp4282-m6",
      slug: "m6-2d-gaussian-variants",
      title: "2D Gaussian Variants",
      order: 6,
      topics: [
        {
          id: "cp4282-m6-t1",
          title: "2D Gaussian splatting for surface reconstruction",
          subtopics: ["Surface-aligned primitives"],
        },
        {
          id: "cp4282-m6-t2",
          title: "Trade-offs vs 3D splatting",
          subtopics: ["Geometry fidelity", "Rendering cost"],
        },
      ],
      resources: [
        {
          id: "cp4282-m6-r1",
          title: "2D Gaussian Splatting for Geometrically Accurate Radiance Fields",
          url: "https://surfsplatting.github.io/",
          type: "paper",
        },
      ],
    },
  ],
  capstone:
    "Implement a GS-based training/rendering pipeline and benchmark against baseline NeRF or mesh methods.",
};
