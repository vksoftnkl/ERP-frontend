/**
 * The count sheet as a reducer — every move the Qt `PhysicalStockEntry` makes
 * on its grid and header, as a pure function. The hook
 * (`use-physical-stock-draft.ts`) owns the network and feeds the answers in.
 */
import {
  DEFAULT_FREEZE_HOURS,
  DEFAULT_RATE_SOURCE,
  RATE_SOURCES,
  STATUS_DRAFT,
} from "./physical-stock.constants";
import {
  addHoursLocal,
  fromWireInstant,
  g13,
  isoDateOf,
  parseCounted,
  round2,
  toNumberOrNull,
} from "./physical-stock.format";
import type {
  CountLine,
  CountSheetRow,
  CountTotals,
  PhysicalStockDocument,
  PhysicalStockDraft,
  PhysicalStockMode,
  PhysicalStockScope,
  PhysicalStockWireHeader,
  PhysicalStockWireLine,
  SessionScope,
} from "./physical-stock.types";

// ---------------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------------

export function blankLine(key: string): CountLine {
  return {
    key,
    sviId: "",
    lineNo: null,
    splitNo: null,
    itemId: "",
    itemCode: "",
    itemName: "",
    unitName: "",
    baseUomId: "",
    lotId: "",
    godownId: "",
    godownName: "",
    bucket: "",
    batchNo: "",
    mfgDate: "",
    expiryDate: "",
    mrp: null,
    salePrice: null,
    serialNo: "",
    supplierId: "",
    supplierName: "",
    bookQty: null,
    countedText: "",
    diffQty: null,
    avgCostRate: null,
    diffValue: null,
    stockValue: null,
    reasonId: "",
    reasonName: "",
    remarks: "",
    barcode: "",
  };
}

function text(value: string | null | undefined): string {
  return value ?? "";
}

/** The identity of a holding: its lot AND its bucket — one lot can sit in two. */
export function holdingKey(lotId: string, bucket: string): string {
  return `${lotId}|${bucket}`;
}

/**
 * One count-sheet row → one grid row (appendHoldingRow / applySheetRows).
 * countedQty arrives null by design: it is the column the screen fills.
 */
export function lineFromSheet(row: CountSheetRow, key: string): CountLine {
  return {
    ...blankLine(key),
    lineNo: toNumberOrNull(row.lineNo),
    splitNo: toNumberOrNull(row.splitNo),
    itemId: text(row.itemId),
    itemCode: text(row.itemCode),
    itemName: text(row.itemName),
    unitName: text(row.unitName),
    baseUomId: text(row.baseUomId),
    // Sent back VERBATIM — it is why a count line never needs lot resolution.
    lotId: text(row.lotId),
    godownId: text(row.godownId),
    godownName: text(row.godownName),
    bucket: text(row.bucket),
    batchNo: text(row.batchNo),
    mfgDate: isoDateOf(row.mfgDate),
    expiryDate: isoDateOf(row.expiryDate),
    mrp: toNumberOrNull(row.mrp),
    salePrice: toNumberOrNull(row.salePrice),
    serialNo: text(row.serialNo),
    supplierId: text(row.supplierId),
    bookQty: toNumberOrNull(row.bookQty),
    avgCostRate: toNumberOrNull(row.avgCostRate),
    stockValue: toNumberOrNull(row.stockValue),
  };
}

/** A typed count as the cell keeps it: blank stays blank, a number keeps its text. */
function countedTextOf(value: PhysicalStockWireLine["countedQty"]): string {
  const parsed = toNumberOrNull(value);
  return parsed === null ? "" : String(g13(parsed));
}

/**
 * One SAVED line → one grid row (applyLines). The line carries no average
 * cost, so `avgByHolding` — taken from whatever the grid held before — keeps
 * the variance valued after a save; a fresh load gets it later from
 * `refillAverageCosts`.
 */
export function lineFromWire(
  wire: PhysicalStockWireLine,
  key: string,
  avgByHolding: ReadonlyMap<string, number | null>,
): CountLine {
  const countedText = countedTextOf(wire.countedQty);
  // diffQty is GENERATED server-side; it is read, never re-derived here.
  const diffQty = toNumberOrNull(wire.diffQty);
  const holding = holdingKey(text(wire.lotId), text(wire.bucket));
  const known = avgByHolding.has(holding);
  const avgCostRate = known ? (avgByHolding.get(holding) ?? null) : null;
  return {
    ...blankLine(key),
    sviId: text(wire.sviId),
    lineNo: toNumberOrNull(wire.lineNo),
    splitNo: toNumberOrNull(wire.splitNo),
    itemId: text(wire.itemId),
    itemCode: text(wire.itemCode),
    itemName: text(wire.itemName),
    unitName: text(wire.unitName),
    baseUomId: text(wire.baseUomId),
    lotId: text(wire.lotId),
    godownId: text(wire.godownId),
    godownName: text(wire.godownName),
    bucket: text(wire.bucket),
    batchNo: text(wire.batchNo),
    mfgDate: isoDateOf(wire.mfgDate),
    expiryDate: isoDateOf(wire.expiryDate),
    mrp: toNumberOrNull(wire.mrp),
    salePrice: toNumberOrNull(wire.salePrice),
    serialNo: text(wire.serialNo),
    supplierId: text(wire.supplierId),
    supplierName: text(wire.supplierName),
    reasonId: text(wire.reasonId),
    reasonName: text(wire.reasonName),
    remarks: text(wire.remarks),
    bookQty: toNumberOrNull(wire.bookQty),
    countedText,
    diffQty,
    avgCostRate,
    diffValue:
      known && countedText !== "" ? round2((diffQty ?? 0) * (avgCostRate ?? 0)) : null,
  };
}

/**
 * counted − book, and roughly what that is worth (recalcRow). An uncounted
 * line is NOT a line counted as zero: its difference stays blank.
 */
export function recalcLine(line: CountLine): CountLine {
  if (line.countedText.trim() === "") {
    return { ...line, diffQty: null, diffValue: null };
  }
  const diff = g13(parseCounted(line.countedText) - (line.bookQty ?? 0));
  return { ...line, diffQty: diff, diffValue: round2(diff * (line.avgCostRate ?? 0)) };
}

/** The totals bar (recalcTotals) — holdings only; the blank row is not a line. */
export function computeTotals(lines: readonly CountLine[]): CountTotals {
  let count = 0;
  let counted = 0;
  let varianceLines = 0;
  let netQty = 0;
  let netValue = 0;
  for (const line of lines) {
    if (!line.lotId) {
      continue;
    }
    count += 1;
    if (line.countedText.trim() === "") {
      continue;
    }
    counted += 1;
    const diff = line.diffQty ?? 0;
    if (diff !== 0) {
      varianceLines += 1;
      netQty += diff;
      netValue += line.diffValue ?? 0;
    }
  }
  return {
    lines: count,
    counted,
    varianceLines,
    netQty: g13(netQty),
    netValue: round2(netValue),
  };
}

/** Whether any row on screen is a holding — "any rows" is not "any lines". */
export function hasHoldings(lines: readonly CountLine[]): boolean {
  return lines.some((line) => Boolean(line.lotId));
}

function nextKey(seq: number): [string, number] {
  return [`row-${seq}`, seq + 1];
}

/**
 * ONE blank row at the bottom, always — somewhere to scan or pick the next
 * holding into. "Blank" means no holding: a row with a lot is a real line even
 * before anything is counted on it.
 */
export function ensureTrailingBlank(
  lines: readonly CountLine[],
  seq: number,
): { lines: CountLine[]; seq: number } {
  const last = lines[lines.length - 1];
  if (last && !last.lotId) {
    return { lines: [...lines], seq };
  }
  const [key, next] = nextKey(seq);
  return { lines: [...lines, blankLine(key)], seq: next };
}

/** applyLines — a saved document onto the grid, plus the blank row. */
export function applyWireLines(
  wireLines: readonly PhysicalStockWireLine[],
  previous: readonly CountLine[],
  seq: number,
): { lines: CountLine[]; seq: number } {
  const avgByHolding = new Map<string, number | null>();
  for (const line of previous) {
    if (line.lotId) {
      avgByHolding.set(holdingKey(line.lotId, line.bucket), line.avgCostRate);
    }
  }
  let cursor = seq;
  const lines = wireLines.map((wire) => {
    const [key, next] = nextKey(cursor);
    cursor = next;
    return lineFromWire(wire, key, avgByHolding);
  });
  // + the blank row: a saved draft is still being counted.
  return ensureTrailingBlank(lines, cursor);
}

export type HoldingInsert = {
  lines: CountLine[];
  seq: number;
  added: number;
  already: number;
  /** Where the first added holding landed. */
  index: number;
};

/**
 * Every holding of one item, added from the blank row on down (one pick can be
 * several rows: a batch-tracked item is several holdings). A holding already on
 * the sheet is skipped — counted twice is wrong twice. The scanned symbol stays
 * on the first row it landed on.
 */
export function insertHoldings(
  lines: readonly CountLine[],
  rowKey: string,
  holdings: readonly CountSheetRow[],
  seq: number,
): HoldingInsert {
  const index = lines.findIndex((line) => line.key === rowKey);
  if (index < 0) {
    return { lines: [...lines], seq, added: 0, already: 0, index: -1 };
  }
  const target = lines[index];
  const onSheet = new Set(
    lines.filter((line) => line.lotId).map((line) => holdingKey(line.lotId, line.bucket)),
  );
  let cursor = seq;
  let already = 0;
  const added: CountLine[] = [];
  for (const holding of holdings) {
    const identity = holdingKey(holding.lotId, holding.bucket);
    if (onSheet.has(identity)) {
      already += 1;
      continue;
    }
    onSheet.add(identity);
    const [key, next] = nextKey(cursor);
    cursor = next;
    added.push(lineFromSheet(holding, key));
  }
  if (added.length > 0 && target.barcode) {
    added[0] = { ...added[0], barcode: target.barcode };
  }
  const merged =
    added.length > 0
      ? [...lines.slice(0, index), ...added, ...lines.slice(index + 1)]
      : [...lines];
  const trailing = ensureTrailingBlank(merged, cursor);
  return { lines: trailing.lines, seq: trailing.seq, added: added.length, already, index };
}

/** refillAverageCosts — the godown's sheet supplies the average a saved line lacks. */
export function refillAverageCosts(
  lines: readonly CountLine[],
  sheet: readonly CountSheetRow[],
): CountLine[] {
  const avg = new Map<string, number | null>();
  for (const row of sheet) {
    avg.set(holdingKey(row.lotId, row.bucket), toNumberOrNull(row.avgCostRate));
  }
  return lines.map((line) => {
    const key = holdingKey(line.lotId, line.bucket);
    if (!line.lotId || !avg.has(key) || line.avgCostRate !== null) {
      return line;
    }
    return recalcLine({ ...line, avgCostRate: avg.get(key) ?? null });
  });
}

// ---------------------------------------------------------------------------
// The draft
// ---------------------------------------------------------------------------

export type DraftSeed = {
  scope: SessionScope;
  /** ISO `yyyy-mm-dd` — the count date a new sheet starts on. */
  today: string;
  /** Local `yyyy-mm-ddTHH:mm` — where the default freeze window starts. */
  now: string;
  blind?: boolean;
};

/** resetScreenState — a blank sheet, one blank row, the window inert until ticked. */
export function createDraft(seed: DraftSeed): PhysicalStockDraft {
  return {
    companyId: seed.scope.companyId,
    branchId: seed.scope.branchId,
    accYear: seed.scope.accYear,
    deviceId: seed.scope.deviceId,
    svhId: "",
    refno: "",
    status: STATUS_DRAFT,
    mode: "entry",
    dirty: false,
    docDate: seed.today,
    godownId: "",
    godownName: "",
    reasonId: "",
    reasonName: "",
    rateSource: DEFAULT_RATE_SOURCE,
    usrRefno: "",
    remarks: "",
    freezeStock: false,
    // "Now, for the next three hours" is the shape a count actually takes.
    freezeFrom: seed.now,
    freezeTo: addHoursLocal(seed.now, DEFAULT_FREEZE_HOURS),
    blind: seed.blind ?? false,
    lines: [blankLine("row-0")],
    audit: "",
    scope: seed.scope.accYear,
    seq: 1,
  };
}

export function isEditable(draft: Pick<PhysicalStockDraft, "mode" | "status">): boolean {
  return draft.mode === "entry" && draft.status === STATUS_DRAFT;
}

function scopeLabel(godownName: string, accYear: string): string {
  return godownName ? `${godownName} · ${accYear}` : accYear;
}

function rateSourceOf(value: string | null | undefined): string {
  const code = (value ?? "").trim();
  return (RATE_SOURCES as readonly string[]).includes(code) ? code : DEFAULT_RATE_SOURCE;
}

export type HeaderField = "docDate" | "rateSource" | "usrRefno" | "remarks";

export type PhysicalStockAction =
  | { type: "reset"; seed: DraftSeed }
  | { type: "startNext"; seed: DraftSeed }
  | { type: "scopeSeeded"; scope: SessionScope }
  | { type: "headerSet"; field: HeaderField; value: string }
  | { type: "godownSelected"; id: string; name: string }
  | { type: "reasonSelected"; id: string; name: string }
  | { type: "freezeToggled"; on: boolean }
  | { type: "freezeWindowSet"; field: "freezeFrom" | "freezeTo"; value: string }
  | { type: "blindSet"; blind: boolean }
  | { type: "sheetApplied"; rows: readonly CountSheetRow[]; godownName: string }
  | { type: "holdingsAdded"; rowKey: string; holdings: readonly CountSheetRow[]; itemName: string }
  | { type: "blankRowCleared"; rowKey: string }
  | { type: "countedSet"; rowKey: string; text: string }
  | { type: "remarksSet"; rowKey: string; text: string }
  | { type: "barcodeTyped"; rowKey: string; text: string }
  | { type: "barcodeCommitted"; rowKey: string }
  | { type: "reasonPicked"; rowKey: string; id: string; name: string }
  | { type: "documentSaved"; document: PhysicalStockDocument }
  | {
      type: "documentLoaded";
      document: PhysicalStockDocument;
      scope: PhysicalStockScope;
      openForEdit: boolean;
    }
  | { type: "averageCostsRefilled"; rows: readonly CountSheetRow[] }
  | { type: "statusApplied"; status: string }
  | { type: "modeSet"; mode: PhysicalStockMode }
  | { type: "auditSet"; text: string };

function updateLine(
  draft: PhysicalStockDraft,
  rowKey: string,
  change: (line: CountLine) => CountLine,
): CountLine[] {
  return draft.lines.map((line) => (line.key === rowKey ? change(line) : line));
}

/** onGridCellEdited — an edit marks the sheet dirty and keeps a spare row. */
function edited(draft: PhysicalStockDraft, lines: CountLine[]): PhysicalStockDraft {
  const trailing = ensureTrailingBlank(lines, draft.seq);
  return { ...draft, lines: trailing.lines, seq: trailing.seq, dirty: true };
}

/** applyHeader — a fetched document's header onto the screen. */
function headerApplied(
  draft: PhysicalStockDraft,
  header: PhysicalStockWireHeader,
  scope: PhysicalStockScope,
): PhysicalStockDraft {
  const accYear = (header.accYear ?? "").trim() || scope.accYear;
  const freeze = header.freezeStock === true;
  const godownName = text(header.godownName);
  return {
    ...draft,
    companyId: scope.companyId,
    branchId: scope.branchId,
    accYear,
    deviceId: (header.deviceId ?? "").trim() || draft.deviceId,
    svhId: text(header.svhId),
    refno: text(header.refno),
    status: (header.status ?? "").trim() || STATUS_DRAFT,
    docDate: isoDateOf(header.docDate),
    godownId: text(header.godownId),
    godownName,
    reasonId: text(header.reasonId),
    reasonName: text(header.reasonName),
    usrRefno: text(header.usrRefno),
    remarks: text(header.remarks),
    rateSource: rateSourceOf(header.rateSource),
    freezeStock: freeze,
    freezeFrom: freeze ? fromWireInstant(header.freezeFrom) || draft.freezeFrom : draft.freezeFrom,
    freezeTo: freeze ? fromWireInstant(header.freezeTo) || draft.freezeTo : draft.freezeTo,
    scope: scopeLabel(godownName, accYear),
  };
}

export function physicalStockReducer(
  draft: PhysicalStockDraft,
  action: PhysicalStockAction,
): PhysicalStockDraft {
  switch (action.type) {
    case "reset":
      return createDraft({ ...action.seed, blind: draft.blind });

    case "startNext": {
      // The godown, date and rate source describe the RUN — a stocktake walks
      // several godowns in one session — so the next sheet keeps them.
      const fresh = createDraft({ ...action.seed, blind: draft.blind });
      return {
        ...fresh,
        godownId: draft.godownId,
        godownName: draft.godownName,
        docDate: draft.docDate || fresh.docDate,
        rateSource: rateSourceOf(draft.rateSource),
        scope: scopeLabel(draft.godownId ? draft.godownName : "", fresh.accYear),
      };
    }

    case "scopeSeeded":
      // The business context arriving late re-seeds a clean screen only.
      if (draft.svhId || draft.dirty) {
        return draft;
      }
      return {
        ...draft,
        companyId: action.scope.companyId,
        branchId: action.scope.branchId,
        accYear: action.scope.accYear,
        deviceId: action.scope.deviceId,
        scope: scopeLabel(draft.godownId ? draft.godownName : "", action.scope.accYear),
      };

    case "headerSet":
      return { ...draft, [action.field]: action.value, dirty: true };

    case "godownSelected": {
      // Changing the godown invalidates every line on screen: a count sheet is
      // ONE godown's holdings, and the lines already carry their lot ids.
      const changed = action.id !== draft.godownId;
      const next = { ...draft, godownId: action.id, godownName: action.name, dirty: true };
      if (!changed || draft.lines.length <= 1) {
        return next;
      }
      const [key, seq] = nextKey(draft.seq);
      return {
        ...next,
        lines: [blankLine(key)],
        seq,
        audit: `Godown changed to ${action.name} — load the count sheet again.`,
      };
    }

    case "reasonSelected":
      return { ...draft, reasonId: action.id, reasonName: action.name, dirty: true };

    case "freezeToggled":
      return { ...draft, freezeStock: action.on, dirty: true };

    case "freezeWindowSet":
      return { ...draft, [action.field]: action.value };

    case "blindSet":
      return {
        ...draft,
        blind: action.blind,
        audit: action.blind
          ? "Blind count — the book figure is hidden until you turn this off."
          : "",
      };

    case "sheetApplied": {
      let cursor = draft.seq;
      const lines = action.rows.map((row) => {
        const [key, next] = nextKey(cursor);
        cursor = next;
        return lineFromSheet(row, key);
      });
      // + the blank row to scan into.
      const [blank, seq] = nextKey(cursor);
      return {
        ...draft,
        lines: [...lines, blankLine(blank)],
        seq,
        dirty: true,
        audit: `${action.rows.length} holdings to count in ${action.godownName}.`,
      };
    }

    case "holdingsAdded": {
      const result = insertHoldings(draft.lines, action.rowKey, action.holdings, draft.seq);
      if (result.index < 0) {
        return draft;
      }
      return {
        ...draft,
        lines: result.lines,
        seq: result.seq,
        dirty: true,
        audit:
          result.already > 0
            ? `${action.itemName} — ${result.added} holding(s) added, ${result.already} already on the sheet.`
            : `${action.itemName} — ${result.added} holding(s) added.`,
      };
    }

    case "blankRowCleared":
      return {
        ...draft,
        lines: updateLine(draft, action.rowKey, (line) =>
          line.lotId ? line : { ...line, barcode: "" },
        ),
      };

    case "countedSet":
      return edited(
        draft,
        updateLine(draft, action.rowKey, (line) =>
          line.lotId ? recalcLine({ ...line, countedText: action.text }) : line,
        ),
      );

    case "remarksSet":
      return edited(
        draft,
        updateLine(draft, action.rowKey, (line) =>
          line.lotId ? { ...line, remarks: action.text } : line,
        ),
      );

    case "barcodeTyped":
      return {
        ...draft,
        lines: updateLine(draft, action.rowKey, (line) =>
          line.lotId ? line : { ...line, barcode: action.text },
        ),
      };

    case "barcodeCommitted":
      return edited(draft, draft.lines);

    case "reasonPicked":
      return {
        ...draft,
        dirty: true,
        lines: updateLine(draft, action.rowKey, (line) =>
          // Nothing to explain on a row that is not yet a holding.
          line.lotId
            ? { ...line, reasonId: action.id, reasonName: action.name }
            : { ...line, reasonId: "", reasonName: "" },
        ),
      };

    case "documentSaved": {
      // Repainted from the server's answer: it owns the line ids and has
      // REFRESHED every book quantity to what stock_balance says now.
      const header = action.document.header;
      const repainted = applyWireLines(action.document.lines ?? [], draft.lines, draft.seq);
      return {
        ...draft,
        svhId: text(header?.svhId) || draft.svhId,
        refno: text(header?.refno) || draft.refno,
        status: (header?.status ?? "").trim() || STATUS_DRAFT,
        dirty: false,
        lines: repainted.lines,
        seq: repainted.seq,
      };
    }

    case "documentLoaded": {
      const withHeader = headerApplied(draft, action.document.header, action.scope);
      const repainted = applyWireLines(action.document.lines ?? [], draft.lines, draft.seq);
      const editable = action.openForEdit && withHeader.status === STATUS_DRAFT;
      return {
        ...withHeader,
        lines: repainted.lines,
        seq: repainted.seq,
        dirty: false,
        mode: editable ? "entry" : "browse",
      };
    }

    case "averageCostsRefilled":
      return { ...draft, lines: refillAverageCosts(draft.lines, action.rows) };

    case "statusApplied":
      return { ...draft, status: action.status.trim() || STATUS_DRAFT };

    case "modeSet":
      return { ...draft, mode: action.mode };

    case "auditSet":
      return { ...draft, audit: action.text };

    default:
      return draft;
  }
}
