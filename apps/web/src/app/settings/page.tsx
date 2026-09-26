import type { Metadata } from "next";

import { ComingSoon } from "@/components/ComingSoon";

export const metadata: Metadata = { title: "Settings" };

/** Placeholder until phase 1a builds Settings. */
export default function SettingsPage() {
  return (
    <ComingSoon title="Settings">
      Your daily target, streak leeway, reminders and tutor style will be set here. The theme is in the avatar menu
      for now.
    </ComingSoon>
  );
}
