/**
 * Contract tests for parking a cart in `transaction_hold` and pulling it back.
 *
 * These are the tests that catch a hold the API will reject, and — more easily
 * missed — one it will happily *accept* while quietly losing the cart: a create
 * missing its immutable scope, an update that re-sends it, a `th_ui_state`
 * envelope another version could half-read, a negative parked total.
 *
 * Every expectation below was checked against the running module
 * (`POST /transaction-holds/create`), not inferred from the DTO: the DTO
 * declares every field optional and defers "required on create" to the service.
 */
import { describe, expect, it } from "vitest";
import { recalcDocument } from "@/domain/pricing";
import {
  HOLD_NO_MAX_LENGTH,
  HOLD_UI_STATE_KIND,
  HOLD_UI_STATE_VERSION,
  QUOTATION_HOLD_DOC_TYPE,
} from "./quotation.constants";
import {
  buildHoldPayload,
  draftFromHold,
  holdAccYearOf,
  holdConversionOf,
  holdDeviceTypeOf,
  holdHolderLabel,
  holdLockMessage,
  holdLockScope,
  isHoldInUse,
  isQuotationHold,
  nextHoldNo,
  readHoldUiState,
} from "./quotation.hold";
import type { SaveActor } from "./quotation.payload";
import { createDraft, createDraftLine } from "./quotation.state";
import type { QuotationDraft, TransactionHoldPayload } from "./quotation.types";
import { accountingYearOf, todayIso } from "./quotation.utils";

const ACTOR: SaveActor = {
  userId: "019c6f6c-be87-7a11-8905-36092c46fe05",
  userName: "vijay",
  sessionId: "3f1c9d3e-6b1e-4c8f-9a55-2c3d4e5f6a7b",
  deviceId: "device-abc",
  deviceType: "web",
};

const COMPANY_ID = "019c6f6c-be87-7a11-8905-36092c46fe02";
const BRANCH_ID = "019c6f6c-be87-7a11-8905-36092c46fe03";
const HOLD_ID = "019fd07b-8368-7af8-8d7f-009ae9995273";
const QUOTE_DATE = todayIso();
const ACC_YEAR = accountingYearOf(QUOTE_DATE);
const NOW = new Date("2026-08-05T11:30:00.000Z");

function baseDraft(): QuotationDraft {
  const draft = createDraft({
    companyId: COMPANY_ID,
    branchId: BRANCH_ID,
    accYear: ACC_YEAR,
    companyStateCode: "33",
    quoteDate: QUOTE_DATE,
  });
  return {
    ...draft,
    // A customer picked from the master, so the document's own copy of the name
    // and the master's own start out agreeing.
    customer: { ...draft.customer, name: "Acme", masterName: "Acme" },
    terms: { ...draft.terms, remarks: "call before delivery" },
    lines: [
      createDraftLine({
        itemId: "019f7e83-2511-711b-9aa5-60fc1b3c0a1c",
        itemUnitId: "019f7e83-2534-7c88-8262-b25efc0f93f3",
        itemName: "New Claw",
        billQty: 10,
        toBaseFactor: 1,
        rate: 100,
        gstPerc: 18,
        cgstPerc: 9,
        sgstPerc: 9,
        igstPerc: 18,
      }),
      // The trailing blank row every grid keeps open. Not a parked line.
      createDraftLine(),
    ],
  };
}

function pricingOf(draft: QuotationDraft) {
  return recalcDocument(draft.lines, draft.charges, draft.policy, {
    isLocalSale: draft.isLocalSale,
    hasFreight: draft.header.hasFreight,
    hasLoad: draft.header.hasLoad,
    hasUnload: draft.header.hasUnload,
  });
}

function holdRow(overrides: Partial<TransactionHoldPayload> = {}): TransactionHoldPayload {
  return {
    thId: HOLD_ID,
    thCompanyId: COMPANY_ID,
    thBranchId: BRANCH_ID,
    thAccYear: 2026,
    thHoldNo: "QH260805113000-A1B2",
    thHoldDate: NOW.toISOString(),
    thDocType: QUOTATION_HOLD_DOC_TYPE,
    thCounterId: null,
    thSessionId: null,
    thUserId: ACTOR.userId,
    thDeviceId: "device-abc",
    thDeviceType: "WEB",
    thCustomerName: "Acme",
    thItemCount: 1,
    thTotalQty: "10",
    thTotalAmount: "1180",
    thStatus: "HELD",
    thHoldReason: null,
    thRemarks: null,
    thExpiresAt: null,
    thLockedBy: null,
    thLockedAt: null,
    thResumedBy: null,
    thResumedAt: null,
    thResumeCount: 0,
    thConvertedDocType: null,
    thConvertedDocId: null,
    thConvertedNo: null,
    thConvertedAt: null,
    thConvertedBy: null,
    thIsStockReserved: false,
    thUiState: null,
    thIsDeleted: false,
    thCreatedBy: ACTOR.userId,
    thCreatedAt: NOW.toISOString(),
    thModifiedBy: null,
    thModifiedAt: null,
    ...overrides,
  };
}

describe("nextHoldNo", () => {
  it("fits the varchar(30) column", () => {
    expect(nextHoldNo(NOW).length).toBeLessThanOrEqual(HOLD_NO_MAX_LENGTH);
  });

  it("stamps the clock and a tail, so two tills in one second do not collide", () => {
    // Stamped in LOCAL time, like `todayIso()` — the number is a label an
    // operator reads off the held list, not an instant anything compares.
    const numbers = Array.from({ length: 50 }, () => nextHoldNo(NOW));
    for (const value of numbers) {
      expect(value).toMatch(/^QH\d{12}-[0-9A-Z]{4}$/);
      expect(value.slice(0, 14)).toBe(numbers[0].slice(0, 14));
    }
    expect(new Set(numbers).size).toBeGreaterThan(1);
  });
});

describe("holdAccYearOf", () => {
  it("takes the starting year of the char(9) fiscal year", () => {
    expect(holdAccYearOf("2026-2027")).toBe(2026);
  });

  it("refuses what it cannot convert rather than guessing", () => {
    // The scope is immutable once the row exists, so a wrong year is forever.
    expect(holdAccYearOf("")).toBeNull();
    expect(holdAccYearOf("FY26")).toBeNull();
  });
});

describe("holdDeviceTypeOf", () => {
  it("normalises the session's free-text value into the checked set", () => {
    expect(holdDeviceTypeOf("desktop")).toBe("DESKTOP");
  });

  it("falls back to the browser default for anything outside it", () => {
    expect(holdDeviceTypeOf("Chrome/141")).toBe("WEB");
    expect(holdDeviceTypeOf(null)).toBe("WEB");
  });
});

describe("buildHoldPayload — create", () => {
  const draft = baseDraft();
  const payload = buildHoldPayload(draft, pricingOf(draft), ACTOR, {
    holdNo: "QH260805113000-A1B2",
    now: NOW,
  });

  it("sends the six fields the service requires on create", () => {
    expect(payload.thCompanyId).toBe(COMPANY_ID);
    expect(payload.thBranchId).toBe(BRANCH_ID);
    expect(payload.thAccYear).toBe(Number(ACC_YEAR.slice(0, 4)));
    expect(payload.thHoldNo).toBe("QH260805113000-A1B2");
    expect(payload.thDeviceId).toBe("device-abc");
    expect(payload.thDeviceType).toBe("WEB");
  });

  it("never sends thSessionId", () => {
    // The service checks it against `user_login_sessions.ulsId` (the row's PK)
    // while the client only holds the JWT's `sid`, stored in `ulsSessionId`.
    // Sending it is a guaranteed 400, not an occasional one.
    expect(payload.thSessionId).toBeUndefined();
  });

  it("counts the parked lines, not the grid's rows", () => {
    expect(draft.lines).toHaveLength(2);
    expect(payload.thItemCount).toBe(1);
  });

  it("parks it as HELD under the quotation document type", () => {
    expect(payload.thStatus).toBe("HELD");
    expect(payload.thDocType).toBe(QUOTATION_HOLD_DOC_TYPE);
  });

  it("summarises the cart for the held list", () => {
    expect(payload.thCustomerName).toBe("Acme");
    expect(payload.thTotalQty).toBe(10);
    expect(payload.thTotalAmount).toBeGreaterThan(0);
    expect(payload.thRemarks).toBe("call before delivery");
  });

  it("keeps the parked total non-negative", () => {
    // `ck_th_total_amount` — a deduction-heavy cart can price below zero and
    // the column refuses it.
    const negative = { ...draft, charges: [] };
    const priced = pricingOf(negative);
    const clamped = buildHoldPayload(
      negative,
      { ...priced, totals: { ...priced.totals, bill: -500 } },
      ACTOR,
      { holdNo: "QH1", now: NOW },
    );
    expect(clamped.thTotalAmount).toBe(0);
  });

  it("carries both the create body and the screen state in th_ui_state", () => {
    const state = readHoldUiState(payload.thUiState);
    expect(state).not.toBeNull();
    // The quotation contract, readable by anything that knows it…
    expect(state?.quotation.sqCompanyId).toBe(COMPANY_ID);
    expect(state?.quotation.items).toHaveLength(1);
    // …and the screen state, which is what can actually redraw the grid: the
    // create body has no room for the item name.
    expect(state?.draft.lines[0].itemName).toBe("New Claw");
  });
});

describe("buildHoldPayload — update", () => {
  const draft = { ...baseDraft(), holdId: HOLD_ID, holdNo: "QH260805113000-A1B2" };
  const payload = buildHoldPayload(draft, pricingOf(draft), ACTOR, {
    holdId: HOLD_ID,
    holdNo: "QH-IGNORED",
    now: NOW,
  });

  it("updates that hold instead of parking a second one", () => {
    expect(payload.thId).toBe(HOLD_ID);
  });

  it("does not resend the immutable scope", () => {
    expect(payload.thCompanyId).toBeUndefined();
    expect(payload.thBranchId).toBeUndefined();
    expect(payload.thAccYear).toBeUndefined();
  });

  it("leaves the stored hold number alone", () => {
    // Re-sending it would re-run the uniqueness check for nothing.
    expect(payload.thHoldNo).toBeUndefined();
  });

  it("does not touch the status — that is /release's job", () => {
    // The row is LOCKED to this device while it is being re-parked, and only
    // `/release` puts it back to HELD *and* clears `th_locked_by`. Writing HELD
    // here would leave the lock pointing at a device that has moved on, and the
    // next operator would find a free-looking hold nobody can take.
    expect(payload.thStatus).toBeUndefined();
    // `thLockedBy` is not even on the DTO — the lock columns are the lock
    // endpoints' to move, never the save route's.
    expect(payload).not.toHaveProperty("thLockedBy");
  });
});

describe("readHoldUiState", () => {
  const draft = baseDraft();
  const good = buildHoldPayload(draft, pricingOf(draft), ACTOR, { holdNo: "QH1", now: NOW })
    .thUiState;

  it("accepts what this screen wrote", () => {
    expect(readHoldUiState(good)?.kind).toBe(HOLD_UI_STATE_KIND);
  });

  it("refuses a hold parked by another screen", () => {
    expect(readHoldUiState({ cart: [], total: 10 })).toBeNull();
    expect(readHoldUiState(null)).toBeNull();
    expect(readHoldUiState([])).toBeNull();
  });

  it("refuses an envelope from another version rather than half-reading it", () => {
    expect(readHoldUiState({ ...good, version: HOLD_UI_STATE_VERSION + 1 })).toBeNull();
  });

  it("refuses one with no draft to restore", () => {
    expect(readHoldUiState({ ...good, draft: undefined })).toBeNull();
  });

  it("is what isQuotationHold filters the picker on", () => {
    expect(isQuotationHold(holdRow({ thUiState: good }))).toBe(true);
    expect(isQuotationHold(holdRow({ thUiState: { cart: [] } }))).toBe(false);
  });
});

describe("draftFromHold", () => {
  const draft = baseDraft();
  const uiState = readHoldUiState(
    buildHoldPayload(draft, pricingOf(draft), ACTOR, { holdNo: "QH1", now: NOW }).thUiState,
  )!;
  const restored = draftFromHold(holdRow(), uiState);

  it("comes back editable and priced live", () => {
    // A parked cart is unfinished work, not a saved document: there is nothing
    // "stored" to paint and no read-only state to respect.
    expect(restored.mode).toBe("entry");
    expect(restored.pricing).toBe("live");
    expect(restored.storedPricing).toBeNull();
  });

  it("comes back clean — the work is safe in the hold row", () => {
    expect(restored.isDirty).toBe(false);
  });

  it("remembers which hold it came from", () => {
    expect(restored.holdId).toBe(HOLD_ID);
    expect(restored.holdNo).toBe("QH260805113000-A1B2");
  });

  it("keeps the cart intact", () => {
    expect(restored.lines[0].itemName).toBe("New Claw");
    expect(restored.customer.name).toBe("Acme");
    expect(restored.customer.masterName).toBe("Acme");
  });

  // `th_ui_state` is written by whatever version parked the cart, so a field
  // added to the draft afterwards is absent from rows already in the table.
  // `customer.masterName` was split out of `customer.name` after carts were
  // parked; restoring one as `undefined` flips the Existing Customer combobox
  // from uncontrolled to controlled and drops what is typed into it.
  it("fills in a customer field a cart was parked before", () => {
    const legacy = JSON.parse(JSON.stringify(uiState)) as typeof uiState;
    delete (legacy.draft.customer as Partial<typeof legacy.draft.customer>).masterName;

    const fromLegacy = draftFromHold(holdRow(), legacy);

    // The document's own copy of the name — what that box showed before the
    // two were told apart.
    expect(fromLegacy.customer.masterName).toBe("Acme");
    expect(fromLegacy.customer.name).toBe("Acme");
  });

  it("leaves a walk-in's blank master name blank rather than borrowing the typed one", () => {
    // A cart with no master record behind it: the combobox has nothing to name,
    // and the hand-keyed name belongs to the document alone.
    const walkIn = JSON.parse(JSON.stringify(uiState)) as typeof uiState;
    walkIn.draft.customer.custId = null;
    walkIn.draft.customer.masterName = "";
    walkIn.draft.customer.name = "CASH SALE";

    expect(draftFromHold(holdRow(), walkIn).customer.masterName).toBe("");
  });
});

describe("holdLockScope", () => {
  it("keys the transition on the row's own tenant, not the screen's", () => {
    // A hold is scoped once, at create, and can never be re-scoped — so the
    // row's values are the ones the server compares against. Sending whatever
    // the screen is showing would answer 404 the moment its context moved on.
    expect(holdLockScope(holdRow())).toEqual({
      thCompanyId: COMPANY_ID,
      thBranchId: BRANCH_ID,
    });
  });

  it("sends nothing else — the device is a header, and a stray key 400s", () => {
    expect(Object.keys(holdLockScope(holdRow())).sort()).toEqual(["thBranchId", "thCompanyId"]);
  });
});

describe("holdConversionOf", () => {
  it("stamps both halves of the polymorphic reference", () => {
    // `thConvertedDocId` with no type leaves the reference unresolvable.
    const conversion = holdConversionOf(
      { sqId: "019fb1db-1654-7ef5-88e8-7dbbed0dc3ee", quoteRefno: "QT-0001" },
      ACTOR,
    );
    expect(conversion.thConvertedDocType).toBe(QUOTATION_HOLD_DOC_TYPE);
    expect(conversion.thConvertedDocId).toBe("019fb1db-1654-7ef5-88e8-7dbbed0dc3ee");
    expect(conversion.thConvertedNo).toBe("QT-0001");
    expect(conversion.thConvertedBy).toBe(ACTOR.userId);
  });

  it("leaves the status and the instant to the server", () => {
    // `/convert` sets CONVERTED and stamps `th_converted_at` itself; a client
    // clock has no business deciding when a hold closed.
    const conversion = holdConversionOf({ sqId: "x", quoteRefno: null }, ACTOR);
    expect(conversion).not.toHaveProperty("thStatus");
    expect(conversion).not.toHaveProperty("thConvertedAt");
    expect(conversion.thConvertedNo).toBeNull();
  });
});

describe("isHoldInUse / holdHolderLabel", () => {
  it("reads LOCKED as in use, and names the device holding it", () => {
    const locked = holdRow({ thStatus: "LOCKED", thLockedBy: "TILL-02" });
    expect(isHoldInUse(locked)).toBe(true);
    expect(holdHolderLabel(locked)).toBe("TILL-02");
  });

  // Parked before the lock existed: "in use" was a status with no device on it.
  it("reads a pre-lock RESUMED row as in use, falling back to the user", () => {
    const legacy = holdRow({ thStatus: "RESUMED", thLockedBy: null, thResumedBy: "user-7" });
    expect(isHoldInUse(legacy)).toBe(true);
    expect(holdHolderLabel(legacy)).toBe("user-7");
  });

  it("never reads as free just because nobody is named", () => {
    const nameless = holdRow({ thStatus: "LOCKED", thLockedBy: null, thResumedBy: null });
    expect(isHoldInUse(nameless)).toBe(true);
    expect(holdHolderLabel(nameless)).toBe("another device");
  });

  it("leaves a free hold alone", () => {
    expect(isHoldInUse(holdRow())).toBe(false);
  });
});

describe("holdLockMessage", () => {
  const refusal = (status: number, message?: string) => ({
    status,
    ...(message ? { data: { success: false, message, errors: [] } } : {}),
  });

  it("prefers the server's message, which names the device holding it", () => {
    expect(holdLockMessage(refusal(409, "Hold is LOCKED by device TILL-02"), "QH1")).toBe(
      "Hold is LOCKED by device TILL-02",
    );
  });

  it("still says something useful when the server sent no message", () => {
    expect(holdLockMessage(refusal(409), "QH1")).toContain("already open on another device");
    expect(holdLockMessage(refusal(403), "QH1")).toContain("take it over");
  });

  // A discarded hold is not a lock problem, and telling the operator to take it
  // over would send them after a row that is gone.
  it("calls a missing hold what it is", () => {
    expect(holdLockMessage(refusal(404, "Hold not found"), "QH1")).toBe(
      "Hold QH1 no longer exists — it was discarded from the held list.",
    );
  });

  it("falls back for anything else, including a dead network", () => {
    expect(holdLockMessage(undefined, "QH1")).toBe("Hold QH1 could not be updated.");
  });
});
