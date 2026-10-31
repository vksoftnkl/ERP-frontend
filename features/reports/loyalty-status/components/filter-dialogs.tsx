"use client";
/**
 * F8 — each tab's filters in their own popup (Qt `openFilters()` and the
 * `loyaltyFilterDialog` built in `setupFilters()`): the .ui's frameMemberFilters
 * / frameExpFilters / frameSchFilters, field for field.
 *
 * The popup edits a DRAFT. Apply hands it back and the tab loads; Cancel (or
 * Esc) keeps the filters in force; Reset puts the tab's defaults in the draft
 * without loading — exactly what Qt's snapshot / restore gives. Enter walks
 * to the next field (Qt `EnterNavigation`).
 */
import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { DateInput } from "@/components/design-system/ui/date-input";
import { focusNextInteractiveControl } from "@/components/design-system/ui/focus-next-control";
import { DropdownCombo } from "@/features/sales/quotation/components/fields";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { useDropdownId } from "@/lib/configured-dropdowns";
import styles from "../page.module.scss";
import {
  defaultExpiring,
  defaultMembers,
  defaultSchemes,
  digitsOnly,
  SPLIT_CHOICES,
  STATUS_CHOICES,
  type BranchPick,
  type ExpiringFilters,
  type MembersFilters,
  type SchemeChoice,
  type SchemesFilters,
  type SchemeSplit,
  type Tab,
} from "../query/params";
import type { MemberStatus } from "../wire/types";

const HINT = "Every field is optional. Apply loads the tab with these filters; Cancel keeps the ones in force.";

/** A date typed digit by digit passes through years 0002, 0020, 0202: only a plausible one is kept. */
function plausibleDay(value: string): boolean {
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(value);
  return Boolean(match) && Number(match?.[1]) >= 1990 && Number(match?.[1]) <= 2200;
}

export function DateBox({
  id,
  value,
  label,
  disabled,
  onCommit,
}: {
  id: string;
  value: string;
  label: string;
  disabled?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <span className={styles.dateBox}>
      <DateInput
        id={id}
        block
        className={styles.input}
        aria-label={label}
        disabled={disabled}
        value={draft ?? value}
        onChange={(next) => {
          if (plausibleDay(next)) {
            setDraft(null);
            if (next !== value) onCommit(next);
          } else {
            setDraft(next);
          }
        }}
        onBlur={() => setDraft(null)}
      />
    </span>
  );
}

/** Branch — dropdown 61 "BRANCHES BY COMPANY" on `ibr_comp_id` (Qt `BranchesDd`), blank = all. */
function BranchBox({
  id,
  companyId,
  pick,
  onPick,
}: {
  id: string;
  companyId: string;
  pick: BranchPick;
  onPick: (pick: BranchPick) => void;
}) {
  const dropdownId = useDropdownId("branchByCompany");
  const params = useMemo(() => ({ ibr_comp_id: companyId }), [companyId]);
  return (
    <div className={styles.comboCell}>
      <DropdownCombo
        id={id}
        label="Branch"
        dropdownId={dropdownId}
        valueKey="br_id"
        labelKey="br_name"
        value={pick?.id ?? ""}
        selectedLabel={pick?.text ?? ""}
        placeholder="All branches"
        params={params}
        onSelect={(value, text) => onPick(value ? { id: value, text } : null)}
      />
      {pick ? (
        <button
          type="button"
          className={styles.comboClear}
          title="Branch: all branches"
          aria-label="Clear Branch"
          tabIndex={-1}
          onClick={() => onPick(null)}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

function SchemeBox({
  id,
  value,
  choices,
  onChange,
}: {
  id: string;
  value: string;
  choices: readonly SchemeChoice[];
  onChange: (value: string) => void;
}) {
  return (
    <select id={id} className={styles.select} value={value} onChange={(e) => onChange(e.target.value)}>
      {choices.map((c) => (
        <option key={c.value || "all"} value={c.value}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

function Check({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={styles.check} htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Shell({
  title,
  isOpen,
  onReset,
  onCancel,
  onApply,
  children,
}: {
  title: string;
  isOpen: boolean;
  onReset: () => void;
  onCancel: () => void;
  onApply: () => void;
  children: ReactNode;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter" || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    if (target instanceof HTMLButtonElement || target.getAttribute("role") === "combobox") return;
    event.preventDefault();
    focusNextInteractiveControl(target);
  };
  return (
    <ModalShell
      title={title}
      isOpen={isOpen}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className={styles.button} title="Back to the screen's defaults" onClick={onReset}>
            Reset
          </button>
          <span className={styles.footerSpacer} />
          <button type="button" className={styles.button} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={styles.primaryButton} onClick={onApply}>
            Apply
          </button>
        </>
      }
    >
      <form
        className={styles.dialogBody}
        onSubmit={(e) => {
          e.preventDefault();
          onApply();
        }}
        onKeyDown={onKeyDown}
      >
        <p className={styles.dialogMuted}>{HINT}</p>
        {children}
      </form>
    </ModalShell>
  );
}

/** Puts the caret in Find on open (Ctrl+F), else in the first field. */
function useOpenFocus(isOpen: boolean, focusFind: boolean, findId: string | null, firstId: string) {
  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => {
      const el = document.getElementById(focusFind && findId ? findId : firstId);
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
        el.focus();
        if (el instanceof HTMLInputElement) el.select();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [findId, firstId, focusFind, isOpen]);
}

type DialogProps<F> = {
  isOpen: boolean;
  applied: F;
  companyId: string;
  choices: readonly SchemeChoice[];
  today: string;
  focusFind: boolean;
  onApply: (next: F) => void;
  onCancel: () => void;
};

/* ---------------------------------------------------------------- members */

function MembersBody({ applied, companyId, choices, today, focusFind, isOpen, onApply, onCancel }: DialogProps<MembersFilters>) {
  const [d, setD] = useState<MembersFilters>(applied);
  const set = (patch: Partial<MembersFilters>) => setD((cur) => ({ ...cur, ...patch }));
  useOpenFocus(isOpen, focusFind, "ls-m-find", "ls-m-scheme");
  return (
    <Shell title="Filter members" isOpen={isOpen} onReset={() => setD(defaultMembers(today))} onCancel={onCancel} onApply={() => onApply(d)}>
      <div className={styles.filterForm}>
        <label className={styles.fieldLabel} htmlFor="ls-m-scheme">
          Scheme
        </label>
        <SchemeBox id="ls-m-scheme" value={d.lscId} choices={choices} onChange={(lscId) => set({ lscId })} />
        <label className={styles.fieldLabel} htmlFor="ls-m-branch">
          Branch
        </label>
        <BranchBox id="ls-m-branch" companyId={companyId} pick={d.branch} onPick={(branch) => set({ branch })} />

        <label className={styles.fieldLabel} htmlFor="ls-m-status">
          Status
        </label>
        <select
          id="ls-m-status"
          className={styles.select}
          value={d.status}
          onChange={(e) => set({ status: e.target.value as "" | MemberStatus })}
        >
          {STATUS_CHOICES.map((c) => (
            <option key={c.value || "all"} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <label className={styles.fieldLabel} htmlFor="ls-m-find">
          Find
        </label>
        <input
          id="ls-m-find"
          className={styles.input}
          placeholder="card no / mobile / customer name"
          autoComplete="off"
          value={d.find}
          onChange={(e) => set({ find: e.target.value })}
        />

        <label className={styles.fieldLabel} htmlFor="ls-m-min">
          Points
        </label>
        <span className={styles.inline}>
          <input
            id="ls-m-min"
            className={`${styles.input} ${styles.inputShort}`}
            placeholder="min"
            inputMode="numeric"
            autoComplete="off"
            value={d.pointsMin}
            onChange={(e) => set({ pointsMin: digitsOnly(e.target.value) })}
          />
          <span className={styles.fieldLabel}>to</span>
          <input
            id="ls-m-max"
            className={`${styles.input} ${styles.inputShort}`}
            placeholder="max"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Points max"
            value={d.pointsMax}
            onChange={(e) => set({ pointsMax: digitsOnly(e.target.value) })}
          />
        </span>
        <span />
        <span />

        <div className={styles.formRow}>
          <Check id="ls-m-balance" label="Balance > 0 only" checked={d.balanceGtZero} onChange={(v) => set({ balanceGtZero: v })} />
          <Check id="ls-m-eligible" label="Eligible for a gift only" checked={d.eligibleOnly} onChange={(v) => set({ eligibleOnly: v })} />
          <Check
            id="ls-m-merged"
            label="Include merged / closed"
            checked={d.includeMergedClosed}
            onChange={(v) => set({ includeMergedClosed: v })}
          />
        </div>
        <div className={styles.formRow}>
          <Check id="ls-m-earned" label="Earned between" checked={d.earned} onChange={(v) => set({ earned: v })} />
          <DateBox
            id="ls-m-earned-from"
            label="Earned from"
            value={d.earnedFrom}
            disabled={!d.earned}
            onCommit={(earnedFrom) => set({ earnedFrom })}
          />
          <span className={styles.fieldLabel}>and</span>
          <DateBox
            id="ls-m-earned-to"
            label="Earned to"
            value={d.earnedTo}
            disabled={!d.earned}
            onCommit={(earnedTo) => set({ earnedTo })}
          />
        </div>
        <p className={styles.formNote}>
          Earned between limits the Earned column only — Balance stays all-time. Gift eligibility counts redeemable points
          (cooling lots excluded).
        </p>
      </div>
    </Shell>
  );
}

/* --------------------------------------------------------------- expiring */

function ExpiringBody({ applied, companyId, choices, focusFind, isOpen, onApply, onCancel }: DialogProps<ExpiringFilters>) {
  const [d, setD] = useState<ExpiringFilters>(applied);
  const set = (patch: Partial<ExpiringFilters>) => setD((cur) => ({ ...cur, ...patch }));
  useOpenFocus(isOpen, focusFind, "ls-e-find", "ls-e-scheme");
  return (
    <Shell title="Filter expiring lots" isOpen={isOpen} onReset={() => setD(defaultExpiring())} onCancel={onCancel} onApply={() => onApply(d)}>
      <div className={styles.filterForm}>
        <label className={styles.fieldLabel} htmlFor="ls-e-scheme">
          Scheme
        </label>
        <SchemeBox id="ls-e-scheme" value={d.lscId} choices={choices} onChange={(lscId) => set({ lscId })} />
        <label className={styles.fieldLabel} htmlFor="ls-e-branch">
          Branch
        </label>
        <BranchBox id="ls-e-branch" companyId={companyId} pick={d.branch} onPick={(branch) => set({ branch })} />

        <label className={styles.fieldLabel} htmlFor="ls-e-within">
          Expiring within
        </label>
        <span className={styles.inline}>
          <input
            id="ls-e-within"
            className={`${styles.input} ${styles.inputShort}`}
            inputMode="numeric"
            autoComplete="off"
            value={d.withinDays}
            onChange={(e) => set({ withinDays: digitsOnly(e.target.value, 3) })}
          />
          <span className={styles.fieldLabel}>days</span>
        </span>
        <label className={styles.fieldLabel} htmlFor="ls-e-find">
          Find
        </label>
        <input
          id="ls-e-find"
          className={styles.input}
          placeholder="card no / mobile / customer name"
          autoComplete="off"
          value={d.find}
          onChange={(e) => set({ find: e.target.value })}
        />

        <div className={styles.formRow}>
          <Check id="ls-e-mobile" label="Has a mobile number" checked={d.hasMobile} onChange={(v) => set({ hasMobile: v })} />
          <Check id="ls-e-active" label="Active members only" checked={d.activeOnly} onChange={(v) => set({ activeOnly: v })} />
        </div>
        <p className={styles.formNote}>One row per member + expiry date — lots lapsing on the same day are summed.</p>
      </div>
    </Shell>
  );
}

/* ---------------------------------------------------------------- schemes */

function SchemesBody({ applied, companyId, choices, today, isOpen, onApply, onCancel }: DialogProps<SchemesFilters>) {
  const [d, setD] = useState<SchemesFilters>(applied);
  const set = (patch: Partial<SchemesFilters>) => setD((cur) => ({ ...cur, ...patch }));
  useOpenFocus(isOpen, false, null, "ls-s-scheme");
  return (
    <Shell title="Filter schemes" isOpen={isOpen} onReset={() => setD(defaultSchemes(today))} onCancel={onCancel} onApply={() => onApply(d)}>
      <div className={styles.filterForm}>
        <label className={styles.fieldLabel} htmlFor="ls-s-scheme">
          Scheme
        </label>
        <SchemeBox id="ls-s-scheme" value={d.lscId} choices={choices} onChange={(lscId) => set({ lscId })} />
        <label className={styles.fieldLabel} htmlFor="ls-s-branch">
          Branch
        </label>
        <BranchBox id="ls-s-branch" companyId={companyId} pick={d.branch} onPick={(branch) => set({ branch })} />

        <label className={styles.fieldLabel} htmlFor="ls-s-from">
          From
        </label>
        <DateBox id="ls-s-from" label="From" value={d.from} onCommit={(from) => set({ from })} />
        <label className={styles.fieldLabel} htmlFor="ls-s-to">
          To
        </label>
        <DateBox id="ls-s-to" label="To" value={d.to} onCommit={(to) => set({ to })} />

        <label className={styles.fieldLabel} htmlFor="ls-s-split">
          Split by
        </label>
        <select
          id="ls-s-split"
          className={styles.select}
          value={d.splitBy}
          onChange={(e) => set({ splitBy: e.target.value as SchemeSplit })}
        >
          {SPLIT_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <span />
        <span />

        <div className={styles.formRow}>
          <Check
            id="ls-s-closed"
            label="Include closed / deleted schemes holding points"
            checked={d.includeClosedHolding}
            onChange={(v) => set({ includeClosedHolding: v })}
          />
        </div>
        <p className={styles.formNote}>Outstanding is always as on today; the movement columns follow the period.</p>
      </div>
    </Shell>
  );
}

/* ----------------------------------------------------------------- facade */

export type FilterDialogState = { tab: Tab; focusFind: boolean } | null;

type Props = {
  open: FilterDialogState;
  companyId: string;
  choices: readonly SchemeChoice[];
  today: string;
  members: MembersFilters;
  expiring: ExpiringFilters;
  schemes: SchemesFilters;
  onApplyMembers: (f: MembersFilters) => void;
  onApplyExpiring: (f: ExpiringFilters) => void;
  onApplySchemes: (f: SchemesFilters) => void;
  onCancel: () => void;
};

/** The open tab's popup; mounted fresh on every open, so its draft starts from the filters in force. */
export function FilterDialogs(props: Props) {
  const { open } = props;
  if (!open) return null;
  const common = {
    isOpen: true,
    companyId: props.companyId,
    choices: props.choices,
    today: props.today,
    focusFind: open.focusFind,
    onCancel: props.onCancel,
  };
  if (open.tab === "expiring") return <ExpiringBody {...common} applied={props.expiring} onApply={props.onApplyExpiring} />;
  if (open.tab === "schemes") return <SchemesBody {...common} applied={props.schemes} onApply={props.onApplySchemes} />;
  return <MembersBody {...common} applied={props.members} onApply={props.onApplyMembers} />;
}
