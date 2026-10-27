import { describe, expect, it } from "vitest";
import {
  buildRecordHistoryHref,
  buildRecordHistoryReturnTo,
  resolveRecordHistoryDisplayName,
} from "./record-history-route";

describe("record history display name", () => {
  it("takes the first usable value", () => {
    expect(resolveRecordHistoryDisplayName(null, undefined, "  ", " Acme ", "Other")).toBe("Acme");
  });

  it("accepts numbers, including zero", () => {
    expect(resolveRecordHistoryDisplayName(null, 0)).toBe("0");
    expect(resolveRecordHistoryDisplayName(BigInt(42))).toBe("42");
  });

  it("ignores values that are not text or numbers", () => {
    expect(resolveRecordHistoryDisplayName({}, [], true, "x")).toBe("x");
  });

  it("is null when nothing is usable", () => {
    expect(resolveRecordHistoryDisplayName()).toBeNull();
    expect(resolveRecordHistoryDisplayName("", "   ", null)).toBeNull();
  });
});

describe("record history return path", () => {
  it("appends the query string", () => {
    expect(buildRecordHistoryReturnTo("/master/brand", new URLSearchParams("page=2&q=a"))).toBe(
      "/master/brand?page=2&q=a",
    );
  });

  it("is the bare path without a query", () => {
    expect(buildRecordHistoryReturnTo("/master/brand", new URLSearchParams())).toBe(
      "/master/brand",
    );
    expect(buildRecordHistoryReturnTo("/master/brand")).toBe("/master/brand");
    expect(buildRecordHistoryReturnTo("/master/brand", null)).toBe("/master/brand");
  });

  it("falls back to /master for a blank path", () => {
    expect(buildRecordHistoryReturnTo("   ")).toBe("/master");
    expect(buildRecordHistoryReturnTo("", new URLSearchParams("a=1"))).toBe("/master?a=1");
  });
});

describe("record history link", () => {
  it("needs both a screen and a record", () => {
    expect(buildRecordHistoryHref({ screenName: "", recordPk: "1" })).toBeNull();
    expect(buildRecordHistoryHref({ screenName: "Brand Master", recordPk: "  " })).toBeNull();
    expect(buildRecordHistoryHref({ screenName: null, recordPk: 1 })).toBeNull();
    expect(buildRecordHistoryHref({ screenName: "Brand Master", recordPk: undefined })).toBeNull();
  });

  it("builds the link with the two required values", () => {
    expect(buildRecordHistoryHref({ screenName: "Brand Master", recordPk: 7 })).toBe(
      "/master/record-history?screen_name=Brand+Master&record_pk=7",
    );
  });

  it("adds the display name and return path when given, encoded", () => {
    const href = buildRecordHistoryHref({
      screenName: " Brand Master ",
      recordPk: "a/b",
      displayName: " Acme & Sons ",
      returnTo: "/master/brand?page=2",
    });
    expect(href).toBe(
      "/master/record-history?screen_name=Brand+Master&record_pk=a%2Fb&display_name=Acme+%26+Sons&return_to=%2Fmaster%2Fbrand%3Fpage%3D2",
    );
  });

  it("leaves out a blank display name or return path", () => {
    expect(
      buildRecordHistoryHref({
        screenName: "Brand Master",
        recordPk: "1",
        displayName: "  ",
        returnTo: null,
      }),
    ).toBe("/master/record-history?screen_name=Brand+Master&record_pk=1");
  });
});
