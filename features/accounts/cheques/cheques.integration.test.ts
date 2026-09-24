/**
 * The cheque register's contract, against a REAL backend.
 *
 * The pure tests prove each action spec builds the body its DTO wants. This
 * proves the body does the thing: it sends every spec's own `build()` output
 * to the live routes and asserts against the SERVER's row (`/cheques/get`),
 * never against a label.
 *
 * SKIPPED BY DEFAULT. It needs a running API and a token:
 *
 *   CHEQUES_IT_API=https://localhost:3011/api/v1 \
 *   CHEQUES_IT_TOKEN=<access token> \
 *   CHEQUES_IT_COMPANY=<comp_id> CHEQUES_IT_BRANCH=<br_id> CHEQUES_IT_YEAR=2026-2027 \
 *   CHEQUES_IT_PARTY=<a customer ledger with open DR bills> \
 *   CHEQUES_IT_TENDER=<acc_tender_master.tnd_id of the CHEQUE tender> \
 *   CHEQUES_IT_TENDER_TYPE=5 \
 *   CHEQUES_IT_BANK=<a BANK ledger id> \
 *     npx vitest run features/accounts/cheques/cheques.integration.test.ts
 *
 * It seeds its own receipt (five 1,000.00 cheques with numbers no earlier run
 * used), so the register may otherwise be empty and the test can be re-run.
 * Each run leaves a posted receipt and its cheques behind — that is the only
 * way the moves can be exercised; nothing here can be deleted.
 *
 * Fixture rule (plan §13): the receipt settles `abl_dr_cr = 'DR'` bills only.
 * Grabbing "the largest pending bill" eventually grabs a credit, which is
 * correctly refused.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { bounceSpec } from "./actions/bounce";
import { clearSpec } from "./actions/clear";
import { depositSpec, representSpec } from "./actions/deposit";
import { replaceSpec } from "./actions/replace";
import { returnSpec } from "./actions/returnCancel";
import type { ActionSpec } from "./actions/types";
import { chequeError } from "./api-errors";
import { fromApiRow, fromGridRow, keysOf } from "./domain/chequeRow";
import { defaultFilters, gridParams } from "./domain/filters";
import type {
  ChequeDetail,
  ChequeHistory,
  ChequeRow,
  ChequeSummary,
  DepositSlip,
} from "./domain/types";

const API = process.env.CHEQUES_IT_API;
const TOKEN = process.env.CHEQUES_IT_TOKEN;
const COMPANY = process.env.CHEQUES_IT_COMPANY ?? "";
const BRANCH = process.env.CHEQUES_IT_BRANCH ?? "";
const YEAR = process.env.CHEQUES_IT_YEAR ?? "2026-2027";
const PARTY = process.env.CHEQUES_IT_PARTY ?? "";
const TENDER = process.env.CHEQUES_IT_TENDER ?? "";
const TENDER_TYPE = Number(process.env.CHEQUES_IT_TENDER_TYPE ?? "5");
const BANK = process.env.CHEQUES_IT_BANK ?? "";

const configured = Boolean(API && TOKEN && COMPANY && BRANCH && PARTY && TENDER && BANK);
const suite = configured ? describe : describe.skip;

if (configured) {
  // The API is served over a mkcert certificate node does not trust.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

function iso(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
const TODAY = iso(new Date());
const INSTRUMENT_DATE = iso(new Date(Date.now() - 5 * 86_400_000));
const SCOPE = { companyId: COMPANY, branchId: BRANCH, accYear: YEAR };

type Reply<T> = { status: number; body: { success?: boolean; message?: unknown; data: T } };

async function call<T>(method: "GET" | "POST", path: string, payload?: unknown): Promise<Reply<T>> {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  return { status: response.status, body: (await response.json()) as Reply<T>["body"] };
}

function query(params: Record<string, string | number>): string {
  return new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  ).toString();
}

async function detailOf(row: ChequeRow): Promise<ChequeDetail> {
  const reply = await call<ChequeDetail>("GET", `/cheques/get?${query(keysOf(row))}`);
  expect(reply.status, JSON.stringify(reply.body)).toBe(200);
  return reply.body.data;
}

async function act<F>(spec: ActionSpec<F>, rows: ChequeRow[], form: F) {
  // The same gate the dialog applies: nothing is sent that `validate` refuses.
  expect(spec.validate(rows, form, TODAY)).toBeNull();
  return call<Record<string, unknown>>("POST", spec.endpoint, spec.build(rows, form));
}

/** Re-read a row as the SERVER holds it now. */
async function fresh(row: ChequeRow): Promise<ChequeRow> {
  return fromApiRow((await detailOf(row)).cheque);
}

suite("received cheques — live", () => {
  const prefix = String(Date.now()).slice(-7);
  let cheques: ChequeRow[] = [];

  beforeAll(async () => {
    // ── Seed: one posted receipt, five cheques ──────────────────────────────
    const tenders = [0, 1, 2, 3, 4].map((index) => ({
      tdRowNo: index + 1,
      tdTenderId: TENDER,
      tdTenderTypeId: TENDER_TYPE,
      tdAmount: 1000,
      tdRefNo: `${prefix}${index}`,
      tdBankName: "Karur Vysya Bank",
      tdInstrumentDate: INSTRUMENT_DATE,
      cheque: { drawerName: "IT Drawer" },
    }));
    const draft = await call<{ header: { avhVoucherId: string } }>("POST", "/receipts/create", {
      avhCompanyId: COMPANY,
      avhBranchId: BRANCH,
      avhAccYear: YEAR,
      avhVoucherDate: TODAY,
      avhPartyId: PARTY,
      tenders,
      otherLines: [],
      allocations: [],
      creditsApplied: [],
    });
    expect(draft.status, JSON.stringify(draft.body)).toBe(201);
    const voucherId = draft.body.data.header.avhVoucherId;

    const open = await call<{ bills: { billId: string; billAccYear: string; pendingAmount: number; pdcHeld?: number }[] }>(
      "GET",
      `/receipts/open-items?${query({ partyId: PARTY, companyId: COMPANY, onDate: TODAY })}`,
    );
    let left = 500_000; // paise
    const allocations = [];
    for (const bill of open.body.data.bills) {
      const pending = Math.round(bill.pendingAmount * 100) - Math.round((bill.pdcHeld ?? 0) * 100);
      if (left <= 0 || pending <= 0) {
        continue;
      }
      const take = Math.min(pending, left);
      left -= take;
      allocations.push({
        billId: bill.billId,
        billAccYear: bill.billAccYear,
        amount: take / 100,
        discount: 0,
        writeoff: 0,
        roundoff: 0,
      });
    }
    const posted = await call("POST", "/receipts/post", {
      avhVoucherId: voucherId,
      avhCompanyId: COMPANY,
      avhBranchId: BRANCH,
      avhAccYear: YEAR,
      allocations,
      creditsApplied: [],
      otherLineBills: [],
      onAccount: left / 100,
    });
    expect(posted.status, JSON.stringify(posted.body)).toBe(201);

    // ── Find them through grid 109, all nine parameters, search in isearch ──
    const params = gridParams({ ...defaultFilters({ from: "", to: "" }), ticks: [], search: prefix }, SCOPE);
    const grid = await call<{ items: Record<string, unknown>[] }>(
      "GET",
      `/configured-grid-sql/run?${query({ grid_id: 109, page: 1, limit: 50, grid_param: JSON.stringify(params) })}`,
    );
    expect(grid.status, JSON.stringify(grid.body)).toBe(200);
    cheques = grid.body.data.items
      .map(fromGridRow)
      .sort((a, b) => a.instrumentNo.localeCompare(b.instrumentNo));
  }, 60_000);

  it("reads the seeded cheques through grid 109, parsed", () => {
    expect(cheques).toHaveLength(5);
    for (const row of cheques) {
      expect(row.status).toBe("HELD");
      expect(row.amount).toBe(1000);
      expect(row.accYear).toBe(YEAR);
      expect(row.companyId).toBe(COMPANY);
      expect(row.receiptRefno).not.toBe("");
    }
  });

  it("fails the whole grid call when a token is missing — no silent empty register", async () => {
    const params: Record<string, string> = { ...gridParams(defaultFilters({ from: "", to: "" }), SCOPE) };
    delete params.isearch;
    const grid = await call("GET", `/configured-grid-sql/run?${query({ grid_id: 109, page: 1, limit: 5, grid_param: JSON.stringify(params) })}`);
    expect(grid.status).toBe(400);
    expect(chequeError({ status: 400, data: grid.body })).toMatch(/isearch/);
  });

  it("answers the summary", async () => {
    const reply = await call<{ summary: ChequeSummary }>(
      "GET",
      `/cheques/list?${query({ apdCompanyId: COMPANY, apdBranchId: BRANCH, apdAccYear: YEAR, limit: 1 })}`,
    );
    expect(reply.status).toBe(200);
    expect(reply.body.data.summary.inHandCount).toBeGreaterThanOrEqual(5);
  });

  it("refuses to clear a HELD cheque with the server's own sentence (409)", async () => {
    const [held] = cheques;
    const reply = await call("POST", "/cheques/clear", clearSpec.build([held], clearSpec.initial([held], TODAY)));
    expect(reply.status).toBe(409);
    const sentence = chequeError({ status: 409, data: reply.body });
    expect(sentence).toContain(held.instrumentNo);
    expect(sentence).not.toBe("Validation failed");
  });

  it("deposits two on one slip, and the slip lists both", async () => {
    const pair = cheques.slice(0, 2);
    const form = {
      ...depositSpec.initial(pair, TODAY),
      bankLedgerId: BANK,
      slipNo: `IT-${prefix}`,
    };
    const reply = await act(depositSpec, pair, form);
    expect(reply.status, JSON.stringify(reply.body)).toBe(201);
    for (const row of pair) {
      const now = await fresh(row);
      expect(now.status).toBe("DEPOSITED");
      expect(now.depositSlipNo).toBe(`IT-${prefix}`);
    }
    const slip = await call<DepositSlip>(
      "GET",
      `/cheques/deposit-slip?${query({ apdCompanyId: COMPANY, apdBranchId: BRANCH, bankLedgerId: BANK, depositDate: TODAY, slipNo: `IT-${prefix}` })}`,
    );
    expect(slip.status).toBe(200);
    expect(slip.body.data.chequeCount).toBe(2);
    expect(slip.body.data.lines.map((line) => line.instrumentNo).sort()).toEqual(
      pair.map((row) => row.instrumentNo).sort(),
    );
  });

  it("answers an unknown slip with 200 and no lines — the count must be checked", async () => {
    const slip = await call<DepositSlip>(
      "GET",
      `/cheques/deposit-slip?${query({ apdCompanyId: COMPANY, apdBranchId: BRANCH, bankLedgerId: BANK, depositDate: TODAY, slipNo: `NONE-${prefix}` })}`,
    );
    expect(slip.status).toBe(200);
    expect(slip.body.data.chequeCount).toBe(0);
  });

  it("clears one", async () => {
    const row = await fresh(cheques[0]);
    const reply = await act(clearSpec, [row], clearSpec.initial([row], TODAY));
    expect(reply.status, JSON.stringify(reply.body)).toBe(201);
    const detail = await detailOf(row);
    expect(detail.cheque.apdStatus).toBe("CLEARED");
    expect(detail.clearVoucher).not.toBeNull();
  });

  let settledBeforeBounce: string[] = [];

  it("bounces one with both charges: one voucher, bills reopened, a charge bill raised", async () => {
    const row = await fresh(cheques[1]);
    settledBeforeBounce = (await detailOf(row)).bills
      .filter((bill) => bill.settledByThisCheque > 0)
      .map((bill) => bill.billId)
      .sort();
    const reply = await act(bounceSpec, [row], {
      ...bounceSpec.initial([row], TODAY),
      reason: "Funds insufficient",
      bankCharge: "150",
      partyCharge: "300",
    });
    expect(reply.status, JSON.stringify(reply.body)).toBe(201);
    const detail = await detailOf(row);
    expect(detail.cheque.apdStatus).toBe("BOUNCED");
    expect(detail.bounceVoucher).not.toBeNull();
    expect(detail.chargeBill?.docRefno ?? "").toMatch(/BNC/i);
    // Reversed: the cheque settles nothing now.
    expect(detail.bills.every((bill) => bill.settledByThisCheque <= 0)).toBe(true);
  });

  it("re-presents it, settling the SAME bills again (not a FIFO pick)", async () => {
    const row = await fresh(cheques[1]);
    const reply = await act(representSpec, [row], {
      ...representSpec.initial([row], TODAY),
      bankLedgerId: BANK,
      slipNo: `IT-${prefix}-R`,
    });
    expect(reply.status, JSON.stringify(reply.body)).toBe(201);
    const detail = await detailOf(row);
    expect(detail.cheque.apdStatus).toBe("DEPOSITED");
    expect(detail.cheque.apdPresentCount).toBe(2);
    const settledNow = detail.bills
      .filter((bill) => bill.settledByThisCheque > 0)
      .map((bill) => bill.billId)
      .sort();
    expect(settledNow).toEqual(settledBeforeBounce);
  });

  // Plan §14.1: a second bounce after a re-present was a 500 on 2026-09-17.
  // Its status since the notes-37/38/39 fixes had not been re-checked.
  it("bounces it a second time", async () => {
    const row = await fresh(cheques[1]);
    const reply = await act(bounceSpec, [row], {
      ...bounceSpec.initial([row], TODAY),
      reason: "Payment stopped by drawer",
    });
    expect(reply.status, JSON.stringify(reply.body)).toBe(201);
    expect((await fresh(row)).status).toBe("BOUNCED");
  });

  it("replaces a BOUNCED cheque — no reason needed", async () => {
    const row = await fresh(cheques[1]);
    if (row.status !== "BOUNCED") {
      return; // The second bounce failed; that test already says why.
    }
    const reply = await act(replaceSpec, [row], {
      ...replaceSpec.initial([row], TODAY),
      instrumentNo: `${prefix}9`,
    });
    expect(reply.status, JSON.stringify(reply.body)).toBe(201);
    const detail = await detailOf(row);
    expect(detail.cheque.apdStatus).toBe("REPLACED");
    expect(detail.replacedBy?.apdInstrumentNo).toBe(`${prefix}9`);
  });

  it("returns a HELD one to the party", async () => {
    const row = await fresh(cheques[2]);
    const reply = await act(returnSpec, [row], {
      action: "RETURNED" as const,
      reason: "Party asked for it back",
      remarks: "",
    });
    expect(reply.status, JSON.stringify(reply.body)).toBe(201);
    expect((await fresh(row)).status).toBe("RETURNED");
  });

  it("cancels a HELD one", async () => {
    const row = await fresh(cheques[3]);
    const reply = await act(returnSpec, [row], {
      action: "CANCELLED" as const,
      reason: "Keyed by mistake",
      remarks: "",
    });
    expect(reply.status, JSON.stringify(reply.body)).toBe(201);
    expect((await fresh(row)).status).toBe("CANCELLED");
  });

  // Plan §14.3: the Qt panel never sends a reason when replacing from HELD.
  // The server fills one in (verified 2026-09-24) — pinned here so a server
  // change that starts refusing it is caught.
  it("replaces a HELD cheque with no reason, recording the server's own", async () => {
    const row = await fresh(cheques[4]);
    const form = { ...replaceSpec.initial([row], TODAY), instrumentNo: `${prefix}8` };
    const reply = await act(replaceSpec, [row], form);
    expect(reply.status, JSON.stringify(reply.body)).toBe(201);
    const detail = await detailOf(row);
    expect(detail.cheque.apdStatus).toBe("REPLACED");
    expect(detail.replacedBy?.apdInstrumentNo).toBe(`${prefix}8`);
  });

  // Plan §14.2: a replacement row has no tender row, so /return refuses it.
  // The client must NOT predict that — it offers Return and shows this
  // sentence. Pinned so the day the server fix lands, this test says so.
  it("still refuses to return a replacement cheque (server gap §14.2)", async () => {
    const detail = await detailOf(cheques[4]);
    const replacement = detail.replacedBy ? fromApiRow(detail.replacedBy) : null;
    expect(replacement?.status).toBe("HELD");
    if (!replacement) {
      return;
    }
    const reply = await call("POST", returnSpec.endpoint, returnSpec.build([replacement], {
      action: "RETURNED" as const,
      reason: "probe",
      remarks: "",
    }));
    expect(reply.status).toBe(400);
    expect(chequeError({ status: 400, data: reply.body })).toMatch(/no tender row/);
  });

  it("keeps the history, newest first", async () => {
    const reply = await call<ChequeHistory>("GET", `/cheques/history?${query(keysOf(cheques[1]))}`);
    expect(reply.status).toBe(200);
    const steps = reply.body.data.entries;
    expect(steps.length).toBeGreaterThanOrEqual(4);
    const order = steps.map((entry) => entry.seqNo);
    expect([...order].sort((a, b) => b - a)).toEqual(order);
  });
});
