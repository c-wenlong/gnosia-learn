---
id: gan-training-stabilization
title: Stabilising GAN training
summary: "Each common GAN stabilisation method answers a specific failure of the original [[gan-minimax-game]]: vanishing gradients when real and fake distributions barely overlap, an uncontrolled discriminator, architectures that diverge, and players learning at mismatched speeds."
requires: [gan-minimax-game]
tags: [generative-models]
sources: []
created: 2026-09-28T15:40:58.740Z
---

# Stabilising GAN training

Each common GAN stabilisation method answers a specific failure of the original [[gan-minimax-game]]: vanishing gradients when real and fake distributions barely overlap, an uncontrolled discriminator, architectures that diverge, and players learning at mismatched speeds.

## Why it matters

The original objective is correct at its optimum but hard to reach. In CP4283 this completes the GAN module: matching each fix to the failure it answers, so a failed run can be diagnosed.

## The idea

Real images lie near a low-dimensional manifold, and early samples on another. When the supports barely overlap, a discriminator separates them almost perfectly, JS sits near its maximum $\log 2$, and the generator's gradient nearly vanishes.

WGAN (Arjovsky et al. 2017) uses the Earth-mover (Wasserstein-1) distance instead: the least mass-times-distance needed to move one distribution onto the other. By duality,

$$W(p_{\text{data}}, p_g) = \sup_{\|f\|_L \le 1} \mathbb{E}_{p_{\text{data}}}[f(x)] - \mathbb{E}_{p_g}[f(x)],$$

so the discriminator becomes a 1-Lipschitz critic $f$ with no sigmoid. The distance shrinks smoothly as $p_g$ approaches the data, even with no overlap.

| Failure | Fix |
| --- | --- |
| Critic must stay Lipschitz | WGAN clips weights to a small box, which limits capacity |
| Clipping hurts the critic | WGAN-GP (Gulrajani et al. 2017) penalises $(\lVert \nabla_{\hat x} f(\hat x) \rVert_2 - 1)^2$ at points between real and fake samples |
| Discriminator's Lipschitz constant uncontrolled | Spectral normalisation (Miyato et al. 2018) divides each weight matrix by its largest singular value |
| Deep conv GANs diverge | DCGAN guidelines: strided convolutions instead of pooling, batch norm, no fully connected hidden layers |
| High resolutions unstable | Progressive growing: train at low resolution, then add layers |
| One player outpaces the other | Two time-scale update rule (TTUR): separate learning rates for $D$ and $G$ |
| Overconfident discriminator | One-sided label smoothing: real targets 0.9, fake targets stay 0 |
| Entangled latent space | StyleGAN (Karras et al. 2019): a mapping network turns $z$ into $w$, which sets a style for each synthesis layer |

## Worked example

Let real data be uniform on the vertical segment $\{0\} \times [0, 1]$ and generated data the same segment shifted to $\{\theta\} \times [0, 1]$.

- For any $\theta \ne 0$ the supports are disjoint, so $\mathrm{JS} = \log 2$ whether $\theta = 5$ or $0.01$: zero gradient.
- The Wasserstein distance is $|\theta|$ (shift every point sideways), so descending it always moves $\theta$ toward 0.

This example is from the WGAN paper.

## Failure modes

- **Smoothing the fake labels too.** This puts $p_g$ into the numerator of the optimal discriminator, so fakes far from any data still score well.
- **Reading the clipped critic's value as the true distance.** A clipped critic is $K$-Lipschitz for some unknown $K$, so it tracks $W$ only up to scale.
- **Treating fixes as independent.** Batch norm couples samples, which breaks the per-sample gradient penalty, so WGAN-GP drops it from the critic.

## Prerequisites

- [[gan-minimax-game]]

## Checks

```check
q: Why can a standard GAN generator get almost no gradient when its samples are far from the real data?
a: When the real and generated distributions barely overlap, the discriminator separates them almost perfectly and the JS divergence sits near its constant maximum log 2, so small moves of the generator barely change the loss and its gradient nearly vanishes.
why: Catches thinking a stronger discriminator always gives the generator a more useful signal.
```

```check
q: Real data sits on the segment at x = 0 and generated data on the same segment shifted to x = 0.5. What are the JS divergence and the Wasserstein-1 distance, and which gives a useful gradient?
a: JS is log 2, the same as for any nonzero shift, so it gives no gradient; the Wasserstein distance is 0.5 and falls smoothly as the shift shrinks, so it does.
why: Catches not seeing why the Earth-mover distance was chosen over JS for non-overlapping supports.
```

```check
q: Why does WGAN-GP replace weight clipping, and what does its penalty enforce?
a: Clipping weights to a small box crudely enforces the Lipschitz constraint and limits the critic's capacity. WGAN-GP instead penalises the squared difference between the critic's gradient norm and 1 at points interpolated between real and fake samples, softly enforcing 1-Lipschitz behaviour where it matters.
why: Catches not knowing what constraint the gradient penalty is standing in for.
```
