"use client";

/**
 * "Settle Bill" (§15) — the bill's own settlement dialog. The order keeps the
 * shared `<TenderDialog purpose="advance">`; a settlement has the panels an
 * advance never needs (TEMP_CR, LOYALTY, the cheque details, the identity box,
 * the cash-limit line, the ADJUST mirror), so it is its own component over
 * the same engines: `salebill.settle.ts` for the arithmetic, the order's
 * `tender/rows.ts` for the master rows and `tender/instruments.ts` for what
 * each type asks.
 *
 * Layout (§15.2): a left column — the one-column amount table, the cash-limit
 * line, the identity box, the chips — and a right column fixed at 560 px
 * holding exactly one of: blank · instrument panel · loyalty panel ·
 * temp-credit panel · the adjust panel. The window never resizes as rows
 * change.
 *
 * The dialog computes nothing the engine does not: every figure on screen is
 * `settleRows` over the rows, and every refusal is `checksOnSave` in the plan's
 * order. Esc closes without settling; set-offs made in the dialog PERSIST,
 * because they are the bill's state.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "@/lib/notify";
import { cx } from "@/components/design-system/cx";
import { formatCurrency, money } from "@/domain/pricing";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { DateField, DropdownCombo, Field } from "@/features/sales/quotation/components/fields";
import { parseCell, todayIso } from "@/features/sales/quotation/quotation.utils";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import orderStyles from "@/features/sales/sale-order/page.module.scss";
import type { TenderMasterRow } from "@/features/sales/sale-order/sale-order.types";
import { givesChange } from "@/features/sales/sale-order/tender/arithmetic";
import { instrumentSpecOf } from "@/features/sales/sale-order/tender/instruments";
import {
  fallbackReasonMessage,
  fallbackTenderRows,
  tenderRowFromMaster,
  usableTenders,
  type TenderFallbackReason,
} from "@/features/sales/sale-order/tender/rows";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { confirm } from "@/lib/confirm";
import {
  IFSC_PATTERN,
  MICR_PATTERN,
  cashLimitLine,
  fillShortfall,
  isValidPan,
  loyaltyFacts,
  loyaltyRedeem,
  normaliseMobile,
  paise,
  settleRows,
  settlementOutcome,
  type LoyaltyFacts,
} from "@/features/sales/testbill/engines/settle";
import type { BillScreenSettings } from "@/features/sales/testbill/state/use-bill-draft";
import type {
  BillTenderRow,
  PartyLoyalty,
  PartyTempCredit,
  ValidationNote,
} from "@/features/sales/testbill/types";
import styles from "@/features/sales/testbill/page.module.scss";

/** Everything the dialog is handed in (§15.1 "context handed in"). */
export type SettleContext = {
  /** The bill as raised. */
  grossAmount: number;
  /** max(0, gross − totalAdjusted): only the balance is settled at the counter. */
  totalAdjusted: number;
  billDate: string;
  billRefno: string;
  billToName: string;
  billToPhone: string | null;
  billToPlace: string | null;
  billToAddr: string | null;
  creditAllowed: boolean;
  isWalkIn: boolean;
  /** customer allowLoyalty && the Loyalty tick. */
  loyaltyAllowed: boolean;
  loyalty: PartyLoyalty | null;
  /** The customer master's points, when not a member. */
  fallbackPoints: number;
  cashToday: number;
  notes: ValidationNote[];
  openTempCredits: PartyTempCredit[];
  custPan: string | null;
  form60Ref: string | null;
  settings: Pick<
    BillScreenSettings,
    "allowExcessTender" | "tenderPrintOnly" | "tempCreditMaxDays" | "tempCreditMaxAmount" | "tempCreditBlockOpen"
  >;
};

export type SettleResult = {
  rows: BillTenderRow[];
  tender: number;
  credit: number;
  refund: number;
  surcharge: number;
  refunds: Map<string, number>;
  identity: { pan: string | null; form60: string | null };
  /** A CREDIT row > 0 flips a Cash term to Credit (§15.7). TEMP_CR does not (§28 Q12). */
  creditFlipsTerm: boolean;
  print: boolean;
};

export type SettleDialogProps = {
  isOpen: boolean;
  context: SettleContext;
  existingRows: BillTenderRow[];
  masters: TenderMasterRow[];
  mastersFailed?: boolean;
  mastersError?: string | null;
  /** The adjust panel, mounted in the right column when the ADJUST row is current (§14.1). */
  adjustPanel: ReactNode;
  /** Set-off is given back before change (§15.5): release this much, newest first. */
  onReleaseAdjustments: (amount: number) => number;
  onClose: () => void;
  onSave: (result: SettleResult) => void;
};

const CHIP = {
  total: "#1E88E5",
  service: "#FB8C00",
  tender: "#43A047",
  adjusted: "#8E24AA",
} as const;

const LETTERS = "ABCDEFGHIJKL";

function isAdjustRow(row: BillTenderRow): boolean {
  return row.typeCode === "RRN" || row.tenderTypeId === 7;
}

function widen(row: ReturnType<typeof tenderRowFromMaster>): BillTenderRow {
  return { ...row, tempCredit: null, cheque: null, loyaltyPoints: 0, loyaltyRate: 0 };
}

/**
 * Hotkeys (§15.3): the master's `tndHotkey` wins; on a collision the first
 * configured row keeps it; the others get the next free letter of A–L, and
 * more than 12 unkeyed rows get none.
 */
function assignHotkeys(rows: BillTenderRow[], masters: Map<string, TenderMasterRow>): BillTenderRow[] {
  const taken = new Set<string>();
  const first = rows.map((row) => {
    const keyed = (masters.get(row.tenderId)?.tndHotkey ?? "").trim().slice(0, 1).toUpperCase();
    if (keyed && !taken.has(keyed)) {
      taken.add(keyed);
      return { ...row, hotkey: keyed };
    }
    return { ...row, hotkey: null };
  });
  let next = 0;
  return first.map((row) => {
    if (row.hotkey) {
      return row;
    }
    while (next < LETTERS.length && taken.has(LETTERS[next])) {
      next += 1;
    }
    if (next >= LETTERS.length) {
      return row;
    }
    const letter = LETTERS[next];
    taken.add(letter);
    next += 1;
    return { ...row, hotkey: letter };
  });
}

function buildRows(
  masters: TenderMasterRow[],
  existing: BillTenderRow[],
  billDate: string,
): { rows: BillTenderRow[]; fallback: TenderFallbackReason | null; byId: Map<string, TenderMasterRow> } {
  const offerable = usableTenders(masters, billDate, "settlement");
  const fallback: TenderFallbackReason | null =
    masters.length === 0 ? "empty" : offerable.length === 0 ? "none-offerable" : null;
  const byId = new Map(masters.map((master) => [master.tndId, master]));
  const base =
    offerable.length > 0
      ? offerable.map((master, index) => widen(tenderRowFromMaster(master, index)))
      : fallbackTenderRows("settlement").map(widen);
  const merged = [...base];
  // Re-open: match saved lines to rows BY TENDER ID, the type name as the
  // fallback (loaded lines carry no type name).
  for (const row of existing) {
    const target =
      merged.find((candidate) => candidate.tenderId && candidate.tenderId === row.tenderId) ??
      merged.find((candidate) => !candidate.tdId && candidate.typeCode === row.typeCode && !existing.some((other) => other !== row && other.tenderId === candidate.tenderId));
    if (target) {
      merged[merged.indexOf(target)] = {
        ...target,
        tdId: row.tdId,
        keyed: row.keyed,
        settleStatus: row.settleStatus,
        refNo: row.refNo,
        authCode: row.authCode,
        bankName: row.bankName,
        cardDigits: row.cardDigits,
        instrumentDate: row.instrumentDate,
        notes: row.notes,
        surchargePerc: row.tdId ? row.surchargePerc : target.surchargePerc,
        tempCredit: row.tempCredit,
        cheque: row.cheque,
        loyaltyPoints: row.loyaltyPoints,
        loyaltyRate: row.loyaltyRate,
      };
    } else {
      merged.push(row);
    }
  }
  return { rows: assignHotkeys(merged, byId), fallback, byId };
}

function rowUsable(row: BillTenderRow, creditAllowed: boolean): boolean {
  if (isAdjustRow(row) || row.typeCode === "LOYALTY") {
    return false;
  }
  if (row.typeCode === "CREDIT") {
    return creditAllowed;
  }
  return true;
}

function refLabelOf(row: BillTenderRow): string {
  const spec = instrumentSpecOf(row.typeCode);
  if (row.typeCode === "CARD") {
    return "Slip No";
  }
  if (row.typeCode === "UPI") {
    return "UTR No";
  }
  return spec.refLabel ?? "Reference";
}

export function SettleDialog(props: SettleDialogProps) {
  if (!props.isOpen) {
    return null;
  }
  return <SettleDialogBody {...props} key={`${props.context.billDate}|${props.masters.length}`} />;
}

function SettleDialogBody({
  isOpen,
  context,
  existingRows,
  masters,
  mastersFailed,
  mastersError,
  adjustPanel,
  onReleaseAdjustments,
  onClose,
  onSave,
}: SettleDialogProps) {
  const bankDropdownId = useDropdownId("bank");
  const built = useMemo(() => buildRows(masters, existingRows, context.billDate), [masters, existingRows, context.billDate]);
  const [rows, setRows] = useState<BillTenderRow[]>(built.rows);
  const startRow = useMemo(() => {
    const usable = built.rows.filter((row) => rowUsable(row, context.creditAllowed));
    return usable.find((row) => built.byId.get(row.tenderId)?.tndIsDefault) ?? usable[0] ?? built.rows[0] ?? null;
  }, [built, context.creditAllowed]);
  const [activeKey, setActiveKey] = useState<string | null>(startRow?.key ?? null);
  const [rawText, setRawText] = useState<Record<string, string>>({});
  const [hint, setHint] = useState<string>("F1 - Auto fill Balance");
  const [pan, setPan] = useState(context.custPan ?? "");
  const [form60, setForm60] = useState(context.form60Ref ?? "");
  const [totalAdjusted, setTotalAdjusted] = useState(context.totalAdjusted);
  const amountRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const panelFirstRef = useRef<HTMLInputElement | null>(null);

  // The set-offs may move while the dialog is open (the ADJUST panel writes
  // the bill's state); the settle amount follows.
  useEffect(() => {
    setTotalAdjusted(context.totalAdjusted);
  }, [context.totalAdjusted]);

  const fallbackReason: TenderFallbackReason | null = mastersFailed ? "unavailable" : built.fallback;
  const settleAmount = Math.max(0, money(context.grossAmount - Math.max(0, totalAdjusted)));
  const settlement = useMemo(() => settleRows(rows, settleAmount), [rows, settleAmount]);
  const settledByKey = useMemo(() => new Map(settlement.rows.map((row) => [row.key, row])), [settlement]);
  const balance = settlement.totals.balance;

  const activeRow = rows.find((row) => row.key === activeKey) ?? null;
  const activeMaster = activeRow ? built.byId.get(activeRow.tenderId) ?? null : null;

  const loyalty: LoyaltyFacts = useMemo(
    () =>
      loyaltyFacts({
        loyalty: context.loyalty,
        fallbackPoints: context.fallbackPoints,
        masterRate: rows.find((row) => row.typeCode === "LOYALTY")?.conversionRate ?? 1,
        masterMinPoints: rows.find((row) => row.typeCode === "LOYALTY")?.minAmount ?? 0,
        isWalkIn: context.isWalkIn,
        loyaltyAllowed: context.loyaltyAllowed,
      }),
    [context.fallbackPoints, context.isWalkIn, context.loyalty, context.loyaltyAllowed, rows],
  );

  const patchRow = useCallback((key: string, patch: Partial<BillTenderRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }, []);

  const focusAmount = useCallback((key: string) => {
    setActiveKey(key);
    window.requestAnimationFrame(() => amountRefs.current[key]?.focus());
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (startRow) {
        amountRefs.current[startRow.key]?.focus();
      } else {
        bodyRef.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [startRow]);

  // ----- the cash-limit line and the identity box (§15.8 A, B) -------------
  const cashThisBill = rows
    .filter((row) => row.typeCode === "CASH")
    .reduce((sum, row) => sum + (settledByKey.get(row.key)?.base ?? 0), 0);
  const cashNote = context.notes.find((note) => note.code === "SALES_CASH_LIMIT") ?? null;
  const cashLine = cashLimitLine(context.cashToday, cashThisBill);
  const panNote = context.notes.find((note) => note.code === "SALES_PAN_REQUIRED" && note.field !== "sbCustId") ?? null;
  const identityVisible = Boolean(panNote) || Boolean(context.custPan) || Boolean(context.form60Ref);

  // ----- the per-row hint (§15.7) -------------------------------------------
  const rowHint = (row: BillTenderRow | null): string => {
    if (!row) {
      return "F1 - Auto fill Balance";
    }
    const master = built.byId.get(row.tenderId);
    const parts: string[] = [];
    if (master?.tndUpiVpa) parts.push(`VPA ${master.tndUpiVpa}`);
    if (master?.tndMerchantId) parts.push(`MID ${master.tndMerchantId}`);
    if (master?.tndTerminalId) parts.push(`TID ${master.tndTerminalId}`);
    if (row.settlementDays > 0) parts.push(`settles T+${row.settlementDays}`);
    if (master?.tndDailyLimit && master.tndDailyLimit > 0) parts.push(`daily limit ${formatCurrency(master.tndDailyLimit)}`);
    if (row.typeCode === "CREDIT" && !context.creditAllowed) {
      return "This customer is not allowed to buy on credit.";
    }
    return parts.length > 0 ? parts.join(" · ") : "F1 - Auto fill Balance";
  };

  useEffect(() => {
    setHint(rowHint(activeRow));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey]);

  // ----- commits ------------------------------------------------------------
  const releaseForExcess = useCallback(
    (nextRows: BillTenderRow[]) => {
      // Set-off is given back before change (§15.5): after any amount commit,
      // excess = balance, adjusted = total set-off; both > 0 → release
      // min(excess, adjusted) newest first and re-net.
      const totals = settleRows(nextRows, settleAmount).totals;
      const excess = totals.balance;
      if (excess > 0.005 && totalAdjusted > 0.005) {
        const released = onReleaseAdjustments(Math.min(excess, totalAdjusted));
        if (released > 0.005) {
          setTotalAdjusted((current) => money(current - released));
          setHint(
            `The money tendered covers the bill, so ${formatCurrency(released)} of the credit set-off was given back to the customer's advance.`,
          );
        }
      }
    },
    [onReleaseAdjustments, settleAmount, totalAdjusted],
  );

  const commitAmount = useCallback(
    async (row: BillTenderRow) => {
      const text = rawText[row.key];
      setRawText((current) => {
        const next = { ...current };
        delete next[row.key];
        return next;
      });
      if (isAdjustRow(row) || row.typeCode === "LOYALTY") {
        setActiveKey(row.key);
        return;
      }
      const base = text === undefined ? row.keyed : Math.abs(parseCell(text));
      if (row.typeCode === "CREDIT" && base > 0.005 && !context.creditAllowed) {
        // §28 Q1: "credit anyway" is not offered.
        toast.warn("This customer is not allowed to buy on credit.");
        patchRow(row.key, { keyed: 0 });
        return;
      }
      if (row.maxAmount !== null && row.maxAmount > 0 && base > row.maxAmount + 0.005) {
        toast.warn(`${row.tenderName} cannot take more than ${formatCurrency(row.maxAmount)}.`);
        patchRow(row.key, { keyed: 0 });
        return;
      }
      const nextRows = rows.map((candidate) => (candidate.key === row.key ? { ...candidate, keyed: money(base) } : candidate));
      setRows(nextRows);
      releaseForExcess(nextRows);
      if (base > 0.005) {
        window.requestAnimationFrame(() => panelFirstRef.current?.focus());
      }
    },
    [context.creditAllowed, patchRow, rawText, releaseForExcess, rows],
  );

  /** F1 (§15.4): fill the current row with the shortfall; ADJUST opens its panel. */
  const payBalanceHere = useCallback(async () => {
    if (!activeRow) {
      return;
    }
    if (isAdjustRow(activeRow) || activeRow.typeCode === "LOYALTY") {
      return;
    }
    const next = fillShortfall(settledByKey.get(activeRow.key)?.base ?? activeRow.keyed, balance);
    if (Math.abs(next - activeRow.keyed) < 0.005) {
      return;
    }
    if (activeRow.typeCode === "CREDIT" && !context.creditAllowed) {
      toast.warn("This customer is not allowed to buy on credit.");
      return;
    }
    if (activeRow.maxAmount !== null && activeRow.maxAmount > 0 && next > activeRow.maxAmount + 0.005) {
      toast.warn(`${activeRow.tenderName} cannot take more than ${formatCurrency(activeRow.maxAmount)}.`);
      return;
    }
    const nextRows = rows.map((row) => (row.key === activeRow.key ? { ...row, keyed: next } : row));
    setRows(nextRows);
    setRawText((current) => ({ ...current, [activeRow.key]: String(next) }));
    // Run the release rule after F1 as well (G1).
    releaseForExcess(nextRows);
  }, [activeRow, balance, context.creditAllowed, releaseForExcess, rows, settledByKey]);

  // ----- the checks on Save (§15.8) -----------------------------------------
  const save = (print: boolean) => {
    if (balance < -0.005) {
      toast.error("The bill is not fully tendered.");
      if (activeRow) focusAmount(activeRow.key);
      return;
    }
    const panText = pan.trim().toUpperCase();
    if (identityVisible && !panText && !form60.trim()) {
      toast.error("A cash sale above the limit needs the customer's PAN or a Form 60 reference.");
      return;
    }
    if (panText && !isValidPan(panText)) {
      toast.error("That is not a valid PAN (AAAAA9999A).");
      return;
    }
    for (const row of rows) {
      if (isAdjustRow(row)) {
        continue;
      }
      const base = settledByKey.get(row.key)?.base ?? 0;
      if (base <= 0.005) {
        continue;
      }
      if (!row.tenderId) {
        toast.error(`${row.tenderName} is not backed by the tender master — it cannot be saved.`);
        return;
      }
      if (row.minAmount > 0 && base < row.minAmount - 0.005) {
        toast.error(`${row.tenderName} needs at least ${formatCurrency(row.minAmount)}.`);
        focusAmount(row.key);
        return;
      }
      if (!givesChange(row.allowChange, row.typeCode) && paise(base) > paise(settleAmount) && !context.settings.allowExcessTender) {
        toast.error(`${row.tenderName} cannot exceed the bill amount — it can't give change back.`);
        focusAmount(row.key);
        return;
      }
      const needsReference =
        (row.needsRef && row.typeCode !== "UPI" && row.typeCode !== "TEMP_CR") || row.typeCode === "CHEQUE";
      if (needsReference && row.typeCode !== "LOYALTY" && !(row.refNo ?? "").trim()) {
        toast.error(`${row.tenderName} needs its ${refLabelOf(row)}.`);
        setActiveKey(row.key);
        return;
      }
      if (row.typeCode === "CHEQUE") {
        if (!(row.bankName ?? "").trim()) {
          toast.error(`${row.tenderName} needs the bank the cheque is drawn on.`);
          setActiveKey(row.key);
          return;
        }
        if (row.cheque?.ifsc && !IFSC_PATTERN.test(row.cheque.ifsc.toUpperCase())) {
          toast.error("IFSC is 4 letters, a 0, then 6 letters or digits (SBIN0001234).");
          setActiveKey(row.key);
          return;
        }
        if (row.cheque?.micr && !MICR_PATTERN.test(row.cheque.micr)) {
          toast.error("MICR is exactly 9 digits.");
          setActiveKey(row.key);
          return;
        }
      }
      if (row.typeCode === "TEMP_CR") {
        const details = row.tempCredit;
        if (!details || !details.name.trim() || !normaliseMobile(details.mobile)) {
          toast.error("Who is taking the goods on credit? Name and mobile are mandatory.");
          setActiveKey(row.key);
          return;
        }
        if (context.settings.tempCreditMaxAmount > 0 && base > context.settings.tempCreditMaxAmount + 0.005) {
          toast.error(`Temp credit is capped at ${formatCurrency(context.settings.tempCreditMaxAmount)} per bill.`);
          focusAmount(row.key);
          return;
        }
        if (context.settings.tempCreditBlockOpen === "REFUSE" && openTempCreditsFor(details.mobile).length > 0) {
          toast.error("This mobile already has an OPEN temp credit — Post will refuse it.");
          setActiveKey(row.key);
          return;
        }
      }
      if (row.typeCode === "LOYALTY" && base > loyalty.worth + 0.005) {
        toast.error(`Only ${formatCurrency(loyalty.worth)} of points is available.`);
        setActiveKey(row.key);
        return;
      }
    }
    const outcome = settlementOutcome(rows, settleAmount);
    if (outcome.unrouted > 0.005) {
      toast.error("No tender on this bill can give change back. Reduce the over-tendered amount, or add a cash tender.");
      return;
    }
    const kept = rows.filter((row) => !isAdjustRow(row) && ((settledByKey.get(row.key)?.base ?? 0) > 0.005 || row.tdId));
    const creditFlipsTerm = rows.some((row) => row.typeCode === "CREDIT" && (settledByKey.get(row.key)?.base ?? 0) > 0.005);
    onSave({
      rows: kept,
      tender: outcome.tender,
      credit: outcome.credit,
      refund: outcome.refund,
      surcharge: outcome.surcharge,
      refunds: outcome.refunds,
      identity: { pan: panText || null, form60: form60.trim() || null },
      creditFlipsTerm,
      print,
    });
  };

  /** The party's open temp credits on this mobile — this bill's own excluded (D8). */
  const openTempCreditsFor = (mobile: string): PartyTempCredit[] => {
    const wanted = normaliseMobile(mobile);
    if (!wanted) {
      return [];
    }
    return context.openTempCredits.filter(
      (row) => normaliseMobile(row.mobile) === wanted && row.billRefno !== context.billRefno,
    );
  };

  // ----- keys ---------------------------------------------------------------
  const walkable = rows.filter((row) => !isAdjustRow(row) && row.typeCode !== "LOYALTY").map((row) => row.key);
  const stepRow = (delta: number, fromKey: string | null) => {
    if (walkable.length === 0) return;
    if (fromKey === null) {
      focusAmount(delta > 0 ? walkable[0] : walkable[walkable.length - 1]);
      return;
    }
    const index = walkable.indexOf(fromKey);
    const next = Math.min(walkable.length - 1, Math.max(0, (index < 0 ? 0 : index) + delta));
    focusAmount(walkable[next]);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "F5") {
      event.preventDefault();
      if (!context.settings.tenderPrintOnly) save(false);
      return;
    }
    if (event.key === "F6") {
      event.preventDefault();
      save(true);
      return;
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      save(false);
      return;
    }
    if (event.key === "F1") {
      event.preventDefault();
      void payBalanceHere();
      return;
    }
    const target = event.target as HTMLElement | null;
    const inList = Boolean(target?.closest("[data-settle-list]"));
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const amountKey = Object.keys(amountRefs.current).find((key) => amountRefs.current[key] === target) ?? null;
      if (amountKey === null && target?.closest("input, select, textarea, [role='combobox']")) {
        return;
      }
      event.preventDefault();
      stepRow(event.key === "ArrowDown" ? 1 : -1, amountKey);
      return;
    }
    // Hotkeys work while focus is in the tender list, not while typing in the panel.
    if (inList && /^[a-zA-Z]$/.test(event.key) && !event.ctrlKey && !event.metaKey) {
      const letter = event.key.toUpperCase();
      const row = rows.find((candidate) => candidate.hotkey === letter);
      if (row) {
        event.preventDefault();
        if (isAdjustRow(row) || row.typeCode === "LOYALTY") {
          setActiveKey(row.key);
        } else {
          focusAmount(row.key);
        }
      }
    }
  };

  // ----- the chips ----------------------------------------------------------
  const balanceChip =
    Math.abs(balance) < 0.005
      ? { label: "Refund", value: 0, colour: "#a9a9a9" }
      : balance < 0
        ? { label: "Balance", value: -balance, colour: "#b91c1c" }
        : { label: "Refund", value: balance, colour: "#006400" };

  const panelFor = (row: BillTenderRow | null): ReactNode => {
    if (!row) {
      return null;
    }
    if (isAdjustRow(row)) {
      return adjustPanel;
    }
    if (row.typeCode === "LOYALTY") {
      return <LoyaltyPanel row={row} facts={loyalty} onPatch={(patch) => patchRow(row.key, patch)} firstRef={panelFirstRef} />;
    }
    if (row.typeCode === "TEMP_CR") {
      return (
        <TempCreditPanel
          row={row}
          context={context}
          openCredits={row.tempCredit ? openTempCreditsFor(row.tempCredit.mobile) : []}
          onPatch={(patch) => patchRow(row.key, patch)}
          firstRef={panelFirstRef}
        />
      );
    }
    const spec = instrumentSpecOf(row.typeCode);
    const showsPanel = row.needsRef || row.typeCode === "CHEQUE" || row.typeCode === "CARD" || row.surchargePerc > 0 || row.surchargeFlat > 0 || row.editSurcharge;
    if (!showsPanel) {
      return null;
    }
    const settled = settledByKey.get(row.key);
    return (
      <InstrumentPanel
        row={row}
        base={settled?.base ?? 0}
        surchargeAmt={settled?.surchargeAmt ?? 0}
        total={settled?.amount ?? 0}
        spec={spec}
        bankDropdownId={bankDropdownId}
        billToName={context.billToName}
        onPatch={(patch) => patchRow(row.key, patch)}
        onBaseChange={(value) => {
          const nextRows = rows.map((candidate) => (candidate.key === row.key ? { ...candidate, keyed: money(Math.max(0, value)) } : candidate));
          setRows(nextRows);
          releaseForExcess(nextRows);
        }}
        firstRef={panelFirstRef}
      />
    );
  };

  return (
    <ModalShell
      title={`Settle Bill${context.billRefno ? ` — ${context.billRefno}` : ""}`}
      isOpen={isOpen}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className={quotationStyles.button} onClick={onClose}>
            Close <span className={quotationStyles.buttonHint}>Esc</span>
          </button>
          <button
            type="button"
            className={quotationStyles.button}
            disabled={context.settings.tenderPrintOnly}
            title={context.settings.tenderPrintOnly ? "This device saves through Save & Print only (sales.tender_print_only)." : undefined}
            onClick={() => save(false)}
          >
            Save <span className={quotationStyles.buttonHint}>F5</span>
          </button>
          <button type="button" className={cx(quotationStyles.button, quotationStyles.buttonPrimary)} onClick={() => save(true)}>
            Save &amp; Print <span className={quotationStyles.buttonHint}>F6</span>
          </button>
        </>
      }
    >
      <div ref={bodyRef} tabIndex={-1} className={cx(orderStyles.tenderBody, styles.settleBody)} onKeyDown={onKeyDown}>
        <div className={styles.settleColumns}>
          <div className={styles.settleLeft} data-settle-list="true">
            <div className={quotationStyles.gridHeadTitle}>Tender</div>
            {fallbackReason ? (
              <div className={orderStyles.tenderHintBar}>{fallbackReasonMessage(fallbackReason, mastersError ?? undefined)}</div>
            ) : null}
            <table className={orderStyles.tenderTable}>
              <tbody>
                {rows.map((row) => {
                  const master = built.byId.get(row.tenderId);
                  const mirror = isAdjustRow(row);
                  const panelOwned = mirror || row.typeCode === "LOYALTY";
                  const settled = settledByKey.get(row.key);
                  const value = mirror
                    ? totalAdjusted > 0.005
                      ? String(money(totalAdjusted))
                      : ""
                    : rawText[row.key] ?? (row.keyed ? String(row.keyed) : "");
                  return (
                    <tr
                      key={row.key}
                      className={cx(row.key === activeKey && orderStyles.tenderRowActive)}
                      onClick={() => setActiveKey(row.key)}
                    >
                      <td>
                        <span className={styles.settleDot} style={{ background: master?.tndColour || "#94a3b8" }} />
                        <span className={orderStyles.tenderHotkey}>{row.hotkey ? `${row.hotkey}.` : ""}</span>
                        {row.tenderName}
                        {row.minAmount > 0 ? <span className={orderStyles.tenderRowNote}>min {formatCurrency(row.minAmount)}</span> : null}
                        {settled && settled.surchargeAmt > 0 ? (
                          <span className={orderStyles.tenderRowNote}>+{formatCurrency(settled.surchargeAmt)} fee</span>
                        ) : null}
                      </td>
                      <td className={orderStyles.tenderAmountCell}>
                        <input
                          ref={(node) => {
                            amountRefs.current[row.key] = node;
                          }}
                          className={orderStyles.tenderAmountInput}
                          inputMode="decimal"
                          readOnly={panelOwned}
                          title={
                            mirror
                              ? "What is set off out of the customer's credits — a mirror of the adjust panel, never a tender."
                              : row.typeCode === "LOYALTY"
                                ? "Redeemed from the loyalty panel."
                                : row.typeCode === "CREDIT" && !context.creditAllowed
                                  ? "This customer is not allowed to buy on credit."
                                  : undefined
                          }
                          value={value}
                          onFocus={() => setActiveKey(row.key)}
                          onChange={(event) => {
                            setRawText((current) => ({ ...current, [row.key]: event.target.value }));
                            patchRow(row.key, { keyed: Math.abs(parseCell(event.target.value)) });
                          }}
                          onBlur={() => {
                            if (rawText[row.key] !== undefined) void commitAmount(row);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
                              event.preventDefault();
                              event.stopPropagation();
                              if (panelOwned) {
                                setActiveKey(row.key);
                                window.requestAnimationFrame(() => panelFirstRef.current?.focus());
                                return;
                              }
                              void commitAmount(row);
                            }
                          }}
                          aria-label={`${row.tenderName} amount`}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {cashLine ? (
              <div className={cx(styles.settleCashLine, cashNote && styles.settleCashLineOver)}>
                {cashLine}
                {cashNote?.statutory
                  ? ` — limit ${cashNote.statutory.value ?? ""} (${cashNote.statutory.code}, from ${cashNote.statutory.effectiveFrom})`
                  : cashNote
                    ? ` — ${cashNote.message}`
                    : ""}
              </div>
            ) : null}

            {identityVisible ? (
              <div className={styles.settleIdentity}>
                <div className={quotationStyles.gridHeadTitle}>Identity</div>
                {panNote ? <p className={quotationStyles.modalNote}>{panNote.message}</p> : null}
                <div className={quotationStyles.fieldGrid}>
                  <Field label="PAN" htmlFor="settle-pan">
                    <input
                      id="settle-pan"
                      className={quotationStyles.input}
                      value={pan}
                      maxLength={10}
                      placeholder="AAAAA9999A"
                      onChange={(event) => setPan(event.target.value.toUpperCase())}
                    />
                  </Field>
                  <Field label="Form 60 ref" htmlFor="settle-form60">
                    <input
                      id="settle-form60"
                      className={quotationStyles.input}
                      value={form60}
                      maxLength={50}
                      onChange={(event) => setForm60(event.target.value)}
                    />
                  </Field>
                </div>
              </div>
            ) : null}

            <div className={styles.settleChips}>
              <Chip label="Bill Total" value={context.grossAmount} colour={CHIP.total} />
              {settlement.totals.surchargeSum > 0 ? (
                <Chip label="Service Charge" value={settlement.totals.surchargeSum} colour={CHIP.service} />
              ) : null}
              <Chip label="Tender" value={settlement.totals.tendered} colour={CHIP.tender} />
              <Chip label={balanceChip.label} value={balanceChip.value} colour={balanceChip.colour} />
              {totalAdjusted > 0.005 ? <Chip label="Adjusted" value={totalAdjusted} colour={CHIP.adjusted} /> : null}
            </div>
          </div>

          <div className={styles.settleRight}>{panelFor(activeRow)}</div>
        </div>
        <div className={orderStyles.tenderKeyHint}>{hint}</div>
      </div>
    </ModalShell>
  );
}

function Chip({ label, value, colour }: { label: string; value: number; colour: string }) {
  return (
    <span className={styles.settleChip} style={{ borderColor: colour, color: colour }}>
      <span className={styles.settleChipLabel}>{label}</span>
      <span className={styles.settleChipValue}>{formatCurrency(value)}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// The instrument panel (§15.7)
// ---------------------------------------------------------------------------

function InstrumentPanel({
  row,
  base,
  surchargeAmt,
  total,
  spec,
  bankDropdownId,
  billToName,
  onPatch,
  onBaseChange,
  firstRef,
}: {
  row: BillTenderRow;
  base: number;
  surchargeAmt: number;
  total: number;
  spec: ReturnType<typeof instrumentSpecOf>;
  bankDropdownId: string;
  billToName: string;
  onPatch: (patch: Partial<BillTenderRow>) => void;
  onBaseChange: (value: number) => void;
  firstRef: React.MutableRefObject<HTMLInputElement | null>;
}) {
  const isCheque = row.typeCode === "CHEQUE";
  const isCard = row.typeCode === "CARD";
  const showBank = isCard || isCheque || spec.bank !== "none";
  const showRef = row.needsRef || isCheque || Boolean(spec.refLabel);
  // A cheque date is defaulted to today IN STATE, not just in the input — an
  // undated cheque cannot be judged post-dated.
  useEffect(() => {
    if (isCheque && !row.instrumentDate) {
      onPatch({ instrumentDate: todayIso() });
    }
    if (isCheque && !row.cheque) {
      onPatch({ cheque: { drawerName: billToName || null, bankBranch: null, ifsc: null, micr: null } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.key]);
  const [baseText, setBaseText] = useState(String(base || ""));
  useEffect(() => {
    setBaseText(base ? String(base) : "");
  }, [base]);
  return (
    <div className={styles.settlePanel}>
      <div className={quotationStyles.gridHeadTitle}>{row.tenderName}</div>
      <div className={quotationStyles.fieldGrid}>
        <Field label="Amount" htmlFor="settle-amount">
          <input
            id="settle-amount"
            className={cx(quotationStyles.input, quotationStyles.alignRight)}
            inputMode="decimal"
            value={baseText}
            onChange={(event) => setBaseText(event.target.value)}
            onBlur={() => onBaseChange(Math.abs(parseCell(baseText)))}
          />
        </Field>
        <Field label="Service %" htmlFor="settle-surcharge">
          <span className={styles.settleInline}>
            <input
              id="settle-surcharge"
              className={cx(quotationStyles.input, quotationStyles.alignRight)}
              inputMode="decimal"
              value={String(row.surchargePerc)}
              disabled={!row.editSurcharge}
              title={row.editSurcharge ? undefined : "The tender master does not let the counter edit the surcharge."}
              onChange={(event) => onPatch({ surchargePerc: Math.max(0, parseCell(event.target.value)) })}
            />
            <span className={orderStyles.tenderMoney}>{formatCurrency(surchargeAmt)}</span>
          </span>
        </Field>
        <Field label="Total">
          <output className={cx(orderStyles.creditFieldValue)}>{formatCurrency(total)}</output>
        </Field>
        {showBank ? (
          <DropdownCombo
            id="settle-bank"
            label={`Bank${isCheque ? " *" : ""}`}
            dropdownId={bankDropdownId}
            valueKey="bnk_name"
            labelKey="bnk_name"
            value={row.bankName ?? ""}
            selectedLabel={row.bankName ?? ""}
            disabled={false}
            placeholder="Search banks…"
            onSelect={(value) => onPatch({ bankName: value })}
          />
        ) : null}
        {isCard ? (
          <Field label="Expiry Date" htmlFor="settle-expiry">
            <input
              id="settle-expiry"
              className={quotationStyles.input}
              type="month"
              value={row.instrumentDate ? row.instrumentDate.slice(0, 7) : ""}
              onChange={(event) => onPatch({ instrumentDate: event.target.value ? `${event.target.value}-01` : null })}
            />
          </Field>
        ) : null}
        {isCheque ? (
          <DateField
            id="settle-cheque-date"
            label="Cheque Date *"
            value={row.instrumentDate ?? ""}
            disabled={false}
            onChange={(value) => onPatch({ instrumentDate: value || null })}
          />
        ) : null}
        {isCard ? (
          <Field label="Card No (last 4 kept)" htmlFor="settle-card">
            <input
              id="settle-card"
              ref={firstRef}
              className={quotationStyles.input}
              value={row.cardDigits ?? ""}
              maxLength={19}
              inputMode="numeric"
              autoComplete="off"
              onChange={(event) => onPatch({ cardDigits: event.target.value })}
            />
          </Field>
        ) : null}
        {showRef ? (
          <Field label={`${refLabelOf(row)}${row.needsRef && row.typeCode !== "UPI" ? " *" : ""}`} htmlFor="settle-ref">
            <input
              id="settle-ref"
              ref={isCard ? undefined : firstRef}
              className={quotationStyles.input}
              value={row.refNo ?? ""}
              maxLength={100}
              placeholder={row.typeCode === "UPI" ? "optional" : undefined}
              autoComplete="off"
              onChange={(event) => onPatch({ refNo: event.target.value })}
            />
          </Field>
        ) : null}
        {isCheque ? (
          <>
            <Field label="Drawer" htmlFor="settle-drawer">
              <input
                id="settle-drawer"
                className={quotationStyles.input}
                value={row.cheque?.drawerName ?? ""}
                maxLength={150}
                onChange={(event) => onPatch({ cheque: { ...(row.cheque ?? { drawerName: null, bankBranch: null, ifsc: null, micr: null }), drawerName: event.target.value } })}
              />
            </Field>
            <Field label="Bank Branch" htmlFor="settle-branch">
              <input
                id="settle-branch"
                className={quotationStyles.input}
                value={row.cheque?.bankBranch ?? ""}
                maxLength={100}
                onChange={(event) => onPatch({ cheque: { ...(row.cheque ?? { drawerName: null, bankBranch: null, ifsc: null, micr: null }), bankBranch: event.target.value } })}
              />
            </Field>
            <Field label="IFSC" htmlFor="settle-ifsc">
              <input
                id="settle-ifsc"
                className={quotationStyles.input}
                value={row.cheque?.ifsc ?? ""}
                maxLength={11}
                placeholder="SBIN0001234"
                onChange={(event) => onPatch({ cheque: { ...(row.cheque ?? { drawerName: null, bankBranch: null, ifsc: null, micr: null }), ifsc: event.target.value.toUpperCase() } })}
              />
            </Field>
            <Field label="MICR" htmlFor="settle-micr">
              <input
                id="settle-micr"
                className={quotationStyles.input}
                value={row.cheque?.micr ?? ""}
                maxLength={9}
                inputMode="numeric"
                onChange={(event) => onPatch({ cheque: { ...(row.cheque ?? { drawerName: null, bankBranch: null, ifsc: null, micr: null }), micr: event.target.value.replace(/\D/g, "") } })}
              />
            </Field>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TEMP_CR — "who is borrowing" (§15.7)
// ---------------------------------------------------------------------------

function TempCreditPanel({
  row,
  context,
  openCredits,
  onPatch,
  firstRef,
}: {
  row: BillTenderRow;
  context: SettleContext;
  openCredits: PartyTempCredit[];
  onPatch: (patch: Partial<BillTenderRow>) => void;
  firstRef: React.MutableRefObject<HTMLInputElement | null>;
}) {
  const maxDays = context.settings.tempCreditMaxDays > 0 ? context.settings.tempCreditMaxDays : 365;
  const details = row.tempCredit ?? {
    name: "",
    mobile: "",
    place: null,
    addr: null,
    idRef: null,
    days: Math.min(7, maxDays),
    notes: null,
  };
  useEffect(() => {
    if (!row.tempCredit) {
      onPatch({ tempCredit: details });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.key]);
  const set = (patch: Partial<typeof details>) => onPatch({ tempCredit: { ...details, ...patch } });
  const due = new Date(`${todayIso()}T00:00:00`);
  due.setDate(due.getDate() + Math.max(0, details.days));
  const dueText = `${String(due.getDate()).padStart(2, "0")}-${String(due.getMonth() + 1).padStart(2, "0")}-${due.getFullYear()}`;
  return (
    <div className={styles.settlePanel}>
      <div className={quotationStyles.gridHeadTitle}>Temp Credit — who is borrowing</div>
      <div className={quotationStyles.fieldGrid}>
        <Field label="Name" htmlFor="settle-tc-name" required>
          <input id="settle-tc-name" ref={firstRef} className={quotationStyles.input} value={details.name} maxLength={100} onChange={(event) => set({ name: event.target.value })} />
        </Field>
        <Field label="Mobile" htmlFor="settle-tc-mobile" required>
          <input id="settle-tc-mobile" className={quotationStyles.input} value={details.mobile} maxLength={15} inputMode="tel" onChange={(event) => set({ mobile: event.target.value.replace(/[^0-9 +]/g, "") })} />
        </Field>
        <Field label="Place" htmlFor="settle-tc-place">
          <input id="settle-tc-place" className={quotationStyles.input} value={details.place ?? ""} maxLength={100} onChange={(event) => set({ place: event.target.value || null })} />
        </Field>
        <Field label="Address" htmlFor="settle-tc-addr">
          <input id="settle-tc-addr" className={quotationStyles.input} value={details.addr ?? ""} maxLength={250} onChange={(event) => set({ addr: event.target.value || null })} />
        </Field>
        <Field label="Pay in (days)" htmlFor="settle-tc-days">
          <span className={styles.settleInline}>
            <input
              id="settle-tc-days"
              className={cx(quotationStyles.input, quotationStyles.alignRight)}
              type="number"
              min={1}
              max={maxDays}
              value={details.days}
              onChange={(event) => set({ days: Math.min(maxDays, Math.max(1, Math.trunc(Number(event.target.value) || 1))) })}
            />
            <span className={quotationStyles.modalNote}>due {dueText}</span>
          </span>
        </Field>
        <Field label="Notes" htmlFor="settle-tc-notes">
          <input id="settle-tc-notes" className={quotationStyles.input} value={details.notes ?? ""} maxLength={250} onChange={(event) => set({ notes: event.target.value || null })} />
        </Field>
      </div>
      <div className={quotationStyles.gridHeadActions}>
        <button
          type="button"
          className={quotationStyles.button}
          onClick={() =>
            set({
              name: context.billToName,
              mobile: normaliseMobile(context.billToPhone ?? ""),
              place: context.billToPlace,
              addr: context.billToAddr,
            })
          }
        >
          Copy from bill-to
        </button>
      </div>
      {openCredits.map((credit) => (
        <p key={credit.atcId} className={styles.settleWarning}>
          This mobile already has an OPEN temp credit: {credit.billRefno ?? "?"} · {formatCurrency(credit.balance)} · due{" "}
          {credit.dueDate ?? "—"}
          {context.settings.tempCreditBlockOpen === "REFUSE" ? " — Post will refuse" : ""}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LOYALTY (§15.7, §28 Q7: amount only, points shown)
// ---------------------------------------------------------------------------

function LoyaltyPanel({
  row,
  facts,
  onPatch,
  firstRef,
}: {
  row: BillTenderRow;
  facts: LoyaltyFacts;
  onPatch: (patch: Partial<BillTenderRow>) => void;
  firstRef: React.MutableRefObject<HTMLInputElement | null>;
}) {
  const [text, setText] = useState(row.keyed ? String(row.keyed) : "");
  useEffect(() => {
    setText(row.keyed ? String(row.keyed) : "");
  }, [row.keyed]);
  const commit = () => {
    const wanted = Math.abs(parseCell(text));
    const result = loyaltyRedeem(wanted, facts);
    if (result.refused) {
      toast.warn(result.refused);
      setText("");
      onPatch({ keyed: 0, loyaltyPoints: 0, loyaltyRate: facts.rate });
      return;
    }
    setText(result.amount ? String(result.amount) : "");
    onPatch({ keyed: result.amount, loyaltyPoints: result.points, loyaltyRate: facts.rate });
  };
  return (
    <div className={styles.settlePanel}>
      <div className={quotationStyles.gridHeadTitle}>Loyalty</div>
      <p className={quotationStyles.modalNote}>{facts.hint}</p>
      <div className={quotationStyles.fieldGrid}>
        <Field label="Points">
          <output className={orderStyles.creditFieldValue}>
            {facts.points} (redeemable {facts.redeemable} · worth {formatCurrency(facts.worth)})
          </output>
        </Field>
        <Field label="Redeem amount" htmlFor="settle-loyalty-amount">
          <input
            id="settle-loyalty-amount"
            ref={firstRef}
            className={cx(quotationStyles.input, quotationStyles.alignRight)}
            inputMode="decimal"
            value={text}
            readOnly={!facts.usable}
            title={facts.usable ? undefined : facts.hint}
            onChange={(event) => setText(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                commit();
              }
            }}
          />
        </Field>
        <Field label="Points used">
          <output className={orderStyles.creditFieldValue}>{row.loyaltyPoints}</output>
        </Field>
      </div>
    </div>
  );
}
