import { describe, expect, it } from "vitest";
import {
  addDamagedLine,
  applyPrefill,
  clientProblems,
  computeTotals,
  createDraft,
  draftAsKeyed,
  draftFromHeader,
  editLine,
  isEditable,
  lineNotes,
  outcomeOf,
  overlaySavedLines,
  removeLine,
  setUnloading,
  validationStrip,
} from "./branch-inward.state";
import { opened, PREFILL, SCOPE } from "./branch-inward.test-fixtures";

describe("applyPrefill", () => {
  it("opens every transit row at the REMAINDER, never at what was sent", () => {
    const draft = opened();
    expect(draft.lines.map((l) => [l.itemName, l.sentQty, l.receivedQty, l.remainingQty, l.qty])).toEqual([
      ["Shirt", 10, 4, 6, "6"],
      ["Cap", 6, 0, 6, "6"],
    ]);
  });

  it("copies the despatch and its names; the godowns come from the despatch", () => {
    const draft = opened();
    expect(draft).toMatchObject({
      outId: "out-1",
      outAccYear: "2026-2027",
      outRefno: "TRF/2026-2027/00001",
      fromBranchName: "Coimbatore",
      fromGodownId: "gd-from",
      toGodownId: "gd-to",
      toGodownName: "Karur",
      dirty: true,
    });
  });

  it("falls back to the worklist row for names the prefill leaves out", () => {
    const bare = { ...PREFILL, outVoucher: { ...PREFILL.outVoucher, fromBranchName: null, toGodownName: null } };
    const draft = applyPrefill(createDraft(SCOPE), { ...bare, rows: bare.rows.map((r) => ({ ...r, toGodownName: null })) }, {
      from_branch: "Salem",
      to_godown: "Front",
    });
    expect(draft.fromBranchName).toBe("Salem");
    expect(draft.toGodownName).toBe("Front");
  });
});

describe("totals, notes and outcome", () => {
  it("everything arriving closes the despatch", () => {
    const draft = opened();
    const totals = computeTotals(draft);
    expect(totals).toMatchObject({ receiving: 12, remaining: 12, shortAfter: 0, damaged: 0 });
    expect(outcomeOf(draft, totals)).toMatchObject({ tone: "good", title: "TRF/2026-2027/00001 closes" });
    expect(lineNotes(draft).get(draft.lines[0].key)).toBe("IN +6 Karur · transit → RECEIVED");
  });

  it("a short leaves the despatch IN TRANSIT and says how much stays on the lorry", () => {
    let draft = opened();
    draft = editLine(draft, draft.lines[0].key, { qty: "4" });
    const totals = computeTotals(draft);
    expect(totals.shortAfter).toBe(2);
    const outcome = outcomeOf(draft, totals);
    expect(outcome.tone).toBe("warn");
    expect(outcome.title).toBe("TRF/2026-2027/00001 stays IN TRANSIT");
    expect(outcome.text).toContain("2 stays on the lorry");
    expect(lineNotes(draft).get(draft.lines[0].key)).toBe("IN +4 Karur · 2 still to come");
  });

  it("a line left at 0 is 'not received'", () => {
    let draft = opened();
    draft = editLine(draft, draft.lines[1].key, { qty: "0" });
    expect(lineNotes(draft).get(draft.lines[1].key)).toBe("not received — stays in transit");
  });

  it("the unloading charge is qty x rate, and only while Unloading is ticked", () => {
    let draft = opened();
    draft = editLine(draft, draft.lines[0].key, { unloadRate: "0.5" });
    expect(computeTotals(draft).unloadCharge).toBe(0);
    draft = setUnloading(draft, { unloadEnabled: true });
    expect(computeTotals(draft).unloadCharge).toBe(3);
  });

  it("before a despatch is picked, the card asks for one", () => {
    const blank = createDraft(SCOPE);
    expect(outcomeOf(blank, computeTotals(blank)).title).toBe("Pick the despatch that arrived");
  });
});

describe("damaged split lines", () => {
  it("+ adds one DAMAGED line right under the transit row, at 0", () => {
    const draft = opened();
    const change = addDamagedLine(draft, draft.lines[0].key);
    expect(change.draft.lines.map((l) => [l.itemName, l.bucket, l.qty])).toEqual([
      ["Shirt", "SALEABLE", "6"],
      ["Shirt", "DAMAGED", "0"],
      ["Cap", "SALEABLE", "6"],
    ]);
    expect(change.focusKey).toBe(change.draft.lines[1].key);
    expect(change.draft.lines[1].sttId).toBe(change.draft.lines[0].sttId);
  });

  it("a second + on the same row focuses the existing DAMAGED line instead", () => {
    const start = opened();
    const once = addDamagedLine(start, start.lines[0].key);
    const again = addDamagedLine(once.draft, once.draft.lines[0].key);
    expect(again.draft.lines).toHaveLength(3);
    expect(again.hint).toBe("Shirt already has a Damaged line (2).");
    expect(again.focusKey).toBe(once.draft.lines[1].key);
  });

  it("1 good + 1 damaged of 2 still closes the despatch; the split counts against ONE remainder", () => {
    let draft = opened();
    draft = addDamagedLine(draft, draft.lines[0].key).draft;
    draft = editLine(draft, draft.lines[0].key, { qty: "5" });
    draft = editLine(draft, draft.lines[1].key, { qty: "1" });
    const totals = computeTotals(draft);
    expect(totals).toMatchObject({ receiving: 12, damaged: 1, remaining: 12 });
    expect(clientProblems(draft).size).toBe(0);
    expect(lineNotes(draft).get(draft.lines[1].key)).toBe("IN +1 into the DAMAGED bucket");
  });

  it("− drops a split line, but only zeroes the last line of a transit row", () => {
    let draft = opened();
    draft = addDamagedLine(draft, draft.lines[0].key).draft;
    const withSplit = removeLine(draft, draft.lines[1].key);
    expect(withSplit.lines).toHaveLength(2);
    const zeroed = removeLine(withSplit, withSplit.lines[0].key);
    expect(zeroed.lines).toHaveLength(2);
    expect(zeroed.lines[0].qty).toBe("0");
  });
});

describe("validation", () => {
  it("receiving more than is still in transit is refused, summed over the split", () => {
    let draft = opened();
    draft = addDamagedLine(draft, draft.lines[0].key).draft;
    draft = editLine(draft, draft.lines[0].key, { qty: "6" });
    draft = editLine(draft, draft.lines[1].key, { qty: "1" });
    const problems = clientProblems(draft);
    expect([...problems.values()]).toEqual(["Line 1 — Shirt: receiving 7 but only 6 is still in transit."]);
    expect(validationStrip(draft)?.text).toBe(
      "Validation · Line 1 — Shirt: receiving 7 but only 6 is still in transit.",
    );
  });

  it("nothing received at all is refused", () => {
    let draft = opened();
    draft = editLine(draft, draft.lines[0].key, { qty: "0" });
    draft = editLine(draft, draft.lines[1].key, { qty: "0" });
    expect([...clientProblems(draft).values()]).toEqual(["Nothing is being received — key what arrived."]);
  });

  it("the strip lists the server's refusal first and counts the rest", () => {
    let draft = opened();
    draft = { ...draft, problems: { [draft.lines[1].key]: "lot is not in transit" } };
    draft = editLine(draft, draft.lines[0].key, { qty: "9" });
    const strip = validationStrip(draft);
    expect(strip?.text).toBe("Validation · lot is not in transit   (+1 more)");
    expect(strip?.keys.size).toBe(2);
  });

  it("editing a refused line takes its server message off", () => {
    let draft = opened();
    draft = { ...draft, problems: { [draft.lines[0].key]: "nope" } };
    draft = editLine(draft, draft.lines[0].key, { qty: "5" });
    expect(draft.problems).toEqual({});
  });
});

describe("reopening", () => {
  const header = {
    svhId: "in-1",
    accYear: "2026-2027",
    refno: "TRI/2026-2027/00007",
    status: "DRAFT",
    docDate: "2026-10-26T00:00:00.000Z",
    remarks: "one torn",
    linkSrcDocId: "out-1",
    linkSrcAccYear: "2026-2027",
    linkSrcRefno: "TRF/2026-2027/00001",
    fromBranchName: "Coimbatore",
    godownId: "gd-to",
    godownName: "Karur",
    unloadEnabled: true,
    unloadDatetime: "2026-10-26T09:30:00.000Z",
    unloadmanIds: ["e1", "e2"],
    unloadmanNames: ["Ravi", "Kumar"],
    unloadSupervisorId: "s1",
    unloadSupervisorName: "Meena",
    unloadingCharge: "3.5",
  };

  it("a draft is laid over today's remainder: its figures on the transit row, a DAMAGED line as a split", () => {
    const base = draftFromHeader(SCOPE, header);
    const prefilled = applyPrefill({ ...base, mode: "entry" }, PREFILL, null);
    const draft = overlaySavedLines(prefilled, [
      { sviId: "l1", itemId: "item-1", lotId: "lot-1", godownId: "gd-to", bucket: "SALEABLE", qty: "4", unloadRate: "0.5" },
      { sviId: "l2", itemId: "item-1", lotId: "lot-1", godownId: "gd-to", bucket: "DAMAGED", qty: "1", unloadRate: "0.5" },
    ]);
    expect(draft.lines.map((l) => [l.itemName, l.bucket, l.qty, l.unloadRate])).toEqual([
      ["Shirt", "SALEABLE", "4", "0.5"],
      ["Shirt", "DAMAGED", "1", "0.5"],
      ["Cap", "SALEABLE", "0", "0"], // a transit row the draft did not receive
    ]);
    expect(draft).toMatchObject({ svhId: "in-1", dirty: false, unloadEnabled: true, remarks: "one torn" });
    expect(draft.unloadmen).toEqual([
      { id: "e1", text: "Ravi" },
      { id: "e2", text: "Kumar" },
    ]);
    expect(draft.unloadSupervisor).toEqual({ id: "s1", text: "Meena" });
    expect(isEditable(draft)).toBe(true);
  });

  it("a posted receipt is shown as keyed: read-only, the charge it posted, no despatch figures", () => {
    const base = draftFromHeader(SCOPE, { ...header, status: "POSTED" });
    const draft = draftAsKeyed(base, [
      { sviId: "l1", itemId: "item-1", itemName: "Shirt", lotId: "lot-1", godownId: "gd-to", bucket: "SALEABLE", qty: "2" },
    ]);
    expect(draft).toMatchObject({ mode: "browse", asKeyed: true, status: "POSTED", postedUnloadCharge: 3.5 });
    expect(isEditable(draft)).toBe(false);
    expect(clientProblems(draft).size).toBe(0);
    expect(outcomeOf(draft, computeTotals(draft))).toMatchObject({
      title: "Received against TRF/2026-2027/00001",
      text: "2 came into Karur on this receipt.",
    });
    // Nothing edits it.
    expect(editLine(draft, draft.lines[0].key, { qty: "9" })).toBe(draft);
  });
});
