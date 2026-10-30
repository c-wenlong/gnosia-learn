import Link from "next/link";
import type { ReactNode } from "react";

import { MathText } from "@/components/Math";
import { NoteProse, type EmbedResolution } from "@/components/NoteProse";
import { cx } from "@/components/ui/classes";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { TextLink } from "@/components/ui/TextLink";
import type { CitationSource } from "@/lib/agent/prompt";
import type { ConceptWorkspace, NeighbourRef } from "@/lib/concept-workspace-core";

import { NoteDisclosure } from "./NoteDisclosure";

/**
 * The workspace's left panel (hi-fi 04): the summary, what this concept needs
 * and what needs it, the sources the tutor cites, the backlinks, and the whole
 * note behind a disclosure (`NoteDisclosure`, which glides it open).
 * Server-rendered; the panel frame is `WorkspacePanels`.
 */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[13px] font-bold text-text">{title}</h3>
      {children}
    </section>
  );
}

function NeighbourList({ refs, empty, note }: { refs: NeighbourRef[]; empty: string; note?: string }) {
  if (refs.length === 0) return <p className="text-[13px] text-text3">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {refs.map((r) => (
        <li key={r.slug}>
          <Link
            href={`/learn/${r.slug}`}
            className="group inline-flex max-w-full items-center gap-2 rounded-sm text-[13px] text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <MasteryDot bucket={r.bucket} size={12} />
            <span className="min-w-0 truncate group-hover:underline group-hover:underline-offset-4">{r.title}</span>
            {note && <span className="shrink-0 text-[12px] text-text3">{note}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** A source's dot: the danger red for a PDF, the accent for the web, green for the note itself. */
function sourceDot(source: CitationSource): string {
  if (source.n === 1) return "bg-ok";
  if (/\.pdf\b|\bpdf\b/i.test(source.label)) return "bg-danger";
  if (source.href) return "bg-accent";
  return "bg-text3";
}

export function NoteAndSources({
  workspace,
  sources,
  resolveNote,
  resolveEmbed,
}: {
  workspace: ConceptWorkspace;
  sources: CitationSource[];
  /** `[[slug]]` to a workspace URL, for the slugs that are concepts. */
  resolveNote?: (slug: string) => string | undefined;
  resolveEmbed?: (name: string) => EmbedResolution | undefined;
}) {
  const w = workspace;
  const background = w.assumes;
  const checkCount = w.checks.length;
  return (
    <>
      <Section title="Summary">
        <p className="text-[13px] leading-[1.4] text-text2">
          {w.summary ? <MathText text={w.summary} /> : "No summary written yet."}
        </p>
      </Section>

      <Section title="Prerequisites">
        {w.requires.length === 0 && background.length === 0 ? (
          <p className="text-[13px] text-text3">None. This is a starting point.</p>
        ) : (
          <>
            {w.requires.length > 0 && <NeighbourList refs={w.requires} empty="" />}
            {background.length > 0 && <NeighbourList refs={background} empty="" note="background" />}
          </>
        )}
      </Section>

      <Section title="Leads to">
        <NeighbourList refs={w.dependants} empty="Nothing requires this yet." />
      </Section>

      <Section title="Sources">
        <ul className="flex flex-col gap-2">
          {sources.map((s) => (
            <li key={s.n} className="flex min-w-0 items-center gap-2 text-[13px] text-text">
              <span aria-hidden className={cx("size-2 shrink-0 rounded-full", sourceDot(s))} />
              {s.href && s.n !== 1 ? (
                <a href={s.href} target="_blank" rel="noreferrer noopener" className="min-w-0 truncate hover:underline hover:underline-offset-4">
                  {s.label}
                </a>
              ) : (
                <span className="min-w-0 truncate">
                  {s.n === 1 ? `Your note · ${checkCount} check${checkCount === 1 ? "" : "s"}` : s.label}
                </span>
              )}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Backlinks">
        {w.backlinks.length === 0 ? (
          <p className="text-[13px] text-text2">No other note references this one.</p>
        ) : (
          <>
            <p className="text-[13px] text-text2">
              Referenced by {w.backlinks.length} note{w.backlinks.length === 1 ? "" : "s"}
            </p>
            <p className="flex flex-wrap gap-x-2 gap-y-1 text-[12px]">
              {w.backlinks.map((b) => (
                <TextLink key={b.slug} href={`/learn/${b.slug}`}>
                  {b.title}
                </TextLink>
              ))}
            </p>
          </>
        )}
      </Section>

      <Section title="Note">
        {w.note.available ? (
          <NoteDisclosure>
            <NoteProse
              source={w.note.source}
              idPrefix="note-"
              images="show"
              className="mt-3 text-[14px]"
              resolveNote={resolveNote}
              resolveEmbed={resolveEmbed}
            />
            <p className="mt-3 font-mono text-[12px] break-all text-text3">{w.note.path}</p>
          </NoteDisclosure>
        ) : (
          <p className="text-[13px] text-text3">
            {w.note.code === "too-large"
              ? "The note is larger than this page reads."
              : w.note.code === "no-note"
                ? "No note is stored for this concept."
                : w.note.code === "not-flipped"
                  ? "Concept notes are not in the database yet: run npm run catalog -- flip concepts."
                  : "The note could not be read right now."}
          </p>
        )}
      </Section>
    </>
  );
}
