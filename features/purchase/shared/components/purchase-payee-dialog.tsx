"use client";

/**
 * Who is owed an off-bill charge (Qt NexERP 88cd3f2, `PurchasePayeeDialog` —
 * one dialog for Purchase Entry and the GRN, as in Qt):
 * our own cost — unloading coolie and the like — owed to the loadmen, picked as
 * employees (dropdown 72 EMPLOYEES BY DESIGNATION, role LOADMAN at this
 * branch). The server splits the amount equally and owes each one on his own
 * staff ledger.
 */
import { useMemo, useState } from "react";
import { cx } from "@/components/design-system/cx";
import { NexDropdownMulti } from "@/components/design-system/dropdown";
import type { DropdownSelection } from "@/components/design-system/dropdown/types";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { useDropdownId } from "@/lib/configured-dropdowns";
import styles from "./purchase-dialogs.module.scss";

const CREW_EMPTY_PARAMS = ["iemp_branch_id", "iemp_role"] as const;
const LOADMAN_ROLE = "LOADMAN";

/** Keyed by the charge where it is placed: each opening starts from that charge's payees. */
export type PurchasePayeeDialogProps = {
  /** The charge being given payees; null = closed. */
  charge: { name: string; payees: DropdownSelection[] } | null;
  branchId: string;
  onClose: () => void;
  onPick: (payees: DropdownSelection[]) => void;
};

export function PurchasePayeeDialog({ charge, branchId, onClose, onPick }: PurchasePayeeDialogProps) {
  const crewDropdownId = useDropdownId("employeeByDesignation");
  const params = useMemo(() => ({ iemp_branch_id: branchId, iemp_role: LOADMAN_ROLE }), [branchId]);
  const [picked, setPicked] = useState<DropdownSelection[]>(() => charge?.payees ?? []);
  const name = charge?.name ?? "";
  return (
    <ModalShell
      title={`Payees — ${name}`}
      isOpen={charge !== null}
      narrow
      onClose={onClose}
      footer={
        <div className={styles.actions}>
          <button type="button" className={cx(quotationStyles.button, quotationStyles.buttonPrimary)} onClick={() => onPick(picked)}>
            OK
          </button>
          <button type="button" className={quotationStyles.button} onClick={onClose}>
            Cancel
          </button>
        </div>
      }
    >
      <div className={styles.payeeBody}>
        <p className={styles.hint}>
          Who is owed {name}? The amount is split equally; each is owed on his own staff ledger. Leave it empty to owe the
          charge&apos;s own ledger.
        </p>
        <NexDropdownMulti
          dropdownId={crewDropdownId}
          params={params}
          keepEmptyParams={CREW_EMPTY_PARAMS}
          value={picked}
          placeholder="Pick the loadmen"
          aria-label="Payees"
          onChange={setPicked}
        />
      </div>
    </ModalShell>
  );
}
