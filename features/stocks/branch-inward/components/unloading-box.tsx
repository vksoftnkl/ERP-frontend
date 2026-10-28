"use client";

/**
 * The Unloading box (3.0, notes 153/156): crew by designation (dropdown 72) and
 * the unload rate (a column on the grid, shown while this is ticked). The
 * charge is qty × rate — shown here, never sent: the server computes it and
 * posts it with the receipt, at this (the receiving) branch. A reopened receipt
 * shows the charge it posted.
 */
import { DateTimeInput } from "@/components/design-system/ui/date-input";
import { useMemo } from "react";
import { NexDropdownMulti, NexDropdownSingle } from "@/components/design-system/dropdown";
import { useDropdownId } from "@/lib/configured-dropdowns";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { CREW_DROPDOWN_KEY, SUPERVISOR_ROLE, UNLOADMAN_ROLE } from "../branch-inward.constants";
import type { InwardDraft } from "../branch-inward.types";
import type { BranchInwardDraftApi } from "../use-branch-inward-draft";
import styles from "../page.module.scss";

export function UnloadingBox({
  draft,
  editable,
  charge,
  patch,
}: {
  draft: InwardDraft;
  editable: boolean;
  /** The charge text (money). */
  charge: string;
  patch: BranchInwardDraftApi["patchUnloading"];
}) {
  const crewDropdownId = useDropdownId(CREW_DROPDOWN_KEY);
  // Employees of the designation (all while nobody holds it); both always sent.
  const manParams = useMemo(
    () => ({ iemp_branch_id: draft.branchId, iemp_role: UNLOADMAN_ROLE }),
    [draft.branchId],
  );
  const supervisorParams = useMemo(
    () => ({ iemp_branch_id: draft.branchId, iemp_role: SUPERVISOR_ROLE }),
    [draft.branchId],
  );
  const open = draft.unloadEnabled;
  const fieldsOff = !editable || !open;

  return (
    <section
      className={styles.card}
      aria-label="Unloading"
      title="Crew and unloading charge (qty × Unload ₹/unit). Posts with the receipt, at this branch."
    >
      <label className={styles.unloadTitle}>
        <input
          type="checkbox"
          checked={open}
          disabled={!editable}
          onChange={(event) => patch({ unloadEnabled: event.target.checked })}
        />
        Unloading
      </label>
      <div className={styles.unloadGrid}>
        <label className={quotationStyles.label} htmlFor="branch-inward-unload-at">
          On
        </label>
        <DateTimeInput
          id="branch-inward-unload-at"
          className={quotationStyles.input}
          value={draft.unloadAt}
          disabled={fieldsOff}
          onChange={(value) => patch({ unloadAt: value })}
        />
        <label className={quotationStyles.label} htmlFor="branch-inward-unloadman">
          Unloadman
        </label>
        <NexDropdownMulti
          id="branch-inward-unloadman"
          dropdownId={crewDropdownId}
          params={manParams}
          value={draft.unloadmen}
          onChange={(unloadmen) => patch({ unloadmen })}
          disabled={fieldsOff}
          placeholder="Who unloaded"
          aria-label="Unloadman"
        />
        <label className={quotationStyles.label} htmlFor="branch-inward-unload-supervisor">
          Supervisor
        </label>
        <NexDropdownSingle
          id="branch-inward-unload-supervisor"
          dropdownId={crewDropdownId}
          params={supervisorParams}
          clearOnParamsChange={false}
          value={draft.unloadSupervisor}
          onChange={(unloadSupervisor) => patch({ unloadSupervisor })}
          disabled={fieldsOff}
          placeholder="Who supervised"
          aria-label="Supervisor"
        />
        <label className={quotationStyles.label} htmlFor="branch-inward-unload-charge">
          Charge
        </label>
        <input
          id="branch-inward-unload-charge"
          className={`${quotationStyles.input} ${quotationStyles.inputReadOnly} ${styles.chargeBox}`}
          value={open ? charge : ""}
          readOnly
          tabIndex={-1}
        />
      </div>
    </section>
  );
}
