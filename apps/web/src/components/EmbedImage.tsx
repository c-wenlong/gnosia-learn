"use client";

import { useAssetFailure } from "@/components/use-asset-failure";
import { WidgetFailure } from "@/components/WidgetFailure";

/**
 * The picture inside one of `NoteProse`'s figures, and the only part of a note
 * that ships JavaScript.
 *
 * `NoteProse` is a server component on purpose: a note is parsed once and
 * handed over as HTML, and a note with no pictures sends the browser nothing
 * to run. An `<img>` that fails, though, needs an `onError` to say why, and
 * that is a client concern. So the island is exactly this big: the image and
 * its failure. The figure, its frame and its caption stay server-rendered
 * around it, and a note without an embed never renders this component, so its
 * page carries no reference to this chunk.
 *
 * Anything the server could decide before render (the file route switched
 * off, a missing file, a name the catalog has no row for) never gets here:
 * `NoteProse` renders the failure panel directly for those, with no island and
 * no probe. This covers what only the browser can find out.
 */
export function EmbedImage({
  src,
  statusHref,
  alt,
  name,
  vector,
}: {
  src: string;
  /** Where to ask why `src` failed; absent for a picture this app does not serve. */
  statusHref?: string;
  alt: string;
  /** The file's name as the note wrote it, for the headline. */
  name: string;
  /** An SVG sits on the constant diagram mat, a raster on the panel colour. */
  vector: boolean;
}) {
  const { failure, fail, retry, attempt, observe } = useAssetFailure(src, statusHref);

  if (failure !== null) {
    return (
      <WidgetFailure
        inset
        headline={
          <>
            <span className="font-mono">{name}</span> did not load.
          </>
        }
        code={failure.code}
        onRetry={retry}
        className="min-h-40"
      />
    );
  }

  return (
    <div className={vector ? "bg-[#f7f6f3] p-3" : "bg-surface2 p-3"}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the asset route
          serves these bytes as they are on disk, and the common case is an
          SVG that next/image would rasterise. */}
      <img
        key={attempt}
        ref={observe}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={fail}
        className="mx-auto block max-h-[60vh] w-full object-contain"
      />
    </div>
  );
}
