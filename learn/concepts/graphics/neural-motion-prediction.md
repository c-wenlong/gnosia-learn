---
id: neural-motion-prediction
title: Neural motion prediction
summary: Neural motion prediction treats character motion as a time series of skeleton poses and trains a sequence model to predict the next poses from the recent past, feeding its own predictions back in to roll a motion forward.
requires: []
assumes: [linear-blend-skinning]
tags: [graphics]
sources: []
created: 2026-09-28T15:46:31.085Z
---

# Neural motion prediction

Neural motion prediction treats character motion as a time series of skeleton poses and trains a sequence model to predict the next poses from the recent past, feeding its own predictions back in to roll a motion forward.

## Why it matters

A skeleton pose drives a skinned mesh (see [[linear-blend-skinning]]), so predicting poses animates a character, and motion capture supplies training data. In CP4281 module 4 this is the first step from hand-keyed to learned motion, and its weaknesses motivate the diffusion approach that follows.

## The idea

A frame is a pose: one rotation per joint plus the root's position and heading. The model sees $x_1, \dots, x_t$ and predicts $x_{t+1}$; for longer horizons it appends its prediction and repeats (**autoregressive rollout**).

Early models were recurrent. Martinez et al. (2017) used a sequence-to-sequence RNN predicting the change from the previous pose, and showed that a **zero-velocity baseline**, repeating the last observed pose, beat the published methods of the time on short-term error. Transformers are now common too.

**Rotation representation.** Euler angles jump (from $179^\circ$ to $-179^\circ$) and suffer gimbal lock; $q$ and $-q$ are the same quaternion rotation. Zhou et al. (2019) showed every representation of 3D rotations in four or fewer dimensions is discontinuous, which hurts regression, and proposed a continuous **6D** one: two columns of the rotation matrix, completed by Gram-Schmidt.

**Style transfer**, the unit's other subtopic, separates what a motion does (content, such as walking) from how (style, such as tired), so a style can be applied to new content.

## Worked example

A toy model of one joint angle: the true motion holds constant, $x_{t+1} = x_t$, but the learned model is slightly off, $\hat{x}_{t+1} = a\,\hat{x}_t$. Roll it out from $x_0 = 30^\circ$ for 50 frames (two seconds at 25 frames per second).

- With $a = 1.02$: $30 \times 1.02^{50} \approx 30 \times 2.69 = 81^\circ$. A 2% per-step error has become a 170% error: **drift**.
- With $a = 0.98$: $30 \times 0.98^{50} \approx 30 \times 0.36 = 11^\circ$. The joint sinks toward zero, which plays the role of the mean pose: **freezing**.

One-step error was 2% in both cases; the rollout compounds it because each prediction becomes the next input. Real models also freeze because, under uncertainty, an L2 loss is minimised by the average of possible futures, which tends toward a static mean pose.

## Failure modes

- **Drift and freezing.** Errors compound; training on the model's own predictions reduces the train and test mismatch.
- **Discontinuous rotations.** Euler angles or quaternions give flips near discontinuities.
- **Short-term metrics.** A model that barely moves can score well on short horizons, so beating zero velocity is the minimum bar.
- **One future.** A deterministic model gives one answer to a multi-modal future.

## Prerequisites

None beyond general background.

Useful background: [[linear-blend-skinning]].

## Checks

```check
q: A motion predictor has 2 percent error per frame. Why can its error after 50 autoregressive frames be far larger than 2 percent?
a: Each prediction is fed back as the next input, so errors compound multiplicatively rather than staying per step. For example 1.02 to the power 50 is about 2.7, so the output drifts or, with the opposite bias, collapses toward a mean pose.
why: Catches judging a rollout model by its one-step error.
```

```check
q: What is the zero-velocity baseline in motion prediction and why does it matter?
a: It predicts that the last observed pose simply stays the same for all future frames. It scored better than published neural methods on short-term error, so any model has to beat it before its predictions count as useful.
why: Catches assuming a trained network automatically beats a trivial baseline.
```

```check
q: Why is the 6D rotation representation preferred over Euler angles or quaternions as a network output?
a: Every representation of 3D rotations in four or fewer dimensions has discontinuities, such as Euler angle wrap-around and the q and minus q ambiguity of quaternions, which a network regresses badly. The 6D form (two columns of the rotation matrix, completed by Gram-Schmidt) is continuous.
why: Catches thinking quaternions are free of representation problems because they avoid gimbal lock.
```
