/**
 * Sale Order — tender instruments. Which fields exist per tender TYPE and what
 * they mean. Derived, never toggled: the dialog renders whatever the selected
 * type's spec says, so a new tender type added to the master can never show a
 * cheque's date labelled "Expiry" (the Qt screen's imperative show/hide could).
 */

/** `accounts.acc_tender_types` — the closed set the seeded table carries. */
export type TenderTypeCode =
  | "CASH"
  | "CARD"
  | "CHEQUE"
  | "UPI"
  | "WALLET"
  | "BANK"
  | "CREDIT"
  | "RRN"
  | "LOYALTY"
  | "TEMP_CR"
  | "VOUCHER";

export type InstrumentSpec = {
  /** Whether a bank name field is shown, and whether keying it is mandatory. */
  bank: "required" | "optional" | "none";
  /**
   * The reference field's label, or `null` for a type that carries none. For a
   * CHEQUE the reference IS the cheque number (`td_ref_no` — the register's
   * `apd_instrument_no` comes from it), so it is required whatever the tender
   * master's `needsRef` override says: a master row with the flag off must not
   * leave the operator no way to key a cheque at all.
   */
  refLabel: string | null;
  refRequired: boolean;
  /** Card number — LAST FOUR ONLY (`ck_td_card_last4` is exactly four digits). */
  cardLast4: boolean;
  /**
   * What the instrument date field means, or `null` for none. Both land in
   * `tdInstrumentDate`; only a CHEQUE's drives `tdIsPdc` and the PDC register.
   */
  dateLabel: "Cheque Date" | "Expiry" | null;
  dateRequired: boolean;
};

const NO_INSTRUMENT: InstrumentSpec = {
  bank: "none",
  refLabel: null,
  refRequired: false,
  cardLast4: false,
  dateLabel: null,
  dateRequired: false,
};

/** Per tender type: which fields exist and what they mean (the plan's §5.3). */
export const INSTRUMENT_SPECS: Record<TenderTypeCode, InstrumentSpec> = {
  CASH: NO_INSTRUMENT,
  CARD: {
    bank: "optional",
    refLabel: "Slip No",
    refRequired: false,
    cardLast4: true,
    dateLabel: "Expiry",
    dateRequired: false,
  },
  CHEQUE: {
    // A cheque without its bank and number cannot be registered
    // (`apd_instrument_no` is NOT NULL), so both are required here whatever the
    // master says — and `tdCardLast4` must go out null: a cheque has no card
    // number, and the CHECK constraint rejects anything but four digits.
    bank: "required",
    refLabel: "Cheque No",
    refRequired: true,
    cardLast4: false,
    dateLabel: "Cheque Date",
    dateRequired: true,
  },
  UPI: { ...NO_INSTRUMENT, refLabel: "UPI Ref", bank: "optional" },
  WALLET: { ...NO_INSTRUMENT, refLabel: "Wallet Ref" },
  BANK: { ...NO_INSTRUMENT, refLabel: "Transfer Ref", bank: "optional" },
  CREDIT: NO_INSTRUMENT,
  RRN: { ...NO_INSTRUMENT, refLabel: "RRN" },
  LOYALTY: NO_INSTRUMENT,
  TEMP_CR: { ...NO_INSTRUMENT, refLabel: "Approved By" },
  VOUCHER: { ...NO_INSTRUMENT, refLabel: "Voucher No" },
};

export function instrumentSpecOf(type: TenderTypeCode): InstrumentSpec {
  return INSTRUMENT_SPECS[type] ?? NO_INSTRUMENT;
}

/**
 * A card number is stored as its last four digits or not at all — `td_card_last4`
 * is CHECK'd as exactly four digits, so anything else (a cheque's blank, a
 * half-typed number, a full PAN someone pasted) must go out as null.
 */
export function cardLast4OrNull(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  if (digits.length === 0) {
    return null;
  }
  const last4 = digits.slice(-4);
  return last4.length === 4 ? last4 : null;
}

/**
 * `tdIsPdc` — a cheque dated after the document is post-dated. Compared as ISO
 * `yyyy-mm-dd` strings, which order lexically; a missing date is simply not a
 * PDC (the missing date is its own violation).
 */
export function isPdc(instrumentDate: string | null, documentDate: string): boolean {
  return Boolean(instrumentDate) && Boolean(documentDate) && (instrumentDate as string) > documentDate;
}
