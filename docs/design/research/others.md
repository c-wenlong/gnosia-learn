# Other products worth stealing from

Five products chosen for this platform's tutoring loop, mastery model, and asset
library. Dropped: Quizlet (its learn mode and progress ring are a subset of
what Anki and RemNote already cover), Logseq (near-identical graph view to
Obsidian, smaller user base, less documentation), Linear and Raycast (this
platform is content-heavy with video and diagram assets, not a command-driven
tool, so a quiet keyboard-first UI is the wrong reference), and Perplexity or
ChatGPT canvas (the chat-plus-document split matters less than the mastery and
review surfaces, and NotebookLM already covers that pattern elsewhere).

## Math Academy

### Why it fits

Math Academy is the closest existing product to this platform's mastery model:
a knowledge graph of prerequisite-linked topics, a Bayesian-style mastery score
per topic, and a daily XP target sequencing what to work on next. Its dashboard
is dense by design, showing XP, streak, and the task queue on one screen rather
than hiding progress behind a single "continue" button.

### Patterns worth adapting

- The knowledge graph rendered as a real directed graph with courses as
  clusters and prerequisite edges, not a flat list or tree.
  `assets/math-academy/knowledge-graph-calculus.png`
- A dashboard that puts XP earned today, the day's task queue, and diagnostic
  history on one screen, no tab-switching required.
  `assets/math-academy/dashboard-xp-tasks.jpg`
- The "active learning loop" diagram: diagnose, learn, review, repeat, drawn
  as a cycle rather than described in prose.
  `assets/math-academy/active-learning-loop.png`
- The diagnostic report that turns a placement test into a per-topic starting
  mastery estimate before any teaching happens.
  `assets/math-academy/diagnostic-report.png`

### Risk of copying it

The knowledge graph gets unreadable past a few hundred nodes even for Math
Academy itself; their own team has published complaints about the same
problem. A direct copy needs a real answer for how the graph degrades as this
platform's concept count grows past what a course-sized subgraph can show.

## Anki

### Why it fits

Anki is the review flow this platform's spaced-repetition feature is closest
to functionally: a queue of due cards, a single reveal-then-rate interaction,
and a scheduler that reacts to the rating. The four-button "again / hard /
good / easy" rating is the most tested self-rating UI in this space, refined
over two decades of user feedback.

### Patterns worth adapting

- The four-button rating row directly under the revealed answer, each button
  labeled with its resulting interval so the rating and its consequence sit
  next to each other.
  `assets/anki/review-buttons-again-hard-good-easy.png`
- Keeping the buttons visually distinct but equal-weight, so "hard" doesn't
  read as a failure state the way a red "wrong" button would.
  `assets/anki/review-buttons-alignment-forum.png`
- A stats view that shows review count, retention, and streak together, not
  three separate screens.
  `assets/anki/stats-dashboard-progress-trend.png`
- The calendar heatmap of past review activity, the same shape GitHub made
  familiar for commits.
  `assets/anki/review-heatmap-addon.jpg`

### Risk of copying it

Anki's UI is famously utilitarian and a direct copy will read as dated next
to the narrated video and diagram assets this platform already has. Keep the
four-button rating, not the flat grey chrome around it.

## RemNote

### Why it fits

RemNote runs notes, flashcards, and an AI tutor chat in one workspace, which
is the same three-way combination this platform is building: markdown concept
notes, spaced-repetition review, and a tutoring agent. Its flashcard queue and
"insights" panel show how a note-taking tool can surface review data without
turning into a separate app.

### Patterns worth adapting

- The flashcard practice queue, reachable from inside a document rather than
  a separate section of the app.
  `assets/remnote/flashcard-queue-official.png`
- Automatic per-card insights (how often missed, last reviewed, current
  interval) shown inline in the queue instead of buried in a stats page.
  `assets/remnote/flashcard-insights-official.png`
- The AI tutor chat panel docked beside notes, answering questions about the
  material without leaving the note.
  `assets/remnote/ai-tutor-chat-official.webp`

### Risk of copying it

RemNote's information density works for power users already committed to its
outliner model; a new learner dropped into that density faces a steep ramp.
Borrow the queue-inside-document and docked-chat patterns, not the
outliner-first architecture.

## Obsidian

### Why it fits

The concept dependency graph in this platform is structurally a linked-note
graph, and Obsidian's graph view plus backlinks panel is the most refined
version of that pattern in general use. Backlinks in particular map onto
"which notes reference this concept," a question the concept graph needs to
answer.

### Patterns worth adapting

- The force-directed graph view with node size reflecting link count, giving
  a felt sense of which notes are hubs.
  `assets/obsidian/graph-view-zapier.png`
- Visibly flagging orphaned, unlinked nodes in the graph rather than hiding
  them, which is a useful signal for concepts nobody has connected yet.
  `assets/obsidian/graph-view-orphan-nodes.png`
- The backlinks panel docked in the sidebar of the currently open note,
  listing every note that links here.
  `assets/obsidian/backlinks-panel-sidebar.png`
- A community-built advanced graph view with per-cluster coloring, useful
  precedent for coloring the graph by mastery level instead of by folder.
  `assets/obsidian/advanced-graph-view-community.webp`

### Risk of copying it

Obsidian's graph view is a known-weak onboarding moment: new users open it,
see a meaningless hairball, and get nothing actionable until their vault has
real structure. A copy needs the graph to default to a filtered view, current
course or one concept's neighborhood, not the whole vault at once.

## Khan Academy

### Why it fits

Khan Academy's course and unit pages are the clearest existing example of a
mastery-colored course map: every skill in a unit is shown with its mastery
level (not started, familiar, proficient, mastered) as a color, and the
course map itself is the primary navigation. This maps directly onto a
course-plus-topic structure with a mastery score per concept.

### Patterns worth adapting

- Mastery shown as a color scale per skill inside a unit, so a learner can
  see weak spots at a glance without opening each skill.
  `assets/khan-academy/unit-mastery-progress-visualization.png`
- The activity/mastery report view that separates "time spent" from "mastery
  gained," making clear the two are not the same thing.
  `assets/khan-academy/activity-overview-mastery-tab.png`
- Mastery goals set at the unit level, with a progress bar toward that goal
  distinct from the skill-level colors.
  `assets/khan-academy/unit-mastery-goals-admin.png`

### Risk of copying it

Khan Academy's mastery levels are a five-step discrete ladder, not a
continuous probability. Forcing a continuous Bayesian mastery score into
Khan's five-color scheme for display would misrepresent the model even if it
reads well.

## Assets

| File | Source URL | What it shows |
| --- | --- | --- |
| `math-academy/knowledge-graph-calculus.png` | https://www.mathacademy.com/img/screenshots/knowledge-graph-calculus2.png | The knowledge graph for the Multivariable Calculus course |
| `math-academy/dashboard-xp-tasks.jpg` | https://www.howtohomeschool.com/curriculum-directory/math/math-academy | Student dashboard with daily XP and task queue |
| `math-academy/active-learning-loop.png` | https://www.mathacademy.com/how-it-works | Diagram of the diagnose-learn-review loop |
| `math-academy/diagnostic-report.png` | https://www.howtohomeschool.com/curriculum-directory/math/math-academy | Per-topic diagnostic report after placement test |
| `anki/review-buttons-again-hard-good-easy.png` | https://www.reddit.com/r/Anki/comments/sh8u3i/ | The four-button review rating row |
| `anki/review-buttons-alignment-forum.png` | https://forums.ankiweb.net/t/align-the-answer-buttons-in-the-reviewer/48079 | Review buttons under a revealed card |
| `anki/stats-dashboard-progress-trend.png` | https://www.reddit.com/r/Anki/comments/1j8p75d/ | Custom stats dashboard combining several charts |
| `anki/review-heatmap-addon.jpg` | https://github.com/ger1atric/interactiveheatmap | Calendar heatmap of daily review activity |
| `remnote/flashcard-queue-official.png` | https://www.remnote.com/feature/flashcard-maker | Official screenshot of the flashcard practice queue |
| `remnote/flashcard-insights-official.png` | https://www.remnote.com/feature/flashcard-insights | Official screenshot of per-card insights in the queue |
| `remnote/ai-tutor-chat-official.webp` | https://www.remnote.com/ | Official screenshot of the AI tutor chat panel |
| `obsidian/graph-view-zapier.png` | https://zapier.com/blog/obsidian-notes/ | Force-directed graph view of a vault |
| `obsidian/graph-view-orphan-nodes.png` | https://www.makeuseof.com/obsidian-plugins-visualize-notes/ | Graph view with unlinked/orphan nodes visible |
| `obsidian/backlinks-panel-sidebar.png` | https://www.reddit.com/r/ObsidianMD/comments/12ylvbj/ | Backlinks panel docked beside an open note |
| `obsidian/advanced-graph-view-community.webp` | https://community.obsidian.md/plugins/graph-insight | Community plugin's clustered, colored graph view |
| `khan-academy/unit-mastery-progress-visualization.png` | https://support.khanacademy.org/hc/en-us/articles/18735142028045 | Mastery color visualization on a unit page |
| `khan-academy/activity-overview-mastery-tab.png` | https://support.khanacademy.org/hc/en-us/articles/5548760867853 | Activity overview report, mastery tab |
| `khan-academy/unit-mastery-goals-admin.png` | https://support.khanacademy.org/hc/en-us/articles/39362505471373 | Unit mastery goal set by an administrator |

## Links

- Math Academy, how it works: https://www.mathacademy.com/how-it-works
- Justin Skycak on building Math Academy's knowledge graph: https://www.justinmath.com/how-math-academy-creates-its-knowledge-graph/
- Anki manual, the review screen and scheduling: https://docs.ankiweb.net/studying.html
- RemNote, spaced repetition feature page: https://www.remnote.com/feature/spaced-repetition
- Obsidian, graph view help page: https://obsidian.md/help/plugins/graph
- Obsidian, backlinks help page: https://obsidian.md/help/backlinks
- Obsidian Design System, Figma Community file: https://www.figma.com/community/file/1172227539881210762/obsidian-design-system
- Khan Academy, what are Course and Unit Mastery: https://support.khanacademy.org/hc/en-us/articles/115002552631-What-are-Course-and-Unit-Mastery
- Khan Academy UI/UX redesign case study (Dribbble): https://dribbble.com/shots/23221924-Khan-Academy-Website-Audit-UI-UX-Redesign-Case-Study
