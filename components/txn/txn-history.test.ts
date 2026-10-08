import { describe, expect, it } from "vitest";
import { toTxnHistoryRows, txnEventTone, txnHistorySummary } from "./txn-history";

/** Grid 126's answer for a bill that was made, posted and then cancelled. */
const PAYLOAD = {
  data: [
    {
      tsl_id: "c",
      tsl_seq_no: 3,
      tsl_event_text: "Cancelled",
      tsl_status_text: "POSTED → CANCELLED",
      tsl_changed_at: "06-10-2026 18:51:47",
      tsl_user_name: "VIJAY",
      tsl_device_name: "Web Browser",
      tsl_remarks: "Keyed wrong",
    },
    {
      tsl_id: "a",
      tsl_seq_no: 1,
      tsl_event_text: "Created",
      tsl_status_text: "DRAFT",
      tsl_changed_at: "06-10-2026 18:51:43",
      tsl_user_name: "VKPOS",
      tsl_device_name: "Web Browser",
      tsl_remarks: null,
    },
    {
      tsl_id: "b",
      tsl_seq_no: "2",
      tsl_event_text: "Posted",
      tsl_status_text: "DRAFT → POSTED",
      tsl_changed_at: "06-10-2026 18:51:43",
      tsl_user_name: "",
      tsl_device_name: "Web Browser",
      tsl_remarks: "",
    },
  ],
};

describe("toTxnHistoryRows", () => {
  it("reads the trail oldest first on tsl_seq_no — the grid has no ORDER BY", () => {
    expect(toTxnHistoryRows(PAYLOAD).map((row) => row.tsl_id)).toEqual(["a", "b", "c"]);
  });

  it("sorts the step number as a number, so step 10 follows step 9", () => {
    const rows = toTxnHistoryRows([
      { tsl_id: "ten", tsl_seq_no: "10" },
      { tsl_id: "nine", tsl_seq_no: "9" },
    ]);
    expect(rows.map((row) => row.tsl_id)).toEqual(["nine", "ten"]);
  });

  it("turns nulls into blanks rather than the word null", () => {
    expect(toTxnHistoryRows(PAYLOAD)[0].tsl_remarks).toBe("");
  });

  it("answers nothing for a payload with no rows", () => {
    expect(toTxnHistoryRows(undefined)).toEqual([]);
    expect(toTxnHistoryRows({ data: [] })).toEqual([]);
  });
});

describe("txnEventTone", () => {
  it("colours by what happened: in the books green, undone red, made grey", () => {
    expect(txnEventTone("Posted")).toBe("green");
    expect(txnEventTone("Cancelled")).toBe("red");
    expect(txnEventTone("Created")).toBe("grey");
    expect(txnEventTone("Retendered")).toBe("amber");
    expect(txnEventTone("Transport Edited")).toBe("amber");
    expect(txnEventTone("Converted")).toBe("blue");
  });

  it("reads an unnamed event by its words, the more specific bucket first", () => {
    expect(txnEventTone("Unposted Again")).toBe("amber");
    expect(txnEventTone("Partly Reversed")).toBe("red");
    expect(txnEventTone("Something New")).toBe("grey");
  });
});

describe("txnHistorySummary", () => {
  const flat = (items: ReturnType<typeof txnHistorySummary>) =>
    items.map((item) => item.map((run) => run.text).join(""));

  it("says who made it, where it stands now and how many steps it took", () => {
    expect(flat(txnHistorySummary(toTxnHistoryRows(PAYLOAD)))).toEqual([
      "Created by VKPOS on 06-10-2026 18:51:43",
      "now CANCELLED — Cancelled by VIJAY on 06-10-2026 18:51:47",
      "3 steps",
    ]);
  });

  it("bolds the event and the standing", () => {
    const strong = txnHistorySummary(toTxnHistoryRows(PAYLOAD))
      .flat()
      .filter((run) => run.strong)
      .map((run) => run.text);
    expect(strong).toEqual(["Created", "CANCELLED"]);
  });

  it("names an unrecorded user as unknown", () => {
    const rows = toTxnHistoryRows(PAYLOAD).slice(0, 2);
    expect(flat(txnHistorySummary(rows))[1]).toBe("now POSTED — Posted by unknown on 06-10-2026 18:51:43");
  });

  it("leaves 'now' out of a one-step trail, and nothing at all without rows", () => {
    expect(flat(txnHistorySummary(toTxnHistoryRows(PAYLOAD).slice(0, 1)))).toEqual([
      "Created by VKPOS on 06-10-2026 18:51:43",
      "1 step",
    ]);
    expect(txnHistorySummary([])).toEqual([]);
  });
});
