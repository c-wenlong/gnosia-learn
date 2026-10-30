"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { capFrom, type CapStatus } from "@/lib/studio-chat";
import { activeByokTiers, BYOK_SETTINGS_CHANGED, getByokSettings } from "@/lib/studio-byok";
import { diagramAvailability, readStudioHealth, videoAvailability, type VideoAvailability } from "@/lib/studio-health";
import { runnerSettings } from "@/lib/studio-agent-settings";

/**
 * How often focus may re-read health. `/api/health` runs `doctor`, which the
 * runner caches for 30 seconds, and `claude --version`, so this is the
 * cheapest rate at which each read can still be new.
 */
const CAP_READ_MS = 30_000;

/** The picker's list and the Claude Code defaults, from health's `agent` (D90). */
export type AgentMenu = ReturnType<typeof runnerSettings>;

/**
 * What the conversation's presses and pickers need from `/api/health`: the
 * day's spend against the cap, whether Video and Draw can run at all, and the
 * model picker's list, with a BYOK conversation's tiers read fresh from
 * the settings route. The page's render-time copies seed it; it reads again on
 * opening, on a BYOK write, on focus (at most every `CAP_READ_MS`), and when
 * a spent cap frees.
 *
 * `capRefused` takes a 429's detail: the runner's own word on the cap
 * replaces what the last health read said.
 */
export function useStudioHealth({
  cap: initialCap,
  video: initialVideo,
  diagramAgent: initialDiagram,
  byok,
}: {
  cap: CapStatus | null;
  video: VideoAvailability | null;
  diagramAgent: VideoAvailability | null;
  /** The conversation's record says BYOK, so its tiers are read too. */
  byok: boolean;
}) {
  const [cap, setCap] = useState<CapStatus | null>(initialCap);
  const [video, setVideo] = useState<VideoAvailability | null>(initialVideo);
  const [diagramAgent, setDiagramAgent] = useState<VideoAvailability | null>(initialDiagram);
  const [agentMenu, setAgentMenu] = useState<AgentMenu>({
    models: null,
    defaults: null,
    resolved: null,
    byokModel: null,
    byokTiers: null,
  });
  // The BYOK tier models, read fresh: health's copy can be older than a
  // Connect that just wrote them. Every health read is followed by a fresh
  // read (it bumps `tiersAsked`), as when one callback read both: health's
  // copy stands from its answer until the fresh read asked after it answers,
  // and stays when that read fails, so a failed settings read never leaves
  // older tiers over newer ones. Each answer carries the count it was asked
  // at, so two reads that say the same thing (nothing configured, twice) are
  // still two answers: comparing the answers themselves kept health's copy
  // after the second, and it offered tiers that could not run (R2-1-02).
  const [tiersAsked, setTiersAsked] = useState(0);
  const [fresh, setFresh] = useState<{ asked: number; tiers: ReturnType<typeof activeByokTiers> } | null>(null);
  useEffect(() => {
    if (!byok) return;
    // Not listening for BYOK writes itself: the health read below answers
    // one and asks for the tiers after it, so a save is read once.
    let alive = true;
    void getByokSettings().then((result) => {
      // A read asked before the latest one is dropped, whichever lands last.
      if (alive && result.ok) setFresh({ asked: tiersAsked, tiers: activeByokTiers(result.data) });
    });
    return () => {
      alive = false;
    };
  }, [byok, tiersAsked]);

  // The presses' disabled reasons are re-checked when the panel regains
  // focus: a job held elsewhere may have been accepted meanwhile, the day's
  // spend may have aged out, and the video doctor may have recovered.
  const capReadAt = useRef(0);
  /** The newest health read asked, so an older one that lands later is dropped (R2-1-18). */
  const healthAsked = useRef(0);
  // Stable, so no effect below reads health a second time when the record
  // lands: a callback over `view?.harness` changed identity as it did, and
  // every effect read health again (S1-11). The tiers are read by the effect above.
  const readHealth = useCallback(async () => {
    capReadAt.current = Date.now();
    const mine = (healthAsked.current += 1);
    const health = await readStudioHealth();
    // A read asked before the latest one would put older spend and an older
    // menu over newer ones, whichever lands last.
    if (health === null || mine !== healthAsked.current) return;
    const next = capFrom(health.dailyCap);
    if (next !== null) setCap(next);
    setVideo(videoAvailability(health.video));
    setDiagramAgent(diagramAvailability(health.diagramAgent));
    setAgentMenu(runnerSettings(health.agent));
    // Health's copy until the fresh read that follows it answers.
    setTiersAsked((count) => count + 1);
  }, []);
  // A BYOK write from the dialog or Settings re-reads health at once (D94),
  // and the tiers after it.
  useEffect(() => {
    const on = () => void readHealth();
    window.addEventListener(BYOK_SETTINGS_CHANGED, on);
    return () => window.removeEventListener(BYOK_SETTINGS_CHANGED, on);
  }, [readHealth]);
  // Once on opening too: the page that drew the grid read health, and a
  // conversation opened in the browser (`PanelHost`) can be minutes
  // younger than that read.
  useEffect(() => {
    const timer = setTimeout(() => void readHealth(), 0);
    return () => clearTimeout(timer);
  }, [readHealth]);
  useEffect(() => {
    const wake = () => {
      if (Date.now() - capReadAt.current >= CAP_READ_MS) void readHealth();
    };
    window.addEventListener("focus", wake);
    return () => window.removeEventListener("focus", wake);
  }, [readHealth]);

  // A spent cap frees when its oldest spend leaves the 24-hour window, which
  // the runner names; read it again then rather than waiting for a focus.
  const freesAt = cap?.exceeded ? Date.parse(cap.oldestAgesOutAt ?? "") : Number.NaN;
  useEffect(() => {
    if (!Number.isFinite(freesAt)) return;
    const wait = Math.max(1_000, Math.min(freesAt - Date.now() + 1_000, 2 ** 31 - 1));
    const timer = setTimeout(() => void readHealth(), wait);
    return () => clearTimeout(timer);
  }, [freesAt, readHealth]);

  const capRefused = useCallback((detail: unknown) => {
    setCap((held) => capFrom({ ...(detail as object), exceeded: true }) ?? held);
  }, []);

  // Until the fresh read asked after the last health read answers (or when
  // it fails), health's copy stands.
  const menu: AgentMenu =
    !byok || fresh === null || fresh.asked !== tiersAsked
      ? agentMenu
      : { ...agentMenu, byokModel: fresh.tiers?.model ?? null, byokTiers: fresh.tiers?.tiers ?? null };
  return { cap, video, diagramAgent, agentMenu: menu, capRefused };
}
