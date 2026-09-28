---
id: execution-guided-code-generation
title: Execution-guided code generation and pass@k
summary: Generated code can be run, so it is judged by executing it against unit tests and measured with pass@k, the probability that at least one of $k$ sampled programs passes. The same fact lets a system sample many programs, keep only those that pass the tests it has, and feed error output back for repair.
requires: [next-token-prediction]
tags: [agentic-ai]
sources: []
created: 2026-09-28T15:42:43.439Z
---

# Execution-guided code generation and pass@k

Generated code can be run, so it is judged by executing it against unit tests and measured with pass@k, the probability that at least one of $k$ sampled programs passes. The same fact lets a system sample many programs, keep only those that pass the tests it has, and feed error output back for repair.

## Why it matters

Text similarity is a poor measure of code: programs sharing most tokens can behave differently. Chen et al. (2021), the Codex paper and the course resource, introduced HumanEval (164 hand-written problems with unit tests) and made functional correctness the standard. In CP4284 this is module 5's execution-guided synthesis, and running code as feedback is the core of the agentic coding loop that follows.

## The idea

A code model generates programs one token at a time by [[next-token-prediction]], so sampling gives different programs each time. pass@k asks: if you drew $k$ samples, would any pass? Estimating it by drawing exactly $k$ samples is noisy, so the paper draws $n \ge k$ samples, counts the $c$ that pass, and uses the unbiased estimator

$$\text{pass@}k = 1 - \frac{\binom{n-c}{k}}{\binom{n}{k}}.$$

The fraction is the chance that a random $k$-subset of the $n$ samples contains no correct program. Plugging $\hat p = c/n$ into $1 - (1-\hat p)^k$ is biased, which is why the paper avoids it. The 12B Codex model scored 28.8% pass@1 on HumanEval, and 70.2% when 100 samples were allowed per problem.

pass@k with $k > 1$ assumes something picks the right sample. In practice that is execution. AlphaCode (Li et al. 2022) sampled very large numbers of programs per competitive-programming problem, discarded those that failed the example tests in the problem statement, clustered the survivors by their behaviour on generated inputs, and submitted one from each of the largest clusters, up to 10. It ranked on average in the top 54.3% of human competitors. Execution output can also go back to the model as feedback, so it repairs a failing program instead of starting over.

## Worked example

Take $n = 10$ samples with $c = 2$ correct.

pass@1 $= 1 - \binom{8}{1}/\binom{10}{1} = 1 - 8/10 = 0.2$, simply $c/n$.

pass@5 $= 1 - \binom{8}{5}/\binom{10}{5} = 1 - 56/252 \approx 0.78$.

Check the fraction directly: five draws without replacement all wrong has probability $\frac{8}{10} \cdot \frac{7}{9} \cdot \frac{6}{8} \cdot \frac{5}{7} \cdot \frac{4}{6} \approx 0.22$. The biased shortcut $1 - 0.8^5 \approx 0.67$ treats draws as independent, but each wrong draw leaves fewer wrong programs to draw next.

## Failure modes

- **Weak tests.** A thin test suite lets wrong programs pass; adding tests to HumanEval (EvalPlus, Liu et al. 2023) lowered reported pass rates.
- **Reading pass@100 as usable accuracy.** A user gets one answer; without a reliable filter, pass@1 is the number that applies.
- **Unsafe execution.** Model-written code can delete files or reach the network, so it runs in a sandbox with limits.
- **Cost.** Sampling and running hundreds of programs multiplies compute.

## Prerequisites

- [[next-token-prediction]]

## Checks

```check
q: You draw 4 samples for a problem and 1 is correct. What are pass@1 and pass@2 using the unbiased estimator?
a: pass@1 = c/n = 1/4 = 0.25. pass@2 = 1 - C(3,2)/C(4,2) = 1 - 3/6 = 0.5.
why: Catches not knowing the estimator is the chance a random k-subset contains at least one correct sample.
```

```check
q: A paper reports 70% pass@100 for a model. Why is that not the accuracy a user sees when asking once?
a: pass@100 counts a problem as solved if any of 100 samples passes, assuming something picks the right one. A user gets one answer, so without a reliable filter such as tests, pass@1 is the relevant number.
why: Catches reading pass@k for large k as single-answer accuracy.
```

```check
q: Why can a model's pass rate on a benchmark overstate how often its code is correct?
a: The benchmark's tests may be too thin, so wrong programs that happen to pass them are counted as correct; adding more tests lowers the measured rate.
why: Catches treating passing the given tests as proof of correctness.
```
