"use client";
/**
 * The order's header blocks: customer (with the source lock), order info and
 * sales info. Terms reuses the quotation's block outright — same four fields,
 * same wire lengths.
 *
 * The customer picker is DISABLED — with a tooltip saying why — whenever the
 * draft carries a source document (the plan's §6): the converted order is the
 * same promise to the same party, and the derived lock cannot be toggled from
 * here.
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
  DateField,
  DropdownCombo,
  ReadOnlyInput,
  SelectField,
  TextField,
  CheckField,
} from "@/features/sales/quotation/components/fields";
import styles from "@/features/sales/quotation/page.module.scss";
import {
  DELIVERY_MODES,
  DELIVERY_MODE_LABELS,
  ORDER_PRIORITIES,
  ORDER_TYPES,
} from "../sale-order.constants";
import type { SaleOrderHeader, SourceTrail } from "../sale-order.types";

export type OrderCustomerBlockProps = {
  customer: CustomerSnapshot;
  header: SaleOrderHeader;
  source: SourceTrail | null;
  customerLocked: boolean;
  disabled: boolean;
  onPickCustomer: (customerId: string) => void;
  onSetCustomerField: (field: EditableCustomerField, value: string) => void;
  onSetPos: (stateCode: string, stateName: string) => void;
};

export function OrderCustomerBlock({
  customer,
  header,
  source,
  customerLocked,
  disabled,
  onPickCustomer,
  onSetCustomerField,
  onSetPos,
}: OrderCustomerBlockProps) {
  const lockTitle = customerLocked
    ? `Locked: this order was raised from ${source?.refno ?? "another document"} for this customer.`
    : undefined;
  return (
    <div className={styles.fieldGrid} title={lockTitle}>
      <DropdownCombo
        id="sale-order-customer"
        label="Customer"
        dropdownId={CUSTOMER_DROPDOWN_ID}
        valueKey="cus_id"
        labelKey="cus_name"
        value={customer.custId ?? ""}
        selectedLabel={customer.masterName}
        disabled={disabled || customerLocked}
        placeholder="Search customers…"
        onSelect={onPickCustomer}
      />
      <TextField
        id="sale-order-customer-name"
        label="Customer Name"
        value={customer.name}
        disabled={disabled || customerLocked}
        required
        maxLength={200}
        onChange={(value) => onSetCustomerField("name", value.toUpperCase())}
      />
      <TextField
        id="sale-order-customer-address"
        label="Address"
        value={customer.address ?? ""}
        disabled={disabled}
        maxLength={500}
        onChange={(value) => onSetCustomerField("address", value)}
      />
      <TextField
        id="sale-order-customer-place"
        label="Place"
        value={customer.place ?? ""}
        disabled={disabled}
        maxLength={100}
        onChange={(value) => onSetCustomerField("place", value)}
      />
      <TextField
        id="sale-order-customer-phone"
        label="Phone"
        value={customer.phone ?? ""}
        disabled={disabled}
        maxLength={20}
        onChange={(value) => onSetCustomerField("phone", value)}
      />
      <TextField
        id="sale-order-customer-gstin"
        label="GSTIN"
        value={customer.gstin ?? ""}
        disabled={disabled}
        maxLength={15}
        onChange={(value) => onSetCustomerField("gstin", value.toUpperCase())}
      />
      <DropdownCombo
        id="sale-order-pos"
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
    </div>
  );
}

export type OrderInfoBlockProps = {
  header: SaleOrderHeader;
  orderRefno: string;
  priceLevelOptions: ReadonlyArray<{ value: string; label: string }>;
  disabled: boolean;
  onSetHeader: (field: keyof SaleOrderHeader, value: string | number | boolean) => void;
};

export function OrderInfoBlock({
  header,
  orderRefno,
  priceLevelOptions,
  disabled,
  onSetHeader,
}: OrderInfoBlockProps) {
  return (
    <div className={styles.fieldGrid}>
      <ReadOnlyInput
        id="sale-order-no"
        label="Order No"
        value={orderRefno}
        placeholder="(auto)"
      />
      <DateField
        id="sale-order-date"
        label="Order Date"
        value={header.orderDate}
        disabled={disabled}
        onChange={(value) => onSetHeader("orderDate", value)}
      />
      <DateField
        id="sale-order-delivery-date"
        label="Delivery Date"
        value={header.deliveryDate}
        disabled={disabled}
        onChange={(value) => onSetHeader("deliveryDate", value)}
      />
      <DateField
        id="sale-order-valid-until"
        label="Valid Until"
        value={header.validUntil}
        disabled={disabled}
        onChange={(value) => onSetHeader("validUntil", value)}
      />
      <SelectField
        id="sale-order-priority"
        label="Priority"
        value={header.priority}
        options={ORDER_PRIORITIES.map((value) => ({ value, label: value }))}
        disabled={disabled}
        onChange={(value) => onSetHeader("priority", value)}
      />
      <SelectField
        id="sale-order-type"
        label="Order Type"
        value={header.orderType}
        options={ORDER_TYPES.map((value) => ({ value, label: value }))}
        disabled={disabled}
        onChange={(value) => onSetHeader("orderType", value)}
      />
      <SelectField
        id="sale-order-delivery-mode"
        label="Delivery Mode"
        value={header.deliveryMode}
        options={DELIVERY_MODES.map((value) => ({ value, label: DELIVERY_MODE_LABELS[value] }))}
        disabled={disabled}
        onChange={(value) => onSetHeader("deliveryMode", value)}
      />
      <TextField
        id="sale-order-delivery-slot"
        label="Delivery Slot"
        value={header.deliverySlot}
        disabled={disabled}
        maxLength={30}
        onChange={(value) => onSetHeader("deliverySlot", value)}
      />
      <SelectField
        id="sale-order-price-level"
        label="Price Level"
        value={String(header.priceLevel)}
        options={priceLevelOptions}
        disabled={disabled}
        onChange={(value) => onSetHeader("priceLevel", Number.parseInt(value, 10) || 1)}
      />
    </div>
  );
}

export type OrderSalesInfoBlockProps = {
  header: SaleOrderHeader;
  disabled: boolean;
  onSetHeader: (field: keyof SaleOrderHeader, value: string | number | boolean) => void;
  onSetSalesman: (id: string, name: string) => void;
  onSetAgent: (id: string, name: string) => void;
};

export function OrderSalesInfoBlock({
  header,
  disabled,
  onSetHeader,
  onSetSalesman,
  onSetAgent,
}: OrderSalesInfoBlockProps) {
  return (
    <div className={styles.fieldGrid}>
      <DropdownCombo
        id="sale-order-salesman"
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
        id="sale-order-agent"
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
        id="sale-order-contact-person"
        label="Contact Person"
        value={header.contactPerson}
        disabled={disabled}
        maxLength={150}
        onChange={(value) => onSetHeader("contactPerson", value)}
      />
      <TextField
        id="sale-order-contact-no"
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
    </div>
  );
}
