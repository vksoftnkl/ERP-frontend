/**
 * Sale Bill — `items[]` for `/create`, `/validate` and `/amend` (§18.2). One
 * per line with an item; every key is on `SaveBillItemDto` (the payload
 * tests assert it against `dto-keys.ts`).
 */
import type { PricedLine } from "@/domain/pricing";
import { clampPriceLevel } from "@/features/sales/quotation/quotation.state";
import { SIZE_UOM, asEnum, toDateInput, toNullableText } from "@/features/sales/quotation/quotation.utils";
import type { SaleBillDraftLine, SaveBillItemDto } from "@/features/sales/testbill/types";

/** `yyyy-mm-dd`, or null for a blank / unparseable date. */
export function dateOrNull(value: string | null | undefined): string | null {
  const text = toDateInput(value);
  return text || null;
}

/**
 * A nullable uuid column. An unset id is `null`, never `""`: the empty string
 * is not an absent uuid to Postgres or to the DTO's uuid pattern, it is an
 * invalid one, and it comes back as a 400 naming the field.
 */
export function uuidOrNull(id: string | null | undefined): string | null {
  return (id ?? "").trim() || null;
}

/**
 * A `uuid[]` column from one keyed id. `null` is never sent: Prisma's scalar
 * list has no nullable form, so it fails to match the unchecked create input,
 * Prisma falls back to the checked variant, and the save dies on a misleading
 * "Argument `customer` is missing" rather than on the field that caused it.
 */
export function uuidArray(id: string | null): string[] {
  return id ? [id] : [];
}

// ---------------------------------------------------------------------------
// Save — the lines
// ---------------------------------------------------------------------------

export function itemDto(line: SaleBillDraftLine, priced: PricedLine, index: number): SaveBillItemDto {
  const size = toNullableText(line.itemSize, 50);
  return {
    // Present → update that line; absent → insert. An active line missing from
    // the array is soft deleted server-side, which is exactly what removing a
    // row should mean.
    ...(line.sbiId ? { sbiId: line.sbiId } : {}),
    sbiLineNo: index + 1,
    // One batch per row by design (§7.1), so a line is never split: the lookup's
    // godown and stock identify the row the quantity comes from. When a batch
    // picker lands and one line can draw on two batches, this is where the split
    // number starts mattering.
    sbiSplitNo: 1,
    // The trail is per line (§13.5): the document, then the LINE — which is what
    // the post guards and the open-qty draw-down key on. `sbiSrcDocLineNo` must
    // be sent: it was null once, and billed orders stayed CONFIRMED. A line
    // without a trail sends nulls, never the header's.
    sbiSrcDocType: line.srcDocType,
    sbiSrcDocId: line.srcDocId,
    sbiSrcItemId: line.srcItemId,
    sbiSrcDocYear: line.srcDocYear,
    sbiSrcDocRefno: toNullableText(line.srcDocRefno, 100),
    sbiSrcDocLineNo: line.srcDocLineNo,
    // What the SOURCE line ordered — not `orderQty`, which on an imported line
    // holds what was still PENDING. Sending the pending figure here would let
    // the order's own arithmetic be re-derived against the wrong denominator.
    sbiSrcItemQty: line.srcItemQty,
    sbiSrcFreeQty: null,
    // NEVER null (§18.2): an explicit null beats the NOT NULL default and is a
    // bare 500. Nothing on this screen picks a bucket yet, so every line is
    // saleable stock.
    sbiBucket: "SALEABLE",
    sbiItemId: line.itemId,
    sbiItemUnitId: line.itemUnitId,
    sbiToBaseFactor: line.toBaseFactor || 1,
    sbiHsnCode: toNullableText(line.hsnCode, 8),
    sbiPriceLevel: clampPriceLevel(line.priceLevel),
    sbiEanCode: toNullableText(line.barcode, 100),
    sbiSize: size,
    sbiSizeUom: size === null ? null : SIZE_UOM,
    // NOT NULL and `@RequiredUuid`. `validate.ts` refuses a line without one, so
    // by the time this runs there is always a godown; the empty string is a
    // last-ditch value that will 400 loudly rather than write a wrong row.
    sbiGodownId: line.godownId ?? "",
    sbiStockId: line.stockId,
    sbiBatchNo: toNullableText(line.batchNo, 100),
    sbiBatchDate: dateOrNull(line.batchDate),
    sbiExpiryDate: dateOrNull(line.expiryDate),
    sbiSerialNo: toNullableText(line.serialNo, 100),
    sbiIsTaxIncl: line.isInclusiveTax,
    sbiIsPromo: line.isPromo,
    sbiIsFree: line.isFree,
    // `ck_sbi_free_type` allows NULL / SCHEME / SAMPLE / REPLACEMENT only.
    sbiFreeType: line.isFree ? freeTypeOf(line.freeType) : null,
    sbiIsService: line.isService,
    sbiHasFreight: line.hasFreight,
    sbiCaseQty: line.caseQty,
    sbiBillQty: line.billQty,
    sbiLengthQty: line.lengthQty,
    sbiNetQty: priced.netQty,
    sbiWeightQty: line.weight * line.billQty,
    sbiAvailableStock: line.stockQty ?? 0,
    sbiRate: line.rate,
    sbiRatePreTax: priced.rateBeforeTax,
    sbiRateDiff: priced.rateDiff,
    sbiActPrice: line.actualPrice,
    sbiMaxPrice: line.mrp,
    sbiMinPrice: line.minPrice,
    sbiCostPrice: line.costPrice,
    sbiCostPreTax: line.costBeforeTax,
    // The keyed columns go out as keyed; the Amt columns carry what the engine
    // computed, which is what the grid showed and what the print needs.
    sbiItemDiscPerc: line.discPerc,
    sbiItemDiscQty: line.discPerQty,
    sbiItemDiscAmt: priced.discAmt,
    sbiSplDiscPerc: line.splDiscPerc,
    sbiSplDiscQty: line.splDiscPerQty,
    sbiSplDiscAmt: priced.splDiscAmt,
    sbiSchDiscPerc: line.schPerc,
    sbiSchDiscQty: line.schPerQty,
    sbiSchDiscAmt: priced.schAmt,
    sbiBillSchPerc: line.billSchDiscPerc,
    sbiBillSchQty: 0,
    sbiBillSchAmt: priced.billSchDiscAmt,
    // The engine models no second and third discount ladder, so these are zero
    // rather than guessed at. Adding them is a change to the SHARED engine with
    // a golden case (§3), not a field filled in here.
    sbiAddlDisc1Perc: 0,
    sbiAddlDisc1Amt: 0,
    sbiAddlDisc2Perc: 0,
    sbiAddlDisc2Amt: 0,
    sbiCashDiscPerc: line.cashDiscPerc,
    sbiCashDiscAmt: line.cashDiscAmt,
    sbiGrossAmt: priced.grossAmt,
    sbiNetGross: priced.netGross,
    sbiChrgBeforeTax: priced.chrgBeforeTax,
    sbiChrgAfterTax: priced.chrgAfterTax,
    sbiTaxableAmt: priced.taxableAmt,
    sbiTaxPerc: line.gstPerc,
    sbiTaxAmt: priced.gstAmt,
    sbiCgstPerc: line.cgstPerc,
    sbiCgstAmt: priced.cgstAmt,
    sbiSgstPerc: line.sgstPerc,
    sbiSgstAmt: priced.sgstAmt,
    sbiIgstPerc: line.igstPerc,
    sbiIgstAmt: priced.igstAmt,
    sbiCessPerc: line.cessPerc,
    sbiCessPerUnit: line.cessPerUnit,
    sbiCessAmt: priced.cessAmt,
    // Additional cess is a second head the engine does not model either.
    sbiAcessPerc: 0,
    sbiAcessPerUnit: 0,
    sbiAcessAmt: 0,
    sbiBatchConfig: line.batchConfig,
    sbiFreightQty: line.freightPerQty,
    sbiFreightAmt: priced.freightAmt,
    sbiLoadQty: line.loadingPerQty,
    sbiLoadAmt: priced.loadingAmt,
    sbiUnloadQty: 0,
    sbiUnloadAmt: 0,
    // The round-off is the DOCUMENT's, taken once at the bottom; a per-line
    // share of it would not add back up.
    sbiRoundOff: 0,
    sbiNetAmt: priced.total,
    sbiSoldPrice: priced.netPrice,
    sbiSoldPreTax: priced.netPriceBeforeTax,
    sbiItemProfit: priced.profit,
    sbiProfitPreTax: priced.profitBeforeTax,
    sbiMrpSavings: line.mrp > 0 ? (line.mrp - priced.netPrice) * priced.netQty : null,
    sbiMrpSavingsPerc: line.mrp > 0 ? priced.savingsPerc : null,
    sbiSalesmanId: line.salesmanId,
    sbiSchemeId: line.schemeId,
    sbiSchemeName: toNullableText(line.schemeName, 150),
    sbiRemarks: toNullableText(line.remarks, 250),
  };
}

const FREE_TYPES = ["SCHEME", "SAMPLE", "REPLACEMENT"] as const;
function freeTypeOf(value: string | null): string {
  return asEnum(value, FREE_TYPES, "SCHEME");
}

