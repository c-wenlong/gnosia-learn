---
id: problem-validation
title: Validating the problem before the solution
summary: Show a problem is real, frequent and painful, using evidence of past behaviour and workarounds, before committing to any solution.
requires: []
tags: [product]
sources: []
created: 2026-09-28T15:33:02.818Z
---

# Validating the problem before the solution

Problem validation means collecting evidence that a problem is real, frequent and painful before you build anything to solve it. The strongest evidence is behaviour: people who truly have the problem already spend time or money on some workaround. Only once the problem holds up do you ask whether your solution is the right one.

## Why it matters

Teams usually fall for a solution first, then look for a problem to justify it. That hides the most expensive risk: nobody cares enough to change what they do today. A week of conversations can save months of building.

## The idea

CS3216 (Software Product Engineering for Digital Markets) places this under its Product Thinking module.

Keep the problem (who struggles, doing what, blocked by what) apart from the solution (what you would build). A problem can be real while your solution is wrong, so test them separately, problem first.

Three signals make a problem worth solving:

- **Real:** they can describe a specific recent instance.
- **Frequent:** it happens often, weekly rather than yearly.
- **Painful:** they already spend time, money or effort on a workaround.

Good evidence comes from past behaviour, not opinions about the future. Rob Fitzpatrick's The Mom Test (2013) gives interview rules for this: talk about their life, not your idea; ask about specific past events, not hypotheticals; listen more than you talk. "Would you use an app that..." invites polite yeses. "Tell me about the last time you..." gets facts.

Finally, list your assumptions and test the riskiest one first: the one most uncertain and most damaging if false. Often that is whether the pain is strong enough to make people switch.

## Worked example

A team wants to build an app that splits grocery bills among flatmates. They interview twelve students about their last shared purchase.

Nine describe a recent instance, so the problem is real, and most say it happens weekly. But asked what they do now, eight say a group chat plus a bank transfer works fine. Only two have built a tracking spreadsheet, and both live in flats of five or more.

The riskiest assumption, that the pain is strong enough to switch, fails for small flats. The team narrows to large shared houses and interviews that group next.

## Failure modes

- **Pitching instead of listening.** The interview becomes a demo and people respond to your enthusiasm. Notice it when you did most of the talking.
- **Hypothetical questions.** "Would you pay for this?" costs the speaker nothing to answer. Notice it when your notes hold predictions, not stories.
- **Counting compliments.** Praise commits no one. Look for time, money or introductions offered instead.
- **Testing the easy assumption.** Checking what you already believe while the risky one waits.

## Checks

```check
q: A founder asks 20 people "Would you use an app that reminds you to water your plants?" and 17 say yes. Why is this weak evidence, and what should they ask instead?
a: It asks for an opinion about the future, which costs the speaker nothing and invites politeness. They should ask about past behaviour, such as the last time a plant died and what they did about it, and whether they already use any workaround.
why: Catches treating stated interest in a hypothetical as proof that a problem is real.
```

```check
q: Interviews show a problem happens weekly, but nobody has tried any workaround. Which of the three signals is missing, and what does that suggest?
a: Pain is missing: if people spend no time or money working around it, the problem is probably tolerable. That suggests they may not switch to a new product to fix it.
why: Catches assuming that a frequent problem is automatically a painful one worth solving.
```

```check
q: A team has assumptions about whether students want the feature, whether a model can do it, and which colour scheme appeals. How should they choose which to test first?
a: Test the riskiest one first: the assumption that is most uncertain and would end the project if false. Colour scheme is low risk; whether students care at all is usually the riskiest.
why: Catches testing whatever is easiest or most fun rather than what could sink the project.
```
