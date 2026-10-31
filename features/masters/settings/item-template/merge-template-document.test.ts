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

  describe("the branch and its stored name (item_branch_name, as Qt Item Entry shows it)", () => {
    // What the page renders: the branch, and — through its spec's label key — its name.
    const renderedWithBranch = new Set([
      ...RENDERED,
      "item_branch_id",
      ...ITEM_TEMPLATE_FIELD_SPECS.filter((spec) => spec.name === "item_branch_id").map((spec) => spec.labelKey as string),
    ]);
    const stored = {
      item_branch_id: "br-old",
      item_branch_name: "Old Branch",
      item_incl_tax: true,
      item_is_active: true,
    };
    const save = (branchId: string, branchLabel: string) => {
      const values = { ...applyFormDefaults(JSON.stringify(stored), ITEM_TEMPLATE_FIELD_SPECS).values, item_branch_id: branchId };
      const built = JSON.parse(
        buildFormDefaults(values, {
          specs: ITEM_TEMPLATE_FIELD_SPECS,
          excluded: [],
          labels: { item_branch_id: branchLabel },
        }),
      ) as Record<string, unknown>;
      return mergeTemplateDocument(stored, built, renderedWithBranch);
    };

    it("declares item_branch_name as the branch's label key", () => {
      expect(renderedWithBranch.has("item_branch_name")).toBe(true);
      // A label key is never read back as a form value of its own.
      expect(applyFormDefaults(JSON.stringify(stored), ITEM_TEMPLATE_FIELD_SPECS).values).not.toHaveProperty("item_branch_name");
    });

    it("writes the new branch's name when the branch changes", () => {
      const saved = save("br-new", "New Branch");
      expect(saved.item_branch_id).toBe("br-new");
      expect(saved.item_branch_name).toBe("New Branch");
      // Unrendered keys still ride through with their types.
      expect(saved.item_incl_tax).toBe(true);
    });

    it("keeps the name with an unchanged branch", () => {
      const saved = save("br-old", "Old Branch");
      expect(saved).toMatchObject({ item_branch_id: "br-old", item_branch_name: "Old Branch" });
    });

    it("drops the id and its name together when the branch is cleared", () => {
      const saved = save("", "");
      expect(saved).not.toHaveProperty("item_branch_id");
      expect(saved).not.toHaveProperty("item_branch_name");
    });
  });
});
