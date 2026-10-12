"use client";

/**
 * Till Counter popup (menu 275) — Qt `TillCounterEntry`: Counter, Hardware,
 * Cash, Status. While a session is live the device and drawer are locked.
 */
import { useMemo } from "react";

import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { COUNTER_KINDS, DRAWER_MODES, rowText, type DrawerMode } from "../domain/till-masters";
import type { EntryFieldsProps } from "./fields-props";
import { Check, Field, NumberBox, SectionHeading, fieldId } from "./form-bits";
import styles from "../page.module.scss";

export function CounterFields({ form, update, row, editable, locked, focus, companyId, branchId }: EntryFieldsProps<"counters">) {
  const deviceDropdownId = useDropdownId("tillDevice");
  const safeDropdownId = useDropdownId("tillSafe");
  const off = (field: string) => !editable || locked.includes(field);
  const id = (field: string) => fieldId("counters", field);
  // The device list leaves out devices linked to OTHER counters, so it needs this one's id.
  const counterId = rowText(row, "tcn_id");
  const deviceParams = useMemo(() => ({ ibranch_id: branchId, icounter_id: counterId }), [branchId, counterId]);
  const safeParams = useMemo(() => ({ icompany_id: companyId, ibranch_id: branchId }), [companyId, branchId]);

  return (
    <>
      <SectionHeading>Counter</SectionHeading>
      <div className={styles.fieldGrid}>
        <Field id={id("code")} label="Code" required>
          <input
            id={id("code")}
            className={styles.textInput}
            maxLength={20}
            placeholder="C01, EXP1"
            data-uppercase="off"
            data-required="true"
            value={form.code}
            disabled={off("code")}
            autoFocus={focus === "code"}
            onChange={(event) => update({ code: event.target.value })}
          />
        </Field>
        <Field id={id("name")} label="Name" required>
          <input
            id={id("name")}
            className={styles.textInput}
            maxLength={100}
            data-required="true"
            value={form.name}
            disabled={off("name")}
            autoFocus={focus === "name"}
            onChange={(event) => update({ name: event.target.value })}
          />
        </Field>
        <Field id={id("kind")} label="Kind">
          <select
            id={id("kind")}
            className={styles.selectInput}
            value={form.kind}
            disabled={off("kind")}
            onChange={(event) => update({ kind: event.target.value })}
          >
            {COUNTER_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </Field>
        <Field id={id("sortOrder")} label="Sort Order">
          <NumberBox
            id={id("sortOrder")}
            value={form.sortOrder}
            decimals={0}
            max={9999}
            disabled={off("sortOrder")}
            onChange={(sortOrder) => update({ sortOrder })}
          />
        </Field>
      </div>

      <SectionHeading>Hardware</SectionHeading>
      <div className={styles.fieldGrid}>
        <Field id={id("deviceId")} label="Device">
          <NexDropdownSingle
            id={id("deviceId")}
            dropdownId={deviceDropdownId}
            params={deviceParams}
            clearOnParamsChange={false}
            value={form.deviceId ? { id: form.deviceId, text: form.deviceName } : null}
            onChange={(picked) => update({ deviceId: picked?.id ?? "", deviceName: picked?.text ?? "" })}
            disabled={off("deviceId")}
            placeholder="Any device may claim it"
            aria-label="Device"
            className={styles.dropdown}
          />
        </Field>
        <Field id={id("drawerMode")} label="Drawer">
          <select
            id={id("drawerMode")}
            className={styles.selectInput}
            value={form.drawerMode}
            disabled={off("drawerMode")}
            title="TRAY = a cash insert that travels with the cashier · NONE = a cashless lane"
            onChange={(event) => update({ drawerMode: event.target.value as DrawerMode })}
          >
            {DRAWER_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </Field>
        <Check
          id={id("requiresSession")}
          label="Billing here needs an open session"
          checked={form.requiresSession}
          disabled={off("requiresSession")}
          onChange={(requiresSession) => update({ requiresSession })}
        />
      </div>

      <SectionHeading>Cash</SectionHeading>
      <div className={styles.fieldGrid}>
        <Field id={id("defaultFloat")} label="Default Float">
          <NumberBox
            id={id("defaultFloat")}
            value={form.defaultFloat}
            disabled={off("defaultFloat")}
            onChange={(defaultFloat) => update({ defaultFloat })}
          />
        </Field>
        <Field id={id("safeId")} label="Safe">
          <NexDropdownSingle
            id={id("safeId")}
            dropdownId={safeDropdownId}
            params={safeParams}
            clearOnParamsChange={false}
            value={form.safeId ? { id: form.safeId, text: form.safeName } : null}
            onChange={(picked) => update({ safeId: picked?.id ?? "", safeName: picked?.text ?? "" })}
            disabled={off("safeId")}
            placeholder="The branch default safe"
            aria-label="Safe"
            className={styles.dropdown}
          />
        </Field>
        <Field id={id("alertLimit")} label="Cash Alert At">
          <NumberBox
            id={id("alertLimit")}
            value={form.alertLimit}
            placeholder="0 = off"
            disabled={off("alertLimit")}
            onChange={(alertLimit) => update({ alertLimit })}
          />
        </Field>
        <Field id={id("blockLimit")} label="Cash Block At">
          <NumberBox
            id={id("blockLimit")}
            value={form.blockLimit}
            placeholder="0 = off"
            disabled={off("blockLimit")}
            onChange={(blockLimit) => update({ blockLimit })}
          />
        </Field>
      </div>

      <SectionHeading>Status</SectionHeading>
      <div className={styles.fieldGrid}>
        <Check
          id={id("active")}
          label="Active"
          checked={form.active}
          disabled={off("active")}
          onChange={(active) => update({ active })}
        />
        <Field id={id("remarks")} label="Remarks" wide>
          <textarea
            id={id("remarks")}
            className={styles.textArea}
            rows={2}
            maxLength={250}
            value={form.remarks}
            disabled={off("remarks")}
            onChange={(event) => update({ remarks: event.target.value })}
          />
        </Field>
      </div>
    </>
  );
}
