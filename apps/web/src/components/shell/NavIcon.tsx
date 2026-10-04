import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import type { DestinationKey } from "@/lib/nav";

/**
 * The sidebar's destination icons, one per destination: the kit's glyphs, so
 * Courses' book is the course page's book and Learn's bulb its concepts mark.
 * Plain 20px outlines in the current text colour, so the active item's colour
 * change carries to them.
 */
const GLYPH: Record<DestinationKey, GlyphName> = {
  home: "home",
  courses: "book",
  learn: "concepts",
  library: "assets",
};

export function NavIcon({ name, className }: { name: DestinationKey; className?: string }) {
  return <Glyph name={GLYPH[name]} className={className} />;
}
