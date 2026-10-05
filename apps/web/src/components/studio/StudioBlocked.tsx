import { Mono } from "@/components/studio/StudioChrome";
import { Button } from "@/components/ui/Button";
import { cx } from "@/components/ui/classes";
import { Notice } from "@/components/ui/Notice";

/**
 * The screens that replace the content region rather than sitting on top of it.
 *
 * U4's rule is the one worth stating: a grid that half works is worse than a
 * page that says what is wrong. So a `doctor` failure, or a runner nothing is
 * listening to, takes the whole region — no cards, no strip controls that
 * cannot do anything, no thumbnails that will 404 one at a time.
 *
 * What is *not* here: a stale page bundle and an unreachable Postgres. Both
 * mean everything still works (U5 and U3), so both are banners, the kit's
 * `Banner`. Both cards here are the kit's `Notice` in its dense form.
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
      <Notice
        dense
        level={1}
        title={title}
        commands={commands}
        actions={
          retryHref === undefined ? undefined : (
            <Button href={retryHref} variant="secondary" size="xs" scroll={false}>
              Recheck
            </Button>
          )
        }
        className="w-full max-w-[520px]"
      >
        <p>{lead}</p>
        {failing.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {failing.map((line) => (
              <li key={line.name} className="flex gap-2 text-[12px]">
                <span className={cx("w-10 shrink-0 font-medium", line.status === "fail" ? "text-danger" : "text-warn-text")}>
                  {line.status === "fail" ? "fail" : "warn"}
                </span>
                <span className="w-24 shrink-0 text-text">{line.name}</span>
                <span className="min-w-0 flex-1 break-words">{line.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </Notice>
    </div>
  );
}

/** U1: the directory exists and has nothing in it. */
export function EmptyDirectory({ dir }: { dir: string }) {
  return (
    <div className="flex min-h-0 flex-1 items-start justify-center p-8">
      <Notice dense title="No diagrams yet" className="w-[420px] max-w-full">
        <p className="text-text3">
          <Mono>{dir}</Mono>
        </p>
        <p className="mt-2">
          Start a job to draw one. A diagram needs a topic from the vocabulary before the catalog will take it, so
          give it one when you make it.
        </p>
      </Notice>
    </div>
  );
}
