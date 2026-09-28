---
id: score-based-generative-modeling
title: Score-based generative modelling
summary: The score of a distribution is the gradient of its log-density, $\nabla_x \log p(x)$. A score-based model learns this vector field at many noise levels and generates by following it from noise to data; learning to denoise is learning the score, so DDPM and score models are two views of one method.
requires: [denoising-diffusion-process]
tags: [generative-models]
sources: []
created: 2026-09-28T15:41:20.305Z
---

# Score-based generative modelling

The score of a distribution is the gradient of its log-density, $\nabla_x \log p(x)$. A score-based model learns this vector field at many noise levels and generates by following it from noise to data; learning to denoise is learning the score, so DDPM and score models are two views of one method.

## Why it matters

The score ignores $p$'s normalising constant, whose gradient is zero, so it sidesteps the hardest part of density modelling. It also explains what a [[denoising-diffusion-process]] network learns. In CP4283 it connects diffusion to the image generators in use today.

## The idea

Langevin dynamics draws samples using only the score:

$$x_{k+1} = x_k + \tfrac{\eta}{2}\, \nabla_x \log p(x_k) + \sqrt{\eta}\, z_k, \qquad z_k \sim \mathcal{N}(0, I).$$

Denoising score matching (Vincent 2011) gives a way to learn it. Add noise, $\tilde x = x + \sigma \epsilon$; the score of $q(\tilde x \mid x)$ is $-(\tilde x - x)/\sigma^2 = -\epsilon/\sigma$. Regressing a network onto that target learns, in expectation, the score of the noised data distribution. For DDPM the same algebra gives

$$\nabla_{x_t} \log q(x_t) \approx -\frac{\epsilon_\theta(x_t, t)}{\sqrt{1 - \bar\alpha_t}},$$

so predicting the noise is predicting the score up to that scale.

Real data concentrates near low-dimensional sets, so the score is poorly defined off them and poorly estimated in low-density regions. Song and Ermon (2019) trained one network across many noise levels: large noise fills space so the score is learnable everywhere, and sampling anneals down to small noise. Song et al. (2021) took the continuous limit: a stochastic differential equation noises the data, its reverse-time SDE generates, and DDPM and the multi-level score model are special cases. A deterministic probability-flow ODE gives the same marginals and exact likelihoods.

Two later steps lead to modern generators. Classifier-free guidance (Ho and Salimans 2022) trains one model with and without the condition $c$ and samples with $\tilde\epsilon = (1 + w)\,\epsilon_\theta(x, c) - w\,\epsilon_\theta(x)$, trading diversity for fidelity. Latent diffusion (Rombach et al. 2022), the basis of Stable Diffusion, runs diffusion in a pretrained autoencoder's smaller latent space.

## Worked example

Let the data be a single point $x_0 = 2$ and take $\bar\alpha_t = 0.64$. Then $x_t \sim \mathcal{N}(0.8 \times 2,\; 0.36) = \mathcal{N}(1.6, 0.36)$, whose score is $-(x - 1.6)/0.36$.

At $x_t = 1.0$ the score is $0.6/0.36 = 1.667$, pointing towards the data. The noise that produced this point is $\epsilon = (1.0 - 1.6)/0.6 = -1$, and $-\epsilon/\sqrt{1 - \bar\alpha_t} = 1/0.6 = 1.667$: the same number.

One Langevin step with $\eta = 0.1$ gives $1.0 + 0.05 \times 1.667 = 1.083$ plus noise of standard deviation $0.316$.

## Failure modes

- **Sign errors.** The score points toward higher density, so it is minus the scaled noise.
- **One noise level only.** A score learned at small noise is unreliable far from the data, where sampling starts.
- **Guidance as free quality.** Large $w$ improves fidelity but reduces diversity and can oversaturate images.

## Prerequisites

- [[denoising-diffusion-process]]

## Checks

```check
q: Why does a score-based model not need the normalising constant of the density?
a: The score is the gradient of log p with respect to x, and log p = log(unnormalised density) - log Z where Z does not depend on x, so its gradient is zero and drops out.
why: Catches thinking a model of the score still has to solve the normalisation problem of explicit density models.
```

```check
q: A DDPM network predicts eps = 0.6 at a step with alphabar_t = 0.75. What score estimate does that imply?
a: The score is about -eps / sqrt(1 - alphabar_t) = -0.6 / 0.5 = -1.2.
why: Catches not knowing that noise prediction and score estimation differ only by a negative scale factor.
```

```check
q: Why do score-based models train on many noise levels rather than one small one?
a: With little noise, data concentrates near low-dimensional sets, so the learned score is inaccurate in the low-density regions where sampling starts. Large noise spreads data over the whole space so the score is learnable everywhere, and sampling anneals from large noise to small.
why: Catches assuming the score learned at one noise level is reliable everywhere in the space.
```
