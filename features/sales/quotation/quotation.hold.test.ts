/**
 * Contract tests for parking a cart in `txn_hold` and pulling it back.
 *
 * These are the tests that catch a hold the API will reject, and — more easily
 * missed — one it will happily *accept* while quietly losing the cart: a create
 * missing its immutable scope, an update that re-sends it, a `txh_payload`
 * envelope another version could half-read, a negative parked total.
 *
 * The route is `POST /txn-holds/create` and every column is `txh_*`: this is the
 * till-wide table that replaced `transaction_hold`, and nothing about the old
 * `th_*` shape survived the move. The DTO declares everything but the payload
 * optional and defers "required on create" to the service, so a missing field is
 * a 400 rather than a type error — which is what most of the create tests below
 * are guarding.
 */
import { describe, expect, it } from "vitest";
import { recalcDocument } from "@/domain/pricing";
import {
  HOLD_NO_MAX_LENGTH,
  HOLD_UI_STATE_KIND,
  HOLD_UI_STATE_VERSION,
  QUOTATION_HOLD_DOC_TYPE,
  QUOTATION_HOLD_KIND,
  QUOTATION_HOLD_PARTY_TYPE,
  QUOTATION_HOLD_SRC_MODULE,
} from "./quotation.constants";
import {
  buildHoldPayload,
  draftFromHold,
  holdAccYearOf,
  holdConversionOf,
  holdHolderLabel,
  holdLeaseIsLive,
  holdLockMessage,
  holdLockScope,
  isHoldInUse,
  isQuotationHold,
  nextHoldNo,
  nextHoldSlno,
  readHoldUiState,
} from "./quotation.hold";
import type { SaveActor } from "./quotation.payload";
import { createDraft, createDraftLine } from "./quotation.state";
import type { QuotationDraft, TxnHoldPayload } from "./quotation.types";
import { accountingYearOf, todayIso } from "./quotation.utils";

const DEVICE_MASTER_ID = "019e7257-ec4c-79a3-bad6-99faf77c536c";
const ACTOR: SaveActor = {
  userId: "019c6f6c-be87-7a11-8905-36092c46fe05",
  userName: "vijay",
  sessionId: "3f1c9d3e-6b1e-4c8f-9a55-2c3d4e5f6a7b",
  // This browser's own id, which only the document columns take…
  deviceId: "device-abc",
  // …and the registered `device_master` row, which is the one `txn_hold`'s
  // foreign key wants.
  deviceMasterId: DEVICE_MASTER_ID,
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

function holdRow(overrides: Partial<TxnHoldPayload> = {}): TxnHoldPayload {
  return {
    txhId: HOLD_ID,
    txhCompanyId: COMPANY_ID,
    txhBranchId: BRANCH_ID,
    txhTenantId: null,
    txhAccYear: ACC_YEAR,
    txhKind: QUOTATION_HOLD_KIND,
    txhSrcModule: QUOTATION_HOLD_SRC_MODULE,
    txhDocType: QUOTATION_HOLD_DOC_TYPE,
    txhHoldNo: "QH260805113000-A1B2",
    txhHoldSlno: 1,
    txhHoldOn: NOW.toISOString(),
    txhDeviceId: DEVICE_MASTER_ID,
    txhCounterId: null,
    txhSessionId: null,
    txhHeldBy: ACTOR.userId,
    txhPartyType: QUOTATION_HOLD_PARTY_TYPE,
    txhPartyId: null,
    txhPartyName: "Acme",
    txhPartyMobile: null,
    txhStaffId: null,
    txhRefLabel: null,
    txhItemCount: 1,
    txhTotalQty: "10",
    txhNetAmount: "1180",
    txhPayload: null,
    txhPayloadVersion: 1,
    txhRevision: 1,
    txhStatus: "HELD",
    txhHoldReason: null,
    txhRemarks: null,
    txhExpiresOn: null,
    txhLockedBy: null,
    txhLockedDeviceId: null,
    txhLockedOn: null,
    txhLockExpiresOn: null,
    txhLockToken: null,
    txhResumedBy: null,
    txhResumedOn: null,
    txhResumeCount: 0,
    txhConvertedDocId: null,
    txhConvertedAccYear: null,
    txhConvertedRefno: null,
    txhConvertedOn: null,
    txhConvertedBy: null,
    txhIsStockReserved: false,
    txhPrintCount: 0,
    txhLastPrintedOn: null,
    txhIsDeleted: false,
    txhSyncDate: null,
    txhCreatedOn: NOW.toISOString(),
    txhCreatedBy: ACTOR.userId,
    txhModifiedOn: null,
    txhModifiedBy: null,
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
  it("takes the char(9) fiscal year as it stands", () => {
    // `txh_acc_year` is CHAR(9) — the same nine characters the partition bound
    // is written with, and the same form the draft already carries.
    expect(holdAccYearOf("2026-2027")).toBe("2026-2027");
  });

  it("refuses anything that is not one rather than guessing", () => {
    // The scope is immutable once the row exists, so a wrong year is forever.
    expect(holdAccYearOf("")).toBeNull();
    expect(holdAccYearOf("2026")).toBeNull();
    expect(holdAccYearOf(null)).toBeNull();
  });
});

describe("nextHoldSlno", () => {
  const scope = { companyId: COMPANY_ID, branchId: BRANCH_ID, accYear: ACC_YEAR };

  it("is a positive integer inside the int4 column", () => {
    const slno = nextHoldSlno(scope, NOW);
    expect(Number.isInteger(slno)).toBe(true);
    expect(slno).toBeGreaterThanOrEqual(1);
    expect(slno).toBeLessThan(2_147_483_647);
  });

  // With no `localStorage` behind it (a server render, or storage denied) the
  // serial is seeded from the clock rather than from 1: this browser's device
  // id is the login's `device_master` row, which a second browser on the same
  // login shares, and two counters both starting at 1 would collide on
  // `ux_txh_device_slno` every single time.
  it("seeds from the clock, not from 1", () => {
    expect(nextHoldSlno(scope, NOW)).toBeGreaterThan(1_000_000);
  });

  it("rises with the clock, so a later hold never reuses an earlier serial", () => {
    const later = new Date(NOW.getTime() + 60_000);
    expect(nextHoldSlno(scope, later)).toBeGreaterThan(nextHoldSlno(scope, NOW));
  });
});

describe("buildHoldPayload — create", () => {
  const draft = baseDraft();
  const payload = buildHoldPayload(draft, pricingOf(draft), ACTOR, {
    holdNo: "QH260805113000-A1B2",
    holdSlno: 7,
    now: NOW,
  });

  it("sends every field the service requires on create", () => {
    expect(payload.txhCompanyId).toBe(COMPANY_ID);
    expect(payload.txhBranchId).toBe(BRANCH_ID);
    expect(payload.txhAccYear).toBe(ACC_YEAR);
    expect(payload.txhSrcModule).toBe(QUOTATION_HOLD_SRC_MODULE);
    expect(payload.txhDocType).toBe(QUOTATION_HOLD_DOC_TYPE);
    expect(payload.txhHoldNo).toBe("QH260805113000-A1B2");
    expect(payload.txhHoldSlno).toBe(7);
    expect(payload.txhHeldBy).toBe(ACTOR.userId);
    expect(payload.txhPayload).toBeTypeOf("object");
  });

  it("names the registered device, not the browser's own id", () => {
    // `txh_device_id` is a foreign key into `fixed.device_master`; the local
    // uuid `sq_device_id` carries matches no row there, so sending it would be
    // a 400 on every hold.
    expect(payload.txhDeviceId).toBe(DEVICE_MASTER_ID);
    expect(payload.txhDeviceId).not.toBe(ACTOR.deviceId);
  });

  it("never sends txhSessionId", () => {
    // It means the till's SHIFT / day session, which this screen never opens.
    // The JWT's `sid` is not one and would be a foreign key violation.
    expect(payload.txhSessionId).toBeUndefined();
  });

  it("counts the parked lines, not the grid's rows", () => {
    expect(draft.lines).toHaveLength(2);
    expect(payload.txhItemCount).toBe(1);
  });

  it("parks it as a HELD quotation hold, not an autosave or a template", () => {
    expect(payload.txhStatus).toBe("HELD");
    expect(payload.txhKind).toBe(QUOTATION_HOLD_KIND);
    expect(payload.txhDocType).toBe(QUOTATION_HOLD_DOC_TYPE);
  });

  it("summarises the cart for the held list", () => {
    expect(payload.txhPartyName).toBe("Acme");
    expect(payload.txhTotalQty).toBe(10);
    expect(payload.txhNetAmount).toBeGreaterThan(0);
    expect(payload.txhRemarks).toBe("call before delivery");
  });

  it("types the party wherever it names one", () => {
    // `ck_txh_party_typed` — an id with no type is unresolvable, because the
    // reference is polymorphic and no foreign key says which master it came
    // from. A type with no id is fine: that is a walk-in.
    expect(payload.txhPartyType).toBe(QUOTATION_HOLD_PARTY_TYPE);
    expect(payload.txhPartyId).toBeNull();

    const picked = {
      ...draft,
      customer: { ...draft.customer, custId: "019f659c-3942-7237-89b0-c4899603dd7a" },
    };
    const withParty = buildHoldPayload(picked, pricingOf(picked), ACTOR, {
      holdNo: "QH1",
      holdSlno: 1,
      now: NOW,
    });
    expect(withParty.txhPartyId).toBe("019f659c-3942-7237-89b0-c4899603dd7a");
    expect(withParty.txhPartyType).toBe(QUOTATION_HOLD_PARTY_TYPE);
  });

  it("keeps the parked totals non-negative", () => {
    // `ck_txh_amounts` is signs only — a deduction-heavy cart can price below
    // zero and the column refuses it.
    const negative = { ...draft, charges: [] };
    const priced = pricingOf(negative);
    const clamped = buildHoldPayload(
      negative,
      { ...priced, totals: { ...priced.totals, bill: -500, totQty: -1 } },
      ACTOR,
      { holdNo: "QH1", holdSlno: 1, now: NOW },
    );
    expect(clamped.txhNetAmount).toBe(0);
    expect(clamped.txhTotalQty).toBe(0);
  });

  it("carries both the create body and the screen state in txh_payload", () => {
    const state = readHoldUiState(payload.txhPayload);
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
    holdSlno: 99,
    now: NOW,
  });

  it("updates that hold instead of parking a second one", () => {
    expect(payload.txhId).toBe(HOLD_ID);
  });

  it("does not resend the immutable scope", () => {
    // The year is half the primary key AND the partition key: the row cannot
    // move to another partition, so the server refuses to change it.
    expect(payload.txhCompanyId).toBeUndefined();
    expect(payload.txhBranchId).toBeUndefined();
    expect(payload.txhAccYear).toBeUndefined();
  });

  it("leaves the stored hold number and serial alone", () => {
    // Re-sending them would re-run two uniqueness checks for nothing.
    expect(payload.txhHoldNo).toBeUndefined();
    expect(payload.txhHoldSlno).toBeUndefined();
  });

  it("still sends the payload — that is what a re-park is for", () => {
    // `txhPayload` is the one field the DTO actually requires, and an update
    // that omitted it would leave the stored cart at the last version.
    expect(readHoldUiState(payload.txhPayload)?.draft.lines[0].itemName).toBe("New Claw");
  });

  it("does not touch the status — that is /release's job", () => {
    // The row is LOCKED to this device while it is being re-parked, and only
    // `/release` puts it back to HELD *and* clears the lease. Writing HELD here
    // would leave `txh_locked_device_id` pointing at a device that has moved
    // on, and the next operator would find a free-looking hold nobody can take.
    expect(payload.txhStatus).toBeUndefined();
    // The lease columns are not even on the DTO — they are the lock endpoints'
    // to move, never the save route's.
    expect(payload).not.toHaveProperty("txhLockedDeviceId");
    expect(payload).not.toHaveProperty("txhLockToken");
  });
});

describe("readHoldUiState", () => {
  const draft = baseDraft();
  const good = buildHoldPayload(draft, pricingOf(draft), ACTOR, { holdNo: "QH1", holdSlno: 1, now: NOW })
    .txhPayload;

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
    expect(isQuotationHold(holdRow({ txhPayload: good }))).toBe(true);
    expect(isQuotationHold(holdRow({ txhPayload: { cart: [] } }))).toBe(false);
  });
});

describe("draftFromHold", () => {
  const draft = baseDraft();
  const uiState = readHoldUiState(
    buildHoldPayload(draft, pricingOf(draft), ACTOR, { holdNo: "QH1", holdSlno: 1, now: NOW }).txhPayload,
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

  // `txh_payload` is written by whatever version parked the cart, so a field
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
      txhCompanyId: COMPANY_ID,
      txhBranchId: BRANCH_ID,
      txhAccYear: ACC_YEAR,
    });
  });

  it("sends nothing else — the device is a header, and a stray key 400s", () => {
    expect(Object.keys(holdLockScope(holdRow())).sort()).toEqual([
      "txhAccYear",
      "txhBranchId",
      "txhCompanyId",
    ]);
  });
});

describe("holdConversionOf", () => {
  it("stamps the document the hold became, and its own year", () => {
    // There is no converted doc TYPE to send — a hold becomes the document it
    // was parked as, so the stored `txh_doc_type` already names the table. The
    // YEAR does travel with the id: a March hold can become an April document,
    // and `ck_txh_converted_block` wants the whole trail together.
    const conversion = holdConversionOf(
      {
        sqId: "019fb1db-1654-7ef5-88e8-7dbbed0dc3ee",
        sqAccYear: "2026-2027",
        quoteRefno: "QT-0001",
      },
      ACTOR,
    );
    expect(conversion.txhConvertedDocId).toBe("019fb1db-1654-7ef5-88e8-7dbbed0dc3ee");
    expect(conversion.txhConvertedAccYear).toBe("2026-2027");
    expect(conversion.txhConvertedRefno).toBe("QT-0001");
    expect(conversion.txhConvertedBy).toBe(ACTOR.userId);
    expect(conversion).not.toHaveProperty("txhConvertedDocType");
  });

  it("leaves the status and the instant to the server", () => {
    // `/convert` sets CONVERTED and stamps `txh_converted_on` itself; a client
    // clock has no business deciding when a hold closed.
    const conversion = holdConversionOf(
      { sqId: "x", sqAccYear: "2026-2027", quoteRefno: null },
      ACTOR,
    );
    expect(conversion).not.toHaveProperty("txhStatus");
    expect(conversion).not.toHaveProperty("txhConvertedOn");
    expect(conversion.txhConvertedRefno).toBeNull();
  });
});

describe("isHoldInUse / holdHolderLabel", () => {
  const future = new Date(NOW.getTime() + 15 * 60_000).toISOString();
  const past = new Date(NOW.getTime() - 60_000).toISOString();

  it("reads a live lease as in use, and names the device holding it", () => {
    const locked = holdRow({
      txhStatus: "LOCKED",
      txhLockedDeviceId: "TILL-02",
      txhLockExpiresOn: future,
    });
    expect(isHoldInUse(locked, NOW)).toBe(true);
    expect(holdHolderLabel(locked)).toBe("TILL-02");
  });

  // The lease ENDS. A till that died mid-edit strands its cart only until then,
  // and the server hands it to the next device that asks with no take-over — so
  // the picker must offer it rather than greying it out forever.
  it("reads a LAPSED lease as free", () => {
    const lapsed = holdRow({
      txhStatus: "LOCKED",
      txhLockedDeviceId: "TILL-02",
      txhLockExpiresOn: past,
    });
    expect(holdLeaseIsLive(lapsed, NOW)).toBe(false);
    expect(isHoldInUse(lapsed, NOW)).toBe(false);
  });

  // What "in use" means for a row driven through the CRUD route: a status with
  // no lease on it at all, which force-release is what clears.
  it("reads a RESUMED row as in use, falling back to the user", () => {
    const resumed = holdRow({
      txhStatus: "RESUMED",
      txhLockedDeviceId: null,
      txhResumedBy: "user-7",
    });
    expect(isHoldInUse(resumed, NOW)).toBe(true);
    expect(holdHolderLabel(resumed)).toBe("user-7");
  });

  it("never reads as free just because nobody is named", () => {
    // `ck_txh_lock_block` makes a LOCKED row with no lease impossible; if one
    // ever arrives it is in use, not up for grabs.
    const nameless = holdRow({
      txhStatus: "LOCKED",
      txhLockedDeviceId: null,
      txhLockedBy: null,
      txhResumedBy: null,
    });
    expect(isHoldInUse(nameless, NOW)).toBe(true);
    expect(holdHolderLabel(nameless)).toBe("another device");
  });

  it("leaves a free hold alone", () => {
    expect(isHoldInUse(holdRow(), NOW)).toBe(false);
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
