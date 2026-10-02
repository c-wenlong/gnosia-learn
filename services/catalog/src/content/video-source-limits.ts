/**
 * How much source a studio video may land with (`video put`, `video.source`):
 * the most bytes all its source files may hold together, and the most files.
 *
 * Pure, with no imports, so the studio's gate reaches it by path and refuses
 * at its step 1 exactly what Accept would refuse later, from one constant.
 */

/** The most bytes a video's source files may hold together, `topic.yml` included. */
export const VIDEO_SOURCE_BYTES_MAX = 512 * 1024;

/** The most source files a video may hold, `topic.yml` included. */
export const VIDEO_SOURCE_FILES_MAX = 20;
