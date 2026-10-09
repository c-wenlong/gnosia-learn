"use client";

import { Card } from "@/components/ui/Card";
import { ByokConfig } from "@/components/studio/ByokConfig";

/**
 * The Studio BYOK card (D95, D97): the same configuration surface the chat
 * picker's BYOK row opens — a provider dropdown, its Lite/Default/Max
 * models, and the provider chats run on. Keys themselves are managed on
 * the Providers card above; a provider saved there can be connected here
 * with its saved key, no re-typing.
 */
export function ByokCard({ savedForTutor }: { savedForTutor: string[] }) {
  return (
    <Card title="Studio chats (BYOK)">
      <p className="text-[14px] text-text2">The provider Studio chats run on, and the Lite, Default and Max models the picker offers.</p>
      <ByokConfig savedForTutor={savedForTutor} />
    </Card>
  );
}
