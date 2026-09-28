---
id: session-based-recommendation
title: Session-based sequential recommendation
summary: "Session-based recommendation predicts the next item a user will interact with from the ordered list of their recent interactions, often within one anonymous visit with no long-term profile. The order of events is the signal: what someone clicked a minute ago says more about their next click than an average over their whole history."
requires: []
assumes: [matrix-factorization-recommender]
tags: [recommenders]
sources: []
created: 2026-09-28T15:38:53.835Z
---

# Session-based sequential recommendation

Session-based recommendation predicts the next item a user will interact with from the ordered list of their recent interactions, often within one anonymous visit with no long-term profile. The order of events is the signal: what someone clicked a minute ago says more about their next click than an average over their whole history.

## Why it matters

Many visitors are anonymous, and a known user's current intent (buying a phone today) differs from their long-run taste. Matrix factorisation treats a history as an unordered set, so it cannot tell "phone then case" from "case then phone". In CP4285 this is the sequence-aware part of Module 3, and it sets up the transformer models of Module 4.

## The idea

**Markov baseline.** A first-order Markov chain predicts the next item from the last item only, using transition counts: $P(\text{next} = j \mid \text{last} = i) = \text{count}(i \to j) / \text{count}(i)$. It is strong for short-range patterns but forgets everything before the last click.

**Session item-kNN.** Recommend items that co-occur with the current session's items in other sessions. It ignores order within the session but uses more than one item.

**GRU4Rec.** Hidasi et al. (ICLR 2016) ran a recurrent network (GRU) over the session's clicks, one item embedding per step. The hidden state summarises the whole session so far, and an output layer scores every item as the next one. Two practical ideas made it work. Session-parallel mini-batches put different sessions in each row of the batch and step through them together, replacing a finished session with a new one and resetting its hidden state. Ranking losses (BPR and TOP1), with the other items in the mini-batch as negatives, trained the model to rank the true next item above the rest.

Transformers later replaced the recurrence ([[self-attentive-sequential-recommendation]]).

## Worked example

A shopping session is: phone, case, ?

Transition counts out of "case" in past sessions are: screen protector 40, charger 30, earbuds 25, phone 5 (100 total). The Markov model predicts screen protector with probability 0.40, using only "case".

Now compare a session that is just: case, ? The Markov model gives the identical answer, because the last item is the same. A GRU sees the phone earlier in the first session, so its hidden state differs. If the logs support it, the GRU can learn that someone who viewed a phone first wants accessories for that phone, while someone browsing only cases has a different intent. (The counts are illustrative.)

## Failure modes

- **Popularity bias.** In-batch negatives and click logs both favour popular items, so the model over-recommends them.
- **Short sessions.** Many sessions have one or two clicks, leaving little sequence to learn from.
- **Strong simple baselines.** Comparative studies have repeatedly found that well-tuned session item-kNN and similar heuristics are competitive with neural session models, so a neural model must be compared against them before claiming a gain.
- **Ignoring the long term.** For logged-in users, discarding history throws away stable preferences.

## Prerequisites

None beyond general background.

Useful background: [[matrix-factorization-recommender]].

## Checks

```check
q: Two sessions end in the same item. What does a first-order Markov recommender predict for each, and why can an RNN differ?
a: The Markov model predicts the same next item for both, since it conditions only on the last item. An RNN's hidden state summarises the whole session, so different earlier items lead to different predictions.
why: Catches thinking a Markov baseline uses the whole session history.
```

```check
q: Why does plain matrix factorisation struggle with anonymous session data?
a: It needs a learned vector per user, built from that user's past interactions, and an anonymous visitor has none. It also treats history as an unordered set, so it cannot use the order of the current clicks.
why: Catches assuming a user-profile model applies directly to sessions without user identity.
```

```check
q: A new neural session model beats a popularity baseline. Why is that not enough to claim progress?
a: Popularity is a weak baseline. Session item-kNN and similar simple methods are often competitive with neural session models, so the new model should be compared against well-tuned versions of those.
why: Catches accepting gains measured only against weak baselines.
```
