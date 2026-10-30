"use client";

import { useState, type RefObject } from "react";

import { isUsable, type MentionOption } from "@/lib/mentions";

import { cx, MENU_PANEL, menuRowClasses } from "./classes";
import { Glyph, type GlyphName } from "./Glyph";
import { Popover } from "./Popover";

/** What the menu shows: its rows and the highlighted one. */
export interface MentionMenuRows<K extends string> {
  options: MentionOption<K>[];
  active: number;
}

/**
 * `MentionComposer`'s @ menu: the listbox of what can be made, in the kit
 * `Popover`, so a panel's frame or a dialog's `overflow-hidden` does not clip
 * it, Escape closes it and nothing around it, and `popoverOpen()` knows it is
 * up. Focus stays in the field the whole time, which points at the
 * highlighted row with `aria-activedescendant` (ARIA's combobox), so the
 * rows' presses keep it there and the box takes none.
 *
 * It opens on `placement`'s side of `anchorRef` (over the row layout, under
 * the box), and shows the rows last drawn while it leaves.
 */
export function MentionMenu<K extends string>({
  anchorRef,
  menu,
  listId,
  optionId,
  tagged,
  hint,
  placement,
  onClose,
  onHover,
  onPick,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  /** The menu while it is open; null closes it. */
  menu: MentionMenuRows<K> | null;
  listId: string;
  optionId: (option: MentionOption<K>) => string;
  /** The kinds the field already holds a chip for, ticked. */
  tagged: ReadonlySet<string>;
  /** The foot line: "Tag one or both" in the studio. */
  hint?: string;
  placement: "top-start" | "bottom-start";
  onClose: () => void;
  onHover: (at: number) => void;
  onPick: (option: MentionOption<K>) => void;
}) {
  const open = menu !== null;
  // The rows last shown, kept while the box leaves, so it fades out with
  // them rather than emptying first.
  const [kept, setKept] = useState(menu);
  if (open && kept !== menu) setKept(menu);
  const drawn = menu ?? kept;

  return (
    <Popover
      anchorRef={anchorRef}
      open={open}
      onOpenChange={onClose}
      placement={placement}
      // The field keeps focus, and a phone keeps its keyboard up.
      onMouseDown={(event) => event.preventDefault()}
      className={cx(MENU_PANEL, "w-[min(22.5rem,calc(100vw-2rem))]")}
    >
      {drawn !== null && (
        <ul id={open ? listId : undefined} role="listbox" aria-label="What to make" className="flex flex-col gap-0.5">
          {drawn.options.length === 0 ? (
            <li className="px-3 py-2.5 text-[13px] text-text2">Nothing matches</li>
          ) : (
            drawn.options.map((option, at) => {
              const usable = isUsable(option);
              const active = at === drawn.active;
              return (
                <li
                  key={option.id}
                  id={optionId(option)}
                  role="option"
                  aria-selected={active}
                  aria-disabled={!usable || undefined}
                  onMouseEnter={() => {
                    if (usable && open) onHover(at);
                  }}
                  onClick={() => onPick(option)}
                  className={menuRowClasses({ active, disabled: !usable, className: "pointer-coarse:min-h-12" })}
                >
                  {option.icon && (
                    <Glyph name={option.icon as GlyphName} className={cx(!usable ? "text-text3" : active ? "text-accent-text" : "text-text2")} />
                  )}
                  {/* The name over its description, always: side by side, a
                      longer description wrapped under its name at one width
                      and sat beside it at another, so two rows of one menu
                      were laid out two ways. */}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={cx("leading-5", !usable && "text-text3")}>{option.name}</span>
                    <span className="min-w-0 text-[13px] leading-5 font-normal text-text2">{usable ? option.description : option.disabledReason}</span>
                  </span>
                  {tagged.has(option.id) && (
                    <>
                      <Glyph name="tick" size={16} className="text-accent-text" />
                      <span className="sr-only">, already tagged</span>
                    </>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}
      {hint !== undefined && <p className="px-2 pt-1 pb-0.5 text-[12px] leading-4 text-text3">{hint}</p>}
    </Popover>
  );
}
