"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PinnedDiagram } from "@/components/studio/PinnedDiagram";
import { Sentence } from "@/components/studio/Sentence";
import { MentionComposer } from "@/components/studio/StudioComposer";
import { focusIsUnclaimed } from "@/components/studio/dialog-focus";
import { DialogHeader, useStudioDialog } from "@/components/studio/StudioDialog";
import { Button } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/classes";
import type { MentionComposerHandle } from "@/components/ui/MentionComposer";
import {
  EMPTY_MENTION_VALUE,
  isEmptyValue,
  prependValue,
  sameValue,
  trimValue,
  type MentionValue,
} from "@/components/ui/mention-text";
import { UserMessage } from "@/components/ui/Message";
import { MENTION_HINT, mentionOptions, valueSendBlock } from "@/lib/studio-cards";
import { createDraft, DRAFT_KINDS, idempotencyKey, type DraftKind, type VideoAvailability } from "@/lib/studio-drafts";
import {
  carryOpener,
  firstTurn,
  extendKey,
  extendRefusal,
  leaveOpener,
  makeVideoTitle,
  makeVideoValue,
  noteArrival,
  readingWords,
  sessionStore,
  readOpener,
  takePrefill,
  type ExtendRefusal,
} from "@/lib/studio-extend";
import { canvasHref, panelHref } from "@/lib/studio-view";

type Value = MentionValue<DraftKind>;

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
 * The composer is the conversation's own (`MentionComposer`, docs/STUDIO-MENTIONS.md),
 * so an `@Video` or `@Diagram` typed during the read is a chip here and stays
 * one across the hand-off: a queued message goes as `{ text, mentions }`, and
 * unsent words go into the conversation's composer with their chips where they
 * were typed (`ExtendOpener`).
 *
 * Make a video of this (`&make=video`, D86 of docs/STUDIO-CHAT-FIRST.md) is
 * the same press with a different start: the composer opens holding the
 * Video chip and a sentence, and nothing is sent until the person presses
 * Send, here or in the conversation.
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
  talk = false,
  makeVideo = false,
  video = null,
}: {
  name: string;
  title: string;
  path: string;
  /** Whether the grid has this diagram. A name it does not have gets no picture, only the runner's answer. */
  listed: boolean;
  /** From Talk it through (`&talk=1`): no opener is sent, prefill or not. */
  talk?: boolean;
  /** From Make a video of this (`&make=video`): no opener is sent, and the composer starts with the Video chip and a sentence. */
  makeVideo?: boolean;
  /** The video doctor, as the conversation's menu reads it: whether Video can be tagged. Unknown reads as available. */
  video?: VideoAvailability | null;
}) {
  const router = useRouter();
  const { close, isClosing } = useStudioDialog();
  const [refused, setRefused] = useState<ExtendRefusal | null>(null);
  /** The draft exists and the conversation is on its way: nothing typed now could be carried. */
  const [opening, setOpening] = useState(false);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  // Make a video of this starts with its words in place; every other press starts empty.
  const [initial] = useState<Value>(() => (makeVideo ? makeVideoValue(video) : EMPTY_MENTION_VALUE));
  const [value, setValueState] = useState<Value>(initial);
  const [queued, setQueuedState] = useState<Value | null>(null);
  // What the post's continuation hands over. Written with the state, in the
  // same handler, rather than by an effect after the render: a keystroke
  // made just before the post resolved is in these, where an effect would
  // not have run yet.
  const typed = useRef<{ value: Value; queued: Value | null }>({ value: initial, queued: null });
  const setValue = useCallback((next: Value) => {
    typed.current.value = next;
    setValueState(next);
  }, []);
  const setQueued = useCallback((next: Value | null) => {
    typed.current.queued = next;
    setQueuedState(next);
  }, []);
  const composer = useRef<MentionComposerHandle | null>(null);
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
    // Its own print, so an Extend press on the same diagram a moment ago
    // (closed mid-read, its opener still waiting) is not the draft this one
    // opens, and its opener is never sent from here.
    const key = extendKey(store, name, () => idempotencyKey(makeVideo ? "make-video" : "extend"), Date.now(), makeVideo ? "video" : undefined);
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
      // Its chips too, ahead of whatever was typed since.
      const { queued: held, value: current } = typed.current;
      setQueued(null);
      if (held !== null) setValue(prependValue(held, current));
      return;
    }
    // From here the composer is closed (`opening`), so what it holds now is
    // everything there is to carry: a message sent goes as the first turn,
    // and whatever is left unsent lands in the conversation's composer.
    setOpening(true);
    noteArrival(result.data.draftId, name, makeVideo ? "video" : "extend");
    const { value: unsent, queued: waiting } = typed.current;
    // Make a video of this never sends on its own: what it starts with is in
    // the composer, for the person to read and send.
    const first = firstTurn(waiting, talk || makeVideo);
    // A reload before the navigation below landed runs this press again with
    // only what was typed since, and gets the same draft: the opener it left
    // first keeps the message that was waiting unless another was queued
    // since (`carryOpener`).
    const draftId = result.data.draftId;
    leaveOpener(
      store,
      draftId,
      carryOpener(readOpener(store, draftId), {
        send: first === null ? null : first.text,
        sendMentions: first === null ? [] : first.mentions,
        compose: unsent.text,
        composeMentions: unsent.mentions,
        source: name,
      }, waiting !== null, { composeUntouched: !isEmptyValue(initial) && sameValue(unsent, initial) }),
    );
    router.replace(panelHref(path, { extend: null, draft: result.data.draftId }), { scroll: false });
  }, [name, title, path, talk, makeVideo, initial, router, isClosing, setQueued, setValue]);

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
    // This is for a composer that is already here (its chunk was loaded by
    // an earlier press, or by Extend's hover). One that arrives later asks
    // for focus itself when it mounts (`autoFocus` below), which is why
    // nothing polls: the wait is as long as the chunk takes.
    const later = setTimeout(() => {
      // Only a Talk it through press reads a prefill, so a stale one left by
      // a press that never arrived cannot land in an ordinary Extend.
      const prefill = talk ? takePrefill(sessionStore(), name) : null;
      if (prefill !== null) setValue({ text: prefill, mentions: [] });
      if (focusIsUnclaimed(document.activeElement)) composer.current?.focus();
    }, 0);
    return () => clearTimeout(later);
  }, [name, talk, setValue]);

  // The draft is new, so it will have the current runner's kinds: both. The
  // conversation re-reads them from its record, and a tag it cannot take
  // comes back into its composer with the reason.
  const options = useMemo(() => mentionOptions({ plannerKinds: [...DRAFT_KINDS] }, video), [video]);
  // A bare tag gives the planner nothing to go on in a conversation with no
  // turn yet (T15), and this one has none.
  const valueBlock = valueSendBlock(value, true);

  const words = readingWords(now - startedAt);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <DialogHeader title={makeVideo ? makeVideoTitle(title) : `Extending ${title}`} />

      <div
        role="log"
        aria-live="polite"
        aria-busy={refused === null}
        aria-label="Conversation"
        className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5"
      >
        {listed && <PinnedDiagram name={name} title={title} />}

        {queued !== null && (
          <UserMessage>
            <Sentence value={queued} />
          </UserMessage>
        )}

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
          <MentionComposer
            handleRef={composer}
            value={value}
            onChange={setValue}
            onSubmit={(next) => {
              const body = trimValue(next);
              if (isEmptyValue(body) || queued !== null || opening) return;
              if (valueSendBlock(body, true) !== null) return;
              setQueued(body);
              setValue(EMPTY_MENTION_VALUE);
            }}
            label={makeVideo ? "Tell the planner what the video should explain" : "Tell the planner what to add to this diagram"}
            placeholder={makeVideo ? "What should the video explain?" : "What should it gain?"}
            mentions={options}
            mentionHint={MENTION_HINT}
            // Focus once it has loaded, unless the person has gone elsewhere.
            autoFocus={focusIsUnclaimed}
            // A reload here would lose what was typed and queued.
            fallbackNote="Tags could not load, so none can be added here."
            disabled={opening}
            sendDisabled={queued !== null || valueBlock !== null}
            disabledReason={
              opening
                ? "Opening the conversation. What is here goes with it."
                : queued !== null
                  ? "Your message goes as soon as the diagram is read."
                  : (valueBlock ?? undefined)
            }
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
