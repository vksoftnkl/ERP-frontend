"use client";

import { useMemo, useState } from "react";

import { cx } from "@/components/design-system/cx";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { useDropdownId } from "@/lib/configured-dropdowns";
import {
  LEDGER_CATEGORIES,
  REASON_CATEGORIES,
  VOID_MODULE_CATEGORIES,
  headingOf,
  money,
  reasonCategoryCounts,
  reasonReadOnly,
  reasonWarnings,
  rowActive,
  rowBool,
  rowNum,
  rowText,
  visibleRows,
  type GridRow,
} from "../domain/till-masters";
import type { TillTabApi } from "../use-till-tab";
import { Check, Facts, Field, NumberBox, Warning } from "./form-bits";
import { ListTable, type ListColumn } from "./list-table";
import styles from "../page.module.scss";

const COLUMNS: readonly ListColumn[] = [
  { key: "code", label: "Code", text: (row) => rowText(row, "trs_code") },
  { key: "name", label: "Name", stretch: true, text: (row) => rowText(row, "trs_name") },
  { key: "ledger", label: "Default ledger", text: (row) => rowText(row, "ledger_name") || "—" },
  { key: "note", label: "Note", align: "center", text: (row) => (rowBool(row, "trs_needs_note") ? "✓" : "") },
  { key: "ref", label: "Ref", align: "center", text: (row) => (rowBool(row, "trs_needs_ref") ? "✓" : "") },
  {
    key: "cap",
    label: "Cap",
    align: "right",
    text: (row) => (rowNum(row, "trs_max_amount") > 0 ? money(rowNum(row, "trs_max_amount")) : "0"),
  },
  { key: "scope", label: "Scope", text: (row) => (rowBool(row, "shipped") ? "SHARED" : "COMPANY") },
  {
    key: "status",
    label: "Status",
    text: (row) => (rowBool(row, "overridden") ? "Replaced" : rowActive("reasons", row) ? "Active" : "Inactive"),
  },
];

type Props = {
  t: TillTabApi<"reasons">;
  companyId: string;
  category: string;
  onCategoryChange: (category: string) => void;
  canCreate: boolean;
  canEdit: boolean;
  hidden: boolean;
};

/**
 * Reasons — picked on the till, never typed. Categories down the side.
 * Shipped rows (company NULL) are read-only and shared by every company;
 * "Copy shipped to edit" makes the company's own row with the same code, which
 * then replaces the shipped one for this company.
 */
export function ReasonsTab({ t, companyId, category, onCategoryChange, canCreate, canEdit, hidden }: Props) {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const ledgerDropdownId = useDropdownId("tillReasonLedger");
  const ledgerParams = useMemo(() => ({ icompany_id: companyId }), [companyId]);

  const counts = useMemo(() => reasonCategoryCounts(t.rows), [t.rows]);
  const rows = useMemo(
    () => visibleRows("reasons", t.rows, { search, showInactive, category }),
    [t.rows, search, showInactive, category],
  );

  const form = t.form;
  const shown = t.shown;
  const readOnly = reasonReadOnly(shown);
  const editable = (t.isNew ? canCreate : canEdit) && !readOnly && !t.saving;
  const ledgerMeans = LEDGER_CATEGORIES.includes(form.category);
  const shipped = shown ? rowBool(shown, "shipped") : false;
  const ids = "till-reason";

  const heading = t.copyOf ? `Copy of ${t.copyOf}` : headingOf("reasons", shown);
  const used = shown ? `${rowText(shown, "used_30d") || "0"} lines · ${money(rowNum(shown, "used_amount_30d"))}` : "—";

  return (
    <div className={cx(styles.tabBody, styles.tabBodyReasons)} hidden={hidden} role="tabpanel" aria-label="Reasons">
      <section className={styles.categoryPane} aria-label="Reason categories">
        <span className={styles.sectionCap}>Category</span>
        <ul className={styles.categoryList} role="listbox" aria-label="Category">
          {REASON_CATEGORIES.map((entry) => (
            <li key={entry}>
              <button
                type="button"
                role="option"
                aria-selected={entry === category}
                className={cx(
                  styles.categoryItem,
                  entry === category && styles.categoryItemActive,
                  VOID_MODULE_CATEGORIES.includes(entry) && styles.categoryReserved,
                )}
                onClick={() => onCategoryChange(entry)}
              >
                <span>{entry}</span>
                <span className={styles.categoryCount}>{counts[entry] ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className={styles.mutedNote}>grey = reserved for the void module</p>
      </section>

      <section className={styles.listPane} aria-label="Reason list">
        <div className={styles.listHead}>
          <span className={styles.sectionCap}>{category}</span>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search reasons"
          />
        </div>
        <ListTable
          label="Reasons"
          columns={COLUMNS}
          rows={rows}
          rowKey={(row) => rowText(row, "trs_id")}
          selectedId={t.shownId}
          onSelect={(id) => void t.select(id)}
          muted={(row: GridRow) => !rowActive("reasons", row) || rowBool(row, "overridden")}
          loading={t.loading}
          error={t.error}
          onRetry={t.refetch}
          emptyText="No reasons in this category."
        />
        <Check label="Show inactive and replaced" checked={showInactive} onChange={setShowInactive} />
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
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={!canCreate || t.isNew || !shipped || rowBool(shown, "overridden")}
            onClick={t.copyShipped}
          >
            Copy shipped to edit
          </button>
        </div>
        <p className={styles.mutedNote}>
          SHARED rows are shipped and locked. Copy one to change it: the company&apos;s own row then replaces it for this
          company.
        </p>
      </section>

      <section className={styles.formPane} aria-label="Reason">
        <div className={styles.formHead}>
          <span className={styles.formTitle}>{heading}</span>
          <span className={styles.pill}>{shipped ? "SHARED" : "COMPANY"}</span>
        </div>

        <div className={styles.fields}>
          <Field id={`${ids}-category`} label="Category" wide>
            {/* Chosen once: a reason that moves category is a different reason. */}
            <select
              id={`${ids}-category`}
              className={styles.selectInput}
              value={form.category}
              disabled={!editable || !t.isNew}
              onChange={(event) => t.update({ category: event.target.value })}
            >
              {REASON_CATEGORIES.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </Field>
          <Field id={`${ids}-code`} label="Code" required>
            <input
              id={`${ids}-code`}
              className={styles.textInput}
              maxLength={30}
              value={form.code}
              disabled={!editable}
              // The code is the key a copy overrides by: fixed once saved.
              readOnly={!t.isNew}
              onChange={(event) => t.update({ code: event.target.value })}
            />
          </Field>
          <Field id={`${ids}-name`} label="Name" required>
            <input
              id={`${ids}-name`}
              className={styles.textInput}
              maxLength={100}
              value={form.name}
              disabled={!editable}
              onChange={(event) => t.update({ name: event.target.value })}
            />
          </Field>
          <Field id={`${ids}-ledger`} label="Default ledger" wide>
            <div className={styles.inlineRow}>
              <NexDropdownSingle
                id={`${ids}-ledger`}
                dropdownId={ledgerDropdownId}
                params={ledgerParams}
                clearOnParamsChange={false}
                value={form.ledgerId ? { id: form.ledgerId, text: form.ledgerName } : null}
                onChange={(selection) => t.update({ ledgerId: selection?.id ?? "", ledgerName: selection?.text ?? "" })}
                disabled={!editable || !ledgerMeans}
                placeholder="None — picked on the voucher"
                aria-label="Default ledger"
                className={styles.dropdown}
                advanceFocusOnSelect={false}
              />
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={!editable || !ledgerMeans || !form.ledgerId}
                onClick={() => t.update({ ledgerId: "", ledgerName: "" })}
              >
                Clear
              </button>
            </div>
          </Field>
          <Check
            label="Note required"
            checked={form.needsNote}
            disabled={!editable}
            onChange={(needsNote) => t.update({ needsNote })}
            span="full"
          />
          <Check
            label="Ref no required (supplier bill / voucher no)"
            checked={form.needsRef}
            disabled={!editable}
            onChange={(needsRef) => t.update({ needsRef })}
            span="full"
          />
          <Field id={`${ids}-cap`} label="Cap">
            <NumberBox id={`${ids}-cap`} value={form.maxAmount} disabled={!editable} onChange={(value) => t.update({ maxAmount: value })} />
          </Field>
          <p className={`${styles.mutedNote} ${styles.fieldPair}`}>one movement above it is refused · 0 = none</p>
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
          <Check label="Active" checked={form.active} disabled={!editable} onChange={(active) => t.update({ active })} span="pair" />
        </div>

        <Facts items={[{ label: "Used (30 days)", value: used }]} />
        <Warning lines={reasonWarnings(form, shown)} />
      </section>
    </div>
  );
}
