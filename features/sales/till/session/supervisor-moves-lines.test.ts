import { describe, expect, it } from "vitest";
import { supervisorMoveLines } from "./supervisor-moves-lines";

const row = (over: Record<string, unknown>) => ({
  md_id: "m",
  md_time: "2026-10-12T05:00:00.000Z",
  md_clock: "10:30",
  md_kind: "PICKUP",
  md_doc: "TDrp/26/0001",
  md_amount: "5000.00",
  md_by: "RAVI",
  md_witness: "ANU",
  md_status: "POSTED",
  ...over,
});

describe("the pickups and top-ups on a session", () => {
  it("lists only pickups and top-ups, oldest first, Qt's line for each", () => {
    const lines = supervisorMoveLines([
      row({ md_time: "2026-10-12T09:00:00.000Z", md_clock: "14:30", md_kind: "TOP_UP", md_doc: "TFlt/26/0002", md_amount: "1500.5" }),
      row({ md_kind: "DROP", md_doc: "TDrp/26/0009" }),
      row({ md_kind: "PAID_IN" }),
      row({ md_kind: "FLOAT" }),
      row({ md_amount: "125000" }),
    ]);
    expect(lines).toEqual([
      "10:30   Pickup (taken out)   ₹ 1,25,000.00   supervisor ANU   TDrp/26/0001",
      "14:30   Top-up (put in)   ₹ 1,500.50   supervisor ANU   TFlt/26/0002",
    ]);
  });

  it("keeps a voided one, marked", () => {
    expect(supervisorMoveLines([row({ md_status: "VOIDED" })])).toEqual([
      "10:30   Pickup (taken out)   ₹ 5,000.00   supervisor ANU   TDrp/26/0001   — VOID",
    ]);
    expect(supervisorMoveLines([row({ md_status: "void" })])).toEqual([
      "10:30   Pickup (taken out)   ₹ 5,000.00   supervisor ANU   TDrp/26/0001   — VOID",
    ]);
  });

  it("names the supervisor who signed, else the doer of a row from before notes 110", () => {
    // Notes 110: the cashier is the doer, the supervisor the witness who signed with a PIN.
    expect(supervisorMoveLines([row({ md_by: "RAVI", md_witness: "ANU" })])).toEqual([
      "10:30   Pickup (taken out)   ₹ 5,000.00   supervisor ANU   TDrp/26/0001",
    ]);
    // Grid 147 gives "" for no witness: an older row named the supervisor as its doer.
    expect(supervisorMoveLines([row({ md_by: "ANU", md_witness: "" })])).toEqual([
      "10:30   Pickup (taken out)   ₹ 5,000.00   supervisor ANU   TDrp/26/0001",
    ]);
    expect(supervisorMoveLines([row({ md_by: "ANU", md_witness: null })])).toEqual([
      "10:30   Pickup (taken out)   ₹ 5,000.00   supervisor ANU   TDrp/26/0001",
    ]);
  });

  it("is empty with nothing a supervisor moved", () => {
    expect(supervisorMoveLines([])).toEqual([]);
    expect(supervisorMoveLines([row({ md_kind: "EXCHANGE" })])).toEqual([]);
  });
});
