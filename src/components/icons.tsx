import type { SVGProps } from 'react';

/** Line icons on a 16px grid with 1.5px strokes, all using currentColor */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5 14 14" />
  </Svg>
);

export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.2" />
    <path d="M10.5 5.5V3.7c0-.66-.54-1.2-1.2-1.2H3.7c-.66 0-1.2.54-1.2 1.2v5.6c0 .66.54 1.2 1.2 1.2h1.8" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3 8.5 3.2 3L13 4.5" />
  </Svg>
);

export const IconArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </Svg>
);

export const IconArrowLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 8H3M7 4 3 8l4 4" />
  </Svg>
);

export const IconChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3.5 5.5 8l4.5 4.5" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 3.5 10.5 8 6 12.5" />
  </Svg>
);

export const IconChevronDown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.5 6 8 10.5 12.5 6" />
  </Svg>
);

export const IconExternal = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2.5" />
  </Svg>
);

export const IconSun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="2.8" />
    <path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" />
  </Svg>
);

export const IconMoon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.2 9.6A5.5 5.5 0 0 1 6.4 2.8a5.5 5.5 0 1 0 6.8 6.8Z" />
  </Svg>
);

export const IconMonitor = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="2.5" width="12" height="8.5" rx="1.2" />
    <path d="M6 14h4M8 11v3" />
  </Svg>
);

export const IconWallet = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12.5 5V3.8c0-.7-.6-1.3-1.3-1.3H3.3C2.6 2.5 2 3.1 2 3.8v8.4c0 .7.6 1.3 1.3 1.3h9.4c.7 0 1.3-.6 1.3-1.3V6.3c0-.7-.6-1.3-1.3-1.3H2" />
    <circle cx="11" cy="9.2" r=".6" fill="currentColor" />
  </Svg>
);

export const IconSend = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 13V3M4 7l4-4 4 4" />
  </Svg>
);

export const IconReceive = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3v10M4 9l4 4 4-4" />
  </Svg>
);

/** Top-up: BTC in, KSA out, with the arrow landing in the wallet */
export const IconTopUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2.5v7M5 6.5l3 3 3-3" />
    <path d="M2.5 10.5v2c0 .6.4 1 1 1h9c.6 0 1-.4 1-1v-2" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4 4 8 8M12 4l-8 8" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2.2 14.3 13H1.7L8 2.2Z" />
    <path d="M8 6.5v3" />
    <circle cx="8" cy="11.2" r=".5" fill="currentColor" />
  </Svg>
);

export const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M8 7.2v3.6" />
    <circle cx="8" cy="5.1" r=".5" fill="currentColor" />
  </Svg>
);

export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="7" width="10" height="6.5" rx="1.2" />
    <path d="M5.3 7V5.2a2.7 2.7 0 0 1 5.4 0V7" />
  </Svg>
);

export const IconUnlock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="7" width="10" height="6.5" rx="1.2" />
    <path d="M5.3 7V5.2a2.7 2.7 0 0 1 5.2-1" />
  </Svg>
);

export const IconShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 1.8 13 3.6v4c0 3.1-2.1 5.4-5 6.6-2.9-1.2-5-3.5-5-6.6v-4l5-1.8Z" />
    <path d="m5.8 8 1.6 1.6 3-3.1" />
  </Svg>
);

export const IconTerminal = (p: IconProps) => (
  <Svg {...p}>
    <rect x="1.8" y="2.5" width="12.4" height="11" rx="1.2" />
    <path d="m4.5 6 2 2-2 2M8.5 10.5h3" />
  </Svg>
);

export const IconEye = (p: IconProps) => (
  <Svg {...p}>
    <path d="M1.5 8S3.8 3.5 8 3.5 14.5 8 14.5 8 12.2 12.5 8 12.5 1.5 8 1.5 8Z" />
    <circle cx="8" cy="8" r="2" />
  </Svg>
);

export const IconEyeOff = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 2.5 13.5 13.5M6.6 3.7c.45-.13.92-.2 1.4-.2 4.2 0 6.5 4.5 6.5 4.5s-.6 1.2-1.8 2.4M10.2 11.9c-.68.38-1.4.6-2.2.6-4.2 0-6.5-4.5-6.5-4.5s.8-1.6 2.3-2.9" />
  </Svg>
);

export const IconLayers = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2 14 5 8 8 2 5 8 2Z" />
    <path d="m2 8 6 3 6-3M2 11l6 3 6-3" />
  </Svg>
);

export const IconQr = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="2" width="4.5" height="4.5" rx=".6" />
    <rect x="9.5" y="2" width="4.5" height="4.5" rx=".6" />
    <rect x="2" y="9.5" width="4.5" height="4.5" rx=".6" />
    <path d="M9.5 9.5h1.5v1.5M14 9.5v0M12.5 12.5H14V14M9.5 14h0" />
  </Svg>
);

export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" />
  </Svg>
);

export const IconPickaxe = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 13.5 9 7M5 3.2c2.5-1 5.3-.5 7.3 1.5 2 2 2.5 4.8 1.5 7.3" />
    <path d="m7.5 5.5 3 3" />
  </Svg>
);

export const IconMenu = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
  </Svg>
);

export const IconGrid = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.2" y="2.2" width="4.6" height="4.6" rx=".8" />
    <rect x="9.2" y="2.2" width="4.6" height="4.6" rx=".8" />
    <rect x="2.2" y="9.2" width="4.6" height="4.6" rx=".8" />
    <rect x="9.2" y="9.2" width="4.6" height="4.6" rx=".8" />
  </Svg>
);

export const IconPulse = (p: IconProps) => (
  <Svg {...p}>
    <path d="M1.5 8.5h3l1.8-4.5 3 8 1.9-3.5h3.3" />
  </Svg>
);

/** Merge: a tributary flowing into the main line (GHOSTDAG merging a parallel block) */
export const IconMerge = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3v10" />
    <path d="M13 3c0 4-3 5-6.5 7" />
    <circle cx="13" cy="3" r="1.2" />
  </Svg>
);

export const IconGlobe = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="6" />
    <path d="M2 8h12" />
    <path d="M8 2c1.7 1.7 2.5 3.7 2.5 6S9.7 12.3 8 14C6.3 12.3 5.5 10.3 5.5 8S6.3 3.7 8 2Z" />
  </Svg>
);

/** Settings: three sliders */
export const IconSettings = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 4.5h12M2 8h12M2 11.5h12" />
    <circle cx="6" cy="4.5" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="10.5" cy="8" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="5" cy="11.5" r="1.6" fill="currentColor" stroke="none" />
  </Svg>
);
