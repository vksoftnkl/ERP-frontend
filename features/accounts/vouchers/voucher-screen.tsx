"use client";

/**
 * The Voucher Register's entry screen, with the type FIXED — the Qt
 * `VoucherRegisterEntry(parent, code)`, mounted for Contra (menu 104, `Con`),
 * the Receipt Voucher (260, `RcpV`) and the Payment Voucher (261, `PmtV`).
 *
 * Top to bottom, Qt's layout (`voucher_register_entry.ui`):
 *
 *   Purchase (Accounting) — new · company · year      DRAFT · numbered at Post
 *   [the register's type band]
 *   NUMBERING · PARTY · BILL-WISE · DEBIT SIDE · CREDIT SIDE · GST · TDS
 *   Party *     | Date *        | Supplier bill no * | Place of supply
 *   GSTIN       | Collected by  | Bill date          | Narration
 *   the party's facts — credit days, TDS section, state, outstanding
 *   # · Dr/Cr · Ledger · Group · GST · HSN/SAC · TDS · Debit · Credit · Role · Leg narration · Instrument
 *     …the typed lines, then the server's own legs (locked; amber = post-dated)
 *   hints · the cursor ledger's balance ……… working it out… · Debit · Credit · DIFFERENCE
 *   Cheques on this voucher · Cheque books · GST · Bill-wise · Balance
 *   [the server's verdict]   ◀ Prev  Next ▶  New  Save draft  Save  Save & Print  Exceptions  List  …  Close
 *
 * The header is four label-left columns, Qt's QFormLayouts: a row the type
 * has no use for is left out and the column closes up (a Journal's Narration
 * rises to the top of the fourth).
 *
 * Every part is the TYPE's to switch on — the party on the header (ONE) or on
 * the lines (MANY), the GST band, bill-wise (a card for one party, a popup
 * per line for many), TDS, instruments — so a Contra draws none of them and
 * a Purchase (Accounting) nearly all.
 *
 * Every figure is the server's (`/vouchers/validate`), shown dimmed while an
 * edit is waiting to be worked out; a voucher out by a paisa is refused at
 * post and Save says why.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { skipToken } from "@reduxjs/toolkit/query";
import { useBusinessContext } from "@/components/layout/business-context";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { useDropdownId } from "@/lib/configured-dropdowns";
import DeleteConfirmModal from "@/components/ui/delete-confirm-modal";
import { useUiTableId } from "@/lib/ui-tables";
import { todayIso } from "@/features/sales/quotation/quotation.utils";
import { useGetQuotationGridLayoutQuery } from "@/store/api/quotationApi";
import { useGetVoucherLedgerBalanceQuery, type LedgerPickRow } from "@/store/api/vouchersApi";
import styles from "@/features/accounts/receipt/page.module.scss";
import { BillwiseDialog } from "./components/billwise-dialog";
import { InstrumentDialog } from "./components/instrument-dialog";
import { LedgerPicker } from "./components/ledger-picker";
import { LegsGrid, allLegColumns, legColumnsFor } from "./components/legs-grid";
import { useGridSettings } from "@/features/sales/quotation/components/grid-settings";
import { useColumnResize } from "@/features/sales/quotation/components/use-column-resize";
import { ReasonDialog } from "./components/reason-dialog";
import { BillCard } from "./components/bill-card";
import { ExceptionsDialog } from "./components/exceptions-dialog";
import { GstBox } from "./components/gst-box";
import { ReviewDialog } from "./components/review-dialog";
import { VoucherExtras } from "./components/voucher-extras";
import { amountPaise, formatPaise } from "./domain/lines";
import own from "./vouchers.module.scss";
import {
  useVoucherEntry,
  type BillwiseAnswer,
  type BillwiseAsk,
  type ConfirmAsk,
  type PromptAsk,
  type ReviewAsk,
  type VoucherScope,
} from "./state/use-voucher-entry";
import type { VoucherKeys, VoucherTypeRules } from "./vouchers.types";

type DialogRequest =
  | { kind: "confirm"; ask: ConfirmAsk; resolve: (ok: boolean) => void }
  | { kind: "prompt"; ask: PromptAsk; resolve: (value: string | null) => void }
  | { kind: "review"; ask: ReviewAsk; resolve: (overrides: string[] | null) => void }
  | { kind: "billwise"; ask: BillwiseAsk; resolve: (answer: BillwiseAnswer) => void };

const FLASH_MS = 4500;

/**
 * The legs grid walks its own Enter order (Ledger, then the line's amount,
 * then the next line), so a Focus box is kept with the layout but read by
 * nothing here — the Admin settings dialog says so.
 */
const LEGS_FOCUS_NOTE =
  "Focus is kept with the layout; this grid's Enter walks Ledger → amount → the next line and does not read it.";

export type VoucherScreenProps = {
  typeCode: string;
  /** The type's own menu; none on the Voucher Register. */
  menuId?: number;
  /** What the menu calls it, until the type's own name has been read. */
  title: string;
  /** The all-in-one Voucher Register (menu 262): a band of every type. */
  register?: boolean;
  initialKeys?: VoucherKeys;
  /** The register's band: start a clean voucher of another type. */
  onSwitchType?: (typeCode: string) => void;
  onBackToList: () => void;
};

/** The Exceptions list is about journals and notes: on their menus, and on the register. */
const EXCEPTION_TYPES = new Set(["Jrl", "DrN", "CrN"]);

/**
 * The party's document fields, captioned from the party's side as Qt does: a
 * purchase's "Supplier bill no", a sale's "Customer ref" — required where the
 * voucher raises a SALES / PURCHASE bill. A note's raised bill is a journal
 * one, its ref optional ("Their ref": Qt's side caption would call a credit
 * note's customer a supplier).
 */
function docCaptions(rules: VoucherTypeRules | null): { refno: string; date: string } {
  const raises = rules?.billwiseMode === "RAISE" && Boolean(rules.raiseBillType) && rules.raiseBillType !== "JOURNAL";
  if (!raises || rules?.partyMode !== "ONE") {
    return { refno: "Their ref", date: "Bill date" };
  }
  return {
    refno: `${rules.partySide === "CR" ? "Supplier bill no" : "Customer ref"} *`,
    date: "Bill date",
  };
}

/** The side's groups in the server's order — "any ledger" when it lists none. */
function groupsLine(groups: VoucherTypeRules["drGroups"]): string {
  return groups.length === 0 ? "any ledger" : groups.map((group) => group.name).join(", ");
}

function partyLine(rules: VoucherTypeRules): string {
  if (rules.partyMode === "NONE") return "none";
  if (rules.partyMode === "MANY") return "on the lines";
  return `one, on the ${rules.partySide === "CR" ? "Cr" : "Dr"} side`;
}

function displayDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : iso;
}

export default function VoucherScreen(props: VoucherScreenProps) {
  const { typeCode, menuId, title, register = false, initialKeys, onSwitchType, onBackToList } = props;
  const { activeCompany, activeBranch, activeFiscalYear } = useBusinessContext();
  const [scope] = useState<VoucherScope>(() => ({
    companyId: activeCompany?.id ?? "",
    branchId: activeBranch?.id ?? "",
    accYear: (activeFiscalYear?.name ?? "").trim(),
  }));

  // ── The dialogs the hook asks for, as promises ────────────────────────────
  const [dialog, setDialog] = useState<DialogRequest | null>(null);
  const confirm = useCallback(
    (ask: ConfirmAsk) => new Promise<boolean>((resolve) => setDialog({ kind: "confirm", ask, resolve })),
    [],
  );
  const prompt = useCallback(
    (ask: PromptAsk) => new Promise<string | null>((resolve) => setDialog({ kind: "prompt", ask, resolve })),
    [],
  );
  const review = useCallback(
    (ask: ReviewAsk) => new Promise<string[] | null>((resolve) => setDialog({ kind: "review", ask, resolve })),
    [],
  );
  const billwise = useCallback(
    (ask: BillwiseAsk) => new Promise<BillwiseAnswer>((resolve) => setDialog({ kind: "billwise", ask, resolve })),
    [],
  );

  const api = useVoucherEntry({ typeCode, menuId, scope, appDate: todayIso(), confirm, prompt, review, billwise });
  const { doc, lines, rules, rights, readOnly, totals } = api;
  const employeeDropdownId = useDropdownId("employee");
  const employeeParams = useMemo(() => ({ iemp_branch_id: scope.branchId }), [scope.branchId]);
  const typeName = api.type?.typeName ?? title;
  const blocked = Boolean(api.typesProblem);
  const captions = docCaptions(rules);
  const stateDropdownId = useDropdownId("gstStateCode");
  const fieldId = useId();

  // ── The legs grid's layout (ui table 39) ──────────────────────────────────
  const legsTableId = useUiTableId("voucherLegs");
  const { data: legsLayout } = useGetQuotationGridLayoutQuery({ uiTableId: legsTableId }, { skip: !legsTableId });
  // TDS shows on a deducting type — per line on many parties, else when the party is TDS-applicable.
  const legRules = useMemo(
    () => (rules ? { ...rules, tdsMode: api.tdsColumn ? rules.tdsMode : ("OFF" as const) } : null),
    [api.tdsColumn, rules],
  );
  // Every configured column feeds the drag and the Admin settings dialog (a
  // hidden one is brought back there); the grid draws what the type uses.
  const allLegs = useMemo(() => allLegColumns(legsLayout), [legsLayout]);
  const legResize = useColumnResize(allLegs, legsTableId);
  const legSettings = useGridSettings({
    label: "Voucher legs",
    uiTableId: legsTableId,
    columns: legResize.columns,
    pendingWidthCount: legResize.pendingCount,
    savingWidths: legResize.saving,
    onSaveWidths: legResize.saveWidths,
    focusNote: LEGS_FOCUS_NOTE,
  });
  const columns = useMemo(() => legColumnsFor(legResize.columns, legRules), [legResize.columns, legRules]);

  /** The ITC class the typed lines at these (payload) rows share. */
  const itcOf = useCallback(
    (rowNos: readonly number[]): string => {
      const classes = new Set(
        rowNos.map((rowNo) => {
          const key = api.keyOfRow.get(rowNo);
          return lines.find((line) => line.key === key)?.itcEligibility ?? "";
        }),
      );
      if (classes.size > 1) {
        return "mixed";
      }
      return [...classes][0] ?? "";
    },
    [api.keyOfRow, lines],
  );

  // ── The cursor and the picker ─────────────────────────────────────────────
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  /** The ledger picker — on a line, or (`key` null) for the header party. */
  const [picker, setPicker] = useState<{ key: string | null; seed: string } | null>(null);
  const [exceptionsOpen, setExceptionsOpen] = useState(false);
  const [instrumentFor, setInstrumentFor] = useState<string | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const currentLine = lines.find((line) => line.key === currentKey) ?? null;

  // A refusal said where the operator is looking, gone after a moment.
  const [flash, setFlash] = useState("");
  const flashTimer = useRef<number | null>(null);
  const say = useCallback((message: string) => {
    setFlash(message);
    if (flashTimer.current !== null) {
      window.clearTimeout(flashTimer.current);
    }
    flashTimer.current = window.setTimeout(() => setFlash(""), FLASH_MS);
  }, []);
  useEffect(
    () => () => {
      if (flashTimer.current !== null) {
        window.clearTimeout(flashTimer.current);
      }
    },
    [],
  );

  const focusCell = useCallback((key: string, col: string) => {
    window.setTimeout(() => {
      const element = pageRef.current?.querySelector<HTMLElement>(
        `[data-line-key="${CSS.escape(key)}"][data-col="${col}"]`,
      );
      element?.focus();
      if (element instanceof HTMLInputElement) {
        element.select();
      }
    }, 0);
  }, []);

  const focusParty = useCallback(() => {
    window.setTimeout(() => pageRef.current?.querySelector<HTMLElement>('[data-field="party"]')?.focus(), 0);
  }, []);

  const onPicked = (key: string | null, ledger: LedgerPickRow) => {
    setPicker(null);
    if (key === null) {
      api.setParty(ledger.ledId, ledger.name);
      // On to the first line: the party is the header's, its lines follow.
      const first = lines[0];
      if (first) {
        focusCell(first.key, "ledger");
      }
      return;
    }
    const side = api.pickLedger(key, ledger);
    // On to the amount on the line's own side.
    focusCell(key, side === "CR" ? "credit" : "debit");
  };

  /** The next line's Ledger — where the next party, or the bank, goes. */
  const toNextLine = useCallback(
    (key: string) => {
      const index = lines.findIndex((line) => line.key === key);
      const next = lines[index + 1];
      if (next) {
        focusCell(next.key, "ledger");
      }
    },
    [focusCell, lines],
  );

  const onAmountEnter = async (key: string) => {
    const line = lines.find((candidate) => candidate.key === key);
    if (api.wantsBillwise(line)) {
      await api.requestBillwise(key);
    }
    toNextLine(key);
  };

  const openInstrument = (key: string) => {
    const blockedWhy = api.instrumentBlock(key);
    if (blockedWhy) {
      say(blockedWhy);
      return;
    }
    if (api.instrumentsOn) {
      setInstrumentFor(key);
    }
  };
  const instrumentLine = instrumentFor ? (lines.find((line) => line.key === instrumentFor) ?? null) : null;

  // ── The balance of the ledger under the cursor ────────────────────────────
  const balance = useGetVoucherLedgerBalanceQuery(
    currentLine?.ledgerId && doc.header.date && scope.companyId
      ? {
          companyId: doc.header.companyId || scope.companyId,
          branchId: doc.header.branchId || scope.branchId,
          accYear: doc.header.accYear || scope.accYear,
          ledgerId: currentLine.ledgerId,
          asOn: doc.header.date,
        }
      : skipToken,
  );

  // ── Opened by key ─────────────────────────────────────────────────────────
  const load = api.load;
  const opened = useRef(false);
  useEffect(() => {
    if (!initialKeys || opened.current) {
      return;
    }
    opened.current = true;
    void load(initialKeys);
  }, [load, initialKeys]);

  // ── Leaving with unsaved work ─────────────────────────────────────────────
  useEffect(() => {
    if (!api.dirty) {
      return;
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [api.dirty]);

  /** The register's band: a clean voucher of another type — after asking, if lines are typed. */
  const switchType = useCallback(
    async (code: string, name: string) => {
      if (!onSwitchType || code === (doc.rules?.typeCode ?? typeCode)) {
        return;
      }
      if (api.dirty || lines.some((line) => line.ledgerId)) {
        const ok = await confirm({
          title: "Switch voucher type",
          message: `Switch to ${name}? The lines typed so far are cleared.`,
          confirmLabel: "Switch",
        });
        if (!ok) {
          return;
        }
      }
      onSwitchType(code);
    },
    [api.dirty, confirm, doc.rules?.typeCode, lines, onSwitchType, typeCode],
  );

  const close = useCallback(async () => {
    if (api.dirty) {
      const ok = await confirm({
        title: "Close the voucher",
        message: "Nothing has been posted. Close and lose what is keyed?",
        confirmLabel: "Close",
      });
      if (!ok) {
        return;
      }
    }
    onBackToList();
  }, [api.dirty, confirm, onBackToList]);

  const toList = useCallback(async () => {
    if (await api.confirmDiscard("Open a voucher")) {
      onBackToList();
    }
  }, [api, onBackToList]);

  // ── Keys ──────────────────────────────────────────────────────────────────
  const keyState = {
    api,
    close,
    toList,
    focusParty,
    modal: dialog !== null || picker !== null || instrumentFor !== null || exceptionsOpen || legSettings.active,
    blocked,
  };
  const keyRef = useRef(keyState);
  useEffect(() => {
    keyRef.current = keyState;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const state = keyRef.current;
      // The browser's F5 reloads and F6 jumps to the address bar: never theirs here.
      if (event.key === "F5" || event.key === "F6" || event.key === "F7" || event.key === "F8") {
        event.preventDefault();
      }
      if (state.modal) {
        return;
      }
      if (state.blocked && event.key !== "Escape") {
        return;
      }
      if (event.key === "F5" || event.key === "F6" || (event.ctrlKey && event.key === "Enter")) {
        event.preventDefault();
        // Save & Print falls back to Save: there is no print template yet.
        void state.api.post();
        return;
      }
      if (event.key === "F7") {
        void state.api.newDocument();
        return;
      }
      if (event.key === "F4" && state.api.partyOne && !state.api.readOnly) {
        event.preventDefault();
        state.focusParty();
        return;
      }
      if (event.key === "F8") {
        void state.toList();
        return;
      }
      if (event.ctrlKey && (event.key === "PageUp" || event.key === "PageDown")) {
        event.preventDefault();
        void state.api.walk(event.key === "PageUp" ? "prev" : "next");
        return;
      }
      if (event.key === "Escape" && !event.defaultPrevented) {
        void state.close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── Where the caret starts: the first line's Ledger ───────────────────────
  const firstKey = lines[0]?.key;
  useEffect(() => {
    if (readOnly || blocked) {
      return;
    }
    // A one-party voucher starts on its party, picked first.
    if (api.partyOne && !doc.header.partyId) {
      focusParty();
    } else if (firstKey) {
      focusCell(firstKey, "ledger");
    }
    // Once per document — and once the type is known (a one-party type starts on its party).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.header.voucherId, doc.status, blocked, Boolean(api.type)]);

  // ── What the title row says ───────────────────────────────────────────────
  const docTitle = `${typeName} — ${
    doc.status === "NEW" ? "new" : doc.voucherRefno ? doc.voucherRefno : "draft"
  }`;
  const pill =
    doc.status === "POSTED"
      ? { text: "POSTED", className: styles.statusPosted }
      : doc.status === "CANCELLED"
        ? {
            text: `CANCELLED${doc.reversal?.refno ? ` · reversed by ${doc.reversal.refno}` : ""}`,
            className: styles.statusCancelled,
          }
        : { text: "DRAFT · numbered at Post", className: styles.statusDraft };
  // A Rev voucher reverses its original; a post-dated cheque's own voucher (same type) hangs under it.
  const pillText = doc.against?.refno
    ? `${pill.text} · ${doc.header.typeCode === typeCode ? "post-dated cheque of" : "reversal of"} ${doc.against.refno}`
    : pill.text;

  const counts = api.derived
    ? { refused: api.derived.refusals.length, warnings: api.derived.warnings.length }
    : { refused: 0, warnings: 0 };

  const staleLine = api.validateProblem
    ? api.validateProblem
    : api.validating
      ? "working it out…"
      : api.note;

  // Qt's hint, with this grid's own keys (+ and − on a cell that takes no typing).
  const legsHint = [
    "+ / Insert adds a line",
    "− / Ctrl+Delete removes it",
    "Enter on Ledger opens the picker",
    ...(api.instrumentsOn ? ["Ctrl+Q: the line's instrument", "Enter on an amount: its bills"] : []),
    "grey rows are worked out by the server",
  ].join(" · ");

  const postTitle = api.postBlock
    ? api.postBlock
    : !totals.fresh
      ? "Save and post (F5) — the figures are not refreshed; Save asks the server again."
      : totals.difference !== 0
        ? `Save and post (F5) — the difference is ${formatPaise(Math.abs(totals.difference))}, not 0.00.`
        : counts.refused > 0
          ? "Save and post (F5) — the server refuses it; Save shows why."
          : "Save and post (F5)";

  const isDraft = doc.status === "DRAFT";
  const isPosted = doc.status === "POSTED";

  return (
    <div className={styles.page} ref={pageRef}>
      <header className={own.titleBar}>
        <h1 className={own.title}>
          {docTitle}
          {api.dirty ? <span className={styles.dirtyMark}> •</span> : null}
        </h1>
        <span className={own.context}>
          {[activeCompany?.name, doc.header.accYear || scope.accYear].filter(Boolean).join(" · ")}
        </span>
        <div className={own.titleRight}>
          <span className={`${styles.statusPill} ${pill.className} ${own.pill}`}>{pillText}</span>
        </div>
      </header>

      {api.typesProblem ? <ul className={styles.problems}><li>{api.typesProblem}</li></ul> : null}

      {register && api.types.length > 0 ? (
        <nav className={styles.registerFilters} aria-label="Voucher type">
          {api.types.map((candidate) => {
            const current = (doc.rules?.typeCode ?? typeCode) === candidate.typeCode;
            return (
              <button
                key={candidate.typeCode}
                type="button"
                tabIndex={-1}
                className={current ? styles.primaryButton : styles.button}
                aria-pressed={current}
                disabled={api.busy}
                onClick={() => void switchType(candidate.typeCode, candidate.typeName)}
              >
                {candidate.typeName}
              </button>
            );
          })}
          <span className={styles.sectionHint}>Opened from: Voucher Register</span>
        </nav>
      ) : null}

      {!blocked && rules ? (
        <section className={own.rules} aria-label="The type's rules">
          {[
            ["Numbering", rules.numberPrefix ? `${rules.numberPrefix}… at Post` : "at Post"],
            ["Party", partyLine(rules)],
            [
              "Bill-wise",
              `${rules.billwiseMode}${rules.billwiseMode === "RAISE" && rules.raiseBillType ? ` · ${rules.raiseBillType}` : ""}`,
            ],
            ["Debit side", groupsLine(rules.drGroups)],
            ["Credit side", groupsLine(rules.crGroups)],
            ["GST", rules.gstRegister ? `${rules.gstRegister} · ${(rules.gstSide ?? "").toLowerCase()}` : "none"],
            ["TDS", rules.tdsMode === "DEDUCT" ? "deducted" : "none"],
          ].map(([caption, value]) => (
            <div key={caption} className={own.rule}>
              <span className={own.ruleCap}>{caption}</span>
              <span className={own.ruleVal}>{value}</span>
            </div>
          ))}
        </section>
      ) : null}

      {!blocked ? (
        <>
          <section className={own.voucherGroup} aria-label="Voucher header">
            <div className={own.voucherForms}>
              {/* Party · GSTIN */}
              <div className={own.form}>
                {api.partyOne ? (
                  <>
                    <label className={own.formCap} htmlFor={`${fieldId}-party`}>
                      Party *
                    </label>
                    <button
                      id={`${fieldId}-party`}
                      type="button"
                      // Required and still empty: red, as Qt's dropdown marks it.
                      className={`${styles.input} ${own.pickField} ${!readOnly && !doc.header.partyId ? own.pickRequired : ""}`}
                      data-field="party"
                      disabled={readOnly}
                      title={readOnly ? undefined : "Enter, F2 or a typed letter picks the party (F4 comes here)"}
                      onClick={() => setPicker({ key: null, seed: "" })}
                      onKeyDown={(event) => {
                        if (readOnly) {
                          return;
                        }
                        if (event.key === "Enter" || event.key === "F2") {
                          event.preventDefault();
                          setPicker({ key: null, seed: "" });
                        } else if (event.key.length === 1 && /\S/.test(event.key) && !event.ctrlKey && !event.altKey) {
                          event.preventDefault();
                          setPicker({ key: null, seed: event.key });
                        }
                      }}
                    >
                      <span className={`${own.pickText} ${doc.header.partyName ? "" : own.pickPlaceholder}`}>
                        {doc.header.partyName || (doc.header.partyId ? "…" : readOnly ? "" : "Pick the party")}
                      </span>
                      <span className={own.chevron} aria-hidden />
                    </button>
                  </>
                ) : null}
                {rules?.partyMode === "MANY" ? (
                  <>
                    <span className={own.formCap}>Party</span>
                    <div
                      className={`${styles.input} ${styles.inputReadOnly} ${own.pickField}`}
                      aria-disabled
                      title="The parties are on the lines"
                    >
                      <span className={own.pickText}>— several — (the parties are on the lines)</span>
                      <span className={own.chevron} aria-hidden />
                    </div>
                  </>
                ) : null}
                {api.partyOne && api.gstBand ? (
                  <>
                    <label className={own.formCap} htmlFor={`${fieldId}-gstin`}>
                      GSTIN
                    </label>
                    <input
                      id={`${fieldId}-gstin`}
                      className={`${styles.input} ${styles.inputReadOnly}`}
                      value={api.facts?.gstin ?? ""}
                      readOnly
                      tabIndex={-1}
                    />
                  </>
                ) : null}
              </div>

              {/* Date · Collected by / Paid by */}
              <div className={own.form}>
                <label className={own.formCap} htmlFor={`${fieldId}-date`}>
                  Date *
                </label>
                <input
                  id={`${fieldId}-date`}
                  className={styles.input}
                  type="date"
                  value={doc.header.date}
                  disabled={readOnly}
                  onChange={(event) => api.setHeader({ date: event.target.value })}
                />
                {api.instrumentsOn ? (
                  <>
                    <span className={own.formCap}>{api.paying ? "Paid by" : "Collected by"}</span>
                    <NexDropdownSingle
                      dropdownId={employeeDropdownId}
                      value={doc.header.employeeId ? { id: doc.header.employeeId, text: "" } : null}
                      onChange={(selection) => api.setHeader({ employeeId: selection?.id ?? "" })}
                      // Dropdown 38 binds a bare `iemp_branch_id` token: always sent.
                      params={employeeParams}
                      clearOnParamsChange={false}
                      disabled={readOnly}
                      placeholder={readOnly ? "" : api.paying ? "Who paid it" : "Who collected it"}
                      aria-label={api.paying ? "Paid by" : "Collected by"}
                      className={styles.dropdownField}
                      advanceFocusOnSelect={false}
                    />
                  </>
                ) : null}
              </div>

              {/* Their ref / bill no · Bill date */}
              <div className={own.form}>
                <label className={own.formCap} htmlFor={`${fieldId}-refno`}>
                  {captions.refno}
                </label>
                <input
                  id={`${fieldId}-refno`}
                  className={styles.input}
                  value={doc.header.docRefno}
                  maxLength={100}
                  disabled={readOnly}
                  onChange={(event) => api.setHeader({ docRefno: event.target.value })}
                />
                <label className={own.formCap} htmlFor={`${fieldId}-docdate`}>
                  {captions.date}
                </label>
                <input
                  id={`${fieldId}-docdate`}
                  className={styles.input}
                  type="date"
                  value={doc.header.docDate}
                  disabled={readOnly}
                  onChange={(event) => api.setHeader({ docDate: event.target.value })}
                />
              </div>

              {/* Place of supply · Narration */}
              <div className={own.form}>
                {api.gstBand ? (
                  <>
                    <span className={own.formCap}>Place of supply</span>
                    <NexDropdownSingle
                      dropdownId={stateDropdownId}
                      // The operator's pick, else what the server applied.
                      value={
                        doc.header.posStcd || api.gstShown?.placeOfSupply
                          ? { id: doc.header.posStcd || api.gstShown?.placeOfSupply || "", text: "" }
                          : null
                      }
                      onChange={(selection) => api.setHeader({ posStcd: selection?.id ?? "" })}
                      disabled={readOnly}
                      placeholder={readOnly ? "" : "the server's default"}
                      aria-label="Place of supply"
                      className={styles.dropdownField}
                      advanceFocusOnSelect={false}
                    />
                  </>
                ) : null}
                <label className={own.formCap} htmlFor={`${fieldId}-narration`}>
                  Narration
                </label>
                <input
                  id={`${fieldId}-narration`}
                  className={styles.input}
                  value={doc.header.remarks}
                  maxLength={500}
                  disabled={readOnly}
                  onChange={(event) => api.setHeader({ remarks: event.target.value })}
                />
              </div>
            </div>
            {api.factsLine ? <p className={own.facts}>{api.factsLine}</p> : null}
          </section>

          <div className={styles.body}>
            <section className={own.legs} aria-label="Lines">
              <LegsGrid
                columns={columns}
                lines={lines}
                generated={api.generated}
                generatedStale={!readOnly && !api.fresh}
                nature={rules?.nature ?? null}
                tenders={api.tenders}
                taxRates={api.taxRates}
                gstSide={api.gstSide}
                readOnly={readOnly}
                problems={api.lineProblems}
                notes={api.lineNotes}
                currentKey={currentKey}
                onCurrent={(key) => {
                  setCurrentKey(key);
                }}
                onChange={api.updateLine}
                onSide={api.setSide}
                onTdsBase={api.setTdsBase}
                onPickLedger={(key, seed) => setPicker({ key, seed })}
                onOpenInstrument={openInstrument}
                onAmountEnter={(key) => void onAmountEnter(key)}
                onRefuse={say}
                onContextMenu={legSettings.onContextMenu}
                resizingKey={legResize.resizingKey}
                onColumnResizeStart={legResize.onResizeStart}
                onInsertAfter={(key) => {
                  const fresh = api.insertLineAfter(key);
                  if (fresh) {
                    focusCell(fresh, "ledger");
                  }
                }}
                onRemove={(key) => void api.removeLine(key)}
              />
            </section>
            <div className={own.totalsRow}>
              <span className={`${own.totalsHint} ${flash ? own.totalsFlash : ""}`} title={flash || legsHint}>
                {flash || legsHint}
              </span>
              {currentLine?.ledgerId && balance.currentData ? (
                <span className={own.totalsBalance}>
                  {`${currentLine.ledgerName || "ledger"} · balance ${formatPaise(
                    Math.round(balance.currentData.amount * 100),
                  )} ${balance.currentData.side === "DR" ? "Dr" : "Cr"} as on ${displayDate(balance.currentData.asOn)}`}
                </span>
              ) : null}
              <span className={own.totalsStale}>{staleLine}</span>
              <span
                className={`${own.totalsFigures} ${totals.fresh ? "" : own.totalsFiguresStale}`}
                title={totals.later > 0 ? "Post-dated lines post on their own vouchers, on their dates." : undefined}
              >
                {totals.later > 0 && totals.fresh
                  ? `TODAY  Debit ${formatPaise(totals.debit)} · Credit ${formatPaise(totals.credit)}  ·  post-dated ${formatPaise(
                      totals.later,
                    )} later`
                  : `Debit ${formatPaise(totals.debit)} · Credit ${formatPaise(totals.credit)}`}
              </span>
              <span
                className={`${own.difference} ${totals.difference === 0 ? own.differenceGood : own.differenceBad}`}
                title="THE ONE RULE — Σ DEBIT = Σ CREDIT"
                style={{ opacity: totals.fresh ? 1 : 0.6 }}
              >
                DIFFERENCE {formatPaise(Math.abs(totals.difference))}
              </span>
            </div>
            <VoucherExtras
              gst={
                api.gstBand ? (
                  <GstBox
                    key="gst"
                    gst={api.gstShown}
                    input={api.gstInput}
                    readOnly={readOnly}
                    reverseCharge={doc.header.reverseCharge}
                    itcOf={itcOf}
                    onItc={api.setItcForRows}
                    onReverseCharge={(value) => api.setHeader({ reverseCharge: value })}
                  />
                ) : null
              }
              billCard={
                api.cardOn && !readOnly ? (
                  <BillCard
                    key="card"
                    rows={api.cardRows}
                    loading={api.cardBillsLoading}
                    hasParty={Boolean(doc.header.partyId)}
                    raisesBill={api.raisesBill}
                    raiseBillType={rules?.raiseBillType ?? null}
                    raised={api.raisedBill}
                    dueDays={api.dueDays}
                    creditDays={api.facts ? api.facts.creditDays : null}
                    readOnly={readOnly}
                    onDueDays={(days) => api.setHeader({ dueDays: days })}
                    onFigure={api.setCardFigure}
                  />
                ) : null
              }
              totals={totals}
              paying={api.paying}
              instrumentsOn={api.instrumentsOn}
              billwiseOn={api.billwiseOn || api.cardOn}
              readOnly={readOnly}
              lines={lines}
              books={api.books}
              tdsNotes={api.tdsNotes}
              postDatedNotes={api.postDatedNotes}
              posted={doc.posted}
            />
          </div>
        </>
      ) : null}

      <footer className={own.footer}>
        {/* Qt's warning strip: the server's verdict, and where Prev / Next ran out. */}
        <div className={own.footerStrip}>
          {!blocked && counts.refused + counts.warnings > 0 && !readOnly ? (
            <button
              type="button"
              className={counts.refused > 0 ? styles.dangerButton : styles.button}
              onClick={() =>
                api.derived &&
                void review({
                  refusals: api.derived.refusals,
                  warnings: api.derived.warnings,
                  canOverride: Boolean(rights?.override),
                })
              }
            >
              {counts.refused} refused · {counts.warnings} warning{counts.warnings === 1 ? "" : "s"} — View
            </button>
          ) : null}
          {api.navNote ? <span>{api.navNote}</span> : null}
        </div>
        <button
          type="button"
          className={styles.button}
          disabled={api.busy || blocked}
          title="Previous voucher (Ctrl+PgUp). On an empty screen, the newest one."
          onClick={() => void api.walk("prev")}
        >
          ◀ Prev
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={api.busy || blocked || !doc.header.voucherId}
          title="Next voucher (Ctrl+PgDn)"
          onClick={() => void api.walk("next")}
        >
          Next ▶
        </button>
        <button type="button" className={styles.button} disabled={blocked} title="New voucher (F7)" onClick={() => void api.newDocument()}>
          New
        </button>
        <button
          type="button"
          className={styles.button}
          disabled={!api.canSaveDraft || api.busy || blocked}
          title={api.canSaveDraft ? "Keep it as a DRAFT: no number, no legs, no bill." : "Nothing to save, or no Create/Edit right."}
          onClick={() => void api.saveDraft()}
        >
          Save draft
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={Boolean(api.postBlock) || api.busy || blocked}
          title={postTitle}
          onClick={() => void api.post()}
        >
          Save
        </button>
        <button
          type="button"
          className={styles.button}
          disabled
          title="Save & Print (F6 / Ctrl+Enter) — printing arrives with the voucher print template; until then Ctrl+Enter saves."
        >
          Save &amp; Print
        </button>
        {register || EXCEPTION_TYPES.has(typeCode) ? (
          <button
            type="button"
            className={styles.button}
            title="Journals and notes that settled a sales or purchase bill by hand (grid 118)"
            onClick={() => setExceptionsOpen(true)}
          >
            Exceptions
          </button>
        ) : null}
        <button type="button" className={styles.button} title="Voucher list (F8)" onClick={() => void toList()}>
          List
        </button>
        {doc.reversal || doc.against ? (
          <button
            type="button"
            className={styles.button}
            disabled={api.busy}
            onClick={() => {
              const link = doc.reversal ?? doc.against;
              if (link) {
                void api.openLinked(link);
              }
            }}
          >
            {doc.reversal ? `Open reversal ${doc.reversal.refno ?? ""}` : `Open original ${doc.against?.refno ?? ""}`}
          </button>
        ) : null}
        {isDraft ? (
          <button
            type="button"
            className={styles.dangerButton}
            disabled={api.busy || !rights?.delete}
            onClick={() => void api.deleteDraft()}
          >
            Delete draft
          </button>
        ) : null}
        {isPosted ? (
          <button
            type="button"
            className={styles.dangerButton}
            disabled={api.busy || Boolean(api.cancelBlock)}
            title={api.cancelBlock ?? undefined}
            onClick={() => void api.cancel()}
          >
            Cancel voucher
          </button>
        ) : null}
        <button type="button" className={styles.button} title="Close (Esc)" onClick={() => void close()}>
          Close
        </button>
      </footer>

      {legSettings.overlays}

      {exceptionsOpen ? (
        <ExceptionsDialog
          companyId={scope.companyId}
          branchId={scope.branchId}
          accYear={scope.accYear}
          typeName={register ? "" : typeName}
          onElsewhere={say}
          onClose={() => setExceptionsOpen(false)}
          onOpen={(keys) => {
            setExceptionsOpen(false);
            void (async () => {
              if (await api.confirmDiscard("Open a voucher")) {
                await api.load(keys);
              }
            })();
          }}
        />
      ) : null}

      {instrumentLine && api.instrumentsOn ? (
        <InstrumentDialog
          title={`Instrument · line ${lines.indexOf(instrumentLine) + 1} · ${instrumentLine.ledgerName}`}
          paying={api.paying}
          tenders={api.tenders}
          books={api.books}
          current={instrumentLine.instrument}
          voucherDate={doc.header.date}
          partyName={instrumentLine.ledgerName}
          linePaise={Number.isFinite(amountPaise(instrumentLine.amount)) ? amountPaise(instrumentLine.amount) : 0}
          onCancel={() => {
            const key = instrumentLine.key;
            setInstrumentFor(null);
            focusCell(key, "instrument");
          }}
          onOk={(instrument) => {
            const key = instrumentLine.key;
            api.setInstrument(key, instrument);
            setInstrumentFor(null);
            focusCell(key, "instrument");
          }}
        />
      ) : null}

      {picker && api.type ? (
        <LedgerPicker
          companyId={scope.companyId}
          branchId={scope.branchId}
          // The loaded voucher's own type (a Rev differs from the menu's).
          typeCode={rules?.typeCode ?? typeCode}
          typeName={typeName}
          side={
            picker.key === null
              ? rules?.partySide === "CR"
                ? "CR"
                : "DR"
              : (lines.find((line) => line.key === picker.key)?.drCr ?? "DR")
          }
          partiesOnly={picker.key === null}
          excludeLedgerId={picker.key !== null && api.partyOne ? doc.header.partyId : undefined}
          title={picker.key === null ? `Party — ${typeName}` : undefined}
          initialSearch={picker.seed}
          onPick={(ledger) => onPicked(picker.key, ledger)}
          onClose={() => {
            const key = picker.key;
            setPicker(null);
            if (key === null) {
              focusParty();
            } else {
              focusCell(key, "ledger");
            }
          }}
        />
      ) : null}

      <DeleteConfirmModal
        isOpen={dialog?.kind === "confirm"}
        title={dialog?.kind === "confirm" ? dialog.ask.title : ""}
        message={dialog?.kind === "confirm" ? dialog.ask.message : ""}
        confirmLabel={dialog?.kind === "confirm" ? (dialog.ask.confirmLabel ?? "Continue") : ""}
        iconVariant="replace"
        onConfirm={() => {
          if (dialog?.kind === "confirm") {
            dialog.resolve(true);
          }
          setDialog(null);
        }}
        onCancel={() => {
          if (dialog?.kind === "confirm") {
            dialog.resolve(false);
          }
          setDialog(null);
        }}
      />
      {dialog?.kind === "prompt" ? (
        <ReasonDialog
          title={dialog.ask.title}
          message={dialog.ask.message}
          placeholder={dialog.ask.placeholder}
          presets={dialog.ask.presets}
          onCancel={() => {
            dialog.resolve(null);
            setDialog(null);
          }}
          onConfirm={(value) => {
            dialog.resolve(value);
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "billwise" ? (
        <BillwiseDialog
          ask={dialog.ask}
          onOk={(answer) => {
            dialog.resolve(answer);
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "review" ? (
        <ReviewDialog
          refusals={dialog.ask.refusals}
          warnings={dialog.ask.warnings}
          canOverride={dialog.ask.canOverride}
          onBack={() => {
            dialog.resolve(null);
            setDialog(null);
          }}
          onProceed={(overrides) => {
            dialog.resolve(overrides);
            setDialog(null);
          }}
        />
      ) : null}
    </div>
  );
}
