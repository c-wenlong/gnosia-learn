"use client";

import { useState } from "react";

import { Reveal } from "@/components/studio/motion-parts";
import { FooterError, FOOTER, LiveFooter, MadeFooter, OnHoldFooter, ProposedTopic, useHoldAction } from "@/components/studio/brief-card-parts";
import { Disclosure } from "@/components/ui/Disclosure";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { FilterMenu } from "@/components/ui/FilterMenu";
import { CARD_TITLE, cx } from "@/components/ui/classes";
import { Glyph } from "@/components/ui/Glyph";
import { Callout } from "@/components/ui/Callout";
import type { TopicOption } from "@/data/topics";
import {
  abbreviations,
  abbreviationWarning,
  beatCount,
  chapterTitle,
  isNarrated,
  sceneSeconds,
  shortLength,
  toolRow,
  videoModeLine,
  videoSummaryLine,
  type VideoBrief,
  type VideoToolName,
  type VideoToolOption,
} from "@/lib/studio-brief-video";
import { pressBusyLabel, pressLabel, type KindCardStatus } from "@/lib/studio-cards";
import type { DrawBlock } from "@/lib/studio-chat";
import type { PendingTopic } from "@/lib/studio-drafts";

/**
 * The video brief as a card (docs/STUDIO-VIDEOS.md, "The confirm card"): the
 * script a person reads before anything is spent, with the one press, Make
 * video.
 *
 * No row labels: each row says what it is by its content (DESIGN.md,
 * "Sentence case"). The title, the topic, the one idea, one line for length,
 * voice and audience (the minutes predicted from the script, never copied
 * from `targetSeconds`), new or change, then the storyboard, one collapsed
 * row per scene with its chapter title, beat count and predicted length.
 * Expanded, a scene shows each beat's line as it will be spoken, what the
 * screen does under it in `--text2`, and its labels.
 *
 * Its states are the diagram card's, per kind (D60 of STUDIO-MENTIONS.md):
 * `live` with Make video, `onHold` greyed with Use this brief, `held` (out of
 * force) with Use this brief, `drawn` linking to its job, `stale` greyed.
 * Editing a video brief in place is not built yet; a change is asked for in
 * the conversation with the Video tag. The one exception is the tool
 * (docs/STUDIO-VIDEO-TOOLS.md, D73): a live card whose studio can make more
 * than one tool offers them in a menu, and a pick saves the brief with it.
 */
export function ConfirmCardVideo({
  brief,
  pendingTopic,
  status,
  topics,
  block,
  busy,
  refusal,
  onPress,
  onUse,
  onPutBack,
  holdReason = null,
  jobHref,
  jobRunning = false,
  holderHref,
  runnerAbbreviations,
  keyShortcut = true,
  editBlock = null,
  paired = false,
  replacing = false,
  tools = [],
  onSwitchTool,
  charsPerSecond,
  costNote = null,
}: {
  brief: VideoBrief;
  pendingTopic: PendingTopic | null;
  status: KindCardStatus;
  topics: readonly TopicOption[];
  block: DrawBlock | null;
  busy: boolean;
  refusal: { text: string | null; holder: string | null } | null;
  onPress: () => void;
  /** Use this brief on a card on hold. Resolves with an error sentence, or null. */
  onUse?: () => Promise<string | null>;
  /** Use this brief on a card out of force: a save of it unchanged. Resolves with an error sentence, or null. */
  onPutBack?: () => Promise<string | null>;
  holdReason?: string | null;
  jobHref: string | null;
  jobRunning?: boolean;
  holderHref: (jobId: string) => string;
  /** The runner's own list of words the voice will read as words, when it sends one. */
  runnerAbbreviations?: readonly string[];
  keyShortcut?: boolean;
  /** Why Use this brief waits (a reply being written), or null. */
  editBlock?: string | null;
  /** A pair is live, so Make both is the primary press and this card's steps back. */
  paired?: boolean;
  /** The press discards this draft's video in review and queues this one in its place (D52). */
  replacing?: boolean;
  /** Health's `video.tools`: each tool, what it is best at, and whether the studio can make it. */
  tools?: readonly VideoToolOption[];
  /** Save this brief with another tool (D73). Resolves with an error sentence, or null. */
  onSwitchTool?: (tool: VideoToolName) => Promise<string | null>;
  /** Health's `video.narration.charsPerSecond`: the runner's speech rate, from gnosia-audio. Absent shows the length as unknown. */
  charsPerSecond?: number;
  /** What past makes of this kind cost here (D107), under the press. */
  costNote?: string | null;
}) {
  const { using, useError, use } = useHoldAction();
  const live = status === "live";
  const onHold = status === "onHold";
  const topicMap = new Map(topics.map((topic) => [topic.slug, topic]));
  const proposed = pendingTopic !== null && pendingTopic.entry.slug === brief.topic ? pendingTopic : null;
  const topic = topicMap.get(brief.topic);
  const mode = videoModeLine(brief);
  const warning = abbreviationWarning(runnerAbbreviations ?? abbreviations(brief));
  const holder = block?.holder ?? refusal?.holder ?? null;

  return (
    <Card
      tight
      as="article"
      aria-label={`Video brief: ${brief.title}`}
      className={cx(
        "mt-1 transition-opacity duration-200 ease-out motion-reduce:transition-none",
        (status === "stale" || status === "closed") && "opacity-60",
      )}
    >
      {/* No gap: each footer carries its space above it inside its fold, as
          on the diagram's card (`ConfirmCard`). */}
      <div className="flex flex-col">
        <div className={cx("flex flex-col gap-3 transition-opacity duration-200 ease-out motion-reduce:transition-none", onHold && "opacity-60")}>
          <div>
            <div className="flex items-center gap-2">
              <Glyph name="video" size={18} className="text-text2" />
              <h2 className={cx(CARD_TITLE, "min-w-0 flex-1")}>{brief.title}</h2>
            </div>
            {status === "stale" && <p className="mt-0.5 text-[12px] text-text3">An earlier brief. The newest one is below.</p>}
          </div>

          {proposed === null ? (
            <div className="flex flex-wrap items-center gap-2">
              <Chip size="sm" title={brief.topic}>
                {topic?.title ?? brief.topic}
              </Chip>
            </div>
          ) : (
            <ProposedTopic proposed={proposed} topics={topicMap} editing={false} onPick={() => undefined} />
          )}

          <p className="text-[15px] leading-6 text-text">{brief.idea}</p>
          <p className="text-[13px] leading-5 text-text2">{videoSummaryLine(brief, charsPerSecond)}</p>
          <ToolRow
            brief={brief}
            tools={tools}
            onSwitch={live && editBlock === null ? onSwitchTool : undefined}
          />
          <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-text2">
            {mode.lead} <code className="rounded bg-surface2 px-1 py-0.5 font-mono text-[12px] text-text">{mode.slug}</code>
          </p>

          <Storyboard brief={brief} charsPerSecond={charsPerSecond} />

          {warning !== null && <Callout>{warning}</Callout>}
        </div>

        <OnHoldFooter
          open={onHold}
          reason={holdReason}
          using={using}
          error={useError}
          editBlock={editBlock}
          onUse={() => void use(onUse)}
        />

        <Reveal open={status === "held" && onPutBack !== undefined}>
          <div className={FOOTER}>
            <div>
              <Button onClick={() => void use(onPutBack)} disabled={using || editBlock !== null} title={editBlock ?? undefined}>
                {using ? "Saving…" : "Use this brief"}
              </Button>
            </div>
            {useError === null ? (
              <p className="text-[12px] leading-4 text-text2">
                The conversation moved on after this brief, so Make video would not use it. Use it as it is, or ask for a change.
              </p>
            ) : (
              <FooterError text={useError} />
            )}
          </div>
        </Reveal>

        <LiveFooter
          open={live}
          kind="video"
          label={busy ? pressBusyLabel("video", proposed) : pressLabel("video", proposed, replacing)}
          busy={busy}
          block={block}
          refusal={refusal}
          holder={holder}
          holderHref={holderHref}
          paired={paired}
          keyShortcut={keyShortcut}
          costNote={costNote}
          onPress={onPress}
        />

        <MadeFooter open={status === "drawn"} kind="video" jobHref={jobHref} jobRunning={jobRunning} />
      </div>
    </Card>
  );
}

/** One collapsed row per scene; open, every beat as it will be spoken and shown. */
function Storyboard({ brief, charsPerSecond }: { brief: VideoBrief; charsPerSecond: number | undefined }) {
  const narrated = isNarrated(brief);
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const toggle = (at: number) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(at)) next.delete(at);
      else next.add(at);
      return next;
    });
  return (
    <ol aria-label="Storyboard" className="flex flex-col divide-y divide-hair overflow-hidden rounded-xl border border-hair">
      {brief.scenes.map((scene, at) => {
        const expanded = open.has(at);
        return (
          <li key={`${scene.name}-${at}`}>
            {/* Folds open and shut; the beats stay drawn while shut, inert. */}
            <Disclosure
              open={expanded}
              onOpenChange={() => toggle(at)}
              className={cx(
                "flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface2",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
              )}
              summary={
                <>
                  <span className="w-5 shrink-0 text-[12px] tabular-nums text-text3">{at + 1}</span>
                  <span className="min-w-0 flex-1 text-[14px] font-medium text-text">{chapterTitle(scene.name)}</span>
                  <span className="shrink-0 text-[12px] tabular-nums text-text2">
                    {beatCount(scene.beats.length)} · {shortLength(sceneSeconds(scene, narrated, charsPerSecond))}
                  </span>
                  <Glyph
                    name="next"
                    size={16}
                    className={cx(
                      "text-text3 transition-transform duration-300 ease-soft motion-reduce:transition-none",
                      expanded && "rotate-90",
                    )}
                  />
                </>
              }
            >
              <ol className="flex flex-col gap-3 px-3 pb-3 pl-11 pt-1">
                {scene.beats.map((beat, index) => (
                  <li key={index} className="flex flex-col gap-1">
                    <p className="text-[14px] leading-5 text-text">
                      {narrated ? beat.say : <span className="italic">{beat.say}</span>}
                      {!narrated && beat.seconds !== undefined && <span className="ml-1.5 text-[12px] text-text3">{beat.seconds} s</span>}
                    </p>
                    <p className="text-[13px] leading-5 text-text2">{beat.show}</p>
                    {beat.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {beat.labels.map((label, at) => (
                          <Chip key={`${at}:${label}`} size="sm">
                            {label}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </Disclosure>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The tool that makes the video, and why (D73). A chip when there is nothing
 * to switch to; a menu of the tools the studio can make when there is, on a
 * live card only. No label: the tool's name and the reason beside it say
 * what the row is.
 */
function ToolRow({
  brief,
  tools,
  onSwitch,
}: {
  brief: VideoBrief;
  tools: readonly VideoToolOption[];
  onSwitch?: (tool: VideoToolName) => Promise<string | null>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const row = toolRow(brief, tools);
  const strength = tools.find((option) => option.name === row.tool)?.strength;

  async function pick(tool: VideoToolName) {
    if (onSwitch === undefined || saving) return;
    setSaving(true);
    setError(null);
    setError(await onSwitch(tool));
    setSaving(false);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {row.choices.length > 0 && onSwitch !== undefined ? (
          <FilterMenu
            bare
            label="Video tool"
            options={row.choices.map((option) => ({ value: option.name, label: option.name, detail: option.strength }))}
            value={row.tool}
            defaultValue={row.tool}
            onChange={(tool) => void pick(tool)}
            busy={saving}
          />
        ) : (
          <Chip size="sm" title={strength}>
            {row.tool}
          </Chip>
        )}
        {row.line !== null && row.line !== "" && <span className="min-w-0 text-[13px] leading-5 text-text2">{row.line}</span>}
      </div>
      {row.stop !== null && <p className="text-[12px] leading-4 text-text2">{row.stop}</p>}
      <FooterError text={error} />
    </div>
  );
}
