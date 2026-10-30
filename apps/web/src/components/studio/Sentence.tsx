import { MentionChip } from "@/components/ui/MentionChip";
import { inlinePieces, type MentionValue } from "@/lib/mentions";
import { KIND_NAME } from "@/lib/studio-cards";
import type { TagKind } from "@/lib/studio-drafts";

/** A sent message's words, with its chips drawn back where they were (D57). */
export function Sentence({ value, waiting = [] }: { value: MentionValue<TagKind>; waiting?: readonly TagKind[] }) {
  return (
    <>
      {inlinePieces(value).map((piece, at) =>
        piece.type === "text" ? (
          <span key={at}>{piece.text}</span>
        ) : (
          <MentionChip key={at} name={KIND_NAME[piece.kind] ?? piece.kind} icon={piece.kind} waiting={waiting.includes(piece.kind)} />
        ),
      )}
    </>
  );
}
