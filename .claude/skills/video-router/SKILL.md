---
name: video-router
description: Choose which video tool makes a narrated video in gnosia (manimkc, remotionkc, revideokc or blenderkc) before any tool-specific skill runs. Use FIRST whenever the user asks for a video, an explainer, an animation or a lecture video on a topic in this repository, unless they have already named the tool ("use manimkc", "use Remotion", "use Revideo", "use Motion Canvas" or "use Blender"), then hand over to that tool's skill.
---

# video-router

Four tools in `tools/` can make a narrated video, and they are good at
different pictures. This skill picks one and says why, then hands over.
[docs/VIDEO-TOOLS.md](../../../docs/VIDEO-TOOLS.md) is the source of truth
for every rule below; read its "Pick by what the video needs" table and
capability matrix before deciding, not this summary.

## Procedure

The same order as the page: hard constraints first, so a later step never
undoes an earlier one.

1. **Unattended?** If the video has to come out of the studio with no one at
   a terminal, manimkc, remotionkc and revideokc can make it, and only on
   macOS (the studio's
   video kind is off on Linux). On Linux, say it cannot be made unattended
   there, and stop. A studio job cannot be given footage, a screen
   recording, an image or a sound from outside: when the video is about
   such media, say so and ask; when one beat wants it, draw that beat as an
   animation and say so. blenderkc is never unattended: the studio has no
   backend for it, so a photoreal video goes to the next row that fits.
   Otherwise carry on: the steps below choose among the four as they would
   at a terminal.
2. **The user named a tool** ("use Revideo", "make it in Remotion")? Use it.
   Skip to step 6.
3. **Series first.** If the video is a week or a part of a series that
   already exists (the CS3230, CS4223 and CS4225 lecture videos, or any
   topic folder with siblings), use the tool that series was made with and
   skip to step 6. `npm run --silent catalog -- video list` and the
   `topics/` folders under each tool show which tool made what.
4. **Name the main visual** in one sentence: what is on screen for most of
   the video. Find it in the table, top row first. Roughly:
   - a physical object shown photoreal (a chip package, a die stack, a
     board), with real materials, depth of field and lighting: **blenderkc**
   - continuous maths, plots, equation morphs, 3D maths objects, or plain
     boxes, tables and arrows: **manimkc**
   - real data on a chart, word-level captions, a code editor with a
     terminal, footage or screen recordings, a template or a live player:
     **remotionkc**
   - depth and light (layers in perspective, a spotlight, shadows), code
     edited in place, springy choreographed diagram motion: **revideokc**
5. **Check the second visual.** If another beat needs something the chosen
   tool's column in the capability matrix marks "no", prefer the tool that
   does both; if none does, keep the choice and simplify that beat.
6. **Say it in two lines** before starting, so the owner can overrule it in a
   word:
   `Tool: revideokc (row: "Depth and light"). Runner-up: remotionkc.`
   Then invoke that tool's skill (`manimkc-video`, `remotionkc-video` or
   `revideokc-video`) and follow it from its first step. blenderkc has no
   skill yet: follow `tools/blenderkc/docs/DESIGN.md` (its verbs, `new`,
   `narrate`, `still`, `build --host home`) and `docs/KIT.md`. The catalog topic
   slug each of them needs comes from `npm run --silent catalog -- topic ls`.

## Push past the defaults

Whichever tool wins, read its capability doc at storyboard time
(`tools/manimkc/docs/CAPABILITIES.md`, Remotion's skills under
`tools/remotionkc/.claude/skills/`, `tools/revideokc/docs/CAPABILITIES.md`,
`tools/blenderkc/docs/KIT.md`)
and plan at least one beat with something the older videos never used.
The docs mark what has been rendered and what has only been read about; a
beat built on an unrendered feature needs a still of it before the rest of
the video is written.

## When the table is wrong

If a video routed by this procedure turns out to fit another tool better,
change the table in docs/VIDEO-TOOLS.md in a PR, with the video as the
evidence. The skill should never be edited to disagree with the page.
