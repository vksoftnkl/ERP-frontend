"use client";

/**
 * The GST band's box (the Qt `grpGst`): one row per rate — taxable, then
 * CGST + SGST within the state or IGST across it (cess only when there is
 * any) — what the server worked out while keying, the stored GST document
 * once posted. Nothing here is typed except two things on the INPUT side (a
 * purchase):
 *
 *  - **ITC** per rate row: the class every line at that rate shares ("—
 *    mixed —" when they differ); a pick sets it on every line at the rate.
 *    Unpicked, the server defaults it (the ledger's class, else by HSN).
 *  - **Reverse charge**: the party is owed the taxable only; the tax is ours
 *    to pay.
 */
import receiptStyles from "@/features/accounts/receipt/page.module.scss";
import styles from "../vouchers.module.scss";
import { formatPaise } from "../domain/lines";
import type { GstShown } from "../state/use-voucher-entry";
import { Box } from "./voucher-extras";

const ITC_CLASSES = [
  { value: "INPUTS", label: "Inputs" },
  { value: "INPUT_SERVICES", label: "Input services" },
  { value: "CAPITAL_GOODS", label: "Capital goods" },
  { value: "INELIGIBLE", label: "Ineligible" },
] as const;

export type GstBoxProps = {
  gst: GstShown | null;
  /** The INPUT side: ITC and reverse charge are asked. */
  input: boolean;
  readOnly: boolean;
  reverseCharge: boolean;
  /** The ITC class the typed lines at these rows share: a class, "mixed", or "" (unsaid). */
  itcOf: (rowNos: readonly number[]) => string;
  onItc: (rowNos: readonly number[], value: string) => void;
  onReverseCharge: (value: boolean) => void;
};

const money = (amount: number) => formatPaise(Math.round(amount * 100));

export function GstBox({ gst, input, readOnly, reverseCharge, itcOf, onItc, onReverseCharge }: GstBoxProps) {
  const intra = gst?.supplyNature !== "INTER_STATE";
  const cess = (gst?.cess ?? 0) > 0;
  const hint = gst
    ? [
        `${intra ? "Intra-state" : "Inter-state"} · place of supply ${gst.placeOfSupply || "—"}`,
        gst.reverseCharge ? "Reverse charge: the party is owed the taxable only; the tax is ours to pay." : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
  const rows = gst?.rows ?? [];
  return (
    <Box
      title="GST"
      hint={hint}
      framed
      footer={
        input ? (
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={reverseCharge}
              disabled={readOnly}
              onChange={(event) => onReverseCharge(event.target.checked)}
            />
            Reverse charge (the tax is ours to pay, not the supplier&apos;s)
          </label>
        ) : null
      }
    >
      {/* The headings stay up with no rate under them, as Qt's table does. */}
      <table className={receiptStyles.panelTable}>
        <thead>
          <tr>
            <th>Rate</th>
            <th>Taxable</th>
            {intra ? (
              <>
                <th>CGST</th>
                <th>SGST</th>
              </>
            ) : (
              <th>IGST</th>
            )}
            {cess ? <th>Cess</th> : null}
            {input ? <th>ITC</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const itc = input ? itcOf(row.lines) : "";
            return (
              <tr key={row.taxId || row.taxName}>
                <td>{row.taxName}</td>
                <td className={styles.alignRight}>{money(row.taxable)}</td>
                {intra ? (
                  <>
                    <td className={styles.alignRight}>{money(row.cgst)}</td>
                    <td className={styles.alignRight}>{money(row.sgst)}</td>
                  </>
                ) : (
                  <td className={styles.alignRight}>{money(row.igst)}</td>
                )}
                {cess ? <td className={styles.alignRight}>{money(row.cess)}</td> : null}
                {input ? (
                  <td style={{ padding: 0 }}>
                    <select
                      className={receiptStyles.cellSelect}
                      value={itc === "mixed" ? "mixed" : itc}
                      disabled={readOnly}
                      aria-label={`ITC at ${row.taxName}`}
                      onChange={(event) => {
                        const value = event.target.value;
                        if (ITC_CLASSES.some((option) => option.value === value)) {
                          onItc(row.lines, value);
                        }
                      }}
                    >
                      {itc === "mixed" ? <option value="mixed">— mixed —</option> : null}
                      {itc === "" ? <option value="">— choose —</option> : null}
                      {ITC_CLASSES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Box>
  );
}
