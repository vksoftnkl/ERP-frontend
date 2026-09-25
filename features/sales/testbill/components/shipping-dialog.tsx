"use client";

/**
 * The shipping popup (§20): Transport on top, then Dispatch From beside Ship
 * To, the bill's Terms group in the extra slot, then Clear (F7), Save (F5)
 * and Close (Esc).
 *
 * Two save modes (§20.3), decided by `mode`:
 *  - `document` — a DRAFT: the band and the terms go onto the draft and ride
 *    flat on `/create`;
 *  - `ownVerb` — a POSTED bill with `locks.editable.transportBand`: PUT
 *    `/bills/transport`, the document is not re-sent.
 *  - `declared` / `readOnly` — shown, never written.
 *
 * "Empty Ship To means 'as the bill-to'": the bill-to shows as grey
 * placeholders and is never written. Dispatch From is read-only from the
 * branch master; the godown is its only input.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "@/lib/notify";
import { cx } from "@/components/design-system/cx";
import { ModalShell } from "@/features/sales/quotation/components/modal-shell";
import { DateField, DropdownCombo, Field, GroupBox, SelectField, TextField } from "@/features/sales/quotation/components/fields";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { useDropdownId } from "@/lib/configured-dropdowns";
import type { BranchAddress } from "@/features/sales/testbill/api/bills";
import {
  GST_STATES,
  TRANSPORT_MODE_OPTIONS,
  applyShipToSite,
  clampDistance,
  clearedBand,
  gstStateName,
  shipToIsEmpty,
  shipToViolation,
  shippingMood,
  type ShippingMode,
} from "@/features/sales/testbill/domain/shipping";
import type { PartyShipTo, SaleBillTerms, TransportBand } from "@/features/sales/testbill/types";
import styles from "@/features/sales/testbill/page.module.scss";

export type ShippingApply = {
  band: TransportBand;
  terms: SaleBillTerms;
  vehicleNo: string;
  vehicleId: string | null;
};

export type ShippingDialogProps = {
  isOpen: boolean;
  mode: ShippingMode;
  /** The validate note that marked the dialog required (§16.5), or null. */
  required: string | null;
  ewbVehicle: string | null;
  band: TransportBand;
  terms: SaleBillTerms;
  vehicleNo: string;
  vehicleId: string | null;
  companyId: string;
  branchId: string;
  /** The party's ship-to sites, from party-context. */
  shipTo: PartyShipTo[];
  billTo: { name: string; addr: string | null; place: string | null; pin: string | null; phone: string | null; stcd: string | null; gstin: string | null };
  /** `GET /branch-masters/get` for the dispatch block; null until read. */
  branch: BranchAddress | null;
  busy: boolean;
  onClose: () => void;
  /** `document` mode: write the band, the terms and the vehicle onto the draft. */
  onApply: (result: ShippingApply) => void;
  /** `ownVerb` mode: PUT the band. Resolves true on success. */
  onSaveTransport: (band: TransportBand) => Promise<boolean>;
  /** "+" beside the site combo — the customer's ship-to list screen. */
  onOpenShipToList?: () => void;
};

const SHIP_TO_BILL = "__bill-to__";

export function ShippingDialog(props: ShippingDialogProps) {
  if (!props.isOpen) {
    return null;
  }
  return <ShippingDialogBody {...props} />;
}

function ShippingDialogBody({
  isOpen,
  mode,
  required,
  ewbVehicle,
  band: initialBand,
  terms: initialTerms,
  vehicleNo: initialVehicleNo,
  vehicleId: initialVehicleId,
  companyId,
  branchId,
  shipTo,
  billTo,
  branch,
  busy,
  onClose,
  onApply,
  onSaveTransport,
  onOpenShipToList,
}: ShippingDialogProps) {
  const [band, setBand] = useState<TransportBand>(initialBand);
  const [terms, setTerms] = useState<SaleBillTerms>(initialTerms);
  const [vehicleNo, setVehicleNo] = useState(initialVehicleNo);
  const [vehicleId, setVehicleId] = useState<string | null>(initialVehicleId);
  const [site, setSite] = useState<string>(initialBand.to.addrId ?? SHIP_TO_BILL);
  const [distanceText, setDistanceText] = useState(initialBand.distanceKm === null ? "" : String(initialBand.distanceKm));

  const transporterDropdownId = useDropdownId("transporter");
  const vehicleDropdownId = useDropdownId("vehicle");
  const godownDropdownId = useDropdownId("godown");
  const transporterParams = useMemo(() => ({ itrn_company_id: companyId }), [companyId]);
  const vehicleParams = useMemo(() => ({ iveh_company_id: companyId }), [companyId]);

  const locked = mode === "declared" || mode === "readOnly";
  const mood = shippingMood(mode, required, ewbVehicle);

  // The default site is applied only while the dialog is EMPTY (§20.2): a
  // loaded document keeps what it was saved with.
  useEffect(() => {
    if (!locked && shipToIsEmpty(initialBand.to)) {
      const preferred = shipTo.find((row) => row.isDefault);
      if (preferred) {
        setBand((current) => applyShipToSite(current, preferred));
        setSite(preferred.saaId);
        if (preferred.distanceKm !== null && preferred.distanceKm > 0 && initialBand.distanceKm === null) {
          setDistanceText(String(preferred.distanceKm));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patchTo = (patch: Partial<TransportBand["to"]>) =>
    setBand((current) => ({ ...current, to: { ...current.to, ...patch } }));

  const onPickSite = (value: string) => {
    setSite(value);
    if (value === SHIP_TO_BILL) {
      setBand((current) => applyShipToSite(current, null));
      return;
    }
    const chosen = shipTo.find((row) => row.saaId === value) ?? null;
    setBand((current) => {
      const next = applyShipToSite(current, chosen);
      if (next.distanceKm !== current.distanceKm && next.distanceKm !== null) {
        setDistanceText(String(next.distanceKm));
      }
      return next;
    });
  };

  const commitDistance = () => {
    const trimmed = distanceText.trim();
    const value = trimmed ? clampDistance(Number(trimmed)) : null;
    setBand((current) => ({ ...current, distanceKm: value }));
    setDistanceText(value === null ? "" : String(value));
  };

  const save = async () => {
    if (locked) {
      return;
    }
    const violation = shipToViolation(band.to);
    if (violation) {
      toast.error(violation);
      return;
    }
    // The branch id is cleared when no godown is set: an empty dialog must
    // stay empty (§20.2).
    const from = band.from.godownId ? { ...band.from, branchId: branchId || null } : { ...band.from, branchId: null };
    const next: TransportBand = { ...band, from };
    if (mode === "ownVerb") {
      const ok = await onSaveTransport(next);
      if (ok) {
        onClose();
      }
      return;
    }
    onApply({ band: next, terms, vehicleNo: vehicleNo.trim().toUpperCase(), vehicleId });
    onClose();
  };

  const clear = () => {
    if (locked) {
      return;
    }
    // F7 empties the form but keeps the VEHICLE (§20.3).
    setBand(clearedBand());
    setSite(SHIP_TO_BILL);
    setDistanceText("");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "F5") {
      event.preventDefault();
      void save();
    } else if (event.key === "F7") {
      event.preventDefault();
      clear();
    }
  };

  const branchState = branch?.brStateCode ? `${branch.brStateCode} · ${branch.brStateName ?? gstStateName(branch.brStateCode)}` : "";
  const shipStates = useMemo(
    () => [{ value: "", label: "—" }, ...GST_STATES.map((state) => ({ value: state.code, label: `${state.code} · ${state.name}` }))],
    [],
  );

  return (
    <ModalShell
      title="Shipping detail"
      isOpen={isOpen}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className={quotationStyles.button} disabled={locked || busy} onClick={clear}>
            Clear <span className={quotationStyles.buttonHint}>F7</span>
          </button>
          <button type="button" className={quotationStyles.button} onClick={onClose}>
            Close <span className={quotationStyles.buttonHint}>Esc</span>
          </button>
          <button
            type="button"
            className={cx(quotationStyles.button, quotationStyles.buttonPrimary)}
            disabled={locked || busy}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : mode === "ownVerb" ? "Save transport" : "Save"}{" "}
            <span className={quotationStyles.buttonHint}>F5</span>
          </button>
        </>
      }
    >
      <div className={styles.shippingBody} onKeyDown={onKeyDown}>
        {mood ? (
          <div className={cx(styles.shippingMood, styles[`shippingMood_${mood.tone}` as keyof typeof styles])}>{mood.text}</div>
        ) : null}

        <GroupBox title="Transport" className={styles.shippingGroup}>
          <div className={quotationStyles.fieldGrid}>
            <DropdownCombo
              id="ship-vehicle"
              label="Vehicle"
              dropdownId={vehicleDropdownId}
              valueKey="veh_id"
              labelKey="veh_vehicle_no"
              metaKey="trn_name"
              value={vehicleId ?? ""}
              selectedLabel={vehicleId ? vehicleNo : ""}
              disabled={locked}
              params={vehicleParams}
              placeholder="Pick from the vehicle master…"
              onSelect={(id, number) => {
                setVehicleId(id);
                setVehicleNo(number.toUpperCase());
              }}
            />
            <TextField
              id="ship-vehicle-no"
              label="Vehicle No (typed)"
              value={vehicleNo}
              disabled={locked}
              maxLength={20}
              title="A typed number clears the vehicle master row behind it."
              onChange={(value) => {
                setVehicleNo(value.toUpperCase());
                // A typed number clears the vehicle id ("no master row behind it").
                setVehicleId(null);
              }}
            />
            <DropdownCombo
              id="ship-transporter"
              label="Transporter"
              dropdownId={transporterDropdownId}
              valueKey="trn_id"
              labelKey="trn_name"
              metaKey="trn_gstin"
              value={band.transporterId ?? ""}
              selectedLabel={band.transporterName ?? ""}
              disabled={locked}
              params={transporterParams}
              placeholder="Search transporters…"
              onSelect={(id, name) =>
                setBand((current) => ({
                  ...current,
                  transporterId: id,
                  // Fills "Name as declared" only when that is blank.
                  transporterName: (current.transporterName ?? "").trim() ? current.transporterName : name,
                }))
              }
            />
            <TextField
              id="ship-transporter-name"
              label="Name as declared"
              value={band.transporterName ?? ""}
              disabled={locked}
              maxLength={200}
              onChange={(value) => setBand((current) => ({ ...current, transporterName: value || null }))}
            />
            <TextField
              id="ship-transporter-gstin"
              label="Transporter ID (GSTIN / TRANSIN)"
              value={band.transporterGstin ?? ""}
              disabled={locked}
              maxLength={15}
              onChange={(value) => setBand((current) => ({ ...current, transporterGstin: value.toUpperCase() || null }))}
            />
            <SelectField
              id="ship-mode"
              label="Mode"
              value={band.mode}
              disabled={locked}
              options={TRANSPORT_MODE_OPTIONS.map((option) => ({ ...option }))}
              onChange={(value) => setBand((current) => ({ ...current, mode: value }))}
            />
            <Field label="Distance (km)" htmlFor="ship-distance">
              <input
                id="ship-distance"
                className={cx(quotationStyles.input, quotationStyles.alignRight)}
                inputMode="numeric"
                value={distanceText}
                disabled={locked}
                onChange={(event) => setDistanceText(event.target.value)}
                onBlur={commitDistance}
              />
            </Field>
            <TextField
              id="ship-lr-no"
              label="LR / Doc No"
              value={band.lrNo ?? ""}
              disabled={locked}
              maxLength={50}
              onChange={(value) => setBand((current) => ({ ...current, lrNo: value || null }))}
            />
            <DateField
              id="ship-lr-date"
              label="LR Date"
              value={band.lrDate ?? ""}
              disabled={locked}
              onChange={(value) => setBand((current) => ({ ...current, lrDate: value || null }))}
            />
          </div>
        </GroupBox>

        <div className={styles.shippingColumns}>
          <GroupBox title="Dispatch From" className={styles.shippingGroup}>
            <p className={quotationStyles.modalNote}>From the branch master — change the godown, not the address.</p>
            <div className={quotationStyles.fieldGrid}>
              <DropdownCombo
                id="ship-godown"
                label="Godown"
                dropdownId={godownDropdownId}
                valueKey="gdl_id"
                labelKey="gdl_name"
                value={band.from.godownId ?? ""}
                selectedLabel={band.from.name && band.from.godownId ? band.from.name : ""}
                disabled={locked}
                placeholder="Search godowns…"
                onSelect={(id, name) =>
                  setBand((current) => ({
                    ...current,
                    from: {
                      ...current.from,
                      godownId: id,
                      branchId: branchId || null,
                      name: name,
                      addr: branch ? [branch.brAddr1, branch.brAddr2, branch.brAddr3].filter(Boolean).join(", ") || null : current.from.addr,
                      place: branch?.brCity ?? current.from.place,
                      pin: branch?.brPin === null || branch?.brPin === undefined ? current.from.pin : String(branch.brPin),
                      phone: branch?.brPhone ?? current.from.phone,
                      stcd: branch?.brStateCode ?? current.from.stcd,
                      gstin: branch?.brGstin ?? current.from.gstin,
                    },
                  }))
                }
              />
              <Field label="Name">
                <output className={styles.shippingReadOnly}>{branch ? branch.brMailingName || branch.brName || "" : "…"}</output>
              </Field>
              <Field label="Address">
                <output className={styles.shippingReadOnly}>
                  {branch ? [branch.brAddr1, branch.brAddr2, branch.brAddr3].filter(Boolean).join(", ") : "…"}
                </output>
              </Field>
              <Field label="State">
                <output className={styles.shippingReadOnly}>{branchState}</output>
              </Field>
              <Field label="PIN">
                <output className={styles.shippingReadOnly}>{branch?.brPin ?? ""}</output>
              </Field>
            </div>
          </GroupBox>

          <GroupBox title="Ship To" className={styles.shippingGroup}>
            <div className={quotationStyles.fieldGrid}>
              <Field label="Site" htmlFor="ship-site">
                <span className={styles.settleInline}>
                  <select
                    id="ship-site"
                    className={quotationStyles.select}
                    value={site}
                    disabled={locked}
                    onChange={(event) => onPickSite(event.target.value)}
                  >
                    <option value={SHIP_TO_BILL}>Bill-to address (as printed)</option>
                    {shipTo.map((row) => (
                      <option key={row.saaId} value={row.saaId}>
                        {row.name ?? "—"} · {row.place ?? "—"}
                        {row.isDefault ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                  {onOpenShipToList ? (
                    <button type="button" className={quotationStyles.button} disabled={locked} title="The customer's ship-to list" onClick={onOpenShipToList}>
                      +
                    </button>
                  ) : null}
                </span>
              </Field>
              <TextField id="ship-to-name" label="Name" value={band.to.name ?? ""} disabled={locked} maxLength={200} placeholder={billTo.name} onChange={(value) => patchTo({ name: value || null })} />
              <TextField id="ship-to-addr" label="Address" value={band.to.addr ?? ""} disabled={locked} maxLength={500} placeholder={billTo.addr ?? ""} onChange={(value) => patchTo({ addr: value || null })} />
              <TextField id="ship-to-place" label="Place" value={band.to.place ?? ""} disabled={locked} maxLength={100} placeholder={billTo.place ?? ""} onChange={(value) => patchTo({ place: value || null })} />
              <TextField id="ship-to-pin" label="PIN" value={band.to.pin ?? ""} disabled={locked} maxLength={6} placeholder={billTo.pin ?? ""} onChange={(value) => patchTo({ pin: value.replace(/\D/g, "") || null })} />
              <SelectField
                id="ship-to-state"
                label="State"
                value={band.to.stcd ?? ""}
                disabled={locked}
                options={shipStates}
                onChange={(value) => patchTo({ stcd: value || null })}
              />
              <TextField id="ship-to-gstin" label="GSTIN" value={band.to.gstin ?? ""} disabled={locked} maxLength={15} placeholder={billTo.gstin ?? ""} onChange={(value) => patchTo({ gstin: value.toUpperCase() || null })} />
              <TextField id="ship-to-phone" label="Phone" value={band.to.phone ?? ""} disabled={locked} maxLength={20} placeholder={billTo.phone ?? ""} onChange={(value) => patchTo({ phone: value || null })} />
            </div>
            <p className={quotationStyles.modalNote}>Empty Ship To means &quot;as the bill-to&quot; — the grey placeholders are never written.</p>
          </GroupBox>
        </div>

        <GroupBox title="Terms" className={styles.shippingGroup}>
          <div className={quotationStyles.fieldGrid}>
            <TextField id="ship-payment-terms" label="Payment Terms" value={terms.paymentTerms} disabled={locked || mode === "ownVerb"} maxLength={250} onChange={(value) => setTerms((current) => ({ ...current, paymentTerms: value }))} />
            <TextField id="ship-delivery-terms" label="Delivery Terms" value={terms.deliveryTerms} disabled={locked || mode === "ownVerb"} maxLength={250} onChange={(value) => setTerms((current) => ({ ...current, deliveryTerms: value }))} />
            <TextField id="ship-other-terms" label="Other Terms" value={terms.termsConditions} disabled={locked || mode === "ownVerb"} maxLength={1000} onChange={(value) => setTerms((current) => ({ ...current, termsConditions: value }))} />
          </div>
          {mode === "ownVerb" ? (
            <p className={quotationStyles.modalNote}>The terms belong to the document; on a posted bill they change through Amend.</p>
          ) : null}
        </GroupBox>
      </div>
    </ModalShell>
  );
}
