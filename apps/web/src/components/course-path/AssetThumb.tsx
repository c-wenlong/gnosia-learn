"use client";

import { Placeholder } from "@/components/ui/Placeholder";
import { useAssetFailure } from "@/components/use-asset-failure";
import { ASSET_PROBLEMS } from "@/lib/asset-problems";

/**
 * The 72 by 48 picture beside an asset in the path's rail (kit `Placeholder`
 * at that size when there is nothing to show).
 *
 * A video's poster or the diagram itself when the file route can serve them,
 * the kind in words otherwise. A picture that fails to load falls back to the
 * same box, reading "unavailable", with the reason from the status route as
 * its tooltip: the rail has no room for the library's failure panel, but it
 * still says why rather than leaving a broken image.
 */
export function AssetThumb({
  src,
  statusHref,
  label,
  contain = false,
}: {
  src: string | null;
  statusHref: string | undefined;
  label: string;
  /** Fit the whole picture in, for a diagram; a poster fills the box. */
  contain?: boolean;
}) {
  const { failure, fail, observe } = useAssetFailure(src, statusHref);

  if (src && failure === null) {
    return (
      <span className="block h-12 w-[72px] shrink-0 overflow-hidden rounded-xl bg-surface2">
        {/* eslint-disable-next-line @next/next/no-img-element -- the poster and the diagram are files the app serves as-is, and a vector drawing must not be rasterised. */}
        <img
          ref={observe}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={fail}
          className={contain ? "h-full w-full object-contain" : "h-full w-full object-cover"}
        />
      </span>
    );
  }

  const reason = failure?.code ? ASSET_PROBLEMS[failure.code].label : undefined;
  return (
    <span className="block w-[72px] shrink-0" title={failure ? (reason ?? "Preview unavailable") : undefined}>
      <Placeholder label={failure ? "unavailable" : label.toLowerCase()} height={48} className="px-1" />
    </span>
  );
}
