"use client";

/**
 * "+ Add new size…/colour…" — Qt `AppMessage::askText` (091bf5b): the name to
 * add to the master, required. Enter adds; Esc backs out. Mounted only while
 * open so every ask starts blank.
 */
import { useState, type CSSProperties } from "react";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { NAME_MAX_LENGTH } from "@/features/masters/inventory/item-attribute/item-attribute";

/** The label over a full-width box. */
const FIELD_STYLE: CSSProperties = { display: "flex", flexDirection: "column", gap: "0.3rem" };

export type NewChoiceDialogProps = {
  word: "size" | "colour";
  isOpen: boolean;
  onCancel: () => void;
  onAccept: (name: string) => void;
};

export function NewChoiceDialog(props: NewChoiceDialogProps) {
  return props.isOpen ? <OpenNewChoice {...props} /> : null;
}

function OpenNewChoice({ word, isOpen, onCancel, onAccept }: NewChoiceDialogProps) {
  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);

  const name = value.replace(/\s+/g, " ").trim();
  const submit = () => {
    setTouched(true);
    if (name) {
      onAccept(name);
    }
  };

  return (
    <ModalShell
      title={word === "size" ? "New size" : "New colour"}
      isOpen={isOpen}
      narrow
      onClose={onCancel}
      footer={
        <>
          <button type="button" className={quotationStyles.button} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
            disabled={!name}
            onClick={submit}
          >
            OK
          </button>
        </>
      }
    >
      <label className={quotationStyles.label} style={FIELD_STYLE} htmlFor="opening-stock-new-choice">
        <span>
          {word === "size" ? "Name of the size to add:" : "Name of the colour to add:"}
          <span className={quotationStyles.requiredMark}>*</span>
        </span>
        <input
          id="opening-stock-new-choice"
          // autoFocus, not a rAF focus(): the portal mounts a commit late.
          autoFocus
          className={cx(quotationStyles.input, touched && !name && quotationStyles.cellInvalid)}
          value={value}
          maxLength={NAME_MAX_LENGTH}
          placeholder={word === "size" ? "e.g. XL" : "e.g. Maroon"}
          autoComplete="off"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.stopPropagation();
              submit();
            }
          }}
        />
      </label>
    </ModalShell>
  );
}
