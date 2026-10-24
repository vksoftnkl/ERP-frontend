/**
 * Rows shaped exactly like `/item-price-log/list`'s items[] — the Qt offline
 * test's set (tests/pricelog/test_price_log_view.cpp): the live change of
 * 23-10-2026 to ZT-ITEM-A's Price B, a Price A change, a slab create / update /
 * delete, a re-key and a below-cost save.
 */
import type { PriceLogDetail, PriceLogRow } from "../wire/types";

export function logRow(over: Partial<PriceLogRow> = {}): PriceLogRow {
  return {
    ipclId: "c1",
    changedOn: "2026-10-23T10:15:00+05:30",
    day: "2026-10-23",
    changeSetId: "s1",
    priceTable: "IPM",
    rowId: "r1",
    action: "UPDATE",
    source: "CHANGE_SELLING_PRICE",
    menuId: 30,
    companyId: "co",
    branchId: null,
    branchName: null,
    itemId: "i1",
    itemCode: null,
    itemName: "ZT-ITEM-A",
    unitId: null,
    unitName: "PCS",
    godownId: null,
    godownName: null,
    partyId: null,
    partyName: null,
    priceLevel: null,
    priceLevelName: null,
    bucketMrp: null,
    bucketSp: null,
    effectiveFrom: null,
    effectiveTo: null,
    userId: "u1",
    userName: "VKPOS",
    deviceId: null,
    deviceName: null,
    ip: null,
    app: "API",
    reason: null,
    changed: [],
    changedLabels: [],
    oldPriceA: null,
    newPriceA: null,
    oldMrp: null,
    newMrp: null,
    oldCost: null,
    newCost: null,
    oldSlabPrice: null,
    newSlabPrice: null,
    slabFromQty: null,
    slabToQty: null,
    changePct: null,
    ...over,
  };
}

export const priceB = logRow({
  ipclId: "a1",
  changedOn: "2026-10-23T14:10:00.000+05:30",
  changeSetId: "s1",
  branchName: "Acme Foods - Coimbatore Branch",
  ip: "192.168.0.103",
  changed: ["ipm_price_b_wot", "ipm_sales_price_b", "ipm_price_b_markup_perc"],
  changedLabels: ["Price B (w/o tax)", "Price B", "Markup B %"],
  oldPriceA: 118,
  newPriceA: 118,
  oldMrp: 153.4,
  newMrp: 153.4,
  changePct: 0,
});

export const priceA = logRow({
  ipclId: "a2",
  changedOn: "2026-10-23T10:42:07.000+05:30",
  changeSetId: "s2",
  itemId: "i2",
  itemCode: "SAM-H1",
  itemName: "Samsung H1",
  bucketMrp: 150,
  deviceId: "d1",
  deviceName: "dbg",
  ip: "192.168.0.103",
  app: "DESKTOP",
  reason: "confirmed below cost: 74 is below the cost 79.29",
  changed: ["ipm_sales_price_a", "ipm_price_a_wot", "ipm_price_a_markup_perc", "ipm_max_price"],
  changedLabels: ["Price A", "Price A (w/o tax)", "Markup A %", "MRP"],
  oldPriceA: 118,
  newPriceA: 119,
  oldMrp: 140,
  newMrp: 150,
  changePct: 0.847,
});

export const slabUpd = logRow({
  ipclId: "a3",
  changedOn: "2026-10-22T14:11:37.000+05:30",
  day: "2026-10-22",
  changeSetId: "s3",
  priceTable: "IQP",
  source: "QTY_PRICE",
  menuId: 244,
  branchName: "Coimbatore",
  priceLevelName: "Retail",
  partyName: "Ravi Stores",
  userId: "u2",
  userName: "Meena",
  deviceName: "TILL-2",
  app: "DESKTOP",
  changed: ["iqp_price"],
  changedLabels: ["Slab price"],
  oldSlabPrice: 111,
  newSlabPrice: 109,
  slabFromQty: 10,
  slabToQty: null,
});

export const slabNew = logRow({
  ipclId: "a4",
  changedOn: "2026-10-22T14:11:30.000+05:30",
  day: "2026-10-22",
  changeSetId: "s4",
  priceTable: "IQP",
  action: "CREATE",
  source: "QTY_PRICE",
  userId: "u2",
  userName: "Meena",
  changed: ["iqp_price", "iqp_from_qty"],
  changedLabels: ["Slab price", "From qty"],
  newSlabPrice: 111,
  slabFromQty: 10,
  slabToQty: 20,
});

export const slabDel = logRow({
  ipclId: "a5",
  changedOn: "2026-10-22T14:11:44.000+05:30",
  day: "2026-10-22",
  changeSetId: "s5",
  priceTable: "IQP",
  action: "DELETE",
  source: "QTY_PRICE",
  userId: "u2",
  userName: "Meena",
  changed: ["iqp_is_deleted"],
  changedLabels: ["Deleted"],
});

export const rekey = logRow({
  ipclId: "a6",
  changedOn: "2026-10-22T09:30:00.000+05:30",
  day: "2026-10-22",
  changeSetId: "s6",
  action: "REKEY",
  source: "BUCKET_REKEY",
  menuId: null,
  itemId: "i3",
  itemName: "Sakthi Manjal 100g",
  bucketMrp: 48,
  userId: null,
  userName: null,
  app: "SYSTEM",
  changed: ["ipm_bucket_mrp"],
  changedLabels: ["MRP bucket"],
});

/** The grid's order: newest first. */
export const QT_ROWS: PriceLogRow[] = [priceB, priceA, slabDel, slabUpd, slabNew, rekey];

export function detailOf(row: PriceLogRow, over: Partial<PriceLogDetail> = {}): PriceLogDetail {
  return { ...row, before: null, after: null, ...over };
}
