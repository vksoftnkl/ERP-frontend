import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTION_OPTIONS,
  buildAuditCsvLines,
  buildAuditLogQuery,
  buildPresetRange,
  countChangedFields,
  DATE_PRESETS,
  DEFAULT_FILTERS,
  escapeCsvValue,
  flattenAuditDiff,
  flattenAuditRecord,
  formatActionLabel,
  formatAuditPrimitiveValue,
  formatChangeSummary,
  formatDateOnly,
  formatDateTime,
  formatTimeOnly,
  getRowEntityLabel,
  getRowUserLabel,
  resolveActionVariant,
  resolveDatePreset,
  resolveSnapshot,
  toCsvRow,
  toDateInputValue,
  truncateMiddle,
  truncateValue,
  type AuditLogFilters,
  type AuditLogListItem,
} from "./audit-logs";

function localIso(y: number, mo: number, d: number, h: number, mi: number, s = 0): string {
  return new Date(y, mo - 1, d, h, mi, s).toISOString();
}

function makeLog(overrides: Partial<AuditLogListItem> = {}): AuditLogListItem {
  return {
    log_id: "log-1",
    log_date: localIso(2026, 10, 15, 14, 5),
    log_action: "update",
    log_screen_id: 1,
    screen_name: "Brand Master",
    log_table_name: "brand_master",
    log_pk: "pk-1",
    log_display_name: null,
    log_original_record: null,
    log_modified_record: null,
    log_changed_fields: null,
    log_user_id: null,
    log_user_name: null,
    log_branch_id: null,
    log_branch_name: null,
    log_notes: null,
    ...overrides,
  };
}

function filters(patch: Partial<AuditLogFilters> = {}): AuditLogFilters {
  return { ...DEFAULT_FILTERS, ...patch };
}

describe("audit log list query", () => {
  it("always asks for totals and sends only the paging when no filter is set", () => {
    expect(buildAuditLogQuery(DEFAULT_FILTERS, 1, 20)).toEqual({
      page: "1",
      limit: "20",
      include_total: "true",
    });
  });

  it("sends each filled filter under the name the server expects", () => {
    expect(
      buildAuditLogQuery(
        filters({
          search: "  brand ",
          action: "update",
          screenId: " 12 ",
          dateFrom: "2026-10-01",
          dateTo: "2026-10-15",
        }),
        3,
        50,
      ),
    ).toEqual({
      page: "3",
      limit: "50",
      include_total: "true",
      search: "brand",
      action: "update",
      screen_id: "12",
      date_from: "2026-10-01",
      date_to: "2026-10-15",
    });
  });

  it("drops filters that are only whitespace", () => {
    const query = buildAuditLogQuery(filters({ search: "   ", screenId: "  " }), 1, 10);
    expect(query).not.toHaveProperty("search");
    expect(query).not.toHaveProperty("screen_id");
  });

  it("has no delete action to filter on, because the server rejects it", () => {
    expect(ACTION_OPTIONS.map((option) => option.label)).toEqual([
      "All",
      "New",
      "Update",
      "Approve",
      "Cancel",
    ]);
    expect(ACTION_OPTIONS.map((option) => option.value)).not.toContain("delete");
  });
});

describe("audit log date presets", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 10, 30));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes a date as yyyy-mm-dd with zero padding", () => {
    expect(toDateInputValue(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toDateInputValue(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("counts today as the first day of the range", () => {
    expect(buildPresetRange(1)).toEqual({ dateFrom: "2026-10-15", dateTo: "2026-10-15" });
    expect(buildPresetRange(7)).toEqual({ dateFrom: "2026-10-09", dateTo: "2026-10-15" });
    expect(buildPresetRange(30)).toEqual({ dateFrom: "2026-09-16", dateTo: "2026-10-15" });
  });

  it("reaches back across a month and year end", () => {
    vi.setSystemTime(new Date(2026, 0, 3, 9, 0));
    expect(buildPresetRange(7)).toEqual({ dateFrom: "2025-12-28", dateTo: "2026-01-03" });
  });

  it("recognises the preset a range came from", () => {
    expect(resolveDatePreset(filters())).toBe("all");
    expect(resolveDatePreset(filters(buildPresetRange(7)))).toBe("7d");
    expect(resolveDatePreset(filters(buildPresetRange(30)))).toBe("30d");
  });

  it("calls any other range custom, even a half-open one", () => {
    expect(resolveDatePreset(filters({ dateFrom: "2026-10-01", dateTo: "2026-10-15" }))).toBe(
      "custom",
    );
    expect(resolveDatePreset(filters({ dateFrom: "2026-10-09" }))).toBe("custom");
    expect(resolveDatePreset(filters({ dateTo: "2026-10-15" }))).toBe("custom");
  });

  it("offers 7 days, 30 days and All", () => {
    expect(DATE_PRESETS.map((preset) => [preset.label, preset.days])).toEqual([
      ["7 days", 7],
      ["30 days", 30],
      ["All", null],
    ]);
  });
});

describe("audit log date and time text", () => {
  it("shows the date and a 12-hour clock", () => {
    const iso = localIso(2026, 10, 15, 14, 5);
    expect(formatDateTime(iso)).toBe("15 Oct 2026, 02:05 PM");
    expect(formatDateOnly(iso)).toBe("15 Oct 2026");
    expect(formatTimeOnly(iso)).toBe("02:05 PM");
  });

  it("reads midnight and noon as 12 AM and 12 PM", () => {
    expect(formatTimeOnly(localIso(2026, 10, 15, 0, 7))).toBe("12:07 AM");
    expect(formatTimeOnly(localIso(2026, 10, 15, 12, 0))).toBe("12:00 PM");
  });

  it("hands back unreadable dates, and a blank time", () => {
    expect(formatDateTime("nope")).toBe("nope");
    expect(formatDateOnly("nope")).toBe("nope");
    expect(formatTimeOnly("nope")).toBe("");
  });
});

describe("audit log action text", () => {
  it("labels insert and new as New and capitalises the rest", () => {
    expect(formatActionLabel("insert")).toBe("New");
    expect(formatActionLabel("New")).toBe("New");
    expect(formatActionLabel("CANCEL")).toBe("Cancel");
    expect(formatActionLabel("  ")).toBe("Unknown");
  });

  it("maps actions to badge variants", () => {
    expect(resolveActionVariant("insert")).toBe("new");
    expect(resolveActionVariant("Update")).toBe("update");
    expect(resolveActionVariant("approve")).toBe("approve");
    expect(resolveActionVariant("cancel")).toBe("cancel");
    expect(resolveActionVariant("something")).toBe("neutral");
  });
});

describe("audit log values", () => {
  it("prints the empty-value mark for nothing and for blank text", () => {
    expect(formatAuditPrimitiveValue(null)).toBe("∅");
    expect(formatAuditPrimitiveValue(undefined)).toBe("∅");
    expect(formatAuditPrimitiveValue("")).toBe("∅");
    expect(formatAuditPrimitiveValue("  ")).toBe("∅");
  });

  it("prints other primitives plainly", () => {
    expect(formatAuditPrimitiveValue(true)).toBe("true");
    expect(formatAuditPrimitiveValue(0)).toBe("0");
    expect(formatAuditPrimitiveValue("text")).toBe("text");
    expect(formatAuditPrimitiveValue({ a: [1] })).toBe('{"a":[1]}');
  });

  it("formats ISO timestamps as dates", () => {
    expect(formatAuditPrimitiveValue(localIso(2026, 10, 15, 14, 5))).toBe("15 Oct 2026, 02:05 PM");
    expect(formatAuditPrimitiveValue("2026-10-15")).toBe("2026-10-15");
  });

  it("flattens a diff into labelled from/to rows", () => {
    expect(
      flattenAuditDiff({
        brandName: { from: "A", to: "B" },
        rows: [{ qty: { from: 1, to: 2 } }],
      }),
    ).toEqual([
      { field: "Brand Name", from: "A", to: "B" },
      { field: "Rows / Item 1 / Qty", from: 1, to: 2 },
    ]);
    expect(flattenAuditDiff(null)).toEqual([]);
    expect(flattenAuditDiff('{"a":{"from":"1","to":"2"}}')).toEqual([
      { field: "A", from: 1, to: 2 },
    ]);
  });

  it("flattens a record snapshot, keeping nulls and empty containers", () => {
    expect(flattenAuditRecord({ nameText: "A", tags: [], none: null })).toEqual([
      { field: "Name Text", value: "A" },
      { field: "Tags", value: [] },
      { field: "None", value: null },
    ]);
    expect(flattenAuditRecord(null)).toEqual([]);
  });

  it("counts changed fields", () => {
    expect(countChangedFields({ a: { from: 1, to: 2 }, b: { from: 1, to: 2 } })).toBe(2);
    expect(countChangedFields(null)).toBe(0);
    expect(countChangedFields({})).toBe(0);
    expect(countChangedFields([1, 2])).toBe(2);
  });

  it("summarises the diff size the way the list shows it", () => {
    expect(formatChangeSummary(null)).toBe("No diff");
    expect(formatChangeSummary({})).toBe("No diff");
    expect(formatChangeSummary({ a: { from: 1, to: 2 } })).toBe("1 field");
    expect(formatChangeSummary({ a: { from: 1, to: 2 }, b: { from: 1, to: 2 } })).toBe("2 fields");
  });
});

describe("audit log snapshot fallback", () => {
  it("shows the modified record when there is one", () => {
    expect(
      resolveSnapshot(
        makeLog({ log_original_record: { a: 1 }, log_modified_record: { a: 2 } }),
      ),
    ).toEqual([{ field: "A", value: 2 }]);
  });

  it("falls back to the original record when nothing was modified", () => {
    expect(resolveSnapshot(makeLog({ log_original_record: { a: 1 } }))).toEqual([
      { field: "A", value: 1 },
    ]);
    expect(
      resolveSnapshot(makeLog({ log_original_record: { a: 1 }, log_modified_record: "null" })),
    ).toEqual([{ field: "A", value: 1 }]);
  });

  it("is empty when neither record exists", () => {
    expect(resolveSnapshot(makeLog())).toEqual([]);
  });
});

describe("audit log labels", () => {
  it("shortens long text with an ellipsis and dashes out blanks", () => {
    expect(truncateValue("a".repeat(42))).toBe("a".repeat(42));
    expect(truncateValue("a".repeat(43))).toBe(`${"a".repeat(41)}…`);
    expect(truncateValue("   ")).toBe("—");
    expect(truncateValue(null)).toBe("—");
  });

  it("keeps the head and tail of a long id", () => {
    expect(truncateMiddle("0123456789abcdefghij")).toBe("01234567...efghij");
    expect(truncateMiddle("0123456789abcdefg")).toBe("0123456789abcdefg");
    expect(truncateMiddle("0123456789abcdefgh")).toBe("01234567...cdefgh");
    expect(truncateMiddle(undefined)).toBe("—");
  });

  it("names the user by name, else a shortened id, else a muted dash", () => {
    expect(getRowUserLabel(makeLog({ log_user_name: " Asha ", log_user_id: "u1" }))).toEqual({
      label: "Asha",
      title: "Asha",
      muted: false,
    });
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(getRowUserLabel(makeLog({ log_user_id: id }))).toEqual({
      label: "123e4567...174000",
      title: id,
      muted: true,
    });
    expect(getRowUserLabel(makeLog({ log_user_name: " ", log_user_id: " " }))).toEqual({
      label: "—",
      title: "",
      muted: true,
    });
  });

  it("names the entity by display name, then record key, then a dash", () => {
    expect(getRowEntityLabel(makeLog({ log_display_name: " Acme ", log_pk: "7" }))).toBe("Acme");
    expect(getRowEntityLabel(makeLog({ log_display_name: " ", log_pk: " 7 " }))).toBe("7");
    expect(getRowEntityLabel(makeLog({ log_pk: null }))).toBe("-");
  });
});

describe("audit log export", () => {
  it("quotes values that hold a comma, quote or line break", () => {
    expect(escapeCsvValue("plain")).toBe("plain");
    expect(escapeCsvValue("a,b")).toBe('"a,b"');
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvValue("line\nbreak")).toBe('"line\nbreak"');
  });

  it("joins a row of mixed text and numbers", () => {
    expect(toCsvRow(["a", 2, "c,d"])).toBe('a,2,"c,d"');
  });

  it("starts with the header and writes one line per log", () => {
    const lines = buildAuditCsvLines([
      makeLog({
        log_id: "x1",
        log_action: "insert",
        log_user_name: "Asha",
        log_display_name: "Acme, Inc",
        log_changed_fields: { a: { from: 1, to: 2 } },
        log_notes: "first",
      }),
      makeLog({ log_id: "x2", log_user_id: "u9", log_notes: null }),
    ]);
    expect(lines).toEqual([
      "Log ID,Date,Action,User,Screen,Table,Entity,Changes,Notes",
      'x1,"15 Oct 2026, 02:05 PM",New,Asha,Brand Master,brand_master,"Acme, Inc",1 field,first',
      'x2,"15 Oct 2026, 02:05 PM",Update,u9,Brand Master,brand_master,pk-1,No diff,',
    ]);
  });

  it("is just the header for no logs", () => {
    expect(buildAuditCsvLines([])).toHaveLength(1);
  });
});
