"use client";

import { useMemo, useState } from "react";

import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { useDropdownId } from "@/lib/configured-dropdowns";
import {
  COUNTER_KINDS,
  DRAWER_MODES,
  counterWarnings,
  headingOf,
  liveSessionNo,
  money,
  rowActive,
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
  { key: "code", label: "Code", text: (row) => rowText(row, "tcn_code") },
  { key: "name", label: "Name", stretch: true, text: (row) => rowText(row, "tcn_name") },
  { key: "kind", label: "Kind", text: (row) => rowText(row, "tcn_kind") },
  { key: "device", label: "Device", text: (row) => rowText(row, "device_name") || "—" },
  { key: "drawer", label: "Drawer", text: (row) => rowText(row, "tcn_drawer_mode") },
  { key: "float", label: "Float", align: "right", text: (row) => money(rowNum(row, "tcn_default_float")) },
  { key: "live", label: "Live session", text: (row) => rowText(row, "live_session_no") || "—" },
  { key: "status", label: "Status", text: (row) => (rowActive("counters", row) ? "Active" : "Inactive") },
];

type Props = {
  t: TillTabApi<"counters">;
  companyId: string;
  branchId: string;
  canCreate: boolean;
  canEdit: boolean;
  hidden: boolean;
};

/**
 * Counters — the lane a session is opened on. While a session is live the
 * device and drawer are locked (the server refuses a device change between
 * sessions only), and the counter cannot be deactivated mid-shift.
 */
export function CountersTab({ t, companyId, branchId, canCreate, canEdit, hidden }: Props) {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const deviceDropdownId = useDropdownId("tillDevice");
  const safeDropdownId = useDropdownId("tillSafe");

  const rows = useMemo(
    () => visibleRows("counters", t.rows, { search, showInactive, category: "" }),
    [t.rows, search, showInactive],
  );
  // The device list leaves out devices linked to OTHER counters, so it needs this one's id.
  const deviceParams = useMemo(
    () => ({ ibranch_id: branchId, icounter_id: t.shownId ?? "" }),
    [branchId, t.shownId],
  );
  const safeParams = useMemo(() => ({ icompany_id: companyId, ibranch_id: branchId }), [companyId, branchId]);

  const form = t.form;
  const live = liveSessionNo(t.shown);
  const editable = (t.isNew ? canCreate : canEdit) && !t.saving;
  const ids = "till-counter";

  return (
    <div className={styles.tabBody} hidden={hidden} role="tabpanel" aria-label="Counters">
      <section className={styles.listPane} aria-label="Counter list">
        <div className={styles.listHead}>
          <span className={styles.sectionCap}>Counters</span>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search counters"
          />
        </div>
        <ListTable
          label="Counters"
          columns={COLUMNS}
          rows={rows}
          rowKey={(row) => rowText(row, "tcn_id")}
          selectedId={t.shownId}
          onSelect={(id) => void t.select(id)}
          muted={(row: GridRow) => !rowActive("counters", row)}
          loading={t.loading}
          error={t.error}
          onRetry={t.refetch}
          emptyText="No counters in this branch yet — New adds the first."
        />
        <Check label="Show inactive" checked={showInactive} onChange={setShowInactive} />
        <div className={styles.listButtons}>
          <button type="button" className={styles.secondaryButton} disabled={!canCreate} onClick={() => void t.startNew()} title="F2">
            New<span className={styles.keyHint}>F2</span>
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            // A live session holds its counter: deactivating it mid-shift would strand the drawer.
            disabled={!canEdit || t.isNew || !t.storedActive || Boolean(live) || t.saving}
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
        </div>
        <p className={styles.mutedNote}>Deactivate, never delete: a counter with sessions keeps its history.</p>
      </section>

      <section className={styles.formPane} aria-label="Counter">
        <div className={styles.formHead}>
          <span className={styles.formTitle}>{headingOf("counters", t.shown) || "New counter"}</span>
          {live ? <span className={styles.pill}>LIVE · {rowText(t.shown, "live_operator")}</span> : null}
        </div>

        <span className={styles.sectionCap}>Identity</span>
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
          <Field id={`${ids}-kind`} label="Kind">
            <select
              id={`${ids}-kind`}
              className={styles.selectInput}
              value={form.kind}
              disabled={!editable}
              onChange={(event) => t.update({ kind: event.target.value })}
            >
              {COUNTER_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
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
          <Check label="Active" checked={form.active} disabled={!editable} onChange={(active) => t.update({ active })} span="full" />
        </div>

        <span className={styles.sectionCap}>Hardware</span>
        <div className={styles.fields}>
          <Field id={`${ids}-device`} label="Device" wide>
            <div className={styles.inlineRow}>
              <NexDropdownSingle
                id={`${ids}-device`}
                dropdownId={deviceDropdownId}
                params={deviceParams}
                clearOnParamsChange={false}
                value={form.deviceId ? { id: form.deviceId, text: form.deviceName } : null}
                onChange={(selection) => t.update({ deviceId: selection?.id ?? "", deviceName: selection?.text ?? "" })}
                // Re-binding hardware mid-shift would orphan the drawer (the server refuses it too).
                disabled={!editable || Boolean(live)}
                placeholder="Any device may claim it"
                aria-label="Device"
                className={styles.dropdown}
                advanceFocusOnSelect={false}
              />
              <button
                type="button"
                className={styles.secondaryButton}
                title="Any device may then claim this counter"
                disabled={!editable || Boolean(live) || !form.deviceId}
                onClick={() => t.update({ deviceId: "", deviceName: "" })}
              >
                Unlink
              </button>
            </div>
          </Field>
          <Field label="Drawer" wide>
            <div className={styles.radioRow} role="radiogroup" aria-label="Drawer">
              {DRAWER_MODES.map((mode) => (
                <label key={mode.value} className={styles.radioLine}>
                  <input
                    type="radio"
                    name={`${ids}-drawer`}
                    checked={form.drawerMode === mode.value}
                    disabled={!editable || Boolean(live)}
                    onChange={() => t.update({ drawerMode: mode.value })}
                  />
                  {mode.label}
                </label>
              ))}
            </div>
          </Field>
          <Check
            label="Needs an open till session to take money"
            checked={form.requiresSession}
            disabled={!editable}
            onChange={(requiresSession) => t.update({ requiresSession })}
            span="full"
          />
        </div>

        <span className={styles.sectionCap}>Cash</span>
        <div className={styles.fields}>
          <Field id={`${ids}-float`} label="Default float">
            <NumberBox
              id={`${ids}-float`}
              value={form.defaultFloat}
              disabled={!editable}
              onChange={(value) => t.update({ defaultFloat: value })}
            />
          </Field>
          <Field id={`${ids}-safe`} label="Drops go to">
            <NexDropdownSingle
              id={`${ids}-safe`}
              dropdownId={safeDropdownId}
              params={safeParams}
              clearOnParamsChange={false}
              value={form.safeId ? { id: form.safeId, text: form.safeName } : null}
              onChange={(selection) => t.update({ safeId: selection?.id ?? "", safeName: selection?.text ?? "" })}
              disabled={!editable}
              placeholder="The branch default safe"
              aria-label="Drops go to"
              className={styles.dropdown}
              advanceFocusOnSelect={false}
            />
          </Field>
          <Field id={`${ids}-alert`} label="Alert limit">
            <NumberBox
              id={`${ids}-alert`}
              value={form.alertLimit}
              disabled={!editable}
              onChange={(value) => t.update({ alertLimit: value })}
            />
          </Field>
          <Field id={`${ids}-block`} label="Block limit">
            <NumberBox
              id={`${ids}-block`}
              value={form.blockLimit}
              disabled={!editable}
              onChange={(value) => t.update({ blockLimit: value })}
            />
          </Field>
          <p className={`${styles.mutedNote} ${styles.fieldFull}`}>
            alert = &quot;pickup due&quot; on the till strip · block = billing stops until a pickup · 0 = off
          </p>
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
            { label: "Last Z no", value: t.shown ? rowText(t.shown, "tcn_z_last_no") || "—" : "—" },
            { label: "Live session", value: live ? `${live} · ${rowText(t.shown, "live_operator")}` : "—" },
            { label: "Sessions (30 days)", value: t.shown ? rowText(t.shown, "sessions_30d") || "0" : "—" },
            { label: "Last closed", value: rowText(t.shown, "last_closed") || "—" },
          ]}
        />
        <Warning lines={counterWarnings(form, t.shown)} />
      </section>
    </div>
  );
}
