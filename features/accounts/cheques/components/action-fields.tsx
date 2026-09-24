"use client";

/**
 * The fields each verb is edited through. The spec (`actions/*.ts`) owns the
 * form's shape, its defaults, its checks and its body; these only draw it.
 *
 * Each returns ROWS, not a panel: the dialog lays them into its own
 * label | field grid, with the summary and the live reason beneath.
 */
import type { ReactNode } from "react";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { useDropdownId } from "@/lib/configured-dropdowns";
import type { BounceForm } from "../actions/bounce";
import type { ClearForm } from "../actions/clear";
import type { SlipForm } from "../actions/deposit";
import { replaceOffersReason, type ReplaceForm } from "../actions/replace";
import type { ReturnForm } from "../actions/returnCancel";
import type { WritingVerb } from "../actions/types";
import { formatAmount } from "../domain/chequeRow";
import type { ChequeDetail, ChequeRow } from "../domain/types";
import styles from "../cheques.module.scss";

export type FieldsProps<F> = {
  form: F;
  set: (patch: Partial<F>) => void;
  rows: readonly ChequeRow[];
  /** The target's `/cheques/get`, only when it IS the target's. */
  detail: ChequeDetail | null;
  bounceReasons: readonly string[];
  today: string;
};

/** One grid row: the words on the left, the box on the right. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className={styles.formRow}>
      <span className={styles.formLabel}>{label}</span>
      {children}
    </label>
  );
}

function DateInput({
  value,
  onChange,
  max,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  max?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="date"
      className={styles.input}
      value={value}
      max={max}
      autoFocus={autoFocus}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function TextInput({
  value,
  onChange,
  maxLength,
  placeholder,
  title,
  autoFocus,
  inputMode,
}: {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  title?: string;
  autoFocus?: boolean;
  inputMode?: "decimal" | "numeric";
}) {
  return (
    <input
      className={styles.input}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      title={title}
      autoFocus={autoFocus}
      inputMode={inputMode}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function Remarks({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Field label="Remarks">
      <TextInput value={value} maxLength={500} onChange={onChange} />
    </Field>
  );
}

/** Deposit and Re-present: bank, date, slip. */
export function SlipFields({ form, set, today }: FieldsProps<SlipForm>) {
  const bankDropdownId = useDropdownId("bankLedger");
  return (
    <>
      <Field label="Into bank">
        <NexDropdownSingle
          dropdownId={bankDropdownId}
          aria-label="Into bank"
          placeholder="Choose the bank"
          autoFocus
          value={form.bankLedgerId ? { id: form.bankLedgerId, text: form.bankLedgerName } : null}
          onChange={(selection) =>
            set({ bankLedgerId: selection?.id ?? "", bankLedgerName: selection?.text ?? "" })
          }
        />
      </Field>
      <Field label="Deposit date">
        <DateInput value={form.depositDate} max={today} onChange={(depositDate) => set({ depositDate })} />
      </Field>
      <Field label="Slip no">
        <TextInput
          value={form.slipNo}
          maxLength={50}
          title="The bank's slip number — the printed slip is keyed on it"
          onChange={(slipNo) => set({ slipNo })}
        />
      </Field>
      <Remarks value={form.remarks} onChange={(remarks) => set({ remarks })} />
    </>
  );
}

export function ClearFields({ form, set, today }: FieldsProps<ClearForm>) {
  return (
    <>
      <Field label="Cleared on">
        <DateInput autoFocus value={form.clearDate} max={today} onChange={(clearDate) => set({ clearDate })} />
      </Field>
      <Field label="Bank's date">
        <DateInput value={form.bankDate} max={today} onChange={(bankDate) => set({ bankDate })} />
      </Field>
      <Remarks value={form.remarks} onChange={(remarks) => set({ remarks })} />
    </>
  );
}

export function BounceFields({ form, set, today, detail, bounceReasons }: FieldsProps<BounceForm>) {
  const reopening = (detail?.bills ?? []).filter((bill) => bill.settledByThisCheque > 0);
  return (
    <>
      <Field label="Bounced on">
        <DateInput autoFocus value={form.bounceDate} max={today} onChange={(bounceDate) => set({ bounceDate })} />
      </Field>
      <Field label="Reason">
        {/* A pre-fill, not a whitelist: type any reason the bank gave. */}
        <input
          className={styles.input}
          list="cheque-bounce-reasons"
          value={form.reason}
          maxLength={150}
          placeholder="Pick or type the reason"
          onChange={(event) => set({ reason: event.target.value })}
        />
      </Field>
      <datalist id="cheque-bounce-reasons">
        {bounceReasons.map((reason) => (
          <option key={reason} value={reason} />
        ))}
      </datalist>
      <Field label="Bank wrote">
        <TextInput value={form.reasonText} maxLength={500} onChange={(reasonText) => set({ reasonText })} />
      </Field>
      <Field label="Bank charged us">
        <TextInput
          value={form.bankCharge}
          inputMode="decimal"
          placeholder="0.00"
          title="What the bank took off us for returning it — our expense (bank charges)"
          onChange={(bankCharge) => set({ bankCharge })}
        />
      </Field>
      <Field label="We charge the party">
        <TextInput
          value={form.partyCharge}
          inputMode="decimal"
          placeholder="0.00"
          title="What we charge the party for the bounce — income, and a bill they now owe"
          onChange={(partyCharge) => set({ partyCharge })}
        />
      </Field>
      <p className={styles.mutedLine}>
        {detail === null
          ? "What reopens is worked out by the server when it bounces."
          : reopening.length === 0
            ? "No bill was settled by this cheque — nothing reopens."
            : `These reopen: ${reopening
                .map(
                  (bill) =>
                    `${bill.docRefno} — ${formatAmount(bill.settledByThisCheque)} (${formatAmount(
                      bill.pendingAmount,
                    )} of ${formatAmount(bill.billAmount)} open now)`,
                )
                .join("; ")}.`}
      </p>
    </>
  );
}

export function ReplaceFields({ form, set, rows }: FieldsProps<ReplaceForm>) {
  return (
    <>
      <Field label="New cheque no">
        <TextInput autoFocus value={form.instrumentNo} maxLength={30} onChange={(instrumentNo) => set({ instrumentNo })} />
      </Field>
      <Field label="Cheque date">
        <DateInput value={form.instrumentDate} onChange={(instrumentDate) => set({ instrumentDate })} />
      </Field>
      <Field label="Amount">
        <TextInput
          value={form.amount}
          inputMode="decimal"
          title="Need not match the old cheque — the rest can be paid another way"
          onChange={(amount) => set({ amount })}
        />
      </Field>
      <Field label="Drawn on">
        <TextInput value={form.bankName} maxLength={100} onChange={(bankName) => set({ bankName })} />
      </Field>
      <Field label="Bank branch">
        <TextInput value={form.bankBranch} maxLength={100} onChange={(bankBranch) => set({ bankBranch })} />
      </Field>
      <Field label="IFSC">
        <TextInput value={form.ifsc} maxLength={11} onChange={(ifsc) => set({ ifsc })} />
      </Field>
      <Field label="MICR">
        <TextInput value={form.micr} maxLength={9} inputMode="numeric" onChange={(micr) => set({ micr })} />
      </Field>
      <Field label="Drawer">
        <TextInput value={form.drawerName} maxLength={150} onChange={(drawerName) => set({ drawerName })} />
      </Field>
      {replaceOffersReason(rows) ? (
        <Field label="Reason">
          <TextInput
            value={form.reason}
            maxLength={250}
            placeholder="Optional — left blank, it is recorded as replaced by the new number"
            onChange={(reason) => set({ reason })}
          />
        </Field>
      ) : null}
    </>
  );
}

export function ReturnFields({ form, set }: FieldsProps<ReturnForm>) {
  return (
    <>
      <span className={styles.formLabel}>What happened</span>
      <div className={styles.radioRow} role="radiogroup" aria-label="What happened">
        <label className={styles.radio}>
          <input
            type="radio"
            name="cheque-return-action"
            checked={form.action === "RETURNED"}
            onChange={() => set({ action: "RETURNED" })}
          />
          <span>
            Returned
            <small>the party has the paper back</small>
          </span>
        </label>
        <label className={styles.radio}>
          <input
            type="radio"
            name="cheque-return-action"
            checked={form.action === "CANCELLED"}
            onChange={() => set({ action: "CANCELLED" })}
          />
          <span>
            Cancelled
            <small>it is void and nobody has it</small>
          </span>
        </label>
      </div>
      <Field label="Reason">
        <TextInput autoFocus value={form.reason} maxLength={250} onChange={(reason) => set({ reason })} />
      </Field>
      <Remarks value={form.remarks} onChange={(remarks) => set({ remarks })} />
    </>
  );
}

// Each component is typed over its own form; the dialog passes the form it
// got from the matching spec, so the pairing is guaranteed by the verb.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ACTION_FIELDS: Record<WritingVerb, (props: FieldsProps<any>) => ReactNode> = {
  deposit: SlipFields,
  represent: SlipFields,
  clear: ClearFields,
  bounce: BounceFields,
  replace: ReplaceFields,
  return: ReturnFields,
};
