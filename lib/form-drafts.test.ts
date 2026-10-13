import { describe, expect, it } from "vitest";

import {
  FORM_DRAFT_MAX_AGE_MS,
  collectChangedFormValues,
  parseFormDraft,
} from "./form-drafts";

describe("collectChangedFormValues", () => {
  it("keeps only the fields that differ from what the form opened on", () => {
    expect(
      collectChangedFormValues(
        { cusName: "", cusActive: "true", cusAreaId: "a-1" },
        { cusName: "RAVI", cusActive: "true", cusAreaId: "a-2" },
      ),
    ).toEqual({ cusName: "RAVI", cusAreaId: "a-2" });
  });

  it("is null when the user changed nothing, or changed it back", () => {
    expect(collectChangedFormValues({ cusName: "" }, { cusName: "" })).toBeNull();
    expect(collectChangedFormValues({ cusName: "RAVI" }, { cusName: "RAVI" })).toBeNull();
  });

  it("treats a field missing on one side as blank", () => {
    expect(collectChangedFormValues({}, { cusPin: "" })).toBeNull();
    expect(collectChangedFormValues({}, { cusPin: "641001" })).toEqual({ cusPin: "641001" });
    expect(collectChangedFormValues({ cusPin: "641001" }, {})).toEqual({ cusPin: "" });
  });
});

describe("parseFormDraft", () => {
  const now = 1_800_000_000_000;

  it("reads a stored draft back", () => {
    const raw = JSON.stringify({
      values: { cusName: "RAVI" },
      labels: { cusAreaId: { "a-2": "GANDHIPURAM" } },
      savedAt: now - 1000,
    });
    expect(parseFormDraft(raw, now)).toEqual({
      values: { cusName: "RAVI" },
      labels: { cusAreaId: { "a-2": "GANDHIPURAM" } },
      savedAt: now - 1000,
    });
  });

  it("drops a draft past its age", () => {
    const raw = JSON.stringify({
      values: { cusName: "RAVI" },
      labels: {},
      savedAt: now - FORM_DRAFT_MAX_AGE_MS - 1,
    });
    expect(parseFormDraft(raw, now)).toBeNull();
  });

  it("refuses anything that is not a draft", () => {
    expect(parseFormDraft(null, now)).toBeNull();
    expect(parseFormDraft("not json", now)).toBeNull();
    expect(parseFormDraft(JSON.stringify({ values: { a: 1 }, savedAt: now }), now)).toBeNull();
    expect(parseFormDraft(JSON.stringify({ values: {} }), now)).toBeNull();
  });

  it("skips malformed label maps but keeps the values", () => {
    const raw = JSON.stringify({
      values: { cusName: "RAVI" },
      labels: { cusAreaId: { "a-2": 5 }, cusGroupId: { "g-1": "RETAIL" } },
      savedAt: now,
    });
    expect(parseFormDraft(raw, now)?.labels).toEqual({ cusGroupId: { "g-1": "RETAIL" } });
  });
});
