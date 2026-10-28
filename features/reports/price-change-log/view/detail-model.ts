/**
 * The detail dialog's text — Qt `PriceLogDetailDialog::apply()` /
 * `fillFields()` (price_log_dialogs.cpp), as pure functions.
 */
import type { PriceLogDetail, PriceLogField } from "../wire/types";
import {
  appliesText,
  actionLabel,
  branchText,
  DASH,
  deviceText,
  moveText,
  PRICE_FIELD_LABELS,
  sourceLabel,
  valueText,
  whoText,
} from "./words";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const pad = (n: number) => String(n).padStart(2, "0");

/** "Price change · Samsung H1 · PCS · All branches". */
export function detailTitle(d: Pick<PriceLogDetail, "priceTable" | "itemName" | "unitName" | "branchName">): string {
  return [
    d.priceTable === "IQP" ? "Qty slab change" : "Price change",
    d.itemName ?? "",
    d.unitName ?? "",
    branchText(d),
  ].join(" · ");
}

/** `Fri 23/10/2026 02:10:05 PM`, local — the detail shows the seconds. */
export function detailStamp(iso: string | null | undefined): string {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) {
    return iso ?? "";
  }
  const hours = at.getHours();
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return (
    `${WEEKDAYS[at.getDay()]} ${pad(at.getDate())}/${pad(at.getMonth() + 1)}/${at.getFullYear()} ` +
    `${pad(hour12)}:${pad(at.getMinutes())}:${pad(at.getSeconds())} ${hours < 12 ? "AM" : "PM"}`
  );
}

/** "Desktop" for DESKTOP. */
function appWord(app: string | null | undefined): string {
  const s = app ?? "";
  return s ? s.slice(0, 1) + s.slice(1).toLowerCase() : "";
}

/**
 * The meta line's parts: when, who, the device (with its IP), the app, the
 * screen (with its menu), the action, and where the price applies.
 */
export function detailMetaParts(d: PriceLogDetail): string[] {
  const parts: string[] = [detailStamp(d.changedOn), whoText(d)];
  parts.push(d.ip && d.deviceName ? `${d.deviceName} (${d.ip})` : deviceText(d));
  if (d.app) parts.push(appWord(d.app));
  const menu = Number(d.menuId) || 0;
  parts.push(menu > 0 ? `${sourceLabel(d.source)} (menu ${menu})` : sourceLabel(d.source));
  parts.push(actionLabel(d.action));
  const applies = appliesText(d);
  if (applies !== DASH) parts.push(applies);
  return parts;
}

/** "Same save: 2 other rows" — nothing when unknown (-1) or none. */
export function sameSaveText(others: number): string {
  if (!(others > 0)) return "";
  return `Same save: ${others} other row${others === 1 ? "" : "s"}`;
}

export type FieldLine = {
  key: string;
  label: string;
  before: string;
  after: string;
  change: string;
  /** -1 down (red), 1 up (green), 0 no colour. */
  direction: -1 | 0 | 1;
  changed: boolean;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** The changed fields — the server's fields[], else rebuilt from changed[] and the row before / after. */
export function changedFields(d: PriceLogDetail): PriceLogField[] {
  if (Array.isArray(d.fields) && d.fields.length) {
    return d.fields;
  }
  const before = record(d.before);
  const after = record(d.after);
  const labels = new Map(PRICE_FIELD_LABELS.map(([column, label]) => [column, label] as const));
  return (d.changed ?? []).map((column, i) => ({
    column,
    label: d.changedLabels?.[i] ?? labels.get(column) ?? column,
    before: before?.[column] ?? null,
    after: after?.[column] ?? null,
  }));
}

/**
 * Field | Before | After | Change: the changed fields first; with
 * `showUnchanged`, every other price field the row has (only the price
 * columns, in reading order — ids, stamps and keys are not prices).
 */
export function fieldLines(d: PriceLogDetail, showUnchanged: boolean): FieldLine[] {
  const lines: FieldLine[] = [];
  const shown = new Set<string>();
  for (const field of changedFields(d)) {
    shown.add(field.column);
    const move = moveText(field.before, field.after);
    lines.push({
      key: `c:${field.column}`,
      label: field.label,
      before: valueText(field.before),
      after: valueText(field.after),
      change: move.text,
      direction: move.direction,
      changed: true,
    });
  }
  if (showUnchanged) {
    const before = record(d.before);
    const after = record(d.after);
    const keys = after && Object.keys(after).length ? after : before;
    if (keys) {
      for (const [column, label] of PRICE_FIELD_LABELS) {
        if (shown.has(column) || !(column in keys)) continue;
        lines.push({
          key: `u:${column}`,
          label,
          before: valueText(before?.[column]),
          after: valueText(after?.[column]),
          change: "",
          direction: 0,
          changed: false,
        });
      }
    }
  }
  return lines;
}
