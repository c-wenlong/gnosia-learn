"use client";

import { useEffect, useRef, useState } from "react";

import { OPTIONS_WAIT_MS } from "@gnosia/tutor/session-core";

/** The check whose wrong options the tutor is asked to write: a note's own, by id. */
export interface OptionsAsk {
  concept: string;
  check: string;
}

/**
 * What `POST /api/agent/check-options` answered: the three wrong options and
 * the check as the server read it now, which the caller compares with the
 * question on its page (`sameCheck`) before laying the options out.
 */
export interface WrittenAnswer {
  options: string[];
  question: unknown;
  answer: unknown;
}

/**
 * The tutor's wrong options for the note checks a quiz page asks, by step
 * (docs/LEARN.md, "Wrong options"). Shared by the session page and the week
 * check (`SessionFocus`) and Review (`ReviewSession`).
 *
 * For the step on screen and the two after it, a step whose `askAt` names a
 * check is asked for once, so the next question is usually ready by the time
 * it comes up. Never during a render: only from an effect, once the page is
 * in the browser. A step is `undefined` while its request is out, the
 * server's answer once it lands, and `null` when there is none to use: a
 * refusal of any kind (no key, a 502, a check too long), a reply that is not
 * three strings, the server unreachable, or no answer within
 * `OPTIONS_WAIT_MS`. A null step keeps the options from the notes.
 *
 * Requests in flight are aborted if the page goes away, and the steps they
 * were for forgotten, so a remount (React's development double mount among
 * them) asks again; nothing is set after that.
 */
export function useWrittenOptions(
  index: number,
  askAt: (at: number) => OptionsAsk | null,
  enabled: boolean,
): Record<number, WrittenAnswer | null> {
  const [written, setWritten] = useState<Record<number, WrittenAnswer | null>>({});
  const asked = useRef(new Set<number>());
  const inflight = useRef(new Map<AbortController, number>());

  useEffect(() => {
    const held = inflight.current;
    const steps = asked.current;
    return () => {
      for (const [controller, at] of held) {
        controller.abort();
        steps.delete(at);
      }
      held.clear();
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    for (const at of [index, index + 1, index + 2]) {
      const ask = askAt(at);
      if (ask === null || asked.current.has(at)) continue;
      asked.current.add(at);
      const controller = new AbortController();
      inflight.current.set(controller, at);
      // A request that stalls does not hold the question back for good: past
      // the tutor's own deadline the page asks with the notes' options.
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, OPTIONS_WAIT_MS);
      /** Gone because the page went away: nobody is left to show anything to. */
      const gone = () => controller.signal.aborted && !timedOut;
      fetch("/api/agent/check-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptSlug: ask.concept, checkId: ask.check }),
        signal: controller.signal,
      })
        .then(async (res) => {
          const body = (await res.json().catch(() => ({}))) as { options?: unknown; question?: unknown; answer?: unknown };
          if (gone()) return;
          const usable = res.ok && Array.isArray(body.options) && body.options.every((o) => typeof o === "string");
          const answer = usable ? { options: body.options as string[], question: body.question, answer: body.answer } : null;
          setWritten((prev) => ({ ...prev, [at]: answer }));
        })
        .catch(() => {
          if (!gone()) setWritten((prev) => ({ ...prev, [at]: null }));
        })
        .finally(() => {
          clearTimeout(timer);
          inflight.current.delete(controller);
        });
    }
  }, [index, askAt, enabled]);

  return written;
}
