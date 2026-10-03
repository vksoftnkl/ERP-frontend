"use client";

/**
 * The document's own fields, in one strip: the number, the date, who paid it,
 * the supplier's reference and its date, ours, and the narration.
 *
 * The receipt's strip without the beat — a payee has none, and
 * `SaveDraftPaymentDto` has no field for one (`forbidNonWhitelisted` would
 * refuse it). The PAYEE is in the party panel, beside the facts it decides.
 */
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { RECEIPT_FIELD_ATTR } from "@/features/accounts/receipt/focus-walk";
import styles from "@/features/accounts/receipt/page.module.scss";
import type { PaymentHeaderDraft } from "../payment.types";

export type PaymentDocStripProps = {
  header: PaymentHeaderDraft;
  editable: boolean;
  salesmanMandatory: boolean;
  /** The employee dropdown binds a branch token; it is always sent. */
  branchId: string;
  invalidField: keyof PaymentHeaderDraft | null;
  onChange: (patch: Partial<PaymentHeaderDraft>) => void;
};

export function PaymentDocStrip(props: PaymentDocStripProps) {
  const { header, editable, salesmanMandatory, branchId, invalidField, onChange } = props;
  const employeeDropdownId = useDropdownId("employee");

  const invalid = (field: keyof PaymentHeaderDraft) =>
    invalidField === field ? styles.inputInvalid : "";

  return (
    <section className={styles.docStrip} aria-label="Payment header">
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Payment no</span>
        <input
          className={`${styles.input} ${styles.inputReadOnly}`}
          {...{ [RECEIPT_FIELD_ATTR]: "paymentNo" }}
          value={header.voucherRefno ?? ""}
          placeholder="assigned at Post"
          readOnly
          title="A payment takes its number when it is posted, never before."
        />
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Date</span>
        <input
          className={`${styles.input} ${invalid("voucherDate")}`}
          {...{ [RECEIPT_FIELD_ATTR]: "date" }}
          type="date"
          value={header.voucherDate}
          disabled={!editable}
          // It decides the year, the tenders on offer, the cash discount still
          // open, and the TDS rate in force.
          onChange={(event) => onChange({ voucherDate: event.target.value })}
        />
      </label>

      <div className={styles.field} {...{ [RECEIPT_FIELD_ATTR]: "paidBy" }}>
        <span className={styles.fieldLabel}>Paid by{salesmanMandatory ? " *" : ""}</span>
        <NexDropdownSingle
          dropdownId={employeeDropdownId}
          value={header.employeeId ? { id: header.employeeId, text: "" } : null}
          onChange={(selection) => onChange({ employeeId: selection?.id ?? "" })}
          // Dropdown 38 binds a bare `iemp_branch_id`: always sent.
          params={{ iemp_branch_id: branchId }}
          clearOnParamsChange={false}
          disabled={!editable}
          invalid={invalidField === "employeeId"}
          placeholder={salesmanMandatory ? "required" : ""}
          aria-label="Paid by"
          className={styles.dropdownField}
          advanceFocusOnSelect={false}
        />
      </div>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Their ref</span>
        <input
          className={styles.input}
          {...{ [RECEIPT_FIELD_ATTR]: "theirRef" }}
          value={header.docRefno}
          maxLength={100}
          disabled={!editable}
          onChange={(event) => onChange({ docRefno: event.target.value })}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Ref date</span>
        <input
          className={styles.input}
          {...{ [RECEIPT_FIELD_ATTR]: "refDate" }}
          type="date"
          value={header.docDate}
          disabled={!editable}
          onChange={(event) => onChange({ docDate: event.target.value })}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Our ref</span>
        <input
          className={styles.input}
          {...{ [RECEIPT_FIELD_ATTR]: "ourRef" }}
          value={header.usrRefno}
          maxLength={100}
          disabled={!editable}
          onChange={(event) => onChange({ usrRefno: event.target.value })}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Narration</span>
        <input
          className={styles.input}
          {...{ [RECEIPT_FIELD_ATTR]: "narration" }}
          value={header.remarks}
          maxLength={2000}
          disabled={!editable}
          onChange={(event) => onChange({ remarks: event.target.value })}
        />
      </label>
    </section>
  );
}
