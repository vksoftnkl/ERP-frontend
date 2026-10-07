"use client";

/**
 * Draws a list of `PartField`s — two label / control pairs a row, a heading
 * across the whole row. What a field MEANS (how it fills, how it goes out) is
 * `domain/part-form.ts`; this is only how it looks.
 *
 * A field the loaded row did not carry (an error-map edit from its grid row)
 * shows "(as stored)" and is left off the save until it is changed.
 */
import type { ReactNode } from "react";
import { cx } from "@/components/design-system/cx";
import type { PartField, PartFormState } from "../domain/part-form";
import { SecretInput } from "./controls";
import styles from "../gst.module.scss";

const AS_STORED = "\u0000as-stored";

export type PartFieldsProps = {
  fields: readonly PartField[];
  state: PartFormState;
  /** Prefix for element ids, unique per dialog. */
  idPrefix: string;
  readOnly?: boolean;
  /** Fields shown but not editable (a provider's code once it exists). */
  lockedKeys?: readonly string[];
  /** The field the last save refused on. */
  invalidKey?: string | null;
  /** One label / control pair per row. */
  singleColumn?: boolean;
  /** The field that takes the focus when the form appears. */
  autoFocusKey?: string;
  onValue: (key: string, value: string | boolean) => void;
  onSecretText: (key: string, text: string) => void;
  onSecretClear: (key: string) => void;
  /** `custom` fields, and `lookup` controls. */
  renderCustom?: (field: PartField) => ReactNode;
};

export function fieldElementId(idPrefix: string, key: string): string {
  return `${idPrefix}-${key}`;
}

function isRequired(field: PartField, state: PartFormState): boolean {
  if (field.kind === "secret") {
    // The credential's password: required until one is stored.
    return Boolean(field.requiredWhenUnset) && !state.secrets[field.key]?.stored;
  }
  return "required" in field && Boolean(field.required);
}

export function PartFields({
  fields,
  state,
  idPrefix,
  readOnly,
  lockedKeys,
  invalidKey,
  singleColumn,
  autoFocusKey,
  onValue,
  onSecretText,
  onSecretClear,
  renderCustom,
}: PartFieldsProps) {
  const cells: ReactNode[] = [];
  for (const field of fields) {
    const id = fieldElementId(idPrefix, field.key);
    const unknown = state.unknown.includes(field.key);
    const invalid = invalidKey === field.key;
    const disabled = readOnly || lockedKeys?.includes(field.key);
    const autoFocus = !readOnly && field.key === autoFocusKey;
    const label = (
      <label key={`${field.key}-label`} className={styles.label} htmlFor={id}>
        {field.label}
        {isRequired(field, state) ? (
          <span className={styles.requiredMark} aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
    );
    const controlClass = cx(styles.control, field.full && styles.controlFull);
    const raw = state.values[field.key];
    const text = typeof raw === "string" ? raw : "";

    switch (field.kind) {
      case "heading":
        cells.push(
          <div key={field.key} className={styles.heading}>
            {field.label}
            {field.note ? <span className={styles.headingNote}>· {field.note}</span> : null}
          </div>,
        );
        break;
      case "custom":
        // A full custom with no label (the field-map panel) takes the whole row.
        if (field.full && !field.label) {
          cells.push(
            <div key={field.key} className={styles.spanAll}>
              {renderCustom?.(field)}
            </div>,
          );
        } else {
          cells.push(
            label,
            <div key={field.key} className={controlClass}>
              {renderCustom?.(field)}
            </div>,
          );
        }
        break;
      case "lookup":
        cells.push(
          label,
          <div key={field.key} className={controlClass}>
            {renderCustom?.(field)}
          </div>,
        );
        break;
      case "check":
        cells.push(
          <span key={`${field.key}-label`} />,
          <div key={field.key} className={controlClass}>
            <label className={styles.check} aria-disabled={disabled || undefined}>
              <input
                id={id}
                type="checkbox"
                autoFocus={autoFocus}
                checked={raw === true}
                disabled={disabled}
                onChange={(event) => onValue(field.key, event.target.checked)}
              />
              {field.label}
            </label>
          </div>,
        );
        break;
      case "select": {
        const options = unknown ? [{ value: AS_STORED, label: "(as stored)" }, ...field.options] : field.options;
        cells.push(
          label,
          <div key={field.key} className={controlClass}>
            <select
              id={id}
              className={cx(styles.select, invalid && styles.inputInvalid)}
              autoFocus={autoFocus}
              value={unknown ? AS_STORED : text}
              disabled={disabled}
              aria-invalid={invalid || undefined}
              onChange={(event) => {
                if (event.target.value !== AS_STORED) {
                  onValue(field.key, event.target.value);
                }
              }}
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>,
        );
        break;
      }
      case "lines":
        cells.push(
          label,
          <div key={field.key} className={controlClass}>
            <textarea
              id={id}
              className={styles.textarea}
              autoFocus={autoFocus}
              value={text}
              placeholder={field.placeholder}
              disabled={disabled}
              data-uppercase="off"
              spellCheck={false}
              onChange={(event) => onValue(field.key, event.target.value)}
            />
          </div>,
        );
        break;
      case "secret": {
        const secret = state.secrets[field.key] ?? { text: "", clear: false, stored: false };
        cells.push(
          label,
          <div key={field.key} className={controlClass}>
            <SecretInput
              id={id}
              label={field.label}
              value={secret}
              keyVersion={state.keyVersion}
              clearable={field.clearable}
              autoFocus={autoFocus}
              disabled={disabled}
              invalid={invalid}
              onText={(value) => onSecretText(field.key, value)}
              onToggleClear={() => onSecretClear(field.key)}
            />
          </div>,
        );
        break;
      }
      case "text":
      case "int":
      case "date":
        cells.push(
          label,
          <div key={field.key} className={controlClass}>
            <input
              id={id}
              type={field.kind === "date" ? "date" : "text"}
              inputMode={field.kind === "int" ? "numeric" : undefined}
              className={cx(styles.input, invalid && styles.inputInvalid)}
              autoFocus={autoFocus && !disabled}
              value={text}
              maxLength={field.kind === "text" ? field.maxLength : undefined}
              placeholder={
                unknown ? "(as stored)" : field.kind !== "date" ? field.placeholder : undefined
              }
              readOnly={disabled}
              disabled={readOnly}
              // Codes, URLs, JSON paths and templates are case-sensitive.
              data-uppercase="off"
              spellCheck={false}
              aria-invalid={invalid || undefined}
              onChange={(event) => onValue(field.key, event.target.value)}
            />
          </div>,
        );
        break;
      default:
        break;
    }
  }
  return <div className={cx(styles.formGrid, singleColumn && styles.formGridSingle)}>{cells}</div>;
}
