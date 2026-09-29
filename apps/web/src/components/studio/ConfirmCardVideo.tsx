"use client";

import Link from "next/link";
import { useId, useState, type ReactNode } from "react";

import { ProposedTopic } from "@/components/studio/ConfirmCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { cx } from "@/components/ui/classes";
import { Glyph } from "@/components/ui/Glyph";
import type { TopicOption } from "@/data/topics";
import {
  abbreviations,
  abbreviationWarning,
  beatCount,
  chapterTitle,
  isNarrated,
  sceneSeconds,
  shortLength,
  videoModeLine,
  videoSummaryLine,
  type VideoBrief,
} from "@/lib/studio-brief-video";
import { madeLine, pressBusyLabel, pressLabel, type KindCardStatus } from "@/lib/studio-cards";
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
 * the conversation with the Video tag.
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
  after,
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
  after?: ReactNode;
}) {
  const [using, setUsing] = useState(false);
  const [useError, setUseError] = useState<string | null>(null);
  const live = status === "live";
  const onHold = status === "onHold";
  const topicMap = new Map(topics.map((topic) => [topic.slug, topic]));
  const proposed = pendingTopic !== null && pendingTopic.entry.slug === brief.topic ? pendingTopic : null;
  const topic = topicMap.get(brief.topic);
  const mode = videoModeLine(brief);
  const warning = abbreviationWarning(runnerAbbreviations ?? abbreviations(brief));
  const holder = block?.holder ?? refusal?.holder ?? null;

  async function use(action: (() => Promise<string | null>) | undefined) {
    if (action === undefined || using) return;
    setUsing(true);
    setUseError(null);
    const error = await action();
    setUsing(false);
    setUseError(error);
  }

  return (
    <Card tight as="article" aria-label={`Video brief: ${brief.title}`} className={cx("mt-1", (status === "stale" || status === "closed") && "opacity-60")}>
      <div className="flex flex-col gap-3.5">
        <div className={cx("flex flex-col gap-3", onHold && "opacity-60")}>
          <div>
            <div className="flex items-center gap-2">
              <Glyph name="video" size={18} className="text-text2" />
              <h2 className="min-w-0 flex-1 text-[16px] font-bold leading-snug text-text">{brief.title}</h2>
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
          <p className="text-[13px] leading-5 text-text2">{videoSummaryLine(brief)}</p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-[13px] text-text2">
            {mode.lead} <code className="rounded bg-surface2 px-1 py-0.5 font-mono text-[12px] text-text">{mode.slug}</code>
          </p>

          <Storyboard brief={brief} />

          {warning !== null && <p className="rounded-lg bg-warn-tint px-3 py-2 text-[13px] leading-5 text-text">{warning}</p>}
        </div>

        {onHold && (
          <div className="flex flex-col gap-2 border-t border-hair pt-3.5">
            <p className="text-[13px] leading-5 text-text">On hold: {holdReason ?? "the conversation contradicted this brief"}</p>
            <div>
              <Button size="sm" variant="secondary" onClick={() => void use(onUse)} disabled={using || editBlock !== null} title={editBlock ?? undefined}>
                {using ? "Saving…" : "Use this brief"}
              </Button>
            </div>
            <UseError text={useError} />
          </div>
        )}

        {status === "held" && onPutBack !== undefined && (
          <div className="flex flex-col gap-2 border-t border-hair pt-3.5">
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
              <UseError text={useError} />
            )}
          </div>
        )}

        {live && (
          <div className="flex flex-col gap-2 border-t border-hair pt-3.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Button
                onClick={onPress}
                disabled={busy || block !== null}
                aria-keyshortcuts={keyShortcut ? "Meta+Enter Control+Enter" : undefined}
                data-studio-draw
                data-card-kind="video"
              >
                {busy ? pressBusyLabel("video", proposed) : pressLabel("video", proposed)}
              </Button>
            </div>
            {block !== null && <p className="text-[12px] leading-4 text-text2">{block.reason}</p>}
            {refusal !== null && refusal.text !== null && block === null && (
              <p role="alert" className="text-[13px] leading-5 text-text">
                {refusal.text}
              </p>
            )}
            {holder !== null && (
              <Link href={holderHref(holder)} scroll={false} className="w-fit text-[13px] font-medium text-accent-text underline-offset-4 hover:underline">
                Open that job
              </Link>
            )}
            {block === null && refusal === null && (
              <p className="text-[12px] text-text3">
                Nothing is made or spent until you press it.
                {keyShortcut && (
                  <span className="max-md:hidden">
                    {" "}
                    <kbd className="font-sans">⌘</kbd>/Ctrl+Enter works too.
                  </span>
                )}
              </p>
            )}
            {after}
          </div>
        )}

        {status === "drawn" && jobHref !== null && (
          <div className="border-t border-hair pt-3">
            <Link href={jobHref} scroll={false} className="text-[13px] font-medium text-accent-text underline-offset-4 hover:underline">
              {madeLine("video", jobRunning)}. Open the job
            </Link>
          </div>
        )}
      </div>
    </Card>
  );
}

/** One collapsed row per scene; open, every beat as it will be spoken and shown. */
function Storyboard({ brief }: { brief: VideoBrief }) {
  const narrated = isNarrated(brief);
  const [open, setOpen] = useState<ReadonlySet<number>>(new Set());
  const base = useId();
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
        const panel = `${base}-scene-${at}`;
        return (
          <li key={`${scene.name}-${at}`}>
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={panel}
              onClick={() => toggle(at)}
              className={cx(
                "flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface2",
                "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
              )}
            >
              <span className="w-5 shrink-0 text-[12px] tabular-nums text-text3">{at + 1}</span>
              <span className="min-w-0 flex-1 text-[14px] font-medium text-text">{chapterTitle(scene.name)}</span>
              <span className="shrink-0 text-[12px] tabular-nums text-text2">
                {beatCount(scene.beats.length)} · {shortLength(sceneSeconds(scene, narrated))}
              </span>
              <Glyph name="next" size={16} className={cx("text-text3 transition-transform", expanded && "rotate-90")} />
            </button>
            {expanded && (
              <ol id={panel} className="flex flex-col gap-3 px-3 pb-3 pl-11">
                {scene.beats.map((beat, index) => (
                  <li key={index} className="flex flex-col gap-1">
                    <p className="text-[14px] leading-5 text-text">
                      {narrated ? beat.say : <span className="italic">{beat.say}</span>}
                      {!narrated && beat.seconds !== undefined && <span className="ml-1.5 text-[12px] text-text3">{beat.seconds} s</span>}
                    </p>
                    <p className="text-[13px] leading-5 text-text2">{beat.show}</p>
                    {beat.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {beat.labels.map((label) => (
                          <Chip key={label} size="sm">
                            {label}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function UseError({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <p role="alert" className="text-[13px] leading-5 text-danger">
      {text}
    </p>
  );
}
