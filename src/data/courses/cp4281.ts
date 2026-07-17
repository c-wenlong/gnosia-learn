import type { Course } from "@/lib/types";

export const cp4281: Course = {
  id: "cp4281",
  slug: "cp4281",
  code: "CP4281",
  title: "AI for Graphics",
  credits: 4,
  prereq: "CS3241 (Computer Graphics), Linear Algebra, Calculus",
  notes: "Revisits core graphics problems through modern AI methods.",
  inferred: false,
  tags: ["graphics", "generative-models"],
  modules: [
    {
      id: "cp4281-m1",
      slug: "m1-graphics-foundations-refresher",
      title: "Graphics Foundations Refresher",
      order: 1,
      topics: [
        {
          id: "cp4281-m1-t1",
          title: "Rendering pipeline, transformations, shading",
          subtopics: ["Pipeline stages", "Transforms", "Shading models"],
        },
        {
          id: "cp4281-m1-t2",
          title: "Mesh representations and texture mapping",
          subtopics: ["Meshes", "UVs and texturing"],
        },
      ],
      resources: [
        {
          id: "cp4281-m1-r1",
          title: "LearnOpenGL — Getting Started",
          url: "https://learnopengl.com/",
          type: "docs",
        },
      ],
    },
    {
      id: "cp4281-m2",
      slug: "m2-neural-geometry-representations",
      title: "Neural Geometry Representations",
      order: 2,
      topics: [
        {
          id: "cp4281-m2-t1",
          title: "Implicit functions & signed distance fields",
          subtopics: ["SDFs", "Neural implicits"],
        },
        {
          id: "cp4281-m2-t2",
          title: "Neural radiance fields (NeRF) and follow-ups",
          subtopics: ["Volume rendering", "NeRF extensions"],
        },
      ],
      resources: [
        {
          id: "cp4281-m2-r1",
          title: "Mildenhall et al. — NeRF (ECCV 2020)",
          url: "https://www.matthewtancik.com/nerf",
          type: "paper",
        },
      ],
    },
    {
      id: "cp4281-m3",
      slug: "m3-ai-for-modeling-rigging",
      title: "AI for Modeling & Rigging",
      order: 3,
      topics: [
        {
          id: "cp4281-m3-t1",
          title: "Learned skinning and deformation",
          subtopics: ["Skinning models", "Neural deformation"],
        },
        {
          id: "cp4281-m3-t2",
          title: "Neural shape generation basics",
          subtopics: ["Shape priors", "Generation pipelines"],
        },
      ],
      resources: [
        {
          id: "cp4281-m3-r1",
          title: "Survey of neural shape representations",
          url: "https://arxiv.org/abs/2008.02757",
          type: "paper",
        },
      ],
    },
    {
      id: "cp4281-m4",
      slug: "m4-ai-for-animation",
      title: "AI for Animation",
      order: 4,
      topics: [
        {
          id: "cp4281-m4-t1",
          title: "Motion synthesis with neural nets",
          subtopics: ["Motion prediction", "Style transfer"],
        },
        {
          id: "cp4281-m4-t2",
          title: "Generative approaches to animation",
          subtopics: ["Diffusion-based motion"],
        },
      ],
      resources: [
        {
          id: "cp4281-m4-r1",
          title: "Human Motion Diffusion Model",
          url: "https://guytevet.github.io/mdm-page/",
          type: "paper",
        },
      ],
    },
    {
      id: "cp4281-m5",
      slug: "m5-ai-for-simulation",
      title: "AI for Simulation",
      order: 5,
      topics: [
        {
          id: "cp4281-m5-t1",
          title: "Physics-informed neural networks",
          subtopics: ["PINN formulation", "PDE residuals"],
        },
        {
          id: "cp4281-m5-t2",
          title: "Learned / differentiable simulators",
          subtopics: ["Differentiable physics", "Hybrid simulators"],
        },
      ],
      resources: [
        {
          id: "cp4281-m5-r1",
          title: "Raissi et al. — Physics-informed neural networks",
          url: "https://arxiv.org/abs/1711.10561",
          type: "paper",
        },
      ],
    },
    {
      id: "cp4281-m6",
      slug: "m6-ai-for-rendering",
      title: "AI for Rendering",
      order: 6,
      topics: [
        {
          id: "cp4281-m6-t1",
          title: "Differentiable rendering",
          subtopics: ["Gradient through rendering", "Inverse graphics"],
        },
        {
          id: "cp4281-m6-t2",
          title: "Neural / hybrid rendering pipelines",
          subtopics: ["Neural caches", "Hybrid classical + learned pipelines"],
        },
      ],
      resources: [
        {
          id: "cp4281-m6-r1",
          title: "Differentiable Rendering survey / Mitsuba 3",
          url: "https://www.mitsuba-renderer.org/",
          type: "docs",
        },
      ],
    },
  ],
  capstone:
    "Reproduce the core result of one modern AI-graphics paper on a small scale.",
};
