"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { usePanelHost } from "@/components/studio/panel-host";
import type { MentionValue } from "@/components/ui/mention-text";
import { createDraft, idempotencyKey, type DraftKind } from "@/lib/studio-drafts";
import { leaveOpener, sessionStore } from "@/lib/studio-extend";
import { panelHref } from "@/lib/studio-view";

/**
 * Start a conversation: `POST /api/drafts`, then open it.
 *
 * Shared by the home composer, New conversation after a job, and Start over,
 * so there is one way a draft begins. The panel's other parameters are
 * dropped on the way: a new conversation is not about the job or the tile
 * that was open.
 *
 * `first` is a message to send as the person's first turn: the home
 * composer's. It goes to the conversation as its opener (`leaveOpener`),
 * which the conversation sends once it has read its empty record, so the
 * planner's first reply answers it.
 *
 * On `/studio` the conversation opens at the press, showing `first` while
 * the draft is made, and the URL moves without a server render
 * (`PanelHost`); anywhere else it is a router push. `start` resolves true
 * once the conversation is on its way, and false when it is not (refused, or
 * the person went elsewhere meanwhile), so the caller can keep what was
 * typed.
 */
export function useStartDraft(path: string): {
  start: (first?: MentionValue<DraftKind>, model?: string) => Promise<boolean>;
  busy: boolean;
  error: string | null;
} {
  const router = useRouter();
  const host = usePanelHost();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(first?: MentionValue<DraftKind>, model?: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    const token = host?.begin(first ?? null) ?? null;
    const result = await createDraft({
      idempotencyKey: idempotencyKey("draft"),
      // The composer picker's pick (D90); unset is the runner's own default.
      ...(model === undefined || model === "default" ? {} : { model }),
    });
    if (!result.ok) {
      if (host !== null && token !== null) host.settle(token, null);
      setBusy(false);
      setError(result.refusal.error);
      return false;
    }
    const draftId = result.data.draftId;
    if (first !== undefined) {
      leaveOpener(sessionStore(), draftId, {
        send: first.text,
        sendMentions: first.mentions,
        compose: "",
        source: null,
      });
    }
    const href = panelHref(path, { draft: draftId, job: null, extend: null, selected: null, shot: null });
    let going = true;
    if (host !== null && token !== null) going = host.settle(token, href);
    else router.push(href, { scroll: false });
    setBusy(false);
    return going;
  }

  return { start, busy, error };
}
