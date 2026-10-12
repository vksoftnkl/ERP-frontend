"use client";

/**
 * Safe popup (menu 280) — Qt `TillSafeEntry`: Safe, Status. Balance, the
 * counters dropping into it and the last count / remit are facts from the grid
 * row, never typed.
 */
import { useMemo } from "react";

import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { useDropdownId } from "@/lib/configured-dropdowns";
import type { EntryFieldsProps } from "./fields-props";
import { Check, Field, NumberBox, SectionHeading, fieldId } from "./form-bits";
import styles from "../page.module.scss";

export function SafeFields({ form, update, editable, locked, focus, companyId }: EntryFieldsProps<"safes">) {
  const ledgerDropdownId = useDropdownId("cashLedger");
  const ledgerParams = useMemo(() => ({ icompany_id: companyId }), [companyId]);
  const off = (field: string) => !editable || locked.includes(field);
  const id = (field: string) => fieldId("safes", field);

  return (
    <>
      <SectionHeading>Safe</SectionHeading>
      <div className={styles.fieldGrid}>
        <Field id={id("code")} label="Code" required>
          <input
            id={id("code")}
            className={styles.textInput}
            maxLength={20}
            placeholder="S1"
            data-uppercase="off"
            data-required="true"
            value={form.code}
            disabled={off("code")}
            autoFocus={focus === "code"}
            onChange={(event) => update({ code: event.target.value })}
          />
        </Field>
        <Field id={id("name")} label="Name" required>
          <input
            id={id("name")}
            className={styles.textInput}
            maxLength={100}
            data-required="true"
            value={form.name}
            disabled={off("name")}
            autoFocus={focus === "name"}
            onChange={(event) => update({ name: event.target.value })}
          />
        </Field>
        <Field id={id("ledgerId")} label="Cash Ledger" required>
          <NexDropdownSingle
            id={id("ledgerId")}
            dropdownId={ledgerDropdownId}
            params={ledgerParams}
            clearOnParamsChange={false}
            value={form.ledgerId ? { id: form.ledgerId, text: form.ledgerName } : null}
            onChange={(picked) => update({ ledgerId: picked?.id ?? "", ledgerName: picked?.text ?? "" })}
            disabled={off("ledgerId")}
            placeholder="A cash ledger of this company"
            aria-label="Cash Ledger"
            className={styles.dropdown}
          />
        </Field>
        <Field id={id("insuredLimit")} label="Insured Limit">
          <NumberBox
            id={id("insuredLimit")}
            value={form.insuredLimit}
            placeholder="0 = no limit"
            disabled={off("insuredLimit")}
            onChange={(insuredLimit) => update({ insuredLimit })}
          />
        </Field>
      </div>

      <SectionHeading>Status</SectionHeading>
      <div className={styles.fieldGrid}>
        <Check
          id={id("isDefault")}
          label="The branch's default safe"
          checked={form.isDefault}
          disabled={off("isDefault")}
          onChange={(isDefault) => update({ isDefault })}
        />
        <Check
          id={id("active")}
          label="Active"
          checked={form.active}
          disabled={off("active")}
          onChange={(active) => update({ active })}
        />
        <Field id={id("remarks")} label="Remarks" wide>
          <textarea
            id={id("remarks")}
            className={styles.textArea}
            rows={2}
            maxLength={250}
            value={form.remarks}
            disabled={off("remarks")}
            onChange={(event) => update({ remarks: event.target.value })}
          />
        </Field>
      </div>
    </>
  );
}
