/**
 * Told after every write that changes what the grid lists or what health
 * reports: a diagram, a video or a topic landing. The runner keeps its lists
 * (`listings.ts`), vocabulary status (`brief.ts`) and catalog probe
 * (`health-probes.ts`) and drops them here, so the next read after a write
 * this studio made queries the catalog again rather than serving the state from
 * before it. A listener is told whether the write took or not: a refused write
 * costs one fresh read.
 */
const writeListeners = new Set<() => void>();

export function onCatalogWrite(listener: () => void): () => void {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

export function notifyCatalogWrite(): void {
  for (const listener of writeListeners) listener();
}
