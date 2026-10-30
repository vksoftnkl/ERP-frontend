/**
 * "Close row… (CN / claim / write-off)" — the pure half of the Qt
 * `ShortageCloseDialog` (NexERP src/modules/purchase/dues/shortage_close_dialog.cpp):
 * which inputs a kind shows, when Close row is allowed, the qty check, and the
 * body keys of POST /purchase/shortages/close the dialog decides. The caller
 * adds `shortageId` / `accYear` / `deviceId` per row.
 */
import { qtyText } from "@/features/purchase/shared/purchase.format";

/** The server's `kind` of /purchase/shortages/close. */
export type ShortageCloseKind = "SUPPLIER_CN" | "CLAIM" | "WRITE_OFF";

/** The dialog's choice: CLAIM is split by whom it is on (Qt item data `CLAIM:TRANSPORTER`). */
export type ShortageCloseChoice = "SUPPLIER_CN" | "CLAIM:TRANSPORTER" | "CLAIM:INSURER" | "WRITE_OFF";

export const SHORTAGE_CLOSE_CHOICES: readonly { value: ShortageCloseChoice; label: string }[] = [
  { value: "SUPPLIER_CN", label: "Supplier CN — the supplier credits it" },
  { value: "CLAIM:TRANSPORTER", label: "Claim on the transporter" },
  { value: "CLAIM:INSURER", label: "Claim on the insurer" },
  { value: "WRITE_OFF", label: "Write off" },
];

/** Only the keys with a value (Qt `ShortageCloseDialog::body()`). */
export type ShortageCloseBody = {
  kind: string;
  partyId?: string;
  claimAgainst?: string;
  qty?: number | string;
  cnNo?: string;
  cnDate?: string;
  reason?: string;
};

export type ShortageCloseForm = {
  choice: ShortageCloseChoice;
  /** As typed; only asked when one row is closed. */
  qty: string;
  cnNo: string;
  /** ISO yyyy-MM-dd or "". */
  cnDate: string;
  partyId: string;
  partyName: string;
  reason: string;
};

export const CN_NO_MAX = 60;
export const CLOSE_REASON_MAX = 250;

export function initialCloseForm(openQty: number): ShortageCloseForm {
  return { choice: "SUPPLIER_CN", qty: qtyText(openQty), cnNo: "", cnDate: "", partyId: "", partyName: "", reason: "" };
}

export function closeKindOf(choice: ShortageCloseChoice): ShortageCloseKind {
  return choice.split(":")[0] as ShortageCloseKind;
}

export function claimAgainstOf(choice: ShortageCloseChoice): string {
  return choice.split(":")[1] ?? "";
}

/** What the dialog shows for the kind. */
export function closeFieldsFor(choice: ShortageCloseChoice, rows: number) {
  const kind = closeKindOf(choice);
  return {
    showQty: rows === 1,
    showCn: kind === "SUPPLIER_CN",
    showParty: kind === "CLAIM",
    reasonPlaceholder: kind === "WRITE_OFF" ? "why it is written off (needed)" : "optional",
  };
}

export function closeNoteFor(choice: ShortageCloseChoice): string {
  const kind = closeKindOf(choice);
  if (kind === "SUPPLIER_CN") {
    return "Dr Supplier / Cr Shortage receivable (+ the GST held). The supplier's balance goes down now.";
  }
  if (kind === "CLAIM") {
    return (
      "Dr Claim receivable on that party / Cr Shortage receivable (+ the GST held). The claim then shows under " +
      "A. CLAIMS and is settled there; cash from them comes through a Receipt."
    );
  }
  return "Dr Write-off / Cr Shortage receivable — the goods will not come.";
}

export function closeTitle(rows: number, openQty: number, unit: string): string {
  return rows === 1
    ? `Close the shortage without goods — ${[qtyText(openQty), unit.trim()].filter(Boolean).join(" ")} open`
    : `Close ${rows} shortages without goods — each one whole`;
}

export function closeWindowTitle(rows: number): string {
  return rows === 1 ? "Close the shortage" : `Close ${rows} shortages`;
}

/** Close row is enabled: a claim names its party, a write-off its reason. */
export function closeReady(form: ShortageCloseForm): boolean {
  const kind = closeKindOf(form.choice);
  return (kind !== "CLAIM" || form.partyId !== "") && (kind !== "WRITE_OFF" || form.reason.trim() !== "");
}

function typedQty(raw: string): number {
  const parsed = Number(raw.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

/** The qty refusal (one row only), or "" when the close may go. */
export function closeQtyProblem(form: ShortageCloseForm, rows: number, openQty: number): string {
  if (rows !== 1) {
    return "";
  }
  const q = typedQty(form.qty);
  if (q <= 0 || q > openQty + 1e-9) {
    return `Qty must be more than 0 and at most ${qtyText(openQty)} (what is open).`;
  }
  return "";
}

export function closeBody(form: ShortageCloseForm, rows: number, openQty: number): ShortageCloseBody {
  const kind = closeKindOf(form.choice);
  const body: ShortageCloseBody = { kind };
  if (kind === "CLAIM") {
    body.partyId = form.partyId;
    body.claimAgainst = claimAgainstOf(form.choice);
  }
  if (rows === 1) {
    const q = typedQty(form.qty);
    // The whole open qty is the server's default.
    if (q > 0 && q < openQty - 1e-9) {
      body.qty = q;
    }
  }
  if (kind === "SUPPLIER_CN") {
    if (form.cnNo.trim()) {
      body.cnNo = form.cnNo.trim();
    }
    if (form.cnDate) {
      body.cnDate = form.cnDate;
    }
  }
  if (form.reason.trim()) {
    body.reason = form.reason.trim();
  }
  return body;
}
