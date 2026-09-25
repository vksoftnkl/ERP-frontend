/**
 * Sale Bill — `charges[]` (§12.4), one per real row, `cdSlno` 0…
 *
 * The shared charge builder (`quotation.payload.chargeDto`) emits the master
 * snapshot, the amounts and the tax block. The bill adds three things on top:
 *
 *  - **the scope** — `cdCompId, cdBranchId, cdAccYear`, and `cdVoucherNo`
 *    null on a bill;
 *  - **`cdTaxCode`** — the charge's tax id, which is how the rate is resolved
 *    now that `/charges/get` no longer returns `ledGstRate` (§27 CHG-TAX);
 *  - **the carry keys** — `cdSrcCdId / cdSrcAccYear / cdCarryBasis`, emitted
 *    ONLY on a row that was carried from an order. The quotation DTO 400s on
 *    those keys, even as null, and so does a hand-added bill row's on the
 *    shared detail DTO's `forbidNonWhitelisted` — a key that is present is a
 *    claim, and an uncarried row has no source charge to claim.
 *
 * `cdDocType` is not sent; removed rows are simply absent.
 */
import type { PricedChargeRow } from "@/domain/pricing";
import { actorLabel, chargeDto, type SaveActor } from "@/features/sales/quotation/quotation.payload";
import { toNullableText } from "@/features/sales/quotation/quotation.utils";
import type { BillChargeRow, SaveBillChargeDto } from "@/features/sales/testbill/types";

export type ChargeScope = { companyId: string; branchId: string; accYear: string };

export function chargeDtoForBill(
  row: BillChargeRow,
  priced: PricedChargeRow | undefined,
  index: number,
  totals: { totQty: number; totWeight: number },
  scope: ChargeScope,
  actor: SaveActor,
): SaveBillChargeDto {
  const base = chargeDto(row, priced, index, totals) as SaveBillChargeDto;
  const carry = row.carry ?? null;
  return {
    ...base,
    cdCompId: scope.companyId || null,
    cdBranchId: scope.branchId || null,
    cdAccYear: scope.accYear || null,
    cdVoucherNo: null,
    cdTaxCode: toNullableText(row.taxCode, 50),
    cdCessPerc: row.cessPerc ?? 0,
    ...(row.cdId ? { cdModifiedBy: actorLabel(actor) } : { cdCreatedBy: actorLabel(actor) }),
    ...(carry
      ? {
          cdSrcCdId: carry.srcCdId,
          cdSrcAccYear: carry.srcAccYear,
          cdCarryBasis: carry.basis,
        }
      : {}),
  };
}
