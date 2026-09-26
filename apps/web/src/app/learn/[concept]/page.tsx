import type { Metadata } from "next";
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
import { buildConceptSessionContext } from "@/lib/agent/prompt";
import { accessFor, loadFileAccess, readFileProblems, thumbnailFor } from "@/lib/asset-library";
import { problemForAccess } from "@/lib/asset-problems";
import { isConceptSlug, placeLabel, toConceptPromptInput } from "@/lib/concept-workspace-core";
import { loadConceptWorkspace } from "@/lib/concept-workspace";
import { habitTimeZone } from "@/lib/habit";
import { dueLabel } from "@/lib/learn-index";
import { assetFileHref, assetStatusHref, isCompanionKind } from "@/lib/library";
import { embedTargets } from "@/lib/note-embeds";

/**
 * The concept workspace (hi-fi 04): a concept's note and sources on the left,
 * the tutor in the middle, the things made from it on the right, and the two
 * ways out (Teach me, Review now) in the header.
 *
 * Everything is read on the server through `loadConceptWorkspace`, the same
 * object `GET /api/concepts/[slug]` returns. Dynamic, like every page: it
 * reads the database.
 */

type Params = { params: Promise<{ concept: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { concept } = await params;
  const read = isConceptSlug(concept) ? await loadConceptWorkspace(concept) : null;
  return { title: read?.state === "ok" ? read.workspace.title : "Concept" };
}

export default async function ConceptWorkspacePage({ params }: Params) {
  // A page's segment is not URL-decoded (AGENTS.md), but a concept id is
  // lowercase letters, digits and hyphens, so anything with an escape in it
  // was never a concept and the check below turns it away.
  const { concept: slug } = await params;
  if (!isConceptSlug(slug)) notFound();

  const read = await loadConceptWorkspace(slug);
  if (read.state === "not-found") notFound();
  if (read.state === "unreachable") return <Unreachable />;

  const w = read.workspace;
  const session = buildConceptSessionContext(toConceptPromptInput(w));
  const timeZone = habitTimeZone();
  const nextReview = w.review ? dueLabel(w.review.due, new Date(), timeZone).label : null;

  // Pictures: an asset row's thumbnail and the note's `![[embeds]]`, decided
  // on the server exactly as the library decides them, so neither renders a
  // broken image when the file route is off or a file is gone.
  const access = await loadFileAccess();
  const assets: StudioAsset[] = w.assets
    .filter((a) => !isCompanionKind(a.kind))
    .map((a) => ({ ...a, thumbnail: thumbnailFor({ ...a, topics: [] }, access) }));

  const embedId = (name: string) => `diagram:learn/assets/${name}`;
  const selfLearn = accessFor(access, "self-learn");
  const embedProblems =
    w.note.available && selfLearn.ok ? await readFileProblems(embedTargets(w.note.source).map(embedId)) : new Map();
  const resolveEmbed = (name: string): EmbedResolution => {
    if (!selfLearn.ok) return { problem: problemForAccess(selfLearn.reason) };
    const id = embedId(name);
    const problem = embedProblems.get(id) ?? null;
    if (problem !== null) return { problem };
    return { src: assetFileHref(id), statusHref: assetStatusHref(id) };
  };
  // A note's wikilinks name its neighbours (and its session logs, which have no
  // workspace), so the neighbours are the links worth resolving.
  const known = new Set([w.slug, ...[...w.requires, ...w.assumes, ...w.dependants, ...w.backlinks].map((r) => r.slug)]);

  const eyebrow = placeLabel(w.place) ?? (w.domain ? `${w.domain} · not in a course yet` : "Not in a course yet");

  return (
    <div data-layout="app" className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-x-3.5 gap-y-3">
        <div className="min-w-0 flex-1 basis-[18rem]">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="mt-1 font-display text-[26px] leading-tight font-bold text-text">{w.title}</h1>
        </div>
        <MasteryDot bucket={w.bucket} showLabel pL={w.pL} />
        <div className="flex flex-wrap items-center gap-3.5">
          {/* Not prefetched: until the session route exists (phase 1d) a prefetch of
              it is a 404 whose segment request Chromium leaves pending, which
              keeps the page from ever going network-idle. */}
          <Button href={`/learn/${w.slug}/session`} prefetch={false}>
            Teach me · focus mode
          </Button>
          <Button variant="secondary" href={`/review?concept=${w.slug}`}>
            Review now
          </Button>
        </div>
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
        tutorAside={<span className="text-[12px] text-text3">Grounded in your note</span>}
        tutor={<TutorChat slug={w.slug} title={w.title} sources={session.sources} suggestions={session.suggestions} />}
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
          The database could not be reached, so this concept cannot be shown. Nothing is lost: the note is still a file
          under learn/concepts, and the mastery and the schedule are still in the database.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-surface2 p-3 text-[12px]">npm run catalog -- status</pre>
      </Card>
    </div>
  );
}
