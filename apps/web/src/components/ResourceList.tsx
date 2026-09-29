"use client";

import { useState, type FormEvent } from "react";
import type { Resource } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { inputClasses, LABEL } from "@/components/ui/classes";
import { useLearner } from "@/lib/learner-context";

const typeLabel: Record<string, string> = {
  paper: "Paper",
  docs: "Docs",
  video: "Video",
  book: "Book",
  other: "Link",
};

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-accent-text underline-offset-4 hover:underline"
    >
      {children}
    </a>
  );
}

export function ResourceList({
  moduleId,
  curated,
}: {
  moduleId: string;
  curated: Resource[];
}) {
  const { state, addResource, removeResource } = useLearner();
  const user = state.userResources[moduleId] ?? [];
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

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
    <section className="space-y-4 text-[14px]">
      <div>
        <h3 className={LABEL}>
          Curated resources
        </h3>
        {curated.length === 0 ? (
          <p className="mt-1.5 text-text2">
            No curated resources yet.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {curated.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-baseline gap-2"
              >
                <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-text2">
                  {typeLabel[r.type] ?? r.type}
                </span>
                <ExternalLink href={r.url}>{r.title}</ExternalLink>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className={LABEL}>
          Your resources
        </h3>
        {user.length === 0 ? (
          <p className="mt-1.5 text-text2">
            Add papers, notes, or videos you find useful.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {user.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-2"
              >
                <ExternalLink href={r.url}>{r.title}</ExternalLink>
                <button
                  type="button"
                  onClick={() => removeResource(moduleId, r.id)}
                  className="text-[12px] text-text3 hover:text-danger"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={onSubmit} className="mt-3 grid gap-2 sm:grid-cols-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className={inputClasses()}
          />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className={inputClasses()}
          />
          <div className="sm:col-span-2 flex items-center gap-3">
            <Button type="submit" variant="secondary" size="sm">
              Add resource
            </Button>
            {error && <p className="text-[12px] text-danger">{error}</p>}
          </div>
        </form>
      </div>
    </section>
  );
}
