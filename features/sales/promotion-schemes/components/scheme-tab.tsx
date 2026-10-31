"use client";

/**
 * The Scheme tab — Qt `tabScheme`: five headed sections, three caption/field
 * pairs to a line, in the .ui's own order. Every field and its caption carry
 * the same hover hint (Qt `setupHints`).
 */
import type { ReactNode } from "react";
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { DateInput, Input, Select } from "@/components/design-system/ui";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { useGetPriceLevelsQuery } from "@/store/api/quotationApi";
import {
  APPLY_ON_CHOICES,
  BENEFIT_CHOICES,
  BILL_TYPE_CHOICES,
  CALC_ON_CHOICES,
  FIELD_HINTS,
  SCOPE_CHOICES,
  STACK_MODE_CHOICES,
  STATUS_CHOICES,
  WEEKDAYS,
  WEEKDAY_LABELS,
  type Choice,
  type PromotionApplyOn,
  type PromotionBenefit,
  type PromotionStatus,
} from "../promotion-schemes.vocab";
import { acceptNumberText, type SchemeAction, type SchemeHeader } from "../promotion-schemes.state";
import { Time12Input } from "./time12-input";
import styles from "../page.module.scss";

/** The id of a header field's control, and the focus key a validation names it by. */
export function headerFieldId(field: keyof SchemeHeader): string {
  return `promotion-scheme-${field}`;
}

type SchemeTabProps = {
  header: SchemeHeader;
  dispatch: (action: SchemeAction) => void;
  onStatus: (status: PromotionStatus) => void;
  onApplyOn: (applyOn: PromotionApplyOn) => void;
  onBenefit: (benefit: PromotionBenefit) => void;
};

function Section({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionHeading}>
        <span>
          {title}
          {sub ? <span className={styles.sectionSub}> · {sub}</span> : null}
        </span>
      </h3>
      {children}
    </section>
  );
}

function Pair({
  field,
  caption,
  hint,
  required,
  children,
}: {
  field: keyof SchemeHeader | string;
  caption: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  const id = headerFieldId(field as keyof SchemeHeader);
  return (
    <div className={styles.pair}>
      <label className={styles.caption} htmlFor={id} title={hint}>
        {caption}
        {required ? " *" : ""}
      </label>
      <div className={styles.pairField}>{children}</div>
    </div>
  );
}

function ChoiceSelect<T extends string>({
  field,
  value,
  choices,
  hint,
  onChange,
}: {
  field: keyof SchemeHeader;
  value: T;
  choices: readonly Choice<T>[];
  hint?: string;
  onChange: (value: T) => void;
}) {
  const id = headerFieldId(field);
  return (
    <Select
      id={id}
      className={styles.fieldControl}
      data-walk="true"
      data-focus-key={`field:${id}`}
      title={hint}
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {choices.map((choice) => (
        <option key={choice.code} value={choice.code}>
          {choice.label}
        </option>
      ))}
    </Select>
  );
}

function NumberBox({
  field,
  value,
  decimals,
  max,
  hint,
  placeholder,
  onChange,
}: {
  field: keyof SchemeHeader;
  value: string;
  decimals: number;
  max?: number;
  hint?: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const id = headerFieldId(field);
  return (
    <Input
      id={id}
      className={`${styles.fieldControl} ${styles.numberControl}`}
      data-walk="true"
      data-focus-key={`field:${id}`}
      inputMode={decimals > 0 ? "decimal" : "numeric"}
      title={hint}
      placeholder={placeholder}
      value={value}
      onChange={(event) => {
        const next = event.target.value.trim();
        if (acceptNumberText(next, decimals, max)) onChange(next);
      }}
    />
  );
}

function Check({
  field,
  label,
  checked,
  hint,
  onChange,
}: {
  field: string;
  label?: string;
  checked: boolean;
  hint?: string;
  onChange: (checked: boolean) => void;
}) {
  const id = headerFieldId(field as keyof SchemeHeader);
  return (
    <label className={styles.checkLabel} title={hint}>
      <input
        id={id}
        type="checkbox"
        data-walk="true"
        data-focus-key={`field:${id}`}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

/** "0 - Uncapped" is what a 0 in a max-uses box means (Qt `specialValueText`). */
function CapBox({
  field,
  value,
  hint,
  onChange,
}: {
  field: "maxUsesTotal" | "maxUsesPerCust";
  value: string;
  hint: string;
  onChange: (value: string) => void;
}) {
  return (
    <NumberBox
      field={field}
      value={value === "0" ? "" : value}
      decimals={0}
      max={999999999}
      hint={hint}
      placeholder="0 - Uncapped"
      onChange={(next) => onChange(next === "" ? "0" : next)}
    />
  );
}

export function SchemeTab({ header: h, dispatch, onStatus, onApplyOn, onBenefit }: SchemeTabProps) {
  const set = (patch: Partial<SchemeHeader>) => dispatch({ type: "header", patch });
  const companyDropdownId = useDropdownId("company");
  const { data: priceLevels = [] } = useGetPriceLevelsQuery();
  const idOf = headerFieldId;

  return (
    <div className={styles.schemePane}>
      <Section title="Identity">
        <div className={styles.pairGrid}>
          <Pair field="code" caption="Code" required hint={FIELD_HINTS.code}>
            <Input
              id={idOf("code")}
              className={styles.fieldControl}
              data-walk="true"
              data-required="true"
              data-focus-key={`field:${idOf("code")}`}
              maxLength={30}
              title={FIELD_HINTS.code}
              value={h.code}
              onChange={(event) => set({ code: event.target.value })}
            />
          </Pair>
          <Pair field="name" caption="Name" required hint={FIELD_HINTS.name}>
            <Input
              id={idOf("name")}
              className={styles.fieldControl}
              data-walk="true"
              data-required="true"
              data-focus-key={`field:${idOf("name")}`}
              maxLength={150}
              title={FIELD_HINTS.name}
              value={h.name}
              onChange={(event) => set({ name: event.target.value })}
            />
          </Pair>
          <Pair field="status" caption="Status" hint={FIELD_HINTS.status}>
            <ChoiceSelect field="status" value={h.status} choices={STATUS_CHOICES} hint={FIELD_HINTS.status} onChange={onStatus} />
          </Pair>
          <Pair field="approvedByLabel" caption="Approved By" hint={FIELD_HINTS.approvedBy}>
            <span id={idOf("approvedByLabel")} className={styles.readOnlyValue} title={FIELD_HINTS.approvedBy}>
              {h.approvedByLabel}
            </span>
          </Pair>
          <Pair field="priority" caption="Priority" hint={FIELD_HINTS.priority}>
            {/* ck_prm_priority BETWEEN 1 AND 9 — unreachable, not merely checked. */}
            <Input
              id={idOf("priority")}
              type="number"
              min={1}
              max={9}
              step={1}
              className={`${styles.fieldControl} ${styles.spinControl}`}
              data-walk="true"
              data-focus-key={`field:${idOf("priority")}`}
              title={FIELD_HINTS.priority}
              value={String(h.priority)}
              onChange={(event) => {
                const next = Math.trunc(Number(event.target.value));
                if (Number.isFinite(next) && next >= 1 && next <= 9) set({ priority: next });
              }}
            />
          </Pair>
          <Pair field="stackMode" caption="Stacking" hint={FIELD_HINTS.stackMode}>
            <ChoiceSelect
              field="stackMode"
              value={h.stackMode}
              choices={STACK_MODE_CHOICES}
              hint={FIELD_HINTS.stackMode}
              onChange={(stackMode) => set({ stackMode })}
            />
          </Pair>
        </div>
        <div className={styles.checkRow}>
          <Check field="autoApply" label="Auto Apply" checked={h.autoApply} onChange={(autoApply) => set({ autoApply })} />
          <Check
            field="allowManualDisc"
            label="Allow Over Keyed Disc."
            checked={h.allowManualDisc}
            onChange={(allowManualDisc) => set({ allowManualDisc })}
          />
        </div>
      </Section>

      <Section title="The Offer" sub="what triggers it × what it gives">
        <div className={styles.pairGrid}>
          <Pair field="applyOn" caption="Apply on" hint={FIELD_HINTS.applyOn}>
            <ChoiceSelect field="applyOn" value={h.applyOn} choices={APPLY_ON_CHOICES} hint={FIELD_HINTS.applyOn} onChange={onApplyOn} />
          </Pair>
          <Pair field="benefit" caption="Benefit" hint={FIELD_HINTS.benefit}>
            <ChoiceSelect field="benefit" value={h.benefit} choices={BENEFIT_CHOICES} hint={FIELD_HINTS.benefit} onChange={onBenefit} />
          </Pair>
          <Pair field="pairChip" caption="Combination" hint={FIELD_HINTS.pairChip}>
            <span id={idOf("pairChip" as keyof SchemeHeader)} className={styles.pairChip} title={FIELD_HINTS.pairChip}>
              {h.applyOn}  ×  {h.benefit}
            </span>
          </Pair>
          <Pair field="billType" caption="Bill Type" hint={FIELD_HINTS.billType}>
            <ChoiceSelect
              field="billType"
              value={h.billType}
              choices={BILL_TYPE_CHOICES}
              hint={FIELD_HINTS.billType}
              onChange={(billType) => set({ billType })}
            />
          </Pair>
          <Pair field="minQty" caption="Min Qty" hint={FIELD_HINTS.minQty}>
            <NumberBox field="minQty" value={h.minQty} decimals={3} hint={FIELD_HINTS.minQty} onChange={(minQty) => set({ minQty })} />
          </Pair>
          <Pair field="minBillAmount" caption="Min Bill Amt" hint={FIELD_HINTS.minBillAmount}>
            <NumberBox
              field="minBillAmount"
              value={h.minBillAmount}
              decimals={2}
              hint={FIELD_HINTS.minBillAmount}
              onChange={(minBillAmount) => set({ minBillAmount })}
            />
          </Pair>
          <Pair field="calcOn" caption="Measure On" hint={FIELD_HINTS.calcOn}>
            <ChoiceSelect field="calcOn" value={h.calcOn} choices={CALC_ON_CHOICES} hint={FIELD_HINTS.calcOn} onChange={(calcOn) => set({ calcOn })} />
          </Pair>
          <Pair field="priceLevelId" caption="Price Level" hint={FIELD_HINTS.priceLevel}>
            <Select
              id={idOf("priceLevelId")}
              className={styles.fieldControl}
              data-walk="true"
              data-focus-key={`field:${idOf("priceLevelId")}`}
              title={FIELD_HINTS.priceLevel}
              value={h.priceLevelId}
              onChange={(event) => set({ priceLevelId: event.target.value })}
            >
              <option value="">(every price level)</option>
              {priceLevels.map((level) => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
              {h.priceLevelId && !priceLevels.some((level) => level.value === h.priceLevelId) ? (
                <option value={h.priceLevelId}>Level {h.priceLevelId}</option>
              ) : null}
            </Select>
          </Pair>
        </div>
        <div className={styles.checkRow}>
          <Check field="includeTax" label="Include Tax" checked={h.includeTax} onChange={(includeTax) => set({ includeTax })} />
        </div>
      </Section>

      <Section title="Where It Runs" sub="the chain switches">
        <div className={styles.pairGrid}>
          <Pair field="companyId" caption="Company" required hint={FIELD_HINTS.company}>
            <div className={styles.fieldControl} title={FIELD_HINTS.company} data-focus-key={`field:${idOf("companyId")}`}>
              <NexDropdownSingle
                id={idOf("companyId")}
                dropdownId={companyDropdownId}
                value={h.companyId ? { id: h.companyId, text: h.companyName } : null}
                onChange={(picked) => set({ companyId: picked?.id ?? "", companyName: picked?.text ?? "" })}
                placeholder="Choose the company"
                aria-label="Company"
              />
            </div>
          </Pair>
          <Pair field="branchScope" caption="Branch Scope" hint={FIELD_HINTS.branchScope}>
            <ChoiceSelect
              field="branchScope"
              value={h.branchScope}
              choices={SCOPE_CHOICES}
              hint={FIELD_HINTS.branchScope}
              onChange={(branchScope) => set({ branchScope })}
            />
          </Pair>
          <Pair field="custScope" caption="Cust Scope" hint={FIELD_HINTS.custScope}>
            <ChoiceSelect
              field="custScope"
              value={h.custScope}
              choices={SCOPE_CHOICES}
              hint={FIELD_HINTS.custScope}
              onChange={(custScope) => set({ custScope })}
            />
          </Pair>
          <Pair field="itemScope" caption="Item Scope" hint={FIELD_HINTS.itemScope}>
            <ChoiceSelect
              field="itemScope"
              value={h.itemScope}
              choices={SCOPE_CHOICES}
              hint={FIELD_HINTS.itemScope}
              onChange={(itemScope) => set({ itemScope })}
            />
          </Pair>
        </div>
      </Section>

      <Section title="When It Runs">
        <div className={styles.pairGrid}>
          <Pair field="startDate" caption="Start Date" required hint={FIELD_HINTS.startDate}>
            <DateInput
              id={idOf("startDate")}
              block
              className="ui-input"
              data-walk="true"
              data-focus-key={`field:${idOf("startDate")}`}
              title={FIELD_HINTS.startDate}
              wrapperClassName={`${styles.fieldControl} ${styles.dateControl}`}
              value={h.startDate}
              onChange={(startDate) => set({ startDate })}
            />
          </Pair>
          <Pair field="endDate" caption="End Date" required hint={FIELD_HINTS.endDate}>
            <DateInput
              id={idOf("endDate")}
              block
              className="ui-input"
              data-walk="true"
              data-focus-key={`field:${idOf("endDate")}`}
              title={FIELD_HINTS.endDate}
              wrapperClassName={`${styles.fieldControl} ${styles.dateControl}`}
              value={h.endDate}
              onChange={(endDate) => set({ endDate })}
            />
          </Pair>
          <Pair field="timeWindow" caption="Time Window" hint={FIELD_HINTS.timeWindow}>
            <Check field="timeWindow" checked={h.timeWindow} hint={FIELD_HINTS.timeWindow} onChange={(timeWindow) => set({ timeWindow })} />
          </Pair>
          <Pair field="fromTime" caption="From Time" hint={FIELD_HINTS.fromTime}>
            <Time12Input
              id={idOf("fromTime")}
              className={styles.fieldControl}
              value={h.fromTime}
              disabled={!h.timeWindow}
              title={FIELD_HINTS.fromTime}
              onChange={(fromTime) => set({ fromTime })}
            />
          </Pair>
          <Pair field="toTime" caption="To Time" hint={FIELD_HINTS.toTime}>
            <Time12Input
              id={idOf("toTime")}
              className={styles.fieldControl}
              value={h.toTime}
              disabled={!h.timeWindow}
              title={FIELD_HINTS.toTime}
              onChange={(toTime) => set({ toTime })}
            />
          </Pair>
          <Pair field="remarks" caption="Remarks" hint={FIELD_HINTS.remarks}>
            <Input
              id={idOf("remarks")}
              className={styles.fieldControl}
              data-walk="true"
              data-focus-key={`field:${idOf("remarks")}`}
              title={FIELD_HINTS.remarks}
              value={h.remarks}
              onChange={(event) => set({ remarks: event.target.value })}
            />
          </Pair>
        </div>
        <div className={styles.checkRow} title={FIELD_HINTS.weekdays}>
          <span className={styles.caption}>Weekdays</span>
          {WEEKDAYS.map((day) => (
            <Check
              key={day}
              field={`weekday-${day}`}
              label={WEEKDAY_LABELS[day]}
              checked={h.weekdays.includes(day)}
              hint={FIELD_HINTS.weekdays}
              onChange={(on) =>
                set({ weekdays: WEEKDAYS.filter((d) => (d === day ? on : h.weekdays.includes(d))) })
              }
            />
          ))}
        </div>
      </Section>

      <Section title="Caps & Coupon" sub="counted across every branch">
        <div className={styles.pairGrid}>
          <Pair field="maxBenefitPerBill" caption="Max Benefit/Bill" hint={FIELD_HINTS.maxBenefitPerBill}>
            <NumberBox
              field="maxBenefitPerBill"
              value={h.maxBenefitPerBill}
              decimals={2}
              hint={FIELD_HINTS.maxBenefitPerBill}
              onChange={(maxBenefitPerBill) => set({ maxBenefitPerBill })}
            />
          </Pair>
          <Pair field="budget" caption="Budget" hint={FIELD_HINTS.budget}>
            <NumberBox field="budget" value={h.budget} decimals={2} hint={FIELD_HINTS.budget} onChange={(budget) => set({ budget })} />
          </Pair>
          <Pair field="maxUsesTotal" caption="Max Uses" hint={FIELD_HINTS.maxUsesTotal}>
            <CapBox field="maxUsesTotal" value={h.maxUsesTotal} hint={FIELD_HINTS.maxUsesTotal} onChange={(maxUsesTotal) => set({ maxUsesTotal })} />
          </Pair>
          <Pair field="maxUsesPerCust" caption="Max Uses/Cust" hint={FIELD_HINTS.maxUsesPerCust}>
            <CapBox
              field="maxUsesPerCust"
              value={h.maxUsesPerCust}
              hint={FIELD_HINTS.maxUsesPerCust}
              onChange={(maxUsesPerCust) => set({ maxUsesPerCust })}
            />
          </Pair>
          <Pair field="couponBatchId" caption="Coupon" hint={FIELD_HINTS.couponBatch}>
            {/* No endpoint serves coupon batches yet: a held batch is posted back unchanged. */}
            <Select id={idOf("couponBatchId")} className={styles.fieldControl} disabled title={FIELD_HINTS.couponBatch} value="">
              <option value="">(none — applies automatically)</option>
            </Select>
          </Pair>
        </div>
      </Section>
    </div>
  );
}
