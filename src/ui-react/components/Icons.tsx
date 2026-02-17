import type { SVGProps } from "react";

type BaseIconProps = SVGProps<SVGSVGElement> & {
  size?: number;
};

function BaseIcon({ size = 20, children, ...props }: BaseIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  );
}

export function VolumeOnIcon(props: BaseIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M10 6.5 7 9H4.5A1.5 1.5 0 0 0 3 10.5v3A1.5 1.5 0 0 0 4.5 15H7l3 2.5a.75.75 0 0 0 1.25-.58V7.08A.75.75 0 0 0 10 6.5Z" />
      <path d="M14.7 9.6a.75.75 0 0 1 1.06 0 3.4 3.4 0 0 1 0 4.8.75.75 0 1 1-1.06-1.06 1.9 1.9 0 0 0 0-2.68.75.75 0 0 1 0-1.06Z" />
      <path d="M17.25 7.25a.75.75 0 0 1 1.06 0 6.75 6.75 0 0 1 0 9.5.75.75 0 1 1-1.06-1.06 5.25 5.25 0 0 0 0-7.38.75.75 0 0 1 0-1.06Z" />
    </BaseIcon>
  );
}

export function VolumeOffIcon(props: BaseIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M10 6.5 7 9H4.5A1.5 1.5 0 0 0 3 10.5v3A1.5 1.5 0 0 0 4.5 15H7l3 2.5a.75.75 0 0 0 1.25-.58V7.08A.75.75 0 0 0 10 6.5Z" />
      <path d="m15.5 10 4 4" />
      <path d="m19.5 10-4 4" />
    </BaseIcon>
  );
}

export function MusicTrackIcon(props: BaseIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M10 18V7l9-2v10" />
      <circle cx="7" cy="18" r="2.5" />
      <circle cx="17" cy="15" r="2.5" />
    </BaseIcon>
  );
}

export function MailIcon(props: BaseIconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3.5" y="6.5" width="17" height="11" rx="2.2" />
      <path d="m4.5 8 7.5 5.5L19.5 8" />
    </BaseIcon>
  );
}

export function LockIcon(props: BaseIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M8 10V7.4a4 4 0 1 1 8 0V10" />
      <rect x="5.5" y="10" width="13" height="9.5" rx="2.2" />
      <path d="M12 14.2v1.8" />
    </BaseIcon>
  );
}

export function MenuIcon(props: BaseIconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4.5 7h15" />
      <path d="M4.5 12h15" />
      <path d="M4.5 17h15" />
    </BaseIcon>
  );
}

export const ICON_REGISTRY = {
  "volume-on": { label: "Volume On", Component: VolumeOnIcon },
  "volume-off": { label: "Volume Off", Component: VolumeOffIcon },
  "music-track": { label: "Music Track", Component: MusicTrackIcon },
  mail: { label: "Mail", Component: MailIcon },
  lock: { label: "Lock", Component: LockIcon },
  menu: { label: "Menu", Component: MenuIcon },
} as const;

export type AppIconName = keyof typeof ICON_REGISTRY;

export type AppIconProps = BaseIconProps & {
  name: AppIconName;
};

/**
 * Centralized icon entrypoint.
 * Add new icons to ICON_REGISTRY and Storybook gallery updates automatically.
 */
export function AppIcon({ name, ...props }: AppIconProps) {
  const entry = ICON_REGISTRY[name];
  const IconComponent = entry.Component;
  return <IconComponent {...props} />;
}
