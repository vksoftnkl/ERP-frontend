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
  buildConvertedPayload,
  buildHoldPayload,
  buildResumePayload,
  draftFromHold,
  holdAccYearOf,
  holdDeviceTypeOf,
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
    customer: { ...draft.customer, name: "Acme" },
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

  it("puts a resumed cart back to HELD", () => {
    expect(payload.thStatus).toBe("HELD");
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
  });
});

describe("buildResumePayload", () => {
  it("takes the hold out of the picker without closing it", () => {
    const payload = buildResumePayload(holdRow({ thResumeCount: 2 }), ACTOR, NOW);
    expect(payload.thId).toBe(HOLD_ID);
    // RESUMED is not terminal: the row survives a browser that dies mid-edit.
    expect(payload.thStatus).toBe("RESUMED");
    expect(payload.thResumeCount).toBe(3);
    expect(payload.thResumedBy).toBe(ACTOR.userId);
  });
});

describe("buildConvertedPayload", () => {
  it("stamps both halves of the polymorphic reference", () => {
    // `thConvertedDocId` with no type leaves the reference unresolvable, and
    // CONVERTED without the id and the instant is a 400.
    const payload = buildConvertedPayload(
      HOLD_ID,
      { sqId: "019fb1db-1654-7ef5-88e8-7dbbed0dc3ee", quoteRefno: "QT-0001" },
      ACTOR,
      NOW,
    );
    expect(payload.thStatus).toBe("CONVERTED");
    expect(payload.thConvertedDocType).toBe(QUOTATION_HOLD_DOC_TYPE);
    expect(payload.thConvertedDocId).toBe("019fb1db-1654-7ef5-88e8-7dbbed0dc3ee");
    expect(payload.thConvertedAt).toBe(NOW.toISOString());
    expect(payload.thConvertedNo).toBe("QT-0001");
  });
});
