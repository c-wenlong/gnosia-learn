---
id: llm-training-stages
title: Pretraining, fine-tuning and RLHF
summary: A chat model is built in stages. Pretraining on next-token prediction over a very large corpus gives it knowledge and fluency; supervised fine-tuning on written demonstrations teaches it to follow instructions; preference optimisation (RLHF or DPO) then moves its outputs towards the ones people rate as better.
requires: [next-token-prediction]
tags: [transformers]
sources: []
created: 2026-09-28T15:42:00.673Z
---

# Pretraining, fine-tuning and RLHF

A chat model is built in stages. Pretraining on next-token prediction over a very large corpus gives it knowledge and fluency; supervised fine-tuning on written demonstrations teaches it to follow instructions; preference optimisation (RLHF or DPO) then moves its outputs towards the ones people rate as better.

## Why it matters

A base model continues text: asked a question, it may reply with more questions. Every later technique in the course assumes an instruction-following model, and the reward models here return in module 4 as verifiers. In CP4284 this is the module 1 refresher on how the model under your agent was made.

## The idea

| Stage | Data | Objective | What it adds |
|---|---|---|---|
| Pretraining | web text, books, code | next-token cross-entropy | knowledge, fluency |
| SFT (instruction tuning) | prompt and written response pairs | same loss, on response tokens | the assistant format |
| Preference optimisation | pairs ranked by people | reward model plus RL, or DPO | responses people prefer |

Pretraining is [[next-token-prediction]] at scale. SFT keeps the loss but uses curated demonstrations, which mostly teaches format: LIMA (Zhou et al. 2023) got a usable assistant from 1,000 examples.

RLHF, as in InstructGPT (Ouyang et al. 2022), has two steps. First, fit a reward model $r_\phi(x, y)$ to human comparisons with the Bradley-Terry model, $P(y_w \succ y_l) = \sigma(r_\phi(x,y_w) - r_\phi(x,y_l))$, by maximising the log of that probability. Then optimise the policy with PPO:

$$\max_\pi \; \mathbb{E}_{y \sim \pi}[r_\phi(x,y)] - \beta \, \mathrm{KL}\big(\pi(\cdot \mid x) \,\|\, \pi_{\text{SFT}}(\cdot \mid x)\big)$$

The KL penalty keeps the policy near the SFT model, where the reward model's scores still mean something. Labellers preferred the 1.3B InstructGPT over the 175B GPT-3.

DPO (Rafailov et al. 2023) solves that objective in closed form, expressing the reward through the policy's log-ratio to a frozen reference model. Training becomes one classification-style loss on preference pairs, with no reward model and no sampling loop.

LoRA (Hu et al. 2021) makes fine-tuning cheap: freeze $W$ and learn a low-rank update $BA$. For a $4096 \times 4096$ matrix, rank 8 trains $65{,}536$ numbers instead of 16.8 million.

## Worked example

A reward model scores the preferred answer 2.0 and the rejected one 0.5. Then $P(y_w \succ y_l) = \sigma(1.5) \approx 0.818$ and the loss is $-\ln 0.818 \approx 0.20$. Scored the other way round, $\sigma(-1.5) \approx 0.182$ and the loss is about 1.70, so the gradient pushes hard to fix the order.

## Failure modes

- **Reward hacking.** The policy finds outputs the reward model overrates (length, confident tone); true quality falls while the reward keeps rising.
- **Sycophancy.** Raters tend to prefer answers that agree with them, and preference training can amplify that into telling users what they want to hear.
- **Expecting SFT to add knowledge.** Fine-tuning mainly shapes format and style; facts the base model never learnt are not reliably installed by a small instruction set.

## Prerequisites

- [[next-token-prediction]]

## Checks

```check
q: Why does RLHF add a KL penalty to the SFT model when optimising against the reward model?
a: The reward model is only accurate near the distribution it was trained on, so an unconstrained policy drifts into outputs the reward model overrates. The KL term keeps the policy close to the SFT model and limits that drift.
why: Catches the belief that maximising the reward model's score is the same as maximising what people actually want.
```

```check
q: What does DPO remove from the RLHF pipeline, and what does it still need?
a: DPO removes the separately trained reward model and the RL sampling loop such as PPO. It still needs human preference pairs and a frozen reference model, usually the SFT model, to compute log-ratios against.
why: Catches the idea that DPO needs no preference data, or that it drops the reference model as well.
```

```check
q: A reward model scores the preferred answer 1.0 and the rejected one 1.0. What probability does Bradley-Terry assign to the preference, and what is the loss?
a: The difference is 0, so the probability is sigmoid(0) = 0.5 and the loss is -ln(0.5), about 0.69. The model is indifferent and the gradient pushes the scores apart.
why: Catches not knowing that Bradley-Terry depends only on the score difference, not the absolute scores.
```
