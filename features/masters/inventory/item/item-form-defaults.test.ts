import { describe, expect, it } from "vitest";
import { buildFormDefaults } from "@/features/masters/shared/build-form-defaults";
import { applyFormDefaults } from "@/features/masters/shared/apply-form-defaults";
import { ITEM_TEMPLATE_EXCLUDED, ITEM_TEMPLATE_EXCLUDED_PREFIXES } from "./template/excluded";
import { ITEM_TEMPLATE_FIELD_SPECS } from "./template/field-specs";
import {
  ITEM_INITIAL_FORM_VALUES,
  ITEM_PRICE_ROWS_FIELD_NAME,
} from "./item-master-page.constants";

const OPTIONS = {
  specs: ITEM_TEMPLATE_FIELD_SPECS,
  excluded: ITEM_TEMPLATE_EXCLUDED,
  excludedPrefixes: ITEM_TEMPLATE_EXCLUDED_PREFIXES,
};

// A filled Item Entry form: the blank draft (so every linked-row draft field and
// every flag is present, as it is in the real modal) with one item's worth of
// identity and one kind's worth of classification typed over it.
const DRAFT: Record<string, string> = {
  ...ITEM_INITIAL_FORM_VALUES,
  item_name_en: "Sugar 1kg",
  item_name_ta: "சர்க்கரை 1kg",
  item_code: "IT001",
  item_sku: "SKU-1",
  item_alias: "SUG1",
  item_default_barcode: "8901234567890",
  item_notes: "Top shelf",
  item_image_url: "https://example.invalid/sugar.png",
  item_packing_item_ids: "019f0000-0000-0000-0000-000000000001",
  item_group_id: "019f2200-0000-7000-8000-000000000001",
  item_category_id: "019f2200-0000-7000-8000-000000000002",
  item_brand_id: "019f2200-0000-7000-8000-000000000003",
  item_default_tax_id: "019f2200-0000-7000-8000-000000000004",
  item_hsn_code: "1701",
  item_stock_type: "FG",
  item_sort_order: "10",
  item_is_service: "false",
  item_allow_sales: "true",
  // Linked-row draft fields, as the editors leave them.
  ipm_cost_price: "42.5",
  ean_code: "8901234567890",
  ir_min_level: "5",
  iuc_unit_factor: "1",
  [ITEM_PRICE_ROWS_FIELD_NAME]: '[{"ipm_id":"x"}]',
};
const LABELS = {
  item_group_id: "GROCERY",
  item_category_id: "STAPLES",
  item_brand_id: "OWN BRAND",
  item_default_tax_id: "GST 5%",
};

function build(values: Record<string, string> = DRAFT): Record<string, unknown> {
  return JSON.parse(buildFormDefaults(values, { ...OPTIONS, labels: LABELS })) as Record<
    string,
    unknown
  >;
}

describe("the item template document", () => {
  it("drops what identifies one item", () => {
    const document = build();
    for (const excluded of ITEM_TEMPLATE_EXCLUDED) {
      expect(document, excluded).not.toHaveProperty(excluded);
    }
  });

  it("drops every linked-row draft field, by prefix", () => {
    const document = build();
    for (const key of Object.keys(document)) {
      expect(
        ITEM_TEMPLATE_EXCLUDED_PREFIXES.some((prefix) => key.startsWith(prefix)),
        key,
      ).toBe(false);
    }
    expect(document).not.toHaveProperty("ipm_cost_price");
    expect(document).not.toHaveProperty("ean_code");
    expect(document).not.toHaveProperty("ir_min_level");
    expect(document).not.toHaveProperty("iuc_unit_factor");
  });

  it("keeps what describes a kind of item", () => {
    const document = build();
    expect(document.item_group_id).toBe("019f2200-0000-7000-8000-000000000001");
    expect(document.item_group_name).toBe("GROCERY");
    expect(document.item_category_name).toBe("STAPLES");
    expect(document.item_default_tax_name).toBe("GST 5%");
    expect(document.item_hsn_code).toBe("1701");
    expect(document.item_stock_type).toBe("FG");
    expect(document.item_sort_order).toBe(10);
    expect(document.item_allow_sales).toBe(true);
    expect(document.item_is_service).toBe(false);
  });

  it("seeds the lazy dropdowns and the plain fields back onto a blank form", () => {
    const { values, seeds } = applyFormDefaults(
      buildFormDefaults(DRAFT, { ...OPTIONS, labels: LABELS }),
      ITEM_TEMPLATE_FIELD_SPECS,
    );
    expect(seeds.item_group_id).toEqual({
      id: "019f2200-0000-7000-8000-000000000001",
      label: "GROCERY",
    });
    expect(seeds.item_default_tax_id?.label).toBe("GST 5%");
    // A label is not a form field.
    expect(values).not.toHaveProperty("item_group_name");
    // Numbers and flags come back in the string shape the modal holds.
    expect(values.item_sort_order).toBe("10");
    expect(values.item_allow_sales).toBe("true");
    expect(values.item_is_service).toBe("false");
    expect(values.item_hsn_code).toBe("1701");
    // Nothing this build has no field for, and nothing per-item.
    expect(values).not.toHaveProperty("item_name_en");
  });

  it("leaves a field the template is silent about alone", () => {
    const { values } = applyFormDefaults(
      JSON.stringify({ item_group_id: "g1", item_group_name: "GROCERY" }),
      ITEM_TEMPLATE_FIELD_SPECS,
    );
    expect(values).toEqual({ item_group_id: "g1" });
  });

  it("survives a template it cannot read", () => {
    expect(applyFormDefaults("not json", ITEM_TEMPLATE_FIELD_SPECS)).toEqual({
      values: {},
      seeds: {},
    });
  });
});
