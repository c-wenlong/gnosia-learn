import type { Metadata } from "next";
import { headers } from "next/headers";

import { PAGE_ENTER } from "@/components/PageLoading";
import { ModelSelection } from "@/components/settings/ModelSelection";
import { Providers } from "@/components/settings/Providers";
import { DataSettings, GeneralSettings, ProfileSettings } from "@/components/settings/SettingsForm";
import { SettingsTabs } from "@/components/settings/SettingsTabs";
import { ShortcutsCard } from "@/components/settings/ShortcutsCard";
import { cx, PAGE_TITLE } from "@/components/ui/classes";
import { getAllTopicIds, getCourses } from "@/data/courses";
import { currentOwner } from "@/lib/owner";
import { loadProviderKeys } from "@/lib/provider-keys/settings";
import { loadSettings } from "@/lib/settings";
import { TUTOR_TO_BYOK } from "@/lib/byok-providers";
import { providersView } from "@/lib/providers/view";
import { isMacUserAgent } from "@/lib/shortcuts";
import { studioApi, studioEnabled } from "@/lib/studio";
import type { ByokInitial, ByokSettingsView } from "@/lib/studio-byok";
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
 * The Models tab is two cards: Providers lists every provider with its
 * key's state (docs/BYOK.md, saved through `/api/learner/provider-key`,
 * handed to the card as its last four characters and date, never the key),
 * and Model selection picks the model the tutor calls and, when the studio
 * is on, the provider Studio chats run on.
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
  const studio = studioEnabled();
  const [settings, courses, keys, request, models, byok] = await Promise.all([
    loadSettings(),
    getCourses(),
    loadProviderKeys(owner),
    headers(),
    loadTutorModels(owner),
    studio ? studioByok() : Promise.resolve(undefined),
  ]);
  const mac = isMacUserAgent(request.get("user-agent"));
  const view = providersView(keys, models.chain, models.reachable);
  return (
    <div data-layout="app" className={cx("flex max-w-[1084px] flex-col gap-4", PAGE_ENTER)}>
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
            id: "models",
            label: "Models",
            glyph: "sparkle",
            content: (
              <>
                <Providers view={view} studio={studio} />
                <ModelSelection
                  view={view}
                  studio={studio}
                  byok={byok}
                  chain={models.chain}
                  tutorStyle={settings.tutorStyle}
                  savedForTutor={keys.rows
                    .filter((row) => row.saved?.readable === true)
                    .flatMap((row) => {
                      const preset = TUTOR_TO_BYOK[row.id];
                      return preset === undefined ? [] : [preset];
                    })}
                />
              </>
            ),
          },
          { id: "data", label: "Data", glyph: "data", content: <DataSettings settings={settings} topicIds={getAllTopicIds(courses)} /> },
        ]}
      />
    </div>
  );
}

/**
 * Studio's BYOK settings, read here so the Model selection card starts from
 * them: `down` when nothing listens on the runner's port, which the card
 * shows as such instead of sending a request from the browser that the
 * console would log as a failed 502. Any other refusal is left for the card
 * to read itself, and say.
 */
async function studioByok(): Promise<ByokInitial | undefined> {
  const result = await studioApi<ByokSettingsView>("/api/settings/byok", { timeoutMs: 5_000 });
  if (result.ok) return { state: "up", data: result.data };
  return result.reason === "down" ? { state: "down" } : undefined;
}
