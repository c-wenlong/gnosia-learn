import "server-only";

import { readPreferences } from "@self-learn/catalog/state";
import type { StudioAgentPreference } from "@self-learn/schema/shared";

import { catalogDatabase } from "@/lib/learner-store";
import { currentOwner } from "@/lib/owner";
import { AGENT_KEYS, storedAgent, type AgentKind } from "@/lib/studio-agent-settings";

/**
 * The two rows the studio's settings panel starts from (D53 of
 * docs/STUDIO-VIDEOS.md): the signed-in owner's `studioVideoAgent` and
 * `studioDiagramAgent` preferences, each read the way the runner reads it.
 *
 * A read, so it degrades as the Settings page's does: with the catalog down
 * the panel shows the defaults and says the choices cannot be saved.
 */
export interface StudioAgents {
  reachable: boolean;
  values: Record<AgentKind, StudioAgentPreference>;
}

export async function readStudioAgents(): Promise<StudioAgents> {
  const owner = await currentOwner();
  try {
    const db = await catalogDatabase();
    const stored = await readPreferences(db, owner);
    return {
      reachable: true,
      values: { video: storedAgent("video", stored[AGENT_KEYS.video]), diagram: storedAgent("diagram", stored[AGENT_KEYS.diagram]) },
    };
  } catch (error) {
    console.warn(`studio settings: preferences unavailable — ${error instanceof Error ? error.message : String(error)}`);
    return { reachable: false, values: { video: storedAgent("video", null), diagram: storedAgent("diagram", null) } };
  }
}
