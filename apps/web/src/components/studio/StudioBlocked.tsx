import { ButtonLink, Mono } from "@/components/studio/StudioChrome";

/**
 * The screens that replace the content region rather than sitting on top of it.
 *
 * U4's rule is the one worth stating: a grid that half works is worse than a
 * page that says what is wrong. So a `doctor` failure, or a runner nothing is
 * listening to, takes the whole region — no cards, no strip controls that
 * cannot do anything, no thumbnails that will 404 one at a time.
 *
 * What is *not* here: a stale page bundle and an unreachable Postgres. Both
 * mean everything still works (U5 and U3), so both are banners, and a banner is
 * `Notice` in `StudioChrome`.
 */

export interface DoctorLine {
  name: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export function BlockedCard({
  title,
  lead,
  commands = [],
  lines = [],
  retryHref,
}: {
  title: string;
  lead: string;
  commands?: string[];
  lines?: DoctorLine[];
  retryHref?: string;
}) {
  const failing = lines.filter((line) => line.status !== "pass");
  return (
    <div className="flex min-h-0 flex-1 items-start justify-center p-8">
      <div className="w-full max-w-[520px] rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h1 className="text-sm font-medium">{title}</h1>
        <p className="mt-2 text-sm text-[var(--muted-strong)]">{lead}</p>

        {failing.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {failing.map((line) => (
              <li key={line.name} className="flex gap-2 text-xs">
                <span
                  className={`w-10 shrink-0 font-medium ${
                    line.status === "fail" ? "text-[var(--danger)]" : "text-[var(--warn-text)]"
                  }`}
                >
                  {line.status === "fail" ? "fail" : "warn"}
                </span>
                <span className="w-24 shrink-0 text-[var(--muted-strong)]">{line.name}</span>
                <span className="min-w-0 flex-1 break-words text-[var(--muted)]">{line.detail}</span>
              </li>
            ))}
          </ul>
        )}

        {commands.length > 0 && (
          <div className="mt-4 rounded-md border border-[var(--border)] bg-[var(--chip-bg)] p-2.5">
            {commands.map((command) => (
              <p key={command} className="font-mono text-xs break-all text-[var(--muted-strong)]">
                {command}
              </p>
            ))}
          </div>
        )}

        {retryHref !== undefined && (
          <div className="mt-4">
            <ButtonLink href={retryHref}>Recheck</ButtonLink>
          </div>
        )}
      </div>
    </div>
  );
}

/** U1: the directory exists and has nothing in it. */
export function EmptyDirectory({ dir }: { dir: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-start justify-center p-8">
      <div className="w-[420px] max-w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 text-center">
        <p className="font-mono text-xs text-[var(--muted)]">
          <Mono>{dir}</Mono>
        </p>
        <p className="mt-2 text-sm font-medium">no .tldr files here yet</p>
        <p className="mt-3 text-xs text-[var(--muted)]">
          A diagram needs a topic from <Mono>content/topics.yaml</Mono> before the indexer will take
          it, so give it one when you make it.
        </p>
      </div>
    </div>
  );
}
