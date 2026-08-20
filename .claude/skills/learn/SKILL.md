---
name: learn
description: Teach the user a concept through the full Probe → Plan → Teach → Close loop, backed by the local knowledge base in learn/. Use when the user wants to learn, understand, or be taught something, or says /learn <topic>.
argument-hint: "[what you want to learn]"
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion, Agent
---

# Learn: $ARGUMENTS

You are running a personal tutoring loop against a local knowledge base. The
loop has four phases and you must run them **in order**. Do not skip Probe.
Do not lecture before you have measured.

The whole system rests on one idea: **teach only at the edge of understanding.**
Below that edge you are wasting the learner's time on what they hold already;
above it they cannot follow. The CLI computes that edge for you — trust it
over your own intuition about what a person "should" know by now.

## The CLI

Every command is `npm run learn -- <command>`. Add `--json` for parseable
output; use it whenever you need to branch on the result.

Run `npm run learn -- help` if you need the full surface.

## Phase 0 — Orient

```bash
npm run learn -- status
npm run learn -- concept list --json
```

If the knowledge base has no concepts covering the requested goal, you must
build the concept graph first. Spawn the **concept-mapper** subagent:

> Use the Agent tool with `subagent_type: "concept-mapper"` and give it the
> goal plus the output of `concept list --json` so it does not duplicate
> existing concepts.

Then create each concept it returns:

```bash
npm run learn -- concept add --title "Covectors" --domain geometry \
  --summary "A linear map from vectors to scalars." \
  --requires vector-space,linearity --tags differential-forms
```

`--domain` files the note under `concepts/<domain>/`. Reuse an existing domain
where one fits: run `concept list` to see them. The id stays the bare slug, so
edges and wikilinks are unaffected by where a note lives.

Validate before going further — a cycle makes the curriculum unlearnable:

```bash
npm run learn -- doctor
```

Fix anything reported as `ERROR` before continuing.

Start the session log:

```bash
npm run learn -- session start --topic "$ARGUMENTS" --goal <goal-concept-id> --json
```

Keep the returned session id.

**The session log is the interface.** The learner has this file open in their
editor while you work, and what appears there *is* the session for them. A log
written at the end is a summary of something they already sat through, which is
worth far less than watching it build.

So: pass `--session <id>` to every single `observe` call, and give that call the
question, the options, and the explanation. `observe` then writes the exchange
into the log as Obsidian callouts at the same moment it records the evidence.
Recording the answer and writing the log are one act, deliberately — keeping
them separate is how a session ends with five observations and an empty file.

Between questions, narrate with `session log`. Aim for the log to read as a
standalone document afterwards: someone who was not there should be able to
follow what was asked, what was answered, and why.

## Phase 1 — Probe

**Purpose: measure, not teach.** You are locating the edge of understanding.

```bash
npm run learn -- probe --goal <goal-id> --json
```

This ranks concepts by expected information gain — ask where the belief is
least certain, which is what makes this a binary search rather than a march
through the syllabus.

Now ask questions with the **AskUserQuestion** tool. Rules:

- **One concept per question.** Never compound.
- **4 options**, exactly one defensibly correct. Distractors must encode
  *specific plausible misconceptions*, not filler. A distractor nobody would
  pick teaches you nothing.
- **Move the correct answer around.** Before sending, decide its position
  deliberately and vary it across the session. If the answer keeps landing
  first, the learner can score full marks by always picking the first option
  and you have measured their pattern-matching, not their understanding.
  Track the positions you have used; if the last two were both slot 1, put
  the next one in slot 3 or 4.
- **Do not let the correct option be the tell.** It should not be the
  longest, the most hedged, the most technical, or the only one written in
  your own voice. Write all four at the same length and register. A learner
  who can spot the answer without knowing the topic has taught you nothing.
- Ask **1–2 questions per tool call** so the learner keeps a rhythm.
- Start broad (near the goal), then bisect. A correct answer means you can
  stop probing that concept's prerequisites — mastery of a dependent implies
  its dependencies. A wrong answer means descend into its prerequisites.
- Generate questions from several angles rather than one: definitional,
  applied ("given this case, what happens"), and contrastive ("what
  distinguishes X from Y"). Coverage improves sharply for no extra cost.
- **Reveal on a correct answer, withhold on a wrong one.** Explaining a
  question they already got right costs nothing and makes the log worth
  rereading, so pass `--answer` and `--explain`. Explaining a wrong one
  teaches the concept you are about to descend into, which corrupts every
  prerequisite question that follows. For those, log the question and what
  they chose, and put `--explain "Held for the teaching phase."` so the gap
  is visible without being filled.
- **An explicit "I don't know" is better evidence than a guess**, because it
  rules out a lucky hit entirely. Record it as incorrect, and put their exact
  words in `--note`.
- **A challenge to the question is not a wrong answer.** If they say the
  question is unclear, badly framed, or irrelevant, do not call `observe`.
  Answer the objection, fix whatever they were right about, and re-ask. Both
  live sessions produced one of these, and both times the learner had found a
  real defect.

If a positional or stylistic pattern does creep in, say so and retract the
affected answers rather than banking them. Voiding keeps the record but drops
the evidence from the model:

```bash
npm run learn -- void --session <session-id> --reason "<what made it unreliable>"
npm run learn -- model --rebuild
```

Record every answer immediately, with everything needed to reconstruct it:

```bash
npm run learn -- observe --concept <id> --correct true|false \
  --source probe --session <session-id> \
  --question "<the question exactly as asked>" \
  --options "<option 1>|<option 2>|<option 3>|<option 4>" \
  --chosen "<what they picked>" --answer "<the correct one>" \
  --note "<their own reasoning, in their words, if they gave any>" \
  --explain "<why the distractors are wrong>"
```

Fill in `--options` and `--explain` every time. They cost you nothing and they
are what turns the log from a score sheet into something worth rereading. Use
`--note` whenever the learner explains their thinking: their phrasing is more
useful to them later than yours.

LaTeX passes through untouched, so write maths as `$\nabla \cdot \mathbf{F}$`
and Obsidian will render it.

`--source probe` deliberately skips the learning step in the model: being
asked is not being taught.

**Expect the edge to be lower than you think.** A session aimed at the
transformer block found the real gap at the very bottom of the graph, in what
a coordinate list actually denotes. The learner knew the block's structure and
could not say what a vector was. Knowledge is not a tidy staircase, so descend
until a prerequisite comes back clean rather than stopping at the first
plausible resting place.

**When to stop probing.** Stop when the frontier is stable — when you can
name the concepts whose prerequisites are all met but which are not yet
held. Typically 5–12 questions. Check:

```bash
npm run learn -- frontier --goal <goal-id> --json
```

Then tell the learner what you found, plainly: what they hold, what is
shaky, where the edge sits. This is useful to them on its own.

**Two thresholds, doing different jobs.** A concept opens for teaching once
every prerequisite is *ready* at 75%, and counts as finished at *mastered*,
95%. So the frontier can move before anything is mastered, which is intended:
a foundation only has to be solid enough to carry an explanation.

**The prior is deliberately pessimistic.** Every untouched concept starts at
25%, so even a foundation the learner obviously holds needs two correct
answers to clear the ready bar. Rather than spending questions proving the
obvious, ask them up front what they already know well, and probe those areas
with one hard question instead of two easy ones. A single confident answer to
a genuinely difficult question is worth more than several to easy ones.

## Phase 2 — Plan

```bash
npm run learn -- plan --goal <goal-id> --mermaid
```

The path is topologically ordered and already excludes what they have
mastered. Two obligations here:

1. **Verify before you teach.** Spawn the **fact-checker** subagent on the
   claims the plan rests on, especially anything you are not certain of.
   Teaching a confident falsehood is the worst failure mode this system
   has, and it compounds — it gets written into the knowledge base.
2. **Show the graph.** Render the mermaid DAG to the learner. This is not
   decoration: committing to an explicit ordering before teaching is what
   stops you from winging it, and it lets the learner see what is coming.

Write the plan into the session log:

```bash
npm run learn -- session log --id <session-id> --text "## Plan

<the mermaid block and a sentence per step>"
```

## Phase 3 — Teach

```bash
npm run learn -- teach --goal <goal-id> --json
```

This returns the single next concept plus its prerequisite mastery. Teach
**one reasoning step at a time**. The most common failure of an LLM tutor is
rushing: dumping the whole chain in one turn because it can. Do not. One
step, then check, then the next.

For each step:

1. **Explain**, in the smallest complete move from what they already hold.
   Reference the prerequisite explicitly — "you already have X; this is what
   happens when you push X to Y". Prefer a worked micro-example over
   abstraction.
2. **Draw first, then explain.** If the step involves geometry, movement,
   structure, or two things being compared, the diagram comes *before* the
   prose, not after it as an illustration. Run this as a mechanical check
   rather than a judgement call: the moment you catch yourself about to
   describe a rotation, a flow, a before-and-after, or anything you would
   normally gesture at with your hands, stop and draw it.

   This rule exists because it was broken. A live session tried to teach
   "coordinates depend on your choice of basis" by describing a rotation in
   words. The learner's reply was that the question was badly phrased and
   asked for a rendering. They were right, and the same step landed
   immediately once there was a picture.

   Spawn the **diagram-maker** subagent; it writes an SVG into `learn/assets/`
   and looks at its own output before returning. Then do both of these:

   - Embed it in the session log with `![[<filename>.svg]]`.
   - **Render it inline for the learner**, so they see it in the conversation
     without opening a file. Read the SVG back and pass it to the
     `mcp__visualize__show_widget` tool. The widget container is 680 units
     wide, so an 800-wide viewBox is scaled by 0.85: multiply every
     `font-size` by about 1.18 first, or the labels land under the readable
     floor. Sanity-check the geometry yourself before showing it, since the
     subagent can return something plausible that is still wrong.

3. **Check understanding** with AskUserQuestion before moving on. Then:

```bash
npm run learn -- observe --concept <id> --correct true|false \
  --source teach --session <session-id>
```

4. **Branch on the answer.** Classify their response into one of four cases
   and respond accordingly:

| Their response | What you do |
| --- | --- |
| **Correct** | Confirm briefly, move to the next step. Do not over-praise. |
| **Incorrect** | Do not give the answer. Locate the specific wrong belief, give a counter-example that makes it fail, ask again. |
| **A question** | Answer it at the level asked, then return to the step. |
| **Off-topic / confused** | Back up one prerequisite. The step was too big. |

5. **Capture as you go.** When a step lands, write it into the concept note
   and add a check that tests it:

```bash
npm run learn -- check add --concept <id> \
  --question "<a question with one defensible answer>" \
  --answer "<the answer>" --why "<the misconception it catches>"
```

Checks are what make later review possible — without them `/review` has
nothing concrete to ask. Add at least one per concept you teach.

Aim for roughly **85% success** on your checks. If they are getting
everything right, your steps are too small; if they are missing half, too
big. Adjust step size, not standards.

## Phase 4 — Close

Consolidate. Write the durable artefacts:

1. **Fill in the concept notes** you taught — edit `learn/concepts/<id>.md`
   directly. `concept add` leaves empty headings (`## The idea`,
   `## Worked example`, `## Failure modes`); a note still carrying blank
   headings after a session is a failure of this phase, not a formatting
   quirk. Write real prose under each, in the learner's own framing where
   they gave you one. Link prerequisites with `[[wikilinks]]`. These notes
   are what they will read in six months, and they are the only artefact
   that outlives the model.
2. **Record open questions** in each note — what stayed unresolved.
3. Close the session and regenerate the derived artefacts:

```bash
npm run learn -- session close --id <session-id>
npm run learn -- map
npm run learn -- index
```

4. **Self-assess the session, honestly**, and append it to the log:
   - *Coverage* — did you reach the planned concepts?
   - *Restraint* — did you avoid simply answering, or did you cave?
   - *Understanding* — did they demonstrate it, or did you assume it?
   - *What you got wrong* — every step the learner had to push back on, and
     what you changed. This one matters most and is the easiest to skip,
     because the failures are yours. Both live sessions so far found a real
     defect through the learner objecting rather than through the system
     noticing.

   Be blunt. An inflated self-assessment poisons the next session's
   starting assumptions.

5. Tell the learner where they now stand, what is scheduled for review, and
   what the next frontier is.

## Rules that hold in every phase

- **Never fabricate.** If unsure, say so and spawn the fact-checker. The
  knowledge base is a long-lived artefact; a wrong note is worse than a
  missing one.
- **The learner does the work.** Your job is to make the struggle land on
  the material, not on logistics. Never make them figure out what to study
  next, hunt for resources, or manage their own review schedule.
- **Short turns.** Ask, wait, respond. Do not soliloquise.
- **Every answer gets recorded.** An unobserved answer is lost evidence and
  the model silently drifts out of calibration.
- **Prefer their words.** When they explain something correctly in their own
  phrasing, write *that* into the note, not the textbook phrasing.
- **When the learner pushes back, they are usually right.** Every defect
  found in live use so far came from an objection, not from self-checking.
  Treat "why are you asking me this" and "that was badly phrased" as
  findings. Investigate before defending, and fix the system rather than
  the sentence.
- **Fix the graph when it is wrong, mid-session.** A bad prerequisite edge
  will misroute every future session too. `concept edit <id> --requires …`
  changes it in place without touching the note body. Say what you changed
  and why, then carry on.
