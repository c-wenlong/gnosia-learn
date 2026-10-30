import { PROVIDER_IDS, PROVIDER_KEY_LIMITS } from "@gnosia/schema/shared";

import { keyFor, type SavedKeys } from "../providers";
import type { Env } from "./deps";

/**
 * Whether a model id holds a whole API key the owner's tutor could call with,
 * saved or server, for any provider (docs/TUTOR-MODELS.md, T11). The chain
 * write routes, the web app's and the sidecar's, refuse such an id, since a
 * chain row is stored in the clear and exported.
 *
 * Only a whole key counts. Refused or accepted is an answer the caller sees,
 * so the question must be one only the key's holder can ask: "does this id
 * hold my key" is one, while "is this id part of my key", which the routes
 * asked until 2026-10-30, let a session walk a key out one character at a
 * time. A pasted fragment of key material is `checkModelId`'s to refuse, by
 * its shape alone. A key shorter than `PROVIDER_KEY_LIMITS.minChars` (no
 * saved key is; a server key could be) is not compared, because a short key
 * inside a 200-character id could be found by guessing.
 */
export function echoesKey(model: string, saved: SavedKeys, env: Env = process.env): boolean {
  // The server's keys come through `keyFor`; every saved key is checked as
  // well, a custom provider's included, which `PROVIDER_IDS` does not name.
  const keys = [
    ...PROVIDER_IDS.flatMap((id) => {
      const key = keyFor(id, saved, env);
      return key === null ? [] : [key.apiKey];
    }),
    ...Object.values(saved).filter((key): key is string => typeof key === "string"),
  ];
  return keys.some((key) => key.length >= PROVIDER_KEY_LIMITS.minChars && model.includes(key));
}
