"use client";

/**
 * Offer the Customer master behind every customer dropdown on this screen.
 *
 * One call and Alt+C adds a customer from the field, Alt+A amends the one
 * selected — without leaving a half-keyed bill for the master screen and coming
 * back to nothing. A screen that does not call this simply has no shortcuts on
 * its customer field; the combobox is unchanged.
 *
 * Two things are deliberately NOT decided here. Which dropdown this is: the id
 * is resolved by NAME from Dropdown Master, so it is whatever this deployment
 * numbered "CUSTOMERS". And whether the operator may: the registration carries
 * the CUSTOMER master's own menu id, and Alt+C is gated on that menu's create
 * right, Alt+A on its edit right — a sale bill can never be a back door into a
 * master somebody was not granted.
 */

import dynamic from "next/dynamic";

import type { DropdownMasterEntryProps } from "@/components/design-system/dropdown/masters";
import { useRegisterDropdownMaster } from "@/components/design-system/dropdown/use-register-dropdown-master";
import { useDropdownId } from "@/lib/configured-dropdowns";

/** `fixed.menu_master` — "Customers". The master's own menu, for its rights. */
export const CUSTOMER_MASTER_MENU_ID = 10;

/**
 * Loaded only once a shortcut is pressed. The customer master is a large screen
 * and a sale bill that never opens it should not carry it: a static import here
 * would put the whole master — its form, its three related-master modals and
 * their lookups — into the entry screen's own bundle.
 */
const InlineCustomerMaster = dynamic(() => import("./inline-customer-master"), {
  ssr: false,
});

export function useCustomerDropdownMaster(options?: { disabled?: boolean }): void {
  const customerDropdownId = useDropdownId("customer");

  useRegisterDropdownMaster(customerDropdownId, {
    menuId: CUSTOMER_MASTER_MENU_ID,
    disabled: options?.disabled,
    render: (props: DropdownMasterEntryProps) => <InlineCustomerMaster {...props} />,
  });
}
