# Architecture of the AI Learning System

Source: Eero Alvar, ["How I Use AI to Learn Things"](https://www.youtube.com/watch?v=kzcI5F4tGiU)

These are notes on the three-phase system described in that video. This repo
implements a four-phase loop (Probe → Plan → Teach → Close), documented in
[LEARN.md](LEARN.md).

## 1. The diagnosis — why standard learning is lossy

```mermaid
flowchart LR
    subgraph STD["Standard learning: many-to-many"]
        O1[Teacher] --> S1[Learner A]
        O1 --> S2[Learner B]
        O2[Book] --> S1
        O2 --> S2
        O3[Course] --> S1
        O3 --> S2
    end

    STD --> I1["Inefficiency 1<br/>One outlet teaches many<br/>→ optimal for nobody"]
    STD --> I2["Inefficiency 2<br/>One learner uses many outlets<br/>→ style/notation switching cost<br/>→ <b>trust never accrues</b>"]

    I1 --> P1["Principle 1<br/><b>Optimized teaching</b><br/>teach at the edge of understanding"]
    I2 --> P2["Principle 2<br/><b>Optimized allocation of<br/>mental resources</b><br/>struggle in material, not logistics"]
```

**The collapse to 1:1.** Ideal = one teacher per student *and* one teacher for that student.
The objection "one teacher = one perspective" conflates **source** with **interface** — the AI
aggregates all sources and delivers them through a single interface. Trust is not earned over
time; it is *engineered* via verification and fact-checking sub-agents.

## 2. The runtime — three phases

```mermaid
flowchart TD
    GOAL(["Learner states goal<br/>e.g. 'solid intro to differential forms'"]) --> PROBE

    subgraph PROBE["Phase 1 — PROBE"]
        Q1[Quiz tool:<br/>graded multiple-choice] --> Q2[Start broad]
        Q2 --> Q3["Binary-search the edge<br/>on every dependency strand"]
        Q3 --> MAP[(Detailed map of<br/>current understanding)]
        Q3 -.->|not converged| Q2
    end

    MAP --> PLAN

    subgraph PLAN["Phase 2 — PLAN"]
        R1["Reason out: how do I teach<br/><i>this mind</i> <i>this thing</i>?"] --> FC
        FC[["Verification / fact-check<br/>sub-agents (fired here)"]] --> DAG
        DAG["Emit Mermaid dependency DAG<br/>current understanding → goal"]
    end

    DAG --> TEACH

    subgraph TEACH["Phase 3 — TEACH"]
        W["Walk the DAG<br/><b>one reasoning step at a time</b>"] --> V
        V[["Visualization sub-agents<br/>write SVG → view it → fix it"]] --> EXP
        EXP[Explanation + embedded visual]
        EXP --> CHK{Periodic quiz:<br/>did it actually land?}
        CHK -->|yes| NEXT[Next node in DAG]
        CHK -->|no| REEXP[Re-explain / back up]
        REEXP --> EXP
        NEXT --> W
    end

    CHK -.->|recalibrate model of learner| MAP
```

### Why each mechanism exists

| Mechanism | Real reason |
|---|---|
| Quiz tool in probe | Optimal teaching depends entirely on current understanding — so measure it |
| Mermaid DAG shown to learner | Nominally previews what's coming; **actually forces the model to reason it all out** so it can't wing it |
| One reasoning step at a time | Chat models rush; slow steps stay digestible and leave room to ask |
| Periodic quizzes | (1) you can gaslight yourself into "I understood"; (2) keeps the system calibrated; (3) application locks learning in |
| Sub-agents for visuals/facts | Preserve main context, and the sub-agent *looks at its own SVG* to verify it |

## 3. The implementation stack

```mermaid
flowchart TB
    subgraph UI["Interface layer"]
        OB["Obsidian<br/>(LaTeX render, embedded SVGs,<br/>persistent session artifacts)"]
        YAP["Scratch note —<br/>learner yaps reasoning as extra context"]
    end

    subgraph HARNESS["Pi agent harness — learning dir"]
        SKILL["<b>teach</b> skill<br/>(the learning philosophy lives here)"]
        VIZ[visualization skill]
        EXT1[quiz extension]
        EXT2["md-log extension<br/>(links a .md file to the session)"]
        SA1(["SVG-maker sub-agent"])
        SA2(["researcher / fact-check sub-agent"])
    end

    MODEL{{"Frontier model — model<br/>intelligence materially matters"}}

    SKILL --> MODEL
    SKILL --> EXT1
    SKILL --> VIZ
    VIZ --> SA1
    SKILL --> SA2
    EXT2 --> OB
    SA1 --> OB
    YAP --> SKILL
    EXT1 --> OB
```

## 4. The load-bearing insight

The architecture is scaffolding. What actually made it work is the **teaching philosophy**
installed into the `teach` skill, which controls exactly two things:

1. **The learning arc** — the path from current understanding → goal understanding.
2. **The individual steps** — each explanation along the way.

Everything else (probing, planning, verification, rendering, logistics) exists so that
100% of the learner's cognitive effort lands on the material itself.
