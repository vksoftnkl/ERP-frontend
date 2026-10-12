/**
 * The tenders a statement can be for — Qt loadTenders(): money a provider pays
 * out (card terminals, UPI QRs, wallets, bank = UPI straight to the account).
 *
 * `/tender-masters/list` filters only `tndIsDeleted`: every tenant's rows come
 * back, so the company is narrowed here (the settlement routes refuse another
 * company's tender with SETTLEMENT_NOT_FOUND). Inactive tenders are kept, as in
 * Qt — a retired terminal can still have a statement to bring in.
 */
import { text } from "./parse";

export type SettlementTender = {
  id: string;
  name: string;
  typeName: string;
  terminalId: string;
  upiVpa: string;
  settlementLedgerId: string;
  position: number;
};

const SETTLEMENT_TYPES = ["CARD", "UPI", "WALLET", "BANK"];
/** acc_tender_types ids, for a row that does not carry its type's name. */
const SETTLEMENT_TYPE_IDS: Record<string, string> = { "2": "CARD", "3": "UPI", "4": "WALLET", "6": "BANK" };

export function settlementTenders(rows: readonly unknown[], companyId: string): SettlementTender[] {
  const out: SettlementTender[] = [];
  for (const row of rows) {
    if (text(row, "tndIsDeleted") === "true") continue;
    const company = text(row, "tndCompanyId");
    if (companyId && company && company !== companyId) continue;
    const typeName = (text(row, "tndTypeName") || SETTLEMENT_TYPE_IDS[text(row, "tndTypeId")] || "").toUpperCase();
    if (!SETTLEMENT_TYPES.includes(typeName)) continue;
    const id = text(row, "tndId");
    if (!id) continue;
    const position = Number(text(row, "tndDisplayPosition"));
    out.push({
      id,
      name: text(row, "tndName"),
      typeName,
      terminalId: text(row, "tndTerminalId"),
      upiVpa: text(row, "tndUpiVpa"),
      settlementLedgerId: text(row, "tndSettlementLedgerId"),
      position: Number.isFinite(position) ? position : 0,
    });
  }
  return out.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

/** The import dialog's label: "HDFC CARD  · TID T2  · vk@kvb". */
export function tenderLabel(tender: SettlementTender): string {
  let label = tender.name;
  if (tender.terminalId) label += `  · TID ${tender.terminalId}`;
  if (tender.upiVpa) label += `  · ${tender.upiVpa}`;
  return label;
}
