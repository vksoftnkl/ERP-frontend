/**
 * F12 — the batches / serials of one purchase line, as rules (Qt
 * `PurchaseAllocDialog`, NexERP 269da2d / e8789a6 / 85cab40 / 6e025ef). Pure:
 * the dialog (components/purchase-alloc-dialog.tsx) keeps a list of these rows
 * and asks this module what they add up to, what is wrong with them and what
 * goes on the wire.
 *
 * One row per batch × bucket, or one per PIECE for an item that tracks serials.
 * Σ qty of SALEABLE rows = received, Σ qty of DAMAGED rows = damaged, Σ free =
 * free — exactly — before OK. Textile (stock.auto_batch_no on, batch-tracked
 * item): size / colour / model per row, Batch left blank (Post numbers it).
 */
import type { UiTableColumnRow } from "@/features/sales/quotation/quotation.types";
import { isoFromTyped, num, qtyText } from "./purchase.format";
import type { PurchaseAllocBucket, PurchaseAllocEntry, PurchaseAllocNeed } from "./purchase-dialogs.types";

// ---------------------------------------------------------------------------
// The grid — ui_table 63 "PURCHASE - ALLOCATION ROWS" (purchase_alloc_cols.h)
// ---------------------------------------------------------------------------

export const ALLOC_COL = {
  godown: 0,
  bucket: 1,
  batch: 2,
  mfg: 3,
  expiry: 4,
  mrp: 5,
  serial: 6,
  warrantyTo: 7,
  qty: 8,
  free: 9,
  godownId: 10,
  size: 11,
  sizeId: 12,
  colour: 13,
  colourId: 14,
  model: 15,
} as const;

export type AllocColumnNo = (typeof ALLOC_COL)[keyof typeof ALLOC_COL];

/** The columns the dialog draws (the ids never are). */
export const ALLOC_SHOWN_COLUMNS: readonly number[] = [
  ALLOC_COL.godown,
  ALLOC_COL.bucket,
  ALLOC_COL.batch,
  ALLOC_COL.model,
  ALLOC_COL.size,
  ALLOC_COL.colour,
  ALLOC_COL.mfg,
  ALLOC_COL.expiry,
  ALLOC_COL.mrp,
  ALLOC_COL.serial,
  ALLOC_COL.warrantyTo,
  ALLOC_COL.qty,
  ALLOC_COL.free,
];

const TEXTILE_COLUMNS: readonly number[] = [ALLOC_COL.size, ALLOC_COL.colour, ALLOC_COL.model];

/** ui_table 63 as registered (share grids/purchase_invoice_registration.py --allocs). */
export const ALLOC_FALLBACK: Readonly<Record<number, { title: string; width: number; position: number; focus: boolean }>> = {
  [ALLOC_COL.godown]: { title: "Godown", width: 13, position: 0, focus: false },
  [ALLOC_COL.bucket]: { title: "Bucket", width: 10, position: 10, focus: true },
  [ALLOC_COL.batch]: { title: "Batch", width: 11, position: 20, focus: true },
  [ALLOC_COL.model]: { title: "Model", width: 7, position: 21, focus: true },
  [ALLOC_COL.size]: { title: "Size", width: 5, position: 22, focus: true },
  [ALLOC_COL.colour]: { title: "Colour", width: 6, position: 23, focus: true },
  [ALLOC_COL.mfg]: { title: "Mfg", width: 9, position: 30, focus: true },
  [ALLOC_COL.expiry]: { title: "Expiry", width: 9, position: 40, focus: true },
  [ALLOC_COL.mrp]: { title: "MRP", width: 8, position: 50, focus: true },
  [ALLOC_COL.serial]: { title: "Serial no", width: 13, position: 60, focus: true },
  [ALLOC_COL.warrantyTo]: { title: "Warranty to", width: 9, position: 70, focus: true },
  [ALLOC_COL.qty]: { title: "Qty", width: 6, position: 80, focus: true },
  [ALLOC_COL.free]: { title: "Free", width: 6, position: 90, focus: true },
};

export type AllocGridColumn = {
  no: number;
  header: string;
  /** Share of the grid, percent; the drawn columns sum to 100. */
  widthPct: number;
  /** Enter stops here (`ui_tbl_clm_column_focus`). */
  focus: boolean;
};

/**
 * The layout joined to the columns this dialog draws: titles, widths, order,
 * visibility and Enter stops from ui_table 63, the textile three only for a
 * textile line. Widths are Qt fractions, scaled to sum to 100 (memory: ui_table
 * width is not a percent). A layout that flags no stop falls back to Qt's own
 * (`setFocusStops`: Serial for a serial item, else Batch · Expiry · Qty).
 */
export function resolveAllocColumns(
  rows: readonly UiTableColumnRow[] | undefined,
  need: Pick<PurchaseAllocNeed, "serial" | "textile">,
): AllocGridColumn[] {
  const byNumber = new Map<number, UiTableColumnRow>();
  for (const row of rows ?? []) {
    const no = Number.parseInt(String(row.uiTblClmNo ?? ""), 10);
    if (Number.isFinite(no) && !byNumber.has(no)) {
      byNumber.set(no, row);
    }
  }
  const placed: (AllocGridColumn & { width: number; position: number })[] = [];
  for (const no of ALLOC_SHOWN_COLUMNS) {
    if (!need.textile && TEXTILE_COLUMNS.includes(no)) {
      continue;
    }
    const row = byNumber.get(no);
    if (row && row.uiTblClmColumnVisibility === false) {
      continue;
    }
    const fallback = ALLOC_FALLBACK[no];
    const configured = row && typeof row.uiTblClmColumnWidth === "number" ? row.uiTblClmColumnWidth : 0;
    const position = row && Number.isFinite(Number(row.uiTblClmColumnPosition)) ? Number(row.uiTblClmColumnPosition) : fallback.position;
    placed.push({
      no,
      header: (row?.uiTblClmName ?? "").trim() || fallback.title,
      width: configured > 0 ? configured : fallback.width,
      position,
      widthPct: 0,
      focus: row ? row.uiTblClmColumnFocus === true : fallback.focus,
    });
  }
  placed.sort((left, right) => left.position - right.position || left.no - right.no);
  if (!placed.some((column) => column.focus)) {
    const stops: readonly number[] = need.serial ? [ALLOC_COL.serial] : [ALLOC_COL.batch, ALLOC_COL.expiry, ALLOC_COL.qty];
    for (const column of placed) {
      column.focus = stops.includes(column.no);
    }
  }
  const total = placed.reduce((sum, column) => sum + column.width, 0) || 1;
  return placed.map(({ no, header, width, focus }) => ({ no, header, focus, widthPct: (width / total) * 100 }));
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** One grid row as keyed. Dates ISO (`yyyy-MM-dd`) or ""; numbers as typed. */
export type AllocRow = {
  key: string;
  godownId: string;
  godownName: string;
  bucket: PurchaseAllocBucket;
  batchNo: string;
  mfgDate: string;
  expiryDate: string;
  mrp: string;
  serialNo: string;
  warrantyTo: string;
  sizeId: string;
  sizeName: string;
  colourId: string;
  colourName: string;
  model: string;
  qty: string;
  free: string;
};

export type AllocField = Exclude<keyof AllocRow, "key">;

export type MakeKey = () => string;

export type AllocChoice = { id: string; name: string };

export function blankAllocRow(key: string): AllocRow {
  return {
    key,
    godownId: "",
    godownName: "",
    bucket: "SALEABLE",
    batchNo: "",
    mfgDate: "",
    expiryDate: "",
    mrp: "",
    serialNo: "",
    warrantyTo: "",
    sizeId: "",
    sizeName: "",
    colourId: "",
    colourName: "",
    model: "",
    qty: "",
    free: "",
  };
}

/** Does the row hold anything (Qt `rowHas`)? Godown and bucket alone do not count. */
export function allocRowHas(row: AllocRow): boolean {
  return [row.batchNo, row.serialNo, row.qty, row.free, row.expiryDate, row.mrp, row.sizeId, row.colourId, row.model].some(
    (value) => value.trim() !== "",
  );
}

function nameIn(list: readonly AllocChoice[] | undefined, id: string): string {
  return (id && list?.find((choice) => choice.id === id)?.name) || "";
}

function numberText(value: number | undefined): string {
  return value !== undefined && Number.isFinite(value) && value > 0 ? qtyText(value) : "";
}

/**
 * The rows the dialog opens with (Qt constructor): the line's split as given;
 * else, for a serial item, one row per piece (received, then free, then
 * damaged; at most 500); else one SALEABLE row (+ one DAMAGED). A row naming
 * another godown keeps its id; its name comes from the godown list.
 */
export function initialAllocRows(
  need: PurchaseAllocNeed,
  entries: readonly PurchaseAllocEntry[],
  makeKey: MakeKey,
  lists: { sizes?: readonly AllocChoice[]; colours?: readonly AllocChoice[]; godowns?: readonly AllocChoice[] } = {},
): AllocRow[] {
  const put = (bucket: PurchaseAllocBucket, entry: Partial<PurchaseAllocEntry>, qty: number, free: number): AllocRow => {
    const godownId = (entry.godownId ?? "").trim() || need.godownId;
    const godownName =
      godownId === need.godownId ? need.godownName : (entry.godownName ?? "").trim() || nameIn(lists.godowns, godownId);
    const sizeId = (entry.sizeId ?? "").trim();
    const colourId = (entry.colourId ?? "").trim();
    return {
      ...blankAllocRow(makeKey()),
      godownId,
      godownName,
      bucket,
      batchNo: (entry.batchNo ?? "").trim(),
      mfgDate: isoFromTyped(entry.mfgDate ?? ""),
      expiryDate: isoFromTyped(entry.expiryDate ?? ""),
      mrp: numberText(entry.mrp),
      serialNo: (entry.serialNo ?? "").trim(),
      warrantyTo: isoFromTyped(entry.warrantyTo ?? ""),
      sizeId,
      sizeName: (entry.sizeName ?? "").trim() || nameIn(lists.sizes, sizeId),
      colourId,
      colourName: (entry.colourName ?? "").trim() || nameIn(lists.colours, colourId),
      model: (entry.model ?? "").trim(),
      qty: numberText(qty),
      free: numberText(free),
    };
  };
  if (entries.length > 0) {
    return entries.map((entry) => put(entry.bucket === "DAMAGED" ? "DAMAGED" : "SALEABLE", entry, entry.qty, entry.freeQty ?? 0));
  }
  const rows: AllocRow[] = [];
  if (need.serial) {
    const received = Math.round(need.received);
    const free = Math.round(need.free);
    const pieces = Math.min(500, Math.round(need.received + need.free + need.damaged));
    for (let index = 0; index < pieces; index += 1) {
      const damaged = index >= received + free;
      const isFree = !damaged && index >= received;
      rows.push(put(damaged ? "DAMAGED" : "SALEABLE", {}, isFree ? 0 : 1, isFree ? 1 : 0));
    }
    return rows;
  }
  if (need.received + need.free > 0) {
    rows.push(put("SALEABLE", {}, need.received, need.free));
  }
  if (need.damaged > 0) {
    rows.push(put("DAMAGED", {}, need.damaged, 0));
  }
  return rows;
}

/** One blank row at the foot, always (Qt `ensureBlankRow`). */
export function withTrailingBlank(rows: readonly AllocRow[], makeKey: MakeKey): AllocRow[] {
  const last = rows[rows.length - 1];
  return !last || allocRowHas(last) ? [...rows, blankAllocRow(makeKey())] : [...rows];
}

/**
 * One cell edited, with what Qt's `cellEdited` does after it: a serial typed
 * on an empty row is one SALEABLE piece; a row that now holds something and
 * names no godown takes the document's.
 */
export function editAllocRow(row: AllocRow, patch: Partial<Omit<AllocRow, "key">>, need: PurchaseAllocNeed): AllocRow {
  const next: AllocRow = { ...row, ...patch };
  if (need.serial && patch.serialNo !== undefined && next.serialNo.trim() !== "" && !next.qty.trim() && !next.free.trim()) {
    next.qty = "1";
  }
  if (allocRowHas(next) && !next.godownId.trim()) {
    next.godownId = need.godownId;
    next.godownName = need.godownName;
  }
  return next;
}

/** May this cell be typed in (Qt `setEditPredicate` + `isEditable`)? */
export function allocCellEditable(column: number, need: Pick<PurchaseAllocNeed, "serial" | "textile">): boolean {
  if (column === ALLOC_COL.serial || column === ALLOC_COL.warrantyTo) {
    return need.serial;
  }
  if (column === ALLOC_COL.model || column === ALLOC_COL.size || column === ALLOC_COL.colour) {
    return need.textile;
  }
  return true;
}

function same(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-6;
}

/**
 * What is wrong with the rows, "" when they can be saved (Qt `problem()`).
 * Rows are numbered as on screen (1-based, blank rows included).
 */
export function allocProblem(rows: readonly AllocRow[], need: PurchaseAllocNeed): string {
  let saleable = 0;
  let damaged = 0;
  let free = 0;
  const serials = new Set<string>();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!allocRowHas(row)) {
      continue;
    }
    const at = `Row ${index + 1}`;
    const qty = num(row.qty);
    const freeQty = num(row.free);
    if (qty < 0 || freeQty < 0 || qty + freeQty <= 0) {
      return `${at}: no qty.`;
    }
    for (const date of [row.mfgDate, row.expiryDate, row.warrantyTo]) {
      if (date.trim() && !isoFromTyped(date)) {
        return `${at}: dates are dd/MM/yyyy.`;
      }
    }
    const isDamaged = row.bucket === "DAMAGED";
    if (need.textile && row.batchNo.trim() && (row.sizeId.trim() || row.colourId.trim() || row.model.trim())) {
      return `${at}: size, colour and model ride on the batch number given on Post — leave Batch blank.`;
    }
    if (isDamaged && freeQty > 0) {
      return `${at}: free goods are not damaged — put them in a SALEABLE row.`;
    }
    if (isDamaged) {
      damaged += qty;
    } else {
      saleable += qty;
    }
    free += freeQty;
    if (need.serial) {
      const serial = row.serialNo.trim();
      if (!serial) {
        return `${at}: no serial number.`;
      }
      if (!same(qty + freeQty, 1)) {
        return `${at}: a serial row is one piece.`;
      }
      if (serials.has(serial.toUpperCase())) {
        return `${at}: serial ${serial} is entered twice.`;
      }
      serials.add(serial.toUpperCase());
    }
  }
  if (!same(saleable, need.received) || !same(damaged, need.damaged) || !same(free, need.free)) {
    return (
      `The rows hold ${qtyText(saleable)} received + ${qtyText(damaged)} damaged + ${qtyText(free)} free; ` +
      `the line says ${qtyText(need.received)} + ${qtyText(need.damaged)} + ${qtyText(need.free)}.`
    );
  }
  return "";
}

/** The ✓ line once the rows add up (Qt `paintSum`). */
export function allocSumText(need: PurchaseAllocNeed): string {
  const want = need.received + need.damaged + need.free;
  return `Σ ${qtyText(want)} = ${qtyText(need.received)} received + ${qtyText(need.damaged)} damaged + ${qtyText(need.free)} free`;
}

/** The inline panel's grey hint beside its title (Qt constructor, embedded). */
export function allocPanelHint(need: Pick<PurchaseAllocNeed, "serial" | "textile">): string {
  if (need.serial) {
    return "one row per piece · count = received";
  }
  return need.textile ? "one row per size × colour · batch given on Post" : "Σ = received + damaged + free";
}

/** The hint over the grid (Qt constructor). */
export function allocHint(need: Pick<PurchaseAllocNeed, "serial" | "textile">): string {
  if (need.serial) {
    return "One row per piece: scan or type each serial number. Damaged pieces go in DAMAGED rows.";
  }
  if (need.textile) {
    return "One row per size × colour (the printed line stays one). Leave Batch blank — the batch number is given on Post.";
  }
  return "One row per batch and bucket. Damaged goods go in a DAMAGED row; free goods in the Free column.";
}

/** The rows as `allocs[]` entries, names kept (Qt `rows()`); blank rows dropped. */
export function allocEntriesOf(rows: readonly AllocRow[], need: PurchaseAllocNeed): PurchaseAllocEntry[] {
  const out: PurchaseAllocEntry[] = [];
  for (const row of rows) {
    if (!allocRowHas(row)) {
      continue;
    }
    const entry: PurchaseAllocEntry = {
      godownId: row.godownId.trim() || need.godownId,
      godownName: row.godownId.trim() ? row.godownName : need.godownName,
      bucket: row.bucket === "DAMAGED" ? "DAMAGED" : "SALEABLE",
      qty: num(row.qty),
    };
    const textValue = (key: "batchNo" | "serialNo" | "sizeId" | "sizeName" | "colourId" | "colourName" | "model", value: string) => {
      if (value.trim()) {
        entry[key] = value.trim();
      }
    };
    textValue("batchNo", row.batchNo);
    textValue("serialNo", row.serialNo);
    textValue("sizeId", row.sizeId);
    textValue("sizeName", row.sizeName);
    textValue("colourId", row.colourId);
    textValue("colourName", row.colourName);
    textValue("model", row.model);
    const dates: [("mfgDate" | "expiryDate" | "warrantyTo"), string][] = [
      ["mfgDate", row.mfgDate],
      ["expiryDate", row.expiryDate],
      ["warrantyTo", row.warrantyTo],
    ];
    for (const [key, value] of dates) {
      const iso = isoFromTyped(value);
      if (iso) {
        entry[key] = iso;
      }
    }
    if (num(row.mrp) > 0) {
      entry.mrp = num(row.mrp);
    }
    if (num(row.free) > 0) {
      entry.freeQty = num(row.free);
    }
    out.push(entry);
  }
  return out;
}

/** Fill in the names a late godown / size / colour list now knows. */
export function nameAllocRows(
  rows: readonly AllocRow[],
  lists: { sizes?: readonly AllocChoice[]; colours?: readonly AllocChoice[]; godowns?: readonly AllocChoice[] },
): AllocRow[] {
  let changed = false;
  const next = rows.map((row) => {
    const godownName = row.godownName || nameIn(lists.godowns, row.godownId);
    const sizeName = row.sizeName || nameIn(lists.sizes, row.sizeId);
    const colourName = row.colourName || nameIn(lists.colours, row.colourId);
    if (godownName === row.godownName && sizeName === row.sizeName && colourName === row.colourName) {
      return row;
    }
    changed = true;
    return { ...row, godownName, sizeName, colourName };
  });
  return changed ? next : (rows as AllocRow[]);
}

// ---------------------------------------------------------------------------
// Ratio pack · Ctrl+P (ENT-13, addendum 1 A2, R24)
// ---------------------------------------------------------------------------

export type RatioPack = {
  model: string;
  /** Ticked colours; none = one colourless set. */
  colours: readonly AllocChoice[];
  /** Sizes with a ratio > 0, in the Size master's order. */
  sizes: readonly (AllocChoice & { ratio: number })[];
  packs: number;
};

/** Pieces per pack, packs × colours, total pieces and rows — the dialog's sum line. */
export function ratioPackSummary(pack: RatioPack): { perPack: number; colours: number; pieces: number; rows: number } {
  const ratios = pack.sizes.filter((size) => size.ratio > 0);
  const perPack = ratios.reduce((sum, size) => sum + size.ratio, 0);
  const colours = Math.max(1, pack.colours.length);
  return { perPack, colours, pieces: perPack * Math.max(0, pack.packs) * colours, rows: ratios.length * colours };
}

/**
 * One SALEABLE row per size × colour, qty = ratio × packs (1 : 2 : 2 : 1 × 3 =
 * 3 / 6 / 6 / 3, per colour). The SALEABLE rows a ratio pack makes — no batch,
 * no serial — and blank rows go; DAMAGED rows and typed batches stay (Qt
 * `applyRatioPack`). New rows go to the document's godown.
 */
export function applyRatioPack(rows: readonly AllocRow[], pack: RatioPack, need: PurchaseAllocNeed, makeKey: MakeKey): AllocRow[] {
  if (pack.packs <= 0) {
    return [...rows];
  }
  const kept = rows.filter(
    (row) => allocRowHas(row) && (row.bucket === "DAMAGED" || row.batchNo.trim() !== "" || row.serialNo.trim() !== ""),
  );
  const colours: readonly AllocChoice[] = pack.colours.length > 0 ? pack.colours : [{ id: "", name: "" }];
  const made: AllocRow[] = [];
  for (const colour of colours) {
    for (const size of pack.sizes) {
      if (size.ratio <= 0) {
        continue;
      }
      made.push({
        ...blankAllocRow(makeKey()),
        godownId: need.godownId,
        godownName: need.godownName,
        bucket: "SALEABLE",
        sizeId: size.id,
        sizeName: size.name,
        colourId: colour.id,
        colourName: colour.name,
        model: pack.model.trim(),
        qty: qtyText(size.ratio * pack.packs),
      });
    }
  }
  return [...kept, ...made];
}

/** A typed ratio cell: whole pieces, blank / junk / negative = 0. */
export function ratioOf(typed: string): number {
  const value = Number.parseInt(typed.trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}
