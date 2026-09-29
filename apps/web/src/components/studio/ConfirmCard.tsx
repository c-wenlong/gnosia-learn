"use client";

import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { cx, LABEL } from "@/components/ui/classes";
import type { TopicOption } from "@/data/topics";
import { drawLabel, modeLine, type CardStatus, type DrawBlock } from "@/lib/studio-chat";
import type { PendingTopic } from "@/lib/studio-drafts";
import { candidatePathFor, type Brief } from "@/lib/studio-jobs";

/**
 * The confirm message: the planner's brief as a card a person checks at a
 * glance, with the one Draw (docs/STUDIO-CHAT-FIRST.md, "The confirm message").
 *
 * Read-only in phase 1; phase 3 makes each row editable in place. Only the
 * newest brief of a `briefed` draft is `live`; an older card is greyed with
 * its button gone, so there is one Draw on screen, ever. The newest brief of a
 * draft that went on to draw links to its job instead.
 *
 * A proposed topic (D39) is marked "New topic" with its domain, summary and
 * relations, plus any near matches the runner's dry run named, so the person
 * can say "use that one instead" before pressing; the button then reads
 * **Create topic and draw**, because the press creates it.
 */
export function ConfirmCard({
  brief,
  pendingTopic,
  status,
  topics,
  block,
  busy,
  refusal,
  onDraw,
  jobHref,
  holderHref,
  sourceChanged = false,
}: {
  brief: Brief;
  pendingTopic: PendingTopic | null;
  status: CardStatus;
  topics: ReadonlyMap<string, TopicOption>;
  /** Why Draw is disabled right now, or null. */
  block: DrawBlock | null;
  busy: boolean;
  /** A refused press (E7), until the transcript carries the runner's note. */
  refusal: { text: string | null; holder: string | null } | null;
  onDraw: () => void;
  /** On a `drawn` card: the job this brief started. */
  jobHref: string | null;
  /** Opens a job by id: the holder of a leased target. */
  holderHref: (jobId: string) => string;
  /**
   * C11: the diagram an extend brief is about moved on since the planner read
   * it. Draw is unaffected (the job copies the diagram as it is when it
   * starts), so this is said, not enforced.
   */
  sourceChanged?: boolean;
}) {
  const live = status === "live";
  const topic = topics.get(brief.topic);
  const proposed = pendingTopic !== null && pendingTopic.entry.slug === brief.topic ? pendingTopic : null;
  const mode = modeLine(brief);
  const holder = block?.holder ?? refusal?.holder ?? null;

  return (
    <Card
      tight
      as="article"
      aria-label={`Brief: ${brief.title}`}
      className={cx("mt-1 gap-3.5", !live && "opacity-60")}
      title={brief.title}
    >
      {status === "stale" && <p className="-mt-2 text-[12px] text-text3">An earlier brief. The newest one is below.</p>}

      <Row label="Topic">
        {proposed === null ? (
          <Chip size="sm" title={brief.topic}>
            {topic?.title ?? brief.topic}
          </Chip>
        ) : (
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Chip size="sm" active title={proposed.entry.slug}>
                New topic
              </Chip>
              <span className="text-[14px] font-semibold text-text">{proposed.entry.title}</span>
              <span className="font-mono text-[12px] text-text3">{proposed.entry.slug}</span>
            </div>
            <p className="text-[13px] text-text2">
              In <span className="font-medium text-text">{proposed.entry.domain}</span>
              {proposed.entry.summary !== null && proposed.entry.summary !== "" && <>. {proposed.entry.summary}</>}
            </p>
            {proposed.entry.relations.length > 0 && (
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-text2">
                {proposed.entry.relations.map((relation) => (
                  <li key={`${relation.kind}:${relation.to}`}>
                    <span className="text-text3">{relation.kind}</span> {topics.get(relation.to)?.title ?? relation.to}
                  </li>
                ))}
              </ul>
            )}
            {proposed.nearMatches.length > 0 && (
              <p className="text-[13px] text-text2">
                Close to{" "}
                {proposed.nearMatches.map((match, at) => (
                  <span key={match.slug}>
                    {at > 0 && ", "}
                    <span className="font-medium text-text" title={match.slug}>
                      {match.title}
                    </span>
                  </span>
                ))}
                . Say &ldquo;use {proposed.nearMatches[0]?.title} instead&rdquo; if{" "}
                {proposed.nearMatches.length === 1 ? "it" : "one of those"} fits.
              </p>
            )}
          </div>
        )}
      </Row>

      <Row label="Saved as">
        <p className="text-[14px] text-text">
          {mode.lead} <code className="rounded bg-surface2 px-1 py-0.5 font-mono text-[13px]">{mode.slug}</code>
        </p>
        {live && sourceChanged && brief.mode === "extend" && (
          <p className="mt-1 text-[13px] text-warn-text">
            The diagram changed after this conversation started. The drawing starts from it as it is now.
          </p>
        )}
      </Row>

      <Row label="What will appear">
        <div className="flex flex-wrap gap-1.5">
          {brief.elements.map((element) => (
            <Chip key={element.label} size="sm" title={element.note}>
              {element.label}
            </Chip>
          ))}
        </div>
      </Row>

      {brief.relations.length > 0 && (
        <Row label="What connects">
          <ul className="flex flex-col gap-1 text-[14px] leading-5 text-text">
            {brief.relations.map((relation, at) => (
              <li key={at} className="break-words">
                {relation.from}
                <span aria-hidden className="px-1.5 text-text3">
                  →
                </span>
                {relation.label !== undefined && relation.label !== "" && (
                  <>
                    <span className="text-text2">{relation.label}</span>
                    <span aria-hidden className="px-1.5 text-text3">
                      →
                    </span>
                  </>
                )}
                <span className="sr-only">{relation.label ? " to " : " connects to "}</span>
                {relation.to}
              </li>
            ))}
          </ul>
        </Row>
      )}

      {live && (
        <div className="flex flex-col gap-2 border-t border-hair pt-3.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Button
              onClick={onDraw}
              disabled={busy || block !== null}
              aria-keyshortcuts="Meta+Enter Control+Enter"
              data-studio-draw
            >
              {busy ? (proposed ? "Creating the topic…" : "Queuing…") : drawLabel(proposed)}
            </Button>
            <span className="min-w-0 break-all font-mono text-[12px] text-text3">{candidatePathFor(brief.slug)}</span>
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
              Nothing is drawn or spent until you press it.
              <span className="max-md:hidden">
                {" "}
                <kbd className="font-sans">⌘</kbd>/Ctrl+Enter works too.
              </span>
            </p>
          )}
        </div>
      )}

      {status === "drawn" && jobHref !== null && (
        <div className="border-t border-hair pt-3">
          <Link href={jobHref} scroll={false} className="text-[13px] font-medium text-accent-text underline-offset-4 hover:underline">
            Drawn from this brief. Open the job
          </Link>
        </div>
      )}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[128px_1fr] sm:gap-3">
      <p className={cx(LABEL, "pt-1")}>{label}</p>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
