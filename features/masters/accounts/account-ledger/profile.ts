// Group -> ledger-profile resolution for the Account Ledger create/update modal.
//
// Ported from the desktop LedgerEntry form (ledger_entry.cpp): the selected
// account group's `acc_ledger_profile` decides which sections of the ledger form
// are shown and what the (read-only) Ledger Type is. The server exposes the
// profile in two places:
//   - the ledger GET response  -> `ledGroupLedgerProfile`
//   - GET /account-groups/get  -> `accLedgerProfile`
// Both carry the same AccLedgerProfile enum string.

import type { LedgerFormField, LedgerFormSection } from "./types";

// Mirrors the server AccLedgerProfile enum
// (accounts.account_groups.acc_ledger_profile) and C++ LedgerEntry::Profile.
export type LedgerProfile =
  | "General"
  | "Tax"
  | "Bank"
  | "Party"
  | "SalesPurchase"
  | "Cash";

// Visibility policy keyed by tab key AND sub-heading key (mirrors the C++
// applyProfileVisibility section policy). Any key not listed here is always
// visible (Identity tab, Preferences, Opening Balance). A field/sub-section is
// gated by its own key; a tab is additionally hidden when none of its
// sub-sections are visible for the profile.
const PROFILE_SECTION_VISIBILITY: Record<string, ReadonlyArray<LedgerProfile>> = {
  // --- Identity tab sub-sections (the tab itself is always visible) ---
  gst_supply: ["SalesPurchase"], // Supply Details
  bank: ["Bank", "Party"], // Bank Details (inline grid)
  // --- GST & Tax tab + its sub-sections ---
  gst: ["Party", "SalesPurchase", "Tax"], // tab
  gst_reg: ["Party"], // GST Registration
  duty: ["Tax"], // Duty Setup
  statutory: ["Party"], // Statutory
  tds: ["Party"], // TDS / TCS
  // --- Address & Contact tab + sub-section ---
  mailing: ["Party"], // tab (Address)
  contact: ["Party"], // Contact
  // --- Regional Details tab ---
  regional: ["Party"], // tab
};

// Keys carrying the group's ledger profile in a fetched ledger or group record.
export const LEDGER_GROUP_PROFILE_KEYS = [
  "ledGroupLedgerProfile",
  "led_group_ledger_profile",
  "accLedgerProfile",
  "acc_ledger_profile",
] as const;

// Field name(s) the form derives from the profile and renders read-only.
export const LEDGER_DERIVED_LOCKED_FIELDS = new Set<string>(["ledLedgerType"]);

// Map a raw server profile string to the enum (case/format tolerant), defaulting
// to General. Mirrors LedgerEntry::profileFromString.
export function normalizeLedgerProfile(raw: string): LedgerProfile {
  switch (raw.trim().toLowerCase().replace(/[\s_-]/g, "")) {
    case "tax":
      return "Tax";
    case "bank":
      return "Bank";
    case "party":
      return "Party";
    case "salespurchase":
      return "SalesPurchase";
    case "cash":
      return "Cash";
    default:
      return "General";
  }
}

// Ledger Type derived from the group profile (mirrors C++ ledgerTypeString).
export function ledgerTypeForProfile(profile: LedgerProfile): string {
  switch (profile) {
    case "Bank":
      return "BANK";
    case "Party":
      return "PARTY";
    case "Tax":
      return "TAX";
    case "Cash":
      return "CASH";
    case "SalesPurchase":
      return "EXPENSE";
    default:
      return "GENERAL";
  }
}

// Whether a section/sub-section/field key is visible for the given profile.
// Keys not in the visibility map are always visible.
export function isLedgerSectionVisibleForProfile(
  sectionKey: string,
  profile: LedgerProfile,
): boolean {
  const allowed = PROFILE_SECTION_VISIBILITY[sectionKey];
  if (!allowed) {
    return true;
  }
  return allowed.includes(profile);
}

// A tab is shown when its own key is visible AND at least one of its fields'
// sub-sections is visible. The second clause avoids empty tabs — e.g. a
// SalesPurchase ledger's GST tab, whose only relevant content (Supply Details)
// lives under the Identity tab, so every GST sub-section is hidden.
export function isLedgerTabVisibleForProfile(
  section: LedgerFormSection,
  profile: LedgerProfile,
): boolean {
  if (!isLedgerSectionVisibleForProfile(section.key, profile)) {
    return false;
  }
  return section.fields.some(
    (field) =>
      field.type !== "subheading" &&
      isLedgerSectionVisibleForProfile(field.sectionKey ?? section.key, profile),
  );
}

// The ordered list of items to render for a tab under the given profile: hidden
// fields are dropped, and a sub-heading is kept only when its own key is visible
// and it has at least one visible field beneath it (no orphan headings).
export function getVisibleLedgerSectionFields(
  section: LedgerFormSection,
  profile: LedgerProfile,
): LedgerFormField[] {
  const { fields } = section;
  const result: LedgerFormField[] = [];
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i];
    if (field.type === "subheading") {
      if (!isLedgerSectionVisibleForProfile(field.name, profile)) {
        continue;
      }
      let hasVisibleChild = false;
      for (let j = i + 1; j < fields.length; j += 1) {
        if (fields[j].type === "subheading") {
          break;
        }
        if (
          isLedgerSectionVisibleForProfile(fields[j].sectionKey ?? section.key, profile)
        ) {
          hasVisibleChild = true;
          break;
        }
      }
      if (hasVisibleChild) {
        result.push(field);
      }
      continue;
    }
    if (isLedgerSectionVisibleForProfile(field.sectionKey ?? section.key, profile)) {
      result.push(field);
    }
  }
  return result;
}
