---
id: prototype-fidelity
title: Prototype fidelity
summary: How closely a prototype resembles the final product across visual, content and interactivity dimensions, chosen to fit the question being tested.
requires: []
tags: [hci]
sources: []
created: 2026-09-28T15:31:48.248Z
---

# Prototype fidelity

Prototype fidelity is how closely a prototype resembles the finished product. A sketch on paper is low fidelity; a clickable mock-up with real styling and real content is high fidelity. The right level depends on the question the prototype is meant to answer, not on how much time the team has.

## Why it matters

A prototype exists to learn something before building the real thing. Too rough, and it cannot answer questions about, say, readability. Too polished, and you spend days on work that may be thrown away, and you change what people comment on.

A rough sketch looks unfinished, so people feel free to question whether the idea is right at all. A polished screen looks decided, so people comment on colours, fonts and spacing instead of the idea.

## The idea

Fidelity is not a single dial. It varies along several dimensions that can be set independently:

| Dimension | Low | High |
| --- | --- | --- |
| Visual | Boxes and hand-drawn lines | Final colours, type and images |
| Content | Placeholder text, "Lorem ipsum" | Real labels, prices, error messages |
| Interactivity | A person swaps paper screens | Clicks, transitions and input work |

Some writers add breadth (how many features are covered) and depth (how far each feature works) as further dimensions.

Common forms, roughly in rising fidelity:

1. **Paper prototypes.** Sketches a facilitator swaps by hand as the participant "taps".
2. **Wireframes.** Digital layouts with little styling, used to settle structure and content.
3. **Interactive (clickable) prototypes.** Linked screens in a design tool that respond to clicks, often close to final appearance.

Match fidelity to the question. Mixing is normal: a greyscale wireframe with real content suits testing wording.

CS2111 (Human-Centred Computing) places this under its Designing Interactions module.

## Worked example

A team is designing the checkout for a food delivery app.

Week one, the question is "should delivery time be chosen before or after the cart?" They sketch both orders on paper and run five people through each. People argue with the flow itself, exactly the feedback needed, for an afternoon's work.

Week three, the question is "do people notice the delivery fee before paying?" Paper cannot answer that, because noticing depends on real sizes, colours and wording. They build a clickable prototype with the actual fee text and layout.

A clickable version in week one would have drawn comments on button colour; paper in week three would have tested nothing.

## Failure modes

- **Polishing too early.** Hours spent on visuals before the flow is settled. Notice it when feedback is all about looks.
- **Testing a question the prototype cannot answer.** Asking about timing, animation or readability with a paper sketch.
- **Placeholder content hiding problems.** Short fake labels fit; real long ones break the layout.
- **Mistaking the prototype for the product.** A convincing mock-up makes stakeholders think the work is nearly done.

## Checks

```check
q: A team wants to learn whether users see a delivery fee before paying. Would a paper prototype answer this? Why or why not?
a: No. Whether people notice the fee depends on real size, colour, wording and placement, which a paper sketch does not reproduce. A higher-fidelity prototype with the real text and visual hierarchy is needed.
why: Catches the belief that low fidelity is always the cheap, safe default regardless of the question.
```

```check
q: Why do participants tend to give different kinds of feedback on a rough sketch than on a polished mock-up?
a: A rough sketch looks unfinished, so people feel free to challenge the idea itself. A polished mock-up looks decided, so comments shift to surface details like colours and fonts.
why: Catches the assumption that higher fidelity simply means better feedback.
```

```check
q: Can a prototype be low fidelity on one dimension and high on another? Give an example.
a: Yes. A greyscale wireframe with no styling can carry the real labels and error messages, making it low visual fidelity but high content fidelity, which suits testing wording.
why: Catches treating fidelity as a single scale from rough to finished.
```
