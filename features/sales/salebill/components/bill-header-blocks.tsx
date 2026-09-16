"use client";
/**
 * The bill's header — four columns, in the legacy screen's own order:
 *
 *   customer · bill · people · credit
 *
 * The credit column is NOT re-implemented here: it is the sale order's
 * `OrderCreditBlock`, rendering the same `PartyCreditSummary` object the save
 * gate will judge, so panel and gate can never disagree (§4.2). Two independent
 * limits live in it — an amount limit and a bill-count limit — and whether
 * exceeding either blocks the save is `isCreditCheckEnabled`, a setting the
 * screen reports rather than a verdict it invents.
 *
 * The one interaction worth knowing before reading the code: the customer
 * picker is guarded, not reactive (§4.3). `onRequestCustomer` is handed the id
 * and decides whether to ask first; this block never dispatches the change
 * itself.
 */
import {
  AGENT_DROPDOWN_ID,
  CUSTOMER_DROPDOWN_ID,
  POS_DROPDOWN_ID,
  SALESMAN_DROPDOWN_ID,
} from "@/features/sales/quotation/quotation.constants";
import type {
  CustomerSnapshot,
  EditableCustomerField,
} from "@/features/sales/quotation/quotation.types";
import {
  CheckField,
  DateField,
  DropdownCombo,
  NumberField,
  ReadOnlyInput,
  SelectField,
  TextField,
} from "@/features/sales/quotation/components/fields";
import styles from "@/features/sales/quotation/page.module.scss";
import type {
  HeaderFieldConfig,
  TermsFieldConfig,
} from "@/features/sales/quotation/components/visible-settings";
import {
  BILL_DOC_TYPES,
  BILL_TYPES,
  SALE_BILL_HEADER_FIELD_NAMES,
  type SaleBillHeaderFieldKey,
  type SaleBillTermsFieldKey,
} from "../salebill.constants";
import type { BillPeople, SaleBillHeader } from "../salebill.types";
/**
 * What every block below reads before it renders a field: whether this
 * deployment shows it, and what it calls it (§ widget master, menu 12).
 *
 * A field the config says nothing about stays VISIBLE under its shipped label,
 * so an empty or failed fetch leaves the screen exactly as authored — which is
 * what makes the config optional rather than a dependency.
 */
export type BillFields = HeaderFieldConfig<SaleBillHeaderFieldKey>;
export type BillTermsFields = TermsFieldConfig<SaleBillTermsFieldKey>;
/** The screen as authored, for a block rendered before the config arrives. */
export const BILL_FIELDS_AS_AUTHORED: BillFields = {
  isVisible: () => true,
  labelFor: (key) => SALE_BILL_HEADER_FIELD_NAMES[key],
};
export { OrderCreditBlock as BillCreditBlock } from "@/features/sales/sale-order/components/order-header-blocks";
// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------
export type BillCustomerBlockProps = {
  customer: CustomerSnapshot;
  header: SaleBillHeader;
  disabled: boolean;
  /**
   * Locked while the bill was raised from another document (§13): the imported
   * prices were the source customer's, and repointing the bill would leave
   * `sb_src_doc_id` naming a document raised for somebody else.
   */
  locked: boolean;
  lockReason?: string;
  fields: BillFields;
  onRequestCustomer: (customerId: string) => void;
  onSetCustomerField: (field: EditableCustomerField, value: string) => void;
  onSetPos: (stateCode: string, stateName: string) => void;
};
export function BillCustomerBlock({
  customer,
  header,
  disabled,
  locked,
  lockReason,
  fields,
  onRequestCustomer,
  onSetCustomerField,
  onSetPos,
}: BillCustomerBlockProps) {
  return (
    <div className={styles.fieldGrid} title={locked ? lockReason : undefined}>
      {fields.isVisible("existingCustomer") ? (
        <DropdownCombo
          id="sale-bill-customer"
          label={fields.labelFor("existingCustomer")}
          dropdownId={CUSTOMER_DROPDOWN_ID}
          valueKey="cus_id"
          labelKey="cus_name"
          value={customer.custId ?? ""}
          selectedLabel={customer.masterName}
          disabled={disabled || locked}
          placeholder="Search customers…"
          onSelect={onRequestCustomer}
        />
      ) : null}
      {/*
        Amendable, and it amends THIS bill only — the document stores its own
        copy of the name, address, place, phone and GSTIN, so a bill prints the
        customer as they were when it was raised even after the master moves on.
        A walk-in may be billed to a name alone — `sbCustId` goes over as null —
        so these can stand in for a master record as well as amend one.
      */}
      {fields.isVisible("customerName") ? (
        <TextField
          id="sale-bill-customer-name"
          label={fields.labelFor("customerName")}
          value={customer.name}
          disabled={disabled || locked}
          required
          maxLength={200}
          onChange={(value) => onSetCustomerField("name", value.toUpperCase())}
        />
      ) : null}
      {fields.isVisible("address") ? (
        <TextField
          id="sale-bill-customer-address"
          label={fields.labelFor("address")}
          value={customer.address ?? ""}
          disabled={disabled}
          maxLength={500}
          onChange={(value) => onSetCustomerField("address", value)}
        />
      ) : null}
      {fields.isVisible("place") ? (
        <TextField
          id="sale-bill-customer-place"
          label={fields.labelFor("place")}
          value={customer.place ?? ""}
          disabled={disabled}
          maxLength={100}
          onChange={(value) => onSetCustomerField("place", value)}
        />
      ) : null}
      {fields.isVisible("phone") ? (
        <TextField
          id="sale-bill-customer-phone"
          label={fields.labelFor("phone")}
          value={customer.phone ?? ""}
          disabled={disabled}
          maxLength={20}
          onChange={(value) => onSetCustomerField("phone", value)}
        />
      ) : null}
      {fields.isVisible("gstin") ? (
        <TextField
          id="sale-bill-customer-gstin"
          label={fields.labelFor("gstin")}
          value={customer.gstin ?? ""}
          disabled={disabled}
          maxLength={15}
          onChange={(value) => onSetCustomerField("gstin", value.toUpperCase())}
        />
      ) : null}
      {/*
        Two different facts, and since 2026-09-11 they are stored as two columns
        (§5). The customer's own state is a SNAPSHOT and decides nothing; the
        place of supply is what splits CGST+SGST from IGST, and the operator may
        override it for a ship-to across a state line. Showing them side by side
        is the point: a POS that no longer matches the customer is a deliberate
        act, and it should look like one.
      */}
      {fields.isVisible("customerState") ? (
        <ReadOnlyInput
          id="sale-bill-cust-state"
          label={fields.labelFor("customerState")}
          value={customer.stateName ?? customer.stateCode ?? ""}
          placeholder="(from the customer)"
        />
      ) : null}
      {fields.isVisible("posStateCode") ? (
        <DropdownCombo
          id="sale-bill-pos"
          label={fields.labelFor("posStateCode")}
          dropdownId={POS_DROPDOWN_ID}
          valueKey="state_code"
          labelKey="state_name"
          value={header.posStateCode}
          selectedLabel={header.posStateName}
          disabled={disabled}
          placeholder="Place of supply…"
          onSelect={onSetPos}
        />
      ) : null}
    </div>
  );
}
// ---------------------------------------------------------------------------
// The bill itself
// ---------------------------------------------------------------------------
export type BillInfoBlockProps = {
  header: SaleBillHeader;
  billRefno: string;
  priceLevelOptions: ReadonlyArray<{ value: string; label: string }>;
  disabled: boolean;
  fields: BillFields;
  onSetHeader: (field: keyof SaleBillHeader, value: string | number | boolean) => void;
};
export function BillInfoBlock({
  header,
  billRefno,
  priceLevelOptions,
  disabled,
  fields,
  onSetHeader,
}: BillInfoBlockProps) {
  const isCredit = header.billType === "CREDIT";
  return (
    <div className={styles.fieldGrid}>
      {/*
        Read-only, and it is not a placeholder waiting to be wired: BOTH the
        serial number and the printable refno are allocated from the voucher
        sequence (voucher type 22) inside the server's create transaction, and
        whatever a client sends for either is ignored. The plan's §15 says the
        refno is the client's; it is not.
      */}
      {fields.isVisible("billNo") ? (
        <ReadOnlyInput
          id="sale-bill-refno"
          label={fields.labelFor("billNo")}
          value={billRefno}
          placeholder="(assigned on save)"
        />
      ) : null}
      {fields.isVisible("usrRefno") ? (
        <TextField
          id="sale-bill-usr-refno"
          label={fields.labelFor("usrRefno")}
          value={header.usrRefno}
          disabled={disabled}
          maxLength={100}
          onChange={(value) => onSetHeader("usrRefno", value)}
        />
      ) : null}
      {fields.isVisible("billDate") ? (
        <DateField
          id="sale-bill-date"
          label={fields.labelFor("billDate")}
          value={header.billDate}
          disabled={disabled}
          onChange={(value) => onSetHeader("billDate", value)}
        />
      ) : null}
      {fields.isVisible("docType") ? (
        <SelectField
          id="sale-bill-doc-type"
          label={fields.labelFor("docType")}
          value={header.docType}
          disabled={disabled}
          options={BILL_DOC_TYPES.map((type) => ({
            value: type,
            label: type === "TAX_INVOICE" ? "Tax Invoice" : "Bill of Supply",
          }))}
          onChange={(value) => onSetHeader("docType", value)}
        />
      ) : null}
      {/*
        The term. Switching to CASH clears the due period rather than leaving it
        standing — the payload sends due days / due date only for CREDIT, so a
        stale pair would be a thing on screen that nothing downstream agrees
        exists. Switching to CREDIT seeds the customer's own credit days, unless
        the operator has already keyed a period.
      */}
      {fields.isVisible("billType") ? (
        <SelectField
          id="sale-bill-type"
          label={fields.labelFor("billType")}
          value={header.billType}
          disabled={disabled}
          options={BILL_TYPES.map((type) => ({ value: type, label: type }))}
          onChange={(value) => onSetHeader("billType", value)}
        />
      ) : null}
      {/*
        Due days and due date are two views of one period counted from the bill
        date: editing either re-derives the other. Both are disabled outright on
        a cash bill, because there is no period to state.
      */}
      {fields.isVisible("dueDays") ? (
        <NumberField
          id="sale-bill-due-days"
          label={fields.labelFor("dueDays")}
          value={header.dueDays}
          disabled={disabled || !isCredit}
          onChange={(value) => onSetHeader("dueDays", value)}
        />
      ) : null}
      {fields.isVisible("dueDate") ? (
        <DateField
          id="sale-bill-due-date"
          label={fields.labelFor("dueDate")}
          value={header.dueDate}
          disabled={disabled || !isCredit}
          onChange={(value) => onSetHeader("dueDate", value)}
        />
      ) : null}
      {fields.isVisible("priceLevel") ? (
        <SelectField
          id="sale-bill-price-level"
          label={fields.labelFor("priceLevel")}
          value={String(header.priceLevel)}
          disabled={disabled}
          options={priceLevelOptions.map((option) => ({ ...option }))}
          onChange={(value) => onSetHeader("priceLevel", Number(value))}
        />
      ) : null}
      {/*
        The four charge-applicability flags come off the customer master and
        drive both the charge grid's role overrides and the §14.7 gate: a
        LOADING / FREIGHT charge row must exist when the matching flag is on.
      */}
      {fields.isVisible("freight") ? (
        <CheckField
          id="sale-bill-has-freight"
          label={fields.labelFor("freight")}
          checked={header.hasFreight}
          disabled={disabled}
          onChange={(checked) => onSetHeader("hasFreight", checked)}
        />
      ) : null}
      {fields.isVisible("load") ? (
        <CheckField
          id="sale-bill-has-load"
          label={fields.labelFor("load")}
          checked={header.hasLoad}
          disabled={disabled}
          onChange={(checked) => onSetHeader("hasLoad", checked)}
        />
      ) : null}
      {fields.isVisible("unload") ? (
        <CheckField
          id="sale-bill-has-unload"
          label={fields.labelFor("unload")}
          checked={header.hasUnload}
          disabled={disabled}
          onChange={(checked) => onSetHeader("hasUnload", checked)}
        />
      ) : null}
      {fields.isVisible("promo") ? (
        <CheckField
          id="sale-bill-has-promo"
          label={fields.labelFor("promo")}
          checked={header.hasPromo}
          disabled={disabled}
          onChange={(checked) => onSetHeader("hasPromo", checked)}
        />
      ) : null}
    </div>
  );
}
// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
/**
 * Six roles and a vehicle.
 *
 * Three of the six (`sb_salesman_id`, `sb_loadman_id`, `sb_packed_id`) are
 * `uuid[]` columns; the screen keys ONE id into each and the payload wraps it,
 * because nobody has asked for the multi-select and putting the question on the
 * entry form before they do is how a header block turns into a dialog.
 *
 * All six read the EMPLOYEES dropdown — there is no per-role master and no
 * designation filter on the configured SQL, so the operator picks the right
 * person rather than the list narrowing to them. Vehicle is free text for the
 * same reason: `sb_vehicle_no` is a varchar and no vehicle dropdown is
 * configured, though a `vehicle_master` (menu 125) exists to hang one off.
 */
export type BillPeopleBlockProps = {
  people: BillPeople;
  header: SaleBillHeader;
  disabled: boolean;
  fields: BillFields;
  onSetPerson: (field: keyof BillPeople, value: string) => void;
  onSetHeader: (field: keyof SaleBillHeader, value: string | number | boolean) => void;
};
const PEOPLE_ROLES: ReadonlyArray<{
  id: keyof BillPeople;
  nameField: keyof BillPeople;
  /** The widget-master key this role is configured under. */
  field: SaleBillHeaderFieldKey;
  dropdownId: string;
}> = [
  { id: "salesmanId", nameField: "salesmanName", field: "salesman", dropdownId: SALESMAN_DROPDOWN_ID },
  { id: "agentId", nameField: "agentName", field: "agent", dropdownId: AGENT_DROPDOWN_ID },
  { id: "driverId", nameField: "driverName", field: "driver", dropdownId: SALESMAN_DROPDOWN_ID },
  { id: "loadmanId", nameField: "loadmanName", field: "loadman", dropdownId: SALESMAN_DROPDOWN_ID },
  { id: "packedId", nameField: "packedName", field: "packedBy", dropdownId: SALESMAN_DROPDOWN_ID },
  {
    id: "supervisorId",
    nameField: "supervisorName",
    field: "supervisor",
    dropdownId: SALESMAN_DROPDOWN_ID,
  },
];
export function BillPeopleBlock({
  people,
  header,
  disabled,
  fields,
  onSetPerson,
  onSetHeader,
}: BillPeopleBlockProps) {
  return (
    <div className={styles.fieldGrid}>
      {PEOPLE_ROLES.filter((role) => fields.isVisible(role.field)).map((role) => {
        const label = fields.labelFor(role.field);
        return (
          <DropdownCombo
            key={role.id}
            id={`sale-bill-${role.id}`}
            label={label}
            dropdownId={role.dropdownId}
            valueKey="emp_id"
            labelKey="emp_name"
            value={(people[role.id] as string | null) ?? ""}
            selectedLabel={(people[role.nameField] as string) ?? ""}
            disabled={disabled}
            placeholder={`Search ${label.toLowerCase()}…`}
            onSelect={(id, name) => {
              onSetPerson(role.id, id);
              onSetPerson(role.nameField, name);
            }}
          />
        );
      })}
      {fields.isVisible("vehicleNo") ? (
        <TextField
          id="sale-bill-vehicle-no"
          label={fields.labelFor("vehicleNo")}
          value={people.vehicleNo}
          disabled={disabled}
          maxLength={20}
          onChange={(value) => onSetPerson("vehicleNo", value.toUpperCase())}
        />
      ) : null}
      {fields.isVisible("contactPerson") ? (
        <TextField
          id="sale-bill-contact-person"
          label={fields.labelFor("contactPerson")}
          value={header.contactPerson}
          disabled={disabled}
          maxLength={100}
          onChange={(value) => onSetHeader("contactPerson", value)}
        />
      ) : null}
      {fields.isVisible("contactNo") ? (
        <TextField
          id="sale-bill-contact-no"
          label={fields.labelFor("contactNo")}
          value={header.contactNo}
          disabled={disabled}
          maxLength={20}
          onChange={(value) => onSetHeader("contactNo", value)}
        />
      ) : null}
      {/*
        A boolean, and the WHOLE of the loyalty contract with the server (§11).
        The points are shown, LoyaltyPv is a per-line column and the document
        total is computed — but there is no accrual path, so nothing here should
        be read as one existing.
      */}
      {fields.isVisible("loyalty") ? (
        <CheckField
          id="sale-bill-has-loyalty"
          label={fields.labelFor("loyalty")}
          checked={header.hasLoyalty}
          disabled={disabled}
          onChange={(checked) => onSetHeader("hasLoyalty", checked)}
        />
      ) : null}
      {fields.isVisible("commission") ? (
        <CheckField
          id="sale-bill-has-comm"
          label={fields.labelFor("commission")}
          checked={header.hasComm}
          disabled={disabled}
          onChange={(checked) => onSetHeader("hasComm", checked)}
        />
      ) : null}
    </div>
  );
}