/**
 * A row, card or heading that arrives (a tab, a filter, a page of older rows)
 * fades in. One class string for the server-drawn rows (`library-view`) and
 * the client list (`LibraryResults`); a plain module, since a constant
 * exported from a `"use client"` file is a client reference on the server.
 */
export const ARRIVE = "animate-fade-in motion-reduce:animate-none";
