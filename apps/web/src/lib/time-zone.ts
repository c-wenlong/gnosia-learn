import "server-only";

/**
 * The zone a "day" is counted in. The implementation lives in
 * `@self-learn/tutor/server/time-zone`, beside the sidecar turns that also
 * print day keys; this file only keeps the `@/lib/time-zone` path working.
 */
export { appTimeZone } from "@self-learn/tutor/server/time-zone";
