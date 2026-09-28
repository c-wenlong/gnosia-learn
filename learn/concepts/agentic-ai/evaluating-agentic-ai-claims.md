---
id: evaluating-agentic-ai-claims
title: Evaluating claims about agent capability
summary: A claim that an agent can do a job is only as good as the task distribution, the metric and the comparison behind it, so check what was measured, on what, against what, and whether it resembles your own work.
requires: []
assumes: [assisted-vs-agentic-coding]
tags: [agentic-ai]
sources: []
created: 2026-09-28T15:25:46.307Z
---

# Evaluating claims about agent capability

A claim that an agent can do a job is only as good as the task distribution, the
metric and the comparison behind it, so check what was measured, on what,
against what, and whether it resembles your own work.

CS3227 calls this capabilities versus hype: critical evaluation of agentic AI
claims.

## Why it matters

Agentic AI moves fast, and the loudest evidence (a launch demo, a leaderboard
jump, a viral thread) is also the least controlled. Teams that adopt on the
strength of a demo discover the gap on their own codebase. Teams that dismiss
everything miss real gains. The skill is reading a claim well enough to know
which of those you are looking at.

## The idea

Ask five questions of any capability claim:

1. **What tasks?** A benchmark is a sample of problems. SWE-bench, for example,
   uses real GitHub issues from popular Python repositories. Your private
   monorepo in another language is a different distribution.
2. **What metric?** Solved on the first attempt, or in any of k attempts?
   Judged by tests, or by a person? "Resolves 60% of issues" means different
   things under each.
3. **Could it have seen the answers?** Public benchmarks can leak into training
   data (contamination), which inflates scores on them and not on new problems.
4. **Compared to what?** A strong baseline (a skilled developer, the previous
   tool, a simpler agent) or a weak one?
5. **Selected how?** A demo shows chosen successes. Ask for the failure rate,
   the cost per task, and the tasks it was not shown on.

Then run the cheapest real test: try the tool on a sample of your own recent
tasks, with the result checked the way your team checks any change, and measure
time including review and rework.

Perceived and measured productivity can differ. A 2025 randomised study by METR
reported experienced open-source developers took longer on their own
repositories with AI tools, while believing they had been faster. One study does
not settle the question, but it shows why self-report is weak evidence.

## Worked example

A vendor says "our agent completes 70% of engineering tickets". Questions turn
up that the tickets were drawn from open-source Python repositories with good
tests, success meant the repository's tests passed after up to five attempts,
and the baseline was an older model. On a trial of 30 of your own tickets,
scored by your reviewers on the first attempt, it completes 9. That is still
useful, and it is a very different number.

## Failure modes

- **Reading a leaderboard as a forecast** for your own tasks.
- **Ignoring cost and review time,** counting only tasks "completed".
- **Trusting self-reported speed-ups** over measured ones.
- **Dismissing everything** because some claims are inflated.

## Prerequisites

Background: [[assisted-vs-agentic-coding]] (what kind of tool is being claimed
about).

## Checks

```check
q: List the questions to ask of a claim like "the agent solves 60% of real software issues".
a: On what tasks (and do they resemble mine); by what metric (first attempt or any of k, tests or human judgement); could the benchmark be in the training data; compared with what baseline; and were the examples selected, with what failure rate and cost.
why: Checks recall of the evaluation checklist.
```

```check
q: What is benchmark contamination, and what does it do to scores?
a: Benchmark problems or solutions appearing in a model's training data. It inflates scores on that benchmark without a matching gain on new problems.
why: Targets one specific, common way scores mislead.
```

```check
q: What is the most direct way to test a capability claim for your own team?
a: Run the tool on a sample of your own real tasks, judge results the way you judge any change, and measure total time including review and rework.
why: Moves the learner from reading claims to testing them.
```
