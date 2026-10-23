import { describe, expect, it } from "vitest";
import type { ERPDynamicModalField } from "@/components/design-system/ui/dynamic-modal-form";
import type { MasterTableRow } from "@/components/master/crud-master-page.types";
import type {
  ResolvedFieldConfig,
  WidgetMasterSectionConfig,
} from "@/features/masters/shared/widget-config";
import {
  ITEM_BASE_UNIT_CHANGED_MESSAGE,
  ITEM_BASE_UNIT_NOT_LAST_MESSAGE,
  ITEM_BASE_UNIT_REMOVAL_MESSAGE,
  ITEM_BASE_UNIT_REPICK_MESSAGE,
  ITEM_DEFAULT_EAN_ACTIVE_FIELD,
  ITEM_DEFAULT_EAN_ID_FIELD,
  ITEM_DEFAULT_EAN_UNIT_FIELD,
  ITEM_LOCKED_BASE_UNIT_FIELD,
  ITEM_LOCKED_BASE_WAS_LAST_FIELD,
  ITEM_SAVED_ROW_REMOVAL_MESSAGE,
  applyItemUnitConversionBaseRules,
  buildItemBaseUnitLockValues,
  buildItemDefaultEanValues,
  buildItemEanPayload,
  collectItemTabHeadingsWithRequiredFields,
  detachItemFormValuesAsCopy,
  findRemovedLinkedRowIndex,
  foldItemSectionVisibility,
  hasTypedItemEntries,
  itemListRowTarget,
  readItemBaseUnitLock,
  refuseSavedLinkedRowRemoval,
  resolveItemHiddenSectionFieldNames,
  splitItemDefaultEanRow,
  validateItemDefaultBarcodeAgainstGrid,
  validateItemHsnCode,
  validateItemNotes,
  validateItemReorderLevels,
  validateItemUnitConversionLadder,
  type ItemBaseUnitLock,
} from "./item-card-rules";
import { applyItemWidgetFieldConfig, resolveHiddenItemTabHeadings } from "./item-master-page";
import {
  ITEM_EAN_ROWS_FIELD_NAME,
  ITEM_PRICE_ROWS_FIELD_NAME,
  ITEM_REORDER_ROWS_FIELD_NAME,
  ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME,
} from "./item-master-page.constants";
import type { LinkedRecordRow } from "./item-linked-records-editor.shared";

const NEW_ITEM: ItemBaseUnitLock = { lockedBaseUnitId: "", baseWasLast: true };
const SAVED_ITEM: ItemBaseUnitLock = { lockedBaseUnitId: "u-pcs", baseWasLast: true };

/** A Unit Conversion grid row; the trailing placeholder is `unit("")`. */
function unit(
  unitId: string,
  flags: { base?: boolean; def?: boolean; factor?: string; id?: string } = {},
): LinkedRecordRow {
  return {
    iuc_id: flags.id ?? "",
    iuc_unit_id: unitId,
    iuc_unit_factor: flags.factor ?? "1",
    iuc_is_base_unit: flags.base ? "true" : "false",
    iuc_is_default_unit: flags.def ? "true" : "false",
  };
}

/** "BOX^ 1 | PCS* 10 | _" — * base, ^ default, _ the placeholder (the Qt test's notation). */
function grid(rows: readonly LinkedRecordRow[]): string {
  return rows
    .map((row) =>
      row.iuc_unit_id
        ? `${row.iuc_unit_id}${row.iuc_is_base_unit === "true" ? "*" : ""}${row.iuc_is_default_unit === "true" ? "^" : ""} ${row.iuc_unit_factor}`
        : "_",
    )
    .join(" | ");
}

describe("plain field checks (Qt cb8fe0a)", () => {
  it("refuses notes over 250 characters, with the count", () => {
    expect(validateItemNotes("x".repeat(250))).toBeNull();
    expect(validateItemNotes("x".repeat(251))).toBe(
      "Notes can hold 250 characters; this has 251. Shorten it.",
    );
  });

  it("takes an HSN of digits only, at most 8", () => {
    expect(validateItemHsnCode("", 0)).toBeNull();
    expect(validateItemHsnCode("17019910", 0)).toBeNull();
    expect(validateItemHsnCode("170199101", 0)).toBe("HSN Code must be digits only, at most 8.");
    expect(validateItemHsnCode("17A1", 0)).toBe("HSN Code must be digits only, at most 8.");
    expect(validateItemHsnCode("17", 4)).toBe("HSN Code must be at least 4 digits.");
  });
});

describe("removing grid rows (Qt 4ae6575)", () => {
  const a = { ir_id: "r1", ir_unit_id: "u1" };
  const b = { ir_id: "", ir_unit_id: "u2" };
  const blank = { ir_id: "", ir_unit_id: "" };

  it("finds the one row taken out, and nothing for an edit", () => {
    expect(findRemovedLinkedRowIndex([a, b, blank], [a, blank])).toBe(1);
    expect(findRemovedLinkedRowIndex([a, b, blank], [b, blank])).toBe(0);
    expect(findRemovedLinkedRowIndex([a, b], [{ ...a, ir_unit_id: "x" }, b])).toBe(-1);
    expect(findRemovedLinkedRowIndex([a, b, blank], [{ ...a, ir_unit_id: "x" }, blank])).toBe(-1);
  });

  it("refuses to remove a saved row, lets a new one go", () => {
    expect(refuseSavedLinkedRowRemoval([a, b, blank], [b, blank], "ir_id")).toBe(
      ITEM_SAVED_ROW_REMOVAL_MESSAGE,
    );
    expect(refuseSavedLinkedRowRemoval([a, b, blank], [a, blank], "ir_id")).toBeNull();
  });
});

describe("the base unit on a NEW item follows the last row (Qt test_item_base_unit)", () => {
  it("walks BOX → PCS → GM and back", () => {
    // First unit: the seeded row is already base + default.
    let previous = [unit("", { base: true, def: true })];
    let result = applyItemUnitConversionBaseRules(
      previous,
      [unit("BOX", { base: true, def: true }), unit("")],
      NEW_ITEM,
    );
    expect(grid(result.rows)).toBe("BOX*^ 1 | _");

    previous = result.rows;
    result = applyItemUnitConversionBaseRules(
      previous,
      [previous[0]!, unit("PCS", { factor: "10" }), unit("")],
      NEW_ITEM,
    );
    expect(grid(result.rows)).toBe("BOX^ 1 | PCS* 10 | _");

    previous = result.rows;
    result = applyItemUnitConversionBaseRules(
      previous,
      [previous[0]!, previous[1]!, unit("GM"), unit("")],
      NEW_ITEM,
    );
    expect(grid(result.rows)).toBe("BOX^ 1 | PCS 10 | GM* 1 | _");

    previous = result.rows;
    result = applyItemUnitConversionBaseRules(
      previous,
      [previous[0]!, previous[1]!, previous[3]!],
      NEW_ITEM,
    );
    expect(grid(result.rows)).toBe("BOX^ 1 | PCS* 10 | _");
    expect(result.refusal).toBeNull();
  });

  it("takes the default along only when it went with the removed base", () => {
    const previous = [unit("BOX"), unit("PCS", { base: true, def: true, factor: "10" }), unit("")];
    const result = applyItemUnitConversionBaseRules(previous, [previous[0]!, previous[2]!], NEW_ITEM);
    expect(grid(result.rows)).toBe("BOX*^ 1 | _");
  });

  it("leaves a re-pick of a middle unit alone", () => {
    const previous = [unit("BOX", { def: true }), unit("PCS", { base: true }), unit("")];
    const result = applyItemUnitConversionBaseRules(
      previous,
      [unit("CTN", { def: true }), previous[1]!, previous[2]!],
      NEW_ITEM,
    );
    expect(grid(result.rows)).toBe("CTN^ 1 | PCS* 1 | _");
  });
});

describe("the base unit on a SAVED item is locked (Qt test_item_base_unit)", () => {
  const saved = [
    unit("u-box", { def: true, id: "c1" }),
    unit("u-pcs", { base: true, factor: "12", id: "c2" }),
    unit(""),
  ];

  it("puts a new unit straight above the base, factor blank", () => {
    const result = applyItemUnitConversionBaseRules(
      saved,
      [saved[0]!, saved[1]!, unit("u-test"), unit("")],
      SAVED_ITEM,
    );
    expect(grid(result.rows)).toBe("u-box^ 1 | u-test  | u-pcs* 12 | _");
    // A second new unit lands between the first one and the base.
    const second = applyItemUnitConversionBaseRules(
      result.rows,
      [...result.rows.slice(0, 3), unit("u-test2"), unit("")],
      SAVED_ITEM,
    );
    expect(grid(second.rows)).toBe("u-box^ 1 | u-test  | u-test2  | u-pcs* 12 | _");
  });

  it("makes a new unit the biggest (factor 1) when the base was the only one", () => {
    const only = [unit("u-pcs", { base: true, def: true, id: "c2" }), unit("")];
    const result = applyItemUnitConversionBaseRules(only, [only[0]!, unit("u-box"), unit("")], SAVED_ITEM);
    expect(grid(result.rows)).toBe("u-box 1 | u-pcs*^  | _");
  });

  it("refuses to remove the base, or any saved row", () => {
    const removeBase = applyItemUnitConversionBaseRules(saved, [saved[0]!, saved[2]!], SAVED_ITEM);
    expect(removeBase.refusal).toBe(ITEM_SAVED_ROW_REMOVAL_MESSAGE);
    expect(removeBase.rows).toEqual(saved);
    // A base row with no stored id (cannot happen today) still meets the lock.
    const unsavedBase = [unit("u-box", { def: true }), unit("u-pcs", { base: true }), unit("")];
    expect(
      applyItemUnitConversionBaseRules(unsavedBase, [unsavedBase[0]!, unsavedBase[2]!], SAVED_ITEM).refusal,
    ).toBe(ITEM_BASE_UNIT_REMOVAL_MESSAGE);
  });

  it("refuses a re-pick of the base row's unit", () => {
    const result = applyItemUnitConversionBaseRules(
      saved,
      [saved[0]!, { ...saved[1]!, iuc_unit_id: "u-other" }, saved[2]!],
      SAVED_ITEM,
    );
    expect(result.refusal).toBe(ITEM_BASE_UNIT_REPICK_MESSAGE);
    expect(result.rows).toEqual(saved);
  });

  it("reads the lock from the loaded item", () => {
    const lockValues = buildItemBaseUnitLockValues([
      { iuc_unit_id: "u-box", iuc_is_base_unit: false },
      { iuc_unit_id: "u-pcs", iuc_is_base_unit: true },
    ]);
    expect(lockValues).toEqual({
      [ITEM_LOCKED_BASE_UNIT_FIELD]: "u-pcs",
      [ITEM_LOCKED_BASE_WAS_LAST_FIELD]: "true",
    });
    expect(readItemBaseUnitLock(lockValues)).toEqual(SAVED_ITEM);
    expect(readItemBaseUnitLock({})).toEqual(NEW_ITEM);
    expect(buildItemBaseUnitLockValues([{ iuc_unit_id: "u-pcs", iuc_is_base_unit: false }])).toEqual({
      [ITEM_LOCKED_BASE_UNIT_FIELD]: "",
      [ITEM_LOCKED_BASE_WAS_LAST_FIELD]: "",
    });
  });
});

describe("the unit ladder at save (Qt validateForm)", () => {
  const name = (id: string) => id.toUpperCase();
  const factor = (row: LinkedRecordRow) => Number(row.iuc_unit_factor);

  it("refuses a factor below 1 under the first row, naming both units", () => {
    expect(
      validateItemUnitConversionLadder(
        [unit("box", { def: true }), unit("pcs", { base: true, factor: "0.5" })],
        NEW_ITEM,
        name,
        factor,
      ),
    ).toBe(
      "Row 2's factor is how many PCS make one BOX, so it cannot be less than 1.\n\n" +
        "Enter units from the biggest to the smallest.",
    );
  });

  it("wants the base last, except on an older item stored otherwise", () => {
    const baseFirst = [unit("u-pcs", { base: true, def: true }), unit("u-box", { factor: "10" })];
    expect(validateItemUnitConversionLadder(baseFirst, NEW_ITEM, name, factor)).toBe(
      ITEM_BASE_UNIT_NOT_LAST_MESSAGE,
    );
    expect(
      validateItemUnitConversionLadder(
        baseFirst,
        { lockedBaseUnitId: "u-pcs", baseWasLast: false },
        name,
        factor,
      ),
    ).toBeNull();
  });

  it("refuses a saved item whose base unit changed", () => {
    expect(
      validateItemUnitConversionLadder(
        [unit("u-box", { def: true }), unit("u-other", { base: true, factor: "10" })],
        SAVED_ITEM,
        name,
        factor,
      ),
    ).toBe(ITEM_BASE_UNIT_CHANGED_MESSAGE);
  });
});

describe("reorder levels (Qt cb8fe0a / reorder delegate)", () => {
  const row = (min: string, max: string, level: string, qty = "") => ({
    ir_min_level: min,
    ir_max_level: max,
    ir_reorder_level: level,
    ir_reorder_qty: qty,
  });

  it("takes a level between min and max, and a 0 max as no ceiling", () => {
    expect(validateItemReorderLevels([row("2", "10", "5")])).toBeNull();
    expect(validateItemReorderLevels([row("2", "", "50")])).toBeNull();
    expect(validateItemReorderLevels([row("", "", "")])).toBeNull();
  });

  it("refuses min above max, a level outside them, and negative or non-numeric amounts", () => {
    expect(validateItemReorderLevels([row("12", "10", "")])).toBe(
      "Reorder row 1: the minimum level is above the maximum.",
    );
    expect(validateItemReorderLevels([row("2", "10", "1")])).toBe(
      "Reorder row 1: the reorder level must lie between the minimum and the maximum.",
    );
    expect(validateItemReorderLevels([row("2", "10", "11")])).toBe(
      "Reorder row 1: the reorder level must lie between the minimum and the maximum.",
    );
    expect(validateItemReorderLevels([row("2", "10", "5", "-1")])).toBe(
      "Reorder row 1: Reorder Qty cannot be negative.",
    );
    expect(validateItemReorderLevels([row("abc", "", "")])).toBe(
      "Reorder row 1: Min Level must be a number.",
    );
  });
});

describe("the Default Barcode field is the default EAN row (Qt test_item_default_barcode)", () => {
  const stored = [
    { ean_id: "e2", ean_code: "34343", ean_unit_id: "u-box", ean_is_default: false, ean_is_active: true },
    { ean_id: "e1", ean_code: "343", ean_unit_id: "u-pcs", ean_is_default: true, ean_is_active: true },
  ];
  const units = new Set(["u-box", "u-pcs"]);
  const extras = [{ ean_id: "e2", ean_code: "34343", ean_unit_id: "u-box", ean_is_active: "true" }];

  it("takes the default row out of the grid, or the legacy copy's row", () => {
    const split = splitItemDefaultEanRow(stored, "stale-copy");
    expect(split.defaultRow?.ean_code).toBe("343");
    expect(split.extras.map((row) => row.ean_code)).toEqual(["34343"]);
    const legacy = splitItemDefaultEanRow(
      [{ ean_code: "123" }, { ean_code: "AbC" }],
      "abc",
    );
    expect(legacy.defaultRow?.ean_code).toBe("AbC");
    expect(splitItemDefaultEanRow([{ ean_code: "123" }], "").defaultRow).toBeNull();
  });

  it("saves the field first, as the stored default row, and the grid as extras", () => {
    const values = {
      item_default_barcode: "3430",
      ...buildItemDefaultEanValues(stored[1]!),
    };
    const payload = buildItemEanPayload({
      itemId: "i1",
      values,
      gridRows: extras,
      itemUnitIds: units,
      baseUnitId: "u-pcs",
    });
    expect(payload.defaultBarcode).toBe("3430");
    expect(payload.rows).toMatchObject([
      { ean_id: "e1", ean_sl_no: 1, ean_code: "3430", ean_unit_id: "u-pcs", ean_is_default: true },
      { ean_id: "e2", ean_sl_no: 2, ean_code: "34343", ean_is_default: false },
    ]);
  });

  it("makes the first grid row the default when the field is cleared", () => {
    const payload = buildItemEanPayload({
      itemId: "i1",
      values: { item_default_barcode: "", [ITEM_DEFAULT_EAN_ID_FIELD]: "e1" },
      gridRows: extras,
      itemUnitIds: units,
      baseUnitId: "u-pcs",
    });
    expect(payload.rows).toHaveLength(1);
    expect(payload.rows[0]).toMatchObject({ ean_id: "e2", ean_sl_no: 1, ean_is_default: true });
    expect(payload.defaultBarcode).toBe("34343");
  });

  it("puts a new default barcode on the base unit, and a stored one whose unit left too", () => {
    const fresh = buildItemEanPayload({
      itemId: "",
      values: { item_default_barcode: "ZT-0001" },
      gridRows: [],
      itemUnitIds: units,
      baseUnitId: "u-pcs",
    });
    expect(fresh.rows).toEqual([
      expect.objectContaining({ ean_code: "ZT-0001", ean_unit_id: "u-pcs", ean_is_default: true }),
    ]);
    expect(fresh.rows[0]).not.toHaveProperty("ean_id");
    const unitGone = buildItemEanPayload({
      itemId: "i1",
      values: {
        item_default_barcode: "343",
        [ITEM_DEFAULT_EAN_ID_FIELD]: "e1",
        [ITEM_DEFAULT_EAN_UNIT_FIELD]: "u-removed",
        [ITEM_DEFAULT_EAN_ACTIVE_FIELD]: "false",
      },
      gridRows: [],
      itemUnitIds: units,
      baseUnitId: "u-pcs",
    });
    expect(unitGone.rows[0]).toMatchObject({ ean_unit_id: "u-pcs", ean_is_active: false });
    expect(buildItemEanPayload({ itemId: "", values: {}, gridRows: [], itemUnitIds: units, baseUnitId: "" }))
      .toEqual({ rows: [], defaultBarcode: null });
  });

  it("refuses the field's code repeated in the grid", () => {
    expect(validateItemDefaultBarcodeAgainstGrid("34343", extras)).toBe(
      "Barcode 34343 is already the item's main barcode (Default Barcode field). Remove it from the barcodes list.",
    );
    expect(validateItemDefaultBarcodeAgainstGrid("343", extras)).toBeNull();
    expect(validateItemDefaultBarcodeAgainstGrid("", extras)).toBeNull();
  });
});

describe("Copy from Item (Qt test_item_copy)", () => {
  const loaded: Record<string, string> = {
    item_name_en: "BISCUIT",
    item_code: "B-01",
    item_default_barcode: "8901",
    item_image_url: "https://example.invalid/b.png",
    item_packing_item_ids: "p1",
    item_group_id: "g1",
    [ITEM_LOCKED_BASE_UNIT_FIELD]: "u-pcs",
    [ITEM_DEFAULT_EAN_ID_FIELD]: "e1",
    [ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME]: JSON.stringify([{ iuc_id: "c1", iuc_unit_id: "u-pcs" }]),
    [ITEM_PRICE_ROWS_FIELD_NAME]: JSON.stringify([{ ipm_id: "p1", ipm_unit_id: "u-pcs", ipm_sales_price_a: "10" }]),
    [ITEM_REORDER_ROWS_FIELD_NAME]: JSON.stringify([{ ir_id: "r1", ir_unit_id: "u-pcs" }]),
    [ITEM_EAN_ROWS_FIELD_NAME]: JSON.stringify([{ ean_id: "e2", ean_code: "777" }]),
  };

  it("keeps everything but the ids, code, barcodes, image and kit items", () => {
    const copy = detachItemFormValuesAsCopy(loaded);
    expect(copy.item_name_en).toBe("BISCUIT");
    expect(copy.item_group_id).toBe("g1");
    expect(copy.item_code).toBe("");
    expect(copy.item_default_barcode).toBe("");
    expect(copy.item_image_url).toBe("");
    expect(copy.item_packing_item_ids).toBe("");
    expect(copy[ITEM_EAN_ROWS_FIELD_NAME]).toBe("");
    expect(copy[ITEM_LOCKED_BASE_UNIT_FIELD]).toBe("");
    expect(copy[ITEM_DEFAULT_EAN_ID_FIELD]).toBe("");
    expect(JSON.parse(copy[ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME]!)).toEqual([{ iuc_id: "", iuc_unit_id: "u-pcs" }]);
    expect(JSON.parse(copy[ITEM_PRICE_ROWS_FIELD_NAME]!)[0]).toMatchObject({ ipm_id: "", ipm_sales_price_a: "10" });
    expect(JSON.parse(copy[ITEM_REORDER_ROWS_FIELD_NAME]!)).toEqual([{ ir_id: "", ir_unit_id: "u-pcs" }]);
  });

  it("asks first only when something was typed", () => {
    expect(hasTypedItemEntries({ item_name_en: "", [ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME]: "" })).toBe(false);
    expect(
      hasTypedItemEntries({
        [ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME]: JSON.stringify([{ iuc_unit_id: "", iuc_is_base_unit: "true" }]),
      }),
    ).toBe(false);
    expect(hasTypedItemEntries({ item_name_en: "Sugar" })).toBe(true);
    expect(
      hasTypedItemEntries({ [ITEM_UNIT_CONVERSION_ROWS_FIELD_NAME]: JSON.stringify([{ iuc_unit_id: "u1" }]) }),
    ).toBe(true);
  });
});

describe("Item Master list → Qty-wise Price (Qt test_item_list_qtyprice)", () => {
  const row = (source: Record<string, unknown> | null, recordId: string, masterName = ""): MasterTableRow => ({
    __rowId: recordId,
    __recordId: recordId,
    __source: source,
    serialNo: 1,
    masterId: recordId,
    masterCode: "",
    masterName,
    masterShort: "",
    masterAlias: "",
    masterDescription: "",
    masterActive: "",
    position: "",
  });

  it("opens on the selected item's id and name", () => {
    expect(itemListRowTarget(row({ item_id: "i-1", item_name_en: "SUGAR" }, "i-1"))).toEqual({
      itemId: "i-1",
      itemName: "SUGAR",
    });
    expect(itemListRowTarget(row(null, "i-2", "SALT"))).toEqual({ itemId: "i-2", itemName: "SALT" });
    expect(itemListRowTarget(null)).toBeNull();
  });
});

describe("widget config (Qt test_item_widget_config)", () => {
  function section(sectionId: number, fieldNames: string[], sectionVisibility = true): WidgetMasterSectionConfig {
    return {
      sectionId,
      sectionMenuId: 29,
      sectionName: `S${sectionId}`,
      sectionGuiName: `S${sectionId}`,
      sectionPosition: sectionId,
      sectionVisibility,
      sectionPlatform: "Web",
      fields: fieldNames.map((fieldName, index) => ({
        fieldId: sectionId * 100 + index,
        fieldSectionId: sectionId,
        fieldName,
        fieldGuiName: fieldName,
        fieldSecondaryText: "",
        fieldPosition: index,
        fieldVisibility: true,
      })),
    };
  }

  it("turns off every field of a switched-off section, the popup's toggle winning", () => {
    const sections = [section(69, ["Item Name", "Alias"], false), section(70, ["Allow Sales"])];
    expect([...resolveItemHiddenSectionFieldNames(sections, new Map())]).toEqual(["item name", "alias"]);
    expect([...resolveItemHiddenSectionFieldNames(sections, new Map([[69, true], [70, false]]))]).toEqual([
      "allow sales",
    ]);
    const folded = foldItemSectionVisibility(
      new Map<string, ResolvedFieldConfig>([["alias", { label: "Alias", order: 3, visible: true }]]),
      new Set(["alias", "item name"]),
    );
    expect(folded.get("alias")).toEqual({ label: "Alias", order: 3, visible: false });
    expect(folded.get("item name")?.visible).toBe(false);
  });

  it("never hides a required field, and keeps the tab holding one", () => {
    const fields: ERPDynamicModalField[] = [
      { name: "itemHeadingCore", label: "Core Details", type: "heading" },
      { name: "item_name_en", label: "Item Name", required: true },
      { name: "item_alias", label: "Alias" },
      { name: "itemHeadingInventory", label: "Inventory & Notes", type: "heading" },
      { name: "item_notes", label: "Notes" },
    ];
    const config = new Map<string, ResolvedFieldConfig>([
      ["item name", { label: "Item Name", order: 1, visible: false }],
      ["alias", { label: "Alias", order: 2, visible: false }],
    ]);
    const shown = applyItemWidgetFieldConfig(fields, config, {
      item_name_en: "Item Name",
      item_alias: "Alias",
    }).map((field) => field.name);
    expect(shown).toContain("item_name_en");
    expect(shown).not.toContain("item_alias");

    const kept = collectItemTabHeadingsWithRequiredFields(fields);
    expect([...kept]).toEqual(["itemHeadingCore"]);
    const offSections = [
      section(69, ["Item Name", "Item Code", "Company"], false),
      section(71, ["Storage Location", "Notes"], false),
    ];
    expect([...resolveHiddenItemTabHeadings(offSections, new Map(), kept)]).toEqual(["itemHeadingInventory"]);
  });
});
