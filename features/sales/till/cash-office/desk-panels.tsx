"use client";

/**
 * The Cash Office's right-hand tabs (Qt `tabsRight`): Count safe, Remit to
 * bank, On the way. Drawn only — the screen (`page.tsx`) owns their state and
 * posts them; what they decide is `cash-office.ts`.
 *
 * Enter walks each tab's fields (Qt `EnterNavigation`): the count's Qty
 * boxes, then the witness, their PIN and the note, then the button.
 */
import { useMemo, type KeyboardEvent } from "react";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { cx } from "@/components/design-system/cx";
import { useDropdownId } from "@/lib/configured-dropdowns";
import type { DenomCountValue, Denomination } from "../shared/denom";
import { formatMoney, isAmountDraft } from "../shared/money";
import { selectOnFocus } from "../shared/select-on-focus";
import styles from "../shared/till.module.scss";
import { DenomCount } from "../session/denom-count";
import { pickedIndexAfter } from "../sessions/cockpit";
import {
  COUNT_HINT,
  REMIT_MODES,
  TRANSIT_HINT,
  remitHint,
  type ButtonState,
  type CountForm,
  type RemitForm,
  type TransitRow,
} from "./cash-office";
import { walkOnEnter } from "./enter-walk";
import local from "./cash-office.module.scss";
import { DateInput } from "@/components/design-system/ui/date-input";

// ─── Count safe ──────────────────────────────────────────────────────────────

const COUNT_PREFIX = "till-safe-count";
const WITNESS_ID = "till-safe-count-witness";

export type CountPanelProps = {
  companyId: string;
  denominations: readonly Denomination[];
  denomsLoading: boolean;
  count: DenomCountValue;
  onCount: (next: DenomCountValue) => void;
  countedPaise: number;
  form: CountForm;
  onForm: (patch: Partial<CountForm>) => void;
  /** The last count's answer (Qt `lblCountResult`). */
  result: { text: string; tone: "green" | "amber" } | null;
  button: ButtonState;
  busy: boolean;
  onSave: () => void;
};

export function CountPanel({
  companyId,
  denominations,
  denomsLoading,
  count,
  onCount,
  countedPaise,
  form,
  onForm,
  result,
  button,
  busy,
  onSave,
}: CountPanelProps) {
  const userDropdownId = useDropdownId("tillApproverUser");
  const userParams = useMemo(() => ({ icompany_id: companyId }), [companyId]);

  return (
    <div className={local.deskBody} onKeyDown={walkOnEnter}>
      <p className={styles.code}>{COUNT_HINT}</p>
      {/* The count is the screen's first job: the cursor starts on the first Qty once the list is in. */}
      <DenomCount
        idPrefix={COUNT_PREFIX}
        denominations={denominations}
        loading={denomsLoading}
        value={count}
        onChange={onCount}
        disabled={busy}
        autoFocusFirst
        onDone={() => document.getElementById(WITNESS_ID)?.focus()}
      />
      <div className={local.countedRow}>
        <span className={styles.cap}>Counted</span>
        <span className={styles.figure}>{formatMoney(countedPaise)}</span>
      </div>

      <div className={styles.formGrid}>
        <label className={styles.formLabel} htmlFor={WITNESS_ID}>
          Witness
        </label>
        <NexDropdownSingle
          id={WITNESS_ID}
          dropdownId={userDropdownId}
          params={userParams}
          clearOnParamsChange={false}
          value={form.witness}
          onChange={(witness) =>
            onForm({ witness, witnessPin: witness?.id === form.witness?.id ? form.witnessPin : "" })
          }
          placeholder="optional: who counts with you"
          aria-label="Witness"
          className={styles.dropdown}
        />

        <label className={styles.formLabel} htmlFor="till-safe-count-witness-pin">
          Witness till PIN
        </label>
        <input
          id="till-safe-count-witness-pin"
          type="password"
          className={styles.input}
          maxLength={12}
          autoComplete="off"
          data-uppercase="off"
          disabled={!form.witness?.id}
          value={form.witnessPin}
          onChange={(event) => onForm({ witnessPin: event.target.value })}
        />

        <label className={styles.formLabel} htmlFor="till-safe-count-note">
          Note
        </label>
        <input
          id="till-safe-count-note"
          className={styles.input}
          maxLength={500}
          autoComplete="off"
          placeholder="optional"
          value={form.note}
          onChange={(event) => onForm({ note: event.target.value })}
        />
      </div>

      {result ? (
        <p className={cx(styles.strong, local.result, result.tone === "amber" ? styles.toneAmber : styles.toneGreen)}>
          {result.text}
        </p>
      ) : null}

      <div className={local.deskButtons}>
        <button type="button" className={styles.primaryButton} disabled={!button.enabled} title={button.title} onClick={onSave}>
          {busy ? "Saving…" : "Save count - F10"}
        </button>
      </div>
    </div>
  );
}

// ─── Remit to bank ───────────────────────────────────────────────────────────

export type RemitPanelProps = {
  form: RemitForm;
  onForm: (patch: Partial<RemitForm>) => void;
  button: ButtonState;
  busy: boolean;
  onPost: () => void;
};

export function RemitPanel({ form, onForm, button, busy, onPost }: RemitPanelProps) {
  const bankDropdownId = useDropdownId("bankLedger");
  const cit = form.mode === "CIT";

  return (
    <div className={local.deskBody} onKeyDown={walkOnEnter}>
      <div className={styles.formGrid}>
        <label className={styles.formLabel} htmlFor="till-safe-remit-bank">
          Bank
        </label>
        {/* Opened on this tab (`?tab=remit`, or the tab picked): the bank takes the cursor. */}
        <NexDropdownSingle
          id="till-safe-remit-bank"
          dropdownId={bankDropdownId}
          value={form.bank}
          onChange={(bank) => onForm({ bank })}
          placeholder="Pick the bank"
          aria-label="Bank"
          autoFocus
          className={styles.dropdown}
        />

        <label className={styles.formLabel} htmlFor="till-safe-remit-mode">
          Sent by
        </label>
        <select
          id="till-safe-remit-mode"
          className={styles.select}
          value={form.mode}
          onChange={(event) => onForm({ mode: event.target.value === "CIT" ? "CIT" : "BANK_DEPOSIT" })}
        >
          {REMIT_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>

        {cit ? (
          <>
            <label className={styles.formLabel} htmlFor="till-safe-remit-agency">
              Agency
            </label>
            <input
              id="till-safe-remit-agency"
              className={styles.input}
              maxLength={100}
              autoComplete="off"
              value={form.agency}
              onChange={(event) => onForm({ agency: event.target.value })}
            />
          </>
        ) : null}

        <label className={styles.formLabel} htmlFor="till-safe-remit-bag">
          Bag no
        </label>
        <input
          id="till-safe-remit-bag"
          className={styles.input}
          maxLength={30}
          autoComplete="off"
          placeholder="optional"
          value={form.bag}
          onChange={(event) => onForm({ bag: event.target.value })}
        />

        <label className={styles.formLabel} htmlFor="till-safe-remit-seal">
          Seal no
        </label>
        <input
          id="till-safe-remit-seal"
          className={styles.input}
          maxLength={30}
          autoComplete="off"
          placeholder="optional"
          value={form.seal}
          onChange={(event) => onForm({ seal: event.target.value })}
        />

        <label className={styles.formLabel} htmlFor="till-safe-remit-slip">
          Deposit slip no
        </label>
        <input
          id="till-safe-remit-slip"
          className={styles.input}
          maxLength={50}
          autoComplete="off"
          placeholder="optional"
          value={form.slipNo}
          onChange={(event) => onForm({ slipNo: event.target.value })}
        />

        <label className={styles.formLabel} htmlFor="till-safe-remit-slip-date">
          Slip date
        </label>
        <DateInput
          block
          id="till-safe-remit-slip-date"
          className={cx(styles.input, local.dateInput)}
          title="Sent with a slip no only"
          value={form.slipDate}
          onChange={(value) => onForm({ slipDate: value })}
        />

        <label className={styles.formLabel} htmlFor="till-safe-remit-amount">
          Amount
        </label>
        <input
          id="till-safe-remit-amount"
          className={cx(styles.input, styles.number, local.amountInput)}
          inputMode="decimal"
          autoComplete="off"
          value={form.amountText}
          onFocus={selectOnFocus}
          onChange={(event) => {
            const text = event.target.value.trim();
            if (isAmountDraft(text)) onForm({ amountText: text });
          }}
        />

        <label className={styles.formLabel} htmlFor="till-safe-remit-note">
          Note
        </label>
        <input
          id="till-safe-remit-note"
          className={styles.input}
          maxLength={500}
          autoComplete="off"
          placeholder="optional"
          value={form.note}
          onChange={(event) => onForm({ note: event.target.value })}
        />

        <label className={styles.formLabel} htmlFor="till-safe-remit-pin">
          Your till PIN
        </label>
        <input
          id="till-safe-remit-pin"
          type="password"
          className={styles.input}
          maxLength={12}
          autoComplete="off"
          data-uppercase="off"
          placeholder="only if asked"
          value={form.pin}
          onChange={(event) => onForm({ pin: event.target.value })}
        />
      </div>

      <p className={cx(styles.muted, local.twoLines)}>{remitHint(form.mode)}</p>

      <div className={local.deskButtons}>
        <button type="button" className={styles.primaryButton} disabled={!button.enabled} title={button.title} onClick={onPost}>
          {busy ? "Posting…" : "Post remittance"}
        </button>
      </div>
    </div>
  );
}

// ─── On the way ──────────────────────────────────────────────────────────────

export type TransitPanelProps = {
  rows: readonly TransitRow[];
  pickedId: string;
  onPick: (tcmId: string) => void;
  /** Confirm with bank… on the picked row (also Enter, or a double-click on it). */
  onConfirm: () => void;
  button: ButtonState;
};

export function TransitPanel({ rows, pickedId, onPick, onConfirm, button }: TransitPanelProps) {
  const pickedIndex = rows.findIndex((row) => row.tcmId === pickedId);

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (button.enabled) onConfirm();
      return;
    }
    const next = pickedIndexAfter(event.key, pickedIndex, rows.length);
    if (next < 0) return;
    event.preventDefault();
    onPick(rows[next].tcmId);
    event.currentTarget.querySelectorAll("tbody tr")[next]?.scrollIntoView({ block: "nearest" });
  };

  return (
    <div className={local.deskBody}>
      <p className={styles.code}>{TRANSIT_HINT}</p>
      <div className={local.tableScroll}>
        <table className={cx(styles.table, local.pickTable)} tabIndex={0} aria-label="On the way" onKeyDown={onKeyDown}>
          <thead>
            <tr>
              <th scope="col">Doc</th>
              <th scope="col">Date</th>
              <th scope="col">Safe</th>
              <th scope="col">Agency · bag</th>
              <th scope="col" className={styles.right}>
                Amount
              </th>
              <th scope="col" className={styles.right}>
                Days
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.tcmId}
                aria-selected={row.tcmId === pickedId}
                onClick={() => onPick(row.tcmId)}
                onDoubleClick={() => {
                  onPick(row.tcmId);
                  if (button.enabled) onConfirm();
                }}
              >
                <td>{row.doc}</td>
                <td>{row.date}</td>
                <td>{row.safe}</td>
                <td className={local.wrapCell}>{row.agency}</td>
                <td className={styles.right}>{row.amount}</td>
                <td className={styles.right}>{row.days}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className={styles.emptyCell}>
                  Nothing on the way to the bank.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className={local.deskButtons}>
        <button type="button" className={styles.primaryButton} disabled={!button.enabled} title={button.title} onClick={onConfirm}>
          Confirm with bank…
        </button>
      </div>
    </div>
  );
}
