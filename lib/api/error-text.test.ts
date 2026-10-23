import { describe, expect, it } from "vitest";
import { apiRefusalOf, refusalMessage } from "./error-text";

/** The base query's error: `{ status, data, message }`. */
function rtk(status: number | undefined, data: unknown, message = "Request failed.") {
  return { status, data, message };
}

function tillBody(error: Record<string, unknown>, message = "Refused") {
  return { success: false, message, errors: [error] };
}

describe("apiRefusalOf", () => {
  it("prefers the server's notes-120 user block over the table", () => {
    const refusal = apiRefusalOf(
      rtk(
        409,
        tillBody({
          code: "TILL_COUNTER_BUSY",
          field: "counterId",
          message: "Counter C1 has a live session",
          user: { title: "Counter busy", line: "Someone uses it.", todo: "Pick another." },
        }),
      ),
    );
    expect(refusal.plain).toEqual({ title: "Counter busy", line: "Someone uses it.", todo: "Pick another." });
    expect(refusal.head).toBe("409 · TILL_COUNTER_BUSY · counterId");
    expect(refusal.detail).toBe("409 · TILL_COUNTER_BUSY · counterId\nRefused");
  });

  it("falls back to the client table for a known code", () => {
    const refusal = apiRefusalOf(rtk(422, tillBody({ code: "TILL_REMIT_OVER_BALANCE", field: "amount" })));
    expect(refusal.plain?.title).toBe("Amount too big");
    expect(refusal.plain?.todo).toBe("Send less, or count the safe first.");
  });

  it("words TILL_SESSION_NOT_OPEN by the session's status, the field or the sentence", () => {
    const byStatus = apiRefusalOf(
      rtk(409, tillBody({ code: "TILL_SESSION_NOT_OPEN", field: "sbSessionId", status: "SUSPENDED" })),
    );
    expect(byStatus.plain?.line).toBe("Your till is paused.");
    const bySentence = apiRefusalOf(
      rtk(409, tillBody({ code: "TILL_SESSION_NOT_OPEN" }, "Session 7 is PENDING_APPROVAL: it takes no money")),
    );
    expect(bySentence.plain?.line).toBe("Your till is waiting for supervisor OK.");
    const onCockpit = apiRefusalOf(rtk(409, tillBody({ code: "TILL_SESSION_NOT_OPEN", field: "tssId" })));
    expect(onCockpit.plain?.title).toBe("Not now");
  });

  it("treats an unworded HOLD_ / VALIDATION_ code as the app's mistake", () => {
    expect(apiRefusalOf(rtk(400, tillBody({ code: "HOLD_WHATEVER" }))).plain?.title).toBe("Something went wrong");
    expect(apiRefusalOf(rtk(400, tillBody({ code: "VALIDATION_IS_UUID" }))).plain?.line).toBe(
      "The app sent a wrong request.",
    );
  });

  it("leaves a code with no wording unworded", () => {
    const refusal = apiRefusalOf(rtk(409, tillBody({ code: "SALES_ALREADY_POSTED", message: "Bill is posted" }, "")));
    expect(refusal.plain).toBeNull();
    expect(refusal.sentence).toBe("Bill is posted");
  });

  it("reads the nested AllExceptionsFilter body", () => {
    const refusal = apiRefusalOf(
      rtk(403, { statusCode: 403, message: { message: "No right", errors: [{ code: "TILL_APPROVER_NO_GRANT" }] } }),
    );
    expect(refusal.code).toBe("TILL_APPROVER_NO_GRANT");
    expect(refusal.sentence).toBe("No right");
    expect(refusal.plain?.title).toBe("Not allowed");
  });

  it("reads a raw class-validator 400 whose message is a list", () => {
    const refusal = apiRefusalOf(
      rtk(400, { statusCode: 400, message: ["amount must be positive", "safeId must be a UUID"], error: "Bad Request" }),
    );
    expect(refusal.sentence).toBe("amount must be positive, safeId must be a UUID");
  });

  it("knows a request that never got an answer", () => {
    expect(apiRefusalOf(rtk(undefined, undefined, "TypeError: Failed to fetch")).network).toBe("offline");
    expect(apiRefusalOf(rtk(undefined, undefined, "AbortError: signal timed out")).network).toBe("timeout");
    expect(apiRefusalOf({ status: "PARSING_ERROR", error: "SyntaxError: x" }).network).toBe("parse");
    expect(apiRefusalOf(new Error("boom")).network).toBeNull();
  });
});

describe("refusalMessage", () => {
  it("shows plain words, Do:, the kept line and the grey detail", () => {
    const message = refusalMessage(apiRefusalOf(rtk(409, tillBody({ code: "TILL_CASH_BLOCKED" }))), "Bill not lost.");
    expect(message).toEqual({
      kind: "warn",
      title: "Too much cash",
      body: "Drawer is over the cash limit.\nDo: Drop cash in safe, or call supervisor.\nBill not lost.",
      detail: "409 · TILL_CASH_BLOCKED\nRefused",
    });
  });

  it("titles an unworded refusal by its status and keeps the sentence", () => {
    const message = refusalMessage(
      apiRefusalOf(rtk(409, tillBody({ code: "SALES_ALREADY_POSTED", field: "sbId" }, "Bill is posted"))),
      "Bill not lost.",
    );
    expect(message.title).toBe("Cannot save");
    expect(message.body).toBe("Bill is posted\nBill not lost.");
    expect(message.detail).toBe("409 · SALES_ALREADY_POSTED · sbId");
  });

  it("titles a refused delete as a delete, never as a save", () => {
    const refusal = apiRefusalOf(rtk(409, tillBody({ code: "ITEM_BRAND_IN_USE" }, "Brand is in use")));
    expect(refusalMessage(refusal, null, "Cannot delete").title).toBe("Cannot delete");
    expect(refusalMessage(refusal, null, "  ").title).toBe("Cannot save");
    // A 404 keeps its own title whatever the caller was doing.
    expect(refusalMessage(apiRefusalOf(rtk(404, { message: "Gone" })), null, "Cannot delete").title).toBe("Not found");
  });

  it("lists every error's own reason under an unworded headline, the headline once", () => {
    const message = refusalMessage(
      apiRefusalOf(
        rtk(400, {
          success: false,
          message: "Validation failed",
          errors: [
            { code: "ACC_COLLECTOR_REQUIRED", field: "collectorId", message: "Pick the collector" },
            { code: "ACC_X", message: "Validation failed" },
            { code: "ACC_Y", message: "Pick the collector", field: "collectorId" },
          ],
        }),
      ),
      "Receipt not lost.",
    );
    expect(message.body).toBe("Validation failed\n• collectorId — Pick the collector\nReceipt not lost.");
  });

  it("says a server failure plainly and never adds the kept line to it", () => {
    const message = refusalMessage(apiRefusalOf(rtk(500, { message: "Internal server error" })), "Bill not lost.");
    expect(message.kind).toBe("error");
    expect(message.title).toBe("Server problem");
    expect(message.body).toBe("Internal server error");
  });

  it("says no connection in plain words", () => {
    const message = refusalMessage(apiRefusalOf(rtk(undefined, undefined, "TypeError: Failed to fetch")));
    expect(message.title).toBe("No connection");
    expect(message.body).toBe("Cannot reach the server.\nDo: Check network, try again.");
    expect(message.detail).toBe("TypeError: Failed to fetch");
  });
});
