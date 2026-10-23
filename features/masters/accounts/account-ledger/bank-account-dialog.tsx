"use client";
/**
 * One bank account of a ledger / supplier, added or edited in a popup — Qt
 * NexBankAccountDialog (4ae6575; the user, 2026-10-22: "edit only on popup,
 * stop editing in the table cell"). The list behind it (`BankAccountsEditor`)
 * only shows the accounts. Nothing is sent to the server from here: OK hands
 * the account back and it is saved with the ledger, as before.
 *
 * It sits over the ledger / supplier entry modal, so it takes its keys first:
 * Escape cancels and Ctrl+Enter / Ctrl+S / F12 is OK, and none of them reaches
 * the entry form underneath (window capture, `preventDefault` +
 * `stopImmediatePropagation`). Bare Enter walks to the next box — the popup
 * rule, no default button. Its React events also stop at its root: it is
 * portaled out of the entry form's DOM but not out of its React tree, so a
 * submit or a keydown would otherwise bubble into that form.
 */
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type SyntheticEvent,
} from "react";
import ModalPortal from "@/components/ui/modal-portal";
import dynamicFormStyles from "@/components/design-system/ui/dynamic-modal-form.module.scss";
import { focusNextInteractiveControl } from "@/components/design-system/ui/focus-next-control";
import {
  bankAccountTypeOptions,
  finishBankAccountDraft,
  validateBankAccountDraft,
  type BankAccountDraftError,
  type LedgerBankAccountFieldName,
  type LedgerBankAccountFormRow,
} from "./bank-accounts";

export type BankAccountDialogProps = {
  /** The account as the popup opens on it: a fresh draft for Add. */
  account: LedgerBankAccountFormRow;
  isNew: boolean;
  /** A bank-profile ledger's one account: Default ticked and locked. */
  defaultLocked: boolean;
  onConfirm: (row: LedgerBankAccountFormRow) => void;
  onCancel: () => void;
};

type TextFieldName = Exclude<LedgerBankAccountFieldName, "lbaAccountType">;

type TextFieldSpec = {
  field: TextFieldName;
  label: string;
  maxLength: number;
  required?: boolean;
  placeholder?: string;
  wide?: boolean;
  /** Upper case as typed (IFSC). */
  upperCase?: boolean;
  /**
   * Out of the global capitalization: IFSC is upper-cased here, and a UPI id
   * is an address, not words.
   */
  keepCase?: boolean;
};

// The server's lengths (ledger-bank-account-item.dto.ts).
const LEADING_FIELDS: TextFieldSpec[] = [
  { field: "lbaAccountNo", label: "Account No", required: true, maxLength: 50 },
  { field: "lbaAccountHolder", label: "Account Holder", required: true, maxLength: 200 },
  { field: "lbaBankName", label: "Bank Name", required: true, maxLength: 200 },
  { field: "lbaBranchName", label: "Branch", maxLength: 200 },
  {
    field: "lbaIfscCode",
    label: "IFSC",
    maxLength: 11,
    placeholder: "SBIN0001234",
    upperCase: true,
    keepCase: true,
  },
  { field: "lbaMicrCode", label: "MICR", maxLength: 15 },
];
const TRAILING_FIELDS: TextFieldSpec[] = [
  { field: "lbaUpiId", label: "UPI ID", maxLength: 100, keepCase: true },
  { field: "lbaChequeName", label: "Cheque Name", maxLength: 200 },
  { field: "lbaRemarks", label: "Remarks", maxLength: 250, wide: true },
];

const PANEL_STYLE: CSSProperties = {
  width: "min(44rem, calc(calc(100vw / var(--erp-ui-scale)) - 2.4rem))",
};
const FORM_GRID_STYLE: CSSProperties = {
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
};
const CHECKBOX_ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "1.5rem",
};

const stopAtRoot = (event: SyntheticEvent) => event.stopPropagation();

export default function BankAccountDialog({
  account,
  isNew,
  defaultLocked,
  onConfirm,
  onCancel,
}: BankAccountDialogProps) {
  const [draft, setDraft] = useState<LedgerBankAccountFormRow>(() => ({
    ...account,
    lbaIsDefault: defaultLocked || account.lbaIsDefault,
  }));
  const [error, setError] = useState<BankAccountDraftError | null>(null);
  const controlRefs = useRef<Partial<Record<LedgerBankAccountFieldName, HTMLElement | null>>>({});
  const okButtonRef = useRef<HTMLButtonElement | null>(null);
  const title = isNew ? "Add Bank Account" : "Edit Bank Account";
  const formId = `bank-account-dialog-${account.rowKey}`;

  const update = (patch: Partial<LedgerBankAccountFormRow>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError((current) => (current && current.field in patch ? null : current));
  };

  // OK: the three required fields first ("Enter the …"), focus on the one
  // missing; the popup stays open until they are there.
  const confirm = () => {
    const refusal = validateBankAccountDraft(draft);
    if (refusal) {
      setError(refusal);
      controlRefs.current[refusal.field]?.focus();
      return;
    }
    onConfirm(finishBankAccountDraft(draft, { singleMandatory: defaultLocked }));
  };
  // The latest OK / Cancel for the key listener, which is attached once.
  const confirmRef = useRef(confirm);
  const cancelRef = useRef(onCancel);
  useEffect(() => {
    confirmRef.current = confirm;
    cancelRef.current = onCancel;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // A message popup on top owns the keyboard.
      if (document.querySelector('[role="alertdialog"]')) {
        return;
      }
      const isOk =
        (!event.altKey &&
          !event.shiftKey &&
          (event.ctrlKey || event.metaKey) &&
          (event.key === "Enter" || event.key.toLowerCase() === "s")) ||
        (event.key === "F12" && !event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey);
      if (event.key !== "Escape" && !isOk) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        cancelRef.current();
      } else {
        confirmRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    confirm();
  };

  // Bare Enter moves on to the next box, and from the last one to OK; on a
  // button it presses it.
  const handleFormKeyDown = (event: ReactKeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
      return;
    }
    event.preventDefault();
    if (!focusNextInteractiveControl(target)) {
      okButtonRef.current?.focus();
    }
  };

  const renderTextField = (spec: TextFieldSpec, autoFocus = false) => {
    const invalid = error?.field === spec.field;
    const controlId = `${formId}-${spec.field}`;
    return (
      <div
        key={spec.field}
        className={`${dynamicFormStyles.field} ${dynamicFormStyles.fieldStacked} ${
          spec.wide ? dynamicFormStyles.fieldWide : ""
        }`}
      >
        <label className={`${dynamicFormStyles.label} erp-ms-modal-label`} htmlFor={controlId}>
          {spec.label}
          {spec.required ? <span className={dynamicFormStyles.requiredMark}> *</span> : null}
        </label>
        <input
          ref={(element) => {
            controlRefs.current[spec.field] = element;
          }}
          id={controlId}
          className={`${dynamicFormStyles.control} erp-ms-modal-control ${
            invalid ? dynamicFormStyles.controlInvalid : ""
          }`}
          type="text"
          autoComplete="off"
          autoFocus={autoFocus}
          data-uppercase={spec.keepCase ? "off" : undefined}
          value={draft[spec.field]}
          maxLength={spec.maxLength}
          placeholder={spec.placeholder}
          aria-invalid={invalid || undefined}
          onChange={(event) =>
            update({
              [spec.field]: spec.upperCase ? event.target.value.toUpperCase() : event.target.value,
            } as Partial<LedgerBankAccountFormRow>)
          }
        />
      </div>
    );
  };

  return (
    <ModalPortal>
      <div
        className={`${dynamicFormStyles.overlay} erp-ms-modal-overlay`}
        onKeyDown={stopAtRoot}
        onKeyUp={stopAtRoot}
        onMouseDown={stopAtRoot}
        onPointerDown={stopAtRoot}
        onClick={stopAtRoot}
        onDoubleClick={stopAtRoot}
        onContextMenu={stopAtRoot}
        onFocus={stopAtRoot}
        onBlur={stopAtRoot}
        onChange={stopAtRoot}
        onInput={stopAtRoot}
        onSubmit={stopAtRoot}
      >
        {/* Inert, as a Qt dialog: a stray click beside the popup must not lose
            what was typed. Cancel, × or Esc close it. */}
        <div className={dynamicFormStyles.backdrop} aria-hidden />
        <div
          className={`${dynamicFormStyles.panel} erp-ms-modal`}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          style={PANEL_STYLE}
        >
          <header className={`${dynamicFormStyles.header} erp-ms-modal-header`}>
            <div className={dynamicFormStyles.headerRow}>
              <div className={dynamicFormStyles.headerText}>
                <h2 className={`${dynamicFormStyles.headerTitle} erp-ms-modal-title`}>{title}</h2>
              </div>
              <button
                type="button"
                className={`${dynamicFormStyles.closeButton} erp-ms-modal-close`}
                onClick={onCancel}
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
                  <path
                    d="M6 18 18 6M6 6l12 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </header>
          <div className={`${dynamicFormStyles.scrollArea} erp-ms-modal-body`}>
            <form
              id={formId}
              className={dynamicFormStyles.formGrid}
              style={FORM_GRID_STYLE}
              noValidate
              autoComplete="off"
              onSubmit={handleSubmit}
              onKeyDown={handleFormKeyDown}
            >
              {LEADING_FIELDS.map((spec, index) => renderTextField(spec, index === 0))}
              <div className={`${dynamicFormStyles.field} ${dynamicFormStyles.fieldStacked}`}>
                <label
                  className={`${dynamicFormStyles.label} erp-ms-modal-label`}
                  htmlFor={`${formId}-lbaAccountType`}
                >
                  Account Type
                </label>
                <select
                  ref={(element) => {
                    controlRefs.current.lbaAccountType = element;
                  }}
                  id={`${formId}-lbaAccountType`}
                  className={`${dynamicFormStyles.control} erp-ms-modal-control`}
                  value={draft.lbaAccountType}
                  onChange={(event) => update({ lbaAccountType: event.target.value })}
                >
                  {bankAccountTypeOptions(draft.lbaAccountType).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label || "Select"}
                    </option>
                  ))}
                </select>
              </div>
              {TRAILING_FIELDS.map((spec) => renderTextField(spec))}
              <div className={dynamicFormStyles.fieldWide} style={CHECKBOX_ROW_STYLE}>
                <label className={dynamicFormStyles.checkboxWrapper}>
                  <input
                    type="checkbox"
                    className={dynamicFormStyles.checkboxControl}
                    checked={draft.lbaIsDefault}
                    disabled={defaultLocked}
                    title={defaultLocked ? "A bank ledger's one account is always the default." : undefined}
                    onChange={(event) => update({ lbaIsDefault: event.target.checked })}
                  />
                  <span className={dynamicFormStyles.checkboxLabel}>Default account</span>
                </label>
                <label className={dynamicFormStyles.checkboxWrapper}>
                  <input
                    type="checkbox"
                    className={dynamicFormStyles.checkboxControl}
                    checked={draft.lbaIsActive}
                    onChange={(event) => update({ lbaIsActive: event.target.checked })}
                  />
                  <span className={dynamicFormStyles.checkboxLabel}>Active</span>
                </label>
              </div>
            </form>
          </div>
          <footer className={`${dynamicFormStyles.footer} erp-ms-modal-footer`}>
            <p className="erp-ms-modal-hint" aria-hidden="true">
              <kbd>Ctrl+Enter</kbd>: OK <span>|</span> <kbd>Esc</kbd>: Cancel
            </p>
            {error ? (
              <p className={dynamicFormStyles.submitError} role="alert">
                {error.message}
              </p>
            ) : null}
            <div className={`${dynamicFormStyles.footerActions} erp-ms-modal-footer-actions`}>
              <button
                type="button"
                className={`${dynamicFormStyles.cancelButton} erp-ms-modal-cancel`}
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                ref={okButtonRef}
                type="submit"
                form={formId}
                className={`${dynamicFormStyles.submitButton} erp-ms-modal-save`}
              >
                OK
              </button>
            </div>
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
}
