---
name: review
description: Run a spaced-repetition review session over concepts that are due in the local knowledge base. Use when the user says /review, asks what they should revise, or asks to be tested on what they have learnt.
allowed-tools: Bash, Read, Edit, AskUserQuestion
---

# Review

Short, high-frequency retrieval practice over what is due. This is not a
teaching session — retrieval *is* the mechanism. Pulling something out of
memory strengthens it far more than reading it again, so make them retrieve
before you show them anything.

## 1. What is due

```bash
npm run learn -- review due --json
```

Each item carries its stored `checks` — the questions written when the
concept was taught. Use them. They were authored with the misconception
they catch in mind, which is more than you can reconstruct now.

If nothing is due:

```bash
npm run learn -- review forecast
npm run learn -- frontier
```

Tell them the queue is clear, show what is coming, and offer to teach at the
frontier instead (`/learn <concept>`). Then stop — do not invent review
items to fill the time.

If an item has **no checks**, ask a question you compose from the concept
note, and write it back afterwards so the gap does not recur:

```bash
npm run learn -- check add --concept <id> --question "…" --answer "…"
```

## 2. Ask

For each due concept, in the order returned:

- Pose the check as an **open question first** — free recall beats
  recognition. Only fall back to AskUserQuestion with options if they stall
  or explicitly prefer multiple choice.
- One concept at a time. Wait for the answer.
- Do not hint before they have tried. The effortful failure is doing work.

## 3. Grade

Show the stored answer, then let them self-grade. Self-assessment after
seeing the answer is more accurate than your guess at their confidence,
and it is the input SM-2 actually expects:

| Grade | Meaning |
| --- | --- |
| 5 | Instant and correct |
| 4 | Correct, slight hesitation |
| 3 | Correct, but hard work |
| 2 | Wrong — but obvious once seen |
| 1 | Wrong, though it felt familiar |
| 0 | No recall at all |

Use AskUserQuestion with four options (5, 4, 3, and "missed it") to keep it
one keystroke, mapping "missed it" to a follow-up that separates 2/1/0 only
when it matters.

Record it:

```bash
npm run learn -- review grade --concept <id> --grade <0-5>
```

This updates both the schedule and the mastery model in one step.

## 4. Handle leeches

An item flagged `[leech]` has lapsed four or more times. Repeating it
unchanged will not help — the card is the problem, not the learner. Do one
of these, and say which you are doing:

- **Split it.** The concept is too big; add narrower prerequisite concepts.
- **Reformulate the check.** The question is ambiguous or tests recall of
  phrasing rather than understanding.
- **Re-teach it.** The foundation is missing; run `/learn <concept>`.

## 5. Close

```bash
npm run learn -- review forecast --days 7
npm run learn -- index
```

Report: how many reviewed, how many lapsed, what is due tomorrow. Keep it
to a few lines — the point of review is that it is quick enough to do daily.
