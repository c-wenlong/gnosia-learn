import type { Family } from "@/components/asset-meta";
import type { ModuleMark, ModuleMetaPart, TopicMark } from "@/lib/course-path";
import { MASTERY_BUCKET_LABEL } from "@/lib/mastery-bucket";
import type { ResourceType } from "@/lib/types";

import { cx } from "@/components/ui/classes";
import { MasteryDot } from "@/components/ui/MasteryDot";

/**
 * The course page's glyphs: 20px outline paths in the current text colour,
 * drawn the way `NavIcon` draws the tab bar's, and the status marks a module
 * row and a topic row carry. No state and no hooks, so a server component
 * could render them too.
 */
const PATHS = {
  // A bulleted list: the module's topics.
  topics: "M8 5.5h8.5M8 10h8.5M8 14.5h8.5M4 5.5h.01M4 10h.01M4 14.5h.01",
  // A light bulb, as the Learn tab draws it.
  concepts: "M7.5 14.5h5M8 17h4M10 3a5 5 0 0 0-3 9c.6.5 1 1.2 1 2h4c0-.8.4-1.5 1-2a5 5 0 0 0-3-9z",
  // Four tiles, as the Library tab draws them.
  assets: "M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM11 11h5v5h-5z",
  // A tick in a circle.
  done: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM7 10.2l2 2 4-4.4",
  // A screen with a play mark.
  video: "M3.5 5h13v10h-13zM8.5 7.8v4.4l3.6-2.2z",
  // Three joined nodes.
  diagram: "M5 6.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM15 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM5 16.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM6.3 5.8l7.4 3.4M6.3 14.2l7.4-3.4",
  // A page with lines.
  text: "M5.5 3h6l3 3v11h-9zM11.5 3v3h3M8 10h4.5M8 13h4.5",
  // Two chain links.
  link: "M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.8.8M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.8-.8",
  // An open book, as the Courses tab draws it.
  book: "M10 6.5C8.5 5 6 4.5 3 4.8v10.4c3-.3 5.5.2 7 1.8 1.5-1.6 4-2.1 7-1.8V4.8c-3-.3-5.5.2-7 1.7zm0 0V17",
  // A plus.
  add: "M10 4.5v11M4.5 10h11",
  // A padlock.
  lock: "M6 9V7a4 4 0 0 1 8 0v2M5 9h10v8H5z",
  // Arrows for the previous and next module.
  previous: "M12 5l-5 5 5 5",
  next: "M8 5l5 5-5 5",
} as const;

export type GlyphName = keyof typeof PATHS;

export function Glyph({ name, size = 20, className }: { name: GlyphName; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      width={size}
      height={size}
      className={cx("shrink-0", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export const META_GLYPH: Record<ModuleMetaPart["icon"], GlyphName> = {
  topics: "topics",
  concepts: "concepts",
  assets: "assets",
  done: "done",
};

export const FAMILY_GLYPH: Record<Family, GlyphName> = {
  video: "video",
  diagram: "diagram",
  text: "text",
  link: "link",
};

export const RESOURCE_GLYPH: Record<ResourceType, GlyphName> = {
  paper: "text",
  docs: "text",
  video: "video",
  book: "book",
  other: "link",
};

/** A filled mastered disc with a tick: a topic that is done, a module whose topics all are. */
function DoneDisc({ size }: { size: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-m-hi" style={{ width: size, height: size }}>
      <svg aria-hidden viewBox="0 0 20 20" width={size - 6} height={size - 6} fill="none">
        <path d="M5 10.5l3.2 3.2L15 6.8" stroke="var(--m-hi-on)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/** An empty ring in the hint grey: not started. */
function Ring({ size }: { size: number }) {
  return (
    <span
      className="block shrink-0 rounded-full border-[1.5px] border-text3"
      style={{ width: size, height: size }}
    />
  );
}

const TOPIC_MARK_LABEL: Record<TopicMark, string> = {
  done: "Done",
  learning: MASTERY_BUCKET_LABEL.learning,
  untouched: MASTERY_BUCKET_LABEL.untouched,
};

/** A topic row's 20px status: done, learning (the kit's learning dot) or not started. */
export function TopicMarkIcon({ mark }: { mark: TopicMark }) {
  return (
    <span role="img" aria-label={TOPIC_MARK_LABEL[mark]} className="flex h-5 w-5 shrink-0 items-center justify-center">
      {mark === "done" ? <DoneDisc size={20} /> : mark === "learning" ? <MasteryDot bucket="learning" size={18} /> : <Ring size={18} />}
    </span>
  );
}

const MODULE_MARK_LABEL: Record<ModuleMark, string> = {
  done: "Done",
  progress: "In progress",
  todo: "Not started",
  locked: "Locked",
};

/**
 * A module row's 20px status: a tick when every topic is done, a ring with an
 * arc for the share done, an empty ring, or a padlock while the module before
 * it has nothing done.
 */
export function ModuleMarkIcon({ mark, fraction }: { mark: ModuleMark; fraction: number }) {
  let body;
  if (mark === "done") body = <DoneDisc size={18} />;
  else if (mark === "locked") body = <Glyph name="lock" size={16} className="text-text3" />;
  else if (mark === "todo") body = <Ring size={16} />;
  else {
    const r = 7;
    const length = 2 * Math.PI * r;
    const share = Math.max(0.08, Math.min(1, fraction));
    body = (
      <svg aria-hidden viewBox="0 0 20 20" width={18} height={18} className="-rotate-90">
        <circle cx="10" cy="10" r={r} fill="none" stroke="var(--text3)" strokeWidth="1.5" />
        <circle
          cx="10"
          cy="10"
          r={r}
          fill="none"
          stroke="var(--m-hi)"
          strokeWidth="3"
          strokeDasharray={`${share * length} ${length}`}
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <span role="img" aria-label={MODULE_MARK_LABEL[mark]} className="flex h-5 w-5 shrink-0 items-center justify-center">
      {body}
    </span>
  );
}
