"use client";

import { Glyph } from "@/components/ui/Glyph";
import { Menu, MenuDivider, MenuGroup, MenuItem } from "@/components/ui/Menu";
import { chipClasses, cx } from "@/components/ui/classes";
import type { LibraryGroup } from "@/lib/library";

const GROUPS: { value: LibraryGroup; label: string; icon: "assets" | "book" | "concepts" | "compose" }[] = [
  { value: "day", label: "Day", icon: "assets" },
  { value: "course", label: "Course", icon: "book" },
  { value: "topic", label: "Topic", icon: "concepts" },
  { value: "conversation", label: "Conversation", icon: "compose" },
];

/**
 * The Library's view options (L4 of docs/proposals/library-by-type-and-day.md,
 * Manus's `view-options-button` and `view-options-menu`): a button with the
 * sliders glyph beside the grid and list switch, opening a small menu.
 *
 * "Group by" is Day (the default), Course, Topic or Conversation, and "Show" is All or
 * Favorites only, each a set of choices with a tick on the one in use. Both
 * are URL state (`?group=`, `?favorites=1`), so a link carries them; a pick
 * goes through the toolbar's `pick`, which pushes the URL and dims the
 * results until the new ones arrive. The Favorites chip the toolbar had
 * (#372) moved in here, as Manus keeps Favorites only in this menu.
 *
 * The button is a chip's 34px, the height of everything else in the
 * toolbar, and is filled like a chosen filter while either choice is not its
 * default, so a grouped or starred-only view says so before the menu opens.
 */
export function ViewOptions({
  group,
  favorites,
  busy,
  onGroup,
  onFavorites,
}: {
  group: LibraryGroup;
  favorites: boolean;
  /** A navigation for the last pick is under way. */
  busy: boolean;
  onGroup: (group: LibraryGroup) => void;
  onFavorites: (on: boolean) => void;
}) {
  const changed = group !== "day" || favorites;
  return (
    <Menu
      label="View options"
      trigger={<Glyph name="sliders" size={16} />}
      triggerClassName={chipClasses({ active: changed, className: cx("w-[34px] justify-center px-0", busy && "opacity-70") })}
      minWidth={200}
    >
      <MenuGroup label="Group by">
        {GROUPS.map((option) => (
          <MenuItem
            key={option.value}
            icon={option.icon}
            checked={group === option.value}
            onSelect={() => {
              if (option.value !== group) onGroup(option.value);
            }}
          >
            {option.label}
          </MenuItem>
        ))}
      </MenuGroup>
      <MenuDivider />
      <MenuGroup label="Show">
        <MenuItem icon="assets" checked={!favorites} onSelect={() => {
            if (favorites) onFavorites(false);
          }}>
          All
        </MenuItem>
        <MenuItem icon="star" checked={favorites} onSelect={() => {
            if (!favorites) onFavorites(true);
          }}>
          Favorites only
        </MenuItem>
      </MenuGroup>
    </Menu>
  );
}
