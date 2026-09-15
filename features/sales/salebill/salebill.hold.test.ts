/**
 * Sale Bill Entry — holds and crash recovery (§12).
 *
 * The section where the Qt design does not port: files under
 * `AppLocalDataLocation/salebill/` become a server-side hold (so a cart parked at
 * one counter can be resumed at another) and an IndexedDB snapshot (so a counter
 * that dies loses nothing).
 *
 * Only the pure halves are tested here — the envelope, the payload builder and
 * the two guards. The IndexedDB reader and writer are exercised by the screen;
 * they are deliberately written to fail SILENTLY when the store is unavailable,
 * because crash recovery must never stop a counter opening.
 */
import { describe, expect, it } from "vitest";
import { recalcDocument, type DocumentPricing } from "@/domain/pricing";
import type { SaveActor } from "@/features/sales/quotation/quotation.payload";
import type { TxnHoldPayload } from "@/features/sales/quotation/quotation.types";
import {
  SALE_BILL_HOLD_DOC_TYPE,
  SALE_BILL_HOLD_KIND,
  SALE_BILL_UI_STATE_KIND,
  SALE_BILL_UI_STATE_SCREEN,
} from "./salebill.constants";
import {
  buildBillHoldPayload,
  draftFromAutosave,
  draftFromBillHold,
  isBillHold,
  isWorthAutosaving,
  readBillHoldUiState,
  type BillAutosave,
} from "./salebill.hold";
import { createBillDraft, createBillDraftLine } from "./salebill.state";
import type { SaleBillDraft } from "./salebill.types";

const CONTEXT = {
  companyId: "11111111-1111-1111-1111-111111111111",
  branchId: "22222222-2222-2222-2222-222222222222",
  accYear: "2026-2027",
  companyStateCode: "33",
  companyStateName: "Tamil Nadu",
  billDate: "2026-09-12",
  billDatetime: "2026-09-12T09:30:00",
};

const ACTOR: SaveActor = {
  userId: "33333333-3333-3333-3333-333333333333",
  userName: "counter1",
  sessionId: null,
  deviceId: "browser-abc",
  deviceMasterId: "55555555-5555-5555-5555-555555555555",
  deviceType: "WEB",
};

function cart(overrides: Partial<SaleBillDraft> = {}): SaleBillDraft {
  const base = createBillDraft(CONTEXT);
  return {
    ...base,
    customer: { ...base.customer, custId: "cust-1", name: "ACME", phone: "99999" },
    lines: [
      createBillDraftLine({
        itemId: "i1",
        itemName: "TEAK PLANK",
        itemUnitId: "u1",
        godownId: "g1",
        billQty: 4,
        rate: 250,
        gstPerc: 18,
        cgstPerc: 9,
        sgstPerc: 9,
        stockQty: 100,
        stockGateResolved: true,
      }),
    ],
    ...overrides,
  };
}

function priceOf(draft: SaleBillDraft): DocumentPricing {
  return recalcDocument(draft.lines, draft.charges, draft.policy, {
    isLocalSale: draft.isLocalSale,
    hasFreight: false,
    hasLoad: false,
    hasUnload: false,
  });
}

// ---------------------------------------------------------------------------
// The envelope
// ---------------------------------------------------------------------------

describe("the txh_payload envelope", () => {
  const body = buildBillHoldPayload(cart(), priceOf(cart()), ACTOR, {
    holdNo: "BIL260912093000-AB12",
    holdSlno: 1234,
  });

  it("stamps kind, screen and version on the way in", () => {
    // `txn_hold` is ONE shared table — the till parks carts in it and so does
    // the quotation screen — so the stamp is the only thing that says which
    // screen wrote a row.
    const state = readBillHoldUiState(body.txhPayload);
    expect(state?.kind).toBe(SALE_BILL_UI_STATE_KIND);
    expect(state?.screen).toBe(SALE_BILL_UI_STATE_SCREEN);
  });

  it("refuses another screen's cart rather than mis-drawing it", () => {
    expect(readBillHoldUiState({ kind: "erp.quotation.hold", draft: {} })).toBeNull();
    expect(readBillHoldUiState({ kind: SALE_BILL_UI_STATE_KIND, screen: "till" })).toBeNull();
    expect(readBillHoldUiState(null)).toBeNull();
    expect(readBillHoldUiState("a string")).toBeNull();
  });

  it("carries BOTH halves — the save body and the screen state", () => {
    // The save payload alone cannot redraw the grids: `sbiItemName`,
    // `sbiUnitName`, the godown name and the charge ledger names are
    // response-only fields a create body has no room for, so a cart restored
    // from `bill` alone would come back with every Description cell blank.
    const state = readBillHoldUiState(body.txhPayload);
    expect(state?.bill.items?.[0].sbiItemId).toBe("i1");
    expect(state?.draft.lines[0].itemName).toBe("TEAK PLANK");
  });

  it("scopes a NEW hold and says which document type it will become", () => {
    expect(body.txhCompanyId).toBe(CONTEXT.companyId);
    expect(body.txhAccYear).toBe("2026-2027");
    expect(body.txhDocType).toBe(SALE_BILL_HOLD_DOC_TYPE);
    expect(body.txhKind).toBe(SALE_BILL_HOLD_KIND);
    expect(body.txhStatus).toBe("HELD");
    // A real foreign key into `fixed.device_master` — the device the LOGIN
    // registered, never the browser's own local uuid.
    expect(body.txhDeviceId).toBe(ACTOR.deviceMasterId);
  });

  it("does NOT re-send the scope on an update — it is immutable server-side", () => {
    const update = buildBillHoldPayload(cart(), priceOf(cart()), ACTOR, { holdId: "txh-1" });
    expect(update.txhId).toBe("txh-1");
    expect(update.txhCompanyId).toBeUndefined();
    expect(update.txhAccYear).toBeUndefined();
    expect(update.txhHoldNo).toBeUndefined();
    // …but the payload goes on both, because a re-park is exactly what an
    // update is for.
    expect(update.txhPayload).toBeDefined();
  });

  it("summarises the cart for the picker, without ever going negative", () => {
    // `ck_txh_amounts` — signs only, and all three are non-negative even on a
    // deduction-heavy cart.
    expect(body.txhPartyName).toBe("ACME");
    expect(body.txhItemCount).toBe(1);
    expect(body.txhNetAmount).toBeGreaterThan(0);
    expect(body.txhTotalQty).toBeGreaterThanOrEqual(0);
  });

  it("counts the PARKED lines, not the grid's rows", () => {
    // The grid always keeps a blank row waiting; it is not a line anybody
    // parked.
    const withBlank = cart({
      lines: [...cart().lines, createBillDraftLine()],
    });
    const summary = buildBillHoldPayload(withBlank, priceOf(withBlank), ACTOR, { holdNo: "X" });
    expect(summary.txhItemCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Resuming
// ---------------------------------------------------------------------------

function holdRow(payload: unknown): TxnHoldPayload {
  return {
    txhId: "txh-1",
    txhHoldNo: "BIL260912093000-AB12",
    txhPayload: payload,
  } as TxnHoldPayload;
}

describe("draftFromBillHold — a cart survives being resumed at another counter", () => {
  const body = buildBillHoldPayload(cart(), priceOf(cart()), ACTOR, { holdNo: "X" });
  const state = readBillHoldUiState(body.txhPayload)!;
  const resumed = draftFromBillHold(holdRow(body.txhPayload), state);

  it("comes back editable, live-priced and CLEAN", () => {
    // A parked cart is unfinished work, not a saved document: there is nothing
    // "stored" to paint. It is clean because the work is safe in the hold row,
    // so the discard guard has nothing to warn about yet.
    expect(resumed.mode).toBe("entry");
    expect(resumed.pricing).toBe("live");
    expect(resumed.isDirty).toBe(false);
    expect(resumed.storedPricing).toBeNull();
  });

  it("keeps every line and the customer, so the counter sees what was parked", () => {
    expect(resumed.lines).toHaveLength(1);
    expect(resumed.lines[0].itemName).toBe("TEAK PLANK");
    expect(resumed.customer.name).toBe("ACME");
  });

  it("remembers WHICH hold it is, so re-parking updates rather than duplicates", () => {
    expect(resumed.holdId).toBe("txh-1");
    expect(resumed.holdNo).toBe("BIL260912093000-AB12");
  });

  it("resets the stock gate — the cart may have sat for an hour", () => {
    expect(resumed.lines[0].stockGateResolved).toBe(false);
  });

  it("is recognised by the picker, and another screen's row is not", () => {
    expect(isBillHold(holdRow(body.txhPayload))).toBe(true);
    expect(isBillHold(holdRow({ kind: "erp.quotation.hold" }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Autosave
// ---------------------------------------------------------------------------

describe("isWorthAutosaving — the guard that stops every blank screen offering itself back", () => {
  it("says no to a fresh, empty draft", () => {
    expect(isWorthAutosaving(createBillDraft(CONTEXT))).toBe(false);
  });

  it("says no to a draft carrying only the grid's trailing blank row", () => {
    expect(
      isWorthAutosaving({ ...createBillDraft(CONTEXT), lines: [createBillDraftLine()] }),
    ).toBe(false);
  });

  it("says no to a row that names an item but has no quantity on it", () => {
    // Half-keyed, and offering it back is noise.
    expect(
      isWorthAutosaving({
        ...createBillDraft(CONTEXT),
        lines: [createBillDraftLine({ itemId: "i1", billQty: 0 })],
      }),
    ).toBe(false);
  });

  it("says yes once there is real work on it", () => {
    expect(isWorthAutosaving(cart())).toBe(true);
  });
});

describe("draftFromAutosave", () => {
  const record: BillAutosave = {
    deviceId: "browser-abc",
    savedAt: "2026-09-12T09:31:00.000Z",
    companyId: CONTEXT.companyId,
    branchId: CONTEXT.branchId,
    accYear: CONTEXT.accYear,
    itemCount: 1,
    netAmount: 1180,
    partyName: "ACME",
    draft: cart(),
  };
  const recovered = draftFromAutosave(record);

  it("comes back DIRTY, unlike a resumed hold", () => {
    // The snapshot is about to be deleted, and unlike a hold the work is safe
    // nowhere else — so the discard guard is the only thing standing between it
    // and a stray F7.
    expect(recovered.isDirty).toBe(true);
    expect(recovered.mode).toBe("entry");
    expect(recovered.pricing).toBe("live");
  });

  it("resets the stock gate, for the same reason a hold's is reset", () => {
    expect(recovered.lines[0].stockGateResolved).toBe(false);
  });

  it("keeps the adjustments WITH their display fields", () => {
    // The one thing worth keeping from the Qt version: it is what lets a
    // recovered bill NAME the credits it had set off, even when the open-credits
    // endpoint is unreachable at recovery time.
    const withCredit = cart({
      adjustmentsTouched: true,
      adjustments: [
        {
          key: "a1",
          amount: 500,
          credit: {
            billId: "abl-1",
            billAccYear: "2025-2026",
            billType: "ADVANCE",
            drCr: "CR",
            docRefno: "SO-2201",
            docDate: "2026-03-30",
            billAmount: 500,
            pendingAmount: 500,
            status: "OPEN",
            srcModule: "SALES",
            srcDocType: "SALES_ORDER",
            srcDocId: "so-1",
            srcAccYear: "2025-2026",
            narration: null,
            adjType: "ADVANCE_ADJUST",
            settlementMode: "ADVANCE",
          },
        },
      ],
    });
    const back = draftFromAutosave({ ...record, draft: withCredit });
    expect(back.adjustments[0].credit.docRefno).toBe("SO-2201");
    expect(back.adjustments[0].credit.billAccYear).toBe("2025-2026");
    expect(back.adjustmentsTouched).toBe(true);
  });
});
