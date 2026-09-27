import type { Metadata } from "next";

import { SettingsForm } from "@/components/settings/SettingsForm";
import { getAllTopicIds, getCourses } from "@/data/courses";
import { resolveProviders } from "@/lib/agent/providers";
import { loadSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Settings" };

/**
 * Settings (hi-fi 12): the habit the learner owns (daily target, streak
 * leeway, reminders), how the app looks and how the tutor talks, and the
 * model underneath, read-only, with the export and the reset.
 *
 * The server reads what is stored and what only the server knows (the BKT
 * parameters, which providers have a key); `SettingsForm` writes through
 * `/api/learner/preference` one field at a time.
 */
export default async function SettingsPage() {
  const [settings, courses] = await Promise.all([loadSettings(), getCourses()]);
  // Ids rather than labels: "NVIDIA NIM → Google Gemini → OpenRouter" does
  // not fit the 300px box, and the ids are the names the env variables use.
  const providers = resolveProviders().map((p) => ({ id: p.id, label: `${p.label} (${p.model})` }));
  return (
    <div data-layout="app" className="flex max-w-[852px] flex-col gap-4">
      <h1 className="font-display text-[28px] leading-tight font-bold text-text">Settings</h1>
      <SettingsForm settings={settings} providers={providers} topicIds={getAllTopicIds(courses)} />
    </div>
  );
}
