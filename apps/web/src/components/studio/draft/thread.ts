import type { MentionValue } from "@/components/ui/mention-text";
import { visibleEntries } from "@/lib/studio-chat";
import type { DraftKind, DraftView, TagKind, TranscriptEntry } from "@/lib/studio-drafts";

/**
 * The conversation panel's small pure parts, shared by its hooks and its
 * pieces. React-free on purpose: a `"use client"` module's exports are client
 * references, so a helper that may be called anywhere does not live in one.
 */

/** What the composer holds: words and the kinds' chips. */
export type Value = MentionValue<TagKind>;

/** A card's identity: its reply and its kind. */
export type CardKey = `${number}:${DraftKind}`;

export const cardKey = (seq: number, kind: DraftKind): CardKey => `${seq}:${kind}`;

/** The newest seq in a transcript, or 0 for an empty one. */
export function topSeq(transcript: readonly Pick<TranscriptEntry, "seq">[]): number {
  return transcript.reduce((max, entry) => Math.max(max, entry.seq), 0);
}

/** The kind E6 is about: the refused brief's own, when the runner names one. */
export function problemKindOf(view: Pick<DraftView, "transcript" | "error">): DraftKind | null {
  if (view.error?.briefKind !== undefined) return view.error.briefKind;
  const last = visibleEntries(view.transcript).at(-1);
  const kind = last?.briefInvalid?.kind ?? last?.briefsInvalid?.find((item) => !item.retried)?.kind;
  return kind ?? null;
}

/**
 * The cost note under a brief card's press (D107): what finished jobs of
 * the kind have cost on this machine, while there are enough to say.
 */
export function costNote(estimates: DraftView["estimates"], kind: DraftKind): string | null {
  const band = estimates?.[kind];
  if (band === null || band === undefined) return null;
  return `Past ${kind === "video" ? "videos" : "diagrams"} here ran $${band.low.toFixed(2)}–$${band.high.toFixed(2)}.`;
}
