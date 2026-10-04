"use client";

import Link from "next/link";
import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { cx, FOCUS, STATUS_TEXT } from "@/components/ui/classes";
import { Collapse } from "@/components/ui/Collapse";
import { Input } from "@/components/ui/Input";
import { useLearner } from "@/lib/learner-context";
import { prefersReducedMotion } from "@/lib/motion";
import type { Resource } from "@/lib/types";

import { Glyph, RESOURCE_GLYPH } from "./icons";
import { resourceLink } from "./resource-link";
import { ROW, ROW_HOVER, ROW_LIST, ROW_META, ROW_TITLE, STRETCHED } from "./rows";

const TYPE_LABEL: Record<Resource["type"], string> = {
  paper: "Paper",
  docs: "Docs",
  video: "Video",
  book: "Book",
  other: "Link",
  practice: "Practice",
};

/**
 * An outside link opens a new tab. A link into this app goes through `Link`,
 * so the page stays alive: a full reload could cancel a learner-state write
 * still in flight and lose an optimistic edit.
 */
function ResourceAnchor({
  href,
  internal,
  className,
  children,
}: {
  href: string;
  internal: boolean;
  className: string;
  children: ReactNode;
}) {
  if (internal) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

/**
 * One curated reading as an item row: its type's icon, its title, and a meta
 * line saying what kind it is and where it lives. The module path draws a
 * lesson's readings and the practice with it too.
 */
export function ResourceRow({ resource: r }: { resource: Resource }) {
  const link = resourceLink(r.url);
  return (
    <li>
      <ResourceAnchor href={r.url} internal={link.internal} className={cx(ROW, ROW_HOVER, FOCUS)}>
        <Glyph name={RESOURCE_GLYPH[r.type] ?? "link"} className="text-text2" />
        <span className="min-w-0 flex-1 pl-1">
          <span className={cx(ROW_TITLE, "break-words")}>{r.title}</span>
          <span className={ROW_META}>
            {TYPE_LABEL[r.type] ?? "Link"} · {link.where}
          </span>
        </span>
      </ResourceAnchor>
    </li>
  );
}

/**
 * A module's reading list as item rows: the curated resources from the course
 * file, then the learner's own (each with Remove), then a row that opens the
 * form to add one. An outside resource opens in a new tab and a link into this
 * app in the same one; the meta line says what kind it is and where it lives
 * (a host, "Library" or "This site"), the way Coursera's says "Reading".
 *
 * A row the learner adds fades and rises in (`animate-enter`). One they
 * remove is removed at once, so nothing is lost to a navigation, and a copy
 * of it stays in its place for the 300ms it takes to fold away (`Collapse`),
 * with focus moved to Add a resource, since the Remove pressed goes with it.
 * The form's error fades in.
 */
export function ModuleResources({ moduleId, curated }: { moduleId: string; curated: readonly Resource[] }) {
  const { state, addResource, removeResource } = useLearner();
  const yours = state.userResources[moduleId] ?? [];
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const formId = useId();
  // Removed rows still folding away, each at the place it had in the list.
  const [ghosts, setGhosts] = useState<{ resource: (typeof yours)[number]; at: number }[]>([]);
  const addButton = useRef<HTMLButtonElement>(null);

  function remove(resource: (typeof yours)[number], at: number) {
    addButton.current?.focus();
    removeResource(moduleId, resource.id);
    if (prefersReducedMotion()) return;
    setGhosts((g) => [...g, { resource, at }]);
    window.setTimeout(() => setGhosts((g) => g.filter((x) => x.resource.id !== resource.id)), 300);
  }

  // The list as drawn: the learner's rows, with the ones folding away put back
  // where they were, under the same keys, so each folds rather than vanishes.
  const rows = yours.map((resource) => ({ resource, leaving: false }));
  for (const ghost of [...ghosts].sort((a, b) => a.at - b.at)) {
    if (rows.some((row) => row.resource.id === ghost.resource.id)) continue;
    rows.splice(Math.min(ghost.at, rows.length), 0, { resource: ghost.resource, leaving: true });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const t = title.trim();
    const u = url.trim();
    if (!t || !u) {
      setError("Title and URL are required.");
      return;
    }
    try {
      const parsed = new URL(u);
      if (!parsed.protocol.startsWith("http")) {
        setError("Enter a valid URL (including https://).");
        return;
      }
    } catch {
      setError("Enter a valid URL (including https://).");
      return;
    }
    addResource(moduleId, { title: t, url: u });
    setTitle("");
    setUrl("");
  }

  return (
    <ul className={ROW_LIST}>
      {curated.map((r) => (
        <ResourceRow key={r.id} resource={r} />
      ))}
      {rows.map(({ resource: r, leaving }, at) => {
        const link = resourceLink(r.url);
        return (
          <li key={r.id} className="animate-enter motion-reduce:animate-none">
            <Collapse open={!leaving}>
              <div className={cx(ROW, ROW_HOVER)}>
                <ResourceAnchor
                  href={r.url}
                  internal={link.internal}
                  className={cx("flex min-w-0 flex-1 items-center gap-2", STRETCHED)}
                >
                  <Glyph name="link" className="text-text2" />
                  <span className="min-w-0 flex-1 pl-1">
                    <span className={cx(ROW_TITLE, "break-words")}>{r.title}</span>
                    <span className={ROW_META}>Yours · {link.where}</span>
                  </span>
                </ResourceAnchor>
                <button
                  type="button"
                  onClick={() => remove(r, at)}
                  className={cx("relative z-10 rounded-sm px-1 text-[13px] text-text2 transition-colors duration-100 hover:text-danger motion-reduce:transition-none", FOCUS)}
                >
                  Remove
                </button>
              </div>
            </Collapse>
          </li>
        );
      })}
      <li>
        <button
          ref={addButton}
          type="button"
          onClick={() => setAdding((v) => !v)}
          aria-expanded={adding}
          aria-controls={formId}
          className={cx(ROW, ROW_HOVER, FOCUS, "w-full min-h-[44px] cursor-pointer text-left")}
        >
          <Glyph name="add" className="text-text2" />
          <span className="pl-1 text-[14px] font-semibold text-text">Add a resource</span>
        </button>
        <Collapse open={adding} id={formId}>
          {/* noValidate: a malformed URL gets this form's own line below, not
              the browser's bubble, which the platform draws in its own style. */}
          <form onSubmit={onSubmit} noValidate className="ml-[40px] mr-2 mt-1 mb-2 grid gap-2 sm:grid-cols-2">
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              aria-label="Title"
            />
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              aria-label="URL"
            />
            <div className="flex items-center gap-3 sm:col-span-2">
              <Button type="submit" variant="secondary" size="sm">
                Add
              </Button>
              {error && (
                <p key={error} className={cx(STATUS_TEXT, "animate-fade-in text-danger motion-reduce:animate-none")}>
                  {error}
                </p>
              )}
            </div>
          </form>
        </Collapse>
      </li>
    </ul>
  );
}
