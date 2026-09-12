/**
 * A refusal to index, rather than a crash.
 *
 * The distinction the CLI cares about: an `IndexError` is the content being
 * wrong (a slug that resolves to nothing, a duplicate mapping, a malformed
 * file) and its message is written for the person who has to fix the file. Any
 * other error is the catalog itself being wrong — a bug, a database that is not
 * there — and deserves a stack trace.
 *
 * Every one of these exists because the alternative was skipping the row.
 * A skipped row is a video, a note or a course module that is simply absent
 * from the catalog, with nothing anywhere saying so; the audit in issue #27
 * recorded exactly that failure happening once already.
 */
export class IndexError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IndexError";
  }
}

/**
 * Collects several refusals before throwing, so one run reports every
 * unresolved slug rather than the first. Fixing them one error per run is the
 * difference between one edit and thirty.
 */
export class IndexErrors {
  private readonly problems: string[] = [];

  add(message: string): void {
    this.problems.push(message);
  }

  get length(): number {
    return this.problems.length;
  }

  /** Throws if anything was collected. `heading` names what was being indexed. */
  throwIfAny(heading: string): void {
    if (this.problems.length === 0) return;
    const lines = this.problems.map((p) => `  - ${p}`).join("\n");
    throw new IndexError(
      `${heading}: ${this.problems.length} unresolved reference${
        this.problems.length === 1 ? "" : "s"
      }\n${lines}`,
    );
  }
}
