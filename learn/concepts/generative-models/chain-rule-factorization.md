---
id: chain-rule-factorization
title: Chain-rule factorisation of a joint distribution
summary: Any joint distribution over variables $x_1, \dots, x_n$ can be written exactly as a product of conditionals, $p(x) = \prod_i p(x_i \mid x_{<i})$, for any ordering of the variables. An autoregressive model keeps this exact form and learns each conditional with a shared network, which gives an exact log-likelihood to train on at the price of generating one variable at a time.
requires: []
tags: [generative-models]
sources: []
created: 2026-09-28T15:40:20.983Z
---

# Chain-rule factorisation of a joint distribution

Any joint distribution over variables $x_1, \dots, x_n$ can be written exactly as a product of conditionals, $p(x) = \prod_i p(x_i \mid x_{<i})$, for any ordering of the variables. An autoregressive model keeps this exact form and learns each conditional with a shared network, which gives an exact log-likelihood to train on at the price of generating one variable at a time.

## Why it matters

Modelling $p(x)$ directly for an image or a sentence is hopeless: a table over 784 binary pixels needs $2^{784} - 1$ numbers. The chain rule turns one impossible distribution into $n$ prediction problems, each of which a neural network can handle. In CP4283 this is the first link in the chain of ideas: exact likelihoods, paid for with slow sequential sampling that later models try to avoid.

## The idea

The chain rule of probability is an identity:

$$p(x_1, \dots, x_n) = p(x_1)\, p(x_2 \mid x_1)\, p(x_3 \mid x_1, x_2) \cdots p(x_n \mid x_{<n}).$$

It holds for every distribution and every ordering, so no independence is assumed. The modelling choices are the ordering (raster order for pixels, left to right for text) and how each conditional is parameterised.

If each conditional were its own lookup table, nothing would be saved: the last conditional alone has $2^{n-1}$ rows for binary variables. The saving comes from one network with shared weights that reads the prefix $x_{<i}$ and outputs a distribution over $x_i$.

Taking logs turns the product into a sum, $\log p(x) = \sum_i \log p(x_i \mid x_{<i})$. That sum is computable exactly, so training is plain maximum likelihood. Sampling is the cost: draw $x_1$, feed it back, draw $x_2$, and so on, $n$ sequential steps.

The opposite extreme, a fully factorised model $p(x) = \prod_i p(x_i)$, is cheap but cannot represent any correlation (neighbouring pixels, grammatical agreement).

## Worked example

Take three binary variables and the observation $x = (1, 0, 1)$. Suppose the model gives $p(x_1 = 1) = 0.6$, $p(x_2 = 0 \mid x_1 = 1) = 0.7$ and $p(x_3 = 1 \mid x_1 = 1, x_2 = 0) = 0.5$. Then

$$p(x) = 0.6 \times 0.7 \times 0.5 = 0.21,$$

$$\log p(x) = \ln 0.6 + \ln 0.7 + \ln 0.5 = -0.511 - 0.357 - 0.693 = -1.561.$$

The training loss for this example is $1.561$ nats. Sampling runs in the same order: $x_1$, then $x_2$ given it, then $x_3$.

## Failure modes

- **Thinking the factorisation is an approximation.** The product is exact; error enters only through how well the network fits each conditional.
- **Assuming the ordering changes what can be represented.** With unlimited capacity every ordering represents the same joint. In practice some orderings are easier to learn, so the choice matters for a finite network.
- **Confusing fast training with fast sampling.** When the whole sequence is known, a suitably masked network scores all conditionals in parallel during training, but generation still needs one step per variable.

## Prerequisites

None beyond general background.

## Checks

```check
q: Does writing p(x) as the product of p(x_i | x_<i) assume anything about independence between the variables?
a: No. The chain rule is an identity that holds exactly for every joint distribution and every ordering; the modelling assumptions are the choice of ordering and the network used for each conditional.
why: Catches the belief that autoregressive factorisation is an approximation like a Markov or independence assumption.
```

```check
q: A model gives p(x1=1)=0.5, p(x2=1 | x1=1)=0.4 and p(x3=0 | x1=1, x2=1)=0.5. What is the log-likelihood of (1,1,0) in nats?
a: ln 0.5 + ln 0.4 + ln 0.5 = -0.693 - 0.916 - 0.693 = -2.303, which is ln 0.1.
why: Catches not knowing that the exact log-likelihood is the sum of the log conditionals.
```

```check
q: Why does an autoregressive model train in parallel yet sample slowly?
a: In training every variable is observed, so all conditionals can be scored at once; in sampling each variable must be drawn before the next conditional can be evaluated, so generation takes one step per variable.
why: Catches conflating the cost of computing the likelihood with the cost of generating a sample.
```
