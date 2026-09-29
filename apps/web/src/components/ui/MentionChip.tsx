import { cx } from "./classes";
import { Glyph, type GlyphName } from "./Glyph";

/**
 * A tag's chip, inline in a sentence: in `MentionComposer`'s field, and in
 * the sent message the transcript draws back (docs/STUDIO-MENTIONS.md, "How
 * the menu and the chip look").
 *
 * 14px 600 in `--accent-text` on `--tint`, radius 6, 2px by 6px, sitting on
 * the text's baseline so a line with a chip is the height of one without.
 * The name is followed by a visually hidden " tag", so a screen reader reading
 * the sentence says "make a Video tag of how TCP opens a connection".
 *
 * `waiting` is the quiet "waiting" a tagged message's chip carries until its
 * brief lands (D57). Server-safe: no state and no hooks.
 */
export function MentionChip({
  name,
  icon,
  waiting = false,
  className,
}: {
  name: string;
  icon?: GlyphName | null;
  waiting?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline whitespace-nowrap rounded-md bg-tint px-1.5 py-0.5 text-[14px] font-semibold leading-none text-accent-text",
        "[box-decoration-break:clone]",
        className,
      )}
    >
      {icon ? <Glyph name={icon} size={14} className="mr-1 inline-block align-[-2px]" /> : null}
      {name}
      <span className="sr-only"> tag</span>
      {waiting && (
        <span className="ml-1 text-[12px] font-normal text-text3">
          waiting<span className="sr-only"> for its brief</span>
        </span>
      )}
    </span>
  );
}
