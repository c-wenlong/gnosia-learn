import type { ReactNode } from "react";

/**
 * A section's heading inside the concept workspace's side panels: Summary,
 * Prerequisites and the rest in Note and sources (`NoteAndSources`), Checks,
 * Assets and Neighbourhood on the cards beside the chat (`StudioCards`). An
 * `h3` at 13px bold, so the two sides of the workspace read alike.
 */
export function WorkspaceHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-[13px] font-bold text-text">{children}</h3>;
}
