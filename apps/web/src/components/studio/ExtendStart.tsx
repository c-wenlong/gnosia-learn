"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { PinnedDiagram } from "@/components/studio/PinnedDiagram";
import { DialogHeader, useStudioDialog } from "@/components/studio/StudioDialog";
import { Button } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/classes";
import { Composer } from "@/components/ui/Composer";
import { UserMessage } from "@/components/ui/Message";
import { createDraft, idempotencyKey } from "@/lib/studio-drafts";
import {
  EXTEND_OPENER,
  extendKey,
  extendRefusal,
  leaveOpener,
  noteArrival,
  readingWords,
  sessionStore,
  type ExtendRefusal,
} from "@/lib/studio-extend";
import { canvasHref, panelHref } from "@/lib/studio-view";

/**
 * The panel between pressing Extend and the conversation existing
 * (`?extend=<name>`, docs/STUDIO-CHAT-FIRST.md, "Extend from a tile").
 *
 * `POST /api/drafts { source }` checks the diagram out and runs `canvas
 * inspect` before it answers, which can take a Chromium launch. So the press
 * opens this at once, laid out as the conversation will be: the diagram
 * pinned at the top, a line saying what is happening, and a composer the
 * person can already type in. A message sent now waits here and goes as the
 * first turn in place of the studio's opener; the draft replaces this panel
 * (`router.replace`, so Back does not come here and post again).
 *
 * A refusal stays in this panel, where the press was, with what to do about
 * it (`extendRefusal`). Once the draft exists the composer closes and says
 * so, and what it holds goes with the hand-off: a message sent here as the
 * first turn, and anything left unsent into the conversation's composer.
 */
export function ExtendStart({
  name,
  title,
  path,
  listed,
}: {
  name: string;
  title: string;
  path: string;
  /** Whether the grid has this diagram. A name it does not have gets no picture, only the runner's answer. */
  listed: boolean;
}) {
  const router = useRouter();
  const { close, isClosing } = useStudioDialog();
  const [refused, setRefused] = useState<ExtendRefusal | null>(null);
  /** The draft exists and the conversation is on its way: nothing typed now could be carried. */
  const [opening, setOpening] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [text, setTextState] = useState("");
  const [queued, setQueuedState] = useState<string | null>(null);
  // What the post's continuation hands over. Written with the state, in the
  // same handler, rather than by an effect after the render: a keystroke
  // made just before the post resolved is in these, where an effect would
  // not have run yet.
  const typed = useRef({ text: "", queued: null as string | null });
  const setText = useCallback((next: string) => {
    typed.current.text = next;
    setTextState(next);
  }, []);
  const setQueued = useCallback((next: string | null) => {
    typed.current.queued = next;
    setQueuedState(next);
  }, []);
  const composer = useRef<HTMLTextAreaElement | null>(null);
  const running = useRef(false);
  // Closing the panel mid-read does not stop the post, and its answer must not
  // reopen a conversation the person just closed.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const start = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setRefused(null);
    const store = sessionStore();
    const key = extendKey(store, name, () => idempotencyKey("extend"));
    const result = await createDraft({ source: name, idempotencyKey: key });
    running.current = false;
    // Closed meanwhile. A draft that was made keeps its key for a while, so
    // pressing Extend on this diagram again opens that one, not a second.
    // The same for a Close, Escape or backdrop click whose navigation has not
    // landed yet: the hand-off would undo it, and send a paid opener into a
    // conversation the person closed.
    if (!mounted.current || isClosing()) return;
    if (!result.ok) {
      setRefused(extendRefusal(result.status, result.refusal, title));
      // A message that was waiting goes back into the composer: a refused
      // press should not cost the typing.
      const { queued: held, text: current } = typed.current;
      setQueued(null);
      if (held !== null) setText(current === "" ? held : `${held}\n${current}`);
      return;
    }
    // From here the composer is closed (`opening`), so what it holds now is
    // everything there is to carry: a message sent goes as the first turn,
    // and whatever is left unsent lands in the conversation's composer.
    setOpening(true);
    noteArrival(result.data.draftId, name);
    const { text: draftText, queued: waiting } = typed.current;
    leaveOpener(store, result.data.draftId, { send: waiting ?? EXTEND_OPENER, compose: draftText, source: name });
    router.replace(panelHref(path, { extend: null, draft: result.data.draftId }), { scroll: false });
  }, [name, title, path, router, isClosing, setQueued, setText]);

  useEffect(() => {
    // The post runs from an effect because this panel is what a link opens:
    // the press is the navigation, and a reload of it asks again with the same
    // key, which the runner answers with the draft the first post made.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void start();
  }, [start]);

  const pending = refused === null && !opening;
  useEffect(() => {
    if (!pending) return;
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(tick);
  }, [pending]);

  useEffect(() => {
    // After the dialog's own effect, which runs after this one and focuses
    // its first control (Close) when it opens: typing straight away should
    // land in the composer, and an Enter there should not close the panel.
    const later = setTimeout(() => composer.current?.focus(), 0);
    return () => clearTimeout(later);
  }, []);

  const words = readingWords(now - startedAt);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DialogHeader title={`Extending ${title}`} />

      <div
        role="log"
        aria-live="polite"
        aria-busy={refused === null}
        aria-label="Conversation"
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5"
      >
        {listed && <PinnedDiagram name={name} title={title} />}

        {queued !== null && <UserMessage>{queued}</UserMessage>}

        {refused === null ? (
          <div role="status" className="mx-auto flex max-w-[56ch] flex-col items-center gap-1 text-center text-[13px] leading-5 text-text3">
            <span className="flex items-center gap-2">
              {opening ? "Opening the conversation" : words.lead}
              <Dots />
            </span>
            {!opening && words.more !== null && <span>{words.more}</span>}
          </div>
        ) : (
          <div role="alert" className="flex flex-col gap-3 rounded-xl bg-warn-tint px-4 py-3.5 text-[14px] text-text">
            <p className="font-semibold">{refused.headline}</p>
            {refused.detail !== null && <p className="break-words text-[13px] text-text2">{refused.detail}</p>}
            <div className="flex flex-wrap items-center gap-2">
              {refused.actions.includes("retry") && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setStartedAt(Date.now());
                    setNow(Date.now());
                    void start();
                  }}
                >
                  Try again
                </Button>
              )}
              {refused.actions.includes("canvas") && (
                <Link href={canvasHref(name)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  Open canvas
                </Link>
              )}
              {refused.actions.includes("close") && (
                <Button size="sm" variant="ghost" onClick={close}>
                  Back to the grid
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Refused, there is nothing to talk to: the composer goes rather than
          sitting there disabled. */}
      {refused === null && (
        <div className="shrink-0 border-t border-hair px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 md:px-5">
          <Composer
            value={text}
            onChange={setText}
            onSubmit={(value) => {
              const body = value.trim();
              if (body === "" || queued !== null || opening) return;
              setQueued(body);
              setText("");
            }}
            label="Tell the planner what to add to this diagram"
            placeholder="What should it gain?"
            maxLength={8_000}
            disabled={opening}
            sendDisabled={queued !== null}
            disabledReason={
              opening
                ? "Opening the conversation. What is here goes with it."
                : queued !== null
                  ? "Your message goes as soon as the diagram is read."
                  : undefined
            }
            inputRef={composer}
          />
        </div>
      )}
    </div>
  );
}

function Dots() {
  return (
    <span aria-hidden className="inline-flex gap-1">
      {[0, 1, 2].map((at) => (
        <span
          key={at}
          className="h-1.5 w-1.5 animate-pulse rounded-full bg-text3 motion-reduce:animate-none"
          style={{ animationDelay: `${at * 180}ms` }}
        />
      ))}
    </span>
  );
}
