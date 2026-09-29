import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import type { EmbedResolution } from "@/components/NoteProse";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { NoteAndSources } from "@/components/workspace/NoteAndSources";
import { StudioCards, type StudioAsset } from "@/components/workspace/StudioCards";
import { TutorChat } from "@/components/workspace/TutorChat";
import { WorkspacePanels } from "@/components/workspace/WorkspacePanels";
import { buildConceptSessionContext, tutorStyleLabel } from "@/lib/agent/prompt";
import { loadAssetAccess, readFileProblems, thumbnailFor } from "@/lib/asset-library";
import type { RouteProblemCode } from "@/lib/asset-problems";
import { isConceptSlug, placeLabel, toConceptPromptInput } from "@/lib/concept-workspace-core";
import { loadConceptWorkspace } from "@/lib/concept-workspace";
import { habitTimeZone } from "@/lib/habit";
import { dueLabel } from "@/lib/learn-index";
import { assetFileHref, assetStatusHref, isCompanionKind } from "@/lib/library";
import { embedTargets } from "@/lib/note-embeds";
import { NOTHING_TO_ASK } from "@/lib/session-core";
import { sessionWillAsk } from "@/lib/session-page";
import { readTutorStyle } from "@/lib/settings";

/**
 * The concept workspace (hi-fi 04): a concept's note and sources on the left,
 * the tutor in the middle, the things made from it on the right, and the two
 * ways out (Teach me, Review now) in the header.
 *
 * When a session could ask nothing (no check in the note, no tutor model
 * configured) the header says so under Teach me, before the learner starts.
 * The button stays live, because the session still teaches.
 *
 * Everything is read on the server through `loadConceptWorkspace`, the same
 * object `GET /api/concepts/[slug]` returns. Dynamic, like every page: it
 * reads the database.
 */

type Params = {
  params: Promise<{ concept: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

/** The longest `?ask=` prefill taken, the tutor input's own limit. */
const ASK_LIMIT = 4_000;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { concept } = await params;
  const read = isConceptSlug(concept) ? await loadConceptWorkspace(concept) : null;
  return { title: read?.state === "ok" ? read.workspace.title : "Concept" };
}

export default async function ConceptWorkspacePage({ params, searchParams }: Params) {
  // A page's segment is not URL-decoded (AGENTS.md), but a concept id is
  // lowercase letters, digits and hyphens, so anything with an escape in it
  // was never a concept and the check below turns it away.
  const { concept: slug } = await params;
  if (!isConceptSlug(slug)) notFound();

  const read = await loadConceptWorkspace(slug);
  if (read.state === "not-found") notFound();
  if (read.state === "unreachable") return <Unreachable />;

  const w = read.workspace;
  // `?ask=` is a session's "Ask the tutor": the question it asked, prefilled in
  // the tutor's input (never sent), with the Tutor tab open on a phone.
  const query = await searchParams;
  const rawAsk = Array.isArray(query.ask) ? query.ask[0] : query.ask;
  const ask = typeof rawAsk === "string" && rawAsk.trim() !== "" ? rawAsk.slice(0, ASK_LIMIT) : undefined;
  const style = await readTutorStyle();
  const session = buildConceptSessionContext(toConceptPromptInput(w), { style });
  const timeZone = habitTimeZone();
  const nextReview = w.review ? dueLabel(w.review.due, new Date(), timeZone).label : null;

  // Pictures: an asset row's thumbnail and the note's `![[embeds]]`, decided
  // on the server exactly as the library decides them, per row, so neither
  // renders a broken image for something that was never uploaded.
  const access = await loadAssetAccess(w.assets);
  const assets: StudioAsset[] = w.assets
    .filter((a) => !isCompanionKind(a.kind))
    .map((a) => ({ ...a, thumbnail: thumbnailFor(a, access) }));

  const embedId = (name: string) => `diagram:learn/assets/${name}`;
  const embedProblems = w.note.available
    ? await readFileProblems(embedTargets(w.note.source).map(embedId))
    : new Map<string, RouteProblemCode | null>();
  const resolveEmbed = (name: string): EmbedResolution => {
    const id = embedId(name);
    const problem = embedProblems.get(id) ?? null;
    if (problem !== null) return { problem };
    return { src: assetFileHref(id), statusHref: assetStatusHref(id) };
  };
  // A note's wikilinks name its neighbours (and its session logs, which have no
  // workspace), so the neighbours are the links worth resolving.
  const known = new Set([w.slug, ...[...w.requires, ...w.assumes, ...w.dependants, ...w.backlinks].map((r) => r.slug)]);

  // Decided here, on the server: the provider keys never reach the client.
  const canAsk = await sessionWillAsk(w);

  const eyebrow = placeLabel(w.place) ?? (w.domain ? `${w.domain} · not in a course yet` : "Not in a course yet");

  return (
    <div data-layout="workspace" className="flex flex-col gap-4 min-[900px]:min-h-0 min-[900px]:flex-1">
      <header className="flex shrink-0 flex-wrap items-center gap-x-3.5 gap-y-3">
        <div className="min-w-0 flex-1 basis-[18rem]">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-1 font-display text-[26px] leading-tight font-bold text-text">{w.title}</h1>
        </div>
        <MasteryDot bucket={w.bucket} showLabel pL={w.pL} />
        <div className="flex flex-wrap items-center gap-3.5">
          <Button href={`/learn/${w.slug}/session`} aria-describedby={canAsk ? undefined : "session-asks-nothing"}>
            {/* No "· focus mode" suffix: the session page is the focus layout, and
                Today's button to the same page already says "Continue teaching". */}
            Teach me
          </Button>
          <Button variant="secondary" href={`/review?concept=${w.slug}`}>
            Review now
          </Button>
        </div>
        {!canAsk && (
          <p id="session-asks-nothing" className="basis-full text-[13px] text-text2">
            {NOTHING_TO_ASK} A session here teaches and asks nothing, so nothing is recorded.
          </p>
        )}
      </header>

      <WorkspacePanels
        note={
          <NoteAndSources
            workspace={w}
            sources={session.sources}
            resolveNote={(target) => (known.has(target) ? `/learn/${target}` : undefined)}
            resolveEmbed={resolveEmbed}
          />
        }
        tutorAside={
          // The style the tutor is told to use (hi-fi 04's "Learning guide ·
          // concise"), linking to where it is changed.
          <Link
            href="/settings"
            title="Tutor style, set in Settings"
            className="rounded-sm text-[12px] text-text3 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {tutorStyleLabel(style)}
          </Link>
        }
        tutor={
          <TutorChat
            slug={w.slug}
            title={w.title}
            sources={session.sources}
            suggestions={session.suggestions}
            initialDraft={ask}
          />
        }
        initialPanel={ask === undefined ? undefined : "tutor"}
        studio={<StudioCards workspace={w} assets={assets} nextReview={nextReview} />}
      />
    </div>
  );
}

function Unreachable() {
  return (
    <div data-layout="app">
      <Card title="Knowledge base unavailable" className="max-w-2xl">
        <p className="text-[14px] text-text2">
          The database could not be reached, so this concept cannot be shown. Nothing is lost: the note, the mastery and
          the schedule are all in the database, and show again once it answers.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-surface2 p-3 text-[12px]">npm run catalog -- status</pre>
      </Card>
    </div>
  );
}
