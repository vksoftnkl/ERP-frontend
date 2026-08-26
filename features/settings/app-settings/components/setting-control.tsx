"use client";

import type { ChangeEvent } from "react";
import { parseBool } from "../lib/value-text";
import type { SettingRow } from "../use-app-settings";
import styles from "../page.module.scss";

/**
 * The control is chosen by DATA, never by key.
 *
 *   an allowed-value list  -> a select of exactly those values
 *   BOOL                   -> a switch
 *   INT                    -> a number box, step 1,   clamped to min/max
 *   DECIMAL                -> a number box, step .01, clamped to min/max
 *   DATE                   -> a date box
 *   JSON                   -> a textarea
 *   TEXT / UUID            -> a text box
 *
 * The moment one setting gets a bespoke control by `asdKey`, the catalog stops
 * being the source of truth and the next setting needs a front-end release
 * instead of an INSERT. The allowed-value list is tested first because the
 * catalog may pin any type to a list, not only TEXT — the trigger compares
 * `asd_allowed_values @> to_jsonb(asv_value)` whatever the column says.
 *
 * The boxes carry `data-uppercase="off"`: the app uppercases free text globally,
 * and a setting value is stored exactly as typed — `warning` upper-cased is a
 * value the catalog's allowed list would refuse.
 */
export default function SettingControl({
  row,
  onChange,
}: {
  row: SettingRow;
  onChange: (value: string) => void;
}) {
  const disabled = !row.editable;
  const invalid = Boolean(row.error);
  const controlId = `app-setting-${row.asdKey}`;
  const describedBy = invalid ? `${controlId}-error` : undefined;
  const handle = (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    onChange(event.target.value);

  if (row.asdAllowedValues && row.asdAllowedValues.length > 0) {
    const options = row.asdAllowedValues.includes(row.draft)
      ? row.asdAllowedValues
      : // A value the catalog no longer allows must still be visible, or the
        // control would silently show a different setting than the one stored.
        [row.draft, ...row.asdAllowedValues];
    return (
      <select
        id={controlId}
        className={`${styles.control} ${styles.controlSelect} ${invalid ? styles.controlInvalid : ""}`}
        value={row.draft}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={handle}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (row.asdDataType === "BOOL") {
    const checked = parseBool(row.draft);
    return (
      <label className={styles.switch} htmlFor={controlId}>
        <input
          id={controlId}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked ? "true" : "false")}
        />
        <span className={styles.switchTrack} aria-hidden="true">
          <span className={styles.switchThumb} />
        </span>
        <span className={styles.switchText}>{checked ? "On" : "Off"}</span>
      </label>
    );
  }

  if (row.asdDataType === "INT" || row.asdDataType === "DECIMAL") {
    return (
      <input
        id={controlId}
        type="number"
        inputMode={row.asdDataType === "INT" ? "numeric" : "decimal"}
        className={`${styles.control} ${styles.controlNumber} ${invalid ? styles.controlInvalid : ""}`}
        value={row.draft}
        step={row.asdDataType === "INT" ? 1 : 0.01}
        {...(row.asdMinValue !== null ? { min: row.asdMinValue } : {})}
        {...(row.asdMaxValue !== null ? { max: row.asdMaxValue } : {})}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={handle}
      />
    );
  }

  if (row.asdDataType === "DATE") {
    return (
      <input
        id={controlId}
        type="date"
        className={`${styles.control} ${invalid ? styles.controlInvalid : ""}`}
        value={row.draft}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={handle}
      />
    );
  }

  if (row.asdDataType === "JSON") {
    return (
      <textarea
        id={controlId}
        rows={3}
        data-uppercase="off"
        className={`${styles.control} ${styles.controlJson} ${invalid ? styles.controlInvalid : ""}`}
        value={row.draft}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={handle}
      />
    );
  }

  return (
    <input
      id={controlId}
      type="text"
      data-uppercase="off"
      autoCapitalize="off"
      className={`${styles.control} ${
        row.asdDataType === "UUID" ? styles.controlMono : ""
      } ${invalid ? styles.controlInvalid : ""}`}
      value={row.draft}
      disabled={disabled}
      aria-describedby={describedBy}
      onChange={handle}
    />
  );
}
