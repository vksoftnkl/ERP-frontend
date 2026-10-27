import { describe, expect, it } from "vitest";
import {
  apiErrorText,
  cancelReasonProblem,
  errorDetailsOf,
  handlingProblem,
  mapServerRefusal,
  validationStrip,
} from "./stock-transfer.validate";

const refusal = (errors: { field: string; message: string; code?: string }[], message = "This transfer cannot be saved") => ({
  status: 422,
  data: { message, errors },
});

describe("mapServerRefusal", () => {
  it("lines.<n> goes to the n-th line sent, anything else to the header field", () => {
    const mapped = mapServerRefusal(
      errorDetailsOf(
        refusal([
          { field: "lines.1.freeQty", message: "free over", code: "STOCK_FREE_QTY_EXCEEDS_FREE_STOCK" },
          { field: "lines.0.loadRate", message: "negative", code: "STOCK_LOADING_RATE_NEGATIVE" },
          { field: "reasonId", message: "wrong direction", code: "STOCK_REASON_WRONG_DIRECTION" },
          { field: "driverId", message: "not an employee" },
          { field: "lines.1.qty", message: "second message for the same line" },
        ]),
      ),
      ["a", "b"],
    );
    expect(mapped.lines).toEqual({ b: "free over", a: "negative" });
    expect(mapped.header).toEqual({ reasonId: "wrong direction", driverId: "not an employee" });
  });

  it("ignores a line index the screen never sent", () => {
    expect(mapServerRefusal([{ field: "lines.5", message: "x" }], ["a"]).lines).toEqual({});
  });
});

describe("handlingProblem", () => {
  it("finds the refusal belonging to each box", () => {
    const header = { loadDatetime: "before the doc date", unloadSupervisorId: "bad", reasonId: "r" };
    expect(handlingProblem(header, "load")).toBe("before the doc date");
    expect(handlingProblem(header, "unload")).toBe("bad");
    expect(handlingProblem({ reasonId: "r" }, "load")).toBe("");
  });
});

describe("validationStrip", () => {
  it("shows the first problem and counts the rest; server wins over the screen's own for a line", () => {
    const strip = validationStrip(
      new Map([["a", "Line 1 — no quantity"], ["b", "Line 2 — no quantity"]]),
      { a: "the server says no" },
      new Map([["a", 1], ["b", 2]]),
      {},
    );
    expect(strip?.text).toBe("Validation · Line 1 — the server says no   (+1 more)");
    expect([...(strip?.problems.keys() ?? [])]).toEqual(["a", "b"]);
  });

  it("is null when nothing is wrong, and counts a header problem", () => {
    expect(validationStrip(new Map(), {}, new Map(), {})).toBeNull();
    expect(validationStrip(new Map(), {}, new Map(), { driverId: "bad crew" })?.text).toBe("Validation · bad crew");
  });
});

describe("apiErrorText", () => {
  it("is the headline then every field", () => {
    expect(apiErrorText(refusal([{ field: "lines.0.qty", message: "too much" }]))).toBe(
      "This transfer cannot be saved\n• lines.0.qty — too much",
    );
    expect(apiErrorText(undefined)).toBe("An unexpected error occurred.");
  });
});

describe("cancelReasonProblem", () => {
  it("wants a reason of three characters", () => {
    expect(cancelReasonProblem("  ")).toMatch(/Type the reason/);
    expect(cancelReasonProblem("ab")).toMatch(/at least 3/);
    expect(cancelReasonProblem("abc")).toBeNull();
  });
});
