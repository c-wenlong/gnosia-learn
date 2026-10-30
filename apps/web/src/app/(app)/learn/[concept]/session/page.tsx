import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { EmbedImage } from "@/components/EmbedImage";
import { MathText } from "@/components/Math";
import { NoteProse, type EmbedResolution } from "@/components/NoteProse";
import { SessionFocus } from "@/components/session/SessionFocus";
import { VideoPlayer } from "@/components/VideoPlayer";
import { WidgetFailure } from "@/components/WidgetFailure";
import { readFileProblems } from "@/lib/asset-library";
import type { RouteProblemCode } from "@gnosia/tutor/asset-problems";
import { isConceptSlug } from "@gnosia/tutor/concept-workspace-core";
import { loadConceptWorkspace } from "@/lib/concept-workspace";
import { assetFileHref, assetStatusHref } from "@/lib/library";
import { embedTargets } from "@/lib/note-embeds";
import { parseMode, teachProse } from "@gnosia/tutor/session-core";
import { loadSessionPage, type TeachAsset } from "@/lib/session-page";
import { TextLink } from "@/components/ui/TextLink";
import { PAGE_TITLE } from "@/components/ui/classes";

/**
 * Session focus mode (hi-fi 05, 06 and 07, and 15 on a phone): one concept
 * taught as a short scripted loop, probe, teach, check, close, in focus mode
 * with no sidebar.
 *
 * Everything is read here, on the server: the workspace (the note, its
 * checks, its assets, the learner's p(L)), the step plan built from the
 * checks, the teaching prose cut from the note and rendered by `NoteProse`,
 * and the asset for the widget slot. The client session receives it whole and
 * writes one `POST /api/learner/observe` per graded answer, then
 * `router.refresh()`, which re-runs this.
 *
 * `?mode=check` (Quiz me) skips the probe and the teaching and asks the note's
 * checks.
 *
 * A question step nothing can fill (no check in the note, no model configured)
 * is dropped here, on the server, rather than walked through as an empty card:
 * Teach me teaches and closes, Quiz me opens on the close screen, and both say
 * why.
 */

type Props = {
  params: Promise<{ concept: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { concept } = await params;
  const read = isConceptSlug(concept) ? await loadConceptWorkspace(concept) : null;
  return { title: read?.state === "ok" ? `${read.workspace.title} · Session` : "Session" };
}

export default async function SessionPage({ params, searchParams }: Props) {
  // A concept id is lowercase letters, digits and hyphens, so a segment with
  // an escape in it was never one; the page's segment is not decoded.
  const { concept: slug } = await params;
  if (!isConceptSlug(slug)) notFound();
  const query = await searchParams;
  const mode = parseMode(Array.isArray(query.mode) ? query.mode[0] : query.mode);

  const read = await loadConceptWorkspace(slug);
  if (read.state === "not-found") notFound();
  if (read.state === "unreachable") return <Unreachable slug={slug} />;
  const w = read.workspace;

  const data = await loadSessionPage(w, mode);

  // The note's own `![[embeds]]`, decided on the server exactly as the
  // workspace decides them, so the prose never renders a broken picture, and
  // per embed, so one in the blob store shows with the switch off.
  const prose = w.note.available ? teachProse(w.note.source) : "";
  const embedId = (name: string) => `diagram:learn/assets/${name}`;
  const embedProblems =
    prose !== ""
      ? await readFileProblems(embedTargets(prose).map(embedId))
      : new Map<string, RouteProblemCode | null>();
  const resolveEmbed = (name: string): EmbedResolution => {
    const id = embedId(name);
    const problem = embedProblems.get(id) ?? null;
    if (problem !== null) return { problem };
    return { src: assetFileHref(id), statusHref: assetStatusHref(id) };
  };
  const known = new Set([w.slug, ...[...w.requires, ...w.assumes, ...w.dependants].map((r) => r.slug)]);

  const teach =
    prose !== "" ? (
      <NoteProse
        source={prose}
        idPrefix="teach-"
        // The concept's note: its author put any picture there.
        images="show"
        resolveNote={(target) => (known.has(target) ? `/learn/${target}` : undefined)}
        resolveEmbed={resolveEmbed}
        className="md:text-[17px] md:leading-[27px]"
      />
    ) : (
      <p className="text-[15px] leading-[1.5] text-text md:text-[17px] md:leading-[27px]">
        {w.summary ? (
          <MathText text={w.summary} />
        ) : (
          "This note has no body yet. Read the summary in the workspace, then check yourself below."
        )}
      </p>
    );

  return (
    <div data-layout="focus">
      {/* Keyed, so Keep going to another concept's session starts a fresh one
          rather than carrying this one's answers across the navigation. */}
      <SessionFocus
        key={`${w.slug}:${mode}`}
        slug={w.slug}
        title={w.title}
        mode={mode}
        plan={data.plan}
        modelAvailable={data.modelAvailable}
        nothingToAsk={data.nothingToAsk}
        teach={teach}
        asset={assetElement(data.asset, false)}
        assetCompact={assetElement(data.asset, true)}
        next={data.next}
      />
    </div>
  );
}

/**
 * The widget slot's content, or null for the placeholder. The check step shows
 * a diagram again, smaller, so the question can be answered against it; a
 * video is not replayed there.
 */
function assetElement(asset: TeachAsset, compact: boolean) {
  if (asset.kind === "none") return null;
  if (asset.kind === "failed") {
    if (compact) return null;
    return (
      <WidgetFailure
        headline={
          <>
            <span className="font-medium">{asset.title}</span> cannot be shown here.
          </>
        }
        code={asset.code}
        sourceRepo={asset.sourceRepo}
        className="min-h-[180px]"
      />
    );
  }
  if (asset.kind === "video") {
    if (compact) return null;
    return (
      <VideoPlayer
        src={asset.src}
        statusHref={asset.statusHref}
        poster={asset.poster ?? undefined}
        title={asset.title}
        sourceRepo={asset.sourceRepo}
      />
    );
  }
  return (
    <div className={compact ? "overflow-hidden rounded-xl [&_img]:max-h-[126px]" : "overflow-hidden rounded-xl [&_img]:max-h-[360px]"}>
      <EmbedImage src={asset.src} statusHref={asset.statusHref} alt={asset.title} name={asset.title} vector />
    </div>
  );
}

function Unreachable({ slug }: { slug: string }) {
  return (
    <div data-layout="focus">
      <div className="mx-auto flex max-w-[720px] flex-col items-center gap-4 px-4 pt-16 text-center">
        <h1 className={PAGE_TITLE}>The session cannot start</h1>
        <p className="text-[14px] text-text2">
          The catalog could not be read, so there is no note to teach from and nowhere to record an answer. Nothing is
          lost. Check it with this, then reload.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-surface2 p-3 text-[12px]">npm run catalog -- status</pre>
        <TextLink href={`/learn/${slug}`} size="md">
          Back to the workspace
        </TextLink>
      </div>
    </div>
  );
}
