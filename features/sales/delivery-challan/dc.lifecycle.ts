/**
 * The challan's life cycle, painted — DRAFT → POSTED → CANCELLED, with Amend
 * as revision + 1 and Cancel by reversal. Everything here is READ from `/get`'s
 * `locks` + `rights` (Qt `applyPostingState`) and turned into what the screen
 * shows (Qt `refreshVerbButtons`, `paintGstBadges`, `updateSourceChip`,
 * `paintPartyFacts`, the list's `deliveryChallanRowPolicy`). Pure.
 */
import { formatCurrency } from "@/domain/pricing";
import type { PartyContext } from "@/features/sales/testbill/types";
import { formatDateTime } from "@/lib/date-format";
import type { DcDraft, DcDraftLine, DcPostingState, DcSource } from "./dc.types";

const obj = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const bool = (value: unknown, fallback = false): boolean =>
  typeof value === "boolean" ? value : value === "true" ? true : value === "false" ? false : fallback;
const text = (value: unknown): string => (value === null || value === undefined ? "" : String(value));
const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Qt `applyPostingState`: the verbs' rights and locks, with the reason each is blocked. */
export function postingStateOf(
  data: Record<string, unknown>,
  lines: readonly Pick<DcDraftLine, "billedQty" | "returnedQty">[],
): DcPostingState {
  const locks = obj(data.locks);
  const rights = obj(data.rights);
  const editable = obj(locks.editable);
  const posting = obj(data.posting);
  const ewb = obj(posting.ewb);
  const status = text(data.sdcStatus).toUpperCase();
  const posted = status === "POSTED";

  const ewbLive = bool(locks.ewbLive);
  const irnLive = bool(locks.irnLive);
  const dayClosed = bool(locks.dayClosed);
  const billed = lines.some((line) => line.billedQty > 0);
  const returned = lines.some((line) => line.returnedQty > 0);

  let cancelBlockedReason = "";
  let canCancel = false;
  if (posted) {
    if (!bool(rights.cancel)) cancelBlockedReason = "You don't have permission to cancel challans.";
    else if (billed) cancelBlockedReason = "A bill has drawn on this challan. Cancel the bill first.";
    else if (returned)
      cancelBlockedReason = "Goods have been returned against this challan. Cancel the DC return first.";
    else if (ewbLive)
      cancelBlockedReason = "A live e-way bill is on this challan. Cancel it first, or let it expire.";
    else if (dayClosed) cancelBlockedReason = "The day is closed.";
    else canCancel = true;
  }

  let amendBlockedReason = "";
  let canAmend = false;
  if (posted) {
    if (ewbLive || irnLive)
      amendBlockedReason =
        "This challan has a live e-way bill. It cannot be amended — cancel it and raise another.";
    else if (billed || returned)
      amendBlockedReason = "A bill or a DC return has drawn on this challan — its lines are history.";
    else if (!bool(rights.amend)) amendBlockedReason = "You don't have permission to amend posted challans.";
    else canAmend = true;
  }

  const ewbStatus = text(ewb.status).toUpperCase();
  return {
    canPost: bool(rights.post),
    canOverride: bool(rights.override),
    canCancel,
    cancelBlockedReason,
    canAmend,
    amendBlockedReason,
    purposeEditable: bool(editable.purpose),
    documentEditable: bool(editable.document),
    bandEditable: bool(editable.transportBand, !posted),
    ewbLive: ewbLive || ewbStatus === "GENERATED",
    ewbStatus,
    ewbNumber: text(ewb.number),
    ewbValidUpto: text(ewb.validUpto) || null,
    ewbMessage: text(ewb.message),
    ewbVehicleNo: text(ewb.vehicleNo),
    registerId: text(posting.registerId),
    cogsAmt: num(posting.cogsAmt),
    voucherRefno: text(posting.voucherRefno),
  };
}

export type VerbState = { visible: boolean; enabled: boolean; label: string; title: string };

export type DcVerbs = {
  save: VerbState;
  post: VerbState;
  postPrint: VerbState;
  hold: boolean;
  pickHeld: boolean;
  clear: boolean;
  delete: boolean;
  importOrder: boolean;
  edit: VerbState;
  copyAsNew: boolean;
  showList: boolean;
  cancelDoc: VerbState;
  convert: VerbState;
  returnLink: boolean;
  billLink: boolean;
  eway: VerbState;
};

export type VerbInputs = {
  status: string;
  isNew: boolean;
  editable: boolean;
  amending: boolean;
  autoPost: boolean;
  /** `documentRights(...).maySaveDraft(saved)`. */
  maySaveDraft: (saved: boolean) => boolean;
  /** Menu Edit right (Qt `ctx.canEdit`). */
  canEditRight: boolean;
  posting: DcPostingState | null;
  revisionNo: number;
};

const verb = (visible: boolean, enabled: boolean, label: string, title = ""): VerbState => ({
  visible,
  enabled,
  label,
  title,
});

/** Qt `refreshVerbButtons` + `refreshGstButtons`: hidden when never applicable, greyed with a reason. */
export function verbsOf(input: VerbInputs): DcVerbs {
  const isPosted = input.status === "POSTED";
  const isCancelled = input.status === "CANCELLED";
  const isDraft = !isPosted && !isCancelled;
  const { isNew, editable, amending, autoPost } = input;
  const keying = isDraft && editable && !amending;
  const saveVerbs = keying || amending;
  const canPost = input.posting?.canPost ?? false;
  const canAmend = input.posting?.canAmend ?? false;
  const canCancel = input.posting?.canCancel ?? false;
  const purposeEditable = input.posting?.purposeEditable ?? false;
  const ewbDone = input.posting?.ewbStatus === "GENERATED";

  const draftVerb = !amending && !autoPost;
  const mayDraft = input.maySaveDraft(!isNew);
  const saveLabel = amending ? "Post amendment - F5" : autoPost ? "Post - F5" : "Save draft - F5";
  const showEdit = (isDraft && !editable) || (isPosted && !amending);

  return {
    save: verb(
      saveVerbs,
      !draftVerb || mayDraft,
      saveLabel,
      draftVerb && !mayDraft ? "You may post, not keep drafts — use Post" : "",
    ),
    post: verb(keying && !autoPost, canPost || isNew, "Post"),
    postPrint: verb(
      saveVerbs,
      amending || canPost || isNew,
      amending ? "Post amendment & Print - F6" : "Post & Print - F6",
    ),
    hold: keying && isNew,
    pickHeld: keying,
    clear: keying,
    delete: isDraft && !isNew && !amending,
    importOrder: editable,
    edit: isPosted
      ? verb(
          showEdit,
          canAmend,
          "Amend - F2",
          canAmend
            ? `Reopen for correction. Posts revision ${input.revisionNo + 1}.`
            : input.posting?.amendBlockedReason ?? "",
        )
      : verb(
          showEdit,
          input.canEditRight,
          "Edit - F2",
          input.canEditRight ? "" : "You don't have permission to edit challans.",
        ),
    copyAsNew: !isNew && !amending,
    showList: !amending,
    cancelDoc: verb(
      isPosted && !amending,
      canCancel,
      "Cancel challan",
      canCancel ? "Reverse this challan. It keeps its number." : input.posting?.cancelBlockedReason ?? "",
    ),
    convert: verb(
      true,
      isPosted && purposeEditable,
      "Convert purpose",
      !isPosted
        ? "Post the challan first — a draft's purpose is edited directly."
        : purposeEditable
          ? "Convert the purpose (logged). Needed before a bill can draw on a non-SUPPLY challan."
          : "Purpose locked: declared on the e-way bill, or already billed / returned.",
    ),
    returnLink: isPosted,
    billLink: isPosted,
    eway: verb(
      true,
      isPosted,
      "E-way bill",
      !isPosted
        ? "Post the challan first."
        : ewbDone
          ? `E-way bill ${input.posting?.ewbNumber ?? ""} exists. Update the vehicle (Part-B).`
          : "Generate the e-way bill for this challan (needs the transport band).",
    ),
  };
}

/** Qt `deliveryChallanRowPolicy` — what the list row may do. */
export type DcRowPolicy = { canEdit: boolean; canDelete: boolean; reason: string };

export function dcRowPolicy(status: unknown): DcRowPolicy {
  const value = text(status).trim().toUpperCase();
  if (value === "CANCELLED") {
    return { canEdit: false, canDelete: false, reason: "Cancelled — raise a new challan instead." };
  }
  if (value === "POSTED") {
    return {
      canEdit: true,
      canDelete: false,
      reason: "Posted — open it to amend or cancel; a posted challan is never deleted.",
    };
  }
  return { canEdit: true, canDelete: true, reason: "" };
}

export type SourceSummary = {
  /** "FROM ORDER SO-1 · SO-2"; empty when the challan has direct lines only. */
  chip: string;
  rows: Array<{ refno: string; detail: string }>;
  /** "direct lines — no order behind this challan" when there are no rows. */
  emptyText: string;
};

/** Qt `updateSourceChip`. */
export function sourceSummary(
  lines: readonly Pick<DcDraftLine, "srcDocId" | "billQty">[],
  source: DcSource | null,
  sourceRefnos: Readonly<Record<string, string>>,
): SourceSummary {
  const seen: string[] = [];
  const linesPer = new Map<string, number>();
  const qtyPer = new Map<string, number>();
  for (const line of lines) {
    const docId = line.srcDocId ?? "";
    if (!docId) continue;
    if (!seen.includes(docId)) seen.push(docId);
    linesPer.set(docId, (linesPer.get(docId) ?? 0) + 1);
    qtyPer.set(docId, (qtyPer.get(docId) ?? 0) + line.billQty);
  }
  if (seen.length === 0 && source?.docId) {
    seen.push(source.docId);
  }
  if (seen.length === 0) {
    return { chip: "", rows: [], emptyText: "direct lines — no order behind this challan" };
  }
  const rows = seen.map((id) => {
    let refno = sourceRefnos[id] ?? "";
    if (!refno && id === source?.docId) refno = source.refno ?? "";
    if (!refno) refno = "(unnumbered)";
    const count = linesPer.get(id);
    const detail =
      count !== undefined
        ? `${count} line${count === 1 ? "" : "s"} · ${(qtyPer.get(id) ?? 0).toFixed(3)} to deliver`
        : "";
    return { refno, detail };
  });
  return { chip: `FROM ORDER ${rows.map((row) => row.refno).join(" · ")}`, rows, emptyText: "" };
}

/** Qt `applyCustomerLock`: a challan drawn from an order delivers THAT order's customer. */
export function customerLockReason(source: DcSource | null, allowCustomerChangeOnImport: boolean): string | null {
  if (!source?.docId || allowCustomerChangeOnImport) {
    return null;
  }
  return `Drawn from ${source.refno || "an order"} — the customer belongs to that order and can't be changed here.`;
}

/** Qt `applyBillToLock`: a listed (non walk-in) customer's bill-to is the master's until unlocked. */
export function billToLocked(draft: Pick<DcDraft, "customer" | "billToUnlocked">, isWalkIn: boolean): {
  listed: boolean;
  locked: boolean;
} {
  const listed = Boolean(draft.customer.custId) && !isWalkIn;
  return { listed, locked: listed && !draft.billToUnlocked };
}

export type FactTone = "ink" | "amber" | "red";
export type Fact = { caption: string; value: string; tone: FactTone };

/** Qt `paintPartyFacts` — two lines under the customer. Credit is shown, never judged. */
export function partyFacts(
  input: { gstType: string | null; stateCode: string | null; isLocalSale: boolean },
  context: PartyContext | null,
): { line1: Fact[]; line2: Fact[] } {
  let gst = (input.gstType ?? "").trim() ? (input.gstType ?? "").toUpperCase() : "—";
  if ((input.stateCode ?? "").trim()) gst += ` · ${input.stateCode}`;
  gst += input.isLocalSale ? " · intra" : " · inter";
  const line1: Fact[] = [{ caption: "GST", value: gst, tone: "ink" }];
  const line2: Fact[] = [];
  if (context) {
    const credit = context.credit;
    const breached =
      String(credit.mode).toUpperCase() !== "OFF" &&
      (credit.amtExceeded || credit.billExceeded || credit.daysExceeded);
    const parts = [
      credit.limitAmount > 0 ? `limit ${formatCurrency(credit.limitAmount, 2, true)}` : "no limit",
      `used ${formatCurrency(credit.used, 2, true)}`,
      `${credit.openBills} open bill${credit.openBills === 1 ? "" : "s"}`,
      "shown only — a challan raises no debt",
    ];
    line1.push({ caption: "CREDIT", value: parts.join(" · "), tone: breached ? "red" : "ink" });
    const openDc = context.openSources.dc;
    const openOrders = context.openSources.orders;
    line2.push({ caption: "OPEN CHALLANS", value: openDc > 0 ? String(openDc) : "none", tone: openDc > 0 ? "amber" : "ink" });
    line2.push({ caption: "OPEN ORDERS", value: openOrders > 0 ? String(openOrders) : "none", tone: "ink" });
    const shipTo = context.shipTo.length;
    line2.push({ caption: "SHIP-TO", value: `${shipTo} address${shipTo === 1 ? "" : "es"}`, tone: "ink" });
    if (context.party.isWalkIn) {
      line2.push({ caption: "WALK-IN", value: "bill-to is typed here", tone: "amber" });
    }
  }
  return { line1, line2 };
}

/** Qt `paintGstBadges` — only on a POSTED or CANCELLED challan. */
export function gstBadgeText(status: string, posting: DcPostingState | null): string | null {
  if (status !== "POSTED" && status !== "CANCELLED") {
    return null;
  }
  const p = posting;
  const parts: string[] = [];
  const detail: string[] = [];
  if (p?.ewbNumber) detail.push(p.ewbNumber);
  if (p?.ewbValidUpto) detail.push(`valid to ${formatDateTime(p.ewbValidUpto)}`);
  if (p?.ewbMessage && p.ewbStatus !== "GENERATED") detail.push(p.ewbMessage);
  parts.push(`EWB ${p?.ewbStatus || "NA"}${detail.length ? ` ${detail.join(" · ")}` : ""}`);
  const cogs: string[] = [];
  if ((p?.cogsAmt ?? 0) > 0) cogs.push(`COGS ${formatCurrency(p?.cogsAmt ?? 0, 2, true)} posted`);
  else if (status === "POSTED") cogs.push("COGS deferred (PERIODIC)");
  if (p?.voucherRefno) cogs.push(`voucher ${p.voucherRefno}`);
  if (cogs.length) parts.push(cogs.join(" · "));
  parts.push("IRN — never on a challan");
  return parts.join("  |  ");
}
