/**
 * What a studio conversation is called, on every page that shows one: the
 * sidebar's rows and its search, Home's threads, Recent, and the studio's own
 * conversation header. One rule, so a conversation the owner renamed reads
 * the same wherever it appears.
 *
 * In order: the name the owner gave it (`draft.name`, set with Rename), the
 * planner's title (its latest brief's), the concept a hand-off from the tutor
 * opened it on, and the person's first message. A page that has only some of
 * these (the catalog's `draft` row has no first message) passes what it has.
 *
 * Pure and React-free, so the server, the browser and a test call the same
 * function.
 */

export interface ConversationWords {
  name?: string | null;
  title?: string | null;
  concept?: { title?: string | null } | null;
  firstMessage?: string | null;
}

export interface ConversationTitle {
  text: string;
  /** True when the text is the person's own words (their first message) rather than a name or a title. */
  quoted: boolean;
  /** Which of the words it is. */
  from: "name" | "title" | "concept" | "first-message";
}

function visible(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}

/** The conversation's title by the rule above, trimmed; null when it has none of the four. */
export function conversationTitle(words: ConversationWords): ConversationTitle | null {
  const name = visible(words.name);
  if (name !== null) return { text: name, quoted: false, from: "name" };
  const title = visible(words.title);
  if (title !== null) return { text: title, quoted: false, from: "title" };
  const concept = visible(words.concept?.title);
  if (concept !== null) return { text: concept, quoted: false, from: "concept" };
  const first = visible(words.firstMessage);
  if (first !== null) return { text: first, quoted: true, from: "first-message" };
  return null;
}
