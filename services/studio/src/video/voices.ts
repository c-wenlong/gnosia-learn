/**
 * The kokoro voices a video brief may name (docs/STUDIO-VIDEOS.md, the VOICES
 * block). Kokoro only in v1 (D47): it runs locally, so the narration profile
 * holds no key and needs no network.
 *
 * A voice's first letter picks kokoro's language pipeline (`a` American
 * English, `b` British), which is why the list stays within those two.
 *
 * Static on purpose, and checked against what is actually installed: the
 * narration step runs with `HF_HUB_OFFLINE=1`, so a voice whose file is not
 * in the Hugging Face cache cannot be fetched mid-job. The video doctor
 * reports which of these are installed, and the runner refuses a brief whose
 * voice is not (V9).
 */
export interface Voice {
  id: string;
  label: string;
}

export const VOICES: readonly Voice[] = [
  { id: "af_heart", label: "American English, female" },
  { id: "am_michael", label: "American English, male" },
  { id: "bf_emma", label: "British English, female" },
  { id: "bm_george", label: "British English, male" },
];
