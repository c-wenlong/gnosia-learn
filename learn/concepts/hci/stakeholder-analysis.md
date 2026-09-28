---
id: stakeholder-analysis
title: Stakeholder analysis
summary: Identifying everyone who uses, is affected by or has a say over a system, sorting them into tiers and by power and interest, and resolving their conflicting needs.
requires: []
tags: [hci]
sources: []
created: 2026-09-28T15:31:30.928Z
---

# Stakeholder analysis

A stakeholder is anyone who uses a system, is affected by it, or has a say over it. Stakeholder analysis identifies them, sorts them by how they relate to the system, and works out what each needs and how much influence each has.

## Why it matters

Systems fail when a group nobody consulted rejects them: the manager whose reports break, or the regulator whose rules are missed. Listing stakeholders early surfaces requirements and conflicts while they are cheap to handle.

## The idea

A common three-tier split, shown for a hospital booking system:

| Tier | Who | Example |
| --- | --- | --- |
| Primary | Direct, frequent users | Receptionists booking appointments |
| Secondary | Occasional or indirect users, including people who receive outputs | Doctors reading the day's schedule; patients receiving reminders |
| Tertiary | Affected by the system, or with a say in it, without using it | Finance, who pay; regulators; IT, who maintain it |

Sources draw these lines slightly differently. Some place people who only receive outputs in the tertiary tier, and some textbooks add a fourth group of facilitating stakeholders who build and maintain the system. The labels matter less than making sure no group is missed.

A second common tool is the power-interest grid. Plot each stakeholder by power over the project and interest in it: manage high-power, high-interest groups closely; keep high-power, low-interest groups satisfied; keep low-power, high-interest groups informed; monitor the rest.

Needs often conflict. Make the conflict explicit, go back to the goal behind each demand, and look for a design that serves both goals. If none exists, whoever owns the decision should make the trade-off openly instead of letting the design settle it by accident.

CS2111 (Human-Centred Computing) places this under its Understanding Users module.

## Worked example

A university builds an attendance app. Students (primary) want fast check-in and minimal tracking. Lecturers (secondary, they read the reports) want accurate data. The registry (tertiary, sets policy) needs attendance records for compliance reporting. The data protection office (tertiary) restricts location tracking.

The first design tracks phone location throughout the lecture, which satisfies the registry but breaks the data protection rules and annoys students. Going back to goals, the registry needs proof of presence in class, not a location history. A code shown on the lecture screen and valid for two minutes meets that goal, checks students in quickly, and stores no location at all.

## Failure modes

- **Primary users only.** The system delights its operators and is blocked by a group nobody talked to. Ask who pays, who approves and who receives outputs.
- **Tier mistaken for importance.** Tertiary stakeholders often hold the most power, such as the budget or a legal veto.
- **Hidden conflicts.** One group's demand is quietly chosen, and the losing group finds out at launch.
- **A one-off list.** Stakeholders change as a project moves, so the list goes stale.

## Checks

```check
q: Patients never touch a hospital booking system but receive its reminder messages. Which stakeholder tier are they in, and why is the answer not fixed?
a: Usually secondary, since they receive the system's outputs without operating it. Some sources would call them tertiary because definitions of the tiers differ; what matters is that they are identified and their needs considered.
why: Catches treating the primary, secondary and tertiary tiers as one standard with fixed boundaries.
```

```check
q: A regulator has a legal veto over your product but pays it little attention. Where does it sit on a power-interest grid, and how should the team treat it?
a: High power, low interest: keep it satisfied. Meet its requirements and avoid surprising it, without the close involvement given to high-power, high-interest stakeholders.
why: Catches the assumption that stakeholders who pay little attention can be ignored.
```

```check
q: Two stakeholders make conflicting demands. What should the team do before simply picking one side?
a: Make the conflict explicit and go back to the goal behind each demand, since a design that meets both goals often exists. If none does, the decision owner should make the trade-off openly.
why: Catches treating stated demands as fixed requirements rather than as proposed solutions to underlying goals.
```
