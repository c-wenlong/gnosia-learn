---
id: workflows-versus-agents
title: Workflows versus agents
summary: Workflows run LLM steps along code paths you define; agents let the model direct its own steps. Start simple and add autonomy only when needed.
requires: []
assumes: [react-loop, tool-calling]
tags: [agentic-ai]
sources: []
created: 2026-09-28T15:33:18.524Z
---

# Workflows versus agents

In Anthropic's framing, a workflow is an LLM system whose steps follow code paths you define, while an agent lets the model direct its own steps and tool use until it judges the task done. The difference is who controls the flow. Start with the simplest design that works and add autonomy only when the task needs it.

## Why it matters

Autonomy costs. Every model-chosen step adds tokens and waiting time, and each can go wrong, with later steps building on earlier mistakes. An agent chosen by default is often slower, costlier and less predictable than a short pipeline.

## The idea

CS3216 (Software Product Engineering for Digital Markets) places this under its Agentic AI Building Blocks module.

The source is Anthropic's post "Building effective agents" (December 2024). Its basic unit is an LLM augmented with tools, retrieval and memory, and it notes that for many applications one well-built call of that kind is enough. Beyond that, it describes composable workflow patterns:

- **Prompt chaining:** fixed steps in sequence, each using the last output, with optional checks between. Fits tasks with known stages.
- **Routing:** classify the input, then send it to a specialised prompt or model.
- **Parallelisation:** run independent subtasks at once (sectioning), or the same task several times and compare (voting).
- **Orchestrator-workers:** a model splits the task at run time, delegates the parts and combines the results. Fits when subtasks cannot be known in advance.
- **Evaluator-optimiser:** one call drafts, another critiques, and they repeat. Fits when "good" has clear criteria.

An agent is the [[react-loop]] built on [[tool-calling]]: act, observe, decide again, with no fixed number of steps. It suits open-ended problems whose path cannot be predicted, given stopping conditions and safe testing.

The trade-off: workflows give predictability for well-defined tasks; agents give flexibility at the price of cost, latency and compounding errors.

## Worked example

A student team builds a support assistant for a campus printing service. Their first design, an agent with ten tools, takes many calls for simple quota questions and sometimes files a fault ticket for a fee query.

They redesign it as a routing workflow. One cheap call sorts each message. Quota runs a database lookup and a template reply. Faults run a two-step chain: extract printer and symptom, then file the ticket. Fee questions get one call with retrieval. Only an "other" route reaches a small agent. Most requests now take one or two calls, and each branch can be tested alone.

## Failure modes

- **Agent by default.** Autonomy chosen before trying a workflow. Notice runs whose paths are nearly always the same.
- **Compounding errors.** A wrong early result steers every later step. Trace failures to their first bad step.
- **No stopping condition.** An agent without a step or cost cap can loop expensively.
- **Framework fog.** Abstraction layers hide the actual prompts and responses, so you cannot debug them.

## Prerequisites

- [[react-loop]] (background)
- [[tool-calling]] (background)

## Checks

```check
q: In the orchestrator-workers pattern a model decides the subtasks at run time. Why does Anthropic still class it as a workflow pattern rather than an agent?
a: The overall flow is fixed by your code: split, delegate to workers, combine. The model decides what the subtasks are, but not the control flow, and it does not loop open-endedly choosing its own next actions.
why: Catches thinking any model-made decision makes a system an agent.
```

```check
q: Every customer message goes through the same three steps: extract details, look up the order, draft a reply. Should this be built as an agent? Why?
a: No. The path is known and fixed, so a prompt chain gives the same result with fewer calls, lower cost and more predictable behaviour. An agent adds autonomy the task does not need.
why: Catches reaching for an agent because it sounds more capable, ignoring cost and predictability.
```

```check
q: Why do errors hurt an agent more than a single LLM call?
a: Each step builds on the ones before, so an early mistake, such as a wrong tool result, steers every later step. Over many steps these compound, while a single call has only one chance to go wrong.
why: Catches treating each step's error rate as independent rather than cumulative.
```
