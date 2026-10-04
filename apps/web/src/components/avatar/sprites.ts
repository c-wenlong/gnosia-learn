import type { AvatarId } from "@self-learn/schema/shared";

/**
 * The pictures behind `AVATARS`: one 16 by 16 grid per sprite, a palette, and
 * the tint of the disc each sits on. React-free, so a test can read the grids
 * and a server component can draw them (docs/design/BRAND.md, "Avatar
 * sprites").
 *
 * Each row is 16 characters, one per pixel: `.` is clear and every other
 * character is a key of `PALETTE`. The colours are fixed rather than theme
 * tokens, like the mascot's renders: a sprite is art on its own light disc,
 * and the same picture in every theme. Most are drawn from the brand's seven
 * colours; the creatures add a few of their own (the fox's orange, the
 * frog's greens).
 */
export const PALETTE = {
  /** light bark */
  "B": "#b08a5a",
  /** light gold (`--brand-gold`, dark) */
  "G": "#e2b95e",
  /** leaf */
  "N": "#8cc46a",
  /** light teal (`--brand-teal`, dark) */
  "T": "#5cbab3",
  /** bark */
  "b": "#7a5233",
  /** cream (`--brand-cream`) */
  "c": "#faf6ec",
  /** gold (`--brand-gold`) */
  "g": "#b3842c",
  /** navy outline (`--brand-navy`) */
  "k": "#0d1c2b",
  /** slate */
  "m": "#4f6173",
  /** fox orange */
  "o": "#d9822b",
  /** blush */
  "p": "#e7a0a0",
  /** mist (`--brand-mist`, dark) */
  "s": "#a3b2bf",
  /** teal (`--brand-teal`) */
  "t": "#0f5f61",
} as const;

export type PaletteKey = keyof typeof PALETTE;

export interface Sprite {
  /** 16 rows of 16 pixels, top to bottom. */
  rows: readonly string[];
  /** The disc behind it. */
  disc: string;
}

export const SPRITES: Record<AvatarId, Sprite> = {
  owl: {
    disc: "#ece3cf",
    rows: [
      "................",
      "...k........k...",
      "...kk......kk...",
      "...ktkkkkkktk...",
      "..kttttttttttk..",
      "..ktcccccccctk..",
      "..ktckcccckctk..",
      "..ktcccggccctk..",
      "..kttttggttttk..",
      ".kttTTTTTTTTttk.",
      ".ktTTcTTTTcTTtk.",
      ".ktTTTcTTcTTTtk.",
      "..ktTTTTTTTTtk..",
      "...kttttttttk...",
      "....kkkkkkkk....",
      "....gGg..gGg....",
    ],
  },
  cat: {
    disc: "#dfe6ec",
    rows: [
      "................",
      "..k..........k..",
      "..kk........kk..",
      "..kmk......kmk..",
      "..kmmkkkkkkmmk..",
      "..kmmmmmmmmmmk..",
      ".kmmGkmmmmkGmmk.",
      ".kmmGGmmmmGGmmk.",
      ".kmmmmmppmmmmmk.",
      ".kmmmmmkkmmmmmk.",
      "..kmmmmmmmmmmk..",
      "...kkmmmmmmkk...",
      "..kmmmccccmmmk..",
      "..kmmccccccmmk..",
      "..kmmccccccmmk..",
      "..kkkkkkkkkkkk..",
    ],
  },
  bookworm: {
    disc: "#e3edd6",
    rows: [
      "................",
      "......kkkk......",
      ".....kNNNNk.....",
      "....kNNNNNNk....",
      "...kkkkkkkkkk...",
      "...kcckNNkcck...",
      "...kckkNNkkck...",
      "...kkkkNNkkkk...",
      "....kNNNNNNk....",
      "....kNNkkNNk....",
      "....kNNNNNNk....",
      ".kkkkkkkkkkkkkk.",
      "kcccccckkcccccck",
      "kcmmmmckkcmmmmck",
      "kcccccckkcccccck",
      "kttttttkkttttttk",
    ],
  },
  fox: {
    disc: "#f3e0cc",
    rows: [
      "................",
      "..k..........k..",
      "..kk........kk..",
      "..kok......kok..",
      "..kcok....kock..",
      "..kcookkkkoock..",
      ".kooooooooooook.",
      ".koookooookoook.",
      ".kcoooooooooock.",
      "..kccccoocccck..",
      "...kccckkccck...",
      "....kkcccckk....",
      "...kooccccook...",
      "..koooccccoook..",
      "..koooccccoook..",
      "..kkkkkkkkkkkk..",
    ],
  },
  hedgehog: {
    disc: "#ece3cf",
    rows: [
      "................",
      "...k.k.kk.k.k...",
      "..kbkbkbbkbkbk..",
      ".kbBbBbBBbBbBbk.",
      "kbBbBbBbbBbBbBbk",
      "kbbbbbbbbbbbbbbk",
      "kbbbkkkkkkkkbbbk",
      "kbbkcccccccckbbk",
      "kbkcckcccckcckbk",
      "kbkcckcccckcckbk",
      "kbkpccccccccpkbk",
      ".kbkccckkccckbk.",
      "..kbkcckkcckbk..",
      "...kkkkkkkkkk...",
      "...kbk....kbk...",
      "................",
    ],
  },
  raven: {
    disc: "#dfe6ec",
    rows: [
      "................",
      "................",
      "....kkkkkkkk....",
      "...kmmmmmmmmk...",
      "..kmmmmmmmmmmk..",
      "..kmcckmmkccmk..",
      "..kmckkmmkkcmk..",
      "..kmmmmggmmmmk..",
      "..kmmmmggmmmmk..",
      ".kmsmmmkkmmmsmk.",
      ".kmssmmmmmmssmk.",
      ".kmssmmmmmmssmk.",
      "..kmsmmmmmmsmk..",
      "...kkmmmmmmkk...",
      "....kGkmmkGk....",
      "................",
    ],
  },
  frog: {
    disc: "#e3edd6",
    rows: [
      "................",
      "................",
      "..kkkk....kkkk..",
      ".kcccck..kcccck.",
      ".kcckck..kckcck.",
      ".kccccNkkNcccck.",
      "..kkNNNNNNNNkk..",
      ".kNNNNNNNNNNNNk.",
      "kNNNNNNNNNNNNNNk",
      "kNpNNNNNNNNNNpNk",
      "kNNkkkkkkkkkkNNk",
      ".kNNNNNNNNNNNNk.",
      "..kNccccccccNk..",
      "..kNccccccccNk..",
      ".kNNkkkkkkkkNNk.",
      ".kkk........kkk.",
    ],
  },
  mouse: {
    disc: "#f1e4e4",
    rows: [
      "................",
      ".kkk........kkk.",
      "kssck......kcssk",
      "kspsk......kspsk",
      "ksssk......ksssk",
      ".kkskkkkkkkkskk.",
      "..kssssssssssk..",
      "..kssksssskssk..",
      "..kssssssssssk..",
      "..ksssskkssssk..",
      ".kcssssssssssck.",
      "..kksssssssskk..",
      "...ksccccccsk...",
      "...ksccccccsk...",
      "...kkkkkkkkkk...",
      "................",
    ],
  },
  moth: {
    disc: "#f3e9cc",
    rows: [
      "...k........k...",
      "....k......k....",
      "kkk..k....k..kkk",
      "kGGk.kkkkkk.kGGk",
      "kGgGkkcccckkGgGk",
      "kGGGkcccccckGGGk",
      "kGgGkckcckckGgGk",
      "kGGGkcccccckGGGk",
      ".kGGkpccccpkGGk.",
      "kGGGkcccccckGGGk",
      "kGgGkcccccckGgGk",
      "kGGGkcccccckGGGk",
      ".kkkkcccccckkkk.",
      "....kcccccck....",
      ".....kkkkkk.....",
      "................",
    ],
  },
  tortoise: {
    disc: "#d6ebe7",
    rows: [
      "................",
      "....kkkkkkkk....",
      "...kgtgttgtgk...",
      "..kgtgtggtgtgk..",
      "..ktgtgttgtgtk..",
      ".kgtgtgttgtgtgk.",
      ".kkkkkkkkkkkkkk.",
      "kNNkNkkkkkkNkNNk",
      "kNNkkNNNNNNkkNNk",
      ".kkkNcNNNNcNkkk.",
      "...kNkNNNNkNk...",
      "...kNNNNNNNNk...",
      "...kNpNNNNpNk...",
      "....kNNkkNNk....",
      ".....kkkkkk.....",
      "................",
    ],
  },
  rabbit: {
    disc: "#f1e4e4",
    rows: [
      "....kk....kk....",
      "...kck....kck...",
      "...kpck..kcpk...",
      "...kpck..kcpk...",
      "...kpck..kcpk...",
      "...kcck..kcck...",
      "..kkcckkkkcckk..",
      "..kcccccccccck..",
      ".kcckcccccckcck.",
      ".kcpccccccccpck.",
      ".kccccckkccccck.",
      "..kccckkkkccck..",
      "..kcccccccccck..",
      "..kcccccccccck..",
      "..kpkkkkkkkkpk..",
      "...k........k...",
    ],
  },
  bat: {
    disc: "#e4e1ee",
    rows: [
      "................",
      "................",
      "...k........k...",
      "...kk..kk..kk...",
      "...kmkkmmkkmk...",
      "k..kmmmmmmmmk..k",
      "kk.kmGkmmkGmk.kk",
      "kmkkmmmmmmmmkkmk",
      "kmmkmmmkkmmmkmmk",
      "kmmmkmmmmmmkmmmk",
      "kmkmmkmmmmkmmkmk",
      "kk.kmmmmmmmmk.kk",
      "k...kmmmmmmk...k",
      "....kkmmmmkk....",
      ".....kkkkkk.....",
      "................",
    ],
  },
};

/** One run of same-coloured pixels on a row, which `PixelAvatar` draws as one rect. */
export interface Run {
  x: number;
  y: number;
  width: number;
  fill: string;
}

/**
 * A sprite as horizontal runs, so a picture is about 120 rects rather than
 * up to 256, with no seam between neighbouring pixels of one colour.
 */
export function spriteRuns(sprite: Sprite): Run[] {
  const runs: Run[] = [];
  sprite.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === key) end++;
      if (key !== ".") runs.push({ x, y, width: end - x, fill: PALETTE[key as PaletteKey] });
      x = end;
    }
  });
  return runs;
}
