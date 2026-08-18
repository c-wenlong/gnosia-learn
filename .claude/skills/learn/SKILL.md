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
npm run learn -- concept add --title "Covectors" \
  --summary "A linear map from vectors to scalars." \
  --requires vector-space,linearity --tags differential-forms
```

Validate before going further — a cycle makes the curriculum unlearnable:

```bash
npm run learn -- doctor
```

Fix anything reported as `ERROR` before continuing.

Start the session log:

```bash
npm run learn -- session start --topic "$ARGUMENTS" --goal <goal-concept-id> --json
```

Keep the returned session id. Pass it to every `observe` call, and append
narration to it as you go — the learner may have it open in an editor.

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
- Ask **1–2 questions per tool call** so the learner keeps a rhythm.
- Start broad (near the goal), then bisect. A correct answer means you can
  stop probing that concept's prerequisites — mastery of a dependent implies
  its dependencies. A wrong answer means descend into its prerequisites.
- Generate questions from several angles rather than one: definitional,
  applied ("given this case, what happens"), and contrastive ("what
  distinguishes X from Y"). Coverage improves sharply for no extra cost.
- **Never reveal the answer during Probe.** Say "noted" and move on. Probing
  is measurement; explaining here contaminates it.

Record every answer immediately:

```bash
npm run learn -- observe --concept <id> --correct true|false \
  --source probe --session <session-id> --question "<the question asked>"
```

`--source probe` deliberately skips the learning step in the model: being
asked is not being taught.

**When to stop probing.** Stop when the frontier is stable — when you can
name the concepts whose prerequisites are all met but which are not yet
held. Typically 5–12 questions. Check:

```bash
npm run learn -- frontier --goal <goal-id> --json
```

Then tell the learner what you found, plainly: what they hold, what is
shaky, where the edge sits. This is useful to them on its own.

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
2. **Visualise** when the idea is spatial, structural, or has moving parts.
   Spawn the **diagram-maker** subagent; it writes an SVG into `learn/assets/`
   and looks at its own output to check it before returning. Embed it in the
   session log with `![[<filename>.svg]]`.
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
   directly. Write the idea, the worked example, and the failure modes in
   the learner's own framing where you can. Link prerequisites with
   `[[wikilinks]]`. These notes are what they will read in six months.
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
