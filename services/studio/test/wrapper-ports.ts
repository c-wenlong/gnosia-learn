import { randomInt } from "node:crypto";

import { freePair, JOB_PORTS } from "../src/video/ports";

/**
 * The port pair a wrapper suite's fake job renders on: the first free pair
 * from a random start, inside a half of the jobs' range that is the tool's
 * own.
 *
 * A Chrome tool's wrapper checks its job's two ports before a `still` or a
 * `build`, and refuses with exit 3, running nothing, when either is held.
 * Each wrapper suite holds its own pair's second port on purpose to see that
 * refusal. Both suites used to search from 47900, so whenever two of them ran
 * at once (`video-revideokc.test.ts` beside `video-remotionkc.test.ts` in
 * parallel workers, or another checkout's `npm test` on the same machine) both
 * took 47900 and 47901, and one suite's held port made the other's `still` or
 * `build` refuse: an empty list of sandbox calls, read as a missing `argv` or
 * an empty `rendered`. Measured on 2026-10-04: 3 runs in 60 of the two files
 * failed that way, and with only the files given starts of their own, 2 in
 * 40 still did, on 47901 held from outside the run.
 *
 * So the halves keep the two suites of one run apart, and the random start
 * keeps two runs apart: a second run lands on the same pair one time in 500,
 * and even then only fails if its hold falls inside the other's render.
 * A new tool's wrapper suite takes a range here, never a copy of another's.
 */
export const WRAPPER_PORT_RANGES = {
  revideokc: { first: JOB_PORTS.first, last: 47998 },
  remotionkc: { first: 48000, last: JOB_PORTS.last },
} as const;

export function wrapperPorts(tool: keyof typeof WRAPPER_PORT_RANGES): Promise<number> {
  const range = WRAPPER_PORT_RANGES[tool];
  const pairs = (range.last - range.first) / 2 + 1;
  return freePair(range, range.first + randomInt(pairs) * 2);
}
