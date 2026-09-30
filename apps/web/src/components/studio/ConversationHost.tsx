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

import { HostContext } from "@/components/studio/conversation-host";
import { DraftPanel } from "@/components/studio/DraftPanel";
import { DialogHeader, StudioDialog } from "@/components/studio/StudioDialog";
import { panelHref, panelSignature, parseView, rawParamsOf } from "@/lib/studio-view";

/**
 * The conversation panel on `/studio`, opened and closed in the browser.
 *
 * Opening a conversation used to be a router push, and so was closing it:
 * each one rendered the whole page on the server again, which reads the
 * diagrams, the vocabulary and the videos through the runner, a catalog
 * subprocess apiece. Nothing on the grid changes when a conversation opens
 * or closes, so this moves the URL with `history.pushState`, which Next keeps
 * `useSearchParams` in step with, and draws the panel from what the page
 * already sent. The URL is still the state: a reload with `?draft=` comes
 * straight back here, and Back and Forward move between the two.
 *
 * Every other panel (a job, an Extend press, a tile, the settings) is still
 * drawn by the server and handed in as `panel`, shown only while the address
 * bar names the panel it was drawn for (`panelKey`). Once a conversation
 * opens on top of one, or closes over the URL it was drawn for, it is not
 * shown again until the server draws the page again.
 *
 * The plus card opens the dialog at once, before the runner has made the
 * draft, so the press answers in a frame rather than when the post returns.
 */

type PanelProps = Omit<ComponentProps<typeof DraftPanel>, "draftId" | "jobId" | "path">;

/** Move the address bar without a server render. */
function pushUrl(href: string): void {
  window.history.pushState(null, "", href);
}

export function ConversationHost({
  panel,
  panelKey,
  children,
  ...panelProps
}: PanelProps & {
  /** The dialog the server drew for its URL, or null. */
  panel: ReactNode;
  /** `panelSignature` of the URL the server drew `panel` for. */
  panelKey: string;
  children: ReactNode;
}) {
  const search = useSearchParams();
  const pathname = usePathname();
  const raw = useMemo(() => rawParamsOf(new URLSearchParams(search.toString())), [search]);
  const view = parseView(raw);
  const query = search.toString();
  const path = query === "" ? pathname : `${pathname}?${query}`;

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

  const cancel = useCallback(() => {
    current.current = null;
    setOpening(null);
  }, []);

  // The address bar moved on from the draft it named at the press: the new
  // conversation is here, or Back took the person somewhere else.
  if (opening !== null && view.draft !== opening.from) setOpening(null);

  const controls = useMemo(() => ({ begin, settle }), [begin, settle]);
  const closeHref = panelHref(path, { draft: null, job: null, extend: null, selected: null, shot: null, settings: false });

  // The server's order: a picture closes every panel, the settings come
  // before a conversation, and a conversation before anything else.
  const draft = !view.settings && view.shot === null ? view.draft : null;
  let dialog: ReactNode = null;
  if (draft !== null) {
    dialog = (
      // The key a server-drawn Extend press uses too, so the dialog stays
      // open while one becomes the other.
      <StudioDialog key="conversation" closeHref={closeHref} navigate={pushUrl} label="Conversation" tall>
        <DraftPanel key={draft} draftId={draft} jobId={view.job} path={path} {...panelProps} />
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
  } else if (panelSignature(raw) === panelKey) {
    dialog = panel;
  }

  return (
    <HostContext.Provider value={controls}>
      {children}
      {dialog}
    </HostContext.Provider>
  );
}
