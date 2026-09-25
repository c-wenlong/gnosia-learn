import { parseInline, parseNote, standaloneFigure, type Block } from "@/components/markdown";

/**
 * Every `![[name]]` a note will render as a figure, in order, once each.
 *
 * The detail page needs the list before it renders the note, so it can ask the
 * server which of those files are already known not to load and hand that
 * answer to `NoteProse` instead of letting the browser find out.
 *
 * It walks the blocks exactly as `NoteProse` does: a paragraph that is nothing
 * but one embed becomes a figure, wherever it sits (inside a list item or a
 * callout included), and an embed in the middle of a sentence is only named,
 * never loaded, so it is not listed. A markdown `![alt](src)` is not listed
 * either: it points wherever the note says, not at the asset route.
 */
export function embedTargets(source: string): string[] {
  const found = new Set<string>();
  const walk = (blocks: Block[]) => {
    for (const block of blocks) {
      if (block.kind === "paragraph") {
        const figure = standaloneFigure(parseInline(block.text));
        if (figure?.kind === "embed") found.add(figure.target);
      } else if (block.kind === "list") {
        for (const item of block.items) walk(item);
      } else if (block.kind === "quote") {
        walk(block.blocks);
      }
    }
  };
  walk(parseNote(source).blocks);
  return [...found];
}
