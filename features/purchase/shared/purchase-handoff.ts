/**
 * Every purchase hand-off between two routes, the way
 * `lib/navigation/party-handoff.ts` hands a party to Payment (Qt: one screen
 * opens its sibling with `openSibling` and fills it):
 *
 * - Purchase Entry Ctrl+F11 → Purchase Return against the bill (`?againstBill=`);
 * - PO Make GRN · Ctrl+G → GRN from the PO (`?fromPo=`);
 * - GRN Reject → Purchase Return against the GRN (`?againstGrn=`);
 * - GRN Make bill · Ctrl+B → Purchase Entry from the GRN (`?fromGrn=`).
 *
 * The receiving page consumes it once (a NEW document, filled) and takes the
 * query off the URL (`dropHandoffQuery`), so a reload lands on the plain list.
 * Each page is governed by its own menu's rights. No React, no network.
 */

/**
 * Takes the hand-off query off the URL without a navigation: the History API, which
 * the App Router keeps in step with `useSearchParams` — no route re-fetch, nothing
 * re-rendered from the server, the screen that took the hand-off stays as it is.
 */
export function dropHandoffQuery(route: string): void {
  if (typeof window !== "undefined" && window.location.search) {
    window.history.replaceState(null, "", route);
  }
}

export const PURCHASE_RETURN_ROUTE = "/purchase/purchase-return";
export const PURCHASE_ENTRY_ROUTE = "/purchase/purchase-entry";
export const GRN_ROUTE = "/purchase/grn";

export type ReturnAgainstBillHandoff = {
  piId: string;
  accYear: string;
  supplierId: string;
  supplierName: string;
  /** The bill's refno, for the hint ("Return against PI/0012"). */
  refno: string;
};

const MARKER = "againstBill";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACC_YEAR = /^\d{4}-\d{4}$/;

export function buildReturnAgainstBillHref(handoff: ReturnAgainstBillHandoff): string {
  const query = new URLSearchParams({
    [MARKER]: handoff.piId,
    accYear: handoff.accYear,
    supplierId: handoff.supplierId,
    supplierName: handoff.supplierName,
    refno: handoff.refno,
  });
  return `${PURCHASE_RETURN_ROUTE}?${query.toString()}`;
}

/** The bill a URL hands over, or null when it hands over none. */
export function parseReturnAgainstBill(params: Pick<URLSearchParams, "get"> | null | undefined): ReturnAgainstBillHandoff | null {
  if (!params) return null;
  const piId = (params.get(MARKER) ?? "").trim();
  const accYear = (params.get("accYear") ?? "").trim();
  const supplierId = (params.get("supplierId") ?? "").trim();
  if (!UUID.test(piId) || !ACC_YEAR.test(accYear) || !UUID.test(supplierId)) return null;
  return {
    piId,
    accYear,
    supplierId,
    supplierName: (params.get("supplierName") ?? "").trim(),
    refno: (params.get("refno") ?? "").trim(),
  };
}

// ---------------------------------------------------------------------------
// Make GRN · Ctrl+G (Qt PurchaseOrderEntry::makeGrn): a NEW GRN on the PO's
// supplier and godown, its pending lines brought in (From PO) —
// `/purchase/grn?fromPo=<poId>&accYear&supplierId&supplierName&refno[&godownId&godownName]`.
// The GRN page consumes it once (as Purchase Return does `againstBill`).
// ---------------------------------------------------------------------------

const FROM_PO_MARKER = "fromPo";

export type GrnFromPoHandoff = {
  poId: string;
  accYear: string;
  supplierId: string;
  supplierName: string;
  refno: string;
  godownId?: string;
  godownName?: string;
};

export function buildGrnFromPoHref(handoff: GrnFromPoHandoff): string {
  const query = new URLSearchParams({
    [FROM_PO_MARKER]: handoff.poId,
    accYear: handoff.accYear,
    supplierId: handoff.supplierId,
    supplierName: handoff.supplierName,
    refno: handoff.refno,
    ...(handoff.godownId ? { godownId: handoff.godownId, godownName: handoff.godownName ?? "" } : {}),
  });
  return `${GRN_ROUTE}?${query.toString()}`;
}

export function parseGrnFromPo(params: Pick<URLSearchParams, "get"> | null | undefined): GrnFromPoHandoff | null {
  if (!params) return null;
  const poId = (params.get(FROM_PO_MARKER) ?? "").trim();
  const accYear = (params.get("accYear") ?? "").trim();
  const supplierId = (params.get("supplierId") ?? "").trim();
  if (!UUID.test(poId) || !ACC_YEAR.test(accYear) || !UUID.test(supplierId)) return null;
  const godownId = (params.get("godownId") ?? "").trim();
  return {
    poId,
    accYear,
    supplierId,
    supplierName: (params.get("supplierName") ?? "").trim(),
    refno: (params.get("refno") ?? "").trim(),
    ...(UUID.test(godownId) ? { godownId, godownName: (params.get("godownName") ?? "").trim() } : {}),
  };
}

// ---------------------------------------------------------------------------
// From a posted GRN (Qt `GrnEntry::rejectToSupplier` and `makeBill`):
// - Reject (return to supplier) → Purchase Return (menu 25), a NEW return of
//   kind "against GRN" on this GRN (Qt setKind(true) → setSupplier → loadSource):
//   `?againstGrn=<grnId>&accYear&supplierId&supplierName&refno`.
// - Make bill · Ctrl+B → Purchase Entry (menu 24) on the supplier and godown,
//   bringing this GRN's lines in (From GRN):
//   `?fromGrn=<grnId>&accYear&supplierId&supplierName&refno[&godownId&godownName]`.
// ---------------------------------------------------------------------------

export type GrnHandoff = {
  grnId: string;
  accYear: string;
  supplierId: string;
  supplierName: string;
  refno: string;
  godownId?: string;
  godownName?: string;
};

export const AGAINST_GRN_MARKER = "againstGrn";
export const FROM_GRN_MARKER = "fromGrn";

function buildGrnHref(route: string, marker: string, handoff: GrnHandoff): string {
  const query = new URLSearchParams({
    [marker]: handoff.grnId,
    accYear: handoff.accYear,
    supplierId: handoff.supplierId,
    supplierName: handoff.supplierName,
    refno: handoff.refno,
    ...(handoff.godownId ? { godownId: handoff.godownId, godownName: handoff.godownName ?? "" } : {}),
  });
  return `${route}?${query.toString()}`;
}

function parseGrnHandoff(params: Pick<URLSearchParams, "get"> | null | undefined, marker: string): GrnHandoff | null {
  if (!params) return null;
  const grnId = (params.get(marker) ?? "").trim();
  const accYear = (params.get("accYear") ?? "").trim();
  const supplierId = (params.get("supplierId") ?? "").trim();
  if (!UUID.test(grnId) || !ACC_YEAR.test(accYear) || !UUID.test(supplierId)) return null;
  const godownId = (params.get("godownId") ?? "").trim();
  return {
    grnId,
    accYear,
    supplierId,
    supplierName: (params.get("supplierName") ?? "").trim(),
    refno: (params.get("refno") ?? "").trim(),
    ...(UUID.test(godownId) ? { godownId, godownName: (params.get("godownName") ?? "").trim() } : {}),
  };
}

/** Reject (return to supplier): the Purchase Return against this GRN. */
export function buildReturnAgainstGrnHref(handoff: GrnHandoff): string {
  return buildGrnHref(PURCHASE_RETURN_ROUTE, AGAINST_GRN_MARKER, handoff);
}
export function parseReturnAgainstGrn(params: Pick<URLSearchParams, "get"> | null | undefined): GrnHandoff | null {
  return parseGrnHandoff(params, AGAINST_GRN_MARKER);
}

/** Make bill · Ctrl+B: Purchase Entry from this GRN. */
export function buildBillFromGrnHref(handoff: GrnHandoff): string {
  return buildGrnHref(PURCHASE_ENTRY_ROUTE, FROM_GRN_MARKER, handoff);
}
export function parseBillFromGrn(params: Pick<URLSearchParams, "get"> | null | undefined): GrnHandoff | null {
  return parseGrnHandoff(params, FROM_GRN_MARKER);
}
