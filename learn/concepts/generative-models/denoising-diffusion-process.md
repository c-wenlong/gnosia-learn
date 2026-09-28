---
id: denoising-diffusion-process
title: Forward and reverse diffusion (DDPM)
summary: A diffusion model fixes a forward process that adds a little Gaussian noise over $T$ steps until data becomes pure noise, then learns the reverse, removing noise one step at a time. In DDPM the network predicts the added noise, trained with a squared-error loss derived from a variational bound.
requires: []
assumes: [evidence-lower-bound]
tags: [generative-models]
sources: []
created: 2026-09-28T15:41:14.915Z
---

# Forward and reverse diffusion (DDPM)

A diffusion model fixes a forward process that adds a little Gaussian noise over $T$ steps until data becomes pure noise, then learns the reverse, removing noise one step at a time. In DDPM the network predicts the added noise, trained with a squared-error loss derived from a variational bound.

## Why it matters

GANs sample well but train unstably; VAEs and flows train stably but have trailed on image quality. Diffusion models (Ho et al. 2020, the course paper) train on a plain regression loss and sample well, at the cost of many sampling steps. In CP4283 this is the latest link in the chain of ideas.

## The idea

The forward process uses a schedule $\beta_1, \dots, \beta_T$:

$$q(x_t \mid x_{t-1}) = \mathcal{N}\big(\sqrt{1 - \beta_t}\, x_{t-1},\; \beta_t I\big).$$

Let $\alpha_t = 1 - \beta_t$ and $\bar\alpha_t = \prod_{s \le t} \alpha_s$. Gaussians compose, so any step can be reached from $x_0$ in one jump:

$$x_t = \sqrt{\bar\alpha_t}\, x_0 + \sqrt{1 - \bar\alpha_t}\, \epsilon, \qquad \epsilon \sim \mathcal{N}(0, I).$$

The reverse process is a learned Gaussian $p_\theta(x_{t-1} \mid x_t)$. DDPM fixes its variance and parameterises its mean through a network $\epsilon_\theta(x_t, t)$ that predicts $\epsilon$. The training objective is a variational bound on $\log p(x_0)$, the same idea as the [[evidence-lower-bound]] with $x_1, \dots, x_T$ as latents. Ho et al. found that dropping the bound's weighting gave better samples:

$$L_{\text{simple}} = \mathbb{E}_{t, x_0, \epsilon}\,\big\lVert \epsilon - \epsilon_\theta(\sqrt{\bar\alpha_t}\, x_0 + \sqrt{1 - \bar\alpha_t}\, \epsilon,\; t) \big\rVert^2.$$

Training picks a random $t$, noises $x_0$ in one jump, and regresses the noise, with no sequential simulation.

DDPM used $T = 1000$ with $\beta_t$ rising linearly from $10^{-4}$ to $0.02$. Nichol and Dhariwal (2021) proposed a cosine schedule for $\bar\alpha_t$ that destroys information more gradually; under the linear one the final steps are already near-pure noise and add little. Sampling starts from $x_T \sim \mathcal{N}(0, I)$ and runs the network $T$ times. DDIM is a later sampler that reuses the same trained network but runs deterministically in far fewer steps.

## Worked example

Take one pixel $x_0 = 0.8$ (pixels scaled to $[-1, 1]$) and a step with $\bar\alpha_t = 0.5$, reached around $t \approx 259$ under the linear schedule. Draw $\epsilon = -0.3$:

$$x_t = \sqrt{0.5}\,(0.8) + \sqrt{0.5}\,(-0.3) = 0.566 - 0.212 = 0.354.$$

The signal and noise coefficients are now equal. If the network predicts $\epsilon_\theta = -0.2$, the loss for this sample is $(-0.3 + 0.2)^2 = 0.01$. At $t = T$, $\bar\alpha_T \approx 4 \times 10^{-5}$, so almost nothing of $x_0$ remains.

## Failure modes

- **Thinking training is sequential.** The closed form lets each training example jump straight to a random $t$; only sampling walks through the steps.
- **Confusing $\beta_t$ with $\bar\alpha_t$.** $\beta_t$ is the noise added at one step; $1 - \bar\alpha_t$ is the total noise variance accumulated since $x_0$.
- **Expecting one-step generation.** Each network call removes a little noise; the original sampler takes all $T$ steps.

## Prerequisites

None beyond general background.

Useful background: [[evidence-lower-bound]].

## Checks

```check
q: With alphabar_t = 0.64, x_0 = 1.0 and sampled noise eps = 0.5, what is x_t?
a: x_t = sqrt(0.64) x 1.0 + sqrt(0.36) x 0.5 = 0.8 + 0.3 = 1.1.
why: Catches not knowing the closed-form forward jump, or using 1 - alphabar instead of its square root as the noise coefficient.
```

```check
q: Why can DDPM training sample a random timestep for each example instead of simulating the noising chain step by step?
a: Composing Gaussian noise steps gives a closed form, x_t = sqrt(alphabar_t) x_0 + sqrt(1 - alphabar_t) eps, so any x_t can be produced from x_0 in one jump and the network regresses the eps that was used.
why: Catches thinking diffusion training is as sequential as diffusion sampling.
```

```check
q: What does the DDPM network output, and what loss trains it?
a: It takes a noisy x_t and the timestep t and predicts the noise eps that was added; the simplified loss is the squared error between the true eps and the prediction, an unweighted version of a variational bound.
why: Catches believing the network directly outputs the clean image, or that the loss is adversarial.
```
