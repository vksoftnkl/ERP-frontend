"use client";
/**
 * The order's header — four columns, in the legacy screen's own order:
 *
 *   customer · order · sales/delivery · credit
 *
 * The customer picker is DISABLED — with a tooltip saying why — whenever the
 * draft carries a source document (the plan's §6): the converted order is the
 * same promise to the same party, and the derived lock cannot be toggled here.
 *
 * The credit column is read-only by nature: every figure in it is the server's
 * answer about the party, not something this document states. It renders the
 * SAME `PartyCreditSummary` object the save gate judges, so panel and gate can
 * never disagree, and red is reserved for the two facts that change a decision
 * — overdue money, and a breached limit.
 */
import { cx } from "@/components/design-system/cx";
import { formatCurrency } from "@/domain/pricing";
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
  Field,
  ReadOnlyInput,
  SelectField,
  TextField,
} from "@/features/sales/quotation/components/fields";
import styles from "@/features/sales/quotation/page.module.scss";
import {
  DELIVERY_MODES,
  DELIVERY_MODE_LABELS,
  ORDER_PRIORITIES,
  ORDER_TYPES,
} from "../sale-order.constants";
import type {
  PartyCreditSummary,
  SaleOrderHeader,
  SourceTrail,
} from "../sale-order.types";
import orderStyles from "../page.module.scss";

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
        label="Name"
        value={customer.name}
        disabled={disabled || customerLocked}
        required
        maxLength={200}
        onChange={(value) => onSetCustomerField("name", value.toUpperCase())}
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
      {/*
        Beat is the customer master's route, shown because the operator reads
        the order by it — but `sale_order` has NO area column (unlike
        `sale_quotation`'s `sq_cust_area_id`), so there is nothing to store a
        change in. It is displayed, not keyed; wiring it needs a migration.
      */}
      <ReadOnlyInput
        id="sale-order-beat"
        label="Beat"
        value={customer.areaName ?? ""}
        placeholder="(from the customer)"
      />
      <DropdownCombo
        id="sale-order-pos"
        label="POS State"
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
      {/* Server-assigned inside the create transaction; blank until first save. */}
      <ReadOnlyInput id="sale-order-no" label="Order No" value={orderRefno} placeholder="(auto)" />
      <DateField
        id="sale-order-date"
        label="Order Date"
        value={header.orderDate}
        disabled={disabled}
        onChange={(value) => onSetHeader("orderDate", value)}
      />
      {/* "Term" is the payment term — `so_order_type`, CASH or CREDIT. */}
      <SelectField
        id="sale-order-type"
        label="Term"
        value={header.orderType}
        options={ORDER_TYPES.map((value) => ({ value, label: value }))}
        disabled={disabled}
        onChange={(value) => onSetHeader("orderType", value)}
      />
      <SelectField
        id="sale-order-price-level"
        label="Price Level"
        value={String(header.priceLevel)}
        options={priceLevelOptions}
        disabled={disabled}
        onChange={(value) => onSetHeader("priceLevel", Number.parseInt(value, 10) || 1)}
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
    </div>
  );
}

export type OrderSalesInfoBlockProps = {
  header: SaleOrderHeader;
  disabled: boolean;
  onSetHeader: (field: keyof SaleOrderHeader, value: string | number | boolean) => void;
  onSetSalesman: (id: string, name: string) => void;
  onSetAgent: (id: string, name: string) => void;
  onSetPackedBy: (id: string, name: string) => void;
};

export function OrderSalesInfoBlock({
  header,
  disabled,
  onSetHeader,
  onSetSalesman,
  onSetAgent,
  onSetPackedBy,
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
      <DropdownCombo
        id="sale-order-packed-by"
        label="Packed By"
        dropdownId={SALESMAN_DROPDOWN_ID}
        valueKey="emp_id"
        labelKey="emp_name"
        value={header.packedId ?? ""}
        selectedLabel={header.packedName}
        disabled={disabled}
        onSelect={(value, label) => onSetPackedBy(value, label)}
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
        <CheckField
          label="Loyalty"
          checked={header.hasLoyalty}
          disabled={disabled}
          onChange={(checked) => onSetHeader("hasLoyalty", checked)}
        />
      </div>
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
        label="Slot"
        value={header.deliverySlot}
        disabled={disabled}
        maxLength={30}
        onChange={(value) => onSetHeader("deliverySlot", value)}
      />
    </div>
  );
}

/**
 * The credit column. Five read-only figures, in the legacy screen's order, all
 * from the one `party-credit` summary. `isCreditCheckEnabled === false` greys
 * the column and says so — off is an answer, not missing data, and the save
 * gate is already out of the picture by then (the plan's §7.2).
 */
export function OrderCreditBlock({
  credit,
  hasCustomer,
}: {
  credit: PartyCreditSummary | null;
  hasCustomer: boolean;
}) {
  const checkOff = credit ? credit.isCreditCheckEnabled === false : false;
  const limitBreached = Boolean(credit && (credit.isAmtLimitExceeded || credit.isBillLimitExceeded));
  const overdue = Boolean(credit && credit.overdueAmount > 0);
  const money = (value: number | null | undefined): string =>
    value === null || value === undefined ? "" : formatCurrency(value, 2, true);

  return (
    <div className={cx(styles.fieldGrid, checkOff && orderStyles.creditColumnOff)}>
      <CreditValue label="Outstanding" value={credit ? money(credit.pendingAmount) : ""} />
      <CreditValue
        label="Overdue"
        value={credit ? money(credit.overdueAmount) : ""}
        alert={!checkOff && overdue}
        title={credit?.oldestOverdueDueDate ? `Oldest due ${credit.oldestOverdueDueDate}` : undefined}
      />
      <CreditValue
        label="Overdue By"
        value={credit ? `${credit.maxOverdueDays} d` : ""}
        alert={!checkOff && overdue}
        title={credit?.oldestOverdueDueDate ? `Oldest due ${credit.oldestOverdueDueDate}` : undefined}
      />
      <CreditValue label="Credit Limit" value={credit ? money(credit.creditAmtLimit) : ""} />
      <CreditValue
        label="Available"
        value={credit ? money(credit.availableCreditAmount) : ""}
        alert={!checkOff && limitBreached}
      />
      {checkOff ? (
        <p className={styles.inlineHint}>Credit check is off for this customer.</p>
      ) : !credit && hasCustomer ? (
        <p className={styles.inlineHint}>Credit standing unavailable.</p>
      ) : null}
    </div>
  );
}

function CreditValue({
  label,
  value,
  alert,
  title,
}: {
  label: string;
  value: string;
  alert?: boolean;
  title?: string;
}) {
  return (
    <Field label={label}>
      <output
        className={cx(orderStyles.creditFieldValue, alert && orderStyles.creditFieldAlert)}
        title={title}
      >
        {value}
      </output>
    </Field>
  );
}
