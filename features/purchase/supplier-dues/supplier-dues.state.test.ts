import { describe, expect, it } from "vitest";
import {
  EMPTY_SETTLE_FORM,
  REASON_NEEDED,
  actingRows,
  claimActionText,
  claimRowOf,
  claimRowsFrom,
  closeActionText,
  duesChip,
  duesStripCells,
  kindWords,
  previewLines,
  previewTotals,
  settleBody,
  settleProblem,
  settleView,
  shortageFromText,
  shortageRowOf,
  toggleTick,
} from "./supplier-dues.state";
import { shortRef } from "../shared/purchase.format";
import {
  closeBody,
  closeQtyProblem,
  closeReady,
  closeTitle,
  initialCloseForm,
} from "./shortage-close";
import type { DuesClaimWire, DuesShortageWire } from "./supplier-dues.types";

const claimWire = (over: Partial<DuesClaimWire> = {}): DuesClaimWire => ({
  source: "RETURN",
  returnItemId: "ri-1",
  shortageCloseId: null,
  accYear: "2026-2027",
  claimRef: "PRN/2026-2027/D14/00206 · r1",
  docDate: "2026-10-29",
  ageDays: 0,
  srcRefno: "PUR/2026-2027/D14/00611",
  srcDocDate: "2026-10-28",
  srcSupplierInvNo: "SMA/1",
  itemName: "ZT-ITEM-A",
  qty: "1",
  unitName: "PCS",
  kindText: "Claim — goods sent",
  reasonName: null,
  claimAgainst: "SUPPLIER",
  claimPartyId: "sup-1",
  partyName: "ZT-PUR Supplier",
  claimValue: "118.00",
  credited: "0.00",
  writtenOff: "0.00",
  open: "118.00",
  status: "OPEN",
  lastAction: null,
  ...over,
});

const shortWire = (over: Partial<DuesShortageWire> = {}): DuesShortageWire => ({
  shortageId: "sh-1",
  accYear: "2026-2027",
  itemName: "ZT-ITEM-A",
  unitName: "PCS",
  reason: "BILL",
  reasonText: "Short on bill",
  srcRefno: "PUR/2026-2027/D14/00611",
  srcDocDate: "2026-10-29",
  srcLineNo: 2,
  ageDays: 0,
  qtyBase: "3",
  received: "0",
  closed: "0",
  openQty: "3",
  openValue: "300.00",
  openGst: "54.00",
  costRate: "100.00",
  gstPending: true,
  status: "OPEN",
  lastAction: null,
  ...over,
});

describe("words", () => {
  it("shortens refs like Qt", () => {
    expect(shortRef("PRN/2026-2027/D14/00206")).toBe("PRN/…/00206");
    expect(shortRef("X/1")).toBe("X/1");
    expect(claimRowOf(claimWire()).claim).toBe("PRN/…/00206 · r1");
    expect(kindWords("Claim — destroyed here")).toBe("Destroyed here");
    expect(kindWords("Shortage claim")).toBe("Shortage claim");
  });
  it("From = refno · line n; null line = refno only", () => {
    expect(shortageFromText("PUR/2026-2027/D14/00611", 2)).toBe("PUR/…/00611 · line 2");
    expect(shortageFromText("PUR/2026-2027/D14/00611", null)).toBe("PUR/…/00611");
    expect(shortageRowOf(shortWire({ srcLineNo: undefined })).from).toBe("PUR/…/00611");
  });
  it("last actions", () => {
    expect(claimActionText(null)).toBe("—");
    expect(claimActionText({ settlementId: "s", accYear: "y", action: "CREDIT", cnNo: "SMA/CN/88", amount: "1000" })).toBe(
      "CN SMA/CN/88 · 1,000.00",
    );
    expect(claimActionText({ settlementId: "s", accYear: "y", action: "CREDIT", receivedAs: "ADJUST", amount: "5" })).toBe(
      "Adjust in next bill · 5.00",
    );
    expect(claimActionText({ settlementId: "s", accYear: "y", action: "REJECTED", amount: "5" })).toBe("Rejected · 5.00");
    expect(closeActionText({ closeId: "c", accYear: "y", kind: "CLAIM", qty: "1", partyName: "KPN" }, "PCS")).toBe(
      "Claim on KPN · 1 PCS",
    );
    expect(closeActionText({ closeId: "c", accYear: "y", kind: "SUPPLIER_CN", qty: "2" }, "")).toBe("Supplier CN · 2");
  });
  it("GST held only when pending", () => {
    expect(shortageRowOf(shortWire()).gstHeld).toBe("54.00");
    expect(shortageRowOf(shortWire({ gstPending: false })).gstHeld).toBe("—");
  });
  it("against: Supplier, else the party in amber", () => {
    const r = claimRowOf(claimWire({ claimAgainst: "TRANSPORTER", partyName: "KPN Parcel" }));
    expect(r.against).toBe("KPN Parcel");
    expect(r.againstOther).toBe(true);
  });
});

describe("ticks and totals", () => {
  it("keeps ticks across a reload", () => {
    const first = toggleTick([claimRowOf(claimWire())], "ri-1");
    const again = claimRowsFrom([claimWire({ open: "18.00" })], first);
    expect(again[0].ticked).toBe(true);
    expect(again[0].open).toBe(18);
  });
  it("acting rows: ticked, else current", () => {
    const rows = [claimRowOf(claimWire()), claimRowOf(claimWire({ returnItemId: "ri-2" }))];
    expect(actingRows(rows, "ri-2").map((r) => r.key)).toEqual(["ri-2"]);
    expect(actingRows(toggleTick(rows, "ri-1"), "ri-2").map((r) => r.key)).toEqual(["ri-1"]);
  });
  it("chip and strip", () => {
    expect(duesChip({ openCount: 3 } as never)).toEqual({ text: "3 OPEN", tone: "warning" });
    expect(duesChip(null).text).toBe("NOTHING OPEN");
    const cells = duesStripCells({
      openCount: 3,
      claims: { rows: 2, value: "236", credited: "0", writtenOff: "0", open: "236.00" },
      shortages: { rows: 1, openQtyBase: "3", openValue: "300", gstHeld: "54" },
    });
    expect(cells.map((c) => c.value)).toEqual(["2 rows", "236.00", "0.00 · 0.00", "1 row · 3 base open", "300.00", "54.00"]);
  });
});

describe("the Settle form", () => {
  const one = [claimRowOf(claimWire())];
  it("one row credit: amount defaults to open; less leaves a balance", () => {
    const v = settleView(one, EMPTY_SETTLE_FORM);
    expect(v.title).toBe("Settle claim — PRN/…/00206 · r1 (open 118.00)");
    expect(v.amountText).toBe("118.00");
    expect(v.balanceChoices[0].value).toBe("NONE");
    const typed = { ...EMPTY_SETTLE_FORM, amount: "100", amountTyped: true, balance: "WRITE_OFF" as const, reason: "short" };
    const v2 = settleView(one, typed);
    expect(v2.balanceChoices.map((c) => c.label)).toEqual(["18.00 stays open", "18.00 → write off"]);
    expect(v2.reasonEnabled).toBe(true);
    expect(settleBody(one, typed, { deviceId: "d", docDate: "2026-10-29", dryRun: true })).toEqual({
      rows: [{ returnItemId: "ri-1", accYear: "2026-2027", amount: 100 }],
      deviceId: "d",
      action: "CREDIT",
      docDate: "2026-10-29",
      receivedAs: "CN",
      writeOffRest: true,
      writeOffReason: "short",
      dryRun: true,
    });
  });
  it("refuses an amount over the open, and a write-off without a reason", () => {
    expect(settleProblem(one, { ...EMPTY_SETTLE_FORM, amount: "200", amountTyped: true })).toBe(
      "The amount is more than the 118.00 open.",
    );
    expect(settleProblem(one, { ...EMPTY_SETTLE_FORM, action: "REJECTED" })).toBe(REASON_NEEDED);
    expect(settleProblem([], EMPTY_SETTLE_FORM)).toBe("Tick the claim(s) to settle.");
    expect(settleProblem([claimRowOf(claimWire({ open: "0" }))], EMPTY_SETTLE_FORM)).toContain("fully settled");
  });
  it("several rows settle whole (no amount); a shortage claim sends shortageCloseId", () => {
    const rows = [one[0], claimRowOf(claimWire({ source: "SHORTAGE", returnItemId: null, shortageCloseId: "sc-1" }))];
    const body = settleBody(rows, { ...EMPTY_SETTLE_FORM, receivedAs: "ADJUST", cnNo: "X" }, { deviceId: "d", dryRun: false });
    expect(body.rows).toEqual([
      { returnItemId: "ri-1", accYear: "2026-2027" },
      { shortageCloseId: "sc-1", accYear: "2026-2027" },
    ]);
    expect(body.receivedAs).toBe("ADJUST");
    expect(body.cnNo).toBeUndefined();
  });
  it("write-off actions send the reason", () => {
    const body = settleBody(one, { ...EMPTY_SETTLE_FORM, action: "SHORT_SETTLED", reason: " r " }, { deviceId: "d", dryRun: true });
    expect(body).toMatchObject({ action: "SHORT_SETTLED", reason: "r" });
    expect(body.receivedAs).toBeUndefined();
  });
});

describe("What Settle writes", () => {
  it("pairs one Cr with several Dr", () => {
    const answer = {
      dryRun: true,
      steps: [
        {
          source: "RETURN",
          legs: [
            { drCr: "DR", role: null, ledgerId: "s", ledgerName: "ZT-PUR Supplier", amount: "100.00", remarks: null },
            { drCr: "DR", role: "WRITE_OFF", ledgerId: null, ledgerName: "Bad Debts Written Off", amount: "18.00", remarks: "Claim — short-settled" },
            { drCr: "CR", role: "CLAIM_RECEIVABLE", ledgerId: null, ledgerName: "Claims Receivable", amount: "118.00", remarks: null },
          ],
        },
      ],
      totals: { credited: "100.00", writtenOff: "18.00", gstReavailed: "0.00" },
    };
    expect(previewLines(answer)).toEqual([
      { dr: "ZT-PUR Supplier", cr: "Claims Receivable", amount: 100 },
      { dr: "Bad Debts Written Off (short-settled)", cr: "Claims Receivable", amount: 18 },
    ]);
    expect(previewTotals(answer)).toBe("Credited 100.00  ·  Written off 18.00");
  });
});

describe("Close row… dialog body", () => {
  it("one row: qty only when less than open; CN no / date on a supplier CN", () => {
    const f = { ...initialCloseForm(3), cnNo: " CN1 ", cnDate: "2026-10-29" };
    expect(f.qty).toBe("3");
    expect(closeBody(f, 1, 3)).toEqual({ kind: "SUPPLIER_CN", cnNo: "CN1", cnDate: "2026-10-29" });
    expect(closeBody({ ...f, qty: "2" }, 1, 3)).toMatchObject({ qty: 2 });
    expect(closeQtyProblem({ ...f, qty: "4" }, 1, 3)).toBe("Qty must be more than 0 and at most 3 (what is open).");
    expect(closeQtyProblem({ ...f, qty: "4" }, 2, 3)).toBe("");
  });
  it("claim on the insurer needs the party; write off needs the reason", () => {
    const claim = { ...initialCloseForm(1), choice: "CLAIM:INSURER" as const };
    expect(closeReady(claim)).toBe(false);
    const withParty = { ...claim, partyId: "led-1", cnNo: "ignored" };
    expect(closeReady(withParty)).toBe(true);
    expect(closeBody(withParty, 1, 1)).toEqual({ kind: "CLAIM", partyId: "led-1", claimAgainst: "INSURER" });
    const wo = { ...initialCloseForm(1), choice: "WRITE_OFF" as const };
    expect(closeReady(wo)).toBe(false);
    expect(closeBody({ ...wo, reason: "lost" }, 2, 1)).toEqual({ kind: "WRITE_OFF", reason: "lost" });
  });
  it("titles", () => {
    expect(closeTitle(1, 3, "PCS")).toBe("Close the shortage without goods — 3 PCS open");
    expect(closeTitle(2, 3, "PCS")).toBe("Close 2 shortages without goods — each one whole");
  });
});
