---
id: a-star-search
title: A* search
summary: A* expands the frontier node with the lowest f(n) = g(n) + h(n), the cost so far plus an estimate of the cost to go, which finds optimal paths while expanding far fewer nodes than uniform-cost search when the estimate is good.
requires: [uninformed-search]
tags: [classical-ai, search]
sources: [https://www.redblobgames.com/pathfinding/a-star/introduction.html]
created: 2026-09-28T15:32:36.092Z
---

# A* search

A* expands the frontier node with the lowest f(n) = g(n) + h(n), the cost so far
plus an estimate of the cost to go, which finds optimal paths while expanding far
fewer nodes than uniform-cost search when the estimate is good.

CS4263 covers A* as the main informed search method; Red Blob Games' interactive
introduction shows it on grid maps.

## Why it matters

Uniform-cost search is optimal but expands in every direction, including away
from the goal. Greedy search heads straight for the goal but can return a poor
path. A* combines the two, and it is the default pathfinding algorithm in games,
robotics and route planning for that reason.

## The idea

Each node n carries two numbers:

- g(n): the cost of the path found so far from the start to n (known exactly);
- h(n): a heuristic estimate of the cheapest cost from n to a goal.

A* is uniform-cost search with the priority changed from g(n) to
f(n) = g(n) + h(n), the estimated cost of the best solution through n.

Three algorithms, one family:

| Priority | Algorithm | Behaviour |
| --- | --- | --- |
| g(n) | uniform-cost | optimal, unfocused |
| h(n) | greedy best-first | focused, not optimal |
| g(n) + h(n) | A* | optimal with a suitable h, focused |

A* is optimal when the heuristic never overestimates (admissible), and with the
usual graph-search bookkeeping it needs the stronger property of consistency
([[admissible-and-consistent-heuristics]]). As with UCS, the goal test happens
when a node is expanded.

The better h is (the closer to the true cost without going over), the fewer nodes
A* expands. With h = 0 it expands exactly what UCS would.

Its weakness is memory: like UCS it keeps the whole frontier, which is why
memory-bounded variants (IDA*, SMA*) exist.

## Worked example

Graph: S to A costs 1, S to B costs 4, A to B costs 2, A to G costs 12, B to G
costs 3. Heuristic: h(S) = 5, h(A) = 4, h(B) = 2, h(G) = 0.

1. Expand S. Frontier: A (g 1, f 5), B (g 4, f 6).
2. Expand A (f 5). B via A has g 3, f 5, better than the old entry; G via A has
   g 13, f 13.
3. Expand B (f 5). G via B has g 6, f 6, replacing 13.
4. Expand G (f 6): goal. Path S, A, B, G with cost 6.

The expensive edge from A to G was generated but never expanded, because its f
value showed the path was too costly.

## Failure modes

- **Overestimating heuristics,** which can make A* return a suboptimal path.
- **Goal-testing on generation,** returning G at cost 13 in the example above.
- **Ignoring memory:** on large maps the frontier, not time, runs out first.
- **Confusing A* with greedy search,** which ignores g(n).

## Prerequisites

- [[uninformed-search]] (A* is uniform-cost search with a different priority)

## Checks

```check
q: What does A* use as its priority, and what do its two parts mean?
a: f(n) = g(n) + h(n): g(n) is the known cost of the path from the start to n, and h(n) is an estimate of the cheapest remaining cost from n to a goal, so f estimates the cost of the best solution through n.
why: Checks the core definition.
```

```check
q: How do uniform-cost search, greedy best-first search and A* differ, in terms of their priority function?
a: Uniform-cost orders by g(n) alone; greedy best-first by h(n) alone; A* by g(n) + h(n). UCS is optimal but unfocused, greedy is focused but not optimal, A* is both with a suitable heuristic.
why: Places A* in its family.
```

```check
q: What is A*'s main practical limitation, and how is it usually addressed?
a: Memory: it stores the whole frontier (and reached set), which can grow very large. Memory-bounded variants such as IDA* or SMA* trade extra time for less memory.
why: Checks the learner knows where A* breaks in practice.
```
