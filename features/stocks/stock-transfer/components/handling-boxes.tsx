"use client";

/**
 * The 3.0 Loading and Unloading boxes (notes 153): who loaded the goods, on
 * what, and the charge (Σ (qty + free) × the line's rate). The charge shown is
 * the screen's arithmetic for the operator; the SERVER works out its own and
 * posts it (DR LOADING_CHARGES / CR LOADING_PAYABLE) — a total is never sent.
 *
 * Each picker lists the employees of its designation (dropdown 72; all of the
 * branch's employees while nobody holds that designation yet). Branch Outward
 * has the Loading box only: its charge posts at despatch, at this branch; the
 * vehicle is the header's, and the Unloading is keyed where the goods arrive.
 */
import { DateTimeInput } from "@/components/design-system/ui/date-input";
import { useMemo } from "react";
import { NexDropdownMulti, NexDropdownSingle } from "@/components/design-system/dropdown";
import { cx } from "@/components/design-system/cx";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { formatCurrency } from "@/domain/pricing";
import quotationStyles from "@/features/sales/quotation/page.module.scss";
import { CREW_DROPDOWN_KEY, CREW_ROLES } from "../stock-transfer.constants";
import type { Handling } from "../stock-transfer.types";
import styles from "../page.module.scss";

const CREW_EMPTY_PARAMS = ["iemp_branch_id", "iemp_role"] as const;
const quotationInput = quotationStyles.input;
const money = (value: number) => formatCurrency(Number.isFinite(value) ? value : 0, 2, true);

export type HandlingBoxesProps = {
  handling: Handling;
  branchId: string;
  /** Branch Outward: the Loading box only, the vehicle lives in the header. */
  branchMode: boolean;
  /** False when the document is not open for keying. */
  editable: boolean;
  loadCharge: number;
  unloadCharge: number;
  loadProblem: string;
  unloadProblem: string;
  onChange: (patch: Partial<Handling>) => void;
};

export function HandlingBoxes(props: HandlingBoxesProps) {
  const { handling, branchId, branchMode, editable, loadCharge, unloadCharge, loadProblem, unloadProblem, onChange } = props;
  const crewDropdownId = useDropdownId(CREW_DROPDOWN_KEY);
  const paramsFor = useMemo(
    () => (role: string) => ({ iemp_branch_id: branchId, iemp_role: role }),
    [branchId],
  );
  const loadman = useMemo(() => paramsFor(CREW_ROLES.loadman), [paramsFor]);
  const driver = useMemo(() => paramsFor(CREW_ROLES.driver), [paramsFor]);
  const supervisor = useMemo(() => paramsFor(CREW_ROLES.supervisor), [paramsFor]);

  const loadOff = !editable || !handling.loadEnabled;
  const unloadOff = !editable || !handling.unloadEnabled;

  return (
    <>
      <fieldset className={cx(styles.handling, handling.loadEnabled && styles.handlingOn)} aria-label="Loading">
        <legend className={styles.handlingLegend}>
          <label>
            <input
              type="checkbox"
              checked={handling.loadEnabled}
              disabled={!editable}
              onChange={(event) => onChange({ loadEnabled: event.target.checked })}
            />{" "}
            Loading
          </label>
        </legend>
        <div className={styles.handlingGrid}>
          <label className={styles.handlingLabel} htmlFor="stock-transfer-load-at">
            On
          </label>
          <DateTimeInput
            id="stock-transfer-load-at"
            className={quotationInput}
            value={handling.loadAt}
            disabled={loadOff}
            onChange={(value) => onChange({ loadAt: value })}
          />
          <span className={styles.handlingLabel}>Loadman</span>
          <NexDropdownMulti
            dropdownId={crewDropdownId}
            params={loadman}
            keepEmptyParams={CREW_EMPTY_PARAMS}
            value={handling.loadmen}
            disabled={loadOff}
            placeholder="Who loaded"
            aria-label="Loadman"
            onChange={(loadmen) => onChange({ loadmen })}
          />
          <span className={styles.handlingLabel}>Driver</span>
          <NexDropdownSingle
            dropdownId={crewDropdownId}
            params={driver}
            keepEmptyParams={CREW_EMPTY_PARAMS}
            clearOnParamsChange={false}
            value={handling.driver}
            disabled={loadOff}
            placeholder="Driver"
            aria-label="Driver"
            onChange={(pick) => onChange({ driver: pick })}
          />
          {branchMode ? null : (
            <>
              <label className={styles.handlingLabel} htmlFor="stock-transfer-vehicle">
                Vehicle
              </label>
              <input
                id="stock-transfer-vehicle"
                className={quotationInput}
                value={handling.vehicleNo}
                maxLength={30}
                disabled={loadOff}
                autoComplete="off"
                onChange={(event) => onChange({ vehicleNo: event.target.value.toUpperCase() })}
              />
            </>
          )}
          <span className={styles.handlingLabel}>Supervisor</span>
          <NexDropdownSingle
            dropdownId={crewDropdownId}
            params={supervisor}
            keepEmptyParams={CREW_EMPTY_PARAMS}
            clearOnParamsChange={false}
            value={handling.supervisor}
            disabled={loadOff}
            placeholder="Supervisor"
            aria-label="Supervisor"
            onChange={(pick) => onChange({ supervisor: pick })}
          />
          <span className={styles.handlingLabel}>Charge</span>
          <output className={cx(quotationInput, styles.chargeValue)} aria-label="Loading charge">
            {money(loadCharge)}
          </output>
          {loadProblem ? <p className={styles.boxProblem}>{loadProblem}</p> : null}
        </div>
      </fieldset>

      {branchMode ? null : (
        <fieldset className={cx(styles.handling, handling.unloadEnabled && styles.handlingOn)} aria-label="Unloading">
          <legend className={styles.handlingLegend}>
            <label>
              <input
                type="checkbox"
                checked={handling.unloadEnabled}
                disabled={!editable}
                onChange={(event) => onChange({ unloadEnabled: event.target.checked })}
              />{" "}
              Unloading
            </label>
          </legend>
          <div className={cx(styles.handlingGrid, styles.handlingGridNarrow)}>
            <label className={styles.handlingLabel} htmlFor="stock-transfer-unload-at">
              On
            </label>
            <DateTimeInput
              id="stock-transfer-unload-at"
              className={quotationInput}
              value={handling.unloadAt}
              disabled={unloadOff}
              onChange={(value) => onChange({ unloadAt: value })}
            />
            <span className={styles.handlingLabel}>Unloadman</span>
            <NexDropdownMulti
              dropdownId={crewDropdownId}
              params={loadman}
              keepEmptyParams={CREW_EMPTY_PARAMS}
              value={handling.unloadmen}
              disabled={unloadOff}
              placeholder="Who unloaded"
              aria-label="Unloadman"
              onChange={(unloadmen) => onChange({ unloadmen })}
            />
            <span className={styles.handlingLabel}>Supervisor</span>
            <NexDropdownSingle
              dropdownId={crewDropdownId}
              params={supervisor}
              keepEmptyParams={CREW_EMPTY_PARAMS}
              clearOnParamsChange={false}
              value={handling.unloadSupervisor}
              disabled={unloadOff}
              placeholder="Supervisor"
              aria-label="Unloading supervisor"
              onChange={(pick) => onChange({ unloadSupervisor: pick })}
            />
            <span className={styles.handlingLabel}>Charge</span>
            <output className={cx(quotationInput, styles.chargeValue)} aria-label="Unloading charge">
              {money(unloadCharge)}
            </output>
            {unloadProblem ? <p className={styles.boxProblem}>{unloadProblem}</p> : null}
          </div>
        </fieldset>
      )}
    </>
  );
}
