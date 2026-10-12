"use client";

import { useEffect, useMemo, useRef, type KeyboardEvent } from "react";

import { cx } from "@/components/design-system/cx";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { SearchableSelect } from "@/components/design-system/ui";
import { useDropdownId } from "@/lib/configured-dropdowns";
import {
  RESERVED_NOTE,
  RULE_CHANNELS,
  RULE_MODES,
  APPROVER_LEVELS,
  describeEvent,
  ruleDetailsEnabled,
  ruleId,
  ruleSummary,
  thresholdCaption,
  thresholdDecimals,
  thresholdEnabled,
  type GridRow,
  type MatrixLine,
} from "../domain/approval-setup";
import type { RulesTabApi } from "../use-rules-tab";
import { Check, DateBox, Field, NumberBox, Pill, advanceOnEnter, inkOf } from "./form-bits";
import styles from "../page.module.scss";

const toOptions = (values: readonly string[]) => values.map((value) => ({ value, label: value }));
const MODE_OPTIONS = toOptions(RULE_MODES);
const CHANNEL_OPTIONS = toOptions(RULE_CHANNELS);
const LEVEL_OPTIONS = toOptions(APPROVER_LEVELS);

type EventLine = Extract<MatrixLine, { kind: "event" }>;

const HEADS: readonly { label: string; align?: "right" | "center"; tick?: boolean }[] = [
  { label: "Event" },
  { label: "Mode" },
  { label: "Threshold", align: "right" },
  { label: "Channel" },
  { label: "Min level" },
  { label: "2-person", align: "center", tick: true },
  { label: "Self", align: "center", tick: true },
  { label: "Blocks", align: "center", tick: true },
  { label: "Expires", align: "right", tick: true },
  { label: "From" },
  { label: "Effective here" },
];

type Props = {
  t: RulesTabApi;
  companyId: string;
  companyName: string;
  /** The first read is under way (no rows yet). */
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  hidden: boolean;
};

/**
 * Approval Rules — the matrix of every event at one scope (left) and the
 * selected event's layers and this scope's row (right).
 */
export function RulesTab({ t, companyId, companyName, loading, failed, onRetry, canCreate, canEdit, canDelete, hidden }: Props) {
  const branchDropdownId = useDropdownId("branchByCompany");
  const branchParams = useMemo(() => ({ ibr_comp_id: companyId }), [companyId]);
  const bodyRef = useRef<HTMLTableSectionElement | null>(null);

  const events = useMemo(
    () => t.matrix.filter((line): line is EventLine => line.kind === "event"),
    [t.matrix],
  );

  useEffect(() => {
    if (!t.event || !bodyRef.current) return;
    bodyRef.current
      .querySelector<HTMLElement>(`[data-event="${CSS.escape(t.event)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [t.event, t.matrix]);

  const onMatrixKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.key !== "ArrowDown" && event.key !== "ArrowUp") || events.length === 0) return;
    event.preventDefault();
    const index = events.findIndex((line) => line.event === t.event);
    const step = event.key === "ArrowDown" ? 1 : -1;
    const next = index < 0 ? 0 : Math.min(events.length - 1, Math.max(0, index + step));
    if (next !== index) void t.selectEvent(events[next].event);
  };

  const form = t.form;
  const editable = (t.isNew ? canCreate : canEdit) && !t.saving && Boolean(t.event);
  const details = editable && ruleDetailsEnabled(form.mode);
  const scopeName = t.scope?.text ?? "";
  const effectiveId = ruleId(t.inForce);
  const ids = "till-rule";

  const layerCard = (label: string, tone: "branch" | "info" | undefined, row: GridRow | null) => {
    const on = Boolean(effectiveId) && ruleId(row) === effectiveId;
    return (
      <div className={cx(styles.layer, on && styles.layerEffective)}>
        <div className={styles.layerHead}>
          <Pill tone={tone}>{label}</Pill>
          {on ? <span className={styles.layerMark}>EFFECTIVE</span> : null}
        </div>
        <span className={styles.layerText}>{ruleSummary(row)}</span>
      </div>
    );
  };

  return (
    <div className={styles.rulesBody} hidden={hidden} role="tabpanel" aria-label="Approval Rules">
      <div className={styles.topBar}>
        <span className={styles.fieldCap}>Company</span>
        <span className={styles.topValue}>{companyName || "—"}</span>
        <label className={styles.fieldCap} htmlFor={`${ids}-scope`}>
          Showing for
        </label>
        <div className={styles.scopeDropdown}>
          <NexDropdownSingle
            id={`${ids}-scope`}
            dropdownId={branchDropdownId}
            params={branchParams}
            clearOnParamsChange={false}
            value={t.scope}
            onChange={(selection) => void t.changeScope(selection)}
            disabled={t.saving || !companyId}
            placeholder="All branches (company layer)"
            aria-label="Showing for"
            className={styles.dropdown}
            advanceFocusOnSelect={false}
          />
        </div>
        <Check label="Show reserved events (void module)" checked={t.showReserved} onChange={t.setShowReserved} />
        <span className={styles.spacer} />
        <span className={styles.fieldCap}>Legend:</span>
        <Pill>SHIPPED</Pill>
        <Pill tone="info">COMPANY</Pill>
        <Pill tone="branch">BRANCH</Pill>
      </div>

      <div className={styles.rulesPanes}>
        <section className={styles.pane} aria-label="Rules">
          <div className={styles.tableWrap} tabIndex={0} role="grid" aria-label="Approval rules" onKeyDown={onMatrixKey}>
            <table className={cx(styles.table, styles.selectable)}>
              <thead>
                <tr>
                  {HEADS.map((head) => (
                    <th
                      key={head.label}
                      className={cx(
                        head.align === "right" && styles.alignRight,
                        head.align === "center" && styles.alignCenter,
                        head.tick && styles.tick,
                      )}
                    >
                      {head.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody ref={bodyRef}>
                {t.matrix.map((line) =>
                  line.kind === "section" ? (
                    <tr key={`section-${line.title}`} className={styles.sectionRow}>
                      <td colSpan={HEADS.length}>{line.title}</td>
                    </tr>
                  ) : (
                    <tr
                      key={line.event}
                      data-event={line.event}
                      aria-selected={line.event === t.event}
                      className={cx(line.event === t.event && styles.rowSelected)}
                      onClick={() => void t.selectEvent(line.event)}
                    >
                      <td>{line.event}</td>
                      <td className={inkOf(line.modeTone)}>{line.mode}</td>
                      <td className={styles.alignRight}>{line.threshold}</td>
                      <td>{line.channel}</td>
                      <td>{line.minRole}</td>
                      <td className={styles.alignCenter}>{line.twoPerson ? "✓" : ""}</td>
                      <td className={styles.alignCenter}>{line.allowSelf ? "✓" : ""}</td>
                      <td className={styles.alignCenter}>{line.blocks ? "✓" : ""}</td>
                      <td className={styles.alignRight}>{line.expires}</td>
                      <td>{line.from}</td>
                      <td className={inkOf(line.effectiveTone)}>{line.effective}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            {failed ? (
              <div className={styles.tableEmpty}>
                The approval rules could not be read.{" "}
                <button type="button" className={styles.secondaryButton} onClick={onRetry}>
                  Try again
                </button>
              </div>
            ) : loading ? (
              <div className={styles.tableEmpty}>Loading…</div>
            ) : null}
          </div>
          {!t.showReserved ? <p className={styles.mutedNote}>{RESERVED_NOTE}</p> : null}
        </section>

        <section className={styles.sidePane} aria-label="Rule">
          <span className={styles.eventHead}>{t.event || "—"}</span>
          <p className={styles.mutedNote}>{t.event ? describeEvent(t.event) : "Pick an event."}</p>

          <div className={styles.capRow}>
            <span className={styles.sectionCap}>Layers</span>
            <span className={styles.codeHint}>top wins</span>
          </div>
          {t.scopeBranch ? layerCard(`BRANCH · ${scopeName}`, "branch", t.layers.branch) : null}
          {layerCard(`COMPANY · ${companyName}`, "info", t.layers.company)}
          {layerCard("SHIPPED", undefined, t.layers.shipped)}

          <span className={styles.sectionCap}>{t.editCaption}</span>
          <form
            className={styles.ruleFields}
            noValidate
            onSubmit={(event) => event.preventDefault()}
            onKeyDown={advanceOnEnter}
          >
            <Field id={`${ids}-mode`} label="Mode">
              <SearchableSelect
                id={`${ids}-mode`}
                value={form.mode}
                options={MODE_OPTIONS}
                onChange={t.setMode}
                disabled={!editable}
              />
            </Field>
            <Field id={`${ids}-threshold`} label={thresholdCaption(form.mode)}>
              <NumberBox
                id={`${ids}-threshold`}
                value={form.threshold}
                decimals={thresholdDecimals(form.mode)}
                max={999999999.99}
                disabled={!editable || !thresholdEnabled(form.mode)}
                onChange={(threshold) => t.update({ threshold })}
              />
            </Field>
            <Field id={`${ids}-channel`} label="Channel">
              <SearchableSelect
                id={`${ids}-channel`}
                value={form.channel}
                options={CHANNEL_OPTIONS}
                onChange={(channel) => t.update({ channel })}
                disabled={!details}
              />
            </Field>
            <Field id={`${ids}-level`} label="Min level">
              <SearchableSelect
                id={`${ids}-level`}
                value={form.minRole}
                options={LEVEL_OPTIONS}
                onChange={(minRole) => t.update({ minRole })}
                disabled={!details}
              />
            </Field>
            <Field id={`${ids}-expire`} label="Expire (min)">
              <NumberBox
                id={`${ids}-expire`}
                value={form.expire}
                decimals={0}
                max={100000}
                disabled={!details}
                onChange={(expire) => t.update({ expire })}
              />
            </Field>
            <Field id={`${ids}-from`} label="Effective from">
              <DateBox id={`${ids}-from`} value={form.from} disabled={!editable} onChange={(from) => t.update({ from })} />
            </Field>
            <div className={styles.ruleChecks}>
              <Check
                label="Two approvers"
                checked={form.twoPerson}
                disabled={!details}
                onChange={(twoPerson) => t.update({ twoPerson })}
              />
              <Check
                label="Requester may approve"
                checked={form.allowSelf}
                disabled={!details}
                onChange={(allowSelf) => t.update({ allowSelf })}
              />
              <Check
                label="Counter waits for it"
                checked={form.blocksTill}
                disabled={!details}
                onChange={(blocksTill) => t.update({ blocksTill })}
              />
            </div>
          </form>

          <div className={styles.buttonRow}>
            {t.scopeBranch ? (
              <button
                type="button"
                className={styles.secondaryButton}
                disabled={t.saving || !t.event}
                onClick={() => void t.overrideAtCompany()}
              >
                Override at company
              </button>
            ) : null}
            <button
              type="button"
              className={styles.dangerButton}
              disabled={!canDelete || !t.own || t.saving}
              onClick={() => void t.removeRow()}
            >
              {t.scopeBranch ? "Remove branch row" : "Remove company row"}
            </button>
          </div>
          {t.warning ? <p className={styles.warning}>{t.warning}</p> : null}
        </section>
      </div>
    </div>
  );
}
