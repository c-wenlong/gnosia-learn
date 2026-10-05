"use client";

import { createContext } from "react";

/**
 * Asks the Library for its next page of rows and resolves once they are on
 * screen: true when rows were added, false when there were none or the load
 * failed.
 */
export type MoreRows = () => Promise<boolean>;

/**
 * Where the Library's paged list (`LibraryResults`) leaves its loader for the
 * previewer around it (`Previewer`), so the panel's right arrow on the last
 * row drawn loads the next page and walks into it (L9 of
 * docs/proposals/library-by-type-and-day.md). A ref rather than state: the
 * previewer reads it when an arrow is pressed, and nothing re-renders when it
 * is set.
 */
export const LibraryMoreContext = createContext<{ current: MoreRows | null } | null>(null);
