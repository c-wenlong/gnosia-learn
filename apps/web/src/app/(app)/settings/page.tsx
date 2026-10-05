import type { Metadata } from "next";
import { headers } from "next/headers";

import { PAGE_ENTER } from "@/components/PageLoading";
import { Providers } from "@/components/settings/Providers";
import { DataSettings, GeneralSettings, ProfileSettings, TutorSettings } from "@/components/settings/SettingsForm";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { ShortcutsCard } from "@/components/settings/ShortcutsCard";
import { PAGE_TITLE } from "@/components/ui/classes";
import { getAllTopicIds, getCourses } from "@/data/courses";
import { currentOwner } from "@/lib/owner";
import { loadProviderKeys } from "@/lib/provider-keys/settings";
import { loadSettings } from "@/lib/settings";
import { providersView } from "@/lib/providers/view";
import { isMacUserAgent } from "@/lib/shortcuts";
import { loadTutorModels } from "@/lib/tutor-models/settings";

export const metadata: Metadata = { title: "Settings" };

/**
 * Settings (hi-fi 12): how the app looks and how the tutor talks, and the
 * model underneath, read-only, with the export and the reset. The hi-fi's
 * Habit card (daily target, streak leeway) went with the habit layer (H1 of
 * docs/proposals/home-page.md).
 *
 * The server reads what is stored and what only the server knows (the BKT
 * parameters, which providers have a key); the cards in `SettingsForm.tsx` write through
 * `/api/learner/preference` one field at a time.
 *
 * The Providers card (docs/TUTOR-MODELS.md, T12) is the owner's model
 * providers: each one's key (docs/BYOK.md, saved through
 * `/api/learner/provider-key`, handed to the card as its last four characters
 * and date, never the key) and its models, the chain that replaces the
 * built-in defaults once it holds a model.
 *
 * The cards are grouped into tabs (General, Profile, Tutor, Data) so the page
 * is one short group at a time; `?tab=` opens one, read by `SettingsTabs`.
 *
 * General ends with the Shortcuts card (`ShortcutsCard`, after Manus's
 * Settings, Shortcuts pane), drawn with ⌘ or Ctrl as the request's user
 * agent says, so the first paint matches the browser's.
 */
export default async function SettingsPage() {
  const owner = await currentOwner();
  const [settings, courses, keys, request] = await Promise.all([loadSettings(), getCourses(), loadProviderKeys(owner), headers()]);
  const mac = isMacUserAgent(request.get("user-agent"));
  const models = await loadTutorModels(owner, keys);
  // Ids rather than labels: "NVIDIA NIM → Google Gemini → OpenRouter" does
  // not fit the 300px box. Each says whose key it is. With a model chain, the
  // chain's entries that have a key, by model id, in the order tried.
  const keyed = new Map(models.providers.map((p) => [p.id, p]));
  const providers =
    models.chain.length > 0
      ? models.chain.flatMap((entry) => {
          const provider = keyed.get(entry.provider);
          return provider?.key ? [{ id: entry.model, label: `${provider.label} ${entry.model}`, source: provider.key }] : [];
        })
      : keys.order.map((p) => ({ id: p.id, label: p.label, source: p.source }));
  return (
    <div data-layout="app" className={`flex max-w-[1084px] flex-col gap-4 ${PAGE_ENTER}`}>
      <h1 className={PAGE_TITLE}>Settings</h1>
      <SettingsTabs
        sections={[
          {
            id: "general",
            label: "General",
            glyph: "sliders",
            content: (
              <>
                <GeneralSettings settings={settings} />
                <ShortcutsCard macGuess={mac} />
              </>
            ),
          },
          { id: "profile", label: "Profile", glyph: "person", content: <ProfileSettings /> },
          {
            id: "tutor",
            label: "Tutor",
            glyph: "chat",
            content: (
              <>
                <TutorSettings settings={settings} providers={providers} chain={models.chain.length > 0} />
                <Providers view={providersView(keys, models.chain, models.reachable)} />
              </>
            ),
          },
          { id: "data", label: "Data", glyph: "data", content: <DataSettings settings={settings} topicIds={getAllTopicIds(courses)} /> },
        ]}
      />
    </div>
  );
}
