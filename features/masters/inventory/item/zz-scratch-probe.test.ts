import { it } from "vitest";
import { seedEmptyItemLinkedGrids } from "./item-master-page";
import { ITEM_INITIAL_FORM_VALUES } from "./item-master-page.constants";
import { collectChangedFormValues } from "@/lib/form-drafts";
it("probe", () => {
  const base = { ...ITEM_INITIAL_FORM_VALUES, item_company_id: "C1", item_branch_id: "B1" };
  const seeded = seedEmptyItemLinkedGrids(base, new Map());
  console.log(JSON.stringify(collectChangedFormValues(base, seeded), null, 1));
  const again = seedEmptyItemLinkedGrids(seeded, new Map());
  console.log("again", JSON.stringify(collectChangedFormValues(seeded, again)));
});
