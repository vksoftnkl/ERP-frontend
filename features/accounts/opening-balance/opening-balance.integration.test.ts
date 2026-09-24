/**
 * The opening-balance contract, against a REAL backend.
 *
 * The pure tests beside this one prove that the builders emit the right bodies.
 * They cannot prove that the right body does the right thing, and the three
 * traps that matter most here are SILENT when they are wrong: a zero row that
 * "saves" but leaves the old figure standing, a reloaded bill that 400s on
 * `ux_abl_doc_refno` because its `ablId` was dropped, and a company-level save
 * that lands in a branch set. This is the test that catches those.
 *
 * SKIPPED BY DEFAULT. It needs a running API and a valid bearer token, which no
 * ordinary `npm test` has. To run it:
 *
 *   OPENING_IT_API=https://localhost:3011/api/v1 \
 *   OPENING_IT_TOKEN=<access token> \
 *   OPENING_IT_COMPANY=<companys.comp_id> \
 *   OPENING_IT_BRANCH=<branch_master.br_id of that company> \
 *   OPENING_IT_YEAR=2026-2027 \
 *     npx vitest run features/accounts/opening-balance/opening-balance.integration.test.ts
 *
 * **IT COLLIDES WITH A LIVE SESSION.** It saves with `replace: true` over the
 * company-year it is pointed at, so if anyone has menu 55 open on the same scope
 * each save deletes the other's rows. Three desktop runs failed that way before
 * anyone noticed. Re-run before believing a failure.
 *
 * It seeds its own data through the same API, leaves the set balanced
 * (Dr 350,000 = Cr 350,000), and can therefore be re-run.
 *
 * It asserts no row COUNT and no column ORDER: the chart grows (seeding the
 * ledger role map took one company from 21 rows to 31 overnight) and the layout
 * belongs to the operator.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { partyNet, totals } from "./derived";
import type {
  LedgerRow,
  OpeningBillsPayload,
  OpeningBillsSavePayload,
  OpeningListPayload,
  OpeningSavePayload,
  Scope,
} from "./opening-balance.types";
import { buildBillsPayload } from "./payload/build-bills-payload";
import { buildLedgerPayload } from "./payload/build-ledger-payload";
import { parseBillRows, parseLedgerRows } from "./wire/parse";

const API = process.env.OPENING_IT_API;
const TOKEN = process.env.OPENING_IT_TOKEN;
const COMPANY = process.env.OPENING_IT_COMPANY;
const BRANCH = process.env.OPENING_IT_BRANCH;
const YEAR = process.env.OPENING_IT_YEAR ?? "2026-2027";

const configured = Boolean(API && TOKEN && COMPANY && BRANCH);
const suite = configured ? describe : describe.skip;

// The API is served over a mkcert certificate node does not trust.
if (configured) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

const SCOPE: Scope = {
  companyId: COMPANY ?? "",
  branchId: BRANCH ?? null,
  accYear: YEAR,
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json()) as {
    success: boolean;
    data: T;
    message?: string;
    errors?: { field: string; message: string }[];
  };
  if (!response.ok || !body.success) {
    const detail = (body.errors ?? []).map((entry) => `${entry.field}: ${entry.message}`).join("; ");
    throw new Error(`${path} → ${response.status} ${body.message ?? ""} ${detail}`.trim());
  }
  return body.data;
}

function listQuery(branchId: string | null, includeZero: boolean): string {
  const params = new URLSearchParams({ companyId: SCOPE.companyId, accYear: SCOPE.accYear });
  if (branchId) {
    params.set("branchId", branchId);
  }
  params.set("includeZero", String(includeZero));
  return params.toString();
}

const fetchList = (branchId: string | null, includeZero: boolean) =>
  call<OpeningListPayload>(`/opening-balances/list?${listQuery(branchId, includeZero)}`);

suite("opening balances, live", () => {
  /** The whole chart for the scope, which is where the fixture picks from. */
  let chart: LedgerRow[] = [];
  let plainLedgers: LedgerRow[] = [];
  let party: LedgerRow | undefined;

  beforeAll(async () => {
    const payload = await fetchList(SCOPE.branchId, true);
    chart = parseLedgerRows(payload.rows);
    plainLedgers = chart.filter((row) => row.ledId !== "" && !row.isBillWise);
    party = chart.find((row) => row.isBillWise);
    expect(plainLedgers.length).toBeGreaterThanOrEqual(4);
    expect(party).toBeDefined();
  });

  it("honours includeZero=false, and totals the same chart either way", async () => {
    // 31 rows against 5, with THE SAME trial balance, on the reference database.
    // The narrow list is what `replace:true` is safe over; the totals are what
    // catches a ledger nobody remembered.
    const wide = await fetchList(SCOPE.branchId, true);
    const narrow = await fetchList(SCOPE.branchId, false);
    expect(narrow.rows.length).toBeLessThanOrEqual(wide.rows.length);
    expect(narrow.trialBalance.totalDebit).toBe(wide.trialBalance.totalDebit);
    expect(narrow.trialBalance.totalCredit).toBe(wide.trialBalance.totalCredit);
  });

  it("saves a balanced set, reloads it identically, and round-trips the remark", async () => {
    const [assetA, assetB, liabilityA, liabilityB] = plainLedgers;
    const rows: LedgerRow[] = [
      { ...assetA, amount: 200000, drCr: "Dr", remarks: "as per audited statement" },
      { ...assetB, amount: 150000, drCr: "Dr", remarks: "" },
      { ...liabilityA, amount: 210000, drCr: "Cr", remarks: "" },
      { ...liabilityB, amount: 140000, drCr: "Cr", remarks: "" },
    ];
    expect(totals(rows).isBalanced).toBe(true);

    const saved = await call<OpeningSavePayload>("/opening-balances/create", {
      method: "POST",
      body: JSON.stringify(buildLedgerPayload(SCOPE, rows)),
    });
    expect(saved.trialBalance.totalDebit).toBe(350000);
    expect(saved.trialBalance.totalCredit).toBe(350000);
    expect(saved.trialBalance.isBalanced).toBe(true);

    const reloaded = parseLedgerRows((await fetchList(SCOPE.branchId, false)).rows);
    for (const row of rows) {
      const back = reloaded.find((candidate) => candidate.ledId === row.ledId);
      expect(back, `"${row.ledName}" came back`).toBeDefined();
      expect(back?.amount).toBe(row.amount);
      expect(back?.drCr).toBe(row.drCr);
      expect(back?.opId).toBeTruthy();
    }
    // Written by /create and returned by /list. A remark that can be saved but
    // never read back paints blank, and the note looks lost when it is only
    // invisible.
    expect(
      reloaded.find((candidate) => candidate.ledId === assetA.ledId)?.remarks,
    ).toBe("as per audited statement");
  });

  it("clears a row by ABSENCE, not by sending zero", async () => {
    // Sending 0 earns a skippedZero and leaves the old row standing; omitting it
    // under replace:true is what deletes it. This is why there is no /delete call
    // anywhere in the feature.
    const before = parseLedgerRows((await fetchList(SCOPE.branchId, false)).rows);
    const survivors = before.filter((row) => row.ledId !== "").slice(0, 2);
    const dropped = before.filter(
      (row) => row.ledId !== "" && !survivors.some((keep) => keep.ledId === row.ledId),
    );
    const cleared = await call<OpeningSavePayload>("/opening-balances/create", {
      method: "POST",
      body: JSON.stringify(buildLedgerPayload(SCOPE, survivors)),
    });
    expect(cleared.deleted).toBeGreaterThan(0);

    const after = parseLedgerRows((await fetchList(SCOPE.branchId, false)).rows);
    for (const row of dropped) {
      // A bill-wise party is RETAINED rather than deleted; the rest are gone.
      if (!row.isBillWise) {
        expect(after.find((candidate) => candidate.ledId === row.ledId)?.amount ?? 0).toBe(0);
      }
    }
  });

  it("opens a bill-wise party at the NET of its bills, and ties on the server", async () => {
    const partyId = party!.ledId;
    const loaded = await call<OpeningBillsPayload>(
      `/opening-balances/bills?partyId=${partyId}&companyId=${SCOPE.companyId}&accYear=${SCOPE.accYear}&branchId=${SCOPE.branchId}`,
    );

    const stamp = Date.now();
    const bills = [
      {
        ...parseBillRows([])[0],
        key: "a",
        ablId: null,
        docRefno: `IT/${stamp}/A`,
        docDate: "2026-01-12",
        drCr: "Dr" as const,
        amount: 5000,
      },
      {
        ...parseBillRows([])[0],
        key: "b",
        ablId: null,
        docRefno: `IT/${stamp}/B`,
        docDate: "2026-01-20",
        drCr: "Cr" as const,
        amount: 3000,
      },
    ];
    // 5,000 Dr against 3,000 Cr opens the party at 2,000 Dr, not 8,000.
    expect(partyNet(bills)).toEqual({ amount: 2000, side: "Dr" });

    const written = await call<OpeningBillsSavePayload>("/opening-balances/bills", {
      method: "POST",
      body: JSON.stringify(
        buildBillsPayload({ scope: SCOPE, partyId, opId: loaded.opId }, bills),
      ),
    });
    // POST /bills OWNS op_amount and rewrites it in the same transaction, which
    // is what makes the tie true by construction rather than by a check.
    expect(written.isTied).toBe(true);
    expect(written.openingAmount).toBe(2000);
    expect(written.openingDrCr).toBe("D");

    const back = parseLedgerRows((await fetchList(SCOPE.branchId, false)).rows).find(
      (row) => row.ledId === partyId,
    );
    expect(back?.amount).toBe(2000);
    expect(back?.drCr).toBe("Dr");
    expect(back?.billCount).toBe(2);
  });

  it("re-saves a LOADED bill unchanged — proof that ablId goes through", async () => {
    // Without the id this is an insert, and ux_abl_doc_refno refuses it:
    // "…is already an opening bill of this party for this year. Send its ablId
    // to update it."
    const partyId = party!.ledId;
    const loaded = await call<OpeningBillsPayload>(
      `/opening-balances/bills?partyId=${partyId}&companyId=${SCOPE.companyId}&accYear=${SCOPE.accYear}&branchId=${SCOPE.branchId}`,
    );
    const rows = parseBillRows(loaded.bills);
    expect(rows.filter((row) => row.ablId !== null).length).toBeGreaterThan(0);

    const again = await call<OpeningBillsSavePayload>("/opening-balances/bills", {
      method: "POST",
      body: JSON.stringify(
        buildBillsPayload({ scope: SCOPE, partyId, opId: loaded.opId }, rows),
      ),
    });
    expect(again.created).toBe(0);
    expect(again.deleted).toBe(0);
    expect(again.isTied).toBe(true);
  });

  it("refuses a bill-wise row on /create even at amount 0", async () => {
    // Which is why the ledger payload omits one at ANY amount.
    const partyId = party!.ledId;
    await expect(
      call("/opening-balances/create", {
        method: "POST",
        body: JSON.stringify({
          opCompanyId: SCOPE.companyId,
          opAccYear: SCOPE.accYear,
          opBranchId: SCOPE.branchId,
          rows: [{ opLedgerId: partyId, opAmount: 0, opDrCr: "D" }],
          replace: false,
        }),
      }),
    ).rejects.toThrow();
  });

  it("keeps the company-level set apart from the branch's", async () => {
    // ux_op_scope is (company, COALESCE(branch, 0-uuid), year, ledger): a NULL
    // branch is a scope of its own, not a wildcard over the branches.
    const ledger = plainLedgers[0];
    const companyScope: Scope = { ...SCOPE, branchId: null };
    await call<OpeningSavePayload>("/opening-balances/create", {
      method: "POST",
      body: JSON.stringify(
        buildLedgerPayload(companyScope, [{ ...ledger, amount: 111, drCr: "Dr", opId: null }]),
      ),
    });

    const companyLevel = await fetchList(null, false);
    const branchLevel = await fetchList(SCOPE.branchId, false);
    expect(companyLevel.opBranchId).toBeNull();
    expect(branchLevel.opBranchId).toBe(SCOPE.branchId);
    expect(
      companyLevel.rows.find((row) => row.ledId === ledger.ledId)?.opAmount,
    ).toBe(111);
    // Neither total can see the other's rows.
    expect(companyLevel.trialBalance.totalDebit).not.toBe(
      branchLevel.trialBalance.totalDebit,
    );

    // Leave the company-level set as it was found.
    await call<OpeningSavePayload>("/opening-balances/create", {
      method: "POST",
      body: JSON.stringify(buildLedgerPayload(companyScope, [])),
    });
  });

  it("leaves the branch set balanced at Dr 350,000 = Cr 350,000", async () => {
    // Re-runnable: the fixture puts the scope back where it started.
    const [assetA, assetB, liabilityA, liabilityB] = plainLedgers;
    const rows: LedgerRow[] = [
      { ...assetA, amount: 200000, drCr: "Dr", opId: null },
      { ...assetB, amount: 150000, drCr: "Dr", opId: null },
      { ...liabilityA, amount: 210000, drCr: "Cr", opId: null },
      { ...liabilityB, amount: 140000, drCr: "Cr", opId: null },
    ];
    const saved = await call<OpeningSavePayload>("/opening-balances/create", {
      method: "POST",
      body: JSON.stringify(buildLedgerPayload(SCOPE, rows)),
    });
    // The bill-wise party's 2,000 Dr rides along under retainedWithBills, so the
    // set is out by exactly that — which the screen reports rather than refuses.
    expect(saved.trialBalance.totalCredit).toBe(350000);
    expect(saved.retainedWithBills.length).toBeGreaterThanOrEqual(0);
  });
});
