"use client";

/**
 * The settings Bill-wise Payment obeys, read once per scope — the receipt's,
 * with the payment's own salesman key.
 *
 *  - `accounts.writeoff_approval_above` (default 0: every write-back is
 *    approved — by the posting user, as the Qt screen does);
 *  - `accounts.payment_salesman_mandatory` (BRANCH scope, default false):
 *    whether "Paid by" must be named;
 *  - `accounts.allow_posted_amend` (default false): when off, the Correct
 *    button is HIDDEN, not greyed.
 *
 * A setting that cannot be read falls back to the safe end of its question.
 */
import { useMemo } from "react";
import { useGetEffectiveSettingsQuery } from "@/store/api/appSettingsApi";
import type { EffectiveSetting } from "@/features/settings/app-settings/types";
import type { PaymentSettings } from "../payment.types";

const WRITEOFF_APPROVAL_ABOVE = "accounts.writeoff_approval_above";
const SALESMAN_MANDATORY = "accounts.payment_salesman_mandatory";
const ALLOW_POSTED_AMEND = "accounts.allow_posted_amend";

function valueOf(rows: readonly EffectiveSetting[] | undefined, key: string): string | null {
  const row = rows?.find((candidate) => candidate.asdKey === key);
  if (!row) {
    return null;
  }
  return row.value ?? row.asdDefaultValue ?? null;
}

function asBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null) {
    return fallback;
  }
  const text = value.trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(text)) {
    return true;
  }
  if (["false", "0", "no", "n", "off"].includes(text)) {
    return false;
  }
  return fallback;
}

function asNumber(value: string | null, fallback: number): number {
  const parsed = Number.parseFloat((value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  writeoffApprovalAbove: 0,
  salesmanMandatory: false,
  allowPostedAmend: false,
};

export function usePaymentSettings(companyId: string, branchId: string): PaymentSettings {
  const { data } = useGetEffectiveSettingsQuery({ companyId, branchId }, { skip: !companyId });
  return useMemo(() => {
    if (!data) {
      return DEFAULT_PAYMENT_SETTINGS;
    }
    return {
      writeoffApprovalAbove: asNumber(valueOf(data, WRITEOFF_APPROVAL_ABOVE), 0),
      salesmanMandatory: asBoolean(valueOf(data, SALESMAN_MANDATORY), false),
      allowPostedAmend: asBoolean(valueOf(data, ALLOW_POSTED_AMEND), false),
    };
  }, [data]);
}
