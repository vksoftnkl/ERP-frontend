import { describe, expect, it } from "vitest";
import type { ERPDynamicModalField } from "@/components/design-system/ui/dynamic-modal-form";
import {
  qualifyRegionalSectionFieldNames,
  type WidgetMasterFieldConfig,
  type WidgetMasterSectionConfig,
} from "./widget-config";
import {
  applyCustomerWidgetConfig,
  buildCustomerWidgetFieldConfigFromSections,
} from "@/features/masters/sales/customer/widget-config";

let nextFieldId = 1;
const field = (fieldName: string, fieldVisibility = true): WidgetMasterFieldConfig => ({
  fieldId: nextFieldId++,
  fieldSectionId: 0,
  fieldName,
  fieldGuiName: fieldName,
  fieldSecondaryText: "",
  fieldPosition: nextFieldId,
  fieldVisibility,
});
const section = (
  sectionId: number,
  sectionName: string,
  sectionGuiName: string,
  fields: WidgetMasterFieldConfig[],
): WidgetMasterSectionConfig => ({
  sectionId,
  sectionMenuId: 10,
  sectionName,
  sectionGuiName,
  sectionPosition: sectionId,
  sectionVisibility: true,
  sectionPlatform: "Web",
  fields,
});

// A Customer config authored in the widget-master admin UI without the regional
// rename: both tabs name their address fields "Address 1" … "Country".
const unqualifiedSections = (regionalAddr1Visible: boolean) => [
  section(66, "Customer-identify", "Identify", [field("Customer Name"), field("Address 1")]),
  section(68, "Customers-Regional details", "Regional Details", [
    field("Regional Name"),
    field("Address 1", regionalAddr1Visible),
    field("Country", false),
  ]),
];

const customerFields: ERPDynamicModalField[] = [
  { name: "identity", label: "Identity", type: "heading" },
  { name: "cusName", label: "Customer Name" },
  { name: "cusAddr1", label: "Address 1" },
  { name: "regional", label: "Regional Details", type: "heading" },
  { name: "cusRegionName", label: "Regional Name" },
  { name: "cusRegionAddr1", label: "Address 1" },
  { name: "cusRegionCountry", label: "Country" },
] as ERPDynamicModalField[];

const renderedNames = (sections: WidgetMasterSectionConfig[]) =>
  applyCustomerWidgetConfig(customerFields, buildCustomerWidgetFieldConfigFromSections(sections)).map(
    (entry) => entry.name,
  );

describe("qualifyRegionalSectionFieldNames", () => {
  it("prefixes the regional section's unqualified names and leaves qualified ones", () => {
    const [identity, regional] = qualifyRegionalSectionFieldNames(unqualifiedSections(true));
    expect(identity.fields.map((entry) => entry.fieldName)).toEqual(["Customer Name", "Address 1"]);
    expect(regional.fields.map((entry) => entry.fieldName)).toEqual([
      "Regional Name",
      "Regional Address 1",
      "Regional Country",
    ]);
  });

  it("is a no-op on a database that already stores the prefix", () => {
    const sections = [
      section(68, "Customers-Region details", "Region Details", [field("Regional Address 1")]),
    ];
    expect(qualifyRegionalSectionFieldNames(sections)[0].fields[0].fieldName).toBe(
      "Regional Address 1",
    );
  });

  it("keeps fieldId, so the visibility PATCH still targets the stored row", () => {
    const sections = unqualifiedSections(true);
    const ids = sections[1].fields.map((entry) => entry.fieldId);
    expect(qualifyRegionalSectionFieldNames(sections)[1].fields.map((entry) => entry.fieldId)).toEqual(
      ids,
    );
  });
});

describe("Customer regional visibility with unqualified field names", () => {
  it("hides the regional inputs, not the identity ones", () => {
    expect(renderedNames(unqualifiedSections(false))).toEqual([
      "identity",
      "cusName",
      "cusAddr1",
      "regional",
      "cusRegionName",
    ]);
  });

  it("keeps the identity Address 1 independent of the regional one", () => {
    expect(renderedNames(unqualifiedSections(true))).toContain("cusAddr1");
    expect(renderedNames(unqualifiedSections(true))).toContain("cusRegionAddr1");
  });
});
