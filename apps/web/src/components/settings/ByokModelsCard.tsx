"use client";

import { Card } from "@/components/ui/Card";
import { ByokConfig } from "@/components/studio/ByokConfig";

/**
 * The BYOK models card on Settings → Models (D94 of STUDIO-CHAT-FIRST.md):
 * the studio chat harness's own providers — a dropdown of the connected ones
 * plus "+ Add provider", and each provider's Lite / Default / Max picks —
 * the same `ByokConfig` the harness picker's BYOK dialog carries, so a key
 * or a tier set on either surface is the same write.
 */
export function ByokModelsCard() {
  return (
    <Card title="BYOK (Studio chat)">
      <p className="mb-4 text-[14px] text-text2">
        The providers Studio conversations can run on through Qwen Code — the keys live on the runner, and a Lite,
        Default or Max pick in the chat pane runs the model configured here.
      </p>
      <ByokConfig />
    </Card>
  );
}
