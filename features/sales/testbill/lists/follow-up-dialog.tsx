"use client";

/**
 * Follow-up (F6) on a temp credit (§24): "Promised for" date + "Remark *" →
 * `PUT /temp-credits/follow-up`. The promise date is THREE-WAY: omitted =
 * keep, null = clear, date = set — so the dialog asks which of the three the
 * operator means rather than reading a blank box as "clear".
 */
import { useEffect, useState } from "react";
import { toast } from "@/lib/notify";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { DateField, SelectField, TextField } from "@/features/sales/quotation/components/fields";
import { toDateInput } from "@/features/sales/quotation/quotation.utils";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import type { TempCreditRow } from "@/features/sales/testbill/api/bills";

export type FollowUpResult = {
  /** `undefined` keeps the stored date, `null` clears it, a date sets it. */
  promiseDate: string | null | undefined;
  remarks: string;
};

export type FollowUpDialogProps = {
  isOpen: boolean;
  row: TempCreditRow | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (result: FollowUpResult) => void | Promise<void>;
};

const PROMISE_MODES = [
  { value: "keep", label: "Keep as it is" },
  { value: "set", label: "Set a date" },
  { value: "clear", label: "Clear the date" },
] as const;

export function FollowUpDialog({ isOpen, row, busy, onClose, onSubmit }: FollowUpDialogProps) {
  const [mode, setMode] = useState<"keep" | "set" | "clear">("set");
  const [date, setDate] = useState("");
  const [remarks, setRemarks] = useState("");
  useEffect(() => {
    if (isOpen) {
      setMode(row?.atc_promise_date ? "keep" : "set");
      setDate(toDateInput(row?.atc_promise_date ?? null));
      setRemarks("");
    }
  }, [isOpen, row]);
  const submit = () => {
    if (!remarks.trim()) {
      toast.error("The remark is required — say what was agreed.");
      return;
    }
    if (mode === "set" && !date) {
      toast.error("Pick the promised date, or choose to keep or clear it.");
      return;
    }
    void onSubmit({
      promiseDate: mode === "keep" ? undefined : mode === "clear" ? null : date,
      remarks: remarks.trim(),
    });
  };
  return (
    <ModalShell
      title={`Follow-up${row?.atc_bill_refno ? ` — ${row.atc_bill_refno}` : ""}`}
      isOpen={isOpen}
      narrow
      onClose={onClose}
      footer={
        <>
          <button type="button" className={quotationStyles.button} disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={cx(quotationStyles.button, quotationStyles.buttonPrimary)} disabled={busy} onClick={submit}>
            {busy ? "Saving…" : "Record follow-up"}
          </button>
        </>
      }
    >
      {row ? (
        <p className={quotationStyles.modalNote}>
          {row.atc_name ?? "—"} · {row.atc_mobile ?? "—"} · balance {Number(row.atc_balance_amount ?? 0).toFixed(2)}
          {row.atc_promise_date ? ` · promised ${toDateInput(row.atc_promise_date)}` : ""}
        </p>
      ) : null}
      <div className={quotationStyles.fieldGrid}>
        <SelectField id="fu-mode" label="Promised for" value={mode} disabled={busy} options={PROMISE_MODES.map((option) => ({ ...option }))} onChange={(value) => setMode(value as typeof mode)} />
        {mode === "set" ? <DateField id="fu-date" label="Date" value={date} disabled={busy} onChange={setDate} /> : null}
        <TextField id="fu-remarks" label="Remark" value={remarks} required maxLength={250} disabled={busy} onChange={setRemarks} />
      </div>
    </ModalShell>
  );
}
