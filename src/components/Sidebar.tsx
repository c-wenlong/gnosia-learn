"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { courses } from "@/data/courses";
import { courseProgress, formatProgress, moduleProgress } from "@/lib/progress";
import { useLearner } from "@/lib/learner-context";
import type { Course } from "@/lib/types";

function NavLink({
  href,
  active,
  children,
  indent = false,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
  indent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-md px-2.5 py-1.5 text-sm transition-colors ${
        indent ? "pl-4" : ""
      } ${
        active
          ? "bg-[var(--nav-active-bg)] font-medium text-[var(--accent-strong)]"
          : "text-[var(--muted-strong)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
      }`}
    >
      {children}
    </Link>
  );
}

function CourseNav({ course }: { course: Course }) {
  const pathname = usePathname();
  const { state } = useLearner();
  const base = `/courses/${course.slug}`;
  const onCourse = pathname === base || pathname.startsWith(`${base}/`);
  const progress = courseProgress(course, state.completed);

  return (
    <div className="mb-3">
      <NavLink href={base} active={pathname === base}>
        <span className="flex items-center justify-between gap-2">
          <span className="truncate">
            <span className="font-mono text-xs opacity-70">{course.code}</span>{" "}
            {course.title}
          </span>
          <span className="shrink-0 text-[10px] tabular-nums text-[var(--muted)]">
            {formatProgress(progress)}
          </span>
        </span>
      </NavLink>
      {onCourse && (
        <div className="mt-0.5 space-y-0.5 border-l border-[var(--border)] ml-2">
          {course.modules.map((m) => {
            const href = `${base}/${m.slug}`;
            const mp = moduleProgress(m, state.completed);
            return (
              <NavLink key={m.id} href={href} active={pathname === href} indent>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    M{m.order}. {m.title}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-[var(--muted)]">
                    {mp.completed}/{mp.total}
                  </span>
                </span>
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {open && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          aria-label="Close navigation"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-[var(--border)] bg-[var(--sidebar-bg)] transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="border-b border-[var(--border)] px-4 py-4">
          <Link
            href="/"
            className="block font-semibold tracking-tight text-[var(--foreground)]"
            onClick={onClose}
          >
            Self-Learn
          </Link>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            AY2026/27 course shortlist
          </p>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <div className="mb-4">
            <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Navigate
            </p>
            <NavLink href="/" active={pathname === "/"}>
              All courses
            </NavLink>
          </div>
          <p className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Courses
          </p>
          {courses.map((course) => (
            <div key={course.id} onClick={onClose}>
              <CourseNav course={course} />
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}
