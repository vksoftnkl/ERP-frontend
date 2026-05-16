import { type KeyboardShortcutDefinition } from "@/components/design-system/ui/keyboard-shortcut-hints";

export const SECTION_NAV_SHORTCUTS: readonly KeyboardShortcutDefinition[] = [
  { label: "Prev", keys: ["ArrowLeft"] },
  { label: "Next", keys: ["ArrowRight"] },
  { label: "First", keys: ["Home"] },
  { label: "Last", keys: ["End"] },
];

export const ACCENT_PRESETS = {
  blue: {
    accent: "#2563eb",
    accentStrong: "#1d4ed8",
    softFrom: "#dbeafe",
    softTo: "#bfdbfe",
    iconBg: "#dbeafe",
    iconFg: "#1d4ed8",
  },
  emerald: {
    accent: "#059669",
    accentStrong: "#047857",
    softFrom: "#d1fae5",
    softTo: "#a7f3d0",
    iconBg: "#d1fae5",
    iconFg: "#047857",
  },
  amber: {
    accent: "#d97706",
    accentStrong: "#b45309",
    softFrom: "#fef3c7",
    softTo: "#fde68a",
    iconBg: "#fef3c7",
    iconFg: "#b45309",
  },
  rose: {
    accent: "#e11d48",
    accentStrong: "#be123c",
    softFrom: "#ffe4e6",
    softTo: "#fecdd3",
    iconBg: "#ffe4e6",
    iconFg: "#be123c",
  },
  indigo: {
    accent: "#4f46e5",
    accentStrong: "#4338ca",
    softFrom: "#e0e7ff",
    softTo: "#c7d2fe",
    iconBg: "#e0e7ff",
    iconFg: "#3730a3",
  },
} as const;

export const DEFAULT_ACCENT = ACCENT_PRESETS.blue;
export const SEARCH_SELECT_LIST_MAX_HEIGHT = 220;
export const SEARCH_SELECT_LIST_OFFSET = 4;
export const FIELD_CONTAINER_SELECTOR = "[data-erp-modal-field-name]";
export const PRIMARY_FIELD_CONTROL_SELECTOR = '[data-erp-modal-field-control="true"]';
