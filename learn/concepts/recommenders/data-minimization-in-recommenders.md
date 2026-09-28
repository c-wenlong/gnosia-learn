---
id: data-minimization-in-recommenders
title: Data minimisation and privacy risk in recommenders
summary: "Interaction histories are sensitive and identifying: a handful of ratings can single out one person, and likes can reveal undisclosed traits. Data minimisation means collecting only what the model needs, keeping it only as long as needed, and coarsening it where detail adds little."
requires: []
assumes: [matrix-factorization-recommender]
tags: [recommenders]
sources: []
created: 2026-09-28T15:39:15.173Z
---

# Data minimisation and privacy risk in recommenders

Interaction histories are sensitive and identifying: a handful of ratings can single out one person, and likes can reveal undisclosed traits. Data minimisation means collecting only what the model needs, keeping it only as long as needed, and coarsening it where detail adds little.

## Why it matters

A recommender's training data records what people watch, read and buy. Removing names does not make it anonymous. In CP4285 this is the privacy half of Module 5, alongside [[recommendation-explanations]].

## The idea

**Re-identification.** Narayanan and Shmatikov (2008) studied the Netflix Prize data, released with names replaced by random IDs. Knowing about 8 of a subscriber's ratings, with dates accurate to two weeks and two ratings allowed to be wrong, uniquely identifies about 99% of records; matching public IMDb reviews re-identified some sampled users. Sparse histories are fingerprints. Netflix cancelled a planned second competition in 2010 after a privacy lawsuit and regulatory questions.

**Attribute inference.** Kosinski, Stillwell and Graepel (2013) predicted traits such as sexual orientation, ethnicity and political views from Facebook likes with accuracy well above chance. Deleting a sensitive field does not stop the model reconstructing it.

**Minimisation.** GDPR Article 5 requires personal data to be "adequate, relevant and limited to what is necessary" for its purpose, and not kept in identifiable form longer than needed. In practice: drop unused fields, set retention limits, coarsen timestamps and locations, and store aggregates instead of raw logs.

**Techniques.**

- On-device or federated learning: raw histories stay on the phone and only model updates are sent (updates can still leak information, so they are often combined with secure aggregation or noise).
- Differential privacy: clip each user's influence on training and add calibrated noise, so the model barely depends on any one person.

Each costs some accuracy, and the cost tends to fall hardest on users and items with little data.

## Worked example

A news recommender team audits its candidate fields:

| Field | Needed? | Decision |
|---|---|---|
| Article IDs clicked, last 30 days | Yes, core signal | Keep, delete after 30 days |
| Click timestamps to the second | Hour is enough | Coarsen |
| Precise GPS | Only city matters for local news | Keep city only |
| Full name, email | No | Do not send to the model |
| Contacts list | No | Do not collect |
| Reading history since sign-up | Rarely helps beyond recent weeks | Aggregate to topic counts |

A field never stored cannot be breached or re-identified.

## Failure modes

- **"Anonymised" means safe.** Replacing names with IDs does not stop linkage attacks on sparse histories.
- **Inference from proxies.** Not collecting a sensitive attribute does not prevent the model or an attacker inferring it.
- **Retention creep.** Logs kept "in case" accumulate risk with no model benefit.
- **Ignoring the trade-off.** Privacy techniques cost accuracy, and that cost should be measured.

## Prerequisites

None beyond general background.

Useful background: [[matrix-factorization-recommender]].

## Checks

```check
q: The Netflix Prize data replaced names with random IDs. Why was that not enough to keep subscribers anonymous?
a: Rating histories are sparse and distinctive, so a few known ratings with approximate dates match almost only one record. Narayanan and Shmatikov showed about 8 ratings could uniquely identify around 99% of records and linked some to public IMDb profiles.
why: Catches equating removal of direct identifiers with anonymity.
```

```check
q: A team removes the gender field from its training data to protect users. Why might gender still be exposed?
a: Other signals such as likes, purchases or viewing history can correlate strongly with gender, so the model or an attacker can infer it. Removing a field is not the same as removing the information.
why: Catches assuming dropping a column prevents attribute inference.
```

```check
q: State the data minimisation principle in one sentence and name one practical way a recommender applies it.
a: Collect and keep only the personal data necessary for the stated purpose, for no longer than needed. For example, keep only the last 30 days of clicks, or store city instead of precise GPS.
why: Catches thinking minimisation only concerns what is collected, not also how long and how precisely it is kept.
```
