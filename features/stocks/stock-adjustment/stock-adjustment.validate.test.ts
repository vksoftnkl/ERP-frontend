/**
 * Stock Adjustment — the rules the screen hears before the round trip (the
 * server's `check`, in the Qt screen's words), the save gates, and the
 * server's refusals mapped back onto the lines.
 */
import { describe, expect, it } from "vitest";
import {
  apiErrorText,
  cancelReasonProblem,
  checkBeforeSave,
  clientProblems,
  mapServerRefusal,
  mapValidateRows,
  postConfirmMessage,
  validationStrip,
} from "./stock-adjustment.validate";
import { draftOf, itemLine, withLines } from "./stock-adjustment.test-fixtures";

describe("clientProblems", () => {
  it("every line says why it moves, and how much", () => {
    const noReason = itemLine({ qty: "-1" });
    const noQty = itemLine({ reasonId: "r-short", qty: "" });
    const problems = clientProblems(withLines(draftOf("Adjustment"), [noReason, noQty]));
    expect([...problems.values()]).toEqual([
      "Line 1 — Rice 1kg names no reason. Every line says why it moves.",
      "Line 2 — Rice 1kg has no quantity.",
    ]);
  });

  it("a reason that requires remarks needs the line's or the header's", () => {
    const line = itemLine({ reasonId: "r-theft", qty: "-1", direction: "OUT" });
    const draft = withLines(draftOf("Adjustment"), [line]);
    expect(clientProblems(draft).get(line.key)).toBe("Line 1 — Pilferage needs remarks.");
    expect(clientProblems({ ...draft, remarks: "audit" }).size).toBe(0);
  });

  it("a move and an expiry write-off must pick; a move names a different bucket", () => {
    const expiry = withLines(draftOf("Expiry"), [itemLine({ reasonId: "r-short", qty: "-1", direction: "OUT" })]);
    expect([...clientProblems(expiry).values()][0]).toBe("Line 1 — Rice 1kg names no lot — pick it from stock (F2).");
    const move = withLines(draftOf("Move"), [
      itemLine({ reasonId: "r-md", qty: "1", lotId: "lot-1", bucket: "DAMAGED", toBucket: "DAMAGED", available: 5 }),
      itemLine({ reasonId: "r-md", qty: "1", lotId: "lot-1", bucket: "SALEABLE", toBucket: "", available: 5 }),
    ]);
    expect([...clientProblems(move).values()]).toEqual([
      "Line 1 — Rice 1kg moves stock from DAMAGED into DAMAGED.",
      "Line 2 — Rice 1kg names no bucket to move to.",
    ]);
  });

  it("a picked holding cannot give more than it has (BLOCK); an unknown figure is left to the server", () => {
    const over = itemLine({ reasonId: "r-short", qty: "-5", direction: "OUT", lotId: "lot-1", available: 3 });
    const unknown = itemLine({ reasonId: "r-short", qty: "-5", direction: "OUT", lotId: "lot-1", available: null });
    const problems = clientProblems(withLines(draftOf("Adjustment"), [over, unknown]));
    expect(problems.get(over.key)).toBe("Line 1 — Rice 1kg takes 5 but the holding has 3.");
    expect(problems.has(unknown.key)).toBe(false);
  });

  it("an inward line under MANUAL needs a cost", () => {
    const line = itemLine({ reasonId: "r-found", qty: "1", direction: "IN", costRate: 0 });
    const draft = { ...withLines(draftOf("Adjustment"), [line]), rateSource: "MANUAL" };
    expect(clientProblems(draft).get(line.key)).toBe("Line 1 — Rice 1kg comes in under MANUAL with no cost.");
  });

  it("a re-lot: the OUT names its lot, the pair balances, the IN is a different, tracked lot", () => {
    const out = itemLine({ reasonId: "r-rout", qty: "-3", direction: "OUT", trackSignature: "B", batchNo: "OLD" });
    const same = itemLine({ reasonId: "r-rin", qty: "2", direction: "IN", trackSignature: "B", batchNo: "OLD" });
    const problems = clientProblems(withLines(draftOf("Relot"), [out, same]));
    expect(problems.get(out.key)).toBe("Line 1 — the OUT half of a re-lot must name the lot it leaves (F2).");
    expect(problems.get(same.key)).toBe(
      "Line 2 — the IN half has the same batch / expiry / MRP as the lot it leaves — key the CORRECT identity.",
    );

    const pickedOut = { ...out, lotId: "lot-1" };
    const untracked = itemLine({ reasonId: "r-rin", qty: "2", direction: "IN", trackSignature: "N" });
    const unbalanced = clientProblems(withLines(draftOf("Relot"), [pickedOut, untracked]));
    expect(unbalanced.get(pickedOut.key)).toBe("Line 1 — the re-lot of Rice 1kg does not balance (3 out, 2 in).");
    expect(unbalanced.get(untracked.key)).toBe(
      "Line 2 — Rice 1kg is not tracked by batch, expiry or MRP, so it has one lot — there is nothing to re-lot it into.",
    );
  });

  it("judges a DRAFT only", () => {
    const draft = { ...withLines(draftOf("Adjustment"), [itemLine({ qty: "-1" })]), status: "POSTED" };
    expect(clientProblems(draft).size).toBe(0);
  });
});

describe("the validation strip", () => {
  it("leads with the first problem, the server's winning on a line both name", () => {
    const a = itemLine({ qty: "-1" });
    const b = itemLine({ qty: "-1" });
    const draft = { ...withLines(draftOf("Adjustment"), [a, b]), serverProblems: { [a.key]: "Line 1: server says no" } };
    const strip = validationStrip(draft);
    expect(strip?.text).toBe(
      "Validation · Line 1: server says no   (+1 more)   Save shows every line's message; nothing posts until all pass.",
    );
    expect([...(strip?.problems.keys() ?? [])]).toEqual([a.key, b.key]);
    expect(validationStrip(draftOf("Adjustment"))).toBeNull();
  });
});

describe("checkBeforeSave", () => {
  const ready = () =>
    withLines(draftOf("Adjustment"), [itemLine({ reasonId: "r-short", qty: "-1", direction: "OUT" })]);

  it("refuses in the Qt order: status, mode, godown, date, device, lines, rules", () => {
    expect(checkBeforeSave({ ...ready(), status: "POSTED", refno: "ADJ/1" }, true)).toMatchObject({
      title: "Not a draft",
      message: "ADJ/1 is POSTED and cannot be saved again.",
    });
    expect(checkBeforeSave({ ...ready(), mode: "browse" }, true)?.title).toBe("Read-only");
    expect(checkBeforeSave({ ...ready(), godownId: "" }, true)).toMatchObject({ title: "Godown first", focus: "godown" });
    expect(checkBeforeSave({ ...ready(), docDate: "" }, true)).toMatchObject({ title: "Date required", focus: "date" });
    expect(checkBeforeSave({ ...ready(), deviceId: "" }, true)?.title).toBe("No device");
    expect(checkBeforeSave(draftOf("Adjustment"), true)?.title).toBe("No lines");
    expect(checkBeforeSave(ready(), true)).toBeNull();
  });

  it("lists every line the rules refuse, titled by what was being saved", () => {
    const line = itemLine({ qty: "-1" });
    const refusal = checkBeforeSave(withLines(draftOf("Adjustment"), [line]), false);
    expect(refusal).toMatchObject({
      title: "This draft cannot be saved yet",
      message: "1 line(s) have to be fixed first:\n\nLine 1 — Rice 1kg names no reason. Every line says why it moves.",
      focus: { lineKey: line.key },
    });
  });

  it("the post question says whether an accounts voucher is written", () => {
    expect(postConfirmMessage(draftOf("Move"), "Out", "In")).toContain(
      "No accounts voucher is written — the stock stays the company's.",
    );
    expect(postConfirmMessage(draftOf("Damage"), "Out", "In")).toContain("A Stock Journal voucher is written with it.");
  });
});

describe("the server's refusals", () => {
  it("maps lines.<index> back to the line it was built from", () => {
    expect(
      mapServerRefusal(
        [
          { field: "lines.1", message: "Line 2: takes 5 but this godown holds 3" },
          { field: "header.linkSrcModule", message: "no" },
        ],
        ["k-a", "k-b"],
      ),
    ).toEqual({ "k-b": "Line 2: takes 5 but this godown holds 3" });
  });

  it("maps the validate rows by line number, skipping the clean ones", () => {
    const rows = [
      { sviId: "1", lineNo: 1, splitNo: 0, itemId: "i", itemCode: null, itemName: "A", problem: null },
      { sviId: "2", lineNo: 2, splitNo: 0, itemId: "i", itemCode: null, itemName: "B", problem: "Line 2: lot expired later" },
    ];
    expect(mapValidateRows(rows, ["k-a", "k-b"])).toEqual({
      problems: ["Line 2: lot expired later"],
      byKey: { "k-b": "Line 2: lot expired later" },
    });
  });

  it("reads the headline and every errors[] entry, as the Qt client does", () => {
    const error = {
      status: 422,
      message: "This stock adjustment cannot be saved",
      data: {
        success: false,
        message: "This stock adjustment cannot be saved",
        errors: [{ field: "lines.0", message: "Line 1: has no quantity." }],
      },
    };
    expect(apiErrorText(error)).toBe("This stock adjustment cannot be saved\n• lines.0 — Line 1: has no quantity.");
    expect(apiErrorText({ data: { message: { error: "Bad Request", message: ["qty must be a number"] } } })).toBe(
      "qty must be a number",
    );
    expect(apiErrorText(null)).toBe("An unexpected error occurred.");
  });

  it("refuses a cancel with no reason, or one too short to say anything", () => {
    expect(cancelReasonProblem("  ")).toBe("Type the reason");
    expect(cancelReasonProblem("ab")).toBe("reason must say something — at least 3 characters.");
    expect(cancelReasonProblem("Quantities were wrong")).toBeNull();
  });
});
