import { describe, expect, it } from "vitest";

import {
  INACTIVE_NOTE,
  INITIAL_TEMPLATE_FILTERS,
  NOT_PUBLISHED_NOTE,
  SHIPPED_NOTE,
  retireRefusal,
  rowNotes,
  templateGridParams,
} from "./templateList";

const COMPANY = "019c8ea6-19e9-78a8-b15f-749e1cde7292";

describe("templateGridParams", () => {
  it("sends every token, with '' for no filter and Active on by default", () => {
    expect(templateGridParams(COMPANY, INITIAL_TEMPLATE_FILTERS)).toEqual({
      iptl_company_id: COMPANY,
      iptl_active: "true",
      iptl_purpose_id: "",
      iptl_state: "",
      iptl_owned: "",
      iptl_engine: "",
    });
  });

  it("maps each filter onto its token", () => {
    expect(
      templateGridParams(COMPANY, {
        activeOnly: false,
        purposeId: "p1",
        state: "UNPUBLISHED",
        ownedOnly: true,
        engine: "HTML_CSS",
      }),
    ).toEqual({
      iptl_company_id: COMPANY,
      iptl_active: "",
      iptl_purpose_id: "p1",
      iptl_state: "UNPUBLISHED",
      iptl_owned: "true",
      iptl_engine: "HTML_CSS",
    });
  });
});

describe("rowNotes / retireRefusal", () => {
  it("says nothing about an own, published, active design", () => {
    const row = { ptl_company_id: COMPANY, state: "PUBLISHED", ptl_is_active: true };
    expect(rowNotes(row)).toEqual([]);
    expect(retireRefusal(row)).toBeNull();
  });

  it("refuses to retire a shipped design (empty company) and says why", () => {
    for (const ptl_company_id of [null, "", undefined]) {
      const row = { ptl_company_id, state: "PUBLISHED", ptl_is_active: true };
      expect(retireRefusal(row)).toBe(SHIPPED_NOTE);
      expect(rowNotes(row)).toEqual([SHIPPED_NOTE]);
    }
  });

  it("explains NOT PUBLISHED and inactive, in Qt's order", () => {
    const row = { ptl_company_id: null, state: "NOT PUBLISHED", ptl_is_active: false };
    expect(rowNotes(row)).toEqual([SHIPPED_NOTE, NOT_PUBLISHED_NOTE, INACTIVE_NOTE]);
  });

  it("does not call a row inactive when the flag is absent", () => {
    expect(rowNotes({ ptl_company_id: COMPANY, state: "PUBLISHED" })).toEqual([]);
  });
});
