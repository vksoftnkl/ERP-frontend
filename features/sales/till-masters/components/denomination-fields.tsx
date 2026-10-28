"use client";

/**
 * Denomination popup (menu 282) — Qt `TillDenominationEntry`. A new coin starts
 * loose (bundle 0), a new note in a bundle of 100. Currency, kind and value
 * lock on a copy of a shipped row and once a count has used the row.
 */
import { bundleAfterKindChange } from "../domain/till-masters";
import type { EntryFieldsProps } from "./fields-props";
import { Check, Field, NumberBox, SectionHeading, fieldId } from "./form-bits";
import styles from "../page.module.scss";
import { DateInput } from "@/components/design-system/ui/date-input";

export function DenominationFields({ form, update, mode, editable, locked, focus }: EntryFieldsProps<"denominations">) {
  const off = (field: string) => !editable || locked.includes(field);
  const id = (field: string) => fieldId("denominations", field);

  return (
    <>
      <SectionHeading>Denomination</SectionHeading>
      <div className={styles.fieldGrid}>
        <Field id={id("currency")} label="Currency" required>
          <input
            id={id("currency")}
            className={styles.textInput}
            maxLength={3}
            placeholder="INR"
            data-uppercase="off"
            data-required="true"
            value={form.currency}
            disabled={off("currency")}
            autoFocus={focus === "currency"}
            onChange={(event) => update({ currency: event.target.value.toUpperCase() })}
          />
        </Field>
        <Field id={id("kind")} label="Kind">
          <select
            id={id("kind")}
            className={styles.selectInput}
            value={form.kind}
            disabled={off("kind")}
            autoFocus={focus === "kind"}
            onChange={(event) => {
              const kind = event.target.value === "COIN" ? "COIN" : "NOTE";
              update({ kind, bundleQty: bundleAfterKindChange(kind, form.bundleQty, mode) });
            }}
          >
            <option value="NOTE">NOTE</option>
            <option value="COIN">COIN</option>
          </select>
        </Field>
        <Field id={id("value")} label="Value" required>
          <NumberBox
            id={id("value")}
            value={form.value}
            max={1000000}
            placeholder="500"
            required
            disabled={off("value")}
            autoFocus={focus === "value"}
            onChange={(value) => update({ value })}
          />
        </Field>
        <Field id={id("label")} label="Label" required>
          <input
            id={id("label")}
            className={styles.textInput}
            maxLength={20}
            placeholder="₹500"
            // "₹500" is the operator's own spelling: the app-wide case rewrite leaves it alone.
            data-uppercase="off"
            data-required="true"
            value={form.label}
            disabled={off("label")}
            autoFocus={focus === "label"}
            onChange={(event) => update({ label: event.target.value })}
          />
        </Field>
        <Field id={id("bundleQty")} label="Bundle Qty">
          <NumberBox
            id={id("bundleQty")}
            value={form.bundleQty}
            decimals={0}
            max={100000}
            disabled={off("bundleQty")}
            onChange={(bundleQty) => update({ bundleQty })}
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
        <Field id={id("validTo")} label="Valid To">
          <DateInput
            block
            id={id("validTo")}
            className={styles.textInput}
            title="blank = no end"
            value={form.validTo}
            disabled={off("validTo")}
            onChange={(value) => update({ validTo: value })}
          />
        </Field>
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
