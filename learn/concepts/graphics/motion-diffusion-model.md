---
id: motion-diffusion-model
title: Diffusion models for motion generation
summary: A motion diffusion model generates a whole motion clip at once by starting from noise over every frame and denoising it step by step, usually conditioned on a text prompt. The Human Motion Diffusion Model (MDM, Tevet et al., ICLR 2023) does this with a transformer that predicts the clean motion at each step.
requires: [denoising-diffusion-process]
assumes: [neural-motion-prediction]
tags: [graphics]
sources: []
created: 2026-09-28T15:46:36.430Z
---

# Diffusion models for motion generation

A motion diffusion model generates a whole motion clip at once by starting from noise over every frame and denoising it step by step, usually conditioned on a text prompt. The Human Motion Diffusion Model (MDM, Tevet et al., ICLR 2023) does this with a transformer that predicts the clean motion at each step.

## Why it matters

Autoregressive predictors (see [[neural-motion-prediction]]) build motion frame by frame, so errors compound into drift or freezing, and they return one future. A diffusion model samples many plausible motions per prompt and generates the clip's end together with its beginning. In CP4281 module 4, MDM is the course resource for generative animation.

## The idea

The forward and reverse processes are the standard ones from [[denoising-diffusion-process]]; the data and the denoiser change.

**The sample is the whole clip.** $x_0$ is $N$ frames by the pose features per frame, and every step noises or denoises all frames together.

**Denoiser.** A transformer encoder reads the noisy frames plus one token combining the step $t$ and the condition, so every frame attends to every other.

**Predict the clean motion, not the noise.** MDM outputs $\hat{x}_0$ directly, so geometric losses can be applied to it beside the diffusion loss: joint positions (when predicting rotations), foot contact (planted feet must not move), and velocities.

**Text conditioning.** A frozen CLIP text encoder embeds the prompt. **Classifier-free guidance** drops the condition for 10% of training samples, then samples with $\hat{x}_0^{\,uncond} + s\,(\hat{x}_0^{\,cond} - \hat{x}_0^{\,uncond})$; larger $s$ follows the text more closely at some cost to diversity.

**Editing for free.** Fixing part of a clip and generating the rest needs no retraining: at every sampling step the known part of $\hat{x}_0$ is overwritten with the given motion, as in image inpainting.

## Worked example

In-betweening: an animator supplies the first 20 frames (standing) and last 20 frames (sitting) of a 120-frame clip, prompt "a person sits down on a chair".

Sampling starts from noise over all 120 frames. At each step the network predicts $\hat{x}_0$, frames 1 to 20 and 101 to 120 are replaced by the animator's, and the next step proceeds from that. Frames 21 to 100 end up joining the fixed ends smoothly, because attention saw both ends at every step. MDM uses 1000 diffusion steps, so this is about a thousand network passes; the authors report about a minute per sample.

## Failure modes

- **Foot sliding.** Planted feet drift; the contact loss reduces but does not remove it.
- **Physically implausible motion.** Nothing enforces physics, so bodies can float or penetrate the floor.
- **Slow sampling.** Many denoising passes make it far slower than an autoregressive model.
- **Confusing it with frame-by-frame generation.** The whole clip is denoised together, not one frame at a time.

## Prerequisites

- [[denoising-diffusion-process]]

Useful background: [[neural-motion-prediction]].

## Checks

```check
q: Why does MDM predict the clean motion x0 at each step rather than the added noise?
a: With a clean-motion prediction available at every step, the training can add geometric losses on it, such as joint positions, foot contact and velocities. Those losses are not meaningful on a noise prediction.
why: Catches assuming every diffusion model must predict the noise, and missing why the choice matters for motion.
```

```check
q: Why does denoising the whole clip at once avoid the drift of autoregressive motion predictors?
a: No generated frame is fed back as input to produce the next one, so there is no chain along which errors compound. Every denoising step refines all frames together, with attention across the whole clip.
why: Catches thinking motion diffusion generates frame by frame.
```

```check
q: How does MDM do in-betweening without being retrained for it?
a: At every sampling step it overwrites the known frames of its predicted clean motion with the given frames, and continues denoising. The model fills in the unknown frames to agree with the fixed ones, like image inpainting.
why: Catches believing editing tasks need a separately trained model.
```
