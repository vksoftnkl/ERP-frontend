"use client";

/**
 * Visible Settings for the bill's header panel — the sale bill's wrapper over
 * the shared `usePanelVisibleSettings`.
 *
 * The mechanism is the quotation's, unchanged: the same backend config the
 * master screens use (`fixed.form_section` / `fixed.form_field`), read here for
 * menu 12 "Sales Entry" on the Web platform, deciding which header and Terms
 * fields this deployment shows and what it calls them. Visibility and labels
 * only, never order — the header blocks are a hand-laid-out layout the legacy
 * screen shares, so a configured position has nothing meaningful to move.
 *
 * All that lives here is WHICH screen and WHICH fields. Everything else — the
 * dialog, the pending-edit preview, the whole-batch save, the "a field the
 * config says nothing about stays visible" rule — is one implementation shared
 * with the quotation.
 *
 * Right-click is already spoken for on the two grids ("Admin settings", which
 * configures `fixed.ui_table_columns` instead), so this one is scoped to the
 * header panel and the Terms block and the two never compete for the same click.
 */
import {
  usePanelVisibleSettings,
  type VisibleSettings,
} from "@/features/sales/quotation/components/visible-settings";
import {
  SALE_BILL_HEADER_FIELD_NAMES,
  SALE_BILL_TERMS_FIELD_NAMES,
  SALE_BILL_WIDGET_MENU_ID,
  SALE_BILL_WIDGET_PLATFORM,
  type SaleBillHeaderFieldKey,
  type SaleBillTermsFieldKey,
} from "../salebill.constants";

export type BillVisibleSettings = VisibleSettings<SaleBillHeaderFieldKey, SaleBillTermsFieldKey>;

export function useBillVisibleSettings(): BillVisibleSettings {
  return usePanelVisibleSettings({
    menuId: SALE_BILL_WIDGET_MENU_ID,
    platform: SALE_BILL_WIDGET_PLATFORM,
    headerFieldNames: SALE_BILL_HEADER_FIELD_NAMES,
    termsFieldNames: SALE_BILL_TERMS_FIELD_NAMES,
  });
}
