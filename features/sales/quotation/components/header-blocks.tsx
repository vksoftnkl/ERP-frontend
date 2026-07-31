"use client";

/**
 * The four header blocks: customer, sales info, quotation info and terms.
 *
 * All four are controlled from the draft, so the Qt screen's six `QSignalBlocker`
 * guards on the validity pair, the place-of-supply dropdown and the load path
 * have no counterpart here: a controlled input cannot re-enter its own handler.
 *
 * Customer / Sales info / Quotation render as plain columns (no per-block
 * border or legend) — the caller lays out all three inside one shared bordered
 * panel, matching the legacy screen's single continuous header rather than
 * three separate framed boxes. Terms keeps its own `GroupBox`.
 */
import {
  CUSTOMER_DROPDOWN_ID,
  POS_DROPDOWN_ID,
  PRICE_LEVEL_OPTIONS,
  QUOTATION_STATUSES,
  SALESMAN_DROPDOWN_ID,
  AGENT_DROPDOWN_ID,
} from "../quotation.constants";
import type { VoucherPolicy } from "@/domain/pricing";
import type { CustomerSnapshot, QuotationHeader, QuotationTerms } from "../quotation.types";
import {
  CheckField,
  DateField,
  DropdownCombo,
  Field,
  GroupBox,
  NumberField,
  ReadOnlyField,
  SelectField,
  TextField,
} from "./fields";
import styles from "../page.module.scss";

const STATUS_OPTIONS = QUOTATION_STATUSES.map((status) => ({
  value: status,
  label: status.charAt(0) + status.slice(1).toLowerCase(),
}));

const PRICE_LEVEL_SELECT = PRICE_LEVEL_OPTIONS.map((option) => ({ ...option }));

/**
 * Lower case on purpose: these values are both stored verbatim on the voucher and
 * sent back as `/item-price`'s `freight_type` / `loading_type`, which are closed
 * sets. `freight` has no `auto` — distance slabs are a separate lookup.
 */
const FREIGHT_BASIS_OPTIONS = [
  { value: "manual", label: "Typed in by hand" },
  { value: "item_basis", label: "From the item master" },
] as const;

const LOADING_BASIS_OPTIONS = [
  { value: "manual", label: "Typed in by hand" },
  { value: "item_basis", label: "From the item master" },
  { value: "auto", label: "Automatic (weight slab)" },
] as const;

export type CustomerBlockProps = {
  customer: CustomerSnapshot;
  header: QuotationHeader;
  disabled: boolean;
  onPickCustomer: (customerId: string, label: string) => void;
  onSetPos: (stateCode: string, stateName: string) => void;
};

export function CustomerBlock({
  customer,
  header,
  disabled,
  onPickCustomer,
  onSetPos,
}: CustomerBlockProps) {
  return (
    <div className={styles.fieldGrid}>
      <DropdownCombo
        id="quotation-customer"
        label="Existing Customer"
        dropdownId={CUSTOMER_DROPDOWN_ID}
        valueKey="cus_id"
        labelKey="cus_name"
        value={customer.custId ?? ""}
        selectedLabel={customer.name}
        disabled={disabled}
        placeholder="Search customers…"
        onSelect={onPickCustomer}
      />
      <ReadOnlyField label="Customer Name" value={customer.name} />
      <ReadOnlyField label="Address" value={customer.address ?? ""} />
      <ReadOnlyField label="Place" value={customer.place ?? ""} />
      <ReadOnlyField label="Phone" value={customer.phone ?? ""} />
      <ReadOnlyField label="GSTIN" value={customer.gstin ?? ""} />
      <DropdownCombo
        id="quotation-pos"
        label="POS State Code"
        dropdownId={POS_DROPDOWN_ID}
        valueKey="state_code"
        labelKey="state_name"
        metaKey="state_code"
        value={header.posStateCode}
        selectedLabel={header.posStateName || header.posStateCode}
        disabled={disabled}
        onSelect={onSetPos}
      />
      <ReadOnlyField label="Area" value={customer.areaName ?? ""} />
      {customer.debitAllowed ? (
        <p className={styles.inlineHint}>
          Credit {customer.debitDays} days, limit {customer.debitLimit}
          {customer.billedDate ? ` · last billed ${customer.billedDate}` : ""}
          {customer.overdueBilling ? " · overdue" : ""}
        </p>
      ) : null}
      {!customer.allowDiscount ? (
        <p className={`${styles.inlineHint} ${styles.warning}`}>
          This customer is flagged as no-discount.
        </p>
      ) : null}
    </div>
  );
}

export type QuoteInfoBlockProps = {
  header: QuotationHeader;
  quoteRefno: string;
  status: string;
  disabled: boolean;
  onSetHeader: (field: keyof QuotationHeader, value: string | number | boolean) => void;
  onSetStatus: (status: string) => void;
};

export function QuoteInfoBlock({
  header,
  quoteRefno,
  status,
  disabled,
  onSetHeader,
  onSetStatus,
}: QuoteInfoBlockProps) {
  return (
    <div className={styles.fieldGrid}>
      {/* The voucher number is allocated by the server inside the create
          transaction and there is no peek endpoint, so it is blank until the
          first successful save. */}
      <ReadOnlyField label="Quote No" value={quoteRefno || "(auto)"} />
      <TextField
        id="quotation-usr-refno"
        label="Ref No"
        value={header.usrRefno}
        disabled={disabled}
        maxLength={100}
        onChange={(value) => onSetHeader("usrRefno", value)}
      />
      <DateField
        id="quotation-date"
        label="Quote Date"
        value={header.quoteDate}
        disabled={disabled}
        onChange={(value) => onSetHeader("quoteDate", value)}
      />
      <DateField
        id="quotation-valid-until"
        label="Valid Until"
        value={header.validUntil}
        disabled={disabled}
        onChange={(value) => onSetHeader("validUntil", value)}
      />
      {/* Two views of one period: editing the days re-derives the date and
          editing the date re-derives the days. */}
      <NumberField
        id="quotation-validity-days"
        label="Validity Days"
        value={header.validityDays}
        disabled={disabled}
        min={0}
        onChange={(value) => onSetHeader("validityDays", value)}
      />
      <SelectField
        id="quotation-status"
        label="Status"
        value={status}
        options={STATUS_OPTIONS}
        disabled={disabled}
        onChange={onSetStatus}
      />
      <SelectField
        id="quotation-price-level"
        label="Price Level"
        value={String(header.priceLevel)}
        options={PRICE_LEVEL_SELECT}
        disabled={disabled}
        onChange={(value) => onSetHeader("priceLevel", Number.parseInt(value, 10) || 1)}
      />
    </div>
  );
}

export type SalesInfoBlockProps = {
  header: QuotationHeader;
  policy: VoucherPolicy;
  disabled: boolean;
  onSetHeader: (field: keyof QuotationHeader, value: string | number | boolean) => void;
  onSetSalesman: (id: string, name: string) => void;
  onSetAgent: (id: string, name: string) => void;
  onSetPolicy: (policy: Partial<VoucherPolicy>) => void;
};

export function SalesInfoBlock({
  header,
  policy,
  disabled,
  onSetHeader,
  onSetSalesman,
  onSetAgent,
  onSetPolicy,
}: SalesInfoBlockProps) {
  return (
    <div className={styles.fieldGrid}>
      <DropdownCombo
        id="quotation-salesman"
        label="Salesman"
        dropdownId={SALESMAN_DROPDOWN_ID}
        valueKey="emp_id"
        labelKey="emp_name"
        value={header.salesmanId ?? ""}
        selectedLabel={header.salesmanName}
        disabled={disabled}
        onSelect={(value, label) => onSetSalesman(value, label)}
      />
      <DropdownCombo
        id="quotation-agent"
        label="Agent"
        dropdownId={AGENT_DROPDOWN_ID}
        valueKey="emp_id"
        labelKey="emp_name"
        value={header.agentId ?? ""}
        selectedLabel={header.agentName}
        disabled={disabled}
        onSelect={(value, label) => onSetAgent(value, label)}
      />
      <TextField
        id="quotation-contact-person"
        label="Contact Person"
        value={header.contactPerson}
        disabled={disabled}
        maxLength={150}
        onChange={(value) => onSetHeader("contactPerson", value)}
      />
      <TextField
        id="quotation-contact-no"
        label="Contact No"
        value={header.contactNo}
        disabled={disabled}
        maxLength={20}
        onChange={(value) => onSetHeader("contactNo", value)}
      />
      <div className={styles.checkRow}>
        <CheckField
          label="Freight"
          checked={header.hasFreight}
          disabled={disabled}
          onChange={(checked) => onSetHeader("hasFreight", checked)}
        />
        <CheckField
          label="Load"
          checked={header.hasLoad}
          disabled={disabled}
          onChange={(checked) => onSetHeader("hasLoad", checked)}
        />
        <CheckField
          label="Unload"
          checked={header.hasUnload}
          disabled={disabled}
          onChange={(checked) => onSetHeader("hasUnload", checked)}
        />
        <CheckField
          label="Promo"
          checked={header.hasPromo}
          disabled={disabled}
          onChange={(checked) => onSetHeader("hasPromo", checked)}
        />
      </div>
      {/*
        These three are the voucher's own charge policy — `sq_freight_calc_type`,
        `sq_loading_calc_type` and `sq_disc_alter_base`. They exist on
        `sale_quotation` and NOWHERE else: there is no company setting and no
        session field to seed them from, so leaving them implicit pinned every
        new quotation to `manual`, which in turn made the per-line freight and
        loading columns, the distance lookup and the role gate unreachable. A
        loaded document keeps its own snapshot and these controls show it.
      */}
      <SelectField
        id="quotation-freight-basis"
        label="Freight Basis"
        value={policy.freightCalcType}
        options={FREIGHT_BASIS_OPTIONS}
        disabled={disabled}
        onChange={(value) => onSetPolicy({ freightCalcType: value })}
      />
      <SelectField
        id="quotation-loading-basis"
        label="Loading Basis"
        value={policy.loadingCalcType}
        options={LOADING_BASIS_OPTIONS}
        disabled={disabled}
        onChange={(value) => onSetPolicy({ loadingCalcType: value })}
      />
      <div className={styles.checkRow}>
        <CheckField
          label="Discount alters the base rate"
          checked={policy.discountAlterBaseRate}
          disabled={disabled}
          onChange={(checked) => onSetPolicy({ discountAlterBaseRate: checked })}
        />
      </div>
    </div>
  );
}

export type TermsBlockProps = {
  terms: QuotationTerms;
  disabled: boolean;
  onSetTerms: (field: keyof QuotationTerms, value: string) => void;
};

export function TermsBlock({ terms, disabled, onSetTerms }: TermsBlockProps) {
  return (
    <GroupBox title="Terms">
      <div className={`${styles.fieldGrid} ${styles.fieldGridWide}`}>
        <Field label="Remarks" htmlFor="quotation-remarks">
          <textarea
            id="quotation-remarks"
            className={styles.textarea}
            value={terms.remarks}
            disabled={disabled}
            maxLength={500}
            onChange={(event) => onSetTerms("remarks", event.target.value)}
          />
        </Field>
        <Field label="Payment Terms" htmlFor="quotation-payment-terms">
          <input
            id="quotation-payment-terms"
            className={styles.input}
            value={terms.paymentTerms}
            disabled={disabled}
            maxLength={250}
            autoComplete="off"
            onChange={(event) => onSetTerms("paymentTerms", event.target.value)}
          />
        </Field>
        <Field label="Delivery Terms" htmlFor="quotation-delivery-terms">
          <input
            id="quotation-delivery-terms"
            className={styles.input}
            value={terms.deliveryTerms}
            disabled={disabled}
            maxLength={250}
            autoComplete="off"
            onChange={(event) => onSetTerms("deliveryTerms", event.target.value)}
          />
        </Field>
        <Field label="Other Terms" htmlFor="quotation-tc">
          <textarea
            id="quotation-tc"
            className={styles.textarea}
            value={terms.termsConditions}
            disabled={disabled}
            onChange={(event) => onSetTerms("termsConditions", event.target.value)}
          />
        </Field>
      </div>
    </GroupBox>
  );
}
