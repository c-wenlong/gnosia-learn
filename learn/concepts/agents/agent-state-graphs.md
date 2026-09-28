---
id: agent-state-graphs
title: Agent orchestration as a state graph
summary: "LangGraph's model: a StateGraph of nodes that update a typed shared state, conditional edges that route on it, cycles for looping, and checkpoints to persist it."
requires: []
assumes: [react-loop]
tags: [agentic-ai]
sources: []
created: 2026-09-28T15:33:14.718Z
---

# Agent orchestration as a state graph

LangGraph models an agent as a graph over a shared, typed state. Nodes are functions that read the state and return updates; edges pick the next node, and conditional edges choose by inspecting the state. Cycles let a model node and a tool node pass work back and forth until a condition ends the run.

## Why it matters

A basic [[react-loop]] hides its logic inside a `while` loop. Add a review step, a pause for approval or crash recovery, and that loop gets hard to change. A graph makes every step, route and stopping condition visible, and each node testable alone.

## The idea

CS3216 (Software Product Engineering for Digital Markets) places this under its Agentic AI Building Blocks module.

The pieces, conceptually:

- **State.** A typed schema shared by every node. By default an update replaces a key's value; a key can instead declare a reducer, such as appending to a message list, so updates accumulate.
- **Nodes.** Functions registered with `add_node`. Each takes the state, does one job, and returns only the keys it changes.
- **Edges.** `add_edge` always goes from one node to another. `add_conditional_edges` runs a routing function on the state after a node finishes, and its return value names the next node. `START` and `END` mark entry and exit.
- **Cycles.** Edges may point backwards. Model, tools, model again is a cycle; the router breaks it by returning `END` when the model stops requesting tools. A step cap is a sensible safety net.
- **Compile.** `compile` turns the `StateGraph` you built into a runnable graph.
- **Checkpointer.** Supplied when compiling, it saves the state after each step under a thread identifier. A run can then resume after a failure or pause for a person to approve or edit the state.

## Worked example

A travel assistant's state is a message list with an appending reducer. Node `agent` calls the model; node `tools` runs the tool calls it emitted and appends the results.

The wiring: `START` goes to `agent`. From `agent`, a conditional edge checks the last message: tool calls go to `tools`, otherwise `END`. From `tools`, a plain edge returns to `agent`.

Asked about Kyoto's weather and flights from Singapore, `agent` requests both lookups, so the router sends the run to `tools`, then back to `agent`. Now the model answers in plain text, and the router ends the run.

Later the team adds a booking tool and configures the graph to pause before it. The checkpointer saves the paused state; the user approves an hour later and the same thread resumes.

## Failure modes

- **No exit from the cycle.** A router that never returns `END` loops until a limit or a large bill.
- **Overwriting instead of appending.** A message key without a reducer loses history each step. Notice the model forgetting earlier tool results.
- **No checkpointer.** Nothing persists between steps, so resume and human approval cannot work.

## Prerequisites

- [[react-loop]] (background)

## Checks

```check
q: In a model-tools-model cycle, what decides when the agent stops looping, and where does that decision live in the graph?
a: A routing function on a conditional edge after the model node. It inspects the state, typically whether the last message requests tools, and returns END when it does not.
why: Catches thinking the loop stops on its own, rather than by explicit routing on the state.
```

```check
q: Two nodes each return a new message under the key messages, but after the second node only its message remains. What is missing?
a: A reducer on the messages key. Without one, each update replaces the value; a reducer such as append makes updates accumulate.
why: Catches assuming node updates always merge into the state.
```

```check
q: Why does pausing a graph for human approval require a checkpointer?
a: The pause may last minutes or hours, possibly across processes, so the state at that step must be saved and later reloaded under the same thread to resume. The checkpointer does that saving.
why: Catches treating human-in-the-loop as a prompt feature rather than a state persistence feature.
```
