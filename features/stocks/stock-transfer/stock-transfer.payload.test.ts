import { describe, expect, it } from "vitest";
import { COL } from "./stock-transfer.constants";
import { applySaveResult, buildPayload, despatchLorry, draftFromPayload } from "./stock-transfer.payload";
import { editCell, patchHandling } from "./stock-transfer.state";
import { SCOPE, holding, keyed, withLine } from "./stock-transfer.test-fixtures";
import type { TransferHeaderPayload, TransferLinePayload, TransferPayload } from "./stock-transfer.types";

describe("buildPayload", () => {
  it("godown: the SOURCE godown on the line, the destination on the header, never a cost or a charge", () => {
    const { payload, sentKeys } = buildPayload(withLine("godown", "5"));
    expect(payload.header).toMatchObject({
      accYear: "2026-2027",
      companyId: "company-1",
      branchId: "branch-1",
      deviceId: "device-1",
      docDate: "2026-10-27",
      fromGodownId: "gd-from",
      toGodownId: "gd-to",
      loadEnabled: false,
      unloadEnabled: false,
    });
    expect(payload.header).not.toHaveProperty("toBranchId");
    expect(payload.header).not.toHaveProperty("svhId");
    expect(payload.header).not.toHaveProperty("status");
    expect(payload.lines).toEqual([
      {
        lineNo: 1,
        itemId: "item-1",
        uomId: "uom-1",
        baseUomId: "uom-1",
        toBaseFactor: 1,
        godownId: "gd-from",
        lotId: "lot-1",
        bucket: "SALEABLE",
        qty: 5,
        baseQty: 5,
        loadRate: 3.5,
        unloadRate: 1.25,
      },
    ]);
    for (const forbidden of ["costRate", "loadingCharge", "unloadingCharge", "value"]) {
      expect(JSON.stringify(payload)).not.toContain(forbidden);
    }
    expect(sentKeys).toHaveLength(1);
  });

  it("sends free quantity and the reason only when set", () => {
    let draft = withLine("godown", "5", holding({ freeAvailableQty: 3 }));
    draft = editCell({ ...draft, reasonId: "reason-1", remarks: " move " }, draft.lines[0].key, COL.FreeQty, "2");
    const { payload } = buildPayload(draft);
    expect(payload.header).toMatchObject({ reasonId: "reason-1", remarks: "move" });
    expect(payload.lines[0]).toMatchObject({ freeQty: 2, freeBaseQty: 2 });
  });

  it("sends the crew only for a ticked box, as UTC instants and ids", () => {
    let draft = withLine("godown");
    draft = patchHandling(draft, {
      loadEnabled: true,
      loadAt: "2026-10-27T10:30",
      loadmen: [{ id: "e1", text: "A" }, { id: "e2", text: "B" }],
      driver: { id: "e3", text: "C" },
      supervisor: null,
      vehicleNo: " TN 28 E 1 ",
    });
    const { header } = buildPayload(draft).payload;
    expect(header).toMatchObject({
      loadEnabled: true,
      loadmanIds: ["e1", "e2"],
      driverId: "e3",
      supervisorId: null,
      vehicleNo: "TN 28 E 1",
    });
    expect(header.loadDatetime).toMatch(/Z$/);
    expect(header).not.toHaveProperty("unloadDatetime");
    expect(header).not.toHaveProperty("unloadmanIds");
  });

  it("branch: toBranchId, no reason, no unloading half at all", () => {
    let draft = withLine("branch");
    draft = { ...draft, reasonId: "reason-1" };
    draft = patchHandling(draft, { loadEnabled: true, unloadEnabled: true });
    const { payload } = buildPayload(draft);
    expect(payload.header).toMatchObject({ toBranchId: "branch-2", loadEnabled: true, unloadEnabled: false });
    expect(payload.header).not.toHaveProperty("reasonId");
    expect(payload.header).not.toHaveProperty("unloadDatetime");
    expect(payload.lines[0].unloadRate).toBe(0);
    expect(payload.lines[0].loadRate).toBe(3.5);
  });

  it("numbers only the lines that hold an item and maps them back by key", () => {
    const draft = withLine();
    const { payload, sentKeys } = buildPayload(draft);
    expect(payload.lines).toHaveLength(1);
    expect(sentKeys).toEqual([draft.lines[0].key]);
  });
});

describe("despatchLorry", () => {
  it("rides along on a branch despatch only", () => {
    const branch = { ...withLine("branch"), lrNo: " LR9 ", expectedOn: "2026-10-28" };
    const draft = patchHandling(branch, { vehicleNo: "TN1" });
    expect(despatchLorry(draft)).toEqual({ lrNo: "LR9", vehicleNo: "TN1", expectedOn: "2026-10-28" });
    expect(despatchLorry(withLine("godown"))).toEqual({});
  });
});

const header = (over: Partial<TransferHeaderPayload> = {}): TransferHeaderPayload => ({
  svhId: "svh-1",
  accYear: "2026-2027",
  companyId: "company-1",
  branchId: "branch-1",
  deviceId: "device-9",
  voucherType: "TRANSFER_OUT",
  slno: "19",
  refno: "TRF/2026-2027/D1/00019",
  docDate: "2026-10-27",
  fromGodownId: "gd-from",
  fromGodownName: "Coimbatore",
  godownId: "gd-to",
  godownName: "namakkal",
  toBranchId: null,
  toBranchName: null,
  status: "DRAFT",
  lineCount: 1,
  totalQty: 3,
  totalValue: 1420.5,
  postedOn: null,
  cancelledOn: null,
  cancelReason: null,
  createdOn: "2026-10-27T04:59:58.642Z",
  createdByName: "tester1",
  reasonId: "reason-1",
  reasonName: "Replenish godown",
  remarks: "E2E",
  ...over,
});

const line = (over: Partial<TransferLinePayload> = {}): TransferLinePayload => ({
  sviId: "svi-1",
  lineNo: 1,
  itemId: "item-1",
  itemCode: null,
  itemName: "Texttiles Items",
  unitName: "PCS",
  uomId: "uom-1",
  baseUomId: "uom-1",
  toBaseFactor: 1,
  godownId: "gd-from",
  bucket: "SALEABLE",
  barcode: null,
  batchNo: "5437-0001",
  expiryDate: null,
  mrp: 550,
  qty: 3,
  freeQty: 0,
  costRate: 473.499896,
  value: 1420.5,
  lotId: "lot-1",
  loadRate: 3.5,
  unloadRate: 1.25,
  ...over,
});

describe("draftFromPayload", () => {
  it("reads FROM as fromGodownId and TO as godownId, with the crew and rates of notes 153", () => {
    const payload: TransferPayload = {
      header: header({
        loadEnabled: true,
        loadDatetime: "2026-10-27T04:59:58.632Z",
        loadmanIds: ["e1", "e2"],
        loadmanNames: ["vihan", "VIJIA"],
        driverId: "e1",
        driverName: "vihan",
        supervisorId: null,
        vehicleNo: "TN 28 E2E 153",
        unloadEnabled: false,
      }),
      lines: [line()],
    };
    const draft = draftFromPayload(SCOPE, "godown", payload, true);
    expect(draft).toMatchObject({
      svhId: "svh-1",
      refno: "TRF/2026-2027/D1/00019",
      status: "DRAFT",
      viewMode: "entry",
      fromGodownName: "Coimbatore",
      toGodownName: "namakkal",
      deviceId: "device-9",
      reasonId: "reason-1",
      extraReason: { id: "reason-1", name: "Replenish godown" },
      dirty: false,
    });
    expect(draft.handling).toMatchObject({
      loadEnabled: true,
      loadmen: [{ id: "e1", text: "vihan" }, { id: "e2", text: "VIJIA" }],
      driver: { id: "e1", text: "vihan" },
      supervisor: null,
      vehicleNo: "TN 28 E2E 153",
      unloadEnabled: false,
    });
    expect(draft.lines[0]).toMatchObject({ id: "svi-1", qty: "3", loadRate: "3.5", unloadRate: "1.25", batchNo: "5437-0001" });
    // A draft opened for keying ends on a blank line; a read-only one does not.
    expect(draft.lines).toHaveLength(2);
    expect(draftFromPayload(SCOPE, "godown", payload, false).lines).toHaveLength(1);
    expect(draftFromPayload(SCOPE, "godown", payload, false).viewMode).toBe("browse");
  });

  it("only a DRAFT opens for edit", () => {
    const payload: TransferPayload = { header: header({ status: "POSTED" }), lines: [line()] };
    expect(draftFromPayload(SCOPE, "godown", payload, true).viewMode).toBe("browse");
  });

  it("a despatch brings its transit rows and the lorry they carry", () => {
    const payload: TransferPayload = {
      header: header({ status: "IN_TRANSIT", toBranchId: "branch-2", toBranchName: "Counter2" }),
      lines: [line()],
      transit: [
        {
          sttId: "t1",
          status: "IN_TRANSIT",
          itemName: "Texttiles Items",
          batchNo: "5437-0001",
          toGodownName: "namakkal",
          sentQty: 3,
          receivedQty: 0,
          damageQty: 0,
          remainingQty: 3,
          costRate: 473.5,
          lrNo: "LR-1",
          vehicleNo: "TN 99",
          expectedOn: "2026-10-30T00:00:00.000Z",
        },
      ],
    };
    const draft = draftFromPayload(SCOPE, "branch", payload, false);
    expect(draft).toMatchObject({ toBranchName: "Counter2", lrNo: "LR-1", expectedOn: "2026-10-30" });
    expect(draft.handling.vehicleNo).toBe("TN 99");
    expect(draft.transit).toHaveLength(1);
  });
});

describe("applySaveResult", () => {
  it("takes the number, the lines' ids and the sent keys back", () => {
    const draft = withLine();
    const { sentKeys } = buildPayload(draft);
    const saved = applySaveResult(
      { ...draft, dirty: true, serverProblems: { x: "y" } },
      { header: header({ refno: "TRF/NEW" }), lines: [line({ sviId: "svi-77" })] },
      sentKeys,
    );
    expect(saved).toMatchObject({ svhId: "svh-1", refno: "TRF/NEW", status: "DRAFT", dirty: false, serverProblems: {}, sentKeys });
    expect(saved.lines[0].id).toBe("svi-77");
    expect(saved.lines[1].id).toBeNull();
  });
});

describe("keyed fixtures", () => {
  it("branch drafts carry the branch", () => {
    expect(keyed("branch").toBranchId).toBe("branch-2");
  });
});
