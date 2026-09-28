---
id: gan-minimax-game
title: The GAN minimax game
summary: A generative adversarial network trains a generator $G$, which turns noise $z$ into samples, against a discriminator $D$, which scores how likely a sample is to be real. With an optimal discriminator the generator minimises a Jensen-Shannon divergence, so the equilibrium is $p_g = p_{\text{data}}$; in practice alternating gradient steps can oscillate or collapse.
requires: []
tags: [generative-models]
sources: []
created: 2026-09-28T15:40:53.336Z
---

# The GAN minimax game

A generative adversarial network trains a generator $G$, which turns noise $z$ into samples, against a discriminator $D$, which scores how likely a sample is to be real. With an optimal discriminator the generator minimises a Jensen-Shannon divergence, so the equilibrium is $p_g = p_{\text{data}}$; in practice alternating gradient steps can oscillate or collapse.

## Why it matters

VAE samples are often blurry. GANs (Goodfellow et al. 2014, around the same time as the VAE) drop likelihood altogether: the only training signal is whether a learned critic can tell samples from data. In CP4283's chain of ideas this answers the VAE's weaknesses and brings new ones: unstable training and no likelihood.

## The idea

The value function is

$$\min_G \max_D V(D, G) = \mathbb{E}_{x \sim p_{\text{data}}}[\log D(x)] + \mathbb{E}_{z \sim p(z)}[\log(1 - D(G(z)))].$$

For a fixed $G$, maximising pointwise gives the optimal discriminator

$$D^*(x) = \frac{p_{\text{data}}(x)}{p_{\text{data}}(x) + p_g(x)}.$$

Substituting it back, the generator minimises $2\,\mathrm{JS}(p_{\text{data}} \,\|\, p_g) - \log 4$, which is smallest, at $-\log 4$, exactly when $p_g = p_{\text{data}}$ and $D^* = \tfrac12$ everywhere.

Early in training $D$ easily rejects fakes, so $D(G(z)) \approx 0$ and $\log(1 - D(G(z)))$ is flat there. The paper's fix is the non-saturating loss: the generator maximises $\log D(G(z))$ instead, which has the same fixed point but strong gradients when the generator is losing.

Training alternates a gradient step on $D$ with one on $G$. That does not solve the minimax problem, and the pair can circle instead of converging.

Mode collapse is a common result. Each generator step moves samples toward whatever the current $D$ scores as most real. If that is one mode, say the digit 1, the generator can map many $z$ to 1s; $D$ then learns to reject 1s and the generator jumps to another mode. Nothing in a single step rewards covering all modes at once.

With no likelihood, GANs are judged on samples, commonly by Inception Score or Fréchet Inception Distance (FID), which compares feature statistics of real and generated images.

## Worked example

Optimal discriminator: at a point where $p_{\text{data}} = 0.3$ and $p_g = 0.1$, $D^* = 0.3/0.4 = 0.75$.

Saturation: write $D = \sigma(a)$ for logit $a$ and suppose $D(G(z)) = 0.01$.

- Original loss $\log(1 - \sigma(a))$ has derivative $-\sigma(a) = -0.01$ with respect to $a$.
- Non-saturating loss $-\log \sigma(a)$ has derivative $-(1 - \sigma(a)) = -0.99$.

The non-saturating loss sends a gradient 99 times larger exactly where the generator most needs it.

## Failure modes

- **Reading a low discriminator loss as progress.** A discriminator that wins outright leaves the generator little useful gradient.
- **Assuming the JS result describes training.** It holds only if $D$ is optimal at every step and $G$ updates in function space; real networks update both a little at a time.
- **Expecting a likelihood.** A GAN gives no $\log p(x)$, so it cannot be scored directly against VAEs or flows on test likelihood.

## Prerequisites

None beyond general background.

## Checks

```check
q: At a point x where p_data(x) = 0.2 and p_g(x) = 0.6, what does the optimal discriminator output, and what does it output everywhere once p_g equals p_data?
a: D*(x) = 0.2 / (0.2 + 0.6) = 0.25. When p_g equals p_data it outputs 0.5 everywhere, since it cannot tell the two apart.
why: Catches not knowing that the optimal discriminator is the density ratio p_data / (p_data + p_g).
```

```check
q: Why do GANs usually train the generator to maximise log D(G(z)) instead of minimising log(1 - D(G(z)))?
a: Early in training D rejects fakes confidently, so D(G(z)) is near 0 where log(1 - D) is flat and gives almost no gradient. Maximising log D(G(z)) has the same fixed point but gives strong gradients exactly when the generator is losing.
why: Catches thinking the non-saturating loss changes what the generator is trying to reach rather than how strong its gradients are.
```

```check
q: What is mode collapse, and why does alternating gradient training encourage it?
a: The generator produces only a few kinds of output, such as a few digit classes. Each generator step chases whatever the current discriminator scores as most real, so it can pile its samples onto one mode, then hop to another after the discriminator adapts, with no step rewarding coverage of all modes.
why: Catches thinking the minimax objective itself prefers a few modes rather than the dynamics of alternating updates.
```
