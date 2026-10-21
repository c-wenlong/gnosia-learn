"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";

import type { StudioAgentPreference } from "@gnosia/schema/shared";

import { loadStudioSettings, type StudioSettingsData } from "@/app/(app)/studio/actions";
import { usePublishStudioChats } from "@/components/shell/shell-context";
import { DiagramPanelBody, type JobRow } from "@/components/studio/DiagramInspector";
import { DraftPanel } from "@/components/studio/DraftPanel";
import { HarnessPicker } from "@/components/studio/HarnessPicker";
import { JobPanel } from "@/components/studio/JobPanel";
import { useStudioJobs } from "@/components/studio/JobsProvider";
import { HostContext, NEW_CHAT_EVENT } from "@/components/studio/panel-host";
import { Sentence } from "@/components/studio/Sentence";
import { VerbNotice } from "@/components/studio/StudioChrome";
import { FADE_IN } from "@/components/studio/motion";
import { DialogHeader, StudioDialog, StudioPane } from "@/components/studio/StudioDialog";
import { StudioSettings } from "@/components/studio/StudioSettings";
import { VideoPreview } from "@/components/studio/video/VideoPreview";
import { PANE_GUTTER } from "@/components/studio/pane-context";
import { cx } from "@/components/ui/classes";
import { Skeleton } from "@/components/ui/Skeleton";
import type { MentionValue } from "@/components/ui/mention-text";
import { UserMessage } from "@/components/ui/Message";
import { TextLink } from "@/components/ui/TextLink";
import type { AgentKind } from "@/lib/studio-agent-settings";
import { kindUnavailable } from "@/lib/studio-cards";
import { DRAFT_KINDS, type DraftKind, type DraftSummary } from "@/lib/studio-drafts";
import type { StudioVideo } from "@/lib/studio-video";
import {
  browserMove,
  CLOSED,
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
 * the browser: a conversation, a job, a tile's panel, the settings and a
 * video's preview.
 *
 * The frame is one of two things beside the app's sidebar, which lists the
 * conversations (docs/STUDIO-CHAT-FIRST.md, "Home and the full-screen
 * conversation"; `usePublishStudioChats` tells it which one is open): the
 * home view the page drew (`children`: the composer, then the diagrams
 * and videos), or, with `?draft=`, that conversation full screen
 * (`StudioPane`). The home view stays mounted under a conversation, hidden,
 * so going back to it keeps its scroll and whatever was typed in it. A job
 * on its own, a tile, the settings and an Extend press are still dialogs
 * over the home view, and so is a video playing in its preview (`?play=`,
 * D85), from the videos the page already read.
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
 * The settings are drawn here too: the dialog opens at once and asks for its
 * two rows through `loadStudioSettings`, once per visit, and keeps them, with
 * each save folded in, for the next time it opens. An Extend press is still
 * drawn by the server and handed in as `panel`, shown only while the address
 * bar names the panel it was drawn for (`panelKey`), so a panel opened over
 * one, or closed over the URL it was drawn for, cannot leave it behind.
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

/**
 * A location as one comparable string: the path and the parameters,
 * normalised, so the address bar and a render's `useSearchParams` agree.
 */
function locationOf(pathname: string, search: string): string {
  return `${pathname}?${new URLSearchParams(search).toString()}`;
}

/** Move the address bar without a server render. */
function pushUrl(href: string): void {
  window.history.pushState(null, "", href);
}

export function PanelHost({
  panel,
  panelKey,
  diagrams,
  videos,
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
  /** Every studio video, for its preview. */
  videos: StudioVideo[];
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
   * The attempt the conversation is open for before its draft exists, with
   * the whole location the address bar had at the press (`locationOf`), or
   * null. The whole of it, not only `draft`: Back from one view with no
   * draft to another with none must still count as the person leaving.
   */
  const [opening, setOpening] = useState<{ token: number; from: string; first: Value | null } | null>(null);
  const attempts = useRef(0);
  /** The attempt still wanted, and the location the address bar had at its press. */
  const current = useRef<{ token: number; from: string } | null>(null);

  const begin = useCallback(
    (first: Value | null) => {
      attempts.current += 1;
      const attempt = { token: attempts.current, from: locationOf(window.location.pathname, window.location.search) };
      current.current = attempt;
      setOpening({ ...attempt, first });
      return attempt.token;
    },
    [],
  );

  const settle = useCallback((token: number, href: string | null) => {
    // The person moved on while the draft was being made: they pressed New
    // chat or another conversation, or closed the one Start over was pressed
    // in, or went Back. The draft is an empty one the list does not show.
    const attempt = current.current;
    if (attempt === null || attempt.token !== token) return false;
    if (locationOf(window.location.pathname, window.location.search) !== attempt.from) {
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
    const from = { pathname: window.location.pathname, search: window.location.search };
    if (!browserMove(from, href)) return false;
    pushUrl(href);
    return true;
  }, []);

  const cancel = useCallback(() => {
    current.current = null;
    setOpening(null);
  }, []);

  // The address bar moved on from where it was at the press: the new
  // conversation is here, or Back took the person somewhere else.
  if (opening !== null && locationOf(pathname, query) !== opening.from) setOpening(null);

  /** The settings rows once read, and whether the last read failed. */
  const [settings, setSettings] = useState<StudioSettingsData | null>(null);
  const [settingsFailed, setSettingsFailed] = useState(false);
  const settingsRead = useRef<Promise<void> | null>(null);
  /**
   * Whether rows read with the catalog behind them are held. A ref beside the
   * state, so `warmSettings` stays one stable callback and a hover on the
   * Settings button, which calls it every time, does not start a read whose
   * answer is thrown away.
   */
  const settingsReachable = useRef(false);
  const warmSettings = useCallback(() => {
    // A read in flight, or rows that are final: only a failed read or the
    // defaults (the catalog was down) are worth reading again.
    if (settingsRead.current !== null || settingsReachable.current) return;
    setSettingsFailed(false);
    settingsRead.current = loadStudioSettings()
      .then(
        // Rows read with the catalog down are the defaults: a later read replaces them.
        (data) => {
          settingsReachable.current = data.reachable;
          setSettings((held) => (held?.reachable ? held : data));
        },
        () => setSettingsFailed(true),
      )
      .finally(() => {
        settingsRead.current = null;
      });
  }, []);
  const settingsSaved = useCallback((kind: AgentKind, value: StudioAgentPreference) => {
    setSettings((held) => held && { ...held, rows: held.rows.map((row) => (row.kind === kind ? { ...row, value } : row)) });
  }, []);
  const settingsOpen = view.settings && view.shot === null;
  useEffect(() => {
    // Read once a visit, and again on each opening while the last read had
    // no catalog behind it, so the panel does not keep offering the defaults.
    if (settingsOpen && (settings === null || !settings.reachable)) warmSettings();
    // Only an opening asks: `settings` changing while open must not read again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsOpen, warmSettings]);

  const verbs = useMemo(
    () => ({ begin, settle, navigate, warmSettings }),
    [begin, settle, navigate, warmSettings],
  );
  // The path joins the stable verbs here rather than in their memo: in it,
  // the compiler reads the state setters behind them as dependencies and
  // gives up on the component.
  const controls = { ...verbs, path };
  const closeHref = panelHref(path, CLOSED);

  // New chat is the home view: its composer is where a conversation starts.
  // Nothing is made until something is sent, so pressing it twice, or
  // pressing it and leaving, costs nothing.
  const newChat = useCallback(() => {
    cancel();
    if (path !== closeHref) pushUrl(closeHref);
    // After the home view is shown again, which this render does.
    requestAnimationFrame(() => window.dispatchEvent(new Event(NEW_CHAT_EVENT)));
  }, [cancel, path, closeHref]);

  // The page's order: a picture closes every panel, then the settings, a
  // conversation, a job, an Extend press, a tile, and a video's preview last. A conversation is
  // the frame's main view rather than a dialog.
  let dialog: ReactNode = null;
  let chat: ReactNode = null;
  if (view.shot !== null) {
    dialog = null;
  } else if (view.settings) {
    dialog = (
      <StudioDialog key="settings" closeHref={closeHref} navigate={pushUrl} label="Settings" size="compact">
        <DialogHeader title="Settings" />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {settings !== null ? (
            // The rows fade in over the frame `SettingsLoading` held for them.
            <div key={settings.reachable ? "read" : "defaults"} className={FADE_IN}>
              <StudioSettings reachable={settings.reachable} rows={settings.rows} onSaved={settingsSaved} />
            </div>
          ) : settingsFailed ? (
            <div role="alert" className={cx("flex flex-col items-start gap-3 p-5 text-[14px] text-text2", FADE_IN)}>
              <p>The settings could not be read: the studio did not answer.</p>
              <TextLink onClick={warmSettings} size="sm">
                Try again
              </TextLink>
            </div>
          ) : (
            <SettingsLoading />
          )}
        </div>
      </StudioDialog>
    );
  } else if (view.draft !== null) {
    chat = (
      <StudioPane key="conversation" closeHref={closeHref} navigate={pushUrl} label="Conversation" leading={<HarnessPicker />}>
        <DraftPanel key={view.draft} draftId={view.draft} jobId={view.job} path={path} {...conversation} />
      </StudioPane>
    );
  } else if (opening !== null) {
    chat = (
      <StudioPane key="conversation" closeHref={closeHref} navigate={cancel} label="Conversation" leading={<HarnessPicker />}>
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
            makeVideoHref={panelHref(path, { extend: diagram.name, makeVideo: true, selected: null, job: null, draft: null })}
            videoBlocked={kindUnavailable("video", { plannerKinds: [...DRAFT_KINDS] }, conversation.video ?? null)}
          />
        )}
      </StudioDialog>
    );
  } else if (view.play !== null) {
    const slug = view.play;
    const video = videos.find((entry) => entry.slug === slug) ?? null;
    dialog = (
      <StudioDialog key={`play:${slug}`} closeHref={closeHref} navigate={pushUrl} label={video?.title ?? slug} size="wide">
        <VideoPreview video={video} slug={slug} path={path} />
      </StudioDialog>
    );
  }

  usePublishStudioChats({
    active: chat === null ? null : view.draft,
    pending: view.draft === null && opening !== null ? (opening.first?.text.trim() || "New conversation") : null,
    newChat,
    navigate,
    path,
    initial: drafts,
    titles: conversation.titles,
  });

  return (
    <HostContext.Provider value={controls}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {chat}
        {/* Fades back in as the conversation closes: an animation starts
            again whenever `hidden` lets the box be drawn. Opacity only, and
            filling backwards, so nothing stays behind to put the composer's
            @ menu in a stacking context of its own. */}
        <div hidden={chat !== null} className={cx("flex min-h-0 min-w-0 flex-1 flex-col", FADE_IN)}>
          {children}
        </div>
      </div>
      {dialog}
    </HostContext.Provider>
  );
}

/**
 * The two rows' shape while they are read, so the dialog does not jump when
 * they land and the rows fade in over it. Each box is the height of what it
 * stands for, measured: the legend's 21px line and its 10px margin (a legend
 * sits outside the fieldset's gap), the label's 16px line, and the 44px
 * select (`StudioSettings`). The blocks are the kit's `Skeleton`.
 */
function SettingsLoading() {
  return (
    <div className="flex flex-col gap-5 p-5" aria-busy="true">
      <p role="status" className="sr-only">
        Reading the settings
      </p>
      {[0, 1].map((at) => (
        <div key={at} className="flex flex-col">
          <div className="mb-2.5 flex h-[21px] items-center">
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1].map((menu) => (
              <div key={menu} className="flex flex-col gap-1.5">
                <div className="flex h-4 items-center">
                  <Skeleton className="h-3 w-12" />
                </div>
                <Skeleton className="h-11" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
