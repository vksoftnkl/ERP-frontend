import { describe, expect, it } from "vitest";
import { apiRefusalOf } from "@/lib/api/error-text";
import { refusalLine } from "./refusal-line";

/** The base query's error shape: `{ status, data, message }`. */
function refused(status: number, code: string, message: string, field = "") {
  return { status, data: { success: false, message, errors: [{ field, code, message }] }, message };
}

describe("a refusal as one plain line", () => {
  it("uses the plain words and the step when the code has them", () => {
    const refusal = apiRefusalOf(refused(403, "TILL_DEVICE_UNKNOWN", "Device 1f… is not in device_master"));
    expect(refusalLine(refusal)).toBe("Cannot open till — This PC is not set up as a till. Do: Call manager.");
  });

  it("keeps the server's sentence for a code with no wording", () => {
    const refusal = apiRefusalOf(refused(409, "SOMETHING_NEW", "The counter is being re-keyed"));
    expect(refusalLine(refusal)).toBe("The counter is being re-keyed");
  });

  it("falls back when nothing was said", () => {
    expect(refusalLine(apiRefusalOf(null, ""), "The supervisor list did not load.")).toBe("The supervisor list did not load.");
  });
});
