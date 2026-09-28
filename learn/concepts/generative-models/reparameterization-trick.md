---
id: reparameterization-trick
title: The reparameterisation trick
summary: "To differentiate an expectation over $z \sim q_\phi(z \mid x)$ with respect to $\phi$, write the sample as a deterministic function of $\phi$ and independent noise: $z = \mu + \sigma \odot \epsilon$ with $\epsilon \sim \mathcal{N}(0, I)$. The randomness becomes an input, so ordinary backpropagation reaches $\mu$ and $\sigma$."
requires: [evidence-lower-bound]
tags: [generative-models]
sources: []
created: 2026-09-28T15:40:42.319Z
---

# The reparameterisation trick

To differentiate an expectation over $z \sim q_\phi(z \mid x)$ with respect to $\phi$, write the sample as a deterministic function of $\phi$ and independent noise: $z = \mu + \sigma \odot \epsilon$ with $\epsilon \sim \mathcal{N}(0, I)$. The randomness becomes an input, so ordinary backpropagation reaches $\mu$ and $\sigma$.

## Why it matters

The [[evidence-lower-bound]] contains $\mathbb{E}_{q_\phi(z \mid x)}[\log p(x \mid z)]$, and the encoder's parameters $\phi$ sit inside the distribution being averaged over. A sampling step has no derivative, so without a fix the encoder gets no gradient from the reconstruction term. In CP4283 this is what makes the VAE trainable end to end with stochastic gradients.

## The idea

We want $\nabla_\phi\, \mathbb{E}_{q_\phi(z)}[f(z)]$. If $q_\phi = \mathcal{N}(\mu, \sigma^2)$, the same random variable can be produced as $z = g_\phi(\epsilon) = \mu + \sigma \epsilon$ with $\epsilon \sim \mathcal{N}(0, 1)$. The expectation is now over a distribution that does not depend on $\phi$:

$$\nabla_\phi\, \mathbb{E}_{\epsilon}[f(\mu + \sigma\epsilon)] = \mathbb{E}_{\epsilon}\big[f'(z)\, \nabla_\phi z\big].$$

One sample of $\epsilon$ gives an unbiased estimate, and the chain rule does the rest. In code the encoder usually outputs $\log \sigma^2$ so that $\sigma = \exp(\tfrac12 \log \sigma^2)$ stays positive.

The alternative is the score-function (REINFORCE) estimator, $\mathbb{E}_q[f(z)\, \nabla_\phi \log q_\phi(z)]$. It needs no derivative of $f$ and works for discrete $z$, but it uses only the value of $f$ and ignores its slope, and in practice its variance is usually much higher.

Reparameterisation needs $z$ to be a differentiable function of $\phi$. A discrete latent is not, since a small change in $\phi$ flips samples in jumps. The Gumbel-softmax (or Concrete) relaxation replaces the one-hot sample with a temperature softmax of logits plus Gumbel noise, which is differentiable but biased.

## Worked example

Let $f(z) = z^2$ and $q = \mathcal{N}(\mu, \sigma^2)$. The true value is $\mathbb{E}[z^2] = \mu^2 + \sigma^2$, so the true gradients are $2\mu$ and $2\sigma$.

With $z = \mu + \sigma\epsilon$: $\partial z / \partial \mu = 1$ and $\partial z / \partial \sigma = \epsilon$. Take $\mu = 1$, $\sigma = 0.5$ and draw $\epsilon = 0.4$, so $z = 1.2$ and $f'(z) = 2.4$. The one-sample gradients are

$$\frac{\partial f}{\partial \mu} = 2.4 \times 1 = 2.4, \qquad \frac{\partial f}{\partial \sigma} = 2.4 \times 0.4 = 0.96.$$

The true values are 2 and 1. Averaged over $\epsilon$, $\mathbb{E}[2(\mu + \sigma\epsilon)] = 2\mu$ and $\mathbb{E}[2(\mu + \sigma\epsilon)\epsilon] = 2\sigma$, so the estimator is unbiased.

## Failure modes

- **Thinking the noise is removed.** $z$ is exactly as random as before. Only where the randomness enters the computation graph has moved.
- **Thinking every term needs it.** With Gaussian $q$ and prior the KL term has a closed form; the trick is needed for the reconstruction expectation.
- **Using it on discrete latents directly.** Rounding or argmax has zero gradient almost everywhere; use a relaxation or a score-function estimator.

## Prerequisites

- [[evidence-lower-bound]]

## Checks

```check
q: Why can't you backpropagate from the reconstruction loss to the encoder if you sample z directly from N(mu, sigma^2)?
a: Sampling is not a differentiable operation of mu and sigma, so the graph has no gradient path through the sample. Writing z = mu + sigma * eps with eps drawn independently makes z a differentiable function of mu and sigma.
why: Catches thinking autodiff can differentiate through a random draw as if it were an ordinary operation.
```

```check
q: With z = mu + sigma * eps, what are dz/dmu and dz/dsigma, and what is dz/dsigma when eps = -0.5?
a: dz/dmu = 1 and dz/dsigma = eps, so with eps = -0.5 the derivative with respect to sigma is -0.5.
why: Catches not seeing that the sampled noise itself appears in the gradient for sigma.
```

```check
q: Why doesn't the Gaussian reparameterisation trick apply directly to a categorical latent, and what is a common workaround?
a: A categorical sample changes in discrete jumps, so it is not a differentiable function of the logits. The Gumbel-softmax relaxation replaces it with a temperature-controlled softmax of noisy logits, which is differentiable but gives biased gradients; the score-function estimator is the unbiased alternative.
why: Catches assuming reparameterisation works for any latent distribution.
```
