import { describe, expect, it } from "vitest";
import { isSessionGone, tillErrorOf } from "./errors";

describe("tillErrorOf", () => {
  it("reads the till filter's flat body", () => {
    const error = tillErrorOf({
      status: 409,
      data: {
        success: false,
        message: "Counter C01 has RAVI's live session",
        errors: [{ field: "counterId", code: "TILL_COUNTER_BUSY", message: "Counter C01 has RAVI's live session" }],
      },
    });
    expect(error).toMatchObject({ status: 409, code: "TILL_COUNTER_BUSY", field: "counterId" });
    expect(error.text).toBe("Counter C01 has RAVI's live session");
  });

  it("reads the global filter's nested body and joins the reasons", () => {
    const error = tillErrorOf({
      status: 400,
      data: {
        success: false,
        statusCode: 400,
        message: { success: false, message: "Validation failed", errors: [{ field: "lines", message: "lines must be an array" }] },
      },
    });
    expect(error.code).toBe("");
    expect(error.text).toBe("Validation failed. lines must be an array");
  });

  it("falls back for a network failure", () => {
    const error = tillErrorOf({ status: "FETCH_ERROR", error: "TypeError: Failed to fetch" });
    expect(error.status).toBeNull();
    expect(error.message).toBe("TypeError: Failed to fetch");
    expect(tillErrorOf(undefined, "Nope").text).toBe("Nope");
  });

  it("knows a session that is not there", () => {
    expect(isSessionGone(tillErrorOf({ status: 404, data: { message: "x", errors: [] } }))).toBe(true);
    expect(
      isSessionGone(tillErrorOf({ status: 409, data: { message: "x", errors: [{ code: "TILL_SESSION_NOT_FOUND" }] } })),
    ).toBe(true);
    expect(isSessionGone(tillErrorOf({ status: 500, data: { message: "x" } }))).toBe(false);
  });
});
