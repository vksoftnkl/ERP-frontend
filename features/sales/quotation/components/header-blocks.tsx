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
 *
 * Every field in those three columns is gated on `fields` (see
 * `visible-settings.tsx`): the deployment's widget config decides which of them
 * this site shows and what it calls them. Terms reads the same config through
 * its own section — a screen that passes no config (the sale order) gets the
 * block exactly as authored.
 */
import type { MouseEvent as ReactMouseEvent } from "react";
import {
  AREA_DROPDOWN_ID,
  CUSTOMER_DROPDOWN_ID,
  POS_DROPDOWN_ID,
  SALESMAN_DROPDOWN_ID,
  AGENT_DROPDOWN_ID,
  QUOTATION_TERMS_FIELD_NAMES,
  type QuotationTermsFieldKey,
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
import type { HeaderFieldConfig, TermsFieldConfig } from "./visible-settings";
import styles from "../page.module.scss";

/**
 * Lower case on purpose: these values are both stored verbatim on the voucher and
 * sent back as `/item-price`'s `freight_type` / `loading_type`, which are closed
 * sets. `freight` has no `auto` — distance slabs are a separate lookup.
 */
export type CustomerBlockProps = {
  customer: CustomerSnapshot;
  header: QuotationHeader;
  fields: HeaderFieldConfig;
  disabled: boolean;
  onPickCustomer: (customerId: string, label: string) => void;
  onSetCustomerField: (field: EditableCustomerField, value: string) => void;
  onSetPos: (stateCode: string, stateName: string) => void;
};

export function CustomerBlock({
  customer,
  header,
  fields,
  disabled,
  onPickCustomer,
  onSetCustomerField,
  onSetPos,
}: CustomerBlockProps) {
  return (
    <div className={styles.fieldGrid}>
      {fields.isVisible("existingCustomer") ? (
        <DropdownCombo
          id="quotation-customer"
          label={fields.labelFor("existingCustomer")}
          dropdownId={CUSTOMER_DROPDOWN_ID}
          valueKey="cus_id"
          labelKey="cus_name"
          value={customer.custId ?? ""}
          // The MASTER's name, not the document's editable copy — this box says
          // which customer record the quotation is linked to, and amending the
          // name below must not appear to relink it to something else.
          selectedLabel={customer.masterName}
          disabled={disabled}
          placeholder="Search customers…"
          onSelect={onPickCustomer}
        />
      ) : null}
      {/* Keyed, not just displayed: the document stores its own copy of these,
          so they can be corrected for this quotation — or typed outright for a
          walk-in with no master record. Max lengths match the save payload. */}
      {fields.isVisible("customerName") ? (
        <TextField
          id="quotation-customer-name"
          label={fields.labelFor("customerName")}
          value={customer.name}
          disabled={disabled}
          required
          maxLength={200}
          // Upper-cased as it is typed, the way the GSTIN field below is: the
          // customer master is keyed in capitals on this floor, so a quotation
          // typed in mixed case reads as a different party on the printed
          // document. A name PICKED from the master keeps the master's casing.
          onChange={(value) => onSetCustomerField("name", value.toUpperCase())}
        />
      ) : null}
      {fields.isVisible("address") ? (
        <TextField
          id="quotation-customer-address"
          label={fields.labelFor("address")}
          value={customer.address ?? ""}
          disabled={disabled}
          maxLength={500}
          onChange={(value) => onSetCustomerField("address", value)}
        />
      ) : null}
      {fields.isVisible("place") ? (
        <TextField
          id="quotation-customer-place"
          label={fields.labelFor("place")}
          value={customer.place ?? ""}
          disabled={disabled}
          maxLength={100}
          onChange={(value) => onSetCustomerField("place", value)}
        />
      ) : null}
      {fields.isVisible("phone") ? (
        <TextField
          id="quotation-customer-phone"
          label={fields.labelFor("phone")}
          value={customer.phone ?? ""}
          disabled={disabled}
          required
          maxLength={20}
          onChange={(value) => onSetCustomerField("phone", value)}
        />
      ) : null}
      {fields.isVisible("gstin") ? (
        <TextField
          id="quotation-customer-gstin"
          label={fields.labelFor("gstin")}
          value={customer.gstin ?? ""}
          disabled={disabled}
          maxLength={15}
          onChange={(value) => onSetCustomerField("gstin", value.toUpperCase())}
        />
      ) : null}
      {fields.isVisible("posStateCode") ? (
        <DropdownCombo
          id="quotation-pos"
          label={fields.labelFor("posStateCode")}
          dropdownId={POS_DROPDOWN_ID}
          valueKey="state_code"
          labelKey="state_name"
          metaKey="state_code"
          value={header.posStateCode}
          selectedLabel={header.posStateName || header.posStateCode}
          disabled={disabled}
          onSelect={onSetPos}
        />
      ) : null}
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
  fields: HeaderFieldConfig;
  disabled: boolean;
  onSetHeader: (field: keyof QuotationHeader, value: string | number | boolean) => void;
};

export function QuoteInfoBlock({
  header,
  quoteRefno,
  priceLevelOptions,
  fields,
  disabled,
  onSetHeader,
}: QuoteInfoBlockProps) {
  return (
    <div className={styles.fieldGrid}>
      {/* The voucher number is allocated by the server inside the create
          transaction and there is no peek endpoint, so it is blank until the
          first successful save. */}
      {fields.isVisible("quoteNo") ? (
        <ReadOnlyInput
          id="quotation-quote-no"
          label={fields.labelFor("quoteNo")}
          value={quoteRefno}
          placeholder="(auto)"
        />
      ) : null}
      {fields.isVisible("quoteDate") ? (
        <DateField
          id="quotation-date"
          label={fields.labelFor("quoteDate")}
          value={header.quoteDate}
          disabled={disabled}
          onChange={(value) => onSetHeader("quoteDate", value)}
        />
      ) : null}
      {/* Two views of one period: editing the days re-derives the date and
          editing the date re-derives the days. Hiding one leaves the other in
          charge of both — the derivation is the draft's, not the field's. */}
      {fields.isVisible("validUntil") ? (
        <DateField
          id="quotation-valid-until"
          label={fields.labelFor("validUntil")}
          value={header.validUntil}
          disabled={disabled}
          onChange={(value) => onSetHeader("validUntil", value)}
        />
      ) : null}
      {fields.isVisible("validityDays") ? (
        <NumberField
          id="quotation-validity-days"
          label={fields.labelFor("validityDays")}
          value={header.validityDays}
          disabled={disabled}
          min={0}
          onChange={(value) => onSetHeader("validityDays", value)}
        />
      ) : null}
      {/* Status is not an operator field on this screen: a new quotation is
          stamped DRAFT and a loaded one keeps the status it was saved with. */}
      {fields.isVisible("priceLevel") ? (
        <SelectField
          id="quotation-price-level"
          label={fields.labelFor("priceLevel")}
          value={String(header.priceLevel)}
          options={priceLevelOptions}
          disabled={disabled}
          onChange={(value) => onSetHeader("priceLevel", Number.parseInt(value, 10) || 1)}
        />
      ) : null}
    </div>
  );
}

export type SalesInfoBlockProps = {
  header: QuotationHeader;
  /** Display name for the header's `areaId`, which is all the voucher stores. */
  beatName: string;
  fields: HeaderFieldConfig;
  disabled: boolean;
  onSetHeader: (field: keyof QuotationHeader, value: string | number | boolean) => void;
  onSetBeat: (areaId: string, areaName: string) => void;
  onSetSalesman: (id: string, name: string) => void;
  onSetAgent: (id: string, name: string) => void;
};

export function SalesInfoBlock({
  header,
  beatName,
  fields,
  disabled,
  onSetHeader,
  onSetBeat,
  onSetSalesman,
  onSetAgent,
}: SalesInfoBlockProps) {
  // The four flags share one row, which is only worth drawing if at least one
  // of them survived the config.
  const showChecks =
    fields.isVisible("freight") ||
    fields.isVisible("load") ||
    fields.isVisible("unload") ||
    fields.isVisible("promo");
  return (
    <div className={styles.fieldGrid}>
      {fields.isVisible("beat") ? (
        <DropdownCombo
          id="quotation-beat"
          label={fields.labelFor("beat")}
          dropdownId={AREA_DROPDOWN_ID}
          valueKey="arm_id"
          labelKey="arm_name"
          value={header.areaId ?? ""}
          selectedLabel={beatName}
          disabled={disabled}
          onSelect={onSetBeat}
        />
      ) : null}
      {fields.isVisible("salesman") ? (
        <DropdownCombo
          id="quotation-salesman"
          label={fields.labelFor("salesman")}
          dropdownId={SALESMAN_DROPDOWN_ID}
          valueKey="emp_id"
          labelKey="emp_name"
          value={header.salesmanId ?? ""}
          selectedLabel={header.salesmanName}
          disabled={disabled}
          onSelect={(value, label) => onSetSalesman(value, label)}
        />
      ) : null}
      {fields.isVisible("agent") ? (
        <DropdownCombo
          id="quotation-agent"
          label={fields.labelFor("agent")}
          dropdownId={AGENT_DROPDOWN_ID}
          valueKey="emp_id"
          labelKey="emp_name"
          value={header.agentId ?? ""}
          selectedLabel={header.agentName}
          disabled={disabled}
          onSelect={(value, label) => onSetAgent(value, label)}
        />
      ) : null}
      {fields.isVisible("contactPerson") ? (
        <TextField
          id="quotation-contact-person"
          label={fields.labelFor("contactPerson")}
          value={header.contactPerson}
          disabled={disabled}
          maxLength={150}
          onChange={(value) => onSetHeader("contactPerson", value)}
        />
      ) : null}
      {fields.isVisible("contactNo") ? (
        <TextField
          id="quotation-contact-no"
          label={fields.labelFor("contactNo")}
          value={header.contactNo}
          disabled={disabled}
          maxLength={20}
          onChange={(value) => onSetHeader("contactNo", value)}
        />
      ) : null}
      {showChecks ? (
        <div className={styles.checkRow}>
          {fields.isVisible("freight") ? (
            <CheckField
              id="quotation-freight"
              label={fields.labelFor("freight")}
              checked={header.hasFreight}
              disabled={disabled}
              onChange={(checked) => onSetHeader("hasFreight", checked)}
            />
          ) : null}
          {fields.isVisible("load") ? (
            <CheckField
              id="quotation-load"
              label={fields.labelFor("load")}
              checked={header.hasLoad}
              disabled={disabled}
              onChange={(checked) => onSetHeader("hasLoad", checked)}
            />
          ) : null}
          {fields.isVisible("unload") ? (
            <CheckField
              id="quotation-unload"
              label={fields.labelFor("unload")}
              checked={header.hasUnload}
              disabled={disabled}
              onChange={(checked) => onSetHeader("hasUnload", checked)}
            />
          ) : null}
          {fields.isVisible("promo") ? (
            <CheckField
              id="quotation-promo"
              label={fields.labelFor("promo")}
              checked={header.hasPromo}
              disabled={disabled}
              onChange={(checked) => onSetHeader("hasPromo", checked)}
            />
          ) : null}
        </div>
      ) : null}
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

/** The configured name of each Terms row doubles as its shipped label. */
const TERMS_SHIPPED_LABELS: Record<QuotationTermsFieldKey, string> =
  QUOTATION_TERMS_FIELD_NAMES;
/** Unconfigured: every row on, labelled as this file writes it. */
const TERMS_AS_AUTHORED: TermsFieldConfig = {
  isVisible: () => true,
  labelFor: (key) => TERMS_SHIPPED_LABELS[key],
  anyVisible: true,
};

export type TermsBlockProps = {
  terms: QuotationTerms;
  disabled: boolean;
  onSetTerms: (field: keyof QuotationTerms, value: string) => void;
  /** Omitted by screens that do not configure this block. */
  fields?: TermsFieldConfig;
  /** Opens Visible Settings, the way the header panel's right-click does. */
  onContextMenu?: (event: ReactMouseEvent<HTMLElement>) => void;
};

export function TermsBlock({
  terms,
  disabled,
  onSetTerms,
  fields = TERMS_AS_AUTHORED,
  onContextMenu,
}: TermsBlockProps) {
  // Hiding every row hides the panel: an empty frame is not what "off" means.
  if (!fields.anyVisible) {
    return null;
  }
  return (
    <GroupBox title="Terms" section="Terms" onContextMenu={onContextMenu}>
      {/* One field per row: every row here is long free text, and a second
          column would halve the width it gets. */}
      <div className={styles.fieldGrid}>
        {fields.isVisible("remarks") ? (
          <Field label={fields.labelFor("remarks")} htmlFor="quotation-remarks">
            <input
              id="quotation-remarks"
              className={styles.input}
              value={terms.remarks}
              disabled={disabled}
              maxLength={500}
              autoComplete="off"
              onChange={(event) => onSetTerms("remarks", event.target.value)}
            />
          </Field>
        ) : null}
        {fields.isVisible("paymentTerms") ? (
          <Field label={fields.labelFor("paymentTerms")} htmlFor="quotation-payment-terms">
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
        ) : null}
        {fields.isVisible("deliveryTerms") ? (
          <Field label={fields.labelFor("deliveryTerms")} htmlFor="quotation-delivery-terms">
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
        ) : null}
        {fields.isVisible("termsConditions") ? (
          <Field label={fields.labelFor("termsConditions")} htmlFor="quotation-tc">
            <input
              id="quotation-tc"
              className={styles.input}
              value={terms.termsConditions}
              disabled={disabled}
              autoComplete="off"
              onChange={(event) => onSetTerms("termsConditions", event.target.value)}
            />
          </Field>
        ) : null}
      </div>
    </GroupBox>
  );
}
