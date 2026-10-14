"use client";

/**
 * Till Approval Authority (menu 285 under 271 "Till") — Qt
 * `TillApprovalAuthorityList` (NexERP a449b8c; server notes 111). WHO may
 * approve a till exception: a list of grants with a popup, like the other till
 * masters. The rules (WHEN) are on Till Approval Rules, menu 276
 * (`features/sales/till/approval-setup`).
 */
import { GrantList } from "./components/grant-list";

export default function TillApprovalAuthorityScreen() {
  return <GrantList />;
}
