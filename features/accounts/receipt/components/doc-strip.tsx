"use client";

/**
 * The document's own fields, in one strip: the number, the date, the beat, who
 * collected it, the customer's reference and its date, ours, and the narration.
 *
 * The CUSTOMER is not here — it belongs to the party panel below, beside the
 * facts it decides. The beat is here because it decides which customers that
 * picker offers.
 *
 * ── The beat filters the customer dropdown and NOTHING else ──────────────
 * It is not sent with the receipt (`SaveDraftReceiptDto` has no `areaId`, and
 * `forbidNonWhitelisted` means one extra key fails the whole request), and it
 * filters no bill on the screen.
 */
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { RECEIPT_FIELD_ATTR } from "../focus-walk";
import { useDropdownId } from "@/lib/configured-dropdowns";
import type { ReceiptHeaderDraft } from "../receipt.types";
import styles from "../page.module.scss";

export type DocStripProps = {
  header: ReceiptHeaderDraft;
  editable: boolean;
  salesmanMandatory: boolean;
  /** The employee dropdown binds a branch token; it is always sent. */
  branchId: string;
  invalidField: keyof ReceiptHeaderDraft | null;
  onChange: (patch: Partial<ReceiptHeaderDraft>) => void;
};

export function DocStrip(props: DocStripProps) {
  const { header, editable, salesmanMandatory, branchId, invalidField, onChange } = props;
  const areaDropdownId = useDropdownId("area");
  const employeeDropdownId = useDropdownId("employee");

  const invalid = (field: keyof ReceiptHeaderDraft) =>
    invalidField === field ? styles.inputInvalid : "";

  return (
    <section className={styles.docStrip} aria-label="Receipt header">
      <label className={styles.field}>
        <span className={styles.fieldLabel}>Receipt no</span>
        <input
          className={`${styles.input} ${styles.inputReadOnly}`}
          {...{ [RECEIPT_FIELD_ATTR]: "receiptNo" }}
          value={header.voucherRefno ?? ""}
          placeholder="assigned at Post"
          readOnly
          // The number is the server's: `avh_voucher_no` is allotted at post,
          // and an abandoned draft must leave no gap in the series (R10).
          title="A receipt takes its number when it is posted, never before."
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
          // It decides the year the receipt lands in, which tenders are
          // offered, and what discount the bills still qualify for.
          onChange={(event) => onChange({ voucherDate: event.target.value })}
        />
      </label>

      <div className={styles.field} {...{ [RECEIPT_FIELD_ATTR]: "beat" }}>
        <span className={styles.fieldLabel}>Beat</span>
        <NexDropdownSingle
          dropdownId={areaDropdownId}
          value={header.areaId ? { id: header.areaId, text: "" } : null}
          onChange={(selection) => onChange({ areaId: selection?.id ?? "" })}
          disabled={!editable}
          placeholder="All beats"
          aria-label="Beat"
          // Matches the inputs beside it — see `--erp-rcpt-control`.
          className={styles.dropdownField}
          // The screen's own Enter walk moves on — a DOM-order jump would
          // land past the party panel, on a button.
          advanceFocusOnSelect={false}
        />
      </div>

      <div className={styles.field} {...{ [RECEIPT_FIELD_ATTR]: "collectedBy" }}>
        <span className={styles.fieldLabel}>
          Collected by{salesmanMandatory ? " *" : ""}
        </span>
        <NexDropdownSingle
          dropdownId={employeeDropdownId}
          value={header.employeeId ? { id: header.employeeId, text: "" } : null}
          onChange={(selection) => onChange({ employeeId: selection?.id ?? "" })}
          // Dropdown 38 binds a bare `iemp_branch_id` token, so it is always
          // sent — empty included, or the literal word reaches Postgres.
          params={{ iemp_branch_id: branchId }}
          clearOnParamsChange={false}
          disabled={!editable}
          invalid={invalidField === "employeeId"}
          placeholder={salesmanMandatory ? "required" : ""}
          aria-label="Collected by"
          className={styles.dropdownField}
          // The screen's own Enter walk moves on — a DOM-order jump would
          // land past the party panel, on a button.
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
          disabled={!editable}
          onChange={(event) => onChange({ remarks: event.target.value })}
        />
      </label>
    </section>
  );
}
