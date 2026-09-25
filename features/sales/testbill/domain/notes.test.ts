/**
 * Sale Bill Entry — the warning strip's parser (§16.1, §29).
 *
 * Every holder the notes can arrive in, the 422 envelope, and the tick reset.
 */
import { describe, expect, it } from "vitest";
import {
  errorCodeOf,
  errorMessageOf,
  errorStatusOf,
  notesFromError,
  notesSummary,
  overridesAgainst,
  parseCarryProposals,
  parseValidateRights,
  parseValidationNotes,
  unresolvedWarnings,
} from "@/features/sales/testbill/domain/notes";

const REFUSAL = { code: "SALES_CREDIT_LIMIT", message: "Over the limit", field: "sbCustId" };
const WARN = {
  code: "SALES_RATE_BELOW_MIN",
  level: "WARN",
  message: "Rate below minimum",
  line: 2,
  overridable: true,
};

describe("parseValidationNotes — every holder", () => {
  it("reads the success envelope's data.{refusals, warnings}", () => {
    const notes = parseValidationNotes({
      success: true,
      data: { ok: false, refusals: [REFUSAL], warnings: [WARN] },
    });
    expect(notes.map((note) => note.code)).toEqual(["SALES_CREDIT_LIMIT", "SALES_RATE_BELOW_MIN"]);
    expect(notes[0].isRefusal).toBe(true);
    expect(notes[0].overridable).toBe(false);
    expect(notes[1].isRefusal).toBe(false);
    expect(notes[1].overridable).toBe(true);
    expect(notes[1].line).toBe(2);
  });

  it("reads a bare {refusals, warnings}", () => {
    expect(parseValidationNotes({ refusals: [REFUSAL], warnings: [] })).toHaveLength(1);
  });

  it("reads details.{…} and error.details.{…}", () => {
    expect(parseValidationNotes({ details: { warnings: [WARN] } })).toHaveLength(1);
    expect(parseValidationNotes({ error: { details: { refusals: [REFUSAL] } } })).toHaveLength(1);
  });

  it("reads the 422 envelope's errors[] — coded entries only", () => {
    const notes = parseValidationNotes({
      success: false,
      message: "Bill cannot be posted",
      errors: [
        { field: "document", message: "Stock short", code: "SALES_STOCK_NEGATIVE", line: 3 },
        { field: "items.0.sbiRate", message: "must be a number" },
      ],
    });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      code: "SALES_STOCK_NEGATIVE",
      isRefusal: true,
      level: "REFUSE",
      line: 3,
    });
  });

  it("carries the statutory reference", () => {
    const [note] = parseValidationNotes({
      refusals: [
        {
          code: "SALES_CASH_LIMIT",
          message: "Cash over the limit",
          statutory: { code: "269ST", value: 200000, effectiveFrom: "2017-04-01", isCompanyOverride: true },
        },
      ],
    });
    expect(note.statutory).toEqual({
      code: "269ST",
      value: 200000,
      effectiveFrom: "2017-04-01",
      isCompanyOverride: true,
    });
  });

  it("puts refusals first and drops duplicates across holders", () => {
    const notes = parseValidationNotes({
      warnings: [WARN],
      refusals: [REFUSAL],
      data: { refusals: [REFUSAL] },
    });
    expect(notes.map((note) => note.level)).toEqual(["REFUSE", "WARN"]);
  });

  it("answers nothing for a body with no notes", () => {
    expect(parseValidationNotes(null)).toEqual([]);
    expect(parseValidationNotes({ success: true, data: { ok: true } })).toEqual([]);
  });
});

describe("the rights and proposals a validate carries", () => {
  it("reads data.rights", () => {
    expect(
      parseValidateRights({ data: { rights: { post: true, override: false, retender: true } } }),
    ).toMatchObject({ post: true, override: false, retender: true });
    expect(parseValidateRights({ data: {} })).toBeNull();
  });

  it("reads data.proposals.charges", () => {
    const [proposal] = parseCarryProposals({
      data: {
        proposals: {
          charges: [
            { cdSrcCdId: "c1", cdSrcAccYear: "2026-2027", chgName: "Freight", orderAmount: "100", carriedSoFar: 40, proposed: 60, basis: "PRORATA", isFinalBill: true },
          ],
        },
      },
    });
    expect(proposal).toEqual({
      cdSrcCdId: "c1",
      cdSrcAccYear: "2026-2027",
      chgName: "Freight",
      orderAmount: 100,
      carriedSoFar: 40,
      proposed: 60,
      basis: "PRORATA",
      isFinalBill: true,
    });
  });
});

describe("the RTK error", () => {
  const error = {
    status: 409,
    data: {
      success: false,
      message: "Bill cannot be amended",
      errors: [{ field: "sbRevisionNo", message: "Someone else amended it", code: "SALES_REVISION_STALE" }],
    },
  };

  it("reads status, code and the per-field words", () => {
    expect(errorStatusOf(error)).toBe(409);
    expect(errorCodeOf(error)).toBe("SALES_REVISION_STALE");
    expect(errorMessageOf(error)).toBe("Someone else amended it");
  });

  it("falls back to the envelope message, then the fallback", () => {
    expect(errorMessageOf({ status: 500, data: { message: "boom", errors: [] } })).toBe("boom");
    expect(errorMessageOf({ status: "FETCH_ERROR" }, "away")).toBe("away");
  });

  it("turns a 422 into notes", () => {
    const notes = notesFromError({
      status: 422,
      data: { success: false, message: "Bill cannot be posted", errors: [{ ...REFUSAL }] },
    });
    expect(notes).toHaveLength(1);
    expect(notes[0].code).toBe("SALES_CREDIT_LIMIT");
  });
});

describe("ticks and summaries", () => {
  const notes = parseValidationNotes({ refusals: [REFUSAL], warnings: [WARN] });

  it("summarises counts", () => {
    expect(notesSummary(notes)).toBe("1 refused · 1 warning");
    expect(notesSummary([])).toBe("");
  });

  it("ticks reset against a new answer and vanish without the right", () => {
    expect(overridesAgainst(notes, ["SALES_RATE_BELOW_MIN", "GONE"], true)).toEqual(["SALES_RATE_BELOW_MIN"]);
    expect(overridesAgainst(notes, ["SALES_RATE_BELOW_MIN"], false)).toEqual([]);
    // A refusal is never tickable.
    expect(overridesAgainst(notes, ["SALES_CREDIT_LIMIT"], true)).toEqual([]);
  });

  it("names the WARNs that will refuse the post unless overridden", () => {
    expect(unresolvedWarnings(notes, []).map((note) => note.code)).toEqual(["SALES_RATE_BELOW_MIN"]);
    expect(unresolvedWarnings(notes, ["SALES_RATE_BELOW_MIN"])).toEqual([]);
  });
});
