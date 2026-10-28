/**
 * Sale Bill — sending the bill's PDF to the customer on WhatsApp. Pure: no
 * React, no fetch.
 *
 * Click-to-chat, not the WhatsApp Business API: the screen opens WhatsApp on
 * the customer's chat with a message already typed, and the operator presses
 * Send — nothing leaves the building on its own, and no Meta account is needed.
 *
 * A chat link carries TEXT only; no web page can make WhatsApp attach a file
 * through it. So the PDF travels as a LINK in the message: the server's
 * `/print-share` hands out an expiring public link to the rendered bill. Where
 * that link cannot be had (an older server), the screen falls back to saving
 * the PDF for the operator to attach by hand.
 *
 * What this module decides is which number that chat is opened on, and what
 * the message says.
 */
import { formatCurrency } from "@/domain/pricing";
import { toDisplayDate } from "@/features/sales/quotation/quotation.utils";
import { toDecimal } from "./salebill.party";
import type { BillPayload, SaleBillDocKey } from "./salebill.types";

/**
 * The calling code a national number is dialled under. Every installation is in
 * India today; a number keyed with its own `+` or `00` prefix keeps the code it
 * was keyed with.
 */
export const WHATSAPP_DEFAULT_COUNTRY_CODE = "91";

/** E.164 caps a full number at 15 digits; nothing shorter than 8 is a phone. */
const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

/**
 * A number WhatsApp can open a chat on — digits only, country code first, no
 * `+` (the form `web.whatsapp.com/send?phone=` and `whatsapp://send` take).
 *
 * A national number gets the default country code. For India that is a
 * 10-digit MOBILE: a landline keyed with its STD code is also ten digits, and a
 * chat opened on one goes nowhere, so a ten-digit number that does not start
 * 6–9 is refused rather than dialled. A number keyed with `+` or `00` is the
 * operator saying exactly what they mean, and is taken as keyed.
 */
export function normalizeWhatsappNumber(
  raw: string | null | undefined,
  countryCode: string = WHATSAPP_DEFAULT_COUNTRY_CODE,
): string | null {
  const text = (raw ?? "").trim();
  if (!text) {
    return null;
  }
  const digits = text.replace(/\D/g, "");
  let full: string;
  if (text.startsWith("+")) {
    full = digits;
  } else if (digits.startsWith("00")) {
    full = digits.slice(2);
  } else {
    // The trunk prefix: 098765 43210 is dialled as 98765 43210 from abroad.
    const national = digits.replace(/^0+/, "");
    if (national.length === 10) {
      if (countryCode === "91" && !/^[6-9]/.test(national)) {
        return null;
      }
      full = `${countryCode}${national}`;
    } else {
      // Longer than a national number: it already carries its country code
      // (919876543210). Shorter: refused below.
      full = national;
    }
  }
  if (full.length < MIN_DIGITS || full.length > MAX_DIGITS || full.startsWith("0")) {
    return null;
  }
  return full;
}

/** `919876543210` → `+91 98765 43210`; anything else just gains its `+`. */
export function formatWhatsappNumber(number: string): string {
  if (/^91\d{10}$/.test(number)) {
    return `+91 ${number.slice(2, 7)} ${number.slice(7)}`;
  }
  return `+${number}`;
}

/** The customer's numbers, as `/customers/get` answers them. */
export type CustomerContacts = {
  whatsappNo: string | null;
  phone1: string | null;
  phone2: string | null;
};

export const NO_CUSTOMER_CONTACTS: CustomerContacts = {
  whatsappNo: null,
  phone1: null,
  phone2: null,
};

function text(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

/** Read leniently: a customer row with none of the three is simply no numbers. */
export function customerContactsOf(raw: unknown): CustomerContacts {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return NO_CUSTOMER_CONTACTS;
  }
  const record = raw as Record<string, unknown>;
  return {
    whatsappNo: text(record.cusWhatsappNo),
    phone1: text(record.cusPhone1),
    phone2: text(record.cusPhone2),
  };
}

export type WhatsappCandidate = {
  /** Normalised — see `normalizeWhatsappNumber`. */
  number: string;
  /** Where it came from, as the dialog names it. */
  label: string;
};

/**
 * Every number the bill could go to, best first, each once.
 *
 * The customer's own WhatsApp number wins — it is the one field anybody keyed
 * for exactly this. The phone on the BILL comes next: it is what the counter
 * took from the customer standing in front of it, and for a walk-in it is the
 * only number there is. Then the contact number keyed on the bill, then the
 * master's two phones. A number that cannot be dialled (a landline, a stub) is
 * left out rather than offered.
 */
export function whatsappCandidates(
  sources: {
    whatsappNo?: string | null;
    billPhone?: string | null;
    contactNo?: string | null;
    phone1?: string | null;
    phone2?: string | null;
  },
  countryCode: string = WHATSAPP_DEFAULT_COUNTRY_CODE,
): WhatsappCandidate[] {
  const ordered: Array<[string | null | undefined, string]> = [
    [sources.whatsappNo, "WhatsApp no."],
    [sources.billPhone, "Phone on the bill"],
    [sources.contactNo, "Contact no."],
    [sources.phone1, "Phone 1"],
    [sources.phone2, "Phone 2"],
  ];
  const seen = new Set<string>();
  const candidates: WhatsappCandidate[] = [];
  for (const [raw, label] of ordered) {
    const number = normalizeWhatsappNumber(raw, countryCode);
    if (number && !seen.has(number)) {
      seen.add(number);
      candidates.push({ number, label });
    }
  }
  return candidates;
}

/** What the message is about. */
export type BillMessageFacts = {
  customerName: string;
  billRefno: string;
  /** `yyyy-mm-dd`, as the bill stores it. */
  billDate: string;
  amount: number;
  /** The company the bill was raised in; left off the signature when unknown. */
  companyName?: string | null;
  /**
   * The public link to the bill's PDF. With one, the message points at it;
   * without, it says the PDF is attached — the operator attaches it by hand.
   */
  link?: string | null;
};

/**
 * The message the chat opens with. The operator can change it before sending;
 * this is only what a counter would type for the hundredth time.
 */
export function buildBillWhatsappMessage(facts: BillMessageFacts): string {
  const name = facts.customerName.trim();
  const date = toDisplayDate(facts.billDate);
  const refno = facts.billRefno.trim();
  const what = [
    refno ? `bill ${refno}` : "bill",
    date ? `dated ${date}` : "",
    Number.isFinite(facts.amount) && facts.amount > 0
      ? `for ₹${formatCurrency(facts.amount, 2, true)}`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  const company = (facts.companyName ?? "").trim();
  const link = (facts.link ?? "").trim();
  const body = link
    ? [`Your ${what} is ready. You can view and download it here:`, link]
    : [`Please find attached your ${what}.`];
  return [
    `Dear ${name || "Customer"},`,
    "",
    ...body,
    "",
    "Thank you for your business.",
    ...(company ? [company] : []),
  ].join("\n");
}

/** A link's expiry, as the operator reads dates: `27/11/2026`, in local time. */
export function formatLinkExpiry(iso: string | null | undefined): string {
  const at = new Date(iso ?? "");
  if (Number.isNaN(at.getTime())) {
    return "";
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(at.getDate())}/${pad(at.getMonth() + 1)}/${at.getFullYear()}`;
}

/**
 * Where the chat opens: WhatsApp Web in a browser tab, or the WhatsApp app
 * installed on this machine (or phone).
 */
export type WhatsappOpenWith = "web" | "app";

export const WHATSAPP_OPEN_WITH_OPTIONS: ReadonlyArray<{ value: WhatsappOpenWith; label: string }> = [
  { value: "web", label: "WhatsApp Web" },
  { value: "app", label: "WhatsApp app" },
];

export function isWhatsappOpenWith(value: unknown): value is WhatsappOpenWith {
  return value === "web" || value === "app";
}

/**
 * The link that opens the customer's chat with the message typed in.
 *
 * `web.whatsapp.com/send` rather than `wa.me`: wa.me stops on a landing page
 * that asks, every time, whether to continue in the app or the browser — two
 * extra clicks per bill at a counter that sends dozens.
 */
export function whatsappChatUrl(number: string, message: string, openWith: WhatsappOpenWith): string {
  const query = `phone=${encodeURIComponent(number)}&text=${encodeURIComponent(message)}`;
  return openWith === "app"
    ? `whatsapp://send?${query}`
    : `https://web.whatsapp.com/send?${query}`;
}

/** The PDF's file name — the same stem the Print dialog saves under. */
export function whatsappPdfFilename(billRefno: string | null | undefined, sbId: string): string {
  const stem = (billRefno ?? "").trim() || sbId;
  return `bill-${stem}`;
}

/** The quick strip's caption when WhatsApp is on. */
export const WHATSAPP_ACTION_LABEL = "Send the bill PDF to the customer on WhatsApp";

/**
 * Why the bill cannot be sent right now, or null when it can.
 *
 * The PDF is rendered from the SAVED bill, so a bill never saved has nothing to
 * render and one with unsaved edits would send the customer figures the screen
 * no longer shows. Sending the paper is printing it, so it takes the print
 * right. A cancelled bill is not something to hand a customer as their bill —
 * Print still reaches it, for the file.
 */
export function whatsappBlockedReason(bill: {
  docId: string | null;
  isNewEntry: boolean;
  isDirty: boolean;
  status: string;
  canPrint: boolean;
}): string | null {
  if (!bill.docId || bill.isNewEntry) {
    return "Save the bill first — WhatsApp sends the saved bill's PDF";
  }
  if (!bill.canPrint) {
    return "You do not have the right to print bills, so you cannot send them";
  }
  if (bill.isDirty) {
    return "Save your changes first — the PDF is rendered from the saved bill";
  }
  if (bill.status.trim().toUpperCase() === "CANCELLED") {
    return "This bill is cancelled — it cannot be sent to the customer";
  }
  return null;
}

/** What the send dialog needs to know about the bill — all of it from the saved bill. */
export type WhatsappBillTarget = {
  docKey: SaleBillDocKey;
  billRefno: string;
  /** Null for a walk-in: no master row, so the bill's own phone is all there is. */
  custId: string | null;
  customerName: string;
  /** `sb_cust_phone` — the number the counter took for this bill. */
  billPhone: string | null;
  /** The entry screen's Contact No.; the bill does not store it. */
  contactNo?: string | null;
  /** `yyyy-mm-dd`. */
  billDate: string;
  amount: number;
};

/** The target, off `/bills/get` — what the list sends from without opening the bill. */
export function whatsappTargetOfBill(bill: BillPayload): WhatsappBillTarget {
  return {
    docKey: {
      sbId: bill.sbId,
      sbCompanyId: bill.sbCompanyId,
      sbBranchId: bill.sbBranchId,
      sbAccYear: bill.sbAccYear,
    },
    billRefno: bill.sbBillRefno ?? "",
    custId: bill.sbCustId,
    customerName: bill.sbCustName ?? "",
    billPhone: bill.sbCustPhone,
    billDate: (bill.sbBillDate ?? "").slice(0, 10),
    amount: toDecimal(bill.sbBillAmt),
  };
}
