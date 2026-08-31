import { describe, expect, it } from "vitest";
import type { WidgetMasterSectionConfig } from "@/features/masters/shared/widget-config";
import type { ERPDynamicModalField } from "@/components/design-system/ui/dynamic-modal-form";
import {
  applyItemWidgetFieldConfig,
  dropHiddenItemFormTabs,
  resolveHiddenItemTabHeadings,
} from "./item-master-page";
import {
  ITEM_CORE_TAB_HEADING_FIELD_NAME,
  ITEM_EAN_TABLE_TAB_HEADING_FIELD_NAME,
  ITEM_INVENTORY_TAB_HEADING_FIELD_NAME,
} from "./item-master-page.constants";

function section(
  sectionId: number,
  sectionName: string,
  fieldNames: string[],
  sectionVisibility = true,
): WidgetMasterSectionConfig {
  return {
    sectionId,
    sectionMenuId: 29,
    sectionName,
    sectionGuiName: sectionName,
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

// A current deployment: menu 29 authored in the widget-master admin UI as one
// section per form tab, fields named by their LABEL.
function currentConfigSections(
  visibility: { core?: boolean; ean?: boolean; inventory?: boolean } = {},
): WidgetMasterSectionConfig[] {
  return [
    section(69, "Item Master-Core", ["Item Name", "Item Code", "Company"], visibility.core ?? true),
    section(70, "Item Master-Ean Table", ["Allow Sales", "Expiry Days"], visibility.ean ?? true),
    section(
      71,
      "Item Master-Inventory&Notes",
      ["Storage Location", "Notes"],
      visibility.inventory ?? true,
    ),
  ];
}

describe("resolveHiddenItemTabHeadings", () => {
  it("hides the tab whose section is switched off", () => {
    expect([
      ...resolveHiddenItemTabHeadings(currentConfigSections({ ean: false }), new Map()),
    ]).toEqual([ITEM_EAN_TABLE_TAB_HEADING_FIELD_NAME]);
  });

  it("hides the Core Details tab when its section is switched off", () => {
    expect([
      ...resolveHiddenItemTabHeadings(currentConfigSections({ core: false }), new Map()),
    ]).toEqual([ITEM_CORE_TAB_HEADING_FIELD_NAME]);
  });

  it("hides nothing while every section is on", () => {
    expect(resolveHiddenItemTabHeadings(currentConfigSections(), new Map()).size).toBe(0);
  });

  it("lets an unsaved popup toggle win over the fetched section visibility", () => {
    const sections = currentConfigSections();
    const overrides = new Map([[71, false]]);
    expect([...resolveHiddenItemTabHeadings(sections, overrides)]).toEqual([
      ITEM_INVENTORY_TAB_HEADING_FIELD_NAME,
    ]);
  });

  it("keeps a tab that a second, still-visible section also feeds", () => {
    // The legacy seed splits the Core Details tab across sections 55 and 56.
    const sections = [
      section(55, "Core Details", ["item_name", "item_code"], false),
      section(56, "Reference Links", ["item_company", "item_group"], true),
    ];
    expect(resolveHiddenItemTabHeadings(sections, new Map()).size).toBe(0);
    const bothOff = [sections[0], section(56, "Reference Links", ["item_company"], false)];
    expect([...resolveHiddenItemTabHeadings(bothOff, new Map())]).toEqual([
      ITEM_CORE_TAB_HEADING_FIELD_NAME,
    ]);
  });

  it("ignores a section that configures nothing on this form", () => {
    const sections = [
      ...currentConfigSections(),
      section(99, "Desktop Only", ["Some Other Screen Field"], false),
    ];
    expect(resolveHiddenItemTabHeadings(sections, new Map()).size).toBe(0);
  });

  it("hides every tab when every section is switched off", () => {
    const sections = currentConfigSections({ core: false, ean: false, inventory: false });
    expect([...resolveHiddenItemTabHeadings(sections, new Map())].sort()).toEqual(
      [
        ITEM_CORE_TAB_HEADING_FIELD_NAME,
        ITEM_EAN_TABLE_TAB_HEADING_FIELD_NAME,
        ITEM_INVENTORY_TAB_HEADING_FIELD_NAME,
      ].sort(),
    );
  });

  it("hides nothing without a config", () => {
    expect(resolveHiddenItemTabHeadings([], new Map()).size).toBe(0);
  });
});

describe("dropHiddenItemFormTabs", () => {
  const fields: ERPDynamicModalField[] = [
    { name: ITEM_CORE_TAB_HEADING_FIELD_NAME, label: "Core Details", type: "heading" },
    { name: "item_name_en", label: "Item Name" },
    { name: ITEM_EAN_TABLE_TAB_HEADING_FIELD_NAME, label: "EAN Table", type: "heading" },
    { name: "itemEanRows", label: "", type: "custom" },
    { name: "item_allow_sales", label: "Allow Sales", type: "checkbox" },
    { name: ITEM_INVENTORY_TAB_HEADING_FIELD_NAME, label: "Inventory & Notes", type: "heading" },
    { name: "item_notes", label: "Notes" },
  ];

  it("drops the heading and everything under it, linked tables included", () => {
    expect(
      dropHiddenItemFormTabs(fields, new Set([ITEM_EAN_TABLE_TAB_HEADING_FIELD_NAME])).map(
        (field) => field.name,
      ),
    ).toEqual([
      ITEM_CORE_TAB_HEADING_FIELD_NAME,
      "item_name_en",
      ITEM_INVENTORY_TAB_HEADING_FIELD_NAME,
      "item_notes",
    ]);
  });

  it("takes the first tab away whole, leaving the form on the next one", () => {
    const hidden = resolveHiddenItemTabHeadings(currentConfigSections({ core: false }), new Map());
    expect(dropHiddenItemFormTabs(fields, hidden).map((field) => field.name)).toEqual([
      ITEM_EAN_TABLE_TAB_HEADING_FIELD_NAME,
      "itemEanRows",
      "item_allow_sales",
      ITEM_INVENTORY_TAB_HEADING_FIELD_NAME,
      "item_notes",
    ]);
  });

  it("empties the form when every section is switched off", () => {
    const hidden = resolveHiddenItemTabHeadings(
      currentConfigSections({ core: false, ean: false, inventory: false }),
      new Map(),
    );
    expect(dropHiddenItemFormTabs(fields, hidden)).toEqual([]);
  });

  it("returns the fields untouched when no tab is hidden", () => {
    expect(dropHiddenItemFormTabs(fields, new Set())).toBe(fields);
  });
});

describe("applyItemWidgetFieldConfig", () => {
  // Core Details tab: one own field, then the banded "Reference Links" group;
  // then the Inventory & Notes tab with one field.
  const fields: ERPDynamicModalField[] = [
    { name: ITEM_CORE_TAB_HEADING_FIELD_NAME, label: "Core Details", type: "heading" },
    { name: "item_name_en", label: "Item Name" },
    {
      name: "itemInlineReferenceLinksHeading",
      label: "",
      type: "custom",
      render: () => null,
    },
    { name: "item_company_id", label: "Company" },
    { name: "item_branch_id", label: "Branch" },
    { name: ITEM_INVENTORY_TAB_HEADING_FIELD_NAME, label: "Inventory & Notes", type: "heading" },
    { name: "item_notes", label: "Notes" },
  ];
  const fieldNameByFormField: Record<string, string> = {
    item_name_en: "Item Name",
    item_company_id: "Company",
    item_branch_id: "Branch",
    item_notes: "Notes",
  };
  function config(hidden: string[]) {
    return new Map(
      Object.values(fieldNameByFormField).map((backendName, order) => [
        backendName.toLowerCase(),
        { label: backendName, order, visible: !hidden.includes(backendName) },
      ]),
    );
  }
  const namesAfter = (hidden: string[]) =>
    applyItemWidgetFieldConfig(fields, config(hidden), fieldNameByFormField).map(
      (field) => field.name,
    );

  it("drops a group title once every field under it is hidden", () => {
    expect(namesAfter(["Company", "Branch"])).toEqual([
      ITEM_CORE_TAB_HEADING_FIELD_NAME,
      "item_name_en",
      ITEM_INVENTORY_TAB_HEADING_FIELD_NAME,
      "item_notes",
    ]);
  });

  it("keeps a group title while one field under it is still visible", () => {
    expect(namesAfter(["Branch"])).toContain("itemInlineReferenceLinksHeading");
  });

  it("drops a tab heading once the whole tab is empty", () => {
    expect(namesAfter(["Notes"])).not.toContain(ITEM_INVENTORY_TAB_HEADING_FIELD_NAME);
    expect(namesAfter(["Item Name", "Company", "Branch"])).toEqual([
      ITEM_INVENTORY_TAB_HEADING_FIELD_NAME,
      "item_notes",
    ]);
  });

  it("keeps a tab heading whose own fields are hidden but whose group survives", () => {
    expect(namesAfter(["Item Name"])).toEqual([
      ITEM_CORE_TAB_HEADING_FIELD_NAME,
      "itemInlineReferenceLinksHeading",
      "item_company_id",
      "item_branch_id",
      ITEM_INVENTORY_TAB_HEADING_FIELD_NAME,
      "item_notes",
    ]);
  });

  it("is a no-op without a config", () => {
    expect(applyItemWidgetFieldConfig(fields, new Map(), fieldNameByFormField)).toBe(fields);
  });
});
