/**
 * Stroke-only action glyphs for the dense "Simple ERP" master toolbars.
 *
 * They are deliberately a single 24x24 path each so they inherit `currentColor`
 * and read correctly at 14px, where the multi-path react-icons set turns muddy.
 */
export type ErpActionIconName =
  | "add"
  | "edit"
  | "delete"
  | "refresh"
  | "import"
  | "excel"
  | "print"
  | "history"
  | "search";

export const ERP_ACTION_ICON_PATHS: Record<ErpActionIconName, string> = {
  add: "M12 5v14M5 12h14",
  edit: "M17 3l4 4L8 20l-5 1 1-5L17 3z",
  delete: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14",
  refresh: "M21 12a9 9 0 1 1-3-6.7M21 3v6h-6",
  import: "M12 3v12M7 10l5 5 5-5M4 21h16",
  excel: "M12 21V9M8 13l4 4 4-4M4 3h16",
  print: "M6 9V2h12v7M6 18H4V11h16v7h-2M6 14h12v8H6z",
  history: "M12 8v4l3 3M3 12a9 9 0 1 0 9-9",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
};

export type ErpActionIconProps = {
  name: ErpActionIconName;
  className?: string;
  size?: number;
};

export function ErpActionIcon({ name, className, size = 14 }: ErpActionIconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ERP_ACTION_ICON_PATHS[name]} />
    </svg>
  );
}

export default ErpActionIcon;
