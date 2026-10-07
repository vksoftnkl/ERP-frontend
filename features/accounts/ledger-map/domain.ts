/**
 * Posting Ledger Map — every rule the screen applies, as pure functions.
 *
 * Twenty-odd roles, set up once, lived with for years. The screen's job is not
 * data entry: it is to make the mapping LEGIBLE and a wrong one hard to save,
 * because a wrong mapping does not fail — it posts money to the wrong account,
 * silently, and the first anybody knows is a trial balance that will not
 * explain itself months later.
 */
import type {
  LedgerMapRolePayload,
  LedgerMapRow,
  LedgerMapStatus,
  PickedLedger,
  SaveLedgerMapBody,
} from "./ledger-map.types";

// ---------------------------------------------------------------------------
// The words the server sends, and the words an operator reads
// ---------------------------------------------------------------------------

/**
 * `alr_group`. FUTURE is the one worth spelling out: those roles are mapped and
 * nothing posts them yet, so an operator comparing the list against their own
 * books should not go looking for the voucher that uses them.
 */
const GROUP_WORDS: Record<string, string> = {
  REVENUE: "Revenue",
  OUTPUT_TAX: "Output tax",
  PURCHASE: "Purchase",
  INPUT_TAX: "Input tax",
  SHARED: "Shared",
  RECEIPT: "Receipt",
  FUTURE: "Not yet posted",
};

/** One document of `usedBy[]`. */
const DOCUMENT_WORDS: Record<string, string> = {
  RECEIPT: "Receipt",
  PAYMENT: "Payment",
  CHEQUE: "Cheques",
  SALE_BILL: "Sale bill",
  PURCHASE_BILL: "Purchase bill",
  OPENING_BALANCE: "Opening balance",
  JOURNAL: "Journal",
};

/** An unknown code is shown as it arrived: the server's vocabularies grow. */
export function groupLabel(code: string): string {
  return GROUP_WORDS[code] ?? code;
}

export function documentLabel(code: string): string {
  return DOCUMENT_WORDS[code] ?? code;
}

/**
 * "Receipt, Cheques" — or a sentence when nothing posts the role yet, which is
 * also exactly when `/delete` will allow the mapping to be removed. The blank
 * is information, not a gap.
 */
export function usedByLabel(codes: readonly string[]): string {
  return codes.length === 0 ? "nothing posts it yet" : codes.map(documentLabel).join(", ");
}

// ---------------------------------------------------------------------------
// The row
// ---------------------------------------------------------------------------

function text(value: string | null | undefined): string {
  return typeof value === "string" ? value : "";
}

/**
 * The payload with its nulls folded.
 *
 * `isActive` is null on an UNMAPPED role, and true is right there: a row that
 * does not exist is not a parked one. The ledger flags default the same way —
 * "no ledger" is reported by the Status chip as Not mapped, never as gone.
 */
export function rowFromPayload(payload: LedgerMapRolePayload): LedgerMapRow {
  return {
    role: text(payload.role),
    label: text(payload.label) || text(payload.role),
    group: text(payload.group),
    sortOrder: Number.isFinite(payload.sortOrder) ? payload.sortOrder : 0,
    expectedLedgerType: text(payload.expectedLedgerType),
    expectedDutyHead: text(payload.expectedDutyHead),
    expectedGroupNature: text(payload.expectedGroupNature),
    roleIsActive: payload.roleIsActive !== false,
    usedBy: Array.isArray(payload.usedBy) ? payload.usedBy.filter((code) => Boolean(code)) : [],
    almId: payload.almId || null,
    ledgerId: text(payload.ledgerId),
    ledgerName: text(payload.ledgerName),
    ledgerType: "",
    ledgerIsActive: payload.ledgerIsActive !== false,
    ledgerIsDeleted: payload.ledgerIsDeleted === true,
    isActive: payload.isActive !== false,
    remarks: text(payload.remarks),
  };
}

export function isMapped(row: LedgerMapRow): boolean {
  return row.ledgerId !== "";
}

/**
 * Whether anything the product posts today would break if this row were wrong.
 * `/delete` refuses on exactly this.
 */
export function isPostedByAnything(row: LedgerMapRow): boolean {
  return row.usedBy.length > 0;
}

/**
 * The three expectations, stated in the order they narrow: the type, then the
 * duty head that tells CGST from SGST, then the nature.
 */
export function needsLabel(row: LedgerMapRow): string {
  const parts = [row.expectedLedgerType, row.expectedDutyHead, row.expectedGroupNature].filter(
    (part) => part !== "",
  );
  return parts.length === 0 ? "any ledger" : parts.join(" · ");
}

/**
 * A role resolves only through a row that is present AND active, pointed at a
 * ledger that still exists. Three states in the database, one consequence — so
 * the chip names which, and everything else treats them alike.
 */
export function statusOf(row: LedgerMapRow): LedgerMapStatus {
  if (!isMapped(row)) {
    return "Not mapped";
  }
  if (!row.isActive) {
    return "Off";
  }
  if (row.ledgerIsDeleted || !row.ledgerIsActive) {
    return "Ledger gone";
  }
  return "Mapped";
}

/** The amber row, the red count. */
export function doesNotResolve(row: LedgerMapRow): boolean {
  return statusOf(row) !== "Mapped";
}

/**
 * The backstop, not the rule. Grid 105 filters by the role's wanted type, duty
 * head AND nature, so a wrong ledger cannot normally be offered; this checks
 * only the TYPE, because that is the one axis the picked row carries.
 *
 * An empty expectation is not a licence — it is the server saying it does not
 * check that axis — and an empty picked type is a grid that did not say.
 */
export function fitsLocally(row: LedgerMapRow, pickedLedgerType: string): boolean {
  if (row.expectedLedgerType === "" || pickedLedgerType === "") {
    return true;
  }
  return row.expectedLedgerType.toUpperCase() === pickedLedgerType.trim().toUpperCase();
}

/**
 * The row after a pick, or `null` when the pick is not an edit.
 *
 * Picking the ledger a role already points at would put a row in the audit
 * trail saying something changed on a day nothing did. The picker's SQL offers
 * only live ledgers, so a freshly picked one is neither deleted nor inactive,
 * whatever the row said a moment ago.
 */
export function applyPick(row: LedgerMapRow, picked: PickedLedger): LedgerMapRow | null {
  if (picked.ledgerId === row.ledgerId && row.isActive) {
    return null;
  }
  return {
    ...row,
    ledgerId: picked.ledgerId,
    ledgerName: picked.ledgerName,
    ledgerType: picked.ledgerType,
    ledgerIsActive: true,
    ledgerIsDeleted: false,
  };
}

/**
 * Whether the operator changed this row since the server last described it.
 *
 * Compared against the loaded copy rather than tracked as a flag: typing a
 * remark and deleting it again is not a change, and Save must not send it.
 */
export function isRowDirty(row: LedgerMapRow, loaded: LedgerMapRow | undefined): boolean {
  if (!loaded) {
    return true;
  }
  return row.ledgerId !== loaded.ledgerId || row.remarks.trim() !== loaded.remarks.trim();
}

/**
 * What `SaveLedgerMapDto` wants.
 *
 * `almId` travels whenever the role HAS one. Leaving it off a mapped role is not
 * "create instead of update" — it is a 409 naming the role.
 *
 * `isActive` is echoed rather than omitted. The screen offers no way to park a
 * mapping — that would be a silent unmap that walks straight past `/delete`'s
 * in-use guard — so sending back what the server last reported is the screen
 * saying "I did not touch this".
 *
 * An empty remark goes as an explicit `null`: omitted, the server would keep the
 * old one, and a cleared remark would come back on the next load.
 */
export function toSaveBody(row: LedgerMapRow): SaveLedgerMapBody {
  const remarks = row.remarks.trim();
  return {
    ...(row.almId ? { almId: row.almId } : {}),
    role: row.role,
    ledgerId: row.ledgerId,
    isActive: row.isActive,
    remarks: remarks === "" ? null : remarks,
  };
}

// ---------------------------------------------------------------------------
// The header
// ---------------------------------------------------------------------------

export type MapHealth = {
  total: number;
  /** Roles that WILL NOT POST: unmapped, parked, or pointed at a gone ledger. */
  broken: number;
  /**
   * The broken roles a deployed document already posts. Not a setup task for one
   * day — a voucher that will refuse the next time somebody takes money.
   */
  brokenAndPosted: string[];
};

export function mapHealth(rows: readonly LedgerMapRow[]): MapHealth {
  let broken = 0;
  const brokenAndPosted: string[] = [];
  for (const row of rows) {
    if (!doesNotResolve(row)) {
      continue;
    }
    broken += 1;
    if (isPostedByAnything(row)) {
      brokenAndPosted.push(row.label);
    }
  }
  return { total: rows.length, broken, brokenAndPosted };
}

/** The pill: green only at zero. There is no "mostly fine". */
export function healthPillText(health: MapHealth): string {
  return health.broken === 0
    ? `ALL ${health.total} MAPPED`
    : `${health.broken} WILL NOT POST`;
}

// ---------------------------------------------------------------------------
// The server's own words
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The refusal as the server wrote it.
 *
 * `LedgerMapErrorResponseDto` carries `errors[]` of `{field, message}`, and those
 * messages name the ledger, its type and the documents that post the role —
 * "DISCOUNT_ALLOWED is used by RECEIPT. Point it at a different ledger instead of
 * removing it." Nothing the client could compose is better. The envelope's own
 * `message` ("That role is already mapped") is only the fallback, for a 401, a
 * 500 or a dropped connection.
 */
export function serverSentence(error: unknown, fallback = "The server refused the request."): string {
  const data = isRecord(error) && isRecord(error.data) ? error.data : null;
  if (data && Array.isArray(data.errors)) {
    const messages = data.errors
      .map((entry) => (isRecord(entry) && typeof entry.message === "string" ? entry.message.trim() : ""))
      .filter((message) => message !== "");
    if (messages.length > 0) {
      return messages.join(" ");
    }
  }
  if (data && typeof data.message === "string" && data.message.trim() !== "") {
    return data.message.trim();
  }
  if (isRecord(error) && typeof error.error === "string" && error.error.trim() !== "") {
    return error.error.trim();
  }
  return fallback;
}
