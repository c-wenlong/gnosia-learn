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

import type { StudioAgentPreference } from "@self-learn/schema/shared";

import { loadStudioSettings, type StudioSettingsData } from "@/app/(app)/studio/actions";
import { DiagramPanelBody, type JobRow } from "@/components/studio/DiagramInspector";
import { DraftPanel } from "@/components/studio/DraftPanel";
import { JobPanel } from "@/components/studio/JobPanel";
import { useStudioJobs } from "@/components/studio/JobsProvider";
import { HostContext } from "@/components/studio/panel-host";
import { VerbNotice } from "@/components/studio/StudioChrome";
import { DialogHeader, StudioDialog } from "@/components/studio/StudioDialog";
import { StudioSettings } from "@/components/studio/StudioSettings";
import type { AgentKind } from "@/lib/studio-agent-settings";
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
 * The panels on `/studio` that open and close in the browser: a
 * conversation, a job, and a tile's panel.
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
 * The plus card opens the dialog at once, before the runner has made the
 * draft, so the press answers in a frame rather than when the post returns.
 */

type ConversationProps = Omit<ComponentProps<typeof DraftPanel>, "draftId" | "jobId" | "path">;

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
  children,
  ...conversation
}: ConversationProps & {
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
  const [opening, setOpening] = useState<{ token: number; from: string | null } | null>(null);
  const attempts = useRef(0);
  /** The attempt still wanted, and the draft the address bar named at its press. */
  const current = useRef<{ token: number; from: string | null } | null>(null);

  const begin = useCallback(() => {
    attempts.current += 1;
    const attempt = { token: attempts.current, from: view.draft };
    current.current = attempt;
    setOpening(attempt);
    return attempt.token;
  }, [view.draft]);

  const settle = useCallback((token: number, href: string | null) => {
    // The person moved on while the draft was being made: they closed the
    // wait, or closed the conversation Start over was pressed in, or went
    // Back. The draft is an empty one the list does not show.
    const attempt = current.current;
    if (attempt === null || attempt.token !== token) return;
    if (new URLSearchParams(window.location.search).get("draft") !== attempt.from) {
      current.current = null;
      setOpening(null);
      return;
    }
    if (href === null) {
      current.current = null;
      setOpening(null);
      return;
    }
    // The dialog stays open until the address bar has the draft, below, so
    // there is no frame with neither the placeholder nor the conversation.
    current.current = null;
    pushUrl(href);
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

  /** The settings rows once read, and whether the last read failed. */
  const [settings, setSettings] = useState<StudioSettingsData | null>(null);
  const [settingsFailed, setSettingsFailed] = useState(false);
  const settingsRead = useRef<Promise<void> | null>(null);
  const warmSettings = useCallback(() => {
    if (settingsRead.current !== null) return;
    setSettingsFailed(false);
    settingsRead.current = loadStudioSettings()
      .then(
        // Rows read with the catalog down are the defaults: a later read replaces them.
        (data) => setSettings((held) => (held?.reachable ? held : data)),
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

  const controls = useMemo(() => ({ begin, settle, navigate, warmSettings }), [begin, settle, navigate, warmSettings]);
  const closeHref = panelHref(path, { draft: null, job: null, extend: null, selected: null, shot: null, settings: false });

  // The page's order: a picture closes every panel, then the settings, a
  // conversation, a job, an Extend press, and a tile last.
  let dialog: ReactNode = null;
  if (view.shot !== null) {
    dialog = null;
  } else if (view.settings) {
    dialog = (
      <StudioDialog key="settings" closeHref={closeHref} navigate={pushUrl} label="Settings" compact>
        <DialogHeader title="Settings" />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {settings !== null ? (
            <StudioSettings key={settings.reachable ? "read" : "defaults"} reachable={settings.reachable} rows={settings.rows} onSaved={settingsSaved} />
          ) : settingsFailed ? (
            <div role="alert" className="flex flex-col items-start gap-3 p-5 text-[14px] text-text2">
              <p>The settings could not be read: the studio did not answer.</p>
              <button type="button" onClick={warmSettings} className="text-[13px] font-medium text-accent-text underline-offset-4 hover:underline">
                Try again
              </button>
            </div>
          ) : (
            <SettingsLoading />
          )}
        </div>
      </StudioDialog>
    );
  } else if (view.draft !== null) {
    dialog = (
      // The key a server-drawn Extend press uses too, so the dialog stays
      // open while one becomes the other.
      <StudioDialog key="conversation" closeHref={closeHref} navigate={pushUrl} label="Conversation" tall>
        <DraftPanel key={view.draft} draftId={view.draft} jobId={view.job} path={path} {...conversation} />
      </StudioDialog>
    );
  } else if (opening !== null) {
    dialog = (
      <StudioDialog key="conversation" closeHref={closeHref} navigate={cancel} label="Conversation" tall>
        <DialogHeader title="New conversation" />
        <p role="status" className="p-5 text-[14px] text-text3">
          Opening a conversation…
        </p>
      </StudioDialog>
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
      {children}
      {dialog}
    </HostContext.Provider>
  );
}

/** The two rows' shape while they are read, so the dialog does not jump when they land. */
function SettingsLoading() {
  return (
    <div className="flex flex-col gap-5 p-5" aria-busy="true">
      <p role="status" className="sr-only">
        Reading the settings
      </p>
      {[0, 1].map((at) => (
        <div key={at} className="flex flex-col gap-2.5">
          <div className="mb-2.5 h-4 w-20 rounded bg-surface2" />
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1].map((menu) => (
              <div key={menu} className="flex flex-col gap-1.5">
                <div className="h-3 w-12 rounded bg-surface2" />
                <div className="h-10 rounded-lg bg-surface2 animate-pulse motion-reduce:animate-none" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
