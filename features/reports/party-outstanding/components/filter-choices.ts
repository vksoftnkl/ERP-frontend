"use client";
/**
 * What More filters (F8) is built from: the draft it edits, and the lists its
 * combos offer. The combos are the house `SearchableSelect` over THIS
 * feature's `/options` and, for Ledger name, its own `/parties`
 * (`query/party-choices.ts`). No dropdown id, no grid runner.
 */
import { useMemo } from "react";
import type { ReportFilters } from "../query/params";
import type { PartyChoice } from "../query/party-choices";
import type { OptionsPayload } from "../wire/types";

/** What More filters edits: the report filters, with Buckets as typed. */
export type Draft = Omit<ReportFilters, "buckets"> & { bucketsText: string };

export const AS_ON_TIP =
  "As on decides the year, the bills, what is pending and every age. Figures are as the books stand today: " +
  "a receipt cancelled later changes an earlier date's figure.";

export const DEFAULT_GROUP = "";
export const ALL_BRANCHES = "all";
export const ALL_PARTIES = "";

export const BUCKETS_TIP = "Rising whole numbers of days: 30 60 90 180 gives 0–30 · 31–60 · 61–90 · 91–180 · > 180.";

/** The four switches, with their tips. */
export const SWITCHES: ReadonlyArray<{
  key: "onlyOverdue" | "includeOnAccount" | "deductPdc" | "hideZero";
  label: string;
  tip: string;
}> = [
  { key: "onlyOverdue", label: "Only overdue", tip: "Parties with something overdue; on the bills, overdue bills only." },
  {
    key: "includeOnAccount",
    label: "Show on-account / advances",
    tip: "Advances, returns and unadjusted notes. Off drops them from every figure.",
  },
  { key: "deductPdc", label: "Deduct PDC", tip: "Subtract post-dated cheques in hand (not yet effective) from Net." },
  { key: "hideZero", label: "Hide zero balance", tip: "Drop parties with nothing pending either way on As on." },
];

/** The Ledger name combo's list, fetched on its first open. */
export type PartyPicker = {
  choices: PartyChoice[] | null;
  loading: boolean;
  error: string | null;
  truncated: boolean;
  /** The picked party's name when the list has not been loaded (a link, a Back). */
  currentName: string | null;
  request: () => void;
};

export type FallbackBranches = ReadonlyArray<{ value: string; label: string }>;

/** The combos' lists. Until `/options` answers, the session's branches stand in. */
export function useFilterChoices(
  draft: Draft,
  options: OptionsPayload | null,
  fallbackBranches: FallbackBranches,
  party: PartyPicker,
) {
  const receivable = draft.side === "RECEIVABLE";

  const groupOptions = useMemo(() => {
    const groups = options?.groups ?? [];
    return groups.map((group, i) => {
      const hasChildren = (groups[i + 1]?.depth ?? -1) > group.depth;
      const indent = "   ".repeat(Math.max(0, group.depth));
      const label = `${indent}${group.name}${hasChildren ? "  (+ sub-groups)" : ""}`;
      return { value: group.isDefault ? DEFAULT_GROUP : group.groupId, label };
    });
  }, [options]);
  // Before /options, the default group still reads as itself.
  const groupChoices = groupOptions.length
    ? groupOptions
    : [{ value: DEFAULT_GROUP, label: receivable ? "Sundry Debtors  (+ sub-groups)" : "Sundry Creditors  (+ sub-groups)" }];

  const areaOptions = useMemo(
    () => [{ value: "", label: "All areas" }, ...(options?.areas ?? []).map((a) => ({ value: a.areaId, label: a.name }))],
    [options],
  );
  const partyOptions = useMemo(() => {
    const list = party.choices ?? [];
    const picked = draft.partyId;
    const head = [{ value: ALL_PARTIES, label: "All ledgers" }];
    if (picked && !list.some((choice) => choice.partyId === picked)) {
      head.push({ value: picked, label: party.currentName || "(the ledger in the link)" });
    }
    return [...head, ...list.map((choice) => ({ value: choice.partyId, label: choice.name }))];
  }, [draft.partyId, party.choices, party.currentName]);
  const partyEmpty = party.error
    ? `The ledgers could not be loaded: ${party.error}`
    : party.loading || !party.choices
      ? "Loading ledgers…"
      : "No ledger matches.";
  const partyTip = party.truncated
    ? "Only the first ledgers A–Z are listed. Narrow Group, Area or Branch to find the rest. Ctrl+F opens this list."
    : "The ledgers of this report, by ledger name A–Z. Ctrl+F opens this list.";

  const branchOptions = useMemo(
    () =>
      options
        ? options.branches.map((b) => ({ value: b.branchId, label: b.name }))
        : fallbackBranches.map((b) => ({ value: b.value, label: b.label })),
    [fallbackBranches, options],
  );

  return { groupChoices, areaOptions, partyOptions, partyEmpty, partyTip, branchOptions };
}
