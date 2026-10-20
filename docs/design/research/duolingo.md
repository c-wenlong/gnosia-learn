# Duolingo UI research

Scope: the path/unit map, streaks, XP/leagues/quests/hearts, lesson-end and
in-exercise feedback, the Feather visual language, and the criticism. Done
for the gnosia tutoring loop (Probe, Plan, Teach, Close) on desktop web,
for an adult who chose to be here, not a child who has to be.

## What it is good at

- Turns "what do I do next" into a single visible path with one obvious next node, so a learner never has to decide where to click.
- Spaces repetition into the path itself (interleaved units) instead of leaving review as a separate chore the learner has to remember to do.
- Gives feedback in under a second, in place, without leaving the exercise: correct or incorrect, then an optional "why" on demand.
- Ends every session with a concrete, specific number (XP, accuracy) instead of a vague "good job," so the learner can tell an okay session from a great one.
- The 3D button and Feather type make every tap feel physical and low stakes, which matters for material that is already cognitively hard.
- Guidebooks put the concept primer at the unit boundary, right before the learner needs it, instead of in a separate reference the learner has to go find.
- Its own published research (habit science, loss aversion, spaced practice) is unusually specific and checkable, not just marketing copy.

## Patterns worth adapting

- **Linear path with one active node.** Removes the "which lesson do I pick" decision that a grid or tree forces; a gnosiaer on a course page benefits the same way a language learner does. Asset: `path-vs-tree-before-after.png`.
- **Unit guidebook before the exercises.** A short primer at the unit boundary maps directly onto a concept note read before Teach starts; it is the one Duolingo mechanic that is pure pedagogy, no game layer at all. Asset: `guidebook-before-after.png`.
- **Answer feedback with an optional "why."** "Correct" or "Incorrect" first, then a real grammar explanation on request, respects an adult's time without hiding the reasoning they came for. Asset: `exercise-feedback-explain-answer.png`.
- **A session-close screen with a real number.** Total XP and percent accuracy give the Close phase something concrete to report, closer to "you got 8 of 10 right" than a generic completion toast. Asset: `lesson-complete-xp-tally.jpg`.
- **A practice hub for weak spots.** A single screen that surfaces mistakes, unit review and word review is close to what a spaced-repetition due queue should look like. Asset: `practice-hub.jpg`.
- **Forgiving streak with built-in leeway.** Duolingo's own data shows leeway (freezes) raised engagement more than strict daily enforcement; a "learning streak" for an adult should default to that leeway, not punish a missed day. Asset: `streak-shop-freeze.png`.
- **Self-set daily target.** A quest reframed as a target the learner picks for themselves ("finish one concept today"), not one the app hands out with a currency reward attached. Asset: `daily-quests.png`.

## Patterns to avoid

- **Hearts / lives that lock the learner out after mistakes.** Losing a life per wrong answer punishes exactly the exploration a hard subject needs, and Duolingo monetizes recovery from it. Source: `hearts-mistake-costs-heart.jpg` and `hearts-out-of-hearts-refill.jpg` (krioda.com); r/duolingo thread "I hate energy, bring back hearts" reports the energy version is worse, not better. An adult working through a hard proof should never be told to stop and wait, or pay, because they got something wrong.
- **Leagues and weekly leaderboards.** A countdown timer, a promotion zone, and strangers ranked by raw XP turn learning speed into a competition against people studying unrelated material. Source: `leaderboard-live-promotion-zone.png` (duolingo.deconstructoroffun.com) and duoplanet's own verdict that "leagues simply aren't an accurate reflection of the thing that matters most." A solo adult learner on a desktop app has no reason to be compared to strangers at all.
- **Streak-break notifications built on FOMO and guilt.** Copy like "Your streak is in danger!" is designed, in the words of one critique, to make you feel "guilty about not engaging." Source: webdesignerdepot.com, "The Art of Duolingo Notifications"; also opinionsandconditions.substack.com, "The Duolingo Owl, Dark Patterns, and Digital Guilt." Reminders should state a fact, never manufacture shame.
- **Paid streak repair.** Letting a lapsed streak be restored for real money or gems turns forgetting into a purchase decision. Source: ashleyeleftheriou.com, "Duolingo: When Gamification Becomes Manipulation," names this "Streak Repair Fees" directly.
- **XP as the only measure of a good session.** An SSRN paper (Espinosa Ospina, "Gamification, Motivation, and Contradiction: A Critical Analysis of Duolingo") argues gamified systems can reward volume over comprehension; multiple reviewers separately note streaks and XP "incentivize minimum effort and easy lessons over meaningful challenge." A mastery model should never let raw XP substitute for demonstrated understanding.

## Visual language

- **Type.** Feather Bold is Duolingo's own custom display face (built with Johnson Banks in 2019, its letterforms drawn from the owl's silhouette), used for headings and buttons. Body copy runs in DIN Round or Nunito, both rounded humanist sans, so nothing on screen has a sharp corner.
- **Color.** Feather Green `#58CC02` is the primary brand color, on a pure white `#FFFFFF` canvas; macaw blue and cardinal red carry information states (correct and incorrect); charcoal `#4B4B4B` and pencil gray `#777777` are the only text grays.
- **Spacing and shape.** Generous whitespace, chunky rounded corners on cards and lesson nodes, and pill shapes (border-radius up to `9999px`) on buttons and badges.
- **The 3D button.** Every primary button carries a solid, un-blurred bottom-shadow 2 to 4px deep, in a darker shade of the button's own color, not a soft drop shadow. On press the shadow collapses and the button shifts down; on release it springs back. This is the single most recognizable piece of the system and the part worth borrowing whole for desktop, since it reads as tactile without needing sound.
- **Motion.** Animation is used deliberately to direct the eye, since a moving object draws attention before a static one does. The mascot blinks every 4 to 6 seconds and plays a spring-eased celebration on milestones; under `prefers-reduced-motion` the confetti and bounce overshoots drop out and transitions collapse to plain fades, so the product stays usable and still feels finished with motion off.

## Assets

19 real screenshots saved to `docs/design/research/assets/duolingo/`.

| File | Source URL | What it shows |
| --- | --- | --- |
| `path-vs-tree-before-after.png` | blog.duolingo.com/new-duolingo-home-screen-design | Official before/after: branching skill tree versus the new linear path |
| `guidebook-before-after.png` | blog.duolingo.com/new-duolingo-home-screen-design | Guidebook icon moving from per-skill to per-unit placement |
| `path-node-start-bubble.png` | blog.duolingo.com/ways-to-practice-in-duolingo | Tapping a path node opens a bubble: "Start +35XP" |
| `path-node-review-bubble.png` | blog.duolingo.com/ways-to-practice-in-duolingo | Tapping a completed (gold) node offers Review (5XP) or Legendary (40XP) |
| `path-section-menu.png` | blog.duolingo.com/how-to-review-lessons-on-duolingo | Section menu showing completed and partly-completed sections |
| `exercise-feedback-correct.png` | blog.duolingo.com/explain-my-answer-now-free | Green "Correct!" bottom bar with an "Explain My Answer" button |
| `exercise-feedback-incorrect.png` | blog.duolingo.com/explain-my-answer-now-free | Red "Incorrect" bottom bar on a wrong translation |
| `exercise-feedback-explain-answer.png` | blog.duolingo.com/explain-my-answer-now-free | Expanded grammar explanation panel after a mistake |
| `lesson-complete-xp-tally.jpg` | reddit.com/r/duolingo (in-app screenshot) | Lesson-complete screen: Total XP 428, 89% accuracy, "Good!" |
| `practice-hub.jpg` | blog.duolingo.com/how-to-keep-your-streak-on-vacation | Practice Hub: unit review, past mistakes, word practice, stories |
| `streak-shop-freeze.png` | blog.duolingo.com/how-to-keep-your-streak-on-vacation | Shop screen, Streak Freeze section (5 of 5 equipped) and gem purchase |
| `streak-calendar-detail.png` | duolingo.deconstructoroffun.com/mechanics/streaks | Streak detail screen with monthly calendar and freeze count |
| `streak-detail-screen-2.png` | revyl.com/atlas/duolingo | Streak detail plus Society screen, from a UI-flow capture |
| `hearts-mistake-costs-heart.jpg` | krioda.com | In-lesson reminder that a mistake costs one heart |
| `hearts-out-of-hearts-refill.jpg` | krioda.com | Out-of-hearts screen offering the first free refill |
| `leaderboard-live-promotion-zone.png` | duolingo.deconstructoroffun.com/mechanics/leagues | Live Obsidian league leaderboard with countdown and promotion-zone marker |
| `leaderboard-tournament-soon.png` | blog.duolingo.com/duolingo-leagues-leaderboards | Leaderboard tab ranking ahead of a tournament |
| `daily-quests.png` | makeuseof.com (in-app screenshot) | Daily Quests screen: progress bars and a reward chest |
| `duolingo-marketing-site-components.webp` | shadcn.io/design/duolingo (full-page capture of duolingo.com) | Marketing site full page: Feather type, button style, color palette, mascot art |

## Links

- Path redesign and the spaced-repetition rationale: https://blog.duolingo.com/new-duolingo-home-screen-design/
- Streak habit and loss-aversion research, with the freeze A/B numbers: https://blog.duolingo.com/how-duolingo-streak-builds-habit/
- How leagues and leaderboards work: https://blog.duolingo.com/duolingo-leagues-leaderboards/
- Shape language and art style: https://blog.duolingo.com/shape-language-duolingos-art-style/
- In-exercise "Explain My Answer" feature: https://blog.duolingo.com/explain-my-answer-now-free/
- Duolingo's design blog hub (design.duolingo.com now redirects here): https://blog.duolingo.com/hub/design/
- Criticism, FOMO and guilt in notifications: https://webdesignerdepot.com/the-art-of-duolingo-notifications-the-subtle-manipulation-of-language-learners/
- Criticism, dark patterns and digital guilt: https://opinionsandconditions.substack.com/p/duolingo-owl-dark-patterns-digital-guilt
- Criticism, gamification good/bad/ugly: https://uxdesign.cc/the-good-the-bad-and-the-ugly-of-duolingo-gamification-3a12f0e80dc7
- Criticism, streak repair fees named directly: https://ashleyeleftheriou.com/2025/01/13/duolingo-when-gamification-becomes-manipulation/
- Academic: Espinosa Ospina, "Gamification, Motivation, and Contradiction: A Critical Analysis of Duolingo" (SSRN): https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6846283
- Unofficial but detailed mechanics reverse-engineering, screenshots included: https://duolingo.deconstructoroffun.com/
- Figma Community, "DuoLingo Design System" (16 screens, fonts, icons): https://www.figma.com/community/file/1460744749282136015/duolingo-design-system
- Figma Community, "Duolingo Unofficial Design Language": https://www.figma.com/community/file/1439600081437366863/duolingo-unofficial-design-language
- Figma Community, "Duolingo App UI, Free UI Kit (Recreated)": https://www.figma.com/community/file/1279168389289425844/duolingo-app-ui-free-ui-kit-recreated
