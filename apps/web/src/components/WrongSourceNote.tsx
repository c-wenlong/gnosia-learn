import { WRONG_SOURCE_NOTE, type WrongSource } from "@gnosia/tutor/session-core";

/**
 * The line under a multiple-choice question whose wrong options the tutor did
 * not write. Nothing for the tutor's own options or an unknown source.
 */
export function WrongSourceNote({ source }: { source: WrongSource | undefined }) {
  if (source === undefined || source === "tutor") return null;
  return <p className="text-[12px] leading-snug text-text2">{WRONG_SOURCE_NOTE[source]}</p>;
}
