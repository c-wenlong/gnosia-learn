"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { askToNotify, useStudioJobs } from "@/components/studio/JobsProvider";
import { Button, Chip, Mono, PanelHeading } from "@/components/studio/StudioChrome";
import type { TopicOption } from "@/data/topics";
import {
  candidatePathFor,
  draftErrors,
  draftFromBrief,
  draftToBrief,
  emptyDraft,
  refusalReport,
  slugFromTitle,
  type BriefDraft,
  type RefusalReport,
} from "@/lib/studio-jobs";
import { panelHref } from "@/lib/studio-view";

/**
 * The brief, as a form in the right panel. Never a modal.
 *
 * The thing the brief is about — the grid, or the diagram on the canvas — stays
 * visible behind it, which is the whole reason the design refuses a dialog here.
 *
 * **One path out of this form, and it is structured JSON.** The fields are
 * posted as a `Brief` object to `POST /studio/api/jobs`, which the runner
 * validates and then assembles into a prompt where every one of them sits
 * inside a block labelled as data (A5). Nothing here builds a sentence, and the
 * mermaid box is the sharpest case: it travels as a field, the runner writes it
 * to the job scratch directory, and `from-mermaid --source` — a parser, not a
 * model — is what reads it. A second path that pasted any of this into text
 * would undo the only structural defence the design has.
 *
 * Required is exactly the brief table's required column, checked here so the
 * form asks rather than guesses, and checked again at the boundary because this
 * check is a courtesy and that one is the rule.
 */

export function BriefForm({
  path,
  topics,
  /** A job id to prefill from — Edit brief on a failed job — or "" for blank. */
  from,
  /** The diagram this form was opened beside, used as the default slug. */
  suggested,
}: {
  path: string;
  topics: TopicOption[];
  from: string;
  suggested?: { slug: string; title: string | null; topic: string | null } | undefined;
}) {
  const router = useRouter();
  const { post } = useStudioJobs();
  const [draft, setDraft] = useState<BriefDraft>(() => {
    const base = emptyDraft();
    if (suggested === undefined) return base;
    // Opened from a diagram's own screen: extending that diagram is the likely
    // intent, and the slug is not a thing to make somebody retype.
    return {
      ...base,
      slug: suggested.slug,
      title: suggested.title ?? "",
      topic: suggested.topic ?? "",
      mode: "extend",
    };
  });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<{ report: RefusalReport; field: string | null } | null>(
    null,
  );

  // Edit brief: the failed job's own brief, fetched once. A prefill and not a
  // copy — what this posts is a new job, because a job is never edited.
  useEffect(() => {
    if (from === "") return;
    let alive = true;
    void (async () => {
      try {
        const response = await fetch(`/studio/api/jobs/${encodeURIComponent(from)}`, { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { brief?: Parameters<typeof draftFromBrief>[0] };
        if (alive && body.brief !== undefined) setDraft(draftFromBrief(body.brief));
      } catch {
        // A prefill that did not arrive leaves an empty form, which is still a
        // form. Saying so would be a banner about a convenience.
      }
    })();
    return () => {
      alive = false;
    };
  }, [from]);

  const errors = useMemo(() => draftErrors(draft), [draft]);
  const known = useMemo(() => new Map(topics.map((topic) => [topic.slug, topic])), [topics]);
  const topicUnknown = draft.topic.trim() !== "" && !known.has(draft.topic.trim());
  const concepts = known.get(draft.topic.trim())?.concepts ?? [];
  const labels = draft.elements.map((element) => element.label.trim()).filter((label) => label !== "");
  const blocked = Object.keys(errors).length > 0 || topicUnknown;

  const set = (patch: Partial<BriefDraft>): void => setDraft((held) => ({ ...held, ...patch }));

  const submit = async (): Promise<void> => {
    setTouched(true);
    if (blocked) return;
    setBusy(true);
    setRefused(null);
    // The permission prompt rides on this click, because a browser will not
    // show one without a gesture behind it and a person will refuse one that
    // appears out of nowhere ten minutes later.
    await askToNotify();
    const brief = draftToBrief(draft, `studio-ui:${draft.topic}:${draft.slug}:${Date.now()}`);
    const result = await post("/studio/api/jobs", brief);
    setBusy(false);
    if (!result.ok) {
      const detail = result.data.detail as { field?: unknown } | null;
      // Coded rather than pasted through, so the one refusal that must not
      // offer a retry — the daily cap — is a case the screen knows about
      // instead of a sentence it happens to be printing.
      setRefused({
        report: refusalReport(result.status, result.data),
        field: typeof detail?.field === "string" ? detail.field : null,
      });
      return;
    }
    const jobId = typeof result.data.jobId === "string" ? result.data.jobId : null;
    router.push(jobId === null ? path : panelHref(path, { job: jobId, brief: null }), { scroll: false });
    router.refresh();
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-[var(--surface-raised)] p-3">
      <div className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <PanelHeading>New diagram</PanelHeading>
          <p className="text-xs text-[var(--muted)]">
            An agent draws it into the candidates directory. Nothing in the catalog changes
            until somebody accepts it.
          </p>
        </div>
        <Link
          href={panelHref(path, { brief: null })}
          scroll={false}
          className="shrink-0 text-xs text-[var(--muted)] underline underline-offset-2"
        >
          Close
        </Link>
      </div>

      <Field label="Intent" required error={touched ? errors.intent : undefined}>
        <textarea
          value={draft.intent}
          onChange={(event) => set({ intent: event.target.value })}
          rows={Math.min(12, Math.max(6, draft.intent.split("\n").length + 1))}
          placeholder="One or two sentences on what this diagram has to make clear."
          className={input}
        />
      </Field>

      <Field
        label="Topic"
        required
        error={touched ? errors.topic : undefined}
        hint="It has to exist in content/topics.yaml: the indexer refuses a diagram with no topic by name."
      >
        <input
          list="studio-topic-list"
          value={draft.topic}
          onChange={(event) => set({ topic: event.target.value, concepts: [] })}
          placeholder="vector-and-linear-algebra-basics"
          className={input}
        />
        <datalist id="studio-topic-list">
          {topics.map((topic) => (
            <option key={topic.slug} value={topic.slug} label={`${topic.title} · ${topic.domain}`} />
          ))}
        </datalist>
        {topicUnknown && (
          <p className="mt-1 text-xs text-[var(--danger)]">
            No topic <Mono>{draft.topic}</Mono> in content/topics.yaml. Add it there first if this is
            a new subject.
          </p>
        )}
      </Field>

      <Field label="Title" required error={touched ? errors.title : undefined}>
        <input
          value={draft.title}
          onChange={(event) => {
            const title = event.target.value;
            // The slug follows the title until somebody types a slug of their
            // own, which is the moment it stops following.
            const following = draft.slug === "" || draft.slug === slugFromTitle(draft.title);
            set(following ? { title, slug: slugFromTitle(title) } : { title });
          }}
          placeholder="How a dot product projects"
          className={input}
        />
      </Field>

      <Field label="Slug" required error={touched ? errors.slug : undefined}>
        <input
          value={draft.slug}
          onChange={(event) => set({ slug: event.target.value })}
          placeholder="dot-product-projection"
          className={`${input} font-mono`}
        />
      </Field>

      <Field label="Mode" required hint="new refuses an existing target; extend refuses a missing one. The agent never decides this.">
        <div className="flex gap-3 text-xs">
          {(["new", "extend"] as const).map((mode) => (
            <label key={mode} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="studio-mode"
                checked={draft.mode === mode}
                onChange={() => set({ mode })}
              />
              {mode}
            </label>
          ))}
        </div>
      </Field>

      <Field
        label="Elements"
        required
        error={touched ? errors.elements : undefined}
        hint="The things that must appear. Each becomes a shape whose label has to contain these words, and the gate checks it."
      >
        <div className="space-y-1.5">
          {draft.elements.map((element, at) => (
            <div key={at} className="flex gap-1.5">
              <input
                value={element.label}
                onChange={(event) => {
                  const next = [...draft.elements];
                  next[at] = { ...element, label: event.target.value };
                  set({ elements: next });
                }}
                placeholder="label"
                className={`${input} flex-1`}
              />
              <input
                value={element.note}
                onChange={(event) => {
                  const next = [...draft.elements];
                  next[at] = { ...element, note: event.target.value };
                  set({ elements: next });
                }}
                placeholder="note (optional)"
                className={`${input} flex-1`}
              />
              <button
                type="button"
                aria-label={`Remove element ${at + 1}`}
                onClick={() => set({ elements: draft.elements.filter((_, i) => i !== at) })}
                className="shrink-0 px-1 text-xs text-[var(--muted)] hover:text-[var(--danger)]"
              >
                ✕
              </button>
            </div>
          ))}
          <Button type="button" onClick={() => set({ elements: [...draft.elements, { label: "", note: "" }] })}>
            Add element
          </Button>
        </div>
      </Field>

      <Field
        label="Relations"
        hint="Each becomes a bound arrow through helpers.connect. May be empty, which says the diagram has no arrows."
      >
        <div className="space-y-1.5">
          {draft.relations.map((relation, at) => (
            <div key={at} className="space-y-1">
              <div className="flex gap-1.5">
                <LabelSelect
                  value={relation.from}
                  labels={labels}
                  onChange={(value) => {
                    const next = [...draft.relations];
                    next[at] = { ...relation, from: value };
                    set({ relations: next });
                  }}
                />
                <LabelSelect
                  value={relation.to}
                  labels={labels}
                  onChange={(value) => {
                    const next = [...draft.relations];
                    next[at] = { ...relation, to: value };
                    set({ relations: next });
                  }}
                />
                <button
                  type="button"
                  aria-label={`Remove relation ${at + 1}`}
                  onClick={() => set({ relations: draft.relations.filter((_, i) => i !== at) })}
                  className="shrink-0 px-1 text-xs text-[var(--muted)] hover:text-[var(--danger)]"
                >
                  ✕
                </button>
              </div>
              <input
                value={relation.label}
                onChange={(event) => {
                  const next = [...draft.relations];
                  next[at] = { ...relation, label: event.target.value };
                  set({ relations: next });
                }}
                placeholder="arrow label (optional)"
                className={input}
              />
              {touched && errors[`relations.${at}`] !== undefined && (
                <p className="text-xs text-[var(--danger)]">{errors[`relations.${at}`]}</p>
              )}
            </div>
          ))}
          <Button
            type="button"
            disabled={labels.length < 2}
            onClick={() => set({ relations: [...draft.relations, { from: labels[0] ?? "", to: labels[1] ?? "", label: "" }] })}
          >
            Add relation
          </Button>
          {labels.length < 2 && (
            <p className="text-xs text-[var(--muted)]">Name two elements first: an arrow joins two of them.</p>
          )}
        </div>
      </Field>

      <Field label="Concepts" hint="Stamped into the document's metadata, and only the ones filed under this topic.">
        {draft.topic.trim() === "" ? (
          <p className="text-xs text-[var(--muted)]">Pick a topic first.</p>
        ) : concepts.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">
            No concepts are filed under this topic in content/topics.yaml.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {concepts.map((slug) => {
              const on = draft.concepts.includes(slug);
              return (
                <button
                  key={slug}
                  type="button"
                  onClick={() =>
                    set({
                      concepts: on
                        ? draft.concepts.filter((held) => held !== slug)
                        : [...draft.concepts, slug],
                    })
                  }
                  className="max-w-full"
                >
                  <Chip tone={on ? "accent" : "muted"}>{slug}</Chip>
                </button>
              );
            })}
          </div>
        )}
      </Field>

      <details className="mt-3 border-t border-[var(--border)] pt-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Everything else
        </summary>

        <Field label="Layout" hint="A hint, not an instruction.">
          <select value={draft.layout} onChange={(event) => set({ layout: event.target.value })} className={input}>
            <option value="">let the agent decide</option>
            {["flow-lr", "layered", "comparison", "radial"].map((layout) => (
              <option key={layout} value={layout}>
                {layout}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Model" hint="Drawing loops are mechanical, so sonnet is the default. opus costs more per job.">
          <select
            value={draft.model}
            onChange={(event) => set({ model: event.target.value === "opus" ? "opus" : "sonnet" })}
            className={input}
          >
            <option value="sonnet">sonnet</option>
            <option value="opus">opus</option>
          </select>
        </Field>

        <Field
          label="Mermaid"
          hint="Written to the job's scratch directory and lifted with from-mermaid --source. The text never enters the prompt."
        >
          <textarea
            value={draft.mermaid}
            onChange={(event) => set({ mermaid: event.target.value })}
            rows={4}
            placeholder="flowchart LR&#10;  a --> b"
            className={`${input} font-mono`}
          />
        </Field>

        <Field label="Source note" hint="The concept note or session this came out of.">
          <input
            value={draft.source}
            onChange={(event) => set({ source: event.target.value })}
            placeholder="learn/concepts/maths/dot-product.md"
            className={`${input} font-mono`}
          />
        </Field>

        <Field label="Notes" hint="Anything else the agent should know. It reaches the prompt as data.">
          <textarea
            value={draft.notes}
            onChange={(event) => set({ notes: event.target.value })}
            rows={3}
            className={input}
          />
        </Field>
      </details>

      {refused !== null && (
        <div
          role="alert"
          data-refusal={refused.report.code}
          className="mt-3 rounded-md border border-[var(--danger-border)] bg-[var(--danger-bg)] p-2 text-xs text-[var(--danger)]"
        >
          <p className="font-medium">
            {refused.field !== null && <span className="font-mono">{refused.field}: </span>}
            {refused.report.headline}
          </p>
          {refused.report.detail !== null && (
            <p className="mt-1 text-[var(--muted-strong)]">{refused.report.detail}</p>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 border-t border-[var(--border)] pt-3">
        <Button type="button" filled disabled={busy} onClick={() => void submit()}>
          {busy ? "Starting…" : "Start"}
        </Button>
        <p className="min-w-0 flex-1 text-xs break-all text-[var(--muted)]">
          writes <Mono>{candidatePathFor(draft.slug.trim())}</Mono>
        </p>
      </div>
      {touched && blocked && (
        <p className="mt-2 text-xs text-[var(--danger)]">
          Fill the required fields first: a job cannot start on a brief that has to be guessed at.
        </p>
      )}
    </div>
  );
}

const input =
  "w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent)]";

function Field({
  label,
  required = false,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <label className="mt-3 block">
      <span className="mb-1 flex items-center gap-1 text-xs font-medium">
        {label}
        {required && <span className="text-[var(--muted)]">required</span>}
      </span>
      {children}
      {hint !== undefined && <span className="mt-1 block text-xs text-[var(--muted)]">{hint}</span>}
      {error !== undefined && <span className="mt-1 block text-xs text-[var(--danger)]">{error}</span>}
    </label>
  );
}

/** Both ends of an arrow are elements, so both ends are chosen and not typed. */
function LabelSelect({
  value,
  labels,
  onChange,
}: {
  value: string;
  labels: string[];
  onChange: (value: string) => void;
}) {
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} className={`${input} flex-1`}>
      <option value="">—</option>
      {labels.map((label) => (
        <option key={label} value={label}>
          {label}
        </option>
      ))}
    </select>
  );
}
