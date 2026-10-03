"use client";

/**
 * PARTY DETAIL — who the money goes to, and what we owe them.
 *
 * The payee picker is dropdown 60 "PAYMENT PAYEES": party ledgers only, shared
 * plus this company, bound by `icompany_id`. A cash or bank ledger is a
 * Contra, and the screen refuses one the moment its facts say so.
 *
 * Every figure shows a DASH until its answer is in — a zero would be a claim
 * about the balance nothing has told the screen. What the payment adds to the
 * receipt's panel: the TDS facts (section, rate, PAN, threshold), the bank a
 * transfer is seeded from, and the name a cheque is written to.
 */
import { NexDropdownSingle } from "@/components/design-system/dropdown";
import { useDropdownId } from "@/lib/configured-dropdowns";
import { RECEIPT_FIELD_ATTR } from "@/features/accounts/receipt/focus-walk";
import { balanceAfterReceipt, type ReceiptIdentity } from "@/features/accounts/receipt/domain/identity";
import { formatTotal } from "@/features/accounts/receipt/domain/money";
import styles from "@/features/accounts/receipt/page.module.scss";
import { lastFour } from "../domain/tenders";
import type { PaymentTds } from "../domain/tds";
import { debitsHeldOf } from "../payload/parse";
import type {
  PaymentContextSummary,
  PaymentHeaderDraft,
  PaymentOpenItemsSummary,
  PaymentPartyFacts,
} from "../payment.types";

const DASH = "—";

export type PaymentPartyPanelProps = {
  header: PaymentHeaderDraft;
  party: PaymentPartyFacts;
  summary: PaymentOpenItemsSummary | null;
  context: PaymentContextSummary | null;
  identity: ReceiptIdentity;
  tds: PaymentTds;
  paidAnything: boolean;
  companyId: string;
  mobile: string;
  address: string;
  editable: boolean;
  invalid: boolean;
  /** A posted payment is already inside the balance beside it. */
  appliesToBalance: boolean;
  onPickParty: (partyId: string, partyName: string) => void;
};

/** "194C · 1.00% · PAN ✓", "194J · no rate in force", "none". */
function tdsLine(party: PaymentPartyFacts, tds: PaymentTds, paidAnything: boolean): {
  text: string;
  tone: "danger" | "warn" | null;
} {
  if (!party.loaded) {
    return { text: DASH, tone: null };
  }
  if (!party.isTdsApplicable) {
    return { text: "none", tone: null };
  }
  const section = party.tdsSection || "no section";
  if (party.tdsRate === null || !party.tdsSection) {
    return { text: `${section} · no rate in force`, tone: "danger" };
  }
  let text = `${section} · ${party.tdsRate.toFixed(2)}%`;
  let tone: "danger" | "warn" | null = null;
  if (party.tdsRateSource === "NO_PAN") {
    text += " · no PAN";
    tone = "warn";
  } else {
    text += " · PAN ✓";
  }
  if (tds.applies && !tds.deducted && paidAnything) {
    text += " · below threshold";
  }
  return { text, tone };
}

function bankLine(party: PaymentPartyFacts): string {
  if (!party.loaded || (!party.bankName && !party.bankAccountNo)) {
    return DASH;
  }
  const account = party.bankAccountNo ? ` ····${lastFour(party.bankAccountNo)}` : "";
  const ifsc = party.bankIfsc ? ` · ${party.bankIfsc}` : "";
  return `${party.bankName || "bank"}${account}${ifsc}`;
}

export function PaymentPartyPanel(props: PaymentPartyPanelProps) {
  const {
    header,
    party,
    summary,
    context,
    identity,
    tds,
    paidAnything,
    companyId,
    mobile,
    address,
    editable,
    invalid,
    appliesToBalance,
    onPickParty,
  } = props;
  const payeeDropdownId = useDropdownId("paymentPayee");
  // What we owe once this payment is in: the money that reached the party
  // (less a charge or interest that did not settle a bill) plus every
  // deduction that settles one — the receipt's identity-based figure, which
  // nets a debit spent against a bill to nothing, as it should.
  const afterThis = appliesToBalance
    ? balanceAfterReceipt(context?.totalBalance ?? null, identity)
    : null;
  const tdsText = tdsLine(party, tds, paidAnything);
  const held = debitsHeldOf(summary);

  return (
    <section className={`${styles.panel} ${styles.panelParty}`} aria-label="Party detail">
      <h2 className={styles.panelTitle}>Party detail</h2>

      <div className={styles.partyPickerRow} {...{ [RECEIPT_FIELD_ATTR]: "party" }}>
        <span className={styles.partyPickerLabel}>Payee *</span>
        <NexDropdownSingle
          dropdownId={payeeDropdownId}
          value={header.partyId ? { id: header.partyId, text: header.partyName } : null}
          onChange={(selection) => onPickParty(selection?.id ?? "", selection?.text ?? "")}
          // Dropdown 60 binds `icompany_id` inside a quoted literal: left out,
          // only the shared ledgers match. Always sent.
          params={{ icompany_id: companyId }}
          advanceFocusOnSelect={false}
          clearOnParamsChange={false}
          disabled={!editable}
          invalid={invalid}
          aria-label="Payee"
          className={styles.dropdownField}
        />
      </div>

      <div className={styles.partyFacts}>
        <div className={styles.fact}>
          <span className={styles.factLabel}>Group</span>
          <span className={styles.factValue}>{party.groupName || DASH}</span>
        </div>
        <div className={styles.fact}>
          <span className={styles.factLabel}>Mobile</span>
          <span className={styles.factValue}>{mobile || DASH}</span>
        </div>
        <div className={styles.fact}>
          <span className={styles.factLabel}>TDS</span>
          <span
            className={`${styles.factValue} ${tdsText.tone ? styles.factOverdue : ""}`}
            title={
              party.tdsRateSource === "NO_PAN"
                ? "No PAN on the ledger, so the higher no-PAN rate applies."
                : undefined
            }
          >
            {tdsText.text}
          </span>
        </div>
        <div className={styles.fact}>
          <span className={styles.factLabel}>Address</span>
          <span className={styles.factValue} title={address}>
            {address || DASH}
          </span>
        </div>

        <div className={styles.fact}>
          <span className={styles.factLabel}>We owe</span>
          <span className={styles.factValue}>
            {summary ? formatTotal(summary.totalPending) : DASH}
          </span>
        </div>
        <div className={styles.fact}>
          <span className={styles.factLabel}>Overdue</span>
          <span
            className={`${styles.factValue} ${
              summary && summary.overdueCount > 0 ? styles.factOverdue : styles.factMuted
            }`}
          >
            {summary ? `${summary.overdueCount} bill(s)` : DASH}
          </span>
        </div>
        <div className={styles.fact}>
          <span className={styles.factLabel}>Debits held</span>
          <span
            className={`${styles.factValue} ${held > 0 ? styles.factCredit : styles.factMuted}`}
            title="Advances we paid, debit notes, opening debits — theirs to use up before money is paid."
          >
            {summary ? formatTotal(held) : DASH}
          </span>
        </div>
        <div className={styles.fact}>
          <span className={styles.factLabel}>Our cheques out</span>
          <span className={styles.factValue}>
            {context ? formatTotal(context.chequesOutstanding) : DASH}
          </span>
        </div>

        <div className={styles.fact}>
          <span className={styles.factLabel}>Total we owe</span>
          <span className={styles.factValue}>
            {context ? formatTotal(context.totalBalance) : DASH}
          </span>
        </div>
        <div className={styles.fact}>
          <span className={styles.factLabel}>After this payment</span>
          <span
            className={styles.factValue}
            title={
              appliesToBalance
                ? undefined
                : "This payment has already been posted, so the balance beside it includes it."
            }
          >
            {afterThis === null ? DASH : formatTotal(afterThis)}
          </span>
        </div>
        <div className={styles.fact}>
          <span className={styles.factLabel}>Bank (beneficiary)</span>
          <span className={styles.factValue} title={bankLine(party)}>
            {bankLine(party)}
          </span>
        </div>
        <div className={styles.fact}>
          <span className={styles.factLabel}>Favouring</span>
          <span className={styles.factValue}>{party.favouringName || DASH}</span>
        </div>

        {summary && summary.pdcHeld > 0 ? (
          <p className={styles.pdcNote}>
            Our post-dated cheques hold {formatTotal(summary.pdcHeld)} — those bills stay pending
            until each cheque&apos;s date.
          </p>
        ) : null}
      </div>
    </section>
  );
}
