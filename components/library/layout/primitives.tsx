import type { CSSProperties, HTMLAttributes } from "react";
import { cx } from "@/components/library/cx";

const spacingScale = {
  xs: "0.5rem",
  sm: "0.75rem",
  md: "1rem",
  lg: "1.5rem",
  xl: "2rem",
} as const;

type SpacingKey = keyof typeof spacingScale;

type ContainerSize = "narrow" | "default" | "wide";

const containerClassBySize: Record<ContainerSize, string | undefined> = {
  narrow: "l-container--narrow",
  default: undefined,
  wide: "l-container--wide",
};

function withCssVariable(
  style: CSSProperties | undefined,
  variable: string,
  value: string,
): CSSProperties {
  return {
    ...(style ?? {}),
    [variable]: value,
  } as CSSProperties;
}

export type ShellProps = HTMLAttributes<HTMLDivElement>;

export function Shell({ className, ...props }: ShellProps) {
  return <div className={cx("l-shell", className)} {...props} />;
}

export type ContainerProps = HTMLAttributes<HTMLDivElement> & {
  size?: ContainerSize;
};

export function Container({ size = "default", className, ...props }: ContainerProps) {
  return <div className={cx("l-container", containerClassBySize[size], className)} {...props} />;
}

export type StackProps = HTMLAttributes<HTMLDivElement> & {
  space?: SpacingKey;
};

export function Stack({ space = "md", className, style, ...props }: StackProps) {
  const nextStyle = withCssVariable(style, "--stack-space", spacingScale[space]);
  return <div className={cx("l-stack", className)} style={nextStyle} {...props} />;
}

export type ClusterProps = HTMLAttributes<HTMLDivElement> & {
  gap?: SpacingKey;
};

export function Cluster({ gap = "sm", className, style, ...props }: ClusterProps) {
  const nextStyle = withCssVariable(style, "--cluster-gap", spacingScale[gap]);
  return <div className={cx("l-cluster", className)} style={nextStyle} {...props} />;
}

export type SplitProps = HTMLAttributes<HTMLDivElement> & {
  gap?: SpacingKey;
};

export function Split({ gap = "md", className, style, ...props }: SplitProps) {
  const nextStyle = withCssVariable(style, "--split-gap", spacingScale[gap]);
  return <div className={cx("l-split", className)} style={nextStyle} {...props} />;
}

export type GridProps = HTMLAttributes<HTMLDivElement> & {
  gap?: SpacingKey;
  min?: string;
};

export function Grid({ gap = "md", min = "16rem", className, style, ...props }: GridProps) {
  const withGap = withCssVariable(style, "--grid-gap", spacingScale[gap]);
  const nextStyle = withCssVariable(withGap, "--grid-min", min);
  return <div className={cx("l-grid", className)} style={nextStyle} {...props} />;
}

export type SidebarProps = HTMLAttributes<HTMLDivElement> & {
  side?: "start" | "end";
  width?: string;
  gap?: SpacingKey;
};

export function Sidebar({
  side = "start",
  width = "20rem",
  gap = "lg",
  className,
  style,
  ...props
}: SidebarProps) {
  const withGap = withCssVariable(style, "--sidebar-gap", spacingScale[gap]);
  const nextStyle = withCssVariable(withGap, "--sidebar-width", width);

  return <div data-side={side} className={cx("l-sidebar", className)} style={nextStyle} {...props} />;
}
