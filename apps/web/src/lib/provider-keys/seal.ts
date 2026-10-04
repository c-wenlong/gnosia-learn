import "server-only";

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { PROVIDER_KEY_LIMITS, type ProviderName } from "@self-learn/schema/shared";

import { MIN_SECRET_LENGTH } from "@/lib/auth/core";

/**
 * Sealing and opening an owner's provider key (docs/BYOK.md, decision 2).
 *
 * AES-256-GCM. The 256-bit key comes from HKDF-SHA256 over `AUTH_SECRET`
 * with a fixed salt and an info string naming the version, so this needs no
 * variable of its own, and a later version can derive from a dedicated secret
 * without touching the rows version 1 wrote. Every seal draws a fresh 96-bit
 * nonce. The additional data binds the ciphertext to its owner, provider and
 * version: a row copied onto another owner, or relabelled as another provider,
 * fails its tag rather than decrypting.
 *
 * Pure apart from the random nonce: the secret comes in as an argument, so
 * the tests run it with a secret of their own and nothing here reads the
 * environment. Server only, because a client bundle has no business holding
 * the thing that opens a key.
 */

/** The version `sealKey` writes. */
export const CURRENT_KEY_VERSION = 1;

const SALT = "gnosia/provider-key";
const IV_BYTES = 12;
const KEY_BYTES = 32;
/**
 * Fixed on both sides. Node's decipher otherwise accepts any tag from 4 to 16
 * bytes, so a row holding the first 4 bytes of the real tag would still open:
 * a forgery needing 2^32 tries instead of 2^128. The CHECK on `auth_tag`
 * says 16 as well.
 */
const TAG_BYTES = 16;

/** The encryption key for one version, or null for a version this build cannot derive. */
function deriveKey(secret: string, version: number): Buffer | null {
  // Version 1: HKDF over AUTH_SECRET. A dedicated secret would be version 2,
  // read here, with version 1 still derivable while its rows are re-saved.
  // The floor sign-in enforces (`readAuthConfig`), held here too so a short
  // secret can never seal or open a key, whoever calls this.
  if (version !== 1 || secret.length < MIN_SECRET_LENGTH) return null;
  return Buffer.from(hkdfSync("sha256", secret, SALT, `gnosia/provider-key/v${version}`, KEY_BYTES));
}

/** What the tag vouches for besides the ciphertext. JSON, so no owner id can forge a separator. */
function additionalData(owner: string, provider: ProviderName, version: number): Buffer {
  return Buffer.from(JSON.stringify(["gnosia/provider-key", version, owner, provider]), "utf8");
}

export interface Sealed {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: number;
  last4: string;
}

export interface SealContext {
  /** `AUTH_SECRET`. */
  secret: string;
  owner: string;
  provider: ProviderName;
}

/** Encrypt a key that has already passed `checkKeyShape`. */
export function sealKey(plaintext: string, { secret, owner, provider }: SealContext): Sealed {
  const key = deriveKey(secret, CURRENT_KEY_VERSION);
  if (key === null) throw new Error("provider keys cannot be sealed without AUTH_SECRET");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(additionalData(owner, provider, CURRENT_KEY_VERSION));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext, iv, authTag: cipher.getAuthTag(), keyVersion: CURRENT_KEY_VERSION, last4: plaintext.slice(-4) };
}

/**
 * Decrypt a stored key, or null when it cannot be: a rotated `AUTH_SECRET`,
 * a version this build does not know, a row moved to another owner or
 * provider, or bytes that were changed. All of them mean the same thing to
 * the caller, "treat this key as missing and ask for it again", so none of
 * them throws.
 */
export function openKey(
  sealed: Pick<Sealed, "ciphertext" | "iv" | "authTag" | "keyVersion">,
  { secret, owner, provider }: SealContext,
): string | null {
  try {
    const key = deriveKey(secret, sealed.keyVersion);
    if (key === null || sealed.iv.length !== IV_BYTES || sealed.authTag.length !== TAG_BYTES) return null;
    const decipher = createDecipheriv("aes-256-gcm", key, sealed.iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(additionalData(owner, provider, sealed.keyVersion));
    decipher.setAuthTag(sealed.authTag);
    return Buffer.concat([decipher.update(sealed.ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export type KeyShape = { ok: true; key: string } | { ok: false; reason: string };

/**
 * The only check a save makes (decision 5): the Test button is the real one.
 * Surrounding whitespace is dropped, since a pasted key often carries a
 * newline; anything else outside printable ASCII is refused, because every
 * provider's key is ASCII and a header holding anything else throws inside
 * `fetch` on every tutor turn.
 */
export function checkKeyShape(raw: unknown): KeyShape {
  if (typeof raw !== "string") return { ok: false, reason: "The key must be text." };
  const key = raw.trim();
  if (key.length === 0) return { ok: false, reason: "Paste a key first." };
  if (key.length > PROVIDER_KEY_LIMITS.maxChars) {
    return { ok: false, reason: `That is longer than any provider key (${PROVIDER_KEY_LIMITS.maxChars} characters at most).` };
  }
  if (!/^[\x21-\x7e]+$/.test(key)) {
    return { ok: false, reason: "A key has no spaces, line breaks or characters outside plain ASCII. Check what was pasted." };
  }
  if (key.length < PROVIDER_KEY_LIMITS.minChars) {
    return { ok: false, reason: `That is shorter than any provider key (${PROVIDER_KEY_LIMITS.minChars} characters at least).` };
  }
  return { ok: true, key };
}
