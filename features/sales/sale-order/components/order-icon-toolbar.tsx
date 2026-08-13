"use client";
/**
 * The icon strip under the title, the way the legacy screen opens: the actions
 * an operator reaches for mid-document, as icons rather than words.
 *
 * Every button here does something this screen actually implements — the
 * legacy strip carries a dozen more (loyalty, e-way bill, WhatsApp, transport)
 * that have no endpoint on this client yet, and a row of icons that silently
 * do nothing is worse than a shorter row.
 */
import type { ReactNode } from "react";
import {
  FiCopy,
  FiCreditCard,
  FiDownload,
  FiList,
  FiPercent,
  FiPrinter,
  FiRotateCcw,
  FiSettings,
  FiTrash2,
} from "react-icons/fi";
import { cx } from "@/components/design-system/cx";
import styles from "../page.module.scss";

export type OrderIconAction = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
};

export type OrderIconToolbarProps = {
  onOpenTender: () => void;
  onImportQuotation: () => void;
  onShowList: () => void;
  onCopyAsNew: () => void;
  onPrint: () => void;
  onClear: () => void;
  onDelete: () => void;
  onGridSettings: () => void;
  canTender: boolean;
  canDelete: boolean;
  canCopy: boolean;
  editable: boolean;
};

export function OrderIconToolbar(props: OrderIconToolbarProps) {
  const actions: OrderIconAction[] = [
    {
      key: "tender",
      label: "Advance / tender (F5)",
      icon: <FiCreditCard />,
      onClick: props.onOpenTender,
      disabled: !props.canTender,
    },
    {
      key: "import",
      label: "Import a quotation (Ctrl+F3)",
      icon: <FiDownload />,
      onClick: props.onImportQuotation,
      disabled: !props.editable,
    },
    { key: "list", label: "Order list (F8)", icon: <FiList />, onClick: props.onShowList },
    {
      key: "copy",
      label: "Copy as new (Alt+Y)",
      icon: <FiCopy />,
      onClick: props.onCopyAsNew,
      disabled: !props.canCopy,
    },
    { key: "print", label: "Save & print (F6)", icon: <FiPrinter />, onClick: props.onPrint },
    {
      key: "clear",
      label: "Clear (F7)",
      icon: <FiRotateCcw />,
      onClick: props.onClear,
      disabled: !props.editable,
    },
    {
      key: "delete",
      label: "Delete (F3)",
      icon: <FiTrash2 />,
      onClick: props.onDelete,
      disabled: !props.canDelete,
    },
    {
      key: "settings",
      label: "Item grid columns",
      icon: <FiSettings />,
      onClick: props.onGridSettings,
    },
  ];

  return (
    <div className={styles.iconToolbar} role="toolbar" aria-label="Order actions">
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          className={cx(styles.iconButton, action.disabled && styles.iconButtonDisabled)}
          title={action.label}
          aria-label={action.label}
          disabled={action.disabled}
          onClick={action.onClick}
        >
          {action.icon}
        </button>
      ))}
      {/* A discount icon the legacy strip carries: the per-line and charge-row
          discounts are keyed in the grids, so it only points there. */}
      <span className={styles.iconToolbarNote} aria-hidden="true">
        <FiPercent /> discounts are keyed in the grids
      </span>
    </div>
  );
}
