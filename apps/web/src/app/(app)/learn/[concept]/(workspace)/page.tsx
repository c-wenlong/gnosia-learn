import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { EmbedResolution } from "@/components/NoteProse";
import { PAGE_ENTER, WORKSPACE_ROOT } from "@/components/PageLoading";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { TextLink } from "@/components/ui/TextLink";
import { CONCEPT_TITLE, cx, NOTE } from "@/components/ui/classes";
import { NoteAndSources } from "@/components/workspace/NoteAndSources";
import { StudioCards, type StudioAsset } from "@/components/workspace/StudioCards";
import { dueRecall } from "@/lib/tutor-check";
import { TutorChat } from "@/components/workspace/TutorChat";
import { WorkspacePanels } from "@/components/workspace/WorkspacePanels";
import { buildConceptSessionContext, tutorStyleLabel } from "@/lib/agent/prompt";
import { loadAssetAccess, readFileProblems, thumbnailFor } from "@/lib/asset-library";
import type { RouteProblemCode } from "@/lib/asset-problems";
import { isConceptSlug, placeLabel, toConceptPromptInput } from "@/lib/concept-workspace-core";
import { loadConceptWorkspace } from "@/lib/concept-workspace";
import { appTimeZone } from "@/lib/time-zone";
import { dueLabel } from "@/lib/learn-index";
import { assetFileHref, assetStatusHref, isCompanionKind } from "@/lib/library";
import { embedTargets } from "@/lib/note-embeds";
import { NOTHING_TO_ASK } from "@/lib/session-core";
import { sessionWillAsk } from "@/lib/session-page";
import { readTutorStyle } from "@/lib/settings";
import { studioEnabled } from "@/lib/studio";

/**
 * The concept workspace (hi-fi 04): a concept's note and sources on the left,
 * the tutor in the middle, the things made from it on the right, and the way
 * out (Teach me) in the header. There is no Review now (removed 2026-10-05):
 * it opened the whole due queue with this concept first, which read as
 * "review this topic" and was not, and a due card's recall now happens in the
 * tutor, which opens on it (docs/proposals/recall-in-chat.md, R3).
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
  const timeZone = appTimeZone();
  const nextReview = w.review ? dueLabel(w.review.due, new Date(), timeZone).label : null;
  // R3 of docs/proposals/recall-in-chat.md: a due card opens the tutor on a
  // recall question, the note's first check when there is one. The due date
  // is the only trigger, read here per request, so a recorded answer that
  // reschedules the card turns it off on the next refresh.
  const recall = dueRecall(w.review, w.checks, new Date());

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
    <div data-layout="workspace" className={cx(WORKSPACE_ROOT, PAGE_ENTER)}>
      <header className="flex shrink-0 flex-wrap items-center gap-x-3.5 gap-y-3">
        <div className="min-w-0 flex-1 basis-[18rem]">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className={cx(CONCEPT_TITLE, "mt-1")}>{w.title}</h1>
        </div>
        <MasteryDot bucket={w.bucket} showLabel pL={w.pL} />
        <div className="flex flex-wrap items-center gap-3.5">
          <Button href={`/learn/${w.slug}/session`} aria-describedby={canAsk ? undefined : "session-asks-nothing"}>
            {/* No "· focus mode" suffix: the session page is the focus layout, and
                Home's button to the same page already says "Continue teaching". */}
            Teach me
          </Button>
        </div>
        {!canAsk && (
          <p id="session-asks-nothing" className={cx(NOTE, "basis-full")}>
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
          <TextLink href="/settings?tab=tutor" title="Tutor style, set in Settings" tone="muted" size="xs" weight="normal">
            {tutorStyleLabel(style)}
          </TextLink>
        }
        tutor={
          <TutorChat
            slug={w.slug}
            title={w.title}
            sources={session.sources}
            suggestions={session.suggestions}
            initialDraft={ask}
            // D67: only a deployment with a studio asks it anything.
            studio={studioEnabled()}
            recall={recall}
          />
        }
        initialPanel={ask === undefined ? undefined : "tutor"}
        studio={<StudioCards workspace={w} assets={assets} nextReview={nextReview} />}
      />
    </div>
  );
}

/**
 * In the workspace's own mode, as its loading frame is, so the shell does not
 * change height as it lands. The shell is fixed to the viewport there, so the
 * notice scrolls inside itself in a short window rather than being cut off.
 */
function Unreachable() {
  return (
    <div data-layout="workspace" className={cx(WORKSPACE_ROOT, "ws:overflow-y-auto")}>
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
