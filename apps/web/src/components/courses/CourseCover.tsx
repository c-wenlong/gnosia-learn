"use client";

import Image from "next/image";
import { useState } from "react";

import { Placeholder } from "@/components/ui/Placeholder";

/**
 * A course card's cover: the photo when the course has one and it loads, the
 * course code in a `Placeholder` otherwise.
 *
 * **A cover that fails to load falls back to the placeholder.** The page links
 * a cover whenever the database says the course has one, but the bytes are in
 * the blob store, and a deployment that reads the database without that store
 * (the deployed app, until the cloud adapter arrives) gets a 404 from the
 * cover route. Left alone that is a broken-image box in the card; with this it
 * is the same placeholder a course with no cover shows. The parent holds the
 * 16:9 frame and both fill it, so the swap moves nothing on the page. The
 * failure is remembered per `src`, so a new cover gets its own try.
 *
 * `next/image` replays an error that landed before hydration (it sets the
 * `src` again once mounted), so a server-rendered image that already failed
 * still reaches `onError`.
 *
 * `unoptimized`: the cover route needs the session cookie, and Next's image
 * optimizer fetches its source server-side without forwarding any header, so
 * it would get the proxy's 401. The image is stored at the card's size
 * already (960x540), so there is little to gain.
 */
export function CourseCover({ src, code }: { src: string | null; code: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (src === null || failed === src) {
    return <Placeholder label={code} height="100%" className="rounded-none text-[13px]" />;
  }
  return <Image src={src} alt="" fill unoptimized className="object-cover" onError={() => setFailed(src)} />;
}
