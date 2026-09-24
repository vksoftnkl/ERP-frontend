"use client";

/**
 * The four settings this screen obeys, read once per scope.
 *
 * All of them have a DEFAULT that matters, and each default is a decision:
 *
 *  - `accounts.writeoff_approval_above` defaults to **0**, which means every
 *    write-off needs a name against it. A screen that guessed a high default
 *    would let one through and then be refused at post.
 *  - `accounts.allow_posted_amend` defaults to **false**, and when it is off
 *    the Amend button is HIDDEN rather than greyed: a permanently dead button
 *    prompts the same question from every operator, every week.
 *  - `accounts.tcs_basis` decides whether a TCS line is even offered. The
 *    party payload echoes it too, and the party's copy wins there — it is the
 *    one the server seeded ITS answer from.
 *
 * A setting whose value cannot be read falls back to the safe end of its own
 * question, never to the convenient end.
 */
import { useMemo } from "react";
import { useGetEffectiveSettingsQuery } from "@/store/api/appSettingsApi";
import type { EffectiveSetting } from "@/features/settings/app-settings/types";
import type { ReceiptSettings } from "../receipt.types";

const WRITEOFF_APPROVAL_ABOVE = "accounts.writeoff_approval_above";
const SALESMAN_MANDATORY = "accounts.receipt_salesman_mandatory";
const ALLOW_POSTED_AMEND = "accounts.allow_posted_amend";
const TCS_BASIS = "accounts.tcs_basis";

/** `app_setting_values` stores every value as raw TEXT, whatever its type. */
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

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  // Zero means "always ask", which is the safe end of the question.
  writeoffApprovalAbove: 0,
  salesmanMandatory: false,
  allowPostedAmend: false,
  tcsBasis: "SALES",
};

export function useReceiptSettings(companyId: string, branchId: string): ReceiptSettings {
  const { data } = useGetEffectiveSettingsQuery(
    { companyId, branchId },
    { skip: !companyId },
  );
  return useMemo(() => {
    if (!data) {
      return DEFAULT_RECEIPT_SETTINGS;
    }
    return {
      writeoffApprovalAbove: asNumber(valueOf(data, WRITEOFF_APPROVAL_ABOVE), 0),
      salesmanMandatory: asBoolean(valueOf(data, SALESMAN_MANDATORY), false),
      allowPostedAmend: asBoolean(valueOf(data, ALLOW_POSTED_AMEND), false),
      tcsBasis: valueOf(data, TCS_BASIS)?.trim().toUpperCase() === "RECEIPT" ? "RECEIPT" : "SALES",
    };
  }, [data]);
}
