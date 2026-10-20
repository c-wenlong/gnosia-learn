import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

import {
  CAPTION_LEADING,
  CAPTION_MAX_LINES,
  CAPTION_SIZE,
  CAPTION_TOP,
  CAPTION_WIDTH,
  CAPTION_X,
  HEADER_SIZE,
  HEADER_Y,
  PAGE_FRAME_HEIGHT,
  PAGE_HEIGHT,
  PAGE_WIDTH,
} from "./recipe";

/**
 * Assembling the PDF itself: one page per extracted frame, the frame
 * full-bleed across the top and the beat's narration wrapped under it.
 *
 * pdf-lib rather than a hand-rolled document: embedding a JPEG is one
 * `embedJpg` call, and caption wrapping needs real Helvetica widths, which
 * `widthOfTextAtSize` carries — an approximation re-wraps every long line
 * onto the frame or off the page. There is no font embedding cost: Helvetica
 * is one of the fourteen every reader ships.
 */

const INK = rgb(0.16, 0.16, 0.18);
const FAINT = rgb(0.45, 0.45, 0.5);

/** The caption, broken to fit `CAPTION_WIDTH` and clipped after `CAPTION_MAX_LINES` with an ellipsis. */
export function wrapCaption(text: string, font: PDFFont, size = CAPTION_SIZE, width = CAPTION_WIDTH): string[] {
  const words = text.split(/\s+/).filter((w) => w !== "");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line === "" ? word : `${line} ${word}`;
    if (line !== "" && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = word;
      if (lines.length === CAPTION_MAX_LINES) break;
    } else {
      line = next;
    }
  }
  if (lines.length < CAPTION_MAX_LINES && line !== "") lines.push(line);
  if (lines.length === CAPTION_MAX_LINES) {
    // There is more text than the lines drawn: mark the last one rather than
    // silently dropping the rest of the sentence.
    const last = lines[CAPTION_MAX_LINES - 1] as string;
    let clipped = last;
    while (clipped.length > 0 && font.widthOfTextAtSize(`${clipped}…`, size) > width) {
      clipped = clipped.slice(0, -1);
    }
    lines[CAPTION_MAX_LINES - 1] = `${clipped.replace(/[\s.,;:]+$/, "")}…`;
  }
  return lines;
}

export interface PdfPageInput {
  /** The JPEG frame, at least 16:9-shaped; scaled to the frame band either way. */
  jpeg: Buffer;
  /** The narration under the frame, already plain text; "" for a silent cut's pages. */
  caption: string;
}

/**
 * The document's subject line marks which inputs it was set from: the hash
 * `pdfInputs` in `build.ts` makes of the video's bytes, its title and its
 * transcript's blob key. A stored PDF then vouches for itself, no revision
 * history required — a memory a write that changes nothing cannot move,
 * since it appends no revision.
 */
const INPUTS_PREFIX = "self-learn inputs: ";

/** The inputs fingerprint a stored PDF was assembled with, or null when it does not carry one. */
export async function pdfInputsOf(body: Buffer): Promise<string | null> {
  try {
    const subject = (await PDFDocument.load(body)).getSubject() ?? "";
    return subject.startsWith(INPUTS_PREFIX) ? subject.slice(INPUTS_PREFIX.length) : null;
  } catch {
    return null;
  }
}

/**
 * The document: `title` in the header line of every page beside `n / N`, one
 * page per frame, `inputs` in the metadata naming what it was made from.
 * Returns the PDF bytes.
 */
export async function assemblePdf(title: string, pages: readonly PdfPageInput[], inputs: string): Promise<Buffer> {
  // `updateMetadata: false` and no date fields: the same video makes the
  // same document byte for byte, which is the whole point of a
  // content-addressed store — a rebuilt PDF lands on the key it already
  // has, and a rerun links the row back rather than storing it again.
  const doc = await PDFDocument.create({ updateMetadata: false });
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle(title);
  doc.setProducer("self-learn catalog");
  doc.setSubject(`${INPUTS_PREFIX}${inputs}`);

  // The header never wraps: a long title is clipped on the right, not
  // wrapped over the frame.
  const clip = (text: string, maxWidth: number): string => {
    let out = text;
    while (out.length > 0 && regular.widthOfTextAtSize(`${out}…`, HEADER_SIZE) > maxWidth) {
      out = out.slice(0, -1);
    }
    return out === text ? out : `${out.replace(/\s+$/, "")}…`;
  };

  for (const [index, input] of pages.entries()) {
    const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    // `new Uint8Array` copies: a Buffer's `.buffer` is the shared pool its
    // bytes sit somewhere inside, and pdf-lib reads the DataView from
    // offset 0, so a pooled Buffer reads as "SOI not found".
    const image = await doc.embedJpg(new Uint8Array(input.jpeg));
    page.drawImage(image, { x: 0, y: PAGE_HEIGHT - PAGE_FRAME_HEIGHT, width: PAGE_WIDTH, height: PAGE_FRAME_HEIGHT });

    const count = `${index + 1} / ${pages.length}`;
    page.drawText(count, {
      x: PAGE_WIDTH - CAPTION_X - regular.widthOfTextAtSize(count, HEADER_SIZE),
      y: HEADER_Y,
      size: HEADER_SIZE,
      font: regular,
      color: FAINT,
    });
    page.drawText(clip(title, CAPTION_WIDTH - regular.widthOfTextAtSize(count, HEADER_SIZE) - 60), {
      x: CAPTION_X,
      y: HEADER_Y,
      size: HEADER_SIZE,
      font: bold,
      color: FAINT,
    });

    for (const [row, line] of wrapCaption(input.caption, regular).entries()) {
      page.drawText(line, { x: CAPTION_X, y: CAPTION_TOP - row * CAPTION_LEADING, size: CAPTION_SIZE, font: regular, color: INK });
    }
  }

  return Buffer.from(await doc.save());
}
