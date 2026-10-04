"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { SearchField } from "@/components/ui/SearchField";
import { cx, MENU_PANEL, menuRowClasses } from "@/components/ui/classes";
import { isImeKey } from "@/components/ui/composer-keys";
import { moveActive } from "@/components/ui/mention-text";
import { usePresence } from "@/components/ui/use-presence";
import { ASK_START_KEY, askTutorHref, MAX_ASK_QUERY, type AskEntry, type AskKind } from "@/lib/ask-core";

/** How long typing pauses before the box asks. */
const DEBOUNCE_MS = 150;

const GLYPH: Record<AskKind, GlyphName> = { concept: "concepts", course: "book", module: "topics", video: "video" };

/** One option in the list: a match, or the tutor for the text as typed. */
type Option = { key: string; href: string; entry: AskEntry | null };

/**
 * The Ask box (docs/proposals/home-page.md, part 1): "What do you want to
 * learn?". Typing lists the concepts, courses, modules and videos whose
 * titles match (`GET /api/learner/ask`), and the last option is always a
 * tutor chat on the text as typed, so the box never dead-ends. Enter opens
 * the highlighted option, the first match by default, and the tutor when
 * nothing matched.
 *
 * An ARIA combobox: the input owns a listbox, arrows move
 * `aria-activedescendant`, Escape closes the list and then clears the text.
 * The list is the kit's menu box and rows (`MENU_PANEL`, `menuRowClasses`),
 * popping in and, kept for its way out (`usePresence`), out again.
 * Matches are drawn only for the text they were asked for, so an Enter while
 * the next answer is on its way opens the tutor rather than the last text's
 * match. Choosing the tutor marks the subject as asked from here, which is
 * what lets `/ask` start the chat without another press (a link from
 * anywhere else waits for one: a turn is paid for with the owner's keys).
 */
export function AskBox() {
  const router = useRouter();
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ query: string; results: AskEntry[] }>({ query: "", results: [] });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const latest = useRef(0);

  const trimmed = query.trim();
  // The tutor is offered for any subject ("R" is a language); the title
  // search waits for two characters, since one would list half the catalog.
  // Memoised, so the rows kept for the list's way out (below) change only
  // when the rows do.
  const options = useMemo<Option[]>(
    () =>
      trimmed.length === 0
        ? []
        : [
            ...(found.query === trimmed ? found.results : []).map((entry) => ({ key: entry.key, href: entry.href, entry })),
            { key: "tutor", href: askTutorHref(trimmed), entry: null },
          ],
    [trimmed, found],
  );

  useEffect(() => {
    const mine = ++latest.current;
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/learner/ask?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((data: { results?: AskEntry[] }) => {
          if (mine !== latest.current) return;
          setFound({ query: trimmed, results: Array.isArray(data.results) ? data.results : [] });
          setActive(0);
        })
        .catch(() => {
          // An aborted or failed ask leaves the tutor option, which still works.
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  const go = (option: Option | undefined) => {
    if (option === undefined) return;
    setOpen(false);
    if (option.entry === null) {
      try {
        window.sessionStorage.setItem(ASK_START_KEY, trimmed);
      } catch {
        // Without storage the chat waits for a press, which still works.
      }
    }
    router.push(option.href);
  };

  const showList = open && options.length > 0;
  const activeOption = showList ? options[Math.min(active, options.length - 1)] : undefined;
  const activeId = activeOption ? `${id}-${activeOption.key}` : undefined;
  // The rows last shown, kept while the list leaves, so a list closed by
  // clearing the box does not empty before it fades.
  const [kept, setKept] = useState<{ options: Option[]; active: Option | undefined; asked: string }>({
    options,
    active: activeOption,
    asked: trimmed,
  });
  if (showList && (kept.options !== options || kept.active !== activeOption || kept.asked !== trimmed)) {
    setKept({ options, active: activeOption, asked: trimmed });
  }
  const presence = usePresence(showList, 120);
  const shown = showList ? { options, active: activeOption, asked: trimmed } : kept;

  // The highlighted option stays in view as the arrows move it or new
  // matches reset it, so Enter never opens one the list has scrolled past.
  useEffect(() => {
    if (activeId !== undefined) document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [activeId]);

  return (
    <div className="relative">
      <SearchField
        label="What do you want to learn?"
        placeholder="What do you want to learn?"
        name="ask"
        autoComplete="off"
        maxLength={MAX_ASK_QUERY}
        role="combobox"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        value={query}
        size="lg"
        onClear={() => setQuery("")}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            if (options.length === 0) return;
            e.preventDefault();
            setOpen(true);
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((i) => moveActive(options, Math.min(i, options.length - 1), step));
          } else if (e.key === "Enter") {
            // The Enter that confirms an input method's candidate is not a choice.
            if (isImeKey(e.nativeEvent) || options.length === 0) return;
            e.preventDefault();
            go(activeOption ?? options[0]);
          } else if (e.key === "Escape") {
            // A search field clears itself on Escape; this one closes the
            // list first, and clears only on the second press.
            e.preventDefault();
            if (showList) setOpen(false);
            else setQuery("");
          }
        }}
      />
      {presence.mounted && (
        <ul
          id={presence.leaving ? undefined : listId}
          role="listbox"
          aria-label="Matches"
          inert={presence.leaving}
          className={cx(
            "absolute inset-x-0 top-full z-40 mt-2 origin-top",
            MENU_PANEL,
            presence.leaving ? "pointer-events-none animate-pop-out" : "animate-pop-in",
            "motion-reduce:animate-none",
          )}
        >
          {shown.options.map((option, i) => {
            const on = option === shown.active;
            return (
              <li
                key={option.key}
                id={`${id}-${option.key}`}
                role="option"
                aria-selected={on}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(option)}
                className={menuRowClasses({
                  active: on,
                  className: cx(option.entry === null && shown.options.length > 1 && "mt-1 border-t border-hair"),
                })}
              >
                {option.entry === null ? (
                  <>
                    <Glyph name="concepts" className="text-accent-text" />
                    <span className="min-w-0 flex-1 truncate">Ask the tutor about &ldquo;{shown.asked}&rdquo;</span>
                  </>
                ) : (
                  <>
                    <Glyph name={GLYPH[option.entry.kind]} className="text-text2" />
                    <span className="min-w-0 flex-1 truncate">{option.entry.title}</span>
                    {option.entry.detail !== null && (
                      <span className="shrink-0 text-[12px] font-normal text-text3">{option.entry.detail}</span>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
