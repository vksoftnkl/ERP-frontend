"use client";

/**
 * The credit column (§7.4) and the facts line (§7.5), both painted from
 * `/bills/party-context` — never a verdict computed here. `credit.mode` only
 * repeats what `/validate` will do; red appears only while the check is on,
 * and only where the plan says: Avail on an amount/bill breach, Pending on
 * overdue days.
 *
 * Loyalty is the fifth row: `points | card`, and `loyalty: null` means NOT A
 * MEMBER, which is an answer rather than missing data.
 */
import { cx } from "@/components/design-system/cx";
import { Field } from "@/features/sales/quotation/components/fields";
import styles from "@/features/sales/quotation/page.module.scss";
import orderStyles from "@/features/sales/sale-order/page.module.scss";
import type { CreditFieldConfig } from "@/features/sales/sale-order/components/order-header-blocks";
import { creditPanelRows, factsLine } from "@/features/sales/testbill/domain/party";
import type { CustomerSnapshot } from "@/features/sales/quotation/quotation.types";
import type { PartyContext } from "@/features/sales/testbill/types";
import billStyles from "@/features/sales/testbill/page.module.scss";

export type BillCreditPanelProps = {
  party: PartyContext | null;
  hasCustomer: boolean;
  /** The Loyalty tick on the bill; the row greys when it is off. */
  loyaltyTicked: boolean;
  fields?: CreditFieldConfig;
};

const AS_AUTHORED: CreditFieldConfig = { isVisible: () => true, labelFor: (label) => label };

function money(value: number): string {
  return value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function BillCreditPanel({ party, hasCustomer, loyaltyTicked, fields = AS_AUTHORED }: BillCreditPanelProps) {
  const rows = party ? creditPanelRows(party.credit) : null;
  const checkOff = party ? party.credit.mode === "OFF" : false;
  const rowByLabel = (label: "Pending" | "Overdue" | "Limit" | "Avail") =>
    rows?.find((row) => row.label === label) ?? null;
  const cell = (
    key: "Outstanding" | "Overdue" | "Credit Limit" | "Available",
    row: ReturnType<typeof rowByLabel>,
  ) =>
    fields.isVisible(key) ? (
      <Field label={fields.labelFor(key)}>
        <output
          className={cx(orderStyles.creditFieldValue, row?.alert && orderStyles.creditFieldAlert)}
          title={row?.tooltip ?? undefined}
        >
          {hasCustomer ? (row ? row.value : "…") : ""}
        </output>
      </Field>
    ) : null;

  const advances = party?.advances.reduce((sum, row) => sum + row.pending, 0) ?? 0;
  const notes = party?.creditNotes.reduce((sum, row) => sum + row.pending, 0) ?? 0;
  const temp = party?.tempCredits.reduce((sum, row) => sum + row.balance, 0) ?? 0;

  return (
    <div
      className={cx(styles.fieldGrid, checkOff && orderStyles.creditColumnOff)}
      title={checkOff ? "The credit check is switched off for this company." : undefined}
    >
      {cell("Outstanding", rowByLabel("Pending"))}
      {cell("Overdue", rowByLabel("Overdue"))}
      {cell("Credit Limit", rowByLabel("Limit"))}
      {cell("Available", rowByLabel("Avail"))}
      <Field label="Adv / CN">
        <output className={orderStyles.creditFieldValue} title="Advances · credit notes open — F4 sets them off">
          {hasCustomer && party ? `${money(advances)} / ${money(notes)}` : ""}
        </output>
      </Field>
      <Field label="Cash today / Temp">
        <output
          className={orderStyles.creditFieldValue}
          title="Cash taken from this party today (269ST) · open temp credit"
        >
          {hasCustomer && party ? `${money(party.cashToday)} / ${money(temp)}` : ""}
        </output>
      </Field>
      <Field label="Loyalty">
        <output
          className={cx(orderStyles.creditFieldValue, !loyaltyTicked && billStyles.factGrey)}
          title={
            party?.loyalty
              ? `${party.loyalty.balance} points · redeemable ${party.loyalty.redeemable}${loyaltyTicked ? "" : " · loyalty is unticked on this bill"}`
              : hasCustomer && party
                ? "Not a member"
                : undefined
          }
        >
          {hasCustomer && party
            ? party.loyalty
              ? `${party.loyalty.balance} pts${party.loyalty.cardNo ? ` | ${party.loyalty.cardNo}` : ""}`
              : "not a member"
            : ""}
        </output>
      </Field>
    </div>
  );
}

export type BillFactsLineProps = {
  party: PartyContext | null;
  customer: CustomerSnapshot;
  isLocalSale: boolean;
};

/** `GST … · PAN / Form 60 · Advances · Credit notes · Cash today · Temp credit` (§7.5). */
export function BillFactsLine({ party, customer, isLocalSale }: BillFactsLineProps) {
  const cells = factsLine(
    party,
    { gstType: customer.gstType, gstin: customer.gstin, stateCode: customer.stateCode },
    isLocalSale,
  );
  return (
    <div className={billStyles.factsLine} aria-label="Party facts">
      {cells.map((cell) => (
        <span
          key={cell.key}
          className={cx(
            billStyles.fact,
            cell.tone === "green" && billStyles.factGreen,
            cell.tone === "amber" && billStyles.factAmber,
            cell.tone === "grey" && billStyles.factGrey,
          )}
          title={cell.tooltip ?? undefined}
        >
          {cell.text}
        </span>
      ))}
    </div>
  );
}
