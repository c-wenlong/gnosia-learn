import type { TestProject } from "vitest/node";

import { createMigratedTemplate, dropDatabase, probe } from "./scratch-database";

/**
 * vitest's global setup: migrates one template database for the whole run,
 * which `migratedScratchDatabase` clones for each suite that wants every
 * migration applied, and drops it when the run ends. With no Postgres there is
 * no template, and each suite skips itself as it always did.
 */
export default async function setup(project: TestProject): Promise<(() => Promise<void>) | void> {
  if (!(await probe()).ok) {
    project.provide("catalogTemplate", null);
    return;
  }
  const template = await createMigratedTemplate();
  project.provide("catalogTemplate", template);
  return () => dropDatabase(template);
}
