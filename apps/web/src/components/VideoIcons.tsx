import type { ReactNode } from "react";

import { IconButton } from "@/components/ui/IconButton";

/** The player's own controls and icons, drawn over the picture (`VideoPlayer`). */

export function ControlButton({
  label,
  onClick,
  pressed,
  children,
}: {
  /**
   * What the button does. A toggle (`pressed` set) keeps one name whatever
   * its state, and `aria-pressed` says whether it is on, as ARIA asks of a
   * toggle button; a button without `pressed` names the action it would take
   * now ("Mute", "Unmute"), since nothing else says its state.
   */
  label: string;
  onClick: () => void;
  /** Set for a toggle, so it is announced as one. */
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <IconButton label={label} onClick={onClick} pressed={pressed} tone="onDark" inset>
      {children}
    </IconButton>
  );
}

const PATHS = {
  pause: <path d="M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z" fill="currentColor" stroke="none" />,
  volume: (
    <>
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  muted: (
    <>
      <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor" />
      <path d="M15.5 9.5l5 5M20.5 9.5l-5 5" />
    </>
  ),
  cc: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M10.5 10.2a2.2 2.2 0 1 0 0 3.6M17 10.2a2.2 2.2 0 1 0 0 3.6" />
    </>
  ),
  pip: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <rect x="12" y="11.5" width="6.5" height="5" rx="1" fill="currentColor" />
    </>
  ),
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  shrink: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  forward: <path d="M9.5 5.5l6.5 6.5-6.5 6.5" strokeWidth="2.4" />,
  back: <path d="M14.5 5.5L8 12l6.5 6.5" strokeWidth="2.4" />,
} satisfies Record<string, ReactNode>;

export function Icon({ name, className }: { name: keyof typeof PATHS; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}
