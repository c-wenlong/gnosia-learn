import type { Family } from "@/components/asset-meta";
import type { ModuleMark, ModuleMetaPart, TopicMark } from "@/lib/course-path";
import { MASTERY_BUCKET_LABEL } from "@/lib/mastery-bucket";
import type { ResourceType } from "@/lib/types";

import { Glyph, type GlyphName } from "@/components/ui/Glyph";
import { MasteryDot } from "@/components/ui/MasteryDot";

/**
 * The course page's glyph choices and the status marks a module row and a
 * topic row carry. The glyphs themselves moved into the kit
 * (`components/ui/Glyph.tsx`) for the studio's @ menu; they are re-exported
 * here so the course page's imports did not have to move. No state and no
 * hooks, so a server component could render them too.
 */
export { Glyph, type GlyphName };

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
  // A problem to solve (0022), with its own place on the module path.
  practice: "practice",
};

/** A filled mastered disc with a tick: a topic that is done, a module whose topics all are. */
function DoneDisc({ size }: { size: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-m-hi text-[var(--m-hi-on)]" style={{ width: size, height: size }}>
      <Glyph name="tick" size={size - 4} />
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
