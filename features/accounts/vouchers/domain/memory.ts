/**
 * Screen memory (lib/screen-memory) for the voucher screens: a voucher left
 * half-keyed when the operator goes to another menu comes back with its menu.
 *
 * One slot per voucher menu — each type's own, and the Voucher Register's —
 * so a journal never reopens on the Contra menu. The register remembers the
 * type the voucher was keyed on, and reopens on that type.
 *
 * Kept: keying that has not been written — a NEW voucher, or an edit of a
 * DRAFT that is still open for editing. Not kept: a clean screen (blank, just
 * saved as a draft, just posted, read from the register) and a voucher that
 * can only be read (POSTED, CANCELLED, a locked draft).
 */
import type { VoucherStatus } from "../vouchers.types";

/** The slot of a voucher menu; "" is the Voucher Register. */
export function voucherMemoryKey(menuTypeCode: string): string {
  return `accounts/vouchers/${menuTypeCode || "register"}`;
}

export type RememberableVoucher = {
  dirty: boolean;
  doc: { status: VoucherStatus | "NEW"; editable: boolean };
};

export function isVoucherWorthRemembering(voucher: RememberableVoucher): boolean {
  const { status, editable } = voucher.doc;
  return voucher.dirty && (status === "NEW" || (status === "DRAFT" && editable));
}

/**
 * The type a page reopens a remembered voucher on: a type's own menu has only
 * its own; the register, the one the voucher was keyed on.
 */
export function resumeTypeCode(menuTypeCode: string, remembered: { typeCode: string } | null): string {
  return menuTypeCode || remembered?.typeCode || "";
}
