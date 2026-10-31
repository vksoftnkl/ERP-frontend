import { describe, expect, it } from "vitest";
import { buildFormDefaults } from "@/features/masters/shared/build-form-defaults";
import { applyFormDefaults } from "@/features/masters/shared/apply-form-defaults";
import { ITEM_TEMPLATE_FIELD_SPECS } from "@/features/masters/inventory/item/template/field-specs";
import { mergeTemplateDocument } from "./merge-template-document";

const RENDERED = new Set(["item_is_active", "item_sort_order", "item_hsn_code"]);

describe("mergeTemplateDocument", () => {
  it("keeps unrendered boolean, number and null with their types through a save", () => {
    const stored = {
      item_incl_tax: true,
      item_decimals: 3,
      item_note: null,
      item_is_active: false,
      item_sort_order: 1,
    };
    // The form is seeded from the stored document, so unrendered keys arrive as text.
    const values = {
      ...applyFormDefaults(JSON.stringify(stored), ITEM_TEMPLATE_FIELD_SPECS).values,
      item_is_active: "true",
      item_sort_order: "7",
    };
    const built = JSON.parse(
      buildFormDefaults(values, {
        specs: ITEM_TEMPLATE_FIELD_SPECS,
        excluded: [],
      }),
    ) as Record<string, unknown>;
    const saved = mergeTemplateDocument(stored, built, RENDERED);
    expect(saved.item_incl_tax).toBe(true);
    expect(saved.item_decimals).toBe(3);
    expect(saved).toHaveProperty("item_note", null);
    // Rendered keys are answered by the screen, in their proper types.
    expect(saved.item_is_active).toBe(true);
    expect(saved.item_sort_order).toBe(7);
  });

  it("drops a rendered key the screen cleared", () => {
    const saved = mergeTemplateDocument({ item_sort_order: 4 }, {}, RENDERED);
    expect(saved).not.toHaveProperty("item_sort_order");
  });
});
