/**
 * Obsidian callout rendering for the live session log.
 *
 * The log is the interface. While a session runs, the learner has this file
 * open, and what they see there is the session: the question as it was asked,
 * what they answered, their own reasoning, and why the other options were
 * wrong. A log written only at the end is a summary of something they already
 * sat through, which is worth much less.
 *
 * Callout syntax is Obsidian's: `> [!type] Title`, with every following line
 * of the block prefixed by `>`. LaTeX passes through untouched, since Obsidian
 * renders $inline$ and $$display$$ natively.
 */

/** Prefix every line for a callout body, including blank ones. */
function quote(text) {
  return String(text)
    .replace(/\s+$/, "")
    .split("\n")
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");
}

export function callout(type, title, body) {
  return `> [!${type}] ${title}\n${quote(body)}`;
}

/**
 * The question exactly as it was put to the learner, options included, so
 * the log shows what was actually asked rather than a paraphrase.
 */
export function renderQuestion(question, options = []) {
  const numbered = options.map((opt, i) => `${i + 1}. ${opt}`).join("\n");
  return callout("question", "Quiz", numbered ? `${question}\n\n${numbered}` : question);
}

/**
 * The outcome. `note` carries the learner's own words, which are worth more
 * than the tutor's paraphrase when the note is reread months later.
 */
export function renderResult({
  correct,
  chosen = "",
  answer = "",
  note = "",
  explain = "",
}) {
  const lines = [];
  if (chosen) lines.push(`**You answered:** ${chosen}`);
  if (answer) lines.push(`**Answer:** ${answer}`);
  if (note) lines.push("", `**In your words:** ${note}`);
  if (explain) lines.push("", explain);

  return callout(
    correct ? "success" : "failure",
    correct ? "Correct" : "Not quite",
    lines.join("\n").trim() || (correct ? "Correct." : "Incorrect."),
  );
}

/** Tutor narration between questions. */
export function renderNarration(text) {
  return String(text).replace(/\s+$/, "");
}

/** A taught step, so the explanation survives outside the chat. */
export function renderStep(title, body) {
  return `### ${title}\n\n${String(body).replace(/\s+$/, "")}`;
}

/** Embed a generated diagram the Obsidian way. */
export function renderEmbed(filename, caption = "") {
  return caption ? `![[${filename}]]\n*${caption}*` : `![[${filename}]]`;
}
