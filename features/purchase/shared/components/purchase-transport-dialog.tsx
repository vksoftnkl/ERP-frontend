"use client";

/**
 * Transport (Qt `PurchaseTransportDialog`, purchase_parts.cpp): the document's
 * transport band — mode, transporter (dropdown TRANSPORTERS), name, GSTIN,
 * LR no / date, distance, remarks, and (invoice only) vehicle no / driver,
 * which the server stores on the document itself (pi_vehicle_no /
 * pi_driver_name). Enter walks the fields (house popup rule), Ctrl+Enter is OK,
 * Esc closes. Clear empties every field; OK with nothing left = remove the band.
 */
import { useCallback, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { cx } from "@/components/design-system/cx";
import { DateInput } from "@/components/design-system/ui";
import { DropdownCombo } from "@/features/sales/quotation/components/fields";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { useDropdownId } from "@/lib/configured-dropdowns";
import {
  TRANSPORT_MODES,
  transportBandOf,
  transportFormOf,
  type PurchaseTransportBand,
  type PurchaseTransportForm,
} from "../purchase-parts";
import styles from "./purchase-parts.module.scss";

export type PurchaseTransportDialogProps = {
  open: boolean;
  /** The band as /get gave it (or as last applied); null = none yet. */
  band: PurchaseTransportBand | null | undefined;
  companyId: string;
  readOnly?: boolean;
  /** false: no Vehicle / Driver rows (the GRN keeps both on its own header). Default true. */
  showCrew?: boolean;
  onClose: () => void;
  /** OK: the band to send (`null` = remove it). */
  onApply: (band: PurchaseTransportBand | null) => void;
};

const EMPTY: PurchaseTransportForm = transportFormOf(null);

export function PurchaseTransportDialog(props: PurchaseTransportDialogProps) {
  return props.open ? <OpenTransportDialog {...props} /> : null;
}

function OpenTransportDialog({ band, companyId, readOnly, showCrew = true, onClose, onApply }: PurchaseTransportDialogProps) {
  const [form, setForm] = useState<PurchaseTransportForm>(() => transportFormOf(band));
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const transporterDropdownId = useDropdownId("transporter");
  const params = useMemo(() => ({ itrn_company_id: companyId }), [companyId]);

  const set = useCallback(<K extends keyof PurchaseTransportForm>(key: K, value: PurchaseTransportForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  }, []);

  const apply = useCallback(() => {
    if (readOnly) {
      onClose();
      return;
    }
    onApply(transportBandOf(form, showCrew));
    onClose();
  }, [form, onApply, onClose, readOnly, showCrew]);

  // Enter walks to the next field; on the last one it is OK. Ctrl+Enter = OK anywhere.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      apply();
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest('[role="listbox"]') || target.getAttribute("aria-expanded") === "true") return;
    const fields = Array.from(
      bodyRef.current?.querySelectorAll<HTMLElement>("input:not([type=hidden]):not([tabindex='-1']), select") ?? [],
    ).filter((element) => !(element as HTMLInputElement).disabled && !element.hasAttribute("data-date-picker-proxy"));
    const at = fields.indexOf(target);
    if (at < 0) return;
    event.preventDefault();
    if (at === fields.length - 1) apply();
    else fields[at + 1].focus();
  };

  const text = (key: keyof PurchaseTransportForm, label: string, maxLength: number, extra?: { upper?: boolean; digits?: boolean; placeholder?: string }) => (
    <>
      <label className={styles.formLabel} htmlFor={`purchase-transport-${key}`}>
        {label}
      </label>
      <input
        id={`purchase-transport-${key}`}
        className={styles.input}
        value={form[key]}
        maxLength={maxLength}
        disabled={readOnly}
        inputMode={extra?.digits ? "numeric" : undefined}
        placeholder={extra?.placeholder}
        onChange={(event) => {
          let value = event.target.value;
          if (extra?.digits) value = value.replace(/\D/g, "");
          if (extra?.upper) value = value.toUpperCase();
          set(key, value);
        }}
      />
    </>
  );

  const footer = (
    <>
      {readOnly ? null : (
        <button type="button" className={quotationStyles.button} onClick={() => setForm(EMPTY)}>
          Clear
        </button>
      )}
      {readOnly ? null : (
        <button type="button" className={cx(quotationStyles.button, quotationStyles.buttonPrimary)} onClick={apply}>
          OK
        </button>
      )}
      <button type="button" className={quotationStyles.button} onClick={onClose}>
        {readOnly ? "Close" : "Cancel"}
      </button>
    </>
  );

  return (
    <ModalShell title="Transport" isOpen panelClassName={styles.transportPanel} onClose={onClose} footer={footer}>
      <div ref={bodyRef} className={styles.form} onKeyDown={onKeyDown} data-purchase-transport="">
        <label className={styles.formLabel} htmlFor="purchase-transport-mode">
          Mode
        </label>
        <select
          id="purchase-transport-mode"
          className={styles.input}
          value={form.mode}
          disabled={readOnly}
          autoFocus
          onChange={(event) => set("mode", event.target.value)}
        >
          {TRANSPORT_MODES.map((mode) => (
            <option key={mode.value} value={mode.value}>
              {mode.label}
            </option>
          ))}
        </select>
        <label className={styles.formLabel} htmlFor="purchase-transport-transporter">
          Transporter
        </label>
        {/* One grid cell: DropdownCombo is a Field (its own label + the box) — two cells unwrapped,
            which pushed every row after it one cell along. */}
        <div className={styles.formCell}>
          <DropdownCombo
            id="purchase-transport-transporter"
            label=""
            dropdownId={transporterDropdownId}
            valueKey="trn_id"
            labelKey="trn_name"
            value={form.transporterId}
            selectedLabel={form.transporterName}
            disabled={readOnly}
            params={params}
            onSelect={(id, name) => setForm((current) => ({ ...current, transporterId: id, transporterName: id ? name : current.transporterName }))}
          />
        </div>
        {text("transporterName", "Name", 200, { placeholder: "or type the name" })}
        {text("transporterGstin", "Transporter GSTIN", 15, { upper: true })}
        {text("lrNo", "LR no", 50)}
        <label className={styles.formLabel} htmlFor="purchase-transport-lr-date">
          LR date
        </label>
        <DateInput
          id="purchase-transport-lr-date"
          className={styles.input}
          value={form.lrDate}
          disabled={readOnly}
          block
          onChange={(value) => set("lrDate", value)}
        />
        {text("distanceKm", "Distance (km)", 5, { digits: true })}
        {showCrew ? text("vehicleNo", "Vehicle no", 20, { upper: true }) : null}
        {showCrew ? text("driverName", "Driver", 100) : null}
        {text("remarks", "Remarks", 250)}
      </div>
    </ModalShell>
  );
}
