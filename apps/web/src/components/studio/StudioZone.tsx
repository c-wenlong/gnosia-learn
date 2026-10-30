"use client";

import { createContext, useContext } from "react";
import { dayAndTime, dayText, relativeTime } from "@/lib/studio-grid";

/**
 * The zone the studio counts days in: `appTimeZone()`, read once by the
 * studio's server layout and handed down. A client component that formatted a
 * time with its own zone would say one thing in the server's HTML and another
 * once the browser took over, and would disagree with the Library, which counts
 * days in the app zone. Undefined (the default, and a test with no provider)
 * means the runtime's own zone.
 */
const ZoneContext = createContext<string | undefined>(undefined);

export function StudioZone({ timeZone, children }: { timeZone?: string | undefined; children?: React.ReactNode }) {
  return <ZoneContext.Provider value={timeZone}>{children}</ZoneContext.Provider>;
}

/** The studio's zone, for `relativeTime`, `dayText` and `dayAndTime`. */
export function useStudioZone(): string | undefined {
  return useContext(ZoneContext);
}

/**
 * A time as the studio words it, in the studio's zone: "ago" is
 * `relativeTime` ("2 hours ago", "Yesterday", "3 Oct"), "day" is `dayText`
 * and "dayTime" is `dayAndTime` ("30 Sept, 04:25").
 */
export function StudioTime({ at, as = "ago" }: { at: string | null; as?: "ago" | "day" | "dayTime" }) {
  const zone = useStudioZone();
  return <>{as === "ago" ? relativeTime(at, undefined, zone) : as === "day" ? dayText(at, undefined, zone) : dayAndTime(at, undefined, zone)}</>;
}
