---
id: evidence-lower-bound
title: The evidence lower bound (ELBO)
summary: A latent variable model $p(x) = \int p(x \mid z)\, p(z)\, dz$ has an intractable likelihood, so a variational autoencoder maximises a lower bound instead. The ELBO equals $\log p(x)$ minus the KL from an encoder $q(z \mid x)$ to the true posterior, and splits into reconstruction minus a KL penalty towards the prior.
requires: []
tags: [generative-models]
sources: []
created: 2026-09-28T15:40:37.014Z
---

# The evidence lower bound (ELBO)

A latent variable model $p(x) = \int p(x \mid z)\, p(z)\, dz$ has an intractable likelihood, so a variational autoencoder maximises a lower bound instead. The ELBO equals $\log p(x)$ minus the KL from an encoder $q(z \mid x)$ to the true posterior, and splits into reconstruction minus a KL penalty towards the prior.

## Why it matters

Autoregressive models sample slowly and lack a latent code. A latent variable model generates in one pass ($z \sim p(z)$, then $x \sim p(x \mid z)$), but the integral over $z$ is intractable for a neural decoder. In CP4283 the ELBO is the training objective of the VAE (Kingma and Welling 2013, the course paper).

## The idea

Introduce an approximate posterior $q_\phi(z \mid x)$. For any $q$,

$$\log p(x) = \underbrace{\mathbb{E}_{q}\left[\log \frac{p(x, z)}{q(z \mid x)}\right]}_{\text{ELBO}} + \mathrm{KL}\big(q(z \mid x)\,\|\,p(z \mid x)\big).$$

Proof: $\log p(x) = \mathbb{E}_q[\log p(x,z) - \log p(z \mid x)]$; add and subtract $\log q(z \mid x)$ inside. KL is never negative, so the ELBO is at most $\log p(x)$, with the gap exactly the KL to the true posterior. With the decoder fixed, $\log p(x)$ is constant, so raising the ELBO over $\phi$ can only shrink the gap.

Splitting $p(x,z) = p(x \mid z)\,p(z)$ gives the form used in practice:

$$\text{ELBO} = \mathbb{E}_{q(z \mid x)}[\log p(x \mid z)] - \mathrm{KL}\big(q(z \mid x)\,\|\,p(z)\big).$$

The first term rewards codes the decoder can rebuild $x$ from. The second keeps each $q(z \mid x)$ near the prior, so samples from $p(z)$ land where the decoder was trained.

Inference is amortised: one encoder outputs $q$'s parameters for any $x$, rather than fitting separate parameters per data point. With $q = \mathcal{N}(\mu, \mathrm{diag}\,\sigma^2)$ and $p(z) = \mathcal{N}(0, I)$ the KL has a closed form:

$$\mathrm{KL} = \tfrac{1}{2} \sum_j \left(\mu_j^2 + \sigma_j^2 - 1 - \ln \sigma_j^2\right).$$

## Worked example

With a 2-D latent, suppose for one image the encoder outputs $\mu = (1, 0)$ and $\sigma = (1, 0.5)$.

- Dimension 1: $\tfrac12(1 + 1 - 1 - 0) = 0.5$ nats.
- Dimension 2: $\tfrac12(0 + 0.25 - 1 - \ln 0.25) = \tfrac12(-0.75 + 1.386) = 0.318$ nats.

The KL term is 0.818 nats. If a one-sample estimate of the reconstruction term is $-40.0$ nats, the ELBO estimate is $-40.818$, a lower bound on $\log p(x)$ up to that sampling noise. Dimension 1 pays for its shifted mean, dimension 2 for its narrow spread.

## Failure modes

- **Mixing up the two KL terms.** The gap is KL to the true posterior, which cannot be computed; the training objective's KL is to the prior, which can.
- **Reading the ELBO as the likelihood.** A model with a higher ELBO can still have a lower $\log p(x)$ if its gap is larger.
- **Expecting the gap to reach zero.** A Gaussian $q$ leaves a gap whenever the true posterior is not Gaussian, and one shared encoder adds more when it cannot fit every $x$ well.

## Prerequisites

None beyond general background.

## Checks

```check
q: The ELBO is log p(x) minus which KL divergence, and why can it never exceed log p(x)?
a: It is log p(x) minus KL(q(z|x) || p(z|x)), the divergence from the encoder to the true posterior. A KL divergence is never negative, so the ELBO is at most log p(x), with equality only when q equals the true posterior.
why: Catches confusing the bound's gap (KL to the true posterior) with the KL-to-prior term inside the training objective.
```

```check
q: An encoder outputs mean 0 and standard deviation 1 for every latent dimension. What is the KL term against a standard normal prior, and what does it suggest?
a: Each dimension contributes 0.5 x (0 + 1 - 1 - ln 1) = 0, so the KL is zero; q equals the prior for every input, meaning the code carries no information about x.
why: Catches not being able to apply the Gaussian KL formula or read what a zero KL means.
```

```check
q: What does amortised inference mean in a VAE?
a: A single encoder network with shared weights maps any x to the parameters of q(z|x), instead of optimising a separate set of variational parameters for each data point.
why: Catches thinking each training example gets its own separately optimised posterior in a VAE.
```
