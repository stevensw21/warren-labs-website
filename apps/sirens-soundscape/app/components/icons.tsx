import type { SVGProps } from "react";

export type IconName =
  | "bookmark"
  | "chevron-left"
  | "chevron-down"
  | "check"
  | "close"
  | "cloud-rain"
  | "crowd"
  | "door"
  | "edit"
  | "eye"
  | "fire"
  | "folder-play"
  | "headphones"
  | "info"
  | "library"
  | "link"
  | "lock"
  | "loop"
  | "more"
  | "music"
  | "pause"
  | "play"
  | "plus"
  | "refresh"
  | "search"
  | "settings"
  | "spark"
  | "square"
  | "star"
  | "swords"
  | "thunder"
  | "upload"
  | "user"
  | "volume"
  | "wave"
  | "wolf";

const baseProps: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    bookmark: <path d="M6 3.5h12v17l-6-3.4-6 3.4z" />,
    "chevron-left": <path d="m15 18-6-6 6-6" />,
    "chevron-down": <path d="m7 9 5 5 5-5" />,
    check: <path d="m5 12.5 4.2 4.2L19 7" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    "cloud-rain": (
      <>
        <path d="M7 17h10a4 4 0 0 0 .4-8A5.5 5.5 0 0 0 7 7.6 4.7 4.7 0 0 0 7 17Z" />
        <path d="m8 20-1 2m5-2-1 2m5-2-1 2" />
      </>
    ),
    crowd: (
      <>
        <circle cx="12" cy="8" r="3" />
        <circle cx="5" cy="10" r="2" />
        <circle cx="19" cy="10" r="2" />
        <path d="M6.5 20v-2a5.5 5.5 0 0 1 11 0v2M1.5 19v-1.5a3.5 3.5 0 0 1 4-3.5m17 5v-1.5a3.5 3.5 0 0 0-4-3.5" />
      </>
    ),
    door: (
      <>
        <path d="M5 21V3h13v18M8 21V6h7v15" />
        <circle cx="13" cy="13" r=".6" fill="currentColor" stroke="none" />
      </>
    ),
    edit: <path d="M4 20h4l11-11-4-4L4 16v4Zm9.8-13.8 4 4" />,
    eye: (
      <>
        <path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z" />
        <circle cx="12" cy="12" r="2.3" />
      </>
    ),
    fire: <path d="M13 2.5c.8 4-2.3 4.9-2.3 7.4 0 1.2.8 2.2 2 2.2 2.3 0 3.6-2.4 3-4.5 2.2 1.6 3.8 3.8 3.8 6.6a7.5 7.5 0 0 1-15 0c0-3.6 2.1-6.4 5.3-8.5-.2 2.4.7 3.1 1.6 2.8 1-.4 1.8-2.8 1.6-6Z" />,
    "folder-play": (
      <>
        <path d="M3 6h7l2 2h9v11H3z" />
        <path d="m10 11 5 3-5 3z" />
      </>
    ),
    headphones: <path d="M4 14v-2a8 8 0 0 1 16 0v2m-16 0h3v6H5a1 1 0 0 1-1-1zm16 0h-3v6h2a1 1 0 0 0 1-1z" />,
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-10v.2" />
      </>
    ),
    library: <path d="M4 4h3v16H4zm6 2h3v14h-3zm6-3 4 1-2 16-4-1z" />,
    link: <path d="M9.5 14.5 14.5 9m-7.8 8.3-1 1a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0m6.6-3.6 1-1a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0" />,
    lock: <path d="M6 10h12v10H6zm2 0V7a4 4 0 0 1 8 0v3" />,
    loop: <path d="M17 2.5 20.5 6 17 9.5M3.5 11V9A3 3 0 0 1 6.5 6h14M7 21.5 3.5 18 7 14.5M20.5 13v2a3 3 0 0 1-3 3h-14" />,
    more: (
      <>
        <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    music: <path d="M9 18V5l10-2v13M9 9l10-2M6.5 21A2.5 2.5 0 1 0 6.5 16a2.5 2.5 0 0 0 0 5Zm10-2A2.5 2.5 0 1 0 16.5 14a2.5 2.5 0 0 0 0 5Z" />,
    pause: <path d="M8 5v14m8-14v14" />,
    play: <path d="m8 5 11 7-11 7z" />,
    plus: <path d="M12 4v16M4 12h16" />,
    refresh: <path d="M20 7v5h-5M4 17v-5h5m10-4.5A8 8 0 0 0 5.2 6M4.9 16.5A8 8 0 0 0 18.8 18" />,
    search: <path d="m20 20-4.6-4.6M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />,
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.8 1.8 0 0 0 .4 2l.1.1-2.8 2.8-.1-.1a1.8 1.8 0 0 0-2-.4 1.8 1.8 0 0 0-1 1.7v.2h-4v-.2A1.8 1.8 0 0 0 9 19.4a1.8 1.8 0 0 0-2 .4l-.1.1-2.8-2.8.1-.1a1.8 1.8 0 0 0 .4-2 1.8 1.8 0 0 0-1.7-1H2.7v-4h.2A1.8 1.8 0 0 0 4.6 9a1.8 1.8 0 0 0-.4-2l-.1-.1 2.8-2.8.1.1A1.8 1.8 0 0 0 9 4.6a1.8 1.8 0 0 0 1-1.7v-.2h4v.2A1.8 1.8 0 0 0 15 4.6a1.8 1.8 0 0 0 2-.4l.1-.1 2.8 2.8-.1.1a1.8 1.8 0 0 0-.4 2 1.8 1.8 0 0 0 1.7 1h.2v4h-.2a1.8 1.8 0 0 0-1.7 1Z" />
      </>
    ),
    spark: <path d="m12 2 1.4 6.6L20 6l-4.7 5.2L22 13l-6.7 1.5L19 20l-5.6-3.8L12 23l-1.5-6.8L5 20l3.7-5.5L2 13l6.7-1.8L4 6l6.5 2.6z" />,
    square: <rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" stroke="none" />,
    star: <path d="m12 2.7 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4-4.6-4.5 6.4-.9z" />,
    swords: <path d="m4 3 6 6-2 2-3-1-2-6 1-1Zm16 0-6 6 2 2 3-1 2-6-1-1ZM9 12l-6 6m12-6 6 6M3 15l6 6m12-6-6 6" />,
    thunder: <path d="m14 2-8 12h6l-2 8 8-12h-6z" />,
    upload: <path d="M12 16V3m-5 5 5-5 5 5M5 14H3v7h18v-7h-2" />,
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
      </>
    ),
    volume: <path d="M4 10h4l5-4v12l-5-4H4zm12 0a4 4 0 0 1 0 4m2-7a7 7 0 0 1 0 10" />,
    wave: <path d="M3 12h2m2-4v8m3-12v16m3-12v8m3-11v14m3-9v4m2-2h1" />,
    wolf: <path d="m5 9 1-6 4 3h4l4-3 1 6 2 4-3 6-6 3-6-3-3-6 2-4Zm3 4h.1m7.9 0h.1M9 17l3 1 3-1" />,
  };

  return (
    <svg {...baseProps} className={className}>
      {paths[name]}
    </svg>
  );
}

export function BrandMark() {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path strokeWidth="1.3" d="m24 3 17 10v21L24 45 7 34V13Z" />
      <path strokeWidth="1.3" d="M24 3v42M7 13l34 21M41 13 7 34" opacity=".55" />
      <path strokeWidth="2" d="M21 30V16l10-2v12m-10-6 10-2" />
      <circle cx="17.8" cy="31" r="3.2" />
      <circle cx="27.8" cy="27" r="3.2" />
      <path strokeWidth="1.3" d="M1 22h3l1.5-5L8 30l2-12 2 8h3M47 22h-3l-1.5-5-1.5 9" opacity=".8" />
    </svg>
  );
}
