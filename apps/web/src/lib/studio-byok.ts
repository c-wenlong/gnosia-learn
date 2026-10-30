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
}

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

/** `GET /api/settings/byok`: the connected providers, the active one, and its Default model. Never a key. */
export function getByokSettings() {
  return call<{ configured: boolean; active: string | null; model: string | null; providers: ByokProviderStatus[] }>("/studio/api/settings/byok");
}

/** `DELETE /api/settings/byok` (D94): unhook a provider — its key, tiers and the active pick go with it. */
export function removeByokProvider(provider: string) {
  return announceByokWrite(
    call<{ configured: boolean; active: string | null; model: string | null; providers: ByokProviderStatus[] }>("/studio/api/settings/byok", {
      method: "DELETE",
      body: JSON.stringify({ provider }),
    }),
  );
}

/** `PUT /api/settings/byok/active` (D94): which connected provider a `byok` turn runs on. */
export function setByokActive(provider: string) {
  return announceByokWrite(
    call<{ configured: boolean; active: string | null; model: string | null; providers: ByokProviderStatus[] }>("/studio/api/settings/byok/active", {
      method: "PUT",
      body: JSON.stringify({ provider }),
    }),
  );
}

/** `PUT /api/settings/byok/models` (D94): a connected provider's tier picks; omitted keeps, empty clears. */
export function saveByokModels(provider: string, models: { default?: string; lite?: string; max?: string }) {
  return announceByokWrite(
    call<{ configured: boolean; active: string | null; model: string | null; providers: ByokProviderStatus[] }>("/studio/api/settings/byok/models", {
      method: "PUT",
      body: JSON.stringify({ provider, models }),
    }),
  );
}

/**
 * `POST /api/settings/byok/models` (D93): the provider's own model list, on
 * the key typed into the dialog or the stored one when the field was left
 * blank. The key rides the POST body, never a URL.
 */
export function listByokModels(provider: string, apiKey?: string) {
  return call<{ models: { value: string; label: string | null }[] }>("/studio/api/settings/byok/models", {
    method: "POST",
    body: JSON.stringify(apiKey === undefined || apiKey === "" ? { provider } : { provider, apiKey }),
  });
}
