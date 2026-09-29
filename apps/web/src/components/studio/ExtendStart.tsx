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
  forgetExtendKey,
  leaveOpener,
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
 * it: 400 and 404 can only be closed, 502 can be tried again or looked at on
 * the canvas, 503 and a runner that is down can be tried again.
 */
export function ExtendStart({ name, title, path }: { name: string; title: string; path: string }) {
  const router = useRouter();
  const { close } = useStudioDialog();
  const [refused, setRefused] = useState<ExtendRefusal | null>(null);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [text, setText] = useState("");
  const [queued, setQueued] = useState<string | null>(null);
  // Read inside the post's continuation, which closes over the first render.
  const typed = useRef({ text: "", queued: null as string | null });
  useEffect(() => {
    typed.current = { text, queued };
  }, [text, queued]);
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
    if (!mounted.current) return;
    if (!result.ok) {
      setRefused(extendRefusal(result.status, result.refusal, title));
      // A message that was waiting goes back into the composer: a refused
      // press should not cost the typing.
      const held = typed.current.queued;
      setQueued(null);
      if (held !== null) setText((current) => (current === "" ? held : `${held}\n${current}`));
      return;
    }
    forgetExtendKey(store, name);
    const { text: draftText, queued: waiting } = typed.current;
    leaveOpener(store, result.data.draftId, { send: waiting ?? EXTEND_OPENER, compose: waiting === null ? "" : draftText });
    router.replace(panelHref(path, { extend: null, draft: result.data.draftId }), { scroll: false });
  }, [name, title, path, router]);

  useEffect(() => {
    // The post runs from an effect because this panel is what a link opens:
    // the press is the navigation, and a reload of it asks again with the same
    // key, which the runner answers with the draft the first post made.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void start();
  }, [start]);

  const pending = refused === null;
  useEffect(() => {
    if (!pending) return;
    const tick = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(tick);
  }, [pending]);

  useEffect(() => {
    composer.current?.focus();
  }, []);

  const words = readingWords(now - startedAt);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DialogHeader title={`Extending ${title}`} />

      <div
        role="log"
        aria-live="polite"
        aria-busy={pending}
        aria-label="Conversation"
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5"
      >
        <PinnedDiagram name={name} title={title} />

        {queued !== null && <UserMessage>{queued}</UserMessage>}

        {pending ? (
          <div role="status" className="mx-auto flex max-w-[56ch] flex-col items-center gap-1 text-center text-[13px] leading-5 text-text3">
            <span className="flex items-center gap-2">
              {words.lead}
              <Dots />
            </span>
            {words.more !== null && <span>{words.more}</span>}
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

      <div className="shrink-0 border-t border-hair px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 md:px-5">
        <Composer
          value={text}
          onChange={setText}
          onSubmit={(value) => {
            const body = value.trim();
            if (body === "" || queued !== null || !pending) return;
            setQueued(body);
            setText("");
          }}
          label="Tell the planner what to add to this diagram"
          placeholder="What should it gain?"
          maxLength={8_000}
          disabled={!pending}
          sendDisabled={queued !== null}
          disabledReason={
            !pending
              ? "The conversation could not start."
              : queued !== null
                ? "Your message goes as soon as the diagram is read."
                : undefined
          }
          inputRef={composer}
        />
      </div>
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
