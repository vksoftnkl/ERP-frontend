/**
 * The pure side of the parts every rebuilt purchase screen lays out the same
 * way (Qt `purchase/common/purchase_parts.*`, NexERP 2026-10-29 fidelity
 * rebuild, to the approved mockups share/purchase/purchase_*_ui_mockup.png):
 * the WARN / REFUSE strip's rows, the transport band, the status pill's tone,
 * the "more columns" choice kept per user. The views are in
 * `components/purchase-parts.tsx`; see README.md in this folder.
 */
import { isoToDisplayDate } from "@/lib/date-format";

// ---------------------------------------------------------------------------
// WARN / REFUSE strip
// ---------------------------------------------------------------------------

/**
 * One row of `warnings[]` / `refusals[]` as /validate and /save send it, or of
 * a 422's `errors[]` (no `level` there: a refusal).
 */
export type PurchaseIssue = {
  code?: string | null;
  level?: "WARN" | "REFUSE" | string | null;
  lineNo?: number | null;
  field?: string | null;
  message?: string | null;
  /** "OVERRIDE" = the override tick goes past it (with the Override right). */
  needsRight?: string | null;
};

export type PurchaseIssueRow = {
  key: string;
  refuse: boolean;
  /** The code as the mockup shows it: `PUR_RATE_ABOVE_PO` → `RATE_ABOVE_PO`. */
  shortCode: string;
  code: string;
  message: string;
  lineNo: number | null;
  field: string;
  overridable: boolean;
};

export type PurchaseIssueSummary = {
  rows: PurchaseIssueRow[];
  refusals: number;
  /** WARN rows the tick can go past (`needsRight = OVERRIDE`). */
  overridable: number;
};

/**
 * Qt `PurchaseWarnStrip::setIssues`: the warnings first, then the refusals; a
 * row /save repeats from /validate (same code + message) shows once; a row
 * with no `level` that came in as a refusal is a REFUSE.
 */
export function purchaseIssueRows(
  warnings: readonly PurchaseIssue[] | null | undefined,
  refusals: readonly PurchaseIssue[] | null | undefined,
): PurchaseIssueSummary {
  const ordered: PurchaseIssue[] = [
    ...(warnings ?? []),
    ...(refusals ?? []).map((row) => (row.level ? row : { ...row, level: "REFUSE" })),
  ];
  const seen = new Set<string>();
  const rows: PurchaseIssueRow[] = [];
  let refusalCount = 0;
  let overridable = 0;
  for (const issue of ordered) {
    const code = String(issue.code ?? "").trim();
    const message = String(issue.message ?? "").trim();
    const dedupe = `${code}\u0000${message}`;
    if (seen.has(dedupe) || (!code && !message)) {
      continue;
    }
    seen.add(dedupe);
    const refuse = String(issue.level ?? "").toUpperCase() === "REFUSE";
    const canOverride = !refuse && String(issue.needsRight ?? "").toUpperCase() === "OVERRIDE";
    if (refuse) refusalCount += 1;
    if (canOverride) overridable += 1;
    rows.push({
      key: `${rows.length}-${code}`,
      refuse,
      code,
      shortCode: code.startsWith("PUR_") ? code.slice(4) : code,
      message,
      lineNo: typeof issue.lineNo === "number" ? issue.lineNo : null,
      field: String(issue.field ?? ""),
      overridable: canOverride,
    });
  }
  return { rows, refusals: refusalCount, overridable };
}

// ---------------------------------------------------------------------------
// COM-09 — the notes as a popup at Save / Post (Qt purchase_notes, NexERP 6b81080)
// ---------------------------------------------------------------------------

export type PurchaseNote = PurchaseIssueRow & {
  /** The bill's line (1-based), from `lineNo` or a `lines.3.rate` field; null = the document. */
  line: number | null;
  /** The message without the server's leading "Line 4 …" (the popup writes "line 4 — " itself). */
  text: string;
};

export type PurchaseNotes = {
  notes: PurchaseNote[];
  refusals: number;
  warnings: number;
  /** WARN rows an Override tick can go past. */
  overridable: number;
};

const LINE_FIELD = /^lines(?:\.|\[)(\d+)/;

/**
 * Qt `PurchaseUi::notesFrom`: the refusals first (they are why Post is off),
 * then the warnings; a row /save repeats from /validate shows once (code +
 * message); a refusal is never overridable.
 */
export function purchaseNotesOf(
  warnings: readonly PurchaseIssue[] | null | undefined,
  refusals: readonly PurchaseIssue[] | null | undefined,
): PurchaseNotes {
  const summary = purchaseIssueRows(warnings, refusals);
  const notes = summary.rows.map((row): PurchaseNote => {
    const fromField = LINE_FIELD.exec(row.field);
    const line = row.lineNo !== null && row.lineNo > 0 ? row.lineNo : fromField ? Number(fromField[1]) + 1 : null;
    let text = row.message;
    if (line !== null) {
      const stripped = text.replace(new RegExp(`^\\s*Line\\s+${line}\\b[\\s:,\\-—]*`, "i"), "");
      text = stripped || text;
    }
    return { ...row, line, text };
  });
  const ordered = [...notes.filter((note) => note.refuse), ...notes.filter((note) => !note.refuse)];
  return {
    notes: ordered,
    refusals: summary.refusals,
    warnings: ordered.length - summary.refusals,
    overridable: summary.overridable,
  };
}

function counted(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The footer's one-liner (mockup "2 warnings · View"): "1 refused · 2 warnings"; "" when there is nothing. */
export function purchaseNotesCount(notes: Pick<PurchaseNotes, "refusals" | "warnings">): string {
  const parts: string[] = [];
  if (notes.refusals > 0) parts.push(`${notes.refusals} refused`);
  if (notes.warnings > 0) parts.push(counted(notes.warnings, "warning", "warnings"));
  return parts.join(" · ");
}

/**
 * The popup's title: "Before you post — 2 warnings" when it asks before a verb,
 * "Not saved — 1 refusal" after the server refused, else "Validation — …".
 */
export function purchaseNotesTitle(
  notes: Pick<PurchaseNotes, "refusals" | "warnings">,
  ask: { verb: "post" | "save" } | { refused: "post" | "save" } | null,
): string {
  const what = [
    notes.refusals > 0 ? counted(notes.refusals, "refusal", "refusals") : "",
    notes.warnings > 0 ? counted(notes.warnings, "warning", "warnings") : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const head = !ask ? "Validation" : "verb" in ask ? `Before you ${ask.verb}` : ask.refused === "post" ? "Not posted" : "Not saved";
  return what ? `${head} — ${what}` : head;
}

// ---------------------------------------------------------------------------
// Transport band (txn_transport_detail; vehicle / driver ride along)
// ---------------------------------------------------------------------------

export type PurchaseTransportMode = "ROAD" | "RAIL" | "AIR" | "SHIP";

/**
 * The band as /save takes it and /get answers it (`header.transport`).
 * On /save: omit = keep the saved band; `null` = remove it.
 */
export type PurchaseTransportBand = {
  mode?: PurchaseTransportMode | string;
  transporterId?: string;
  transporterName?: string;
  transporterGstin?: string;
  lrNo?: string;
  /** ISO yyyy-MM-dd. */
  lrDate?: string;
  distanceKm?: number;
  remarks?: string;
  vehicleNo?: string | null;
  driverName?: string | null;
};

export const TRANSPORT_MODES: readonly { value: string; label: string }[] = [
  { value: "", label: "—" },
  { value: "ROAD", label: "Road" },
  { value: "RAIL", label: "Rail" },
  { value: "AIR", label: "Air" },
  { value: "SHIP", label: "Ship" },
];

/** The form the transport popup edits — every field text. */
export type PurchaseTransportForm = {
  mode: string;
  transporterId: string;
  transporterName: string;
  transporterGstin: string;
  lrNo: string;
  lrDate: string;
  distanceKm: string;
  remarks: string;
  vehicleNo: string;
  driverName: string;
};

function textOf(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

/** A band from /get (any key may be missing or null) → the popup's form. */
export function transportFormOf(band: unknown): PurchaseTransportForm {
  const source = band && typeof band === "object" ? (band as Record<string, unknown>) : {};
  const km = source.distanceKm;
  return {
    mode: textOf(source.mode),
    transporterId: textOf(source.transporterId),
    transporterName: textOf(source.transporterName),
    transporterGstin: textOf(source.transporterGstin),
    lrNo: textOf(source.lrNo),
    lrDate: textOf(source.lrDate).slice(0, 10),
    distanceKm: km === null || km === undefined || km === "" ? "" : String(Math.trunc(Number(km)) || 0),
    remarks: textOf(source.remarks),
    vehicleNo: textOf(source.vehicleNo),
    driverName: textOf(source.driverName),
  };
}

/**
 * Qt `PurchaseTransportDialog::band()`: blanks left out, km an integer.
 * `withCrew` = vehicle / driver are part of this band (the invoice: stored on
 * pur_invoice; a blank one is sent as `null` = clear). Without it (the GRN keeps
 * its own crew fields) they are never sent.
 * Returns `null` when nothing is left — the band is removed.
 */
export function transportBandOf(form: PurchaseTransportForm, withCrew = true): PurchaseTransportBand | null {
  const band: PurchaseTransportBand = {};
  const put = (key: "mode" | "transporterId" | "transporterName" | "transporterGstin" | "lrNo" | "remarks", value: string) => {
    const trimmed = value.trim();
    if (trimmed) band[key] = trimmed;
  };
  put("mode", form.mode);
  put("transporterId", form.transporterId);
  put("transporterName", form.transporterName);
  put("transporterGstin", form.transporterGstin.toUpperCase());
  put("lrNo", form.lrNo);
  if (/^\d{4}-\d{2}-\d{2}$/.test(form.lrDate.trim())) band.lrDate = form.lrDate.trim();
  const km = form.distanceKm.trim();
  if (/^\d+$/.test(km)) band.distanceKm = Number(km);
  put("remarks", form.remarks);
  const hasBand = Object.keys(band).length > 0;
  if (withCrew) {
    const vehicle = form.vehicleNo.trim().toUpperCase();
    const driver = form.driverName.trim();
    if (!hasBand && !vehicle && !driver) return null;
    band.vehicleNo = vehicle || null;
    band.driverName = driver || null;
    return band;
  }
  return hasBand ? band : null;
}

/** Qt `PurchaseTransportDialog::summary`: "LR 88412 · KPN Parcel · 24/10/2026 · Road · 120 km · TN38AB1234". */
export function transportSummary(band: PurchaseTransportBand | null | undefined): string {
  if (!band) return "";
  const parts: string[] = [];
  if (band.lrNo) parts.push(`LR ${band.lrNo}`);
  if (band.transporterName) parts.push(band.transporterName);
  if (band.lrDate) parts.push(isoToDisplayDate(String(band.lrDate).slice(0, 10)));
  if (band.mode) parts.push(String(band.mode).charAt(0) + String(band.mode).slice(1).toLowerCase());
  if (typeof band.distanceKm === "number") parts.push(`${band.distanceKm} km`);
  if (band.vehicleNo) parts.push(String(band.vehicleNo));
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------
// Status pill
// ---------------------------------------------------------------------------

export type PurchasePillTone = "neutral" | "info" | "success" | "warning" | "danger";

/**
 * The pill's tone per document state (theme v42/v43 blocks): DRAFT orange,
 * posted / done green, part received / confirmed blue, cancelled red,
 * held / awaiting approval orange.
 */
export function purchaseStatusTone(status: string | null | undefined): PurchasePillTone {
  const key = String(status ?? "").toUpperCase().replace(/[\s-]+/g, "_");
  if (!key) return "neutral";
  if (key.includes("CANCEL") || key === "REJECTED" || key === "NOT_APPROVED") return "danger";
  if (key === "DRAFT" || key.includes("HOLD") || key.includes("AWAITING") || key === "AMENDING") return "warning";
  if (key === "POSTED" || key === "RECEIVED" || key === "DONE" || key === "APPROVED") return "success";
  if (key.includes("PART") || key === "CONFIRMED" || key === "OPEN") return "info";
  return "neutral";
}

/** "PART_RECEIVED" → "PART RECEIVED". */
export function purchaseStatusLabel(status: string | null | undefined): string {
  return String(status ?? "").toUpperCase().replace(/_/g, " ").trim();
}

// ---------------------------------------------------------------------------
// "More columns" — the user's choice, kept per screen (Qt: saved per user)
// ---------------------------------------------------------------------------

const MORE_COLUMNS_PREFIX = "erp.purchase.moreColumns.";

/** Read the shown set; `fallback` when nothing is kept (or storage is off). */
export function readMoreColumns(screenKey: string, fallback: readonly string[]): string[] {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(MORE_COLUMNS_PREFIX + screenKey);
    if (!raw) return [...fallback];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [...fallback];
  } catch {
    return [...fallback];
  }
}

export function writeMoreColumns(screenKey: string, shown: readonly string[]): void {
  try {
    window.localStorage.setItem(MORE_COLUMNS_PREFIX + screenKey, JSON.stringify([...shown]));
  } catch {
    // storage off (private window): the choice lasts for the page only
  }
}

/** Flip one key in the shown list (keeps the list's order stable). */
export function toggleMoreColumn(shown: readonly string[], key: string): string[] {
  return shown.includes(key) ? shown.filter((x) => x !== key) : [...shown, key];
}

// ---------------------------------------------------------------------------
// Source picker rows
// ---------------------------------------------------------------------------

export type PurchaseSourceChoice = {
  /** "GRN" | "PO" — a heading is drawn per kind, in the order they come. */
  kind: string;
  id: string;
  text: string;
  /** Already on this document: shown, not pickable. */
  done?: boolean;
};

export type PurchaseSourceRow =
  | { type: "heading"; kind: string; text: string }
  | { type: "choice"; choice: PurchaseSourceChoice; index: number };

export const DEFAULT_SOURCE_HEADINGS: Readonly<Record<string, string>> = {
  GRN: "GRNs waiting for a bill",
  PO: "Open POs (goods came with the bill)",
};

/** The list with a heading row before each run of one kind (Qt PurchaseSourcePicker). */
export function purchaseSourceRows(
  choices: readonly PurchaseSourceChoice[],
  headings: Readonly<Record<string, string>> = DEFAULT_SOURCE_HEADINGS,
): PurchaseSourceRow[] {
  const rows: PurchaseSourceRow[] = [];
  let last: string | null = null;
  choices.forEach((choice, index) => {
    if (choice.kind !== last) {
      rows.push({ type: "heading", kind: choice.kind, text: headings[choice.kind] ?? DEFAULT_SOURCE_HEADINGS[choice.kind] ?? choice.kind });
      last = choice.kind;
    }
    rows.push({ type: "choice", choice, index });
  });
  return rows;
}

// ---------------------------------------------------------------------------
// The quick icon bar (Qt `frameQuick`: the PO's strip under the title, NexERP e782e59; Purchase Entry's P1)
// ---------------------------------------------------------------------------

/** What a quick button says — the fields `quickActionTitle` reads (the view's action carries more). */
export type PurchaseQuickTitleParts = {
  /** The short name ("Make GRN"): the accessible name, and the tooltip's start when disabled. */
  label: string;
  /** The tooltip while it can be used; default the label. */
  tip?: string;
  /** The key that does the same ("Ctrl+G"), shown at the tooltip's end. */
  keyHint?: string;
  disabled?: boolean;
  /** Why it can't be used now. */
  disabledReason?: string;
};

/**
 * The button's tooltip (Qt sets a different one while a button is disabled):
 * "Make GRN — goods came: …  (Ctrl+G)", or "Make GRN — <why not>  (Ctrl+G)".
 * A click on a disabled button reports the same text as the screen's hint.
 */
export function quickActionTitle(action: PurchaseQuickTitleParts): string {
  const reason = (action.disabledReason ?? "").trim();
  const base = action.disabled && reason ? `${action.label} — ${reason}` : (action.tip ?? "").trim() || action.label;
  return action.keyHint ? `${base}  (${action.keyHint})` : base;
}
