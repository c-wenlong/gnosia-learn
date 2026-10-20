import Link from "next/link";
import type { ReactNode } from "react";
import type { AssetDerivations, AssetRef, AssetWithTopics } from "@gnosia/catalog/state";

import { assetDisplayTitle, assetKindLabel, formatBytes } from "@/components/asset-meta";
import { Button } from "@/components/ui/Button";
import { CardAction } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { MasteryDot } from "@/components/ui/MasteryDot";
import { Placeholder } from "@/components/ui/Placeholder";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import { cx, LABEL } from "@/components/ui/classes";
import { assetHref, conceptHref, libraryHref, type ExplainedConcept } from "@/lib/library";
import { ownValue } from "@/lib/own-key";

/**
 * The tabbed card under every asset in the library: Explains, Related, Files
 * and Details, in one card rather than a pile of them.
 *
 * `assetTabItems` builds the tabs and `AssetTabs` draws them. They are two
 * because a video's player draws the card itself, with its live Transcript
 * tab in front (`VideoPlayer`'s `tabs`), while every other kind draws it
 * here; both take the same items, so the sections read the same on a note,
 * a diagram, a link and a video.
 *
 * An empty Related or Files tab is left out. Explains stays, since "no
 * concept is linked yet" is worth knowing, and so does Details.
 */

export type AssetTabsInput = {
  asset: AssetWithTopics;
  /** Topic titles by slug, for the Details tab's topic chips. */
  titles: Record<string, string>;
  concepts: ExplainedConcept[];
  /** Other assets under the same topic, already trimmed to what is shown. */
  related: AssetWithTopics[];
  derivations: AssetDerivations;
  /** The day the row was indexed, in the app's time zone. */
  indexed: string;
  /**
   * How far the reader has got, as the first Details row: "Watched" for a
   * video, "Read" for anything else. Left out when there is nothing to say.
   */
  progress?: { label: string; value: ReactNode };
};

export function assetTabItems({
  asset,
  titles,
  concepts,
  related,
  derivations,
  indexed,
  progress,
}: AssetTabsInput): TabItem[] {
  const familyCount = derivations.sources.length + derivations.derived.length;
  return [
    {
      id: "explains",
      label: "Explains",
      count: concepts.length,
      content: <ExplainsList concepts={concepts} />,
    },
    ...(related.length > 0
      ? [
          {
            id: "related",
            label: "Related",
            count: related.length,
            content: <RelatedList asset={asset} related={related} />,
          },
        ]
      : []),
    ...(familyCount > 0
      ? [
          {
            id: "files",
            label: "Files",
            count: familyCount,
            content: <FilesList asset={asset} derivations={derivations} />,
          },
        ]
      : []),
    {
      id: "details",
      label: "Details",
      content: (
        <CatalogFacts asset={asset} titles={titles} indexed={indexed} progress={progress} className="max-w-3xl" />
      ),
    },
  ];
}

/** The card itself, for every kind the player does not draw. */
export function AssetTabs({ label, ...input }: AssetTabsInput & { label: string }) {
  return <Tabs items={assetTabItems(input)} label={label} />;
}

/**
 * The `asset_concept` rows with mastery (hi-fi 11, "Explains"): each concept
 * with its dot and p(L), and the way into the first one's workspace. A concept
 * with no evidence yet says "not started" rather than printing a prior as if it
 * were a measurement.
 */
function ExplainsList({ concepts }: { concepts: ExplainedConcept[] }) {
  const first = concepts[0];
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      {concepts.length === 0 ? (
        <p className="text-[14px] text-text2">No concept is linked to this asset yet.</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {concepts.map((c) => (
            <li key={c.slug} className="flex min-w-0 items-center gap-2.5">
              <MasteryDot bucket={c.bucket} />
              <Link
                href={conceptHref(c.slug)}
                className="min-w-0 flex-1 truncate rounded-sm text-[14px] text-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {c.title}
              </Link>
              <span className="shrink-0 text-[12px] tabular-nums text-text2">
                {c.observations > 0 && c.pL !== null ? c.pL.toFixed(2) : "not started"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {first !== undefined && (
        <Button variant="secondary" size="sm" href={conceptHref(first.slug)} className="self-start">
          Open workspace
        </Button>
      )}
    </div>
  );
}

function RelatedList({ asset, related }: { asset: AssetWithTopics; related: AssetWithTopics[] }) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {related.map((row) => (
          <RelatedRow key={row.id} asset={row} />
        ))}
      </ul>
      {/* The library filters by one topic at a time, so "See all" is only
          honest when this asset has exactly one: with two, the neighbours from
          the second would be missing from the page it opens. Each topic's own
          view is a chip in Details instead. */}
      {asset.topics.length === 1 && asset.topics[0] !== undefined && (
        <CardAction href={libraryHref({ topic: asset.topics[0] })} className="self-start">
          See all under this topic
        </CardAction>
      )}
    </div>
  );
}

/** One neighbour under the same topic: a small labelled box and its title. */
function RelatedRow({ asset }: { asset: AssetWithTopics }) {
  const name = assetDisplayTitle(asset);
  return (
    <li>
      <Link
        href={assetHref(asset.id)}
        className="group flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="w-16 shrink-0">
          <Placeholder label={assetKindLabel(asset.kind)} height={44} className="px-1" />
        </span>
        <span
          className={cx(
            "line-clamp-2 min-w-0 text-[13px] text-text underline-offset-4 group-hover:underline",
            name.source !== "title" && "font-mono",
          )}
        >
          {name.text}
        </span>
      </Link>
    </li>
  );
}

function FilesList({ asset, derivations }: { asset: AssetWithTopics; derivations: AssetDerivations }) {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {derivations.sources.length > 0 && <FamilyGroup title="Derived from" rows={derivations.sources} />}
      {derivations.derived.length > 0 && (
        <FamilyGroup
          title={asset.kind === "video" ? "Companion files" : "Produced from this"}
          rows={derivations.derived}
        />
      )}
      <p className="text-[12px] leading-relaxed text-text3">
        Kept out of the library&rsquo;s default view so they do not bury what they accompany. Each
        one has a page of its own.
      </p>
    </div>
  );
}

/** A titled list of sources or companions. */
function FamilyGroup({ title, rows }: { title: string; rows: AssetRef[] }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className={LABEL}>{title}</h3>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <FamilyRow key={row.id} asset={row} />
        ))}
      </ul>
    </section>
  );
}

/**
 * A source or a companion file, named by what it is ("Transcript", "Diagram
 * source") with its filename and size beside it. Not by title: a companion
 * carries the title of the video or drawing it belongs to, which is the title
 * the page is already showing, so a list of them would say it three times.
 */
function FamilyRow({ asset }: { asset: AssetRef }) {
  const size = formatBytes(asset.bytes);
  const file = asset.path?.split("/").pop() ?? asset.url ?? null;
  return (
    <li>
      <Link
        href={assetHref(asset.id)}
        className="group flex min-w-0 items-baseline justify-between gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="shrink-0 text-[13px] text-text underline-offset-4 group-hover:underline">
          {assetKindLabel(asset.kind)}
        </span>
        <span className="min-w-0 truncate text-right text-[12px] text-text2" title={file ?? undefined}>
          {[file, size].filter(Boolean).join(" · ")}
        </span>
      </Link>
    </li>
  );
}

/**
 * The row as the catalog holds it, plus how far the reader has got. A reader
 * here is often checking what to type, so the ids and paths are the
 * identifiers rather than labels.
 */
function CatalogFacts({
  asset,
  titles,
  indexed,
  progress,
  className,
}: {
  asset: AssetWithTopics;
  titles: Record<string, string>;
  indexed: string;
  progress?: { label: string; value: ReactNode };
  className?: string;
}) {
  const size = formatBytes(asset.bytes);
  return (
    <dl className={cx("flex flex-col gap-2", className)}>
      {progress !== undefined && <Fact label={progress.label}>{progress.value}</Fact>}
      <Fact label="Kind">{assetKindLabel(asset.kind)}</Fact>
      <Fact label="Indexed">{indexed}</Fact>
      <Fact label="Id">
        <span className="font-mono text-[12px]">{asset.id}</span>
      </Fact>
      <Fact label={asset.path === null ? "URL" : "Path"}>
        <span className="font-mono text-[12px]">{asset.path ?? asset.url ?? "none"}</span>
      </Fact>
      <Fact label="Source">{asset.sourceRepo}</Fact>
      <Fact label="Size">
        {asset.bytes === null ? "unknown" : `${size} (${asset.bytes.toLocaleString("en")} bytes)`}
      </Fact>
      <Fact label="Topics">
        {asset.topics.length === 0 ? (
          "none"
        ) : (
          <span className="flex flex-wrap gap-1.5">
            {asset.topics.map((slug) => (
              <Chip key={slug} size="sm" href={libraryHref({ topic: slug })} title={ownValue(titles, slug) ?? slug}>
                <span className="font-mono">{slug}</span>
              </Chip>
            ))}
          </span>
        )}
      </Fact>
    </dl>
  );
}

/** A labelled fact. Two columns on anything wider than a phone. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-4">
      <dt className={cx(LABEL, "pt-0.5")}>{label}</dt>
      <dd className="min-w-0 break-words text-[13px] text-text2">{children}</dd>
    </div>
  );
}
