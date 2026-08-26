"use client";

import { useGetBranchesByCompanyQuery, useGetCompanyListQuery } from "@/store/api/businessContextApi";
import { useGetCounterOptionsQuery } from "@/store/api/appSettingsApi";
import { isCounterWithoutBranch } from "../lib/scope";
import type { EditableScope, ScopeTarget } from "../types";
import ScopeChip from "./scope-chip";
import styles from "../page.module.scss";

const ALL_BRANCHES = "";
const ALL_COUNTERS = "";

/**
 * Which layer is being edited, chosen by naming the target rather than the
 * level:
 *
 *   all branches + all counters -> the company
 *   a branch     + all counters -> that branch
 *   a branch     + a counter    -> that counter
 *
 * The company opens on the session's own and shows its NAME — the Qt screen
 * showed the literal words "Current company", which says nothing about which
 * company is being edited.
 */
export default function ScopeBar({
  target,
  scope,
  search,
  changedOnly,
  onTargetChange,
  onSearchChange,
  onChangedOnlyChange,
}: {
  target: ScopeTarget;
  scope: EditableScope;
  search: string;
  changedOnly: boolean;
  onTargetChange: (next: ScopeTarget) => void;
  onSearchChange: (next: string) => void;
  onChangedOnlyChange: (next: boolean) => void;
}) {
  const { data: companies = [], isFetching: companiesLoading } = useGetCompanyListQuery();
  const { data: branches = [], isFetching: branchesLoading } = useGetBranchesByCompanyQuery(
    target.companyId ?? "",
    { skip: !target.companyId },
  );
  const { data: counters = [], isFetching: countersLoading } = useGetCounterOptionsQuery();

  // A company change repopulates both of the layers under it; neither id
  // survives it, because a branch of the old company is not a branch of the new
  // one and would write an override on somebody else's target.
  const changeCompany = (companyId: string) =>
    onTargetChange({ companyId: companyId || null, branchId: null, deviceId: null });

  // A counter belongs to a branch, so widening back to "all branches" drops it
  // rather than leaving an incoherent bar behind.
  const changeBranch = (branchId: string) =>
    onTargetChange({ ...target, branchId: branchId || null, deviceId: null });

  const changeCounter = (deviceId: string) =>
    onTargetChange({ ...target, deviceId: deviceId || null });

  return (
    <div className={styles.scopeBar}>
      <div className={styles.scopeFields}>
        <label className={styles.scopeField}>
          <span className={styles.scopeFieldLabel}>Company</span>
          <select
            className={styles.scopeSelect}
            value={target.companyId ?? ""}
            disabled={companiesLoading && companies.length === 0}
            onChange={(event) => changeCompany(event.target.value)}
          >
            {target.companyId && !companies.some((company) => company.id === target.companyId) ? (
              // The session's own company, held before the lookup lands — the
              // first read must not wait on it.
              <option value={target.companyId}>Current company</option>
            ) : null}
            {companies.length === 0 ? <option value="">Select company</option> : null}
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.scopeField}>
          <span className={styles.scopeFieldLabel}>Branch</span>
          <select
            className={styles.scopeSelect}
            value={target.branchId ?? ALL_BRANCHES}
            disabled={!target.companyId || (branchesLoading && branches.length === 0)}
            onChange={(event) => changeBranch(event.target.value)}
          >
            <option value={ALL_BRANCHES}>All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.scopeField}>
          <span className={styles.scopeFieldLabel}>Counter</span>
          <select
            className={styles.scopeSelect}
            value={target.deviceId ?? ALL_COUNTERS}
            disabled={!target.branchId || (countersLoading && counters.length === 0)}
            title={
              target.branchId
                ? "Every till on the installation — the lookup cannot be filtered by company yet"
                : "Choose a branch first — a counter belongs to one"
            }
            onChange={(event) => changeCounter(event.target.value)}
          >
            <option value={ALL_COUNTERS}>All counters</option>
            {counters.map((counter) => (
              <option key={counter.id} value={counter.id}>
                {counter.name}
              </option>
            ))}
          </select>
        </label>

        <ScopeChip scope={scope} />
      </div>

      <div className={styles.scopeFilters}>
        <input
          type="search"
          role="searchbox"
          className={styles.scopeSearch}
          placeholder="Search settings"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <label className={styles.scopeToggle} title="Only settings that are not at their default">
          <input
            type="checkbox"
            checked={changedOnly}
            onChange={(event) => onChangedOnlyChange(event.target.checked)}
          />
          Changed only
        </label>
      </div>

      {isCounterWithoutBranch(target) ? (
        <p className={styles.scopeWarning}>
          A counter belongs to a branch — choose one, or the counter is ignored and the company
          layer is edited.
        </p>
      ) : null}
    </div>
  );
}
