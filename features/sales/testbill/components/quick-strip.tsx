"use client";

/**
 * The quick strip (§6.2): icon-only buttons with the caption as tooltip.
 *
 * Live: Quick add customer · Quote import (Ctrl+F3) · Order import (Ctrl+F4)
 * · Challan (Ctrl+F5) · Disc % All (Alt+D) · ± Price · Cost (Alt+O) · Shipping
 * · e-Inv · e-Way · Copy (Alt+Y). The "coming soon" ones render DISABLED, not
 * hidden, the same as the Qt strip: Cust. history, Check price, Last rates,
 * Split stock, Stock fix, Ledger, Receipt, Returns, Pick list, WhatsApp.
 */
import type { ReactNode } from "react";
import {
  FiActivity,
  FiBarChart2,
  FiBookOpen,
  FiClock,
  FiCopy,
  FiDollarSign,
  FiDownload,
  FiFileText,
  FiGitBranch,
  FiList,
  FiMessageCircle,
  FiPercent,
  FiRotateCcw,
  FiSearch,
  FiShield,
  FiTag,
  FiTool,
  FiTruck,
  FiUserPlus,
  FiZap,
} from "react-icons/fi";
import { cx } from "@/components/design-system/cx";
import orderStyles from "@/features/sales/sale-order/page.module.scss";

export type QuickAction = {
  key: string;
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** "Coming soon": rendered greyed with the caption, never hidden. */
  soon?: boolean;
};

export type BillQuickStripProps = {
  editable: boolean;
  posted: boolean;
  isNew: boolean;
  hasLines: boolean;
  onQuickAddCustomer: () => void;
  onImportQuotation: () => void;
  onImportOrder: () => void;
  onImportChallan: () => void;
  onDiscountAll: () => void;
  onAdjustPrices: () => void;
  onShowCost: () => void;
  onShipping: () => void;
  onEinvoice: () => void;
  onEwaybill: () => void;
  onCopyAsNew: () => void;
  einvoiceLabel: string;
  ewaybillLabel: string;
  einvoiceEnabled: boolean;
  ewaybillEnabled: boolean;
  /** Tooltip explaining why e-Inv is off (an IRN already exists, §21). */
  einvoiceTooltip?: string | null;
  shippingSummary: string;
};

export function BillQuickStrip(props: BillQuickStripProps) {
  const { editable, posted, isNew, hasLines } = props;
  const live: QuickAction[] = [
    { key: "quickAdd", label: "Quick add customer (Alt+C on the customer field)", icon: <FiUserPlus />, onClick: props.onQuickAddCustomer, disabled: !editable },
    { key: "quote", label: "Import a quotation (Ctrl+F3)", icon: <FiDownload />, onClick: props.onImportQuotation, disabled: !editable },
    { key: "order", label: "Import a sales order (Ctrl+F4)", icon: <FiFileText />, onClick: props.onImportOrder, disabled: !editable },
    { key: "challan", label: "Import challan lines (Ctrl+F5)", icon: <FiTruck />, onClick: props.onImportChallan, disabled: !editable },
    { key: "discAll", label: "Disc % on every line (Alt+D)", icon: <FiPercent />, onClick: props.onDiscountAll, disabled: !editable || !hasLines },
    { key: "price", label: "± Price on every line", icon: <FiDollarSign />, onClick: props.onAdjustPrices, disabled: !editable || !hasLines },
    { key: "cost", label: "Cost of the current line (Alt+O)", icon: <FiTag />, onClick: props.onShowCost, disabled: !hasLines },
    { key: "shipping", label: `Shipping — ${props.shippingSummary}`, icon: <FiGitBranch />, onClick: props.onShipping },
    { key: "einv", label: props.einvoiceTooltip ?? props.einvoiceLabel, icon: <FiShield />, onClick: props.onEinvoice, disabled: !props.einvoiceEnabled },
    { key: "eway", label: props.ewaybillLabel, icon: <FiZap />, onClick: props.onEwaybill, disabled: !props.ewaybillEnabled },
    { key: "copy", label: "Copy as a new bill (Alt+Y)", icon: <FiCopy />, onClick: props.onCopyAsNew, disabled: isNew },
  ];
  const soon: QuickAction[] = [
    { key: "history", label: "Customer history — coming soon", icon: <FiClock />, soon: true },
    { key: "checkPrice", label: "Check price — coming soon", icon: <FiSearch />, soon: true },
    { key: "lastRates", label: "Last rates — coming soon", icon: <FiBarChart2 />, soon: true },
    { key: "split", label: "Split stock — coming soon", icon: <FiActivity />, soon: true },
    { key: "stockFix", label: "Stock fix — coming soon", icon: <FiTool />, soon: true },
    { key: "ledger", label: "Ledger — coming soon", icon: <FiBookOpen />, soon: true },
    { key: "receipt", label: "Receipt — coming soon", icon: <FiList />, soon: true },
    { key: "returns", label: "Returns — coming soon", icon: <FiRotateCcw />, soon: true },
    { key: "pickList", label: "Pick list — coming soon", icon: <FiFileText />, soon: true },
    { key: "whatsapp", label: "WhatsApp — coming soon", icon: <FiMessageCircle />, soon: true },
  ];
  void posted;
  return (
    <div className={orderStyles.iconToolbar} role="toolbar" aria-label="Bill actions">
      {[...live, ...soon].map((action) => (
        <button
          key={action.key}
          type="button"
          className={cx(orderStyles.iconButton, (action.disabled || action.soon) && orderStyles.iconButtonDisabled)}
          title={action.label}
          aria-label={action.label}
          disabled={action.disabled || action.soon}
          onClick={action.onClick}
        >
          {action.icon}
        </button>
      ))}
      <span className={orderStyles.iconToolbarNote}>{props.shippingSummary}</span>
    </div>
  );
}
