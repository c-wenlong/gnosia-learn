---
id: assisted-vs-agentic-coding
title: Assisted coding versus agentic coding
summary: In assisted coding a person closes every loop and the model only suggests; in agentic coding the model plans, acts, reads the results and iterates on its own until a stopping condition.
requires: []
assumes: [react-loop]
tags: [agentic-ai]
sources: [https://github.blog/ai-and-ml/github-copilot/]
created: 2026-09-28T15:21:53.062Z
---

# Assisted coding versus agentic coding

In assisted coding a person closes every loop and the model only suggests; in
agentic coding the model plans, acts, reads the results and iterates on its own
until a stopping condition.

CS3227 opens with this distinction: the course is about the move from the first
to the second.

## Why it matters

Almost every other question in agentic software engineering (what to sandbox,
when to review, where to put a human checkpoint) only makes sense once you can
say who is closing the loop. A tool that autocompletes a line and a tool that
edits ten files, runs the tests and opens a pull request can use the same model,
yet they need completely different safeguards.

## The idea

Look at who does the four steps of a feedback loop: decide what to do, do it,
observe what happened, decide again.

- **Assisted** (inline completion, a chat answer you paste in): the model
  proposes, a person accepts or rejects, runs the code, reads the error and asks
  again. The person is inside every iteration, so every action is already
  reviewed before it has an effect.
- **Agentic** (an agent in a terminal or a cloud workspace): the model is given
  tools (read file, edit file, run command) and a goal. It calls a tool, reads
  the result back into its context, and chooses the next call itself, many
  times, before a person looks. This is the [[react-loop]] applied to a
  codebase.

The model can be identical in both. What changes is **autonomy**: how many
actions happen between two human decisions. More autonomy buys speed on long,
mechanical tasks and costs you oversight, because mistakes can compound across
steps before anyone sees them.

It is a spectrum, not a switch. An agent that must ask before every shell
command sits nearer the assisted end than one allowed to push to a branch.

## Worked example

Task: rename a function used in 40 files and keep the tests green.

- Assisted: you ask for the new signature, apply the suggestion file by file,
  run the tests yourself, paste the failure back, repeat. You saw every edit.
- Agentic: the agent searches for call sites, edits them, runs the test suite,
  reads two failures, fixes them, reruns, and reports "done, 42 files changed".
  You see one diff at the end. The work is faster, and the review now happens
  once, on a large change, after the fact.

## Failure modes

- **Treating "agentic" as a smarter model.** It is a different control
  structure around a model, and the risks come from the structure.
- **Reviewing an agent's output as if it were a suggestion.** A suggestion is
  one small reviewed step; an agent's diff is many unreviewed steps, and needs a
  review sized to that.
- **Assuming more autonomy is always better.** For short or high-risk changes
  the assisted end is often faster overall, once review time is counted.

## Prerequisites

Background: [[react-loop]] (the reason-act-observe cycle an agent runs).

## Checks

```check
q: The same model powers both an inline autocomplete and a terminal coding agent. What actually differs between the two setups?
a: Who closes the feedback loop. In the autocomplete a person decides, applies, runs and observes every step; the agent plans, calls tools, reads the results and chooses its next action itself, so many actions happen between two human decisions.
why: Catches the belief that agentic means a more capable model rather than more autonomy around the same model.
```

```check
q: Why does an agent's final diff need a different kind of review than an accepted suggestion?
a: A suggestion is one small step a person already approved before it had any effect. An agent's diff is the product of many steps nobody reviewed, so errors could have compounded, and the review has to cover the whole change after the fact.
why: Checks the learner links autonomy to where and when oversight happens.
```

```check
q: Is "agentic" a yes or no property of a coding tool? Give a reason.
a: No. It is a spectrum measured by how many actions the tool may take between human decisions; an agent that asks before every command is less autonomous than one allowed to push a branch.
why: Catches a binary picture that hides the real design choice, which is how much autonomy to grant.
```
