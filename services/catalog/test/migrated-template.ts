import type { TestProject } from "vitest/node";

import { createMigratedTemplate, dropDatabase, probe } from "./scratch-database";

/**
 * vitest's global setup: migrates one template database for the whole run,
 * which `migratedScratchDatabase` clones for each suite that wants every
 * migration applied, and drops it when the run ends. With no Postgres there is
 * no template, and each suite skips itself as it always did.
 *
 * A template that cannot be made (a role without CREATEDB, a migration that
 * fails) is a warning here, never a failure: this runs before every test file
 * in the repository, most of which never touch a database. Without a template
 * each suite migrates its own database, and the ones that need it fail there,
 * on the same error, with the suite named.
 */
export default async function setup(project: TestProject): Promise<(() => Promise<void>) | void> {
  if (!(await probe()).ok) {
    project.provide("catalogTemplate", null);
    return;
  }
  let template: string;
  try {
    template = await createMigratedTemplate();
  } catch (error) {
    console.warn(`No migrated template database; each suite migrates its own. ${String(error)}`);
    project.provide("catalogTemplate", null);
    return;
  }
  project.provide("catalogTemplate", template);
  return () => dropDatabase(template);
}
