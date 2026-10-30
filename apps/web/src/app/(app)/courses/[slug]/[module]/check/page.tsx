import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SessionFocus } from "@/components/session/SessionFocus";
import { getCourse, getModule } from "@/data/courses";
import { unlessUnreachable } from "@/data/source";
import { moduleHref } from "@/lib/course-path";
import { loadWeekCheck } from "@/lib/week-check-page";
import { TextLink } from "@/components/ui/TextLink";
import { PAGE_TITLE } from "@/components/ui/classes";

/**
 * A module's week check (phase 4 of docs/proposals/module-learning-path.md):
 * the module's concepts in path order, each asked until it is mastered,
 * answered wrong once, or asked three times, at most 24 questions, then the
 * concept session's close screen showing what moved. The last step of the
 * module's path links here.
 *
 * It is `SessionFocus` in its `module` mode: the plan (each concept's p(L)
 * and its note's checks, least recently asked first) is read here, once, and
 * the client decides each next question from the answer before it. Every
 * answer is a probe through `/api/learner/observe` naming this module, so
 * the check keeps no score of its own; mastery moves per concept.
 *
 * The segments are slugs, which the course reader holds to kebab-case, so
 * they are never escaped and an undecoded segment that does not match is
 * simply no course or module: a 404 either way.
 *
 * A catalog that does not answer refuses the course read before the check's
 * own, so that read is caught too: the page says it cannot start rather than
 * falling to the error boundary.
 */

type Props = { params: Promise<{ slug: string; module: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, module: moduleSlug } = await params;
  const course = await unlessUnreachable(getCourse(slug));
  const mod = course ? getModule(course, moduleSlug) : undefined;
  return { title: course && mod ? `${course.code} · Module check · ${mod.title}` : "Module check" };
}

export default async function WeekCheckPage({ params }: Props) {
  const { slug, module: moduleSlug } = await params;
  // null is an outage, undefined no such course.
  const course = await unlessUnreachable(getCourse(slug));
  if (course === null) return <Unreachable href={moduleHref(slug, moduleSlug)} />;
  if (!course) notFound();
  const mod = getModule(course, moduleSlug);
  if (!mod) notFound();
  const back = moduleHref(course.slug, mod.slug);

  const read = await loadWeekCheck(mod);
  if (read.state === "unreachable") return <Unreachable href={back} />;

  return (
    <div data-layout="focus">
      <SessionFocus
        key={mod.id}
        slug={mod.id}
        title={mod.title}
        mode="module"
        plan={[]}
        modelAvailable={read.plan.modelAvailable}
        nothingToAsk={read.reason !== null}
        teach={null}
        asset={null}
        assetCompact={null}
        next={null}
        weekCheck={{ moduleId: mod.id, plan: read.plan, moduleHref: back, reason: read.reason }}
      />
    </div>
  );
}

function Unreachable({ href }: { href: string }) {
  return (
    <div data-layout="focus">
      <div className="mx-auto flex max-w-[720px] flex-col items-center gap-4 px-4 pt-16 text-center">
        <h1 className={PAGE_TITLE}>The module check cannot start</h1>
        <p className="text-[14px] text-text2">
          The database could not be reached, so there is no mastery to start from and nowhere to record an answer.
          Nothing is lost. Run <code className="font-mono text-[13px]">npm run catalog -- status</code> to see why, then reload.
        </p>
        <TextLink href={href} size="md">
          Back to the module
        </TextLink>
      </div>
    </div>
  );
}
