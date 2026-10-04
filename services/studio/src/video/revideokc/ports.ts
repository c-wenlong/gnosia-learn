/**
 * revideokc's ports (D76 of docs/STUDIO-VIDEO-TOOLS.md): Revideo starts one
 * Vite server per worker, on `REVIDEOKC_VITE_PORT` and the ports after it,
 * with `strictPort`. `still` uses one worker and `build` two, so a job's pair
 * is exactly its two Vite servers. The scheme, and the jobs' range, are every
 * Chrome tool's (`../ports.ts`); the doctor's range is revideokc's own.
 */
export { freePair, JOB_PORTS, jobPorts, jobPortStart, portFree } from "../ports";

/** The revideokc doctor's fixture takes a pair here, outside the jobs' range and the other doctors'. */
export const DOCTOR_PORTS = { first: 46990, last: 46998 } as const;
