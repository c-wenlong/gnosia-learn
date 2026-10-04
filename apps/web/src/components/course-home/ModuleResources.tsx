"use client";

import Link from "next/link";
import { useId, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { cx, inputClasses } from "@/components/ui/classes";
import { Collapse } from "@/components/ui/Collapse";
import { useLearner } from "@/lib/learner-context";
import type { Resource } from "@/lib/types";

import { Glyph, RESOURCE_GLYPH } from "./icons";
import { resourceLink } from "./resource-link";
import { FOCUS_RING, ROW, ROW_HOVER, ROW_LIST, ROW_META, ROW_TITLE, STRETCHED } from "./rows";

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
 * A module's reading list as item rows: the curated resources from the course
 * file, then the learner's own (each with Remove), then a row that opens the
 * form to add one. An outside resource opens in a new tab and a link into this
 * app in the same one; the meta line says what kind it is and where it lives
 * (a host, "Library" or "This site"), the way Coursera's says "Reading".
 */
export function ModuleResources({ moduleId, curated }: { moduleId: string; curated: Resource[] }) {
  const { state, addResource, removeResource } = useLearner();
  const yours = state.userResources[moduleId] ?? [];
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const formId = useId();

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
      {curated.map((r) => {
        const link = resourceLink(r.url);
        return (
          <li key={r.id}>
            <ResourceAnchor href={r.url} internal={link.internal} className={cx(ROW, ROW_HOVER, FOCUS_RING)}>
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
      })}
      {yours.map((r) => {
        const link = resourceLink(r.url);
        return (
          <li key={r.id}>
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
                onClick={() => removeResource(moduleId, r.id)}
                className={cx("relative z-10 rounded-sm px-1 text-[13px] text-text2 hover:text-danger", FOCUS_RING)}
              >
                Remove
              </button>
            </div>
          </li>
        );
      })}
      <li>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          aria-expanded={adding}
          aria-controls={formId}
          className={cx(ROW, ROW_HOVER, FOCUS_RING, "w-full min-h-[44px] cursor-pointer text-left")}
        >
          <Glyph name="add" className="text-text2" />
          <span className="pl-1 text-[14px] font-semibold text-text">Add a resource</span>
        </button>
        <Collapse open={adding} id={formId}>
          <form onSubmit={onSubmit} className="ml-[40px] mr-2 mt-1 mb-2 grid gap-2 sm:grid-cols-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              aria-label="Title"
              className={inputClasses()}
            />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              aria-label="URL"
              className={inputClasses()}
            />
            <div className="flex items-center gap-3 sm:col-span-2">
              <Button type="submit" variant="secondary" size="sm">
                Add
              </Button>
              {error && <p className="text-[12px] text-danger">{error}</p>}
            </div>
          </form>
        </Collapse>
      </li>
    </ul>
  );
}
