"use client";

import { useState } from "react";

/**
 * A small preview for an asset row in the workspace's Assets card: a video's
 * poster or the diagram itself. A picture that fails to load falls back to the
 * plain tile the row already is, with no failure panel: the row still names
 * the asset and links to its page, which says why a file will not load.
 */
export function AssetThumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (src === null || failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- the asset route serves the bytes; next/image would proxy a local file for nothing
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-8 w-12 shrink-0 rounded-md bg-surface object-cover"
    />
  );
}
