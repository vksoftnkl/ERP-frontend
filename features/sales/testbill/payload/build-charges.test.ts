import { describe, expect, it } from "vitest";
import { createDraftChargeRow } from "@/features/sales/quotation/quotation.state";
import { carryFromOrderCharge } from "../domain/carry";
import { SAVE_CHARGE_DETAIL_DTO_KEYS, keysOutside } from "./dto-keys";
import { chargeDtoForBill } from "./build-charges";

const scope = { companyId: "c", branchId: "b", accYear: "2026-2027" };
const actor = { userId: "u1", userName: "vk", sessionId: "s1", deviceId: "d", deviceMasterId: "dm", deviceType: "WEB" };

describe("charges[] (§12.4)", () => {
  it("emits the carry keys ONLY on a carried row", () => {
    const plain = createDraftChargeRow({ chgId: "chg", chgName: "Freight", ledgerCode: "L1", rate: 10 });
    const dto = chargeDtoForBill(plain, undefined, 0, { totQty: 1, totWeight: 0 }, scope, actor);
    expect("cdSrcCdId" in dto).toBe(false);
    expect("cdSrcAccYear" in dto).toBe(false);
    expect("cdCarryBasis" in dto).toBe(false);
    const carried = { ...plain, carry: carryFromOrderCharge({ cdId: "cd-order", cdAmount: 500 }, "2025-2026") };
    const carriedDto = chargeDtoForBill(carried, undefined, 0, { totQty: 1, totWeight: 0 }, scope, actor);
    expect(carriedDto).toMatchObject({ cdSrcCdId: "cd-order", cdSrcAccYear: "2025-2026", cdCarryBasis: "PRORATA" });
  });

  it("sends the scope, a null voucher no, the tax code and the audit, and nothing outside the DTO", () => {
    const row = createDraftChargeRow({ chgId: "chg", chgName: "Freight", ledgerCode: "L1", rate: 10, taxCode: "tax-18" });
    const dto = chargeDtoForBill(row, undefined, 0, { totQty: 1, totWeight: 0 }, scope, actor);
    expect(dto).toMatchObject({ cdCompId: "c", cdBranchId: "b", cdAccYear: "2026-2027", cdVoucherNo: null, cdTaxCode: "tax-18" });
    expect(dto.cdCreatedBy).toBeTruthy();
    expect(dto.cdModifiedBy).toBeUndefined();
    expect(keysOutside(dto as Record<string, unknown>, SAVE_CHARGE_DETAIL_DTO_KEYS)).toEqual([]);
    const saved = chargeDtoForBill({ ...row, cdId: "cd-1" }, undefined, 0, { totQty: 1, totWeight: 0 }, scope, actor);
    expect(saved.cdModifiedBy).toBeTruthy();
    expect(saved.cdCreatedBy).toBeUndefined();
  });
});
