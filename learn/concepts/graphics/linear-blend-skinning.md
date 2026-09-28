---
id: linear-blend-skinning
title: Linear blend skinning
summary: Linear blend skinning deforms a character mesh by attaching each vertex to a few skeleton joints with weights that sum to one, moving the vertex rigidly with each of those joints, and taking the weighted average of the results.
requires: []
assumes: [triangle-mesh-representation]
tags: [graphics]
sources: []
created: 2026-09-28T15:46:20.237Z
---

# Linear blend skinning

Linear blend skinning deforms a character mesh by attaching each vertex to a few skeleton joints with weights that sum to one, moving the vertex rigidly with each of those joints, and taking the weighted average of the results.

## Why it matters

It is the standard way to pose game characters: animators move a few dozen joints and thousands of vertices follow, cheaply enough for the GPU. Its artefacts at elbows and wrists are well known. In CP4281 module 3 it is the baseline that learned skinning weights and corrective deformations improve on.

## The idea

**Rigging** places a skeleton inside the [[triangle-mesh-representation]] in a **rest pose** and gives each vertex $v$ weights $w_j \ge 0$ with $\sum_j w_j = 1$; most are zero.

For a new pose, joint $j$ has a $4 \times 4$ transform $T_j$ carrying rest-pose points to posed ones (the posed joint transform times the inverse of its rest transform). Then

$$v' = \sum_j w_j\, T_j\, v.$$

The catch: a weighted average of rotation matrices is generally not a rotation, and can shrink and shear. Where neighbouring joints rotate differently, the limb loses volume.

**Classical fix.** Dual quaternion skinning (Kavan et al. 2007) blends rigid motions as dual quaternions and renormalises, so the result stays rigid. It removes collapse but can bulge at bent joints.

**Learned fixes.** Networks can predict skinning weights from mesh geometry, replacing hand weighting. SMPL (Loper et al. 2015) learns from registered body scans a template, shape blend shapes, skinning weights, and pose-dependent corrective offsets added *before* skinning, which restore the volume LBS loses. Later work has networks predict deformations or correctives from the pose.

## Worked example

Elbow joint at the origin, arm along the $x$ axis. A vertex on top of the elbow sits at $v = (0, 0.1, 0)$ with weights $0.5$ (upper arm) and $0.5$ (forearm).

Bend the forearm $90^\circ$ about $z$. The upper arm leaves $v$ at $(0, 0.1, 0)$; the forearm carries it to $(-0.1, 0, 0)$. The blend $(-0.05, 0.05, 0)$ is $0.071$ from the joint instead of $0.1$: the elbow thins by $29\%$ (a factor $\cos 45^\circ$).

Instead twist the forearm $180^\circ$ about the arm's axis ($x$). It carries $v$ to $(0, -0.1, 0)$ and the blend is $(0, 0, 0)$: the skin collapses onto the bone, the **candy-wrapper** artefact.

## Failure modes

- **Volume loss at bends.** Averaged rotations shrink toward the joint.
- **Candy-wrapper collapse.** Twists near $180^\circ$ pinch the limb to a point.
- **Unnormalised weights.** If weights do not sum to one, the rest pose (every $T_j$ the identity) no longer returns $v$.
- **Assuming dual quaternions fix everything.** They still cannot model muscle bulges or skin sliding.

## Prerequisites

None beyond general background.

Useful background: [[triangle-mesh-representation]].

## Checks

```check
q: A vertex has weights 0.5 and 0.5 on two joints. One joint stays still and the other twists 180 degrees about the bone's axis. Where does linear blend skinning put the vertex, and why?
a: On the bone axis. One transform leaves the vertex where it is and the other moves it to the diametrically opposite point, so their average is the point on the axis between them. This is the candy-wrapper collapse.
why: Catches assuming a weighted average of rigid motions is itself a rigid motion.
```

```check
q: What do SMPL's pose-dependent blend shapes do, and when are they applied relative to skinning?
a: They are learned offsets to the template vertices that depend on the pose, applied before linear blend skinning. They put back shape that skinning alone gets wrong, such as volume at bent joints.
why: Catches thinking SMPL replaces linear blend skinning rather than correcting its input.
```

```check
q: What does dual quaternion skinning fix, and what does it not fix?
a: It blends rigid motions so the result stays rigid, which removes the collapse and candy-wrapper artefact. It can bulge near bent joints and still cannot model muscles or skin sliding.
why: Catches assuming the classical fix solves all skinning artefacts.
```
