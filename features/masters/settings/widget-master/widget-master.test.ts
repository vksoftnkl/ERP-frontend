import { describe, expect, it } from "vitest";
import {
  buildCreateDefaults,
  buildFilterSummary,
  buildListEmptyText,
  buildWidgetGetByIdQuery,
  buildWidgetListQuery,
  buildWidgetRequestPayload,
  extractSectionsArray,
  fieldPayloadToDraft,
  fieldsValidationMessage,
  flattenMenuRecords,
  getSectionFields,
  isDraftStarted,
  mapWidgetFormValues,
  parseFieldDrafts,
  pickDetailSection,
  serializeFieldDrafts,
  toBoolean,
  toWidgetPlatform,
} from "./widget-master";

const NAMELESS_MESSAGE =
  "Each field needs a Field Name (the internal key, e.g. item_name). Fill it in or remove the row.";

describe("widget platform normalising", () => {
  it("accepts any casing and surrounding spaces", () => {
    expect(toWidgetPlatform(" MOBILE ")).toBe("Mobile");
    expect(toWidgetPlatform("desktop")).toBe("Desktop");
    expect(toWidgetPlatform("wEb")).toBe("Web");
  });

  it("falls back to Desktop, or to the given fallback, for anything unknown", () => {
    expect(toWidgetPlatform("tablet")).toBe("Desktop");
    expect(toWidgetPlatform(null)).toBe("Desktop");
    expect(toWidgetPlatform(undefined, "Web")).toBe("Web");
    expect(toWidgetPlatform("", "Mobile")).toBe("Mobile");
  });
});

describe("boolean reading", () => {
  it("passes real booleans through and treats numbers above zero as true", () => {
    expect(toBoolean(true)).toBe(true);
    expect(toBoolean(false, true)).toBe(false);
    expect(toBoolean(1)).toBe(true);
    expect(toBoolean(0, true)).toBe(false);
  });

  it("reads the usual yes/no words from strings", () => {
    for (const word of ["true", "1", "YES", " y ", "On", "visible"]) {
      expect(toBoolean(word)).toBe(true);
    }
    for (const word of ["false", "0", "No", "n", "OFF", "hidden"]) {
      expect(toBoolean(word, true)).toBe(false);
    }
  });

  it("uses the fallback for unrecognised values", () => {
    expect(toBoolean("maybe")).toBe(false);
    expect(toBoolean("maybe", true)).toBe(true);
    expect(toBoolean(null, true)).toBe(true);
    expect(toBoolean(undefined)).toBe(false);
  });
});

describe("menu tree flattening", () => {
  it("lists parents before their children, however deep", () => {
    const flat = flattenMenuRecords({
      data: [
        { menuId: 1, children: [{ menuId: 2, items: [{ menuId: 3 }] }] },
        { menuId: 4, subMenus: [{ menuId: 5 }] },
      ],
    });
    expect(flat.map((node) => node.menuId)).toEqual([1, 2, 3, 4, 5]);
  });

  it("accepts a bare array and ignores non-object nodes", () => {
    const flat = flattenMenuRecords([{ menuId: 1 }, null, "x", [1], { menuId: 2 }]);
    expect(flat.map((node) => node.menuId)).toEqual([1, 2]);
  });

  it("returns an empty list for payloads it cannot walk", () => {
    expect(flattenMenuRecords(null)).toEqual([]);
    expect(flattenMenuRecords(undefined)).toEqual([]);
    expect(flattenMenuRecords({ data: "nope" })).toEqual([]);
    expect(flattenMenuRecords("text")).toEqual([]);
  });
});

describe("field drafts", () => {
  it("round-trips through serialise and parse", () => {
    const drafts = [
      {
        fieldId: 7,
        fieldName: "item_name",
        fieldGuiName: "Item",
        fieldSecondaryText: "",
        fieldPosition: "2",
        fieldVisibility: false,
      },
    ];
    expect(parseFieldDrafts(serializeFieldDrafts(drafts))).toEqual(drafts);
  });

  it("returns nothing for blank, malformed or non-array input", () => {
    expect(parseFieldDrafts(undefined)).toEqual([]);
    expect(parseFieldDrafts("")).toEqual([]);
    expect(parseFieldDrafts("{not json")).toEqual([]);
    expect(parseFieldDrafts('{"a":1}')).toEqual([]);
  });

  it("turns null and number columns into text and keeps visibility on unless it is exactly false", () => {
    const [draft] = parseFieldDrafts(
      JSON.stringify([{ fieldName: null, fieldGuiName: 5, fieldPosition: 3, fieldVisibility: "no" }]),
    );
    expect(draft).toEqual({
      fieldName: "",
      fieldGuiName: "5",
      fieldSecondaryText: "",
      fieldPosition: "3",
      fieldVisibility: true,
    });
  });

  it("reads a numeric string id as a number and drops ids that are not numbers", () => {
    const parsed = parseFieldDrafts(
      JSON.stringify([{ fieldId: "12" }, { fieldId: " " }, { fieldId: "abc" }, { fieldId: null }, null]),
    );
    expect(parsed.map((draft) => draft.fieldId)).toEqual([12, undefined, undefined, undefined, undefined]);
    expect("fieldId" in parsed[1]).toBe(false);
  });

  it("counts a row as started once any text column has content", () => {
    const empty = parseFieldDrafts(JSON.stringify([{}]))[0];
    expect(isDraftStarted(empty)).toBe(false);
    expect(isDraftStarted({ ...empty, fieldGuiName: "  " })).toBe(false);
    expect(isDraftStarted({ ...empty, fieldSecondaryText: "x" })).toBe(true);
    expect(isDraftStarted({ ...empty, fieldName: "a" })).toBe(true);
  });
});

describe("fields validation", () => {
  it("allows no rows, empty rows and fully named rows", () => {
    expect(fieldsValidationMessage(undefined)).toBeNull();
    expect(fieldsValidationMessage("[]")).toBeNull();
    expect(fieldsValidationMessage(JSON.stringify([{ fieldName: "", fieldPosition: "0" }]))).toBeNull();
    expect(fieldsValidationMessage(JSON.stringify([{ fieldName: "a", fieldGuiName: "A" }]))).toBeNull();
  });

  it("blocks a nameless row that has a GUI name or secondary text", () => {
    expect(fieldsValidationMessage(JSON.stringify([{ fieldName: " ", fieldGuiName: "A" }]))).toBe(
      NAMELESS_MESSAGE,
    );
    expect(fieldsValidationMessage(JSON.stringify([{ fieldSecondaryText: "hint" }]))).toBe(
      NAMELESS_MESSAGE,
    );
  });
});

describe("server field row to draft", () => {
  it("reads the camelCase shape", () => {
    expect(
      fieldPayloadToDraft({
        fieldId: 4,
        fieldName: "item_name",
        fieldGuiName: "Item",
        fieldSecondaryText: "note",
        fieldPosition: 3,
        fieldVisibility: false,
      }),
    ).toEqual({
      fieldId: 4,
      fieldName: "item_name",
      fieldGuiName: "Item",
      fieldSecondaryText: "note",
      fieldPosition: "3",
      fieldVisibility: false,
    });
  });

  it("reads the snake_case shape, with visibility sent as a string", () => {
    expect(
      fieldPayloadToDraft({ field_id: "9", field_name: "x", field_position: "5", field_visibility: "0" }),
    ).toMatchObject({ fieldId: 9, fieldName: "x", fieldPosition: "5", fieldVisibility: false });
  });

  it("defaults position to 0 and visibility to true when missing or blank", () => {
    const draft = fieldPayloadToDraft({ fieldName: "x", fieldPosition: "", fieldVisibility: null });
    expect(draft.fieldPosition).toBe("0");
    expect(draft.fieldVisibility).toBe(true);
    expect("fieldId" in draft).toBe(false);
  });

  it("keeps a position of zero as text", () => {
    expect(fieldPayloadToDraft({ fieldName: "x", fieldPosition: 0 }).fieldPosition).toBe("0");
  });
});

describe("section payload helpers", () => {
  it("finds the fields array under any of its known names", () => {
    expect(getSectionFields({ fields: [{ a: 1 }] })).toEqual([{ a: 1 }]);
    expect(getSectionFields({ sectionFields: [{ b: 2 }] })).toEqual([{ b: 2 }]);
    expect(getSectionFields({ fields: "x" })).toEqual([]);
    expect(getSectionFields(null)).toEqual([]);
    expect(getSectionFields(undefined)).toEqual([]);
  });

  it("finds the sections array in a response envelope", () => {
    expect(extractSectionsArray({ data: [{ sectionId: 1 }] })).toEqual([{ sectionId: 1 }]);
    expect(extractSectionsArray({ rows: [{ sectionId: 2 }] })).toEqual([{ sectionId: 2 }]);
    expect(extractSectionsArray({ data: {} })).toEqual([]);
    expect(extractSectionsArray(null)).toEqual([]);
  });

  it("picks the edited section from the envelope by id, comparing as text", () => {
    const source = { data: [{ sectionId: 1, sectionName: "A" }, { section_id: "2", sectionName: "B" }] };
    expect(pickDetailSection({ recordId: 2, source, rowSource: null })).toEqual({
      section_id: "2",
      sectionName: "B",
    });
    expect(pickDetailSection({ recordId: "1", source, rowSource: null })).toMatchObject({ sectionName: "A" });
  });

  it("falls back to the list row, then null, when the section is not in the envelope", () => {
    const rowSource = { sectionId: 9 };
    expect(pickDetailSection({ recordId: 9, source: { data: [] }, rowSource })).toBe(rowSource);
    expect(pickDetailSection({ recordId: 9, source: null, rowSource: null })).toBeNull();
  });
});

describe("create defaults", () => {
  it("starts from the toolbar filters", () => {
    expect(buildCreateDefaults("Web", "37")).toEqual({
      sectionName: "",
      sectionGuiName: "",
      sectionMenuId: "37",
      sectionPosition: "0",
      sectionPlatform: "Web",
      sectionVisibility: "true",
      fields: "[]",
    });
  });

  it("uses Desktop and no menu when the filters are unset", () => {
    const defaults = buildCreateDefaults("all", "");
    expect(defaults.sectionPlatform).toBe("Desktop");
    expect(defaults.sectionMenuId).toBe("");
  });
});

describe("list query", () => {
  const page = { searchTerm: "", currentPage: 2, pageSize: 25 };

  it("is skipped until both a menu and a platform are picked", () => {
    expect(buildWidgetListQuery({ ...page, menuIdFilter: "", platformFilter: "Web" })).toBeNull();
    expect(buildWidgetListQuery({ ...page, menuIdFilter: "  ", platformFilter: "Web" })).toBeNull();
    expect(buildWidgetListQuery({ ...page, menuIdFilter: "37", platformFilter: "all" })).toBeNull();
  });

  it("binds menuid and platform into grid_param", () => {
    expect(buildWidgetListQuery({ ...page, menuIdFilter: " 37 ", platformFilter: "Web" })).toEqual({
      page: "2",
      limit: "25",
      grid_param: '{"menuid":"37","platform":"Web"}',
    });
  });

  it("adds the search term only when there is one", () => {
    const query = buildWidgetListQuery({
      ...page,
      searchTerm: "item",
      menuIdFilter: "37",
      platformFilter: "Mobile",
    });
    expect(query?.search).toBe("item");
  });

  it("says what is missing while the table is empty", () => {
    expect(buildListEmptyText("", "all")).toBe("Select a platform and a menu to list sections.");
    expect(buildListEmptyText("37", "all")).toBe("Select a platform to list sections.");
    expect(buildListEmptyText(" ", "Web")).toBe("Select a menu to list sections.");
    expect(buildListEmptyText("37", "Web")).toBeUndefined();
  });
});

describe("filter summary", () => {
  const options = [{ label: "Item Entry", value: "37" }];

  it("shows the platform and menu labels", () => {
    expect(buildFilterSummary("Mobile", "37", options)).toBe("Mobile • Item Entry");
  });

  it("shows the defaults when nothing is picked", () => {
    expect(buildFilterSummary("all", "", options)).toBe("All Platforms • All Menus");
  });

  it("falls back to the menu number when the menu is not in the list", () => {
    expect(buildFilterSummary("Web", "99", options)).toBe("Web • Menu #99");
  });
});

describe("edit lookup query", () => {
  it("uses the clicked row's own menu and platform", () => {
    expect(
      buildWidgetGetByIdQuery({
        rowSource: { section_menu_id: 12, section_platform: "mobile" },
        menuIdFilter: "37",
        platformFilter: "Web",
      }),
    ).toEqual({ query: { sectionMenuId: "12", sectionPlatform: "Mobile" } });
  });

  it("falls back to the filter platform, then Desktop, when the row has none", () => {
    expect(
      buildWidgetGetByIdQuery({ rowSource: { sectionMenuId: 1 }, menuIdFilter: "", platformFilter: "Web" }).query,
    ).toEqual({ sectionMenuId: "1", sectionPlatform: "Web" });
    expect(
      buildWidgetGetByIdQuery({ rowSource: { sectionMenuId: 1 }, menuIdFilter: "", platformFilter: "all" }).query,
    ).toEqual({ sectionMenuId: "1", sectionPlatform: "Desktop" });
  });

  it("uses the toolbar filters when there is no row, leaving out what is unset", () => {
    expect(
      buildWidgetGetByIdQuery({ rowSource: null, menuIdFilter: "37", platformFilter: "Web" }).query,
    ).toEqual({ sectionMenuId: "37", sectionPlatform: "Web" });
    expect(
      buildWidgetGetByIdQuery({ rowSource: null, menuIdFilter: "", platformFilter: "all" }).query,
    ).toEqual({});
  });
});

describe("server section to form values", () => {
  it("maps every column to its form string", () => {
    const values = mapWidgetFormValues({
      source: {
        sectionName: "Header",
        sectionGuiName: "Header GUI",
        sectionMenuId: 37,
        sectionPosition: 4,
        sectionPlatform: "Web",
        sectionVisibility: false,
        fields: [{ fieldId: 1, fieldName: "a", fieldPosition: 1 }],
      },
      platformFilter: "all",
    });
    expect(values).toMatchObject({
      sectionName: "Header",
      sectionGuiName: "Header GUI",
      sectionMenuId: "37",
      sectionPosition: "4",
      sectionPlatform: "Web",
      sectionVisibility: "false",
    });
    expect(parseFieldDrafts(values.fields)).toEqual([
      {
        fieldId: 1,
        fieldName: "a",
        fieldGuiName: "",
        fieldSecondaryText: "",
        fieldPosition: "1",
        fieldVisibility: true,
      },
    ]);
  });

  it("accepts snake_case keys and string visibility", () => {
    const values = mapWidgetFormValues({
      source: { section_name: "S", section_menu_id: "5", section_visibility: "0", section_platform: "mobile" },
      platformFilter: "all",
    });
    expect(values).toMatchObject({
      sectionName: "S",
      sectionMenuId: "5",
      sectionVisibility: "false",
      sectionPlatform: "Mobile",
    });
  });

  it("falls back to blank text, position 0, visible, and the filter platform", () => {
    expect(mapWidgetFormValues({ source: null, platformFilter: "Web" })).toEqual({
      sectionName: "",
      sectionGuiName: "",
      sectionMenuId: "",
      sectionPosition: "0",
      sectionPlatform: "Web",
      sectionVisibility: "true",
      fields: "[]",
    });
    expect(mapWidgetFormValues({ source: {}, platformFilter: "all" }).sectionPlatform).toBe("Desktop");
  });
});

describe("form values to save payload", () => {
  const values = {
    sectionName: "  Header ",
    sectionGuiName: " Header GUI ",
    sectionMenuId: "37",
    sectionPosition: "3",
    sectionVisibility: "true",
    sectionPlatform: "Web",
    fields: serializeFieldDrafts([
      {
        fieldId: 5,
        fieldName: " item_name ",
        fieldGuiName: " Item ",
        fieldSecondaryText: "  ",
        fieldPosition: "2",
        fieldVisibility: false,
      },
    ]),
  };

  it("trims text, nulls blank optional field text and keeps existing field ids", () => {
    expect(buildWidgetRequestPayload({ values, shouldUpdate: false, editingItemId: null })).toEqual({
      sectionMenuId: 37,
      sectionName: "Header",
      sectionGuiName: "Header GUI",
      sectionPosition: 3,
      sectionVisibility: true,
      sectionPlatform: "Web",
      fields: [
        {
          fieldId: 5,
          fieldName: "item_name",
          fieldGuiName: "Item",
          fieldSecondaryText: null,
          fieldPosition: 2,
          fieldVisibility: false,
        },
      ],
    });
  });

  it("adds the section id only when updating", () => {
    expect(buildWidgetRequestPayload({ values, shouldUpdate: true, editingItemId: 8 })).toMatchObject({
      sectionId: "8",
    });
    expect("sectionId" in buildWidgetRequestPayload({ values, shouldUpdate: false, editingItemId: 8 })).toBe(
      false,
    );
  });

  it("drops field rows with a blank name and leaves new rows without an id", () => {
    const payload = buildWidgetRequestPayload({
      values: {
        ...values,
        fields: serializeFieldDrafts([
          { fieldName: "  ", fieldGuiName: "x", fieldSecondaryText: "", fieldPosition: "0", fieldVisibility: true },
          { fieldName: "b", fieldGuiName: "", fieldSecondaryText: "", fieldPosition: "", fieldVisibility: true },
        ]),
      },
      shouldUpdate: false,
      editingItemId: null,
    });
    expect(payload.fields).toEqual([
      { fieldName: "b", fieldGuiName: null, fieldSecondaryText: null, fieldPosition: 0, fieldVisibility: true },
    ]);
  });

  it("falls back to zero for unusable numbers and to Desktop for an unknown platform", () => {
    const payload = buildWidgetRequestPayload({
      values: { ...values, sectionMenuId: "abc", sectionPosition: "-2", sectionPlatform: "tablet", fields: "" },
      shouldUpdate: false,
      editingItemId: null,
    });
    expect(payload).toMatchObject({
      sectionMenuId: 0,
      sectionPosition: 0,
      sectionPlatform: "Desktop",
      fields: [],
    });
  });

  it("reads visibility from the form string and defaults to visible when it is missing", () => {
    expect(
      buildWidgetRequestPayload({
        values: { ...values, sectionVisibility: "false" },
        shouldUpdate: false,
        editingItemId: null,
      }).sectionVisibility,
    ).toBe(false);
    const { sectionVisibility: _omitted, ...rest } = values;
    expect(
      buildWidgetRequestPayload({ values: rest, shouldUpdate: false, editingItemId: null }).sectionVisibility,
    ).toBe(true);
  });
});
