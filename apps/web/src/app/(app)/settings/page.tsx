import type { Metadata } from "next";

import { ProviderKeys } from "@/components/settings/ProviderKeys";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { getAllTopicIds, getCourses } from "@/data/courses";
import { currentOwner } from "@/lib/owner";
import { loadProviderKeys } from "@/lib/provider-keys/settings";
import { loadSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings" };

/**
 * Settings (hi-fi 12): the habit the learner owns (daily target, streak
 * leeway; the hi-fi's Reminders row joins them once reminders exist), how the
 * app looks and how the tutor talks, and the
 * model underneath, read-only, with the export and the reset.
 *
 * The server reads what is stored and what only the server knows (the BKT
 * parameters, which providers have a key); `SettingsForm` writes through
 * `/api/learner/preference` one field at a time.
 *
 * Provider keys (docs/BYOK.md) are the owner's own, saved through
 * `/api/learner/provider-key`: the card is handed each key's last four
 * characters and date, never the key.
 */
export default async function SettingsPage() {
  const owner = await currentOwner();
  const [settings, courses, keys] = await Promise.all([loadSettings(), getCourses(), loadProviderKeys(owner)]);
  // Ids rather than labels: "NVIDIA NIM → Google Gemini → OpenRouter" does
  // not fit the 300px box. Each says whose key it is.
  const providers = keys.order.map((p) => ({ id: p.id, label: p.label, source: p.source }));
  return (
    <div data-layout="app" className="flex max-w-[852px] flex-col gap-4">
      <h1 className="font-display text-[28px] leading-tight font-bold text-text">Settings</h1>
      <SettingsForm settings={settings} providers={providers} topicIds={getAllTopicIds(courses)} />
      <ProviderKeys rows={keys.rows} reachable={keys.reachable} />
    </div>
  );
}
