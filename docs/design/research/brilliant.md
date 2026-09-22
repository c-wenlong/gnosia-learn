# Brilliant.org design research

Web and mobile UI, 2024-2026. Sources: brilliant.org marketing site, app store
listings, screensdesign.com's flow capture, nibble-app.com and e-student.org
reviews, Reddit, Hacker News, the ustwo.com case study.

## What it is good at

- Turns an abstract idea into a manipulable object in the first ten seconds
  of a lesson: a scale, a graph, a slider, a block-code canvas, sitting right
  inside the question text instead of below a wall of prose.
- Runs a real diagnostic before teaching: asks a placement question, then
  builds a named skill-gap plan ("Let's build up a few skills first") instead
  of dropping every learner at lesson one.
- Keeps one idea per screen with a thin top progress bar, so a learner always
  knows how much of the lesson is left without leaving the lesson.
- Answers wrong-ness with an AI tutor turn ("Not quite. Let's try looking at
  this another way...") rather than just a red X, before it shows the formal
  explanation.
- Treats "Why" as opt-in, not mandatory: the explanation is a separate button
  next to Continue, so a learner who already gets it is not forced to read it.
- Streak and XP exist but stay small: a number and a lightning icon, no fire
  animation, no leaderboard, no social pressure loop.
- Course home reads as a catalog (subject tabs, card grid) on mobile and as a
  connected skill tree (node clusters joined by lines, grouped into named
  units) on desktop, so the same content supports browsing and pathing.

## Patterns worth adapting

- **Widget-in-prose lesson flow.** The interactive object (a draggable scale,
  a graphed line) sits directly between the prose and the multiple-choice
  answers, so the learner manipulates the thing the question is about before
  picking an answer. Shown in `brilliant-lesson-quiz-widget-explanation.webp`.
- **Opt-in "Why" over forced explanation.** Getting a question wrong shows a
  single "Incorrect" label plus a "Why" button beside "Continue", not a
  block of text the learner has to scroll past. Shown in
  `brilliant-reddit-answer-marked-incorrect.jpeg`.
- **Diagnostic-driven skill plan.** A short placement quiz produces a named
  list of missing skills before the first real lesson, which is a much more
  legible "why am I starting here" than a generic level number. Shown in
  `brilliant-marketing-mastery-assessment-plan.png`.
- **Conversational wrong-answer intervention.** An AI tutor turn softens a
  wrong answer before the formal explanation loads, which reads as coaching
  rather than grading. Shown in `brilliant-marketing-lesson-koji-intervention.png`.
- **Quiet streak, not a game.** The streak screen is one number and one
  lightning icon on a plain background, no fire, no combo multiplier, no
  compare-to-friends. Shown in `brilliant-free-vs-premium-streak.webp`.
- **Skill tree as course map.** Units are drawn as clusters of small square
  nodes joined by connector lines, so a learner can see which lessons belong
  to which unit at a glance. Shown in `brilliant-course-library-desktop.png`.
- **Inline micro-celebration on correct.** A checkmark and "+15 XP" appear
  inline next to the widget itself, not a full-screen interrupt. Shown in
  `brilliant-course-math-fractions.webp`.
- **Live code-and-output split.** A block-code editor and its rendered
  output sit side by side in the same card, so cause and effect are visible
  without switching screens. Shown in `brilliant-course-programming.webp`.

## Patterns to avoid

- **Hint or solution reveal spent without warning, then paywalled.** A
  Reddit user in r/assholedesign reported losing their one free "reveal
  answer" without being told it was limited; the older web UI in
  `brilliant-reddit-reveal-answer-hint.jpg` shows the same shape: "Your
  first solution is free! Upgrade to Premium" right under the explanation.
- **"Constant praise for easy questions."** A r/math thread on whether
  Brilliant is more than entertainment argues the UI's positive feedback
  fires on questions that are not actually hard, which erodes trust once a
  learner notices ("How effective is Brilliant.org really?", r/math).
- **Free tier hard-gated mid-path by a daily limit.** The nibble-app review
  and a r/matheducation thread both describe hitting a wall inside a course
  in progress ("you're out of keys for today"), not at a natural boundary.
- **Visual-only explanations skip the derivation some learners want.** A
  r/learnmath thread, "Honest thoughts on Brilliant.org," says the app
  favors visual intuition over showing the proof or working, which left
  that reader more confused, not less.
- **Trading community for paywalled courses.** Long-time users on r/math
  ("Is Brilliant worth the money?") and a Hacker News thread on Brilliant
  shutting down its wiki and community section both read the move as
  revenue-driven, not learner-driven, and preferred the old product.
- **Tap-Continue fatigue.** A r/learnmath thread titled "Brilliant.org is
  frustrating" says the pacing feels slower than Khan Academy for a learner
  who already has some background and just wants the content.

## Visual language

- **Palette:** off-white lesson canvas, one accent color per subject in the
  course-home cards (blue for math widgets, orange/lime for programming and
  marketing chrome), green reserved for "Correct" and XP, near-black for
  primary buttons. The desktop course library flips to a near-black
  background with the same accent colors on card icons.
- **Typography:** a bold, geometric, slightly rounded sans for headings
  ("Recommendations", "Lesson complete!"); a serif math-typesetting font
  (KaTeX-style) for every equation and number inside a widget; a plain sans
  for body prose and answer options. Math notation is never rendered as a
  plain-text approximation.
- **Spacing:** one question fills the full screen height on mobile, with the
  widget centered and generous vertical padding above and below it; the
  progress bar is a thin two-pixel bar pinned to the top, not a chunky
  header.
- **Illustration:** flat, slightly 3D geometric icons per topic tile (an
  easel, a scale, stacked cubes), plus a small mascot character ("Blorb" per
  the ustwo.com case study) that appears at moments of success or struggle.
- **Motion:** correct answers get an inline checkmark and "+XP" pop, not a
  modal; loading between screens uses a generative tangram-style animation
  tied to the subject; draggable widget handles show a visible white
  circle-with-dot grab affordance so the interaction reads as touchable
  before the user tries it.
- **Mobile vs desktop:** mobile is a strict single-column widget-then-quiz
  flow; desktop keeps the same centered single lesson column but replaces
  the mobile course list with a wider two-dimensional skill-tree grid of
  node clusters and connector lines, grouped under named unit headers.

## Assets

| File | Source URL | What it shows |
| --- | --- | --- |
| brilliant-marketing-lesson-koji-intervention.png | brilliant.org/loggedOutHomepage/trust-lesson-interventions.png | AI tutor ("Koji") chat bubble intervening after a wrong answer |
| brilliant-marketing-mastery-assessment-plan.png | brilliant.org/loggedOutHomepage/trust-mastery-assessments.png | Diagnostic-driven "Let's build up a few skills first" skill plan |
| brilliant-course-library-desktop.png | e-student.org/wp-content/uploads/2026/06/Brilliant-org-library.png | Desktop dark-mode course library: skill-tree node clusters per unit |
| brilliant-free-vs-premium-streak.webp | nibble-app.com (Storyblok CDN) | Locked lesson node ("out of keys for today") beside the streak-started screen |
| brilliant-onboarding-persona-picker.webp | screensdesign.com/showcase/brilliant-learn-by-doing | "Which describes you best?" onboarding picker |
| brilliant-onboarding-math-level.webp | screensdesign.com/showcase/brilliant-learn-by-doing | Diagnostic "math comfort level" picker with rendered equations |
| brilliant-premium-trial-paywall.webp | screensdesign.com/showcase/brilliant-learn-by-doing | "How your Premium free trial works" paywall timeline |
| brilliant-course-recommendations-grid.webp | screensdesign.com/showcase/brilliant-learn-by-doing | Post-onboarding course recommendation card grid |
| brilliant-lesson-quiz-widget-explanation.webp | screensdesign.com/showcase/brilliant-learn-by-doing | Draggable weight-scale widget above a multiple-choice quiz, Submit/Explanation buttons, top progress bar |
| brilliant-lesson-complete-xp.webp | screensdesign.com/showcase/brilliant-learn-by-doing | "Lesson complete!" end screen with total XP |
| brilliant-course-math-fractions.webp | nibble-app.com (Storyblok CDN) | Course home subject tabs over a "Correct! +15 XP" fraction-triangle widget |
| brilliant-course-programming.webp | nibble-app.com (Storyblok CDN) | Block-code puzzle widget with live turtle-graphics output |
| brilliant-course-data-science.webp | nibble-app.com (Storyblok CDN) | Data Analysis course home with a clustering scatterplot preview |
| brilliant-course-science-quantum.webp | nibble-app.com (Storyblok CDN) | Science course home with a quantum mechanics lesson preview |
| brilliant-course-logic-python.webp | nibble-app.com (Storyblok CDN) | Logic and Deduction / "Thinking in Python" course home |
| brilliant-reddit-answer-marked-incorrect.jpeg | reddit.com/r/mathematics/comments/1fda8w4 | "Incorrect" state on a drag-the-line graphing widget, with Why/Continue |
| brilliant-reddit-reveal-answer-hint.jpg | reddit.com/r/assholedesign/comments/a9iavl | Older web UI: explanation panel gated behind "first solution is free" paywall |

## Links

- ustwo.com case study on the Brilliant redesign: https://ustwo.com/work/brilliant/
- screensdesign.com Brilliant flow capture: https://screensdesign.com/showcase/brilliant-learn-by-doing
- nibble-app.com "Is Brilliant worth it": https://nibble-app.com/blog/is-brilliant-worth-it
- e-student.org Brilliant review: https://e-student.org/brilliant-org-review/
- Figma Community, "Brilliant UI - Free UI Kit (Recreated)": https://www.figma.com/community/file/1279164791495141287/brilliant-ui-free-ui-kit-recreated
- HN: Brilliant shutting down its community/wiki section: https://news.ycombinator.com/item?id=27523795
- HN: "Ask HN: Is Brilliant.org Worth It?": https://news.ycombinator.com/item?id=29881011
- Reddit r/math, "How effective is Brilliant.org really?": https://www.reddit.com/r/math/comments/1ccphrg/how_effective_is_brilliantorg_really/
- Reddit r/math, "Is Brilliant worth the money?": https://www.reddit.com/r/math/comments/8oswo4/is_brilliant_worth_the_money/
- Reddit r/learnmath, "Honest thoughts on Brilliant.org": https://www.reddit.com/r/learnmath/comments/18yei5q/honest_thoughts_on_brilliantorg/
- Reddit r/learnmath, "Brilliant.org is frustrating": https://www.reddit.com/r/learnmath/comments/1hswedy/brilliantorg_is_frustrating/
- Reddit r/matheducation, "What do you think about brilliant.org?": https://www.reddit.com/r/matheducation/comments/1oauodc/what_do_you_think_about_brilliantorg/
- Reddit r/assholedesign, reveal-answer complaint: https://reddit.com/r/assholedesign/comments/a9iavl/brilliantorg_didnt_tell_me_before_hand_that_i
