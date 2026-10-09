"use client";

import { useMemo, useState } from "react";

import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { useDropdownId } from "@/lib/configured-dropdowns";
import {
  headingOf,
  money,
  rowActive,
  rowBool,
  rowNum,
  rowText,
  safeWarnings,
  visibleRows,
  type GridRow,
} from "../domain/till-masters";
import type { TillTabApi } from "../use-till-tab";
import { Check, Facts, Field, NumberBox, Warning } from "./form-bits";
import { ListTable, type ListColumn } from "./list-table";
import styles from "../page.module.scss";

function overInsured(row: GridRow): boolean {
  const insured = rowNum(row, "tsf_insured_limit");
  return insured > 0 && rowNum(row, "balance") > insured;
}

const COLUMNS: readonly ListColumn[] = [
  { key: "code", label: "Code", text: (row) => rowText(row, "tsf_code") },
  { key: "name", label: "Name", text: (row) => rowText(row, "tsf_name") },
  { key: "ledger", label: "Ledger", stretch: true, text: (row) => rowText(row, "ledger_name") },
  { key: "insured", label: "Insured limit", align: "right", text: (row) => money(rowNum(row, "tsf_insured_limit")) },
  { key: "default", label: "Default", align: "center", text: (row) => (rowBool(row, "tsf_is_default") ? "★" : "") },
  { key: "counters", label: "Counters", align: "right", text: (row) => rowText(row, "counter_count") || "0" },
  {
    key: "balance",
    label: "Balance",
    align: "right",
    text: (row) => money(rowNum(row, "balance")),
    title: (row) => (overInsured(row) ? "Over the insured limit" : undefined),
    tone: (row) => (overInsured(row) ? "danger" : undefined),
  },
];

type Props = {
  t: TillTabApi<"safes">;
  companyId: string;
  canCreate: boolean;
  canEdit: boolean;
  hidden: boolean;
};

/**
 * Safes — where drawer cash goes. Balance, last count and last remit are grid
 * facts, never typed. One default per branch: Set default is the safe's own
 * save with the flag, and the server takes it off the old default.
 */
export function SafesTab({ t, companyId, canCreate, canEdit, hidden }: Props) {
  const [showInactive, setShowInactive] = useState(false);
  const ledgerDropdownId = useDropdownId("cashLedger");
  const ledgerParams = useMemo(() => ({ icompany_id: companyId }), [companyId]);

  const rows = useMemo(
    () => visibleRows("safes", t.rows, { search: "", showInactive, category: "" }),
    [t.rows, showInactive],
  );

  const form = t.form;
  const shown = t.shown;
  const editable = (t.isNew ? canCreate : canEdit) && !t.saving;
  const isDefault = shown ? rowBool(shown, "tsf_is_default") : false;
  const ids = "till-safe";

  return (
    <div className={styles.tabBody} hidden={hidden} role="tabpanel" aria-label="Safes">
      <section className={styles.listPane} aria-label="Safe list">
        <div className={styles.listHead}>
          <span className={styles.sectionCap}>Safes</span>
        </div>
        <ListTable
          label="Safes"
          columns={COLUMNS}
          rows={rows}
          rowKey={(row) => rowText(row, "tsf_id")}
          selectedId={t.shownId}
          onSelect={(id) => void t.select(id)}
          muted={(row) => !rowActive("safes", row)}
          loading={t.loading}
          error={t.error}
          onRetry={t.refetch}
          emptyText="No safes in this branch yet — New adds the first, and it becomes the default."
        />
        <Check label="Show inactive" checked={showInactive} onChange={setShowInactive} />
        <div className={styles.listButtons}>
          <button type="button" className={styles.secondaryButton} disabled={!canCreate} onClick={() => void t.startNew()} title="F2">
            New<span className={styles.keyHint}>F2</span>
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={!canEdit || t.isNew || !t.storedActive || t.saving}
            onClick={() => void t.setActive(false)}
          >
            Deactivate
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={!canEdit || t.isNew || t.storedActive || t.saving}
            onClick={() => void t.setActive(true)}
          >
            Reactivate
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={!canEdit || t.isNew || !t.storedActive || isDefault || t.saving}
            onClick={() => void t.setDefaultSafe()}
          >
            Set default
          </button>
        </div>
        <p className={styles.mutedNote}>Balance is derived (movements), never stored. Red = over the insured limit.</p>
      </section>

      <section className={styles.formPane} aria-label="Safe">
        <div className={styles.formHead}>
          <span className={styles.formTitle}>{headingOf("safes", shown)}</span>
          {isDefault ? <span className={styles.pill}>DEFAULT</span> : null}
        </div>

        <span className={styles.sectionCap}>Safe</span>
        <div className={styles.fields}>
          <Field id={`${ids}-code`} label="Code" required>
            <input
              id={`${ids}-code`}
              className={styles.textInput}
              maxLength={20}
              value={form.code}
              disabled={!editable}
              onChange={(event) => t.update({ code: event.target.value })}
            />
          </Field>
          <Check
            label="Default safe of the branch"
            checked={form.isDefault}
            disabled={!editable}
            onChange={(value) => t.update({ isDefault: value })}
            span="pair"
          />
          <Field id={`${ids}-name`} label="Name" required wide>
            <input
              id={`${ids}-name`}
              className={styles.textInput}
              maxLength={100}
              value={form.name}
              disabled={!editable}
              onChange={(event) => t.update({ name: event.target.value })}
            />
          </Field>
          <Field id={`${ids}-ledger`} label="Ledger" required wide>
            <NexDropdownSingle
              id={`${ids}-ledger`}
              dropdownId={ledgerDropdownId}
              params={ledgerParams}
              clearOnParamsChange={false}
              value={form.ledgerId ? { id: form.ledgerId, text: form.ledgerName } : null}
              onChange={(selection) => t.update({ ledgerId: selection?.id ?? "", ledgerName: selection?.text ?? "" })}
              disabled={!editable}
              placeholder="Pick a cash ledger"
              aria-label="Ledger"
              className={styles.dropdown}
              advanceFocusOnSelect={false}
            />
          </Field>
          <p className={`${styles.mutedNote} ${styles.fieldFull}`}>
            only cash ledgers of this company (and shared ones)
          </p>
          <Field id={`${ids}-insured`} label="Insured limit">
            <NumberBox
              id={`${ids}-insured`}
              value={form.insuredLimit}
              disabled={!editable}
              onChange={(value) => t.update({ insuredLimit: value })}
            />
          </Field>
          <Check label="Active" checked={form.active} disabled={!editable} onChange={(active) => t.update({ active })} span="pair" />
          <Field id={`${ids}-remarks`} label="Remarks" wide>
            <input
              id={`${ids}-remarks`}
              className={styles.textInput}
              maxLength={250}
              value={form.remarks}
              disabled={!editable}
              onChange={(event) => t.update({ remarks: event.target.value })}
            />
          </Field>
        </div>

        <span className={styles.sectionCap}>
          Facts <span className={styles.capNote}>read-only</span>
        </span>
        <Facts
          items={[
            {
              label: "Balance",
              value: shown ? money(rowNum(shown, "balance")) : "—",
              tone: shown && overInsured(shown) ? "danger" : undefined,
            },
            { label: "Last count", value: rowText(shown, "last_count") || "—" },
            { label: "Last remit", value: rowText(shown, "last_remit") || "—" },
            { label: "Counters", value: rowText(shown, "counter_codes") || "—" },
          ]}
        />
        <Warning lines={safeWarnings(form, shown)} />
      </section>
    </div>
  );
}
