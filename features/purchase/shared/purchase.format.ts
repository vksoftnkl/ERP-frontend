/**
 * Small text helpers every purchase screen shares — the Qt `PurchaseUi`
 * namespace (src/modules/purchase/common/purchase_ui_util.h). Pure.
 */
import { apiRefusalOf } from "@/lib/api/error-text";

/** Indian grouping, two places: 123456.5 → "1,23,456.50". */
export function money(value: number): string {
  const numeric = Number.isFinite(value) ? value : 0;
  return numeric.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 12.500 → "12.5", 3.000 → "3", 0 → "0". */
export function qtyText(value: number): string {
  if (!Number.isFinite(value) || value === 0) {
    return "0";
  }
  return value.toFixed(3).replace(/\.?0+$/, "");
}

/** A wire decimal (pg NUMERIC arrives as a string) → number; blank / junk → fallback. */
export function num(value: unknown, fallback = 0): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/** null / undefined → "", anything else trimmed. */
export function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

/**
 * A typed date → ISO `yyyy-MM-dd`; "" when it does not parse. Takes
 * dd/MM/yyyy (or with - / . separators), d/M/yyyy and ISO (Qt `isoFromTyped`).
 */
export function isoFromTyped(typed: string): string {
  const value = typed.trim();
  if (!value) {
    return "";
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) {
    return validIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }
  const dmy = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(value);
  if (dmy) {
    return validIso(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]));
  }
  return "";
}

function validIso(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return "";
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * The server's refusal as lines — every `errors[].message`, else the plain
 * message (Qt `PurchaseUi::refusalText`). For an inline strip; a popup should
 * use `toast.apiError`.
 */
export function purchaseRefusalText(error: unknown): string {
  const data = (error as { data?: { errors?: unknown } } | null)?.data;
  const lines: string[] = [];
  if (data && Array.isArray(data.errors)) {
    for (const entry of data.errors) {
      const message = typeof entry === "string" ? entry : text((entry as { message?: unknown })?.message);
      if (message && !lines.includes(message)) {
        lines.push(message);
      }
    }
  }
  return lines.length > 0 ? lines.join("\n") : apiRefusalOf(error).sentence;
}

/** "DRAFT" / "POSTED" / "CANCELLED" as the status pill says it. */
export function purchaseStatusText(status: string): string {
  return status.trim().toUpperCase().replace(/_/g, " ");
}

/**
 * "PUR/2026-2027/D14/00012" → "PUR/…/00012" — the mockups' short refno (Qt `shortRef`
 * on Shortage Receipt and Supplier Dues); the full one is the tooltip. A refno of
 * fewer than four parts passes through.
 */
export function shortRef(refno: string): string {
  const parts = refno.split("/");
  return parts.length < 4 ? refno : `${parts[0]}/…/${parts.slice(3).join("/")}`;
}
