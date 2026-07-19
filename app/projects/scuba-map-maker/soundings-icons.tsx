import type { ReactNode, SVGProps } from "react";

export type SoundingsIconName =
  | "calibrate"
  | "chevron"
  | "close"
  | "duplicate"
  | "export"
  | "eye"
  | "folder"
  | "image"
  | "layers"
  | "lock"
  | "origin"
  | "point"
  | "print-area"
  | "redo"
  | "route"
  | "select"
  | "settings"
  | "shoreline"
  | "table"
  | "trash"
  | "undo"
  | "unlock"
  | "upload";

type IconProps = SVGProps<SVGSVGElement> & { name: SoundingsIconName };

export function SoundingsIcon({ name, ...props }: IconProps) {
  const paths: Record<SoundingsIconName, ReactNode> = {
    calibrate: <><path d="M4 17 17 4l3 3L7 20H4v-3Z"/><path d="m13 8 3 3M10 11l2 2M7 14l3 3"/></>,
    chevron: <path d="m8 10 4 4 4-4"/>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    duplicate: <><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
    export: <><path d="M12 16V3m0 0L7.5 7.5M12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></>,
    eye: <><path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z"/><circle cx="12" cy="12" r="2.5"/></>,
    folder: <path d="M3 7.5h7l2-2h4.5a2.5 2.5 0 0 1 2.5 2.5v1H3V7.5Zm0 1.5h18l-1.5 9H4.5L3 9Z"/>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m4.5 17 4.5-4 3 2.5 3-3 4.5 4.5"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    origin: <><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></>,
    point: <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>,
    "print-area": <><rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="3 2"/><path d="M8 2v4M16 18v4M2 8h4M18 16h4"/></>,
    redo: <><path d="m16 5 4 4-4 4"/><path d="M20 9h-9a6 6 0 0 0-6 6v2"/></>,
    route: <><circle cx="5" cy="18" r="2" fill="currentColor" stroke="none"/><circle cx="19" cy="5" r="2" fill="currentColor" stroke="none"/><path d="m6.5 16.5 4-4 3 1 4-6"/></>,
    select: <path d="m5 3 13 9-6 1-3 6L5 3Z"/>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    shoreline: <path d="M4 4c7 0 4 6 11 6s4 6 5 10"/>,
    table: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 9v11M15 9v11"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
    undo: <><path d="m8 5-4 4 4 4"/><path d="M4 9h9a6 6 0 0 1 6 6v2"/></>,
    unlock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/></>,
    upload: <><path d="M12 8v13m0-13L7.5 12.5M12 8l4.5 4.5"/><path d="M5 5V3h14v2"/></>,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {paths[name]}
    </svg>
  );
}
