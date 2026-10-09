"use client";

import { useMemo, useState } from "react";

import type { TillDenomination } from "@/store/api/tillApi";
import {
  denominationLocked,
  denominationReadOnly,
  denominationWarnings,
  displayDate,
  headingOf,
  money,
  rowActive,
  rowBool,
  rowNum,
  rowText,
  visibleRows,
} from "../domain/till-masters";
import type { TillTabApi } from "../use-till-tab";
import { Check, Field, NumberBox, Warning } from "./form-bits";
import { ListTable, type ListColumn } from "./list-table";
import styles from "../page.module.scss";

const COLUMNS: readonly ListColumn[] = [
  { key: "kind", label: "Kind", text: (row) => rowText(row, "tdn_kind") },
  { key: "value", label: "Value", align: "right", text: (row) => money(rowNum(row, "tdn_value")) },
  { key: "label", label: "Label", stretch: true, text: (row) => rowText(row, "tdn_label") },
  { key: "bundle", label: "Bundle", align: "right", text: (row) => rowText(row, "tdn_bundle_qty") },
  { key: "sort", label: "Sort", align: "right", text: (row) => rowText(row, "tdn_sort_order") },
  { key: "validTo", label: "Valid to", text: (row) => displayDate(rowText(row, "tdn_valid_to")) },
  { key: "scope", label: "Scope", text: (row) => (rowBool(row, "shipped") ? "SHARED" : "COMPANY") },
  { key: "status", label: "Status", text: (row) => (rowActive("denominations", row) ? "Active" : "Inactive") },
];

type Props = {
  t: TillTabApi<"denominations">;
  preview: readonly TillDenomination[];
  previewLoading: boolean;
  canCreate: boolean;
  canEdit: boolean;
  hidden: boolean;
};

/**
 * Denominations — every count grid is built from them. Shipped rows are
 * shared and read-only; value, kind and currency lock once a count used the
 * row. The preview is the server's own list: what Open Session and End Shift
 * will offer.
 */
export function DenominationsTab({ t, preview, previewLoading, canCreate, canEdit, hidden }: Props) {
  const [showInactive, setShowInactive] = useState(false);
  const rows = useMemo(
    () => visibleRows("denominations", t.rows, { search: "", showInactive, category: "" }),
    [t.rows, showInactive],
  );

  const form = t.form;
  const shown = t.shown;
  const readOnly = denominationReadOnly(shown);
  const locked = readOnly || denominationLocked(shown);
  const editable = (t.isNew ? canCreate : canEdit) && !readOnly && !t.saving;
  const ids = "till-denomination";

  return (
    <div className={`${styles.tabBody} ${styles.tabBodyDenominations}`} hidden={hidden} role="tabpanel" aria-label="Denominations">
      <section className={styles.listPane} aria-label="Denomination list">
        <div className={styles.listHead}>
          <span className={styles.sectionCap}>Notes and coins</span>
        </div>
        <ListTable
          label="Denominations"
          columns={COLUMNS}
          rows={rows}
          rowKey={(row) => rowText(row, "tdn_id")}
          selectedId={t.shownId}
          onSelect={(id) => void t.select(id)}
          muted={(row) => !rowActive("denominations", row)}
          loading={t.loading}
          error={t.error}
          onRetry={t.refetch}
          emptyText="No notes or coins."
        />
        <Check label="Show inactive" checked={showInactive} onChange={setShowInactive} />
        <div className={styles.listButtons}>
          <button type="button" className={styles.secondaryButton} disabled={!canCreate} onClick={() => void t.startNew()} title="F2">
            New<span className={styles.keyHint}>F2</span>
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={!canEdit || t.isNew || !t.storedActive || readOnly || t.saving}
            onClick={() => void t.setActive(false)}
          >
            Deactivate
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={!canEdit || t.isNew || t.storedActive || readOnly || t.saving}
            onClick={() => void t.setActive(true)}
          >
            Reactivate
          </button>
        </div>
        <p className={styles.mutedNote}>Shipped rows are shared by every company; add your own for anything else.</p>
      </section>

      <section className={styles.formPane} aria-label="Denomination">
        <div className={styles.formHead}>
          <span className={styles.formTitle}>{headingOf("denominations", shown)}</span>
        </div>
        <div className={styles.fields}>
          <Field id={`${ids}-currency`} label="Currency">
            <input
              id={`${ids}-currency`}
              className={styles.textInput}
              maxLength={3}
              value={form.currency}
              disabled={!editable || locked}
              onChange={(event) => t.update({ currency: event.target.value.toUpperCase() })}
            />
          </Field>
          <Field id={`${ids}-value`} label="Value">
            <NumberBox
              id={`${ids}-value`}
              value={form.value}
              max={1000000}
              disabled={!editable || locked}
              onChange={(value) => t.update({ value })}
            />
          </Field>
          <Field label="Kind" wide>
            <div className={styles.radioRow} role="radiogroup" aria-label="Kind">
              {(["NOTE", "COIN"] as const).map((kind) => (
                <label key={kind} className={styles.radioLine}>
                  <input
                    type="radio"
                    name={`${ids}-kind`}
                    checked={form.kind === kind}
                    disabled={!editable || locked}
                    onChange={() => t.update({ kind })}
                  />
                  {kind === "NOTE" ? "Note" : "Coin"}
                </label>
              ))}
            </div>
          </Field>
          <Field id={`${ids}-label`} label="Label" required wide>
            <input
              id={`${ids}-label`}
              className={styles.textInput}
              maxLength={20}
              value={form.label}
              // "₹500" is the operator's own spelling: the app-wide case rewrite leaves it alone.
              data-uppercase="off"
              disabled={!editable}
              onChange={(event) => t.update({ label: event.target.value })}
            />
          </Field>
          <Field id={`${ids}-bundle`} label="Bundle qty">
            <NumberBox
              id={`${ids}-bundle`}
              value={form.bundleQty}
              decimals={0}
              max={100000}
              disabled={!editable}
              onChange={(value) => t.update({ bundleQty: value })}
            />
          </Field>
          <Field id={`${ids}-sort`} label="Sort order">
            <NumberBox
              id={`${ids}-sort`}
              value={form.sortOrder}
              decimals={0}
              max={9999}
              disabled={!editable}
              onChange={(value) => t.update({ sortOrder: value })}
            />
          </Field>
          <Field id={`${ids}-valid-to`} label="Valid to" wide>
            <div className={styles.inlineRow}>
              <input
                type="checkbox"
                aria-label="Has a valid-to date"
                checked={form.hasValidTo}
                disabled={!editable}
                onChange={(event) => t.update({ hasValidTo: event.target.checked })}
              />
              <input
                id={`${ids}-valid-to`}
                type="date"
                className={styles.textInput}
                value={form.validTo}
                disabled={!editable || !form.hasValidTo}
                onChange={(event) => t.update({ validTo: event.target.value })}
              />
            </div>
          </Field>
          <Check label="Active" checked={form.active} disabled={!editable} onChange={(active) => t.update({ active })} span="full" />
        </div>
        {denominationLocked(shown) && !readOnly ? (
          <p className={styles.mutedNote}>Value, kind and currency are fixed once used in a count.</p>
        ) : null}
        <Warning lines={denominationWarnings(shown)} />
      </section>

      <section className={styles.previewPane} aria-label="Count grid preview">
        <span className={styles.sectionCap}>How the count grid will look</span>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.stretch}>Denomination</th>
                <th className={styles.alignRight}>Qty</th>
                <th className={styles.alignRight}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((entry) => (
                <tr key={entry.tdnId}>
                  <td>{entry.tdnLabel}</td>
                  <td className={styles.alignRight} />
                  <td className={styles.alignRight} />
                </tr>
              ))}
            </tbody>
          </table>
          {preview.length === 0 ? (
            <div className={styles.tableEmpty}>{previewLoading ? "Loading…" : "Nothing would be offered."}</div>
          ) : null}
        </div>
        <p className={styles.mutedNote}>the server&apos;s own list: active, still valid, in sort order</p>
      </section>
    </div>
  );
}
