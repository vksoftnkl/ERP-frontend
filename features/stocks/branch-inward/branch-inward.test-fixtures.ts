import { createDraft, applyPrefill, type DraftScope } from "./branch-inward.state";
import type { InwardDraft, PrefillPayload } from "./branch-inward.types";

export const SCOPE: DraftScope = {
  companyId: "co-1",
  branchId: "br-2",
  accYear: "2026-2027",
  deviceId: "dev-1",
};

/** A despatch of two transit rows: shirts (10 sent, 4 already in) and caps (6 sent). */
export const PREFILL: PrefillPayload = {
  outVoucher: {
    svhId: "out-1",
    accYear: "2026-2027",
    refno: "TRF/2026-2027/00001",
    fromBranchName: "Coimbatore",
    fromGodownId: "gd-from",
    toGodownId: "gd-to",
    toGodownName: "Karur",
  },
  rows: [
    {
      sttId: "stt-1",
      itemId: "item-1",
      itemName: "Shirt",
      lotId: "lot-1",
      batchNo: "B-1",
      baseUomId: "uom-pcs",
      unitName: "PCS",
      toGodownId: "gd-to",
      toGodownName: "Karur",
      bucket: "SALEABLE",
      sentQty: "10",
      receivedQty: "3",
      damageQty: "1",
      remainingQty: "6",
    },
    {
      sttId: "stt-2",
      itemId: "item-2",
      itemName: "Cap",
      lotId: "lot-2",
      batchNo: "B-2",
      baseUomId: "uom-pcs",
      unitName: "PCS",
      toGodownId: "gd-to",
      toGodownName: "Karur",
      bucket: "SALEABLE",
      sentQty: "6",
      receivedQty: "0",
      damageQty: "0",
      remainingQty: "6",
    },
  ],
};

export function opened(): InwardDraft {
  return applyPrefill(createDraft(SCOPE), PREFILL, null);
}
