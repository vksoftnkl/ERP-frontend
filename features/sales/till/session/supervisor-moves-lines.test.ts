import { describe, expect, it } from "vitest";
import { supervisorMoveLines } from "./supervisor-moves-lines";

const row = (over: Record<string, unknown>) => ({
  md_id: "m",
  md_time: "2026-10-12T05:00:00.000Z",
  md_clock: "10:30",
  md_kind: "PICKUP",
  md_doc: "TDrp/26/0001",
  md_amount: "5000.00",
  md_by: "ANU",
  md_status: "POSTED",
  ...over,
});

describe("the supervisor's movements on a session", () => {
  it("lists only pickups and top-ups, oldest first, Qt's line for each", () => {
    const lines = supervisorMoveLines([
      row({ md_time: "2026-10-12T09:00:00.000Z", md_clock: "14:30", md_kind: "TOP_UP", md_doc: "TFlt/26/0002", md_amount: "1500.5" }),
      row({ md_kind: "DROP", md_doc: "TDrp/26/0009" }),
      row({ md_kind: "PAID_IN" }),
      row({ md_kind: "FLOAT" }),
      row({ md_amount: "125000" }),
    ]);
    expect(lines).toEqual([
      "10:30   Pickup (taken out)   ₹ 1,25,000.00   by ANU   TDrp/26/0001",
      "14:30   Top-up (put in)   ₹ 1,500.50   by ANU   TFlt/26/0002",
    ]);
  });

  it("keeps a voided one, marked", () => {
    expect(supervisorMoveLines([row({ md_status: "VOIDED" })])).toEqual([
      "10:30   Pickup (taken out)   ₹ 5,000.00   by ANU   TDrp/26/0001   — VOID",
    ]);
    expect(supervisorMoveLines([row({ md_status: "void" })])).toEqual([
      "10:30   Pickup (taken out)   ₹ 5,000.00   by ANU   TDrp/26/0001   — VOID",
    ]);
  });

  it("is empty with nothing a supervisor moved", () => {
    expect(supervisorMoveLines([])).toEqual([]);
    expect(supervisorMoveLines([row({ md_kind: "EXCHANGE" })])).toEqual([]);
  });
});
