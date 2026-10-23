import { describe, expect, it } from "vitest";
import { describeServerError, joinServerErrorBody, toApiErrorShape } from "./server-error-text";

describe("joinServerErrorBody", () => {
  it("keeps the reason a 409 carries under errors[]", () => {
    expect(
      joinServerErrorBody({
        success: false,
        message: "This company is still in use",
        errors: [
          {
            field: "compId",
            message: "Used by 2 live branches. Delete those first.",
          },
        ],
      }),
    ).toBe("This company is still in use. Used by 2 live branches. Delete those first.");
  });

  it("does not double a detail that repeats the title, nor add a stop after one", () => {
    expect(joinServerErrorBody({ message: "Not found.", errors: [{ message: "Not found." }] })).toBe(
      "Not found.",
    );
    expect(joinServerErrorBody({ message: "Gone!", errors: [{ message: "Restore it." }] })).toBe(
      "Gone! Restore it.",
    );
  });

  it("falls back to whatever part is there", () => {
    expect(joinServerErrorBody({ errors: [{ message: "a" }, "b"] })).toBe("a b");
    expect(joinServerErrorBody("plain text")).toBe("plain text");
    expect(joinServerErrorBody(null)).toBe("");
  });
});

describe("describeServerError", () => {
  it("reads an axios error's response body", () => {
    const error = Object.assign(new Error("Request failed with status code 409"), {
      response: {
        status: 409,
        data: {
          message: "The branch’s company is deleted",
          errors: [{ field: "brCompId", message: "Restore the company first" }],
        },
      },
    });
    expect(describeServerError(error, "x")).toBe(
      "The branch’s company is deleted. Restore the company first",
    );
  });

  it("uses the error's own message without a response, then the fallback", () => {
    expect(describeServerError(new Error("Network Error"), "x")).toBe("Network Error");
    expect(describeServerError({ response: { data: {} } }, "fallback")).toBe("fallback");
    expect(describeServerError(undefined, "fallback")).toBe("fallback");
  });
});

describe("toApiErrorShape", () => {
  it("lifts an axios error's status and body to the top", () => {
    const body = { message: "Brand is in use", errors: [{ code: "BRAND_IN_USE", message: "3 items" }] };
    const error = Object.assign(new Error("Request failed with status code 409"), {
      response: { status: 409, data: body },
    });
    expect(toApiErrorShape(error)).toEqual({
      status: 409,
      data: body,
      message: "Request failed with status code 409",
    });
  });

  it("passes anything without a response through", () => {
    const network = new Error("Network Error");
    expect(toApiErrorShape(network)).toBe(network);
    expect(toApiErrorShape("x")).toBe("x");
    expect(toApiErrorShape(undefined)).toBeUndefined();
  });
});
