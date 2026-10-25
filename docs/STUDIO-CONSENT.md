# Letting the planner reach for a tool: the consent card

How the studio's chat starts a make on its own judgement. Today the only
trigger is the person: an `@` chip in the composer puts the kind in the
message's TAGS block, and the planner writes a brief of each tagged kind and
only of a tagged kind. This document lets the planner propose — and, where the
owner has said always, order — the same kinds itself. It is the studio half of
issue #511; the concept tutor's side is a later phase below.

**Status: proposed, 2026-10-25. Nothing here is built.** It amends D58 of
[STUDIO-MENTIONS.md](STUDIO-MENTIONS.md): the suggestion no longer puts a chip
in the composer for the person to send; it is a card the person answers, and
an allow sends the tag itself.

**The owner's request, 2026-10-25.** When the agent decides a tool is worth
it, it asks the way ChatGPT asks to use an app and the way Claude Code asks to
run a tool: a small card in the reply with the proposal, a cost estimate, and
Deny / Allow once / Always allow. The current flow — a chip that lands in the
composer, then a card that shows the whole script — asks too much reading for
a first gate. The estimate matters because a video spends real money: model
tokens, narration, render minutes.

## What changes for the person, in one paragraph

The planner answers a question, judges that a video would show it better, and
ends its reply with a card: "I can make a video of this — a short manimkc
animation. A video here has cost $0.90–$2.30. Allow it?" with Deny, Allow
once and Always allow underneath. Allow once sends the tag itself — the
person watches a tagged message go out and the brief card land — and when the
brief validates, the job starts: one approval is the whole gate. Always allow
does the same now and marks the kind trusted on this conversation, so the
planner may write that brief unprompted next time, and it launches too. Deny
dismisses the card and tells the planner it was declined, so the same offer
does not come back next turn. `svg` never asks: it is the reply's own text
and costs nothing, so the planner may draw one unprompted under the SVG
section's rules (at most one a reply, in service of the prose).

## The card

One consent card per reply, under the prose, where suggestion chips sit
today. It carries, top to bottom:

| Row | Content |
| --- | --- |
| Title | The kind's glyph and "The planner wants to make a video" (or diagram, or picture) |
| Pitch | One line from the planner — what it would show — from the `suggest` block's new `line` field; absent if the planner gave none |
| Cost | A range for the kind: "a video here has cost $0.90–$2.30" when the machine has the history, "a video usually costs under a dollar" style band when it does not. `svg` shows nothing: it costs nothing |
| Buttons | **Deny**, **Allow once**, **Always allow** |

The card answers the question the chip never could — "what would it make, and
about what would it cost" — before anything is ordered. The pitch line, not
the script, is the reading: the script still exists, on the brief card behind
its details, for whoever wants it.

## The three answers

**Allow once** sends a message the person can see: an empty text with the
kind's chip, exactly as if they had placed it and pressed send. The transcript
stays honest — a tag is data on a message whoever placed it — and the whole
existing path runs: TAGS block, brief, validation, card. What changes is the
tail: a message sent by consent carries `make: true`, and when its brief
validates the job spawns without waiting for the card's press (D107). The
mark lives on the waiting request, so a turn the planner spends asking costs
nothing and the brief that finally lands still launches — while a request
stopped on the way cancels the spend with it.

**Always allow** does Allow once and one more thing: it writes the kind into
the draft's `trust` list. The planner reads `trust` in its prompt and may
write that kind's brief with no `suggest` and no consent card at all, and a
trusted kind's brief launches its job on validation like a consented one. The
draft's menu lists trusted kinds with a way to take each back; revoking only
means the planner asks again. A revoke while a turn is running is honoured:
trust is read again when the reply settles and when the launch fires, so an
unprompted brief landing after it stays a card, never a job.

**Deny** dismisses the card and writes `declined` onto the reply's transcript
entry, naming the kinds refused. The runner shows declines in the planner's
context, and the prompt bars re-offering what was declined unless the
conversation itself turns back to it (D109). A deny is of *this offer*, not
of the kind: a different video on a later question is a new card.

## The estimate

Every job already records `costUsd`, priced from its session log
(`services/studio/src/cost.ts`). The runner folds those records into a
per-kind band on the draft's view — the middle of the machine's last finishes
of that kind, low to high, with the count kept for honesty ("from 8 videos").
Where a kind has fewer than three records the card falls back to a fixed
band written in the runner, labelled "usually" rather than "has cost": a
diagram a few cents, a video under a couple of dollars. Bands this honest
matter because the tail is heavy — a brief that retries, a long narration, a
scene that will not compile — and a single number would pretend otherwise.
The same band rides on the brief card's press ("Make video · usually
$0.90–$2.30"), since that press is where an untrusted make spends.

## What the planner is told

The prompt gains three lines of contract, beside the `suggest` block it
already writes:

- A reply that was not asked for a kind may offer it: one `suggest` block,
  with a `line` saying in a few words what it would show. The planner already
  does this (D58); `line` is new.
- A kind in `trust` may be briefed unprompted, with no offer first — the
  brief lands, the job starts. It should still say in prose that it is making
  one, and only when the make clearly serves the question.
- A kind `declined` may not be offered again for the same thing; if the
  conversation plainly comes back to wanting one, a fresh offer is allowed.

And in the SVG section (D105): an untagged reply may end with one `svg`
block when a small picture earns its place — a shape being described, parts
that connect, a before and after — announced in the prose it supports, never
instead of the asked-for answer. `svg` needs no card, no `suggest`, no trust
entry: it is reply text, and the consent machinery exists for kinds that
spend.

## What stays

The `@` menu, the chip and typing a tag are untouched: a tag the person sends
still means "write the brief" and the card's press still means "spend" —
consent only joins them when the *planner* reaches first. A person's own
`@video` does not auto-launch; trusting a kind is what does, and trust is
always the person's to give and take back. `hold`, the live-card rules and
one live brief per kind are unchanged.

## Decisions

### D106. The planner's offer is a consent card, and Allow once sends the tag

**Verdict:** the `suggest` block grows a `line` — one short pitch — and its
rendering changes from a chip that fills the composer to a card that answers
for the person. Allow once posts a message carrying the kind's chip and no
text; the transcript then says exactly what happened, a tag placed with the
person's tap, and nothing else in the runner needs a concept for consent.
The offer still only ever names kinds the draft carries (`plannerKinds`), and
only the newest reply's card is live, as suggestions were.

**Why:** two presses — chip into composer, then send — made the offer a
composing aid, not a question. A card the person answers is what the
reference UIs (ChatGPT's app prompt, Claude Code's tool prompt) all are, and
it costs the runner nothing: consent resolves into an ordinary send.

**Rejected:** a bespoke `consent` reply type that orders the brief without a
message — the transcript would carry an invisible order, and the replay rules
around stored messages would have to learn it; letting the planner write the
brief inside the `suggest` block for approval — the brief belongs to the
reply that answers the approved tag, where validation and retry already live.

### D107. Allow launches the job: consent spends, so the estimate is on the card

**Verdict:** a message sent by consent carries `make: true`; when its brief
validates, the job spawns with no second press, and a trusted kind's
unprompted brief does the same. The consent card's estimate is therefore the
real number being approved, and the card says so: the pitch line, the band,
the buttons.

**Why:** the person asked for the ChatGPT shape — one gate, then the thing
gets made. A two-press flow (allow, then still press Make) re-asks a question
already answered and was the friction being removed. The script stays one
click away on the brief card for review while the job runs, and a running job
can still be cancelled from the card.

**Rejected:** consent orders the brief but the press still spends — safe but
not fluid, and it leaves every autonomous make waiting on a press the person
may not notice is needed; auto-launching on the person's own `@` tag — a tag
asks for the brief, not the spend, and keeping that split is what lets trust
mean something.

### D108. Always allow is a `trust` list on the draft, per kind, revocable

**Verdict:** `draft.json` gains `trust`, a list of brief kinds the planner
may order — and launch — without asking, set by Always allow on a consent
card and unset from the draft's menu. It scopes to this conversation and this
kind: trusting `video` on one draft trusts nothing elsewhere and nothing
else.

**Why:** "Allow for this conversation" is the tier both references actually
reach for in a working session — Claude Code's "allow for this chat" — and a
draft *is* the conversation, a project with its own subject. A global always
would let a habit built on cheap diagrams silently cover videos.

**Rejected:** trust on the owner, global — too broad a blast radius for a
control discovered inside one chat; trust expiring after N launches — the
menu's revoke is simpler to explain than a countdown.

### D109. A deny is recorded on the reply, and the planner sees it

**Verdict:** Deny writes `declined: TagKind[]` onto the suggestion's
transcript entry, the card collapses to a quiet "declined" line, and the
planner's context lists declines so the same offer is not re-made. The bar
is on the same offer, not the kind — the prompt words it that way.

**Why:** a dismissal the model cannot see is an invitation to pitch again
next turn; a dismissal it can see is one round of feedback. Recording it on
the entry keeps it in the session the planner already replays, needing no
parallel store.

**Rejected:** a per-kind blocked list — one declined video is not a ban on
videos; forgetting declines entirely — the card that returns every reply is
the failure mode this exists to prevent.

### D110. `svg` asks for nothing

**Verdict:** untagged `svg` is blessed in the prompt — at most one a reply,
in prose's service — and an `svg` `suggest` still renders a card, but a
costless one with no band and no Always allow (there is nothing to trust:
the planner may simply draw).

**Why:** gating free content is friction without a purchase; the consent
machinery exists because briefs and jobs spend. The picture is also the
planner's best rehearsal for the paid kinds: where it draws unprompted and
the pictures land, the proposals for diagrams and videos learn their
judgement.

**Rejected:** requiring `suggest` before the first `svg` of a conversation —
a gate whose only cost is the reply being worse.

## The tutor's side (later phase)

The concept tutor renders replies through the same `NoteProse` path, so once
its own prompt is allowed an `svg` block under the same rules, tutor answers
draw pictures with no rendering work at all. Its hands-off is different —
the tutor has no draft, no jobs and no cards, so there is nothing to consent
to beyond the picture itself — and it is specced here only to say the gate
does not generalise to it. A tutor that could *open* a studio conversation on
its own judgement is the version of this issue that would need a second
consent surface; not in this phase.

## Open questions

| Question | Recommendation |
| --- | --- |
| Does a trusted kind's unprompted brief still say so in prose? | Yes — "I'll sketch it" before the block; the card appears the same either way |
| Should the card show which video tool the brief would pick? | Not on the card; the pitch line may name it, and the brief card's chip still switches tool before launch |
| Revoke affordance | A "Tools it may start" row in the draft's `…` menu, one chip per trusted kind |
| Decline scope when the pitch is vague | Decline is of the offer as made; a vaguer offer declined still bars that offer |
| Estimate when the kind's machine is down | The card shows the unavailable reason instead of a band and allows nothing, as a disabled suggestion does today |

## Phases

1. **Runner:** `suggest` accepts `line`; draft gains `trust`; `send` accepts
   `make`; declines land on the transcript entry and reach the planner's
   context; the prompt learns offers, trust, declines and the untagged-`svg`
   blessing; the view exposes per-kind cost bands.
2. **Web:** the consent card (title, pitch, band, three answers), Allow once
   posting the tagged message with `make`, Always allow writing `trust`,
   Deny posting the decline; the band on the brief card's press; the trusted
   kinds row in the draft menu.
3. **Tutor:** the `svg` blessing in the tutor's prompt, matching the SVG
   section's rules.
