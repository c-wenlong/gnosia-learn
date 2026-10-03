"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";

import { DiagramPanelBody, type JobRow } from "@/components/studio/DiagramInspector";
import { DraftPanel } from "@/components/studio/DraftPanel";
import { JobPanel } from "@/components/studio/JobPanel";
import { useStudioJobs } from "@/components/studio/JobsProvider";
import { HostContext, NEW_CHAT_EVENT } from "@/components/studio/panel-host";
import { Sentence } from "@/components/studio/Sentence";
import { VerbNotice } from "@/components/studio/StudioChrome";
import { DialogHeader, StudioDialog, StudioPane } from "@/components/studio/StudioDialog";
import { SidebarToggle, StudioSidebar } from "@/components/studio/StudioSidebar";
import { PANE_GUTTER } from "@/components/studio/pane-context";
import { cx } from "@/components/ui/classes";
import type { MentionValue } from "@/components/ui/mention-text";
import { UserMessage } from "@/components/ui/Message";
import type { DraftKind, DraftSummary } from "@/lib/studio-drafts";
import {
  browserPanelMove,
  displayTitle,
  panelHref,
  panelSignature,
  parseView,
  rawParamsOf,
  readOutcome,
  withoutOutcome,
  type Diagram,
} from "@/lib/studio-view";

/**
 * The studio's frame, and the panels on `/studio` that open and close in
 * the browser: a conversation, a job, and a tile's panel.
 *
 * The frame is the sidebar of conversations beside one of two things
 * (docs/STUDIO-CHAT-FIRST.md, "Home and the full-screen conversation"):
 * the home view the page drew (`children`: the composer, then the diagrams
 * and videos), or, with `?draft=`, that conversation full screen
 * (`StudioPane`). The home view stays mounted under a conversation, hidden,
 * so going back to it keeps its scroll and whatever was typed in it. A job
 * on its own, a tile, the settings and an Extend press are still dialogs
 * over the home view.
 *
 * Each of them used to be a router push, and so was closing it: every one
 * rendered the whole page on the server again, which reads the diagrams, the
 * vocabulary and the videos through the runner, a catalog subprocess apiece,
 * a second or more each way. Nothing on the grid changes when a panel opens
 * or closes, so this moves the URL with `history.pushState`, which Next keeps
 * `useSearchParams` in step with, and draws the panel from what the page
 * already sent. The URL is still the state: a reload with `?draft=`, `?job=`
 * or `?sel=` comes straight back here, and Back and Forward move between them.
 * A link that opens one goes through `PanelLink`, which asks `navigate` first.
 *
 * The settings and an Extend press are still drawn by the server and handed
 * in as `panel`, shown only while the address bar names the panel it was
 * drawn for (`panelKey`), so a panel opened over one, or closed over the URL
 * it was drawn for, cannot leave it behind.
 *
 * The home composer opens the conversation at once, with the person's words
 * in it, before the runner has made the draft, so Send answers in a frame
 * rather than when the post returns.
 */

type ConversationProps = Omit<ComponentProps<typeof DraftPanel>, "draftId" | "jobId" | "path">;
type Value = MentionValue<DraftKind>;

/**
 * A diagram's job history: the rows the page read, brought up to date with
 * the live list, which the jobs provider keeps current while the page is not
 * drawn again. A job the page never saw is added; one it saw takes its live
 * state and title. Newest first.
 */
export function historyOf(rows: readonly JobRow[], live: readonly Pick<JobRow, "jobId" | "state" | "title" | "target" | "requested">[], target: string): JobRow[] {
  const byId = new Map<string, JobRow>();
  for (const row of rows) if (row.target === target) byId.set(row.jobId, row);
  for (const job of live) {
    if (job.target !== target) continue;
    const { jobId, state, title, requested } = job;
    byId.set(jobId, { ...byId.get(jobId), jobId, state, title, target, requested });
  }
  return [...byId.values()].sort((a, b) => b.requested.localeCompare(a.requested));
}

/** Move the address bar without a server render. */
function pushUrl(href: string): void {
  window.history.pushState(null, "", href);
}

export function PanelHost({
  panel,
  panelKey,
  diagrams,
  jobs,
  drafts,
  children,
  ...conversation
}: ConversationProps & {
  /** The conversations the page read for the sidebar, or null when the runner did not answer. */
  drafts: DraftSummary[] | null;
  /** The dialog the server drew for its URL, or null. */
  panel: ReactNode;
  /** `panelSignature` of the URL the server drew `panel` for. */
  panelKey: string;
  /** Every diagram in the directory, for a tile's panel. */
  diagrams: Diagram[];
  /** The runner's jobs as the page read them, for a tile's history and a job's title. */
  jobs: JobRow[];
  children: ReactNode;
}) {
  const search = useSearchParams();
  const pathname = usePathname();
  const { jobs: liveJobs } = useStudioJobs();
  const raw = useMemo(() => rawParamsOf(new URLSearchParams(search.toString())), [search]);
  const view = parseView(raw);
  const query = search.toString();
  // What every panel's links patch. A verb's outcome is not carried on: it is
  // said once, in the panel it came back to.
  const path = withoutOutcome(query === "" ? pathname : `${pathname}?${query}`);

  /**
   * The attempt the dialog is open for before its draft exists, and the
   * draft the address bar named at the press, or null.
   */
  const [opening, setOpening] = useState<{ token: number; from: string | null; first: Value | null } | null>(null);
  const attempts = useRef(0);
  /** The attempt still wanted, and the draft the address bar named at its press. */
  const current = useRef<{ token: number; from: string | null } | null>(null);
  /** The sidebar's drawer, below 768px. */
  const [drawer, setDrawer] = useState(false);

  const begin = useCallback(
    (first: Value | null) => {
      attempts.current += 1;
      const attempt = { token: attempts.current, from: view.draft };
      current.current = attempt;
      setOpening({ ...attempt, first });
      return attempt.token;
    },
    [view.draft],
  );

  const settle = useCallback((token: number, href: string | null) => {
    // The person moved on while the draft was being made: they pressed New
    // chat or another conversation, or closed the one Start over was pressed
    // in, or went Back. The draft is an empty one the list does not show.
    const attempt = current.current;
    if (attempt === null || attempt.token !== token) return false;
    if (new URLSearchParams(window.location.search).get("draft") !== attempt.from) {
      current.current = null;
      setOpening(null);
      return false;
    }
    if (href === null) {
      current.current = null;
      setOpening(null);
      return false;
    }
    // The placeholder stays until the address bar has the draft, below, so
    // there is no frame with neither the placeholder nor the conversation.
    current.current = null;
    pushUrl(href);
    return true;
  }, []);

  const navigate = useCallback((href: string) => {
    // Read from the address bar itself, which a pushState in this same event
    // may already have moved past what this render saw.
    if (!browserPanelMove({ pathname: window.location.pathname, search: window.location.search }, href)) return false;
    pushUrl(href);
    return true;
  }, []);

  const cancel = useCallback(() => {
    current.current = null;
    setOpening(null);
  }, []);

  // The address bar moved on from the draft it named at the press: the new
  // conversation is here, or Back took the person somewhere else.
  if (opening !== null && view.draft !== opening.from) setOpening(null);

  const openSidebar = useCallback(() => setDrawer(true), []);
  const closeSidebar = useCallback(() => setDrawer(false), []);
  const controls = useMemo(() => ({ begin, settle, navigate, openSidebar }), [begin, settle, navigate, openSidebar]);
  const closeHref = panelHref(path, { draft: null, job: null, extend: null, selected: null, shot: null, settings: false });

  // New chat is the home view: its composer is where a conversation starts.
  // Nothing is made until something is sent, so pressing it twice, or
  // pressing it and leaving, costs nothing.
  const newChat = useCallback(() => {
    cancel();
    closeSidebar();
    if (path !== closeHref) pushUrl(closeHref);
    // After the home view is shown again, which this render does.
    requestAnimationFrame(() => window.dispatchEvent(new Event(NEW_CHAT_EVENT)));
  }, [cancel, closeSidebar, path, closeHref]);

  const toggle = <SidebarToggle onOpen={openSidebar} />;

  // The page's order: a picture closes every panel, then the settings, a
  // conversation, a job, an Extend press, and a tile last. A conversation is
  // the frame's main view rather than a dialog.
  let dialog: ReactNode = null;
  let chat: ReactNode = null;
  if (view.shot !== null) {
    dialog = null;
  } else if (view.settings) {
    dialog = panelSignature(raw) === panelKey ? panel : null;
  } else if (view.draft !== null) {
    chat = (
      <StudioPane key="conversation" closeHref={closeHref} navigate={pushUrl} label="Conversation" leading={toggle}>
        <DraftPanel key={view.draft} draftId={view.draft} jobId={view.job} path={path} {...conversation} />
      </StudioPane>
    );
  } else if (opening !== null) {
    chat = (
      <StudioPane key="conversation" closeHref={closeHref} navigate={cancel} label="Conversation" leading={toggle}>
        <DialogHeader title="New conversation" />
        <div role="log" aria-busy aria-label="Conversation" className={cx("flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto py-5", PANE_GUTTER)}>
          {opening.first !== null && (
            <UserMessage>
              <Sentence value={opening.first} />
            </UserMessage>
          )}
          <p role="status" className="text-center text-[13px] text-text3">
            Opening the conversation…
          </p>
        </div>
      </StudioPane>
    );
  } else if (view.job !== null) {
    const jobId = view.job;
    // A job started after the page was drawn is in the live list only.
    const title = jobs.find((job) => job.jobId === jobId)?.title ?? liveJobs.find((job) => job.jobId === jobId)?.title ?? "Job";
    dialog = (
      <StudioDialog key="job" closeHref={closeHref} navigate={pushUrl} label={title}>
        <DialogHeader title={title} />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <JobPanel jobId={jobId} path={path} embedded />
        </div>
      </StudioDialog>
    );
  } else if (view.extend !== null) {
    dialog = panelSignature(raw) === panelKey ? panel : null;
  } else if (view.selected !== null) {
    const name = view.selected;
    const diagram = diagrams.find((entry) => entry.name === name) ?? null;
    const title = diagram === null ? name : displayTitle(diagram);
    const outcome = readOutcome(raw);
    dialog = (
      <StudioDialog key={`sel:${name}`} closeHref={closeHref} navigate={pushUrl} label={title}>
        <DialogHeader title={title} />
        {/* A verb run from this panel redirects back to it, so what it did is
            said here, where the person is looking, and not behind the dimmed
            grid. */}
        {outcome !== null && <VerbNotice report={outcome} clearHref={path} />}
        {diagram === null ? (
          <p className="p-5 text-[14px] text-text2">
            There is no diagram named <span className="font-mono">{name}</span> in this studio.
          </p>
        ) : (
          <DiagramPanelBody
            diagram={diagram}
            jobs={historyOf(jobs, liveJobs, diagram.tldr.path)}
            path={path}
            extendHref={panelHref(path, { extend: diagram.name, selected: null, job: null, draft: null })}
          />
        )}
      </StudioDialog>
    );
  }

  return (
    <HostContext.Provider value={controls}>
      <div className="flex min-h-0 min-w-0 flex-1">
        <StudioSidebar
          initial={drafts}
          path={path}
          titles={conversation.titles}
          active={chat === null ? null : view.draft}
          pending={view.draft === null && opening !== null ? (opening.first?.text.trim() || "New conversation") : null}
          open={drawer}
          onClose={closeSidebar}
          onNewChat={newChat}
        />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {chat}
          <div hidden={chat !== null} className="flex min-h-0 min-w-0 flex-1 flex-col">
            {children}
          </div>
        </div>
      </div>
      {dialog}
    </HostContext.Provider>
  );
}
