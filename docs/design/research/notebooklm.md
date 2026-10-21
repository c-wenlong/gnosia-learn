# NotebookLM UI research (2025-2026)

Research for reimagining gnosia's UI around a "digital notebook" model,
using Google NotebookLM as the base interaction pattern.

## What it is good at

- Turns a pile of raw sources (PDF, video, audio, web link) into one bounded
  context the AI answers from, so answers never wander off the material the
  learner actually provided.
- Every chat answer carries inline citations back to a source passage, the
  trust mechanism a tutoring product needs before a learner acts on a claim.
- Treats "notes" as a first-class, editable object a chat answer can be
  pinned into, and a note can be promoted back into a source, closing the
  gap between reading and writing.
- The Studio panel turns one set of sources into several output formats
  (audio, video, mind map, flashcards, quiz, report) from a single click,
  so the same material serves different study modes without re-uploading.
- Flashcards and quizzes persist progress across sessions and mark
  right/wrong per card, the seed of a spaced-repetition loop.
- The three-panel model (sources, chat, studio) keeps "what I read," "what I
  asked," and "what I made" visually distinct instead of one infinite
  chat thread.

## Patterns worth adapting

- **Three-panel workspace (sources / chat / studio).** Keeps input material,
  conversation, and generated artifacts in their own column instead of
  burying study outputs in chat scrollback. `three-panel-layout-empty-notebook.png`,
  `three-panel-layout-google-blog.gif`.
- **Save-to-note, then note-to-source.** A useful chat answer becomes a
  pinned note in one click, and a note converts into a source the AI can
  cite later, so a learner's own synthesis re-enters the knowledge base.
  Documented in the official help pages below; no single screenshot
  captures the loop.
- **Inline citations with source-passage grounding.** Every chat claim links
  to the exact passage it came from, the piece gnosia's mastery model
  needs to justify a concept note. `notebooklm-sources-chat-studio-panel.png`.
- **One Studio panel, many output formats.** Audio, video, mind map,
  flashcards, quiz and report sit as tiles in one panel, all generated from
  the same source set. `studio-panel-tools-grid.png`.
- **Mind map as a navigable structure, not just a picture.** It is clickable
  and re-enters chat at a node, turning a static diagram into a navigation
  aid. `mind-map-feature.jpg`.
- **Flashcard/quiz results with Got it / Missed it.** A lightweight
  self-report loop, the natural hook for spaced repetition.
  `flashcard-front.png`, `quiz-results.png`.
- **Cinematic video overview as a generated teaching asset.** A narrated
  walkthrough generated straight from sources, mapping onto gnosia's own
  manimkc pipeline. `video-overview-techcrunch.png`, `video-overview-cnet.png`.
- **A single "configure the assistant" dialog** (conversational goal:
  Default / Learning Guide / Custom, plus response length) instead of
  scattering tone controls through settings. `configure-chat-window.jpg`.

## Patterns to avoid

- **Overloaded chrome.** A Hacker News thread on the designer's own case
  study (news.ycombinator.com/item?id=45315312) says the interface has "low
  info density, way too many cards/buttons/sections/icons" and "makes the
  core UX really difficult... to navigate."
- **Panels that cannot be resized independently.** Same thread: the chat
  panel eats roughly two-thirds of the screen with no way to shrink it; one
  commenter asked "why force the users read a 2000 word essay in a 360px
  sidebar?"
- **Chat and Studio feel redundant.** Reddit (r/notebooklm, "Thoughts on the
  UI", "NotebookLM could be way better") reports users cannot tell when to
  use chat versus a Studio tool.
- **No durable chat history.** Reddit threads ("Saving/archiving answers in
  notebooks?", "NoteBookLM chat history") describe losing conversations
  because nothing autosaved unless the user hit "save to note"; gnosia
  should default to persisting everything from the start.
- **Mobile app treated as an afterthought.** A Reddit thread calls the
  mobile app "an embarrassment" next to the desktop web app.
- **No custom structure (folders, tags).** Reddit ("How do you use
  NotebookLM? Not convinced of it yet") says there is "almost no
  customization (e.g., create folders)."
- **Power users hit a simplified floor.** A Reddit thread ("TO THE DEVS. FIX
  NOTEBOOK LM. PLEASE.") complains a 50-item quiz request gets silently
  downgraded to a fixed-size widget.

## Visual language

- **Base system: Material 3 Expressive**, Google's 2025 redesign favoring
  heavier type weights, larger corner radii, bigger touch targets, and
  bolder color blocks over the flatter Material 3 baseline. Rounded chips
  and pill buttons read as a direct descendant of that system.
- **Panels are flat, low-contrast surfaces**: each column sits on a
  near-white (near-black in dark mode) background with a thin vertical
  divider, no drop shadows, so the eye reads three zones, not floating
  cards.
- **Source and Studio items are rounded-rectangle cards** with a colored
  icon chip top-left, a one-line title, and a muted metadata line.
  `studio-panel-tools-grid.png`, `source-options-panel.png`.
- **Typography leans on Google Sans**: a heavier, larger weight for headers
  and card titles, a lighter regular weight for body and citation text.
- **Density is generous, not compact.** Card padding, chat line height and
  tile spacing read closer to a marketing page than a data-dense tool (see
  Patterns to avoid).
- **Color coding by function, not brand**: blue marks AI-authored content (a
  "Saved Response" note is labeled in blue), source icons use distinct hues
  per file type.
- **Dark mode is a first-class, official toggle** (Dark / Light / Device),
  defaulting to the OS setting.
- **Motion is restrained**: a Studio tool expanding to fill more width
  animates as a smooth width change, not a modal pop-in.

## Assets

| File | Source URL | What it shows |
| --- | --- | --- |
| `three-panel-layout-empty-notebook.png` | academictech.uchicago.edu/2026/04/06/google-notebooklm-an-ai-tool-for-research-and-studying | Empty notebook: Sources / Chat / Studio columns, no content, the raw layout skeleton |
| `three-panel-layout-google-blog.gif` | blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-new-features-december-2024 | Official Google Labs animation of the three-panel UI with sources loaded |
| `notebook-home-dashboard.png` | whytryai.com/p/notebooklm-guide | The notebook home/gallery screen: grid of notebook cards |
| `notebooklm-sources-chat-studio-panel.png` | xda-developers.com/notebooklm-limitations/ | Full three-panel view with real content: sources, chat with citations, studio tiles |
| `studio-panel-tools-grid.png` | codecademy.com/article/how-to-use-notebooklm | Studio tile grid: Audio, Video, Mind Map, Reports, Flashcards, Quiz |
| `flashcards-generating-studio-panel.gif` | codecademy.com/article/how-to-use-notebooklm | Animated: flashcard deck generating inside the Studio panel |
| `flashcard-front.png` | xda-developers.com/cant-use-notebooklm-without-these-features/ | Front face of a single flashcard mid-review |
| `quiz-results.png` | xda-developers.com/cant-use-notebooklm-without-these-features/ | Quiz results screen after finishing a generated quiz |
| `mind-map-feature.jpg` | androidpolice.com/google-notebooklm-interactive-mind-maps/ | Interactive mind map generated from a notebook's sources |
| `video-overview-techcrunch.png` | techcrunch.com/2025/07/29/googles-notebooklm-rolls-out-video-overviews/ | Video Overview generation, press coverage of the launch |
| `video-overview-cnet.png` | cnet.com/tech/services-and-software/notebooklm-gets-video-overviews-along-with-upgraded-studio-panel/ | Video Overview player alongside the upgraded Studio panel |
| `source-options-panel.png` | digitalocean.com/resources/articles/what-is-notebooklm | Add-sources dialog: file upload, Drive, link, paste-text options |
| `configure-chat-window.jpg` | academictech.uchicago.edu/2026/04/06/google-notebooklm-an-ai-tool-for-research-and-studying | "Configure chat" dialog: conversational goal and response length |

13 assets saved, all verified as real image/GIF files over 10KB via `file`.

## Links

- Figma Community, unofficial rebuild of NotebookLM's web UI, part of a "100
  AI Product Design Challenges" series, not Google's own file:
  figma.com/community/file/1529378483971573455
- Jason Spielman, the Google designer credited with NotebookLM's interface,
  case study on the "1,000 iterations" three-panel process and coining
  "Audio Overview": jasonspielman.com/notebooklm
- Roger Wong's write-up reacting to Spielman's case study:
  rogerwong.me/2025/09/designing-notebooklm
- Hacker News thread on the Spielman case study, main source of the
  density/navigation criticism above: news.ycombinator.com/item?id=45315312
- Google Workspace Updates, March 2026, on EPUB sources, slide revisions,
  cinematic video overviews, infographic styles, and persistent
  flashcard/quiz progress:
  workspaceupdates.googleblog.com/2026/03/new-ways-to-customize-and-interact-with-your-content-in-NotebookLM.html
- Official help pages: Dark/Light/Device mode toggle
  (support.google.com/notebooklm/answer/16225229), saving chat responses to
  notes (support.google.com/notebooklm/answer/16179559), converting notes
  into sources (support.google.com/notebooklm/answer/16262519)
- jeffsu.org walkthrough of the 2026 Studio panel redesign, screenshots of
  most Studio tools in one post:
  jeffsu.org/notebooklm-changed-completely-heres-what-matters-in-2026/
