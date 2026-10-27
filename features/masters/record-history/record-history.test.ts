import { describe, expect, it } from "vitest";
import {
  buildAuditComparisonRows,
  buildHistoryGroups,
  buildModalDiffRows,
  buildRecordHistoryQuery,
  countChangedFields,
  flattenAuditDiff,
  flattenAuditRecord,
  formatActionLabel,
  formatAuditFieldLabel,
  formatAuditPrimitiveValue,
  formatDateOnly,
  formatDateTime,
  formatTimeOnly,
  getHistoryGroupKey,
  getRowUserLabel,
  MODAL_GROUPS_PER_PAGE,
  normalizeQueryValue,
  normalizeStructuredValue,
  normalizeViewerValue,
  pageHistoryGroups,
  resolveActionVariant,
  resolveSubEntityLabel,
  truncateValue,
  type AuditLogListItem,
  type ModalHistoryGroup,
} from "./record-history";

/* Wall-clock instants built from local parts, so the tests hold in any timezone. */
function localIso(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s = 0,
  ms = 0,
): string {
  return new Date(y, mo - 1, d, h, mi, s, ms).toISOString();
}

function makeLog(overrides: Partial<AuditLogListItem> = {}): AuditLogListItem {
  return {
    log_id: "log-1",
    log_date: localIso(2026, 10, 15, 14, 5, 30),
    log_action: "update",
    log_screen_id: 1,
    screen_name: "Item Master",
    log_table_name: "item_master",
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

const badge = (action: string) => `badge:${resolveActionVariant(action)}`;

describe("record history query", () => {
  it("asks for the totals so the pager can count pages", () => {
    expect(buildRecordHistoryQuery("Item Master", "42", 2, 20)).toEqual({
      screen_name: "Item Master",
      record_pk: "42",
      page: "2",
      limit: "20",
      include_total: "true",
    });
  });

  it("trims page query values and treats missing ones as blank", () => {
    expect(normalizeQueryValue("  abc ")).toBe("abc");
    expect(normalizeQueryValue(null)).toBe("");
  });

  it("normalizes viewer props of any type to trimmed text", () => {
    expect(normalizeViewerValue(12)).toBe("12");
    expect(normalizeViewerValue("  x ")).toBe("x");
    expect(normalizeViewerValue(null)).toBe("");
    expect(normalizeViewerValue(undefined)).toBe("");
  });
});

describe("record history date and time text", () => {
  it("shows the date and a 12-hour clock", () => {
    const iso = localIso(2026, 10, 15, 14, 5);
    expect(formatDateTime(iso)).toBe("15 Oct 2026, 02:05 PM");
    expect(formatDateOnly(iso)).toBe("15 Oct 2026");
    expect(formatTimeOnly(iso)).toBe("02:05 PM");
  });

  it("reads midnight and noon as 12 AM and 12 PM", () => {
    expect(formatTimeOnly(localIso(2026, 10, 15, 0, 0))).toBe("12:00 AM");
    expect(formatTimeOnly(localIso(2026, 10, 15, 12, 30))).toBe("12:30 PM");
    expect(formatTimeOnly(localIso(2026, 10, 15, 23, 59))).toBe("11:59 PM");
  });

  it("hands back text that is not a date unchanged", () => {
    expect(formatDateTime("not a date")).toBe("not a date");
    expect(formatDateOnly("not a date")).toBe("not a date");
    expect(formatTimeOnly("not a date")).toBe("not a date");
  });
});

describe("record history action text", () => {
  it("labels insert and new as New and capitalises the rest", () => {
    expect(formatActionLabel("insert")).toBe("New");
    expect(formatActionLabel(" NEW ")).toBe("New");
    expect(formatActionLabel("UPDATE")).toBe("Update");
    expect(formatActionLabel("approve")).toBe("Approve");
  });

  it("calls a blank action Unknown", () => {
    expect(formatActionLabel("")).toBe("Unknown");
    expect(formatActionLabel("   ")).toBe("Unknown");
  });

  it("maps actions to badge variants", () => {
    expect(resolveActionVariant("New")).toBe("new");
    expect(resolveActionVariant("insert")).toBe("new");
    expect(resolveActionVariant("Update")).toBe("update");
    expect(resolveActionVariant("approve")).toBe("approve");
    expect(resolveActionVariant(" cancel ")).toBe("cancel");
    expect(resolveActionVariant("delete")).toBe("neutral");
    expect(resolveActionVariant("")).toBe("neutral");
  });
});

describe("record history field labels and values", () => {
  it("turns camelCase and snake_case keys into title-case words", () => {
    expect(formatAuditFieldLabel("itemName")).toBe("Item Name");
    expect(formatAuditFieldLabel("item_unit_id")).toBe("Item Unit Id");
    expect(formatAuditFieldLabel("  already   spaced ")).toBe("Already Spaced");
    expect(formatAuditFieldLabel("   ")).toBe("Field");
  });

  it("prints primitives the way the diff table shows them", () => {
    expect(formatAuditPrimitiveValue(null)).toBe("null");
    expect(formatAuditPrimitiveValue(undefined)).toBe("null");
    expect(formatAuditPrimitiveValue(true)).toBe("true");
    expect(formatAuditPrimitiveValue(false)).toBe("false");
    expect(formatAuditPrimitiveValue(12.5)).toBe("12.5");
    expect(formatAuditPrimitiveValue(BigInt(10))).toBe("10");
    expect(formatAuditPrimitiveValue("")).toBe('""');
    expect(formatAuditPrimitiveValue("   ")).toBe('""');
    expect(formatAuditPrimitiveValue("plain")).toBe("plain");
    expect(formatAuditPrimitiveValue({ a: 1 })).toBe('{"a":1}');
    expect(formatAuditPrimitiveValue([1, 2])).toBe("[1,2]");
  });

  it("formats ISO timestamps as dates but leaves other date-like text alone", () => {
    const iso = localIso(2026, 10, 15, 14, 5);
    expect(formatAuditPrimitiveValue(iso)).toBe("15 Oct 2026, 02:05 PM");
    expect(formatAuditPrimitiveValue("2026-10-15")).toBe("2026-10-15");
    expect(formatAuditPrimitiveValue("2026-13-45T99:99:99")).toBe("2026-13-45T99:99:99");
  });

  it("falls back to String() for values JSON cannot hold", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(formatAuditPrimitiveValue(circular)).toBe("[object Object]");
  });
});

describe("record history structured values", () => {
  it("parses JSON-looking strings and leaves everything else", () => {
    expect(normalizeStructuredValue('{"a":1}')).toEqual({ a: 1 });
    expect(normalizeStructuredValue("[1,2]")).toEqual([1, 2]);
    expect(normalizeStructuredValue("null")).toBeNull();
    expect(normalizeStructuredValue("true")).toBe(true);
    expect(normalizeStructuredValue(" -12.5 ")).toBe(-12.5);
    expect(normalizeStructuredValue("hello")).toBe("hello");
    expect(normalizeStructuredValue("{broken")).toBe("{broken");
    expect(normalizeStructuredValue("")).toBe("");
    expect(normalizeStructuredValue(7)).toBe(7);
  });

  it("counts a from/to pair as one changed field", () => {
    expect(countChangedFields({ from: 1, to: 2 })).toBe(1);
    expect(countChangedFields({ name: { from: "a", to: "b" }, price: { from: 1, to: 2 } })).toBe(2);
    expect(countChangedFields('{"name":{"from":"a","to":"b"}}')).toBe(1);
  });

  it("counts nothing for an empty diff and one for a bare value", () => {
    expect(countChangedFields(null)).toBe(0);
    expect(countChangedFields(undefined)).toBe(0);
    expect(countChangedFields(5)).toBe(1);
    expect(countChangedFields("text")).toBe(1);
  });

  it("falls back to the number of entries when none of them is a diff", () => {
    expect(countChangedFields({ a: 1, b: 2 })).toBe(2);
    expect(countChangedFields([1, 2, 3])).toBe(3);
    expect(countChangedFields({})).toBe(0);
  });

  it("flattens a nested diff into labelled paths", () => {
    expect(
      flattenAuditDiff({
        itemName: { from: "A", to: "B" },
        prices: [{ rate: { from: 1, to: 2 } }],
      }),
    ).toEqual([
      { field: "Item Name", from: "A", to: "B" },
      { field: "Prices / Item 1 / Rate", from: 1, to: 2 },
    ]);
  });

  it("parses embedded JSON inside from and to", () => {
    expect(flattenAuditDiff({ flag: { from: "true", to: "false" } })).toEqual([
      { field: "Flag", from: true, to: false },
    ]);
  });

  it("names a top-level diff pair Value and reads bare leaves as new values", () => {
    expect(flattenAuditDiff({ from: 1, to: 2 })).toEqual([{ field: "Value", from: 1, to: 2 }]);
    expect(flattenAuditDiff({ note: "hi" })).toEqual([{ field: "Note", from: null, to: "hi" }]);
  });

  it("yields no rows for an empty or scalar-only diff", () => {
    expect(flattenAuditDiff(null)).toEqual([]);
    expect(flattenAuditDiff(undefined)).toEqual([]);
    expect(flattenAuditDiff("plain")).toEqual([]);
    expect(flattenAuditDiff({})).toEqual([]);
  });

  it("flattens a record snapshot, keeping empty containers and nulls visible", () => {
    expect(
      flattenAuditRecord({ itemName: "A", tags: [], extra: {}, gone: null, rows: [{ qty: 2 }] }),
    ).toEqual([
      { field: "Item Name", value: "A" },
      { field: "Tags", value: [] },
      { field: "Extra", value: {} },
      { field: "Gone", value: null },
      { field: "Rows / Item 1 / Qty", value: 2 },
    ]);
    expect(flattenAuditRecord(null)).toEqual([]);
    expect(flattenAuditRecord("plain")).toEqual([{ field: "Value", value: "plain" }]);
  });
});

describe("record history comparison rows", () => {
  it("lists changed fields first, then the rest of the original and modified records", () => {
    const rows = buildAuditComparisonRows(
      { name: "A", code: "X1" },
      { name: "B", code: "X1", extra: 1 },
      { name: { from: "A", to: "B" } },
    );
    expect(rows.map((row) => row.field)).toEqual(["Name", "Code", "Extra"]);
    expect(rows[0]).toEqual({
      field: "Name",
      original: "A",
      modified: "B",
      diff: { field: "Name", from: "A", to: "B" },
    });
    expect(rows[1].diff).toBeNull();
    expect(rows[2]).toMatchObject({ original: null, modified: 1, diff: null });
  });

  it("is empty when there is nothing to compare", () => {
    expect(buildAuditComparisonRows(null, null, null)).toEqual([]);
  });

  it("lists a field once even when all three sources carry it", () => {
    const rows = buildAuditComparisonRows({ a: 1 }, { a: 2 }, { a: { from: 1, to: 2 } });
    expect(rows).toHaveLength(1);
  });
});

describe("record history small labels", () => {
  it("shortens long text with an ellipsis at the limit", () => {
    expect(truncateValue("short")).toBe("short");
    expect(truncateValue("a".repeat(42))).toBe("a".repeat(42));
    expect(truncateValue("a".repeat(43))).toBe(`${"a".repeat(41)}…`);
    expect(truncateValue("abcdef", 4)).toBe("abc…");
  });

  it("shows a dash for blank text", () => {
    expect(truncateValue(null)).toBe("-");
    expect(truncateValue(undefined)).toBe("-");
    expect(truncateValue("   ")).toBe("-");
  });

  it("names the user by name, then id, then a dash", () => {
    expect(getRowUserLabel(makeLog({ log_user_name: " Asha ", log_user_id: "u1" }))).toBe("Asha");
    expect(getRowUserLabel(makeLog({ log_user_name: "  ", log_user_id: " u1 " }))).toBe("u1");
    expect(getRowUserLabel(makeLog())).toBe("-");
  });
});

describe("record history grouping", () => {
  it("gives every second within a minute the same key", () => {
    const a = getHistoryGroupKey(localIso(2026, 10, 15, 14, 5, 0, 0));
    const b = getHistoryGroupKey(localIso(2026, 10, 15, 14, 5, 59, 999));
    expect(a).toBe(b);
  });

  it("splits at the minute boundary", () => {
    const last = getHistoryGroupKey(localIso(2026, 10, 15, 14, 5, 59, 999));
    const next = getHistoryGroupKey(localIso(2026, 10, 15, 14, 6, 0, 0));
    expect(last).not.toBe(next);
  });

  it("keys an unreadable date by its own text", () => {
    expect(getHistoryGroupKey("garbage")).toBe("garbage");
  });

  it("labels sub-entities of a composite screen and strips Master elsewhere", () => {
    expect(resolveSubEntityLabel("Item Master", "Item Unit Conversion Master")).toBe(
      "Unit Conversion",
    );
    expect(resolveSubEntityLabel("Item Master", "Item EAN Code Master")).toBe("EAN Codes");
    expect(resolveSubEntityLabel("Item Master", "Item Price Master")).toBe("Price List");
    expect(resolveSubEntityLabel("Item Master", "Item Master")).toBe("Item");
    expect(resolveSubEntityLabel("Brand Master", "Brand Master")).toBe("Brand");
    expect(resolveSubEntityLabel("Item Master", "Some Other master")).toBe("Some Other");
    expect(resolveSubEntityLabel("Item Master", "")).toBe("Record");
    expect(resolveSubEntityLabel("Item Master", "Master")).toBe("Record");
  });

  it("prints diff rows with the modal's old and new text", () => {
    expect(
      buildModalDiffRows({ price: { from: null, to: 12 }, name: { from: "", to: "A" } }),
    ).toEqual([
      { field: "Price", old: "null", new: "12" },
      { field: "Name", old: '""', new: "A" },
    ]);
    expect(buildModalDiffRows(null)).toEqual([]);
  });

  it("folds the rows of one save into a single group", () => {
    const logs = [
      makeLog({
        log_id: "a",
        log_date: localIso(2026, 10, 15, 14, 5, 40),
        log_user_name: "Asha",
        log_changed_fields: { name: { from: "A", to: "B" } },
        log_notes: "  edited ",
      }),
      makeLog({
        log_id: "b",
        log_date: localIso(2026, 10, 15, 14, 5, 2),
        screen_name: "Item EAN Code Master",
        log_user_name: "Asha",
        log_changed_fields: {
          code: { from: "1", to: "2" },
          qty: { from: 1, to: 2 },
        },
      }),
    ];
    const groups = buildHistoryGroups(logs, "Item Master", badge);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      dateLabel: "15 Oct 2026",
      timeLabel: "02:05 PM",
      users: ["Asha"],
      actions: [{ label: "Update", badgeClass: "badge:update" }],
      sections: ["Item", "EAN Codes"],
      changeCount: 3,
    });
    expect(groups[0].entries.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(groups[0].entries[0]).toMatchObject({
      label: "Item",
      actionLabel: "Update",
      notes: "edited",
      diff: [{ field: "Name", old: "A", new: "B" }],
    });
  });

  it("starts a new group in the next minute and keeps the server's order", () => {
    const logs = [
      makeLog({ log_id: "new", log_date: localIso(2026, 10, 15, 14, 6, 0) }),
      makeLog({ log_id: "old", log_date: localIso(2026, 10, 15, 14, 5, 59, 999) }),
    ];
    const groups = buildHistoryGroups(logs, "Item Master", badge);
    expect(groups.map((group) => group.timeLabel)).toEqual(["02:06 PM", "02:05 PM"]);
  });

  it("lists each user, action and section once and skips users it cannot name", () => {
    const logs = [
      makeLog({ log_id: "1", log_user_name: "Asha", log_action: "insert" }),
      makeLog({ log_id: "2", log_user_name: "Ravi", log_action: "new" }),
      makeLog({ log_id: "3", log_user_name: "Asha", log_action: "approve" }),
      makeLog({ log_id: "4", log_action: "new" }),
    ];
    const [group] = buildHistoryGroups(logs, "Item Master", badge);
    expect(group.users).toEqual(["Asha", "Ravi"]);
    expect(group.actions.map((action) => action.label)).toEqual(["New", "Approve"]);
    expect(group.sections).toEqual(["Item"]);
    expect(group.entries).toHaveLength(4);
    expect(group.entries[3].notes).toBe("");
  });

  it("returns nothing for an empty history", () => {
    expect(buildHistoryGroups([], "Item Master", badge)).toEqual([]);
  });

  it("groups rows with an unreadable date by that text", () => {
    const logs = [
      makeLog({ log_id: "1", log_date: "garbage" }),
      makeLog({ log_id: "2", log_date: "garbage" }),
    ];
    const [group, ...rest] = buildHistoryGroups(logs, "Brand Master", badge);
    expect(rest).toEqual([]);
    expect(group).toMatchObject({ dateLabel: "garbage", timeLabel: "garbage" });
  });
});

describe("record history group paging", () => {
  function groupsOf(count: number): ModalHistoryGroup[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `g${i + 1}`,
      dateLabel: "",
      timeLabel: "",
      users: [],
      actions: [],
      sections: [],
      entries: [],
      changeCount: 0,
    }));
  }

  it("shows ten groups per page for a composite screen", () => {
    const result = pageHistoryGroups(groupsOf(25), 1, true, 99);
    expect(MODAL_GROUPS_PER_PAGE).toBe(10);
    expect(result.effectiveTotalPages).toBe(3);
    expect(result.startIndex).toBe(0);
    expect(result.displayGroups.map((g) => g.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => `g${i + 1}`),
    );
  });

  it("gives the last page only the groups that remain", () => {
    const result = pageHistoryGroups(groupsOf(25), 3, true, 99);
    expect(result.startIndex).toBe(20);
    expect(result.displayGroups.map((g) => g.id)).toEqual(["g21", "g22", "g23", "g24", "g25"]);
  });

  it("fills a page exactly at the boundary without an extra page", () => {
    expect(pageHistoryGroups(groupsOf(10), 1, true, 1).effectiveTotalPages).toBe(1);
    expect(pageHistoryGroups(groupsOf(11), 1, true, 1).effectiveTotalPages).toBe(2);
  });

  it("keeps one page when there are no groups", () => {
    const result = pageHistoryGroups([], 1, true, 1);
    expect(result.effectiveTotalPages).toBe(1);
    expect(result.displayGroups).toEqual([]);
  });

  it("leaves the server's page untouched for a plain master", () => {
    const groups = groupsOf(15);
    const result = pageHistoryGroups(groups, 2, false, 7);
    expect(result.effectiveTotalPages).toBe(7);
    expect(result.startIndex).toBe(0);
    expect(result.displayGroups).toBe(groups);
  });
});
