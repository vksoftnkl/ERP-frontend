"use client";

/**
 * Till Reason popup (menu 281) — Qt `TillReasonEntry`: Reason, Rules. A copy
 * of a shipped reason keeps its category and code (the key it replaces the
 * shipped row by); the default ledger only opens for EXPENSE and PAID_IN.
 */
import { useMemo } from "react";

import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { REASON_CATEGORIES, ledgerMeans } from "../domain/till-masters";
import type { EntryFieldsProps } from "./fields-props";
import { Check, Field, NumberBox, SectionHeading, fieldId } from "./form-bits";
import styles from "../page.module.scss";

export function ReasonFields({ form, update, editable, locked, focus, companyId }: EntryFieldsProps<"reasons">) {
  const ledgerDropdownId = useDropdownId("tillReasonLedger");
  const ledgerParams = useMemo(() => ({ icompany_id: companyId }), [companyId]);
  const off = (field: string) => !editable || locked.includes(field);
  const id = (field: string) => fieldId("reasons", field);

  return (
    <>
      <SectionHeading>Reason</SectionHeading>
      <div className={styles.fieldGrid}>
        <Field id={id("category")} label="Category">
          <select
            id={id("category")}
            className={styles.selectInput}
            value={form.category}
            disabled={off("category")}
            autoFocus={focus === "category"}
            onChange={(event) => update({ category: event.target.value })}
          >
            {REASON_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </Field>
        <Field id={id("code")} label="Code" required>
          <input
            id={id("code")}
            className={styles.textInput}
            maxLength={30}
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
        <Field id={id("sortOrder")} label="Sort Order">
          <NumberBox
            id={id("sortOrder")}
            value={form.sortOrder}
            decimals={0}
            max={9999}
            disabled={off("sortOrder")}
            onChange={(sortOrder) => update({ sortOrder })}
          />
        </Field>
      </div>

      <SectionHeading>Rules</SectionHeading>
      <div className={styles.fieldGrid}>
        <Field id={id("ledgerId")} label="Default Ledger">
          <NexDropdownSingle
            id={id("ledgerId")}
            dropdownId={ledgerDropdownId}
            params={ledgerParams}
            clearOnParamsChange={false}
            value={form.ledgerId ? { id: form.ledgerId, text: form.ledgerName } : null}
            onChange={(picked) => update({ ledgerId: picked?.id ?? "", ledgerName: picked?.text ?? "" })}
            // A default ledger only means something on the expense / paid-in line.
            disabled={off("ledgerId") || !ledgerMeans(form.category)}
            placeholder="None — picked on the voucher"
            aria-label="Default Ledger"
            className={styles.dropdown}
          />
        </Field>
        <Field id={id("maxAmount")} label="Cap Amount">
          <NumberBox
            id={id("maxAmount")}
            value={form.maxAmount}
            placeholder="0 = no cap"
            disabled={off("maxAmount")}
            onChange={(maxAmount) => update({ maxAmount })}
          />
        </Field>
        <Check
          id={id("needsNote")}
          label="A note is required"
          checked={form.needsNote}
          disabled={off("needsNote")}
          onChange={(needsNote) => update({ needsNote })}
        />
        <Check
          id={id("needsRef")}
          label="A reference no is required"
          checked={form.needsRef}
          disabled={off("needsRef")}
          onChange={(needsRef) => update({ needsRef })}
        />
        <Check
          id={id("active")}
          label="Active"
          checked={form.active}
          disabled={off("active")}
          onChange={(active) => update({ active })}
        />
      </div>
    </>
  );
}
