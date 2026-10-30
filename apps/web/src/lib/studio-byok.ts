import { call } from "@/lib/studio-client";

/**
 * The BYOK settings calls (D93, D94): the providers a `qwen` turn may run on,
 * their tiers and the active one. Never a key back. Browser-side, through
 * the studio proxy, like the draft calls.
 */

/** One connected BYOK provider as the API reports it: tiers and a key tail, never the key. */
export interface ByokProviderStatus {
  provider: string;
  last4: string;
  models: { default?: string; lite?: string; max?: string };
  /** Its key is not saved in Settings or no longer opens: listed for its tiers, but it cannot run. */
  keyMissing?: true;
}

/** `GET /api/settings/byok`'s answer: the connected providers, the active one, its Default model, and why the saved keys cannot be read (or null). */
export interface ByokSettingsView {
  configured: boolean;
  active: string | null;
  model: string | null;
  providers: ByokProviderStatus[];
  /** The runner's reason it cannot open the keys saved in Settings (no AUTH_SECRET, no catalog), or null. */
  error?: string | null;
}

/** The runner's settings as a server page read them before rendering, or that it was not answering. */
export type ByokInitial = { state: "up"; data: ByokSettingsView } | { state: "down" };

/** Window event a successful BYOK write fires, so open composers and panes re-read the tiers (D94). */
export const BYOK_SETTINGS_CHANGED = "gnosia:byok-settings";

function announceByokWrite<T>(result: Promise<T>): Promise<T> {
  void result.then((outcome) => {
    if (typeof window !== "undefined" && (outcome as { ok?: boolean }).ok === true) {
      window.dispatchEvent(new Event(BYOK_SETTINGS_CHANGED));
    }
  });
  return result;
}

/** The active BYOK provider's Default model and its tier models (D94). */
export interface ByokTiers {
  model: string | null;
  tiers: ByokProviderStatus["models"];
}

/**
 * The active provider's Default model and tier models from a settings read,
 * or null when nothing is configured (no Default model, or a key that is
 * missing or no longer opens): a conversation then offers no BYOK tier to
 * pick, since a turn on one would be refused. The one reading of a settings
 * answer's tiers: the composer's hook (`useByokTiers`) and the
 * conversation's (`useStudioHealth`) both go through it.
 */
export function activeByokTiers(view: ByokSettingsView): ByokTiers | null {
  const entry = view.configured ? view.providers.find((provider) => provider.provider === view.active) : undefined;
  return entry === undefined ? null : { model: view.model, tiers: entry.models };
}

/** `GET /api/settings/byok`: the connected providers, the active one, and its Default model. Never a key. */
export function getByokSettings() {
  return call<ByokSettingsView>("/studio/api/settings/byok");
}

/** `DELETE /api/settings/byok` (D94): Studio stops using a provider — its tiers and the active pick go; its key stays saved in Settings. */
export function removeByokProvider(provider: string) {
  return announceByokWrite(
    call<ByokSettingsView>("/studio/api/settings/byok", {
      method: "DELETE",
      body: JSON.stringify({ provider }),
    }),
  );
}

/** `PUT /api/settings/byok/active` (D94): which connected provider a `byok` turn runs on. */
export function setByokActive(provider: string) {
  return announceByokWrite(
    call<ByokSettingsView>("/studio/api/settings/byok/active", {
      method: "PUT",
      body: JSON.stringify({ provider }),
    }),
  );
}

/** `PUT /api/settings/byok/models` (D94): a connected provider's tier picks; omitted keeps, empty clears. */
export function saveByokModels(provider: string, models: { default?: string; lite?: string; max?: string }) {
  return announceByokWrite(
    call<ByokSettingsView>("/studio/api/settings/byok/models", {
      method: "PUT",
      body: JSON.stringify({ provider, models }),
    }),
  );
}

/**
 * `POST /api/settings/byok/models` (D93): the provider's own model list, on
 * the key typed into the dialog or the stored one when the field was left
 * blank (the runner opens the one saved in Settings). The key rides the POST
 * body, never a URL.
 */
export function listByokModels(provider: string, apiKey?: string) {
  return call<{ models: { value: string; label: string | null }[] }>("/studio/api/settings/byok/models", {
    method: "POST",
    body: JSON.stringify(apiKey === undefined || apiKey === "" ? { provider } : { provider, apiKey }),
  });
}
