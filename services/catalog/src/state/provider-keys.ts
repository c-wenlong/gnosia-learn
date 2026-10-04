import { isProviderName, type ProviderName, providerKey } from "@self-learn/schema";
import { and, asc, eq, sql } from "drizzle-orm";

import type { CatalogDatabase } from "../db";
import { StateError } from "./errors";
import { ensureLearner } from "./learner";
import { bytewise } from "../sql-order";

/**
 * An owner's own model provider keys (docs/BYOK.md), as sealed bytes.
 *
 * Nothing here encrypts or decrypts. The web app seals a key with a key it
 * derives from `AUTH_SECRET` and hands this module the result; this module
 * stores and returns bytes, so the catalog, its CLI and its tests never hold
 * anything that opens them.
 *
 * **The one door to `provider_key`.** No other file reads or writes the
 * table, and `test/provider-keys.test.ts` fails one that does: that is what
 * keeps the keys out of `catalog export`, the nightly export, `learn vault
 * pull` and the learner export, none of which can reach a table they never
 * name.
 *
 * Every function takes the owner and has no default, unlike the learner state
 * functions beside it: a secret read or written for `local` by omission is
 * the one mistake this table cannot afford.
 */

/** A key as the web app sealed it. */
export interface SealedProviderKey {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: number;
  /** The key's last four characters, the only part stored in the clear. */
  last4: string;
}

export interface StoredProviderKey extends SealedProviderKey {
  provider: ProviderName;
  createdAt: Date;
  updatedAt: Date;
}

function provider(value: string): ProviderName {
  if (!isProviderName(value)) throw new StateError(`"${value}" is not a model provider.`);
  return value;
}

/** Every key this owner saved, in no particular order the caller should rely on. */
export async function readProviderKeys(db: CatalogDatabase, owner: string): Promise<StoredProviderKey[]> {
  const rows = await db
    .select()
    .from(providerKey)
    .where(eq(providerKey.ownerId, owner))
    .orderBy(asc(bytewise(providerKey.provider)));
  return rows.flatMap((row) =>
    isProviderName(row.provider)
      ? [
          {
            provider: row.provider,
            ciphertext: row.ciphertext,
            iv: row.iv,
            authTag: row.authTag,
            keyVersion: row.keyVersion,
            last4: row.last4,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          },
        ]
      : [],
  );
}

/**
 * Save this owner's key for one provider, replacing any they had. Returns
 * when the row says it was written; `createdAt` survives a replace.
 */
export async function writeProviderKey(
  db: CatalogDatabase,
  owner: string,
  name: string,
  sealed: SealedProviderKey,
): Promise<{ createdAt: Date; updatedAt: Date }> {
  const id = provider(name);
  await ensureLearner(db, owner);
  const [row] = await db
    .insert(providerKey)
    .values({ ownerId: owner, provider: id, ...sealed })
    .onConflictDoUpdate({
      target: [providerKey.ownerId, providerKey.provider],
      set: {
        ciphertext: sql`excluded.ciphertext`,
        iv: sql`excluded.iv`,
        authTag: sql`excluded.auth_tag`,
        keyVersion: sql`excluded.key_version`,
        last4: sql`excluded.last4`,
        updatedAt: sql`now()`,
      },
    })
    .returning({ createdAt: providerKey.createdAt, updatedAt: providerKey.updatedAt });
  if (row === undefined) throw new StateError(`the ${id} key was not stored.`);
  return row;
}

/** Remove this owner's key for one provider. True when there was one. */
export async function deleteProviderKey(db: CatalogDatabase, owner: string, name: string): Promise<boolean> {
  const id = provider(name);
  const removed = await db
    .delete(providerKey)
    .where(and(eq(providerKey.ownerId, owner), eq(providerKey.provider, id)))
    .returning({ provider: providerKey.provider });
  return removed.length > 0;
}
