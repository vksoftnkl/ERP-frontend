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
  AREA_DROPDOWN_ID,
  CUSTOMER_DROPDOWN_ID,
  POS_DROPDOWN_ID,
  SALESMAN_DROPDOWN_ID,
  AGENT_DROPDOWN_ID,
} from "../quotation.constants";
import type {
  CustomerSnapshot,
  EditableCustomerField,
  QuotationHeader,
  QuotationTerms,
} from "../quotation.types";
import {
  CheckField,
  DateField,
  DropdownCombo,
  Field,
  GroupBox,
  NumberField,
  ReadOnlyInput,
  SelectField,
  TextField,
} from "./fields";
import styles from "../page.module.scss";

/**
 * Lower case on purpose: these values are both stored verbatim on the voucher and
 * sent back as `/item-price`'s `freight_type` / `loading_type`, which are closed
 * sets. `freight` has no `auto` — distance slabs are a separate lookup.
 */
export type CustomerBlockProps = {
  customer: CustomerSnapshot;
  header: QuotationHeader;
  disabled: boolean;
  onPickCustomer: (customerId: string, label: string) => void;
  onSetCustomerField: (field: EditableCustomerField, value: string) => void;
  onSetPos: (stateCode: string, stateName: string) => void;
};

export function CustomerBlock({
  customer,
  header,
  disabled,
  onPickCustomer,
  onSetCustomerField,
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
      {/* Keyed, not just displayed: the document stores its own copy of these,
          so they can be corrected for this quotation — or typed outright for a
          walk-in with no master record. Max lengths match the save payload. */}
      <TextField
        id="quotation-customer-name"
        label="Customer Name"
        value={customer.name}
        disabled={disabled}
        maxLength={200}
        onChange={(value) => onSetCustomerField("name", value)}
      />
      <TextField
        id="quotation-customer-address"
        label="Address"
        value={customer.address ?? ""}
        disabled={disabled}
        maxLength={500}
        onChange={(value) => onSetCustomerField("address", value)}
      />
      <TextField
        id="quotation-customer-place"
        label="Place"
        value={customer.place ?? ""}
        disabled={disabled}
        maxLength={100}
        onChange={(value) => onSetCustomerField("place", value)}
      />
      <TextField
        id="quotation-customer-phone"
        label="Phone"
        value={customer.phone ?? ""}
        disabled={disabled}
        maxLength={20}
        onChange={(value) => onSetCustomerField("phone", value)}
      />
      <TextField
        id="quotation-customer-gstin"
        label="GSTIN"
        value={customer.gstin ?? ""}
        disabled={disabled}
        maxLength={15}
        onChange={(value) => onSetCustomerField("gstin", value.toUpperCase())}
      />
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
      {/* The area lives in the sales block as "Beat", where the operator can
          change it — the customer master only seeds it. */}
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
  /** `inventory.item_price_levels`, level number → its configured name. */
  priceLevelOptions: ReadonlyArray<{ value: string; label: string }>;
  disabled: boolean;
  onSetHeader: (field: keyof QuotationHeader, value: string | number | boolean) => void;
};

export function QuoteInfoBlock({
  header,
  quoteRefno,
  priceLevelOptions,
  disabled,
  onSetHeader,
}: QuoteInfoBlockProps) {
  return (
    <div className={styles.fieldGrid}>
      {/* The voucher number is allocated by the server inside the create
          transaction and there is no peek endpoint, so it is blank until the
          first successful save. */}
      <ReadOnlyInput
        id="quotation-quote-no"
        label="Quote No"
        value={quoteRefno}
        placeholder="(auto)"
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
      {/* Status is not an operator field on this screen: a new quotation is
          stamped DRAFT and a loaded one keeps the status it was saved with. */}
      <SelectField
        id="quotation-price-level"
        label="Price Level"
        value={String(header.priceLevel)}
        options={priceLevelOptions}
        disabled={disabled}
        onChange={(value) => onSetHeader("priceLevel", Number.parseInt(value, 10) || 1)}
      />
    </div>
  );
}

export type SalesInfoBlockProps = {
  header: QuotationHeader;
  /** Display name for the header's `areaId`, which is all the voucher stores. */
  beatName: string;
  disabled: boolean;
  onSetHeader: (field: keyof QuotationHeader, value: string | number | boolean) => void;
  onSetBeat: (areaId: string, areaName: string) => void;
  onSetSalesman: (id: string, name: string) => void;
  onSetAgent: (id: string, name: string) => void;
};

export function SalesInfoBlock({
  header,
  beatName,
  disabled,
  onSetHeader,
  onSetBeat,
  onSetSalesman,
  onSetAgent,
}: SalesInfoBlockProps) {
  return (
    <div className={styles.fieldGrid}>
      <DropdownCombo
        id="quotation-beat"
        label="Beat"
        dropdownId={AREA_DROPDOWN_ID}
        valueKey="arm_id"
        labelKey="arm_name"
        value={header.areaId ?? ""}
        selectedLabel={beatName}
        disabled={disabled}
        onSelect={onSetBeat}
      />
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
        Freight Basis, Loading Basis and "discount alters the base rate" used to
        be three controls here. They are not operator choices on this screen: the
        voucher takes the fixed policy `seedDocumentPolicy` stamps on it
        (`manual` / `manual` / off), which is what these controls always showed
        anyway. A LOADED document still prices with the policy it was saved
        under — that snapshot is data, not a default.
      */}
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
