---
id: posterior-collapse
title: Posterior collapse in VAEs
summary: Posterior collapse is when a VAE's encoder output $q(z \mid x)$ becomes the prior $p(z)$ for every input, the KL term drops to zero, and the decoder ignores $z$. It happens most with decoders strong enough to model $x$ on their own, and it can be what the objective actually prefers.
requires: [evidence-lower-bound]
tags: [generative-models]
sources: []
created: 2026-09-28T15:40:47.819Z
---

# Posterior collapse in VAEs

Posterior collapse is when a VAE's encoder output $q(z \mid x)$ becomes the prior $p(z)$ for every input, the KL term drops to zero, and the decoder ignores $z$. It happens most with decoders strong enough to model $x$ on their own, and it can be what the objective actually prefers.

## Why it matters

Collapse leaves a model with a decent [[evidence-lower-bound]] and a latent code that carries no information, so interpolating or editing $z$ does nothing. In CP4283 it is the VAE's signature failure mode.

## The idea

The ELBO is $\mathbb{E}_q[\log p(x \mid z)] - \mathrm{KL}(q(z \mid x) \,\|\, p(z))$. Information in $z$ about $x$ costs KL, so using $z$ pays only if reconstruction improves by more.

Bowman et al. (2016) saw this with an LSTM decoder for sentences. An autoregressive decoder already models $p(x_t \mid x_{<t})$ well from the text alone, so $z$ adds little and the KL penalty wins. Early in training the encoder is also uninformative, so the decoder learns to ignore $z$ before the encoder has anything to offer.

Collapse can also be the true optimum. If a decoder that ignores $z$ can match the data distribution, its posterior equals the prior, so $q(z \mid x) = p(z)$ makes the gap zero and the ELBO equals the best achievable $\log p(x)$. On average over the data, nothing that uses $z$ can score higher.

Detect it by logging the KL per latent dimension: collapsed dimensions sit near zero. A related count is active units: a dimension is active if the encoder's mean for it varies across inputs (Burda et al. 2016 used a covariance above 0.01).

Mitigations, each attacking one cause:

- **KL annealing (warm-up):** multiply the KL by a weight rising from 0 to 1, so the encoder becomes useful before the penalty bites.
- **Free bits (Kingma et al. 2016):** replace the KL of each dimension (or group) with $\max(\lambda, \mathrm{KL}_j)$, so KL below $\lambda$ gets no gradient pushing it down.
- **Weaker decoder:** word dropout in Bowman et al., or a smaller receptive field, forces the decoder to rely on $z$.
- **$\beta < 1$:** scale the KL down. The objective is then no longer a bound on $\log p(x)$.

## Worked example

A 4-D latent reports per-dimension KLs of (0.02, 0.10, 0.60, 1.50) nats. Two dimensions look collapsed. With free bits at $\lambda = 0.25$:

$$0.25 + 0.25 + 0.60 + 1.50 = 2.60 \text{ nats},$$

against 2.22 without it. The first two terms are now constant, so their gradients are zero and the optimiser has no reason to shrink them further. The last two are unchanged.

## Failure modes

- **Blaming a bug.** Collapse can be the ELBO's genuine optimum for a strong decoder; the fix is changing the model or objective.
- **Reading the total KL alone.** A few active dimensions can hide many collapsed ones; check each dimension.

## Prerequisites

- [[evidence-lower-bound]]

## Checks

```check
q: Why is posterior collapse more likely with an autoregressive LSTM decoder than with a simple factorised decoder?
a: An autoregressive decoder can already model x well from its own previous outputs, so the latent adds little reconstruction benefit, while every bit of information in z costs KL. The ELBO then favours setting q(z|x) to the prior and ignoring z.
why: Catches thinking collapse is caused by a weak decoder rather than a strong one.
```

```check
q: Can posterior collapse be the global optimum of the ELBO, or is it always a bad local minimum?
a: It can be the global optimum: if a decoder that ignores z matches the data distribution, then q equal to the prior makes the bound tight, so no solution that uses z scores a higher ELBO on average.
why: Catches the belief that better optimisation alone always fixes collapse.
```

```check
q: With free bits at 0.5 nats per dimension, a dimension has KL 0.1. What does that dimension contribute to the loss and what gradient does its KL receive?
a: It contributes max(0.5, 0.1) = 0.5 nats, a constant, so its KL receives zero gradient and the optimiser is no longer pushed to shrink it towards zero.
why: Catches not understanding how free bits stops the KL penalty from driving under-used dimensions to collapse.
```
