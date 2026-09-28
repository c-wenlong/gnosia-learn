---
id: mental-models
title: Mental models and conceptual models
summary: "Norman's three models: the designer's conceptual model, the user's mental model, and the system image, the product itself, which is the only bridge between them."
requires: []
tags: [hci]
sources: []
created: 2026-09-28T15:30:48.723Z
---

# Mental models and conceptual models

Don Norman describes three models at play whenever someone uses a designed thing. The designer holds a conceptual model of how the system works. The user builds a mental model of it from experience, and the only thing connecting the two is the system image: what the product itself shows, says and does.

## Why it matters

Users rarely talk to the designer. They form their model from the product alone, so a misleading system image produces a wrong model, and actions that fail in ways the team finds baffling.

## The idea

| Model | Held by | Built from |
| --- | --- | --- |
| Conceptual (design) model | Designer | Intentions and the real workings |
| Mental (user's) model | User | Appearance, behaviour, feedback, experience with similar things |
| System image | The product | Controls, labels, layout, responses, manuals |

A mental model does not need to be technically accurate. It needs to predict what an action will do well enough to act on. Thinking of a file as sitting "inside" a folder works for everyday use, though storage does not work that way.

When the system image maps poorly between the two models, Norman names two gulfs. The gulf of execution is the gap between what the user wants to do and what the system shows they can do: "how do I make it do this?" The gulf of evaluation is the gap between what the system did and what the user can tell happened: "did it work?" Visible, well-labelled controls narrow the first. Clear, timely feedback narrows the second.

CS2111 (Human-Centred Computing) places this under its Foundations of HCI module.

## Worked example

A home thermostat has a dial marked 15 to 30 degrees. Many people believe it works like a tap: turn it higher and the room heats faster. So on a cold morning they turn it to 30. Many heating systems are simply on or off, running at full power until the set temperature is reached, so a higher setting heats no faster and just overshoots. The designer's model is "a target temperature"; the user's model is "a heating speed". The system image, a numbered dial with no sign of whether the heater is running, never corrects them. A display reading "Heating to 21" plus a light showing the heater is on would narrow both gulfs.

## Failure modes

- **Assuming the user shares your model.** Notice it when support tickets describe the product in words the team never uses.
- **Hidden state.** Modes, background syncing or queued actions with no visible sign. Users build wrong models because the system image leaves out what matters.
- **Missing feedback.** An action produces no visible change, widening the gulf of evaluation, so users repeat it. Double submissions are a symptom.
- **Inconsistent behaviour.** The same control does different things in different places, so no stable model forms.

## Checks

```check
q: A user clicks 'Save' repeatedly because nothing on screen changes after the first click. Which of Norman's gulfs is this, and what kind of fix targets it?
a: The gulf of evaluation: the user cannot tell whether the action worked. Clear, immediate feedback, such as a 'Saved' message or a changed button state, narrows it.
why: Catches mixing up the two gulfs; the user knew what to do (execution was fine) but not what happened.
```

```check
q: In Norman's three-model framing, why can a designer not rely on explaining the design to users to fix their wrong mental models?
a: Designers and users rarely communicate directly; the system image, meaning the product itself, is the only reliable bridge. The fix has to go into what the product shows and does.
why: Catches the assumption that documentation or training is the main way users learn how a system works.
```

```check
q: Does a user's mental model have to be technically correct to be useful?
a: No. It only has to predict what actions will do well enough to act on; thinking of a file as 'inside' a folder is technically loose but works for everyday use.
why: Catches the belief that the design goal is to teach users the system's true internals.
```
