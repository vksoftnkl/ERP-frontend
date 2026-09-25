/**
 * Enter on a voucher row → the source document's own screen (plan §10).
 *
 * THE KEY IS THE ROW'S, NEVER THE SESSION'S. `companyId` is the report's own.
 * `branchId` and `accYear` come from the row: a voucher written under another
 * branch, or dated in another partition, must open in its own scope. That is
 * why nothing here takes a session.
 *
 * This is the only map in the feature keyed on what kind of document a row is,
 * and it maps to ROUTES, not behaviour. The day a screen exists for another
 * `src`, it gets one line here.
 *
 * Only Receipt Entry opens by key today (`/accounts/receipt/:c/:b/:y/:id`).
 * Sale Bill, Sale Return, Delivery Challan and the rest have screens but no
 * keyed route, so they are not listed. Receipts also need the server to send
 * `src: { module: 'ACCOUNTS', docType: 'RECEIPT', docId: <voucherId> }`: the
 * voucher table leaves `avh_src_*` empty for them (checked 2026-09-25).
 */
import type { VoucherRow } from "../wire/types";

export type DocKey = {
  companyId: string;
  branchId: string;
  accYear: string;
  docId: string;
};

const seg = encodeURIComponent;

const ROUTES: Record<string, (key: DocKey) => string> = {
  "ACCOUNTS/RECEIPT": (k) =>
    `/accounts/receipt/${seg(k.companyId)}/${seg(k.branchId)}/${seg(k.accYear)}/${seg(k.docId)}`,
};

/** The route to open for a row, or null when there is no screen for it yet. */
export function drillTarget(
  row: Pick<VoucherRow, "src" | "branchId" | "accYear">,
  companyId: string,
): string | null {
  const src = row.src;
  if (!src || !src.module || !src.docType || !src.docId) return null;
  const route = ROUTES[`${src.module.toUpperCase()}/${src.docType.toUpperCase()}`];
  if (!route || !row.branchId || !row.accYear || !companyId) return null;
  return route({ companyId, branchId: row.branchId, accYear: row.accYear, docId: src.docId });
}

export const NO_SCREEN_MESSAGE = "This voucher has no screen to open yet.";
