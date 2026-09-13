"use client";

import { useState, type FormEvent } from "react";
import type { Resource } from "@/lib/types";
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
      className="font-medium text-[var(--accent-strong)] hover:underline"
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
    <section className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Curated resources
        </h3>
        {curated.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            No curated resources yet.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {curated.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-baseline gap-2 text-sm"
              >
                <span className="rounded bg-[var(--chip-bg)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted-strong)]">
                  {typeLabel[r.type] ?? r.type}
                </span>
                <ExternalLink href={r.url}>{r.title}</ExternalLink>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Your resources
        </h3>
        {user.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">
            Add papers, notes, or videos you find useful.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {user.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <ExternalLink href={r.url}>{r.title}</ExternalLink>
                <button
                  type="button"
                  onClick={() => removeResource(moduleId, r.id)}
                  className="text-xs text-[var(--muted)] hover:text-red-600"
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
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2"
          />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none ring-[var(--accent)] focus:ring-2"
          />
          <div className="sm:col-span-2 flex items-center gap-3">
            <button
              type="submit"
              className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Add resource
            </button>
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
