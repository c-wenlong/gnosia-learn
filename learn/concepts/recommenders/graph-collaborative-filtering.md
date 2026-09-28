---
id: graph-collaborative-filtering
title: Graph-based collaborative filtering (LightGCN)
summary: Graph collaborative filtering treats interactions as a bipartite graph of users and items and refines each node's embedding by repeatedly averaging the embeddings of its neighbours, so a user's vector absorbs signal from items several hops away. LightGCN (He et al., SIGIR 2020) showed that plain normalised neighbour averaging, with no weight matrices or nonlinearities, works better for this than a full graph convolutional network.
requires: [matrix-factorization-recommender]
tags: [recommenders]
sources: []
created: 2026-09-28T15:39:04.637Z
---

# Graph-based collaborative filtering (LightGCN)

Graph collaborative filtering treats interactions as a bipartite graph of users and items and refines each node's embedding by repeatedly averaging the embeddings of its neighbours, so a user's vector absorbs signal from items several hops away. LightGCN (He et al., SIGIR 2020) showed that plain normalised neighbour averaging, with no weight matrices or nonlinearities, works better for this than a full graph convolutional network.

## Why it matters

[[matrix-factorization-recommender]] learns each user vector only from that user's own interactions; the link to similar users is implicit, through shared item vectors in the loss. A graph model builds that link into the embedding itself: users who liked items that were liked by similar users end up close, which is called high-order connectivity. In CP4285 this is the graph half of Module 4.

## The idea

Start with a free embedding $e^{(0)}$ for every user and item. One LightGCN layer sets

$$e_u^{(l+1)} = \sum_{i \in N_u} \frac{1}{\sqrt{|N_u|\,|N_i|}}\, e_i^{(l)}, \qquad e_i^{(l+1)} = \sum_{u \in N_i} \frac{1}{\sqrt{|N_i|\,|N_u|}}\, e_u^{(l)}$$

where $N_u$ is the set of items $u$ interacted with. The symmetric normalisation stops high-degree nodes from producing huge sums. After $K$ layers the final embedding is the average over layers, $e_u = \frac{1}{K+1}\sum_{l=0}^{K} e_u^{(l)}$, and the score is $e_u^\top e_i$. Only the layer-0 embeddings are trained.

Training uses the BPR loss: for a user, an item they interacted with $i$ and one they did not $j$, minimise $-\ln \sigma(\hat y_{ui} - \hat y_{uj})$, pushing observed items above unobserved ones.

NGCF (Wang et al., 2019) had used per-layer weight matrices and nonlinear activations. The LightGCN authors removed them and found accuracy improved, arguing that with only ID embeddings as input those operations add training difficulty without useful capacity.

## Worked example

Users $u_1, u_2$; items $i_1, i_2, i_3$. Edges: $u_1$ with $i_1, i_2$; $u_2$ with $i_2, i_3$. Degrees: $u_1{:}2$, $u_2{:}2$, $i_1{:}1$, $i_2{:}2$, $i_3{:}1$. Layer-0 item embeddings: $i_1 = (1, 0)$, $i_2 = (0, 1)$, $i_3 = (1, 1)$.

Layer 1 for $u_1$: weight on $i_1$ is $1/\sqrt{2 \cdot 1} \approx 0.707$, on $i_2$ is $1/\sqrt{2 \cdot 2} = 0.5$. So $e_{u_1}^{(1)} = 0.707(1,0) + 0.5(0,1) = (0.707, 0.5)$.

$u_1$ never touched $i_3$, but the path $u_1 \to i_2 \to u_2 \to i_3$ has three hops. After three layers, $i_3$'s embedding has flowed into $u_1$'s, so $u_1$ moves toward $i_3$ because a user who shares $i_2$ with them liked it.

## Failure modes

- **Over-smoothing.** With many layers every node averages over most of the graph and embeddings become nearly identical; the layer averaging helps, and two to four layers is typical.
- **Cost on huge graphs.** Full-graph propagation over billions of edges is expensive; industrial systems sample neighbourhoods instead, as PinSage (Ying et al., 2018) did at Pinterest.
- **Popularity amplification.** High-degree items are neighbours of many users, so their signal spreads widely and they are recommended even more.

## Prerequisites

- [[matrix-factorization-recommender]]

## Checks

```check
q: User u has interacted with 4 items, and item i has 9 users. In LightGCN, what weight does i's embedding get when aggregated into u?
a: 1 divided by sqrt(4 times 9), which is 1/6, about 0.167.
why: Catches forgetting the symmetric normalisation by both degrees.
```

```check
q: What did LightGCN remove from NGCF, and what was the result?
a: It removed the per-layer feature transformation matrices and nonlinear activations, keeping only normalised neighbour aggregation and a layer-average of embeddings. Recommendation accuracy improved, since with ID-only inputs those operations mainly made training harder.
why: Catches assuming more neural machinery in a GCN always helps collaborative filtering.
```

```check
q: Why does stacking many LightGCN layers eventually hurt?
a: Each layer averages over a wider neighbourhood, so after many layers most nodes' embeddings converge toward similar values (over-smoothing) and users can no longer be told apart.
why: Catches thinking more propagation hops always capture more useful signal.
```
