import type { FormDefaultsFieldSpec } from "@/features/masters/shared/build-form-defaults";
import { CUSTOMER_BOOLEAN_FIELD_NAMES } from "../customer-master.constants";

/**
 * How each Customer Entry field is written into the template document.
 *
 * Only the fields whose stored TYPE is not plain text are listed — everything
 * else is text by default, which is what the modal holds anyway. The types
 * match the document the POS writes (booleans as booleans, numbers as numbers,
 * collection days as an array of day numbers), because both clients read each
 * other's templates.
 *
 * `cusPriceLevelId` is an id like the rest even though it holds "1": ids in
 * this system are not all uuids and the value is round-tripped as it stands.
 */
const ID_FIELDS: FormDefaultsFieldSpec[] = [
  { name: "cusCompanyId", kind: "id", labelKey: "cusCompanyName" },
  { name: "cusBranchId", kind: "id", labelKey: "cusBranchName" },
  { name: "cusAreaId", kind: "id", labelKey: "cusAreaName" },
  { name: "cusGroupId", kind: "id", labelKey: "cusGroupName" },
  { name: "cusStateCode", kind: "id", labelKey: "cusStateName" },
  { name: "cusPriceLevelId", kind: "id", labelKey: "cusPriceLevelName" },
];

const NUMBER_FIELDS = [
  "cusDistanceKm",
  "cusCreditDays",
  "cusCreditBillLimit",
  "cusCreditAmtLimit",
  "cusDebitBalance",
  "cusDebitGraceDays",
  "cusDiscPerc",
  "cusSortOrder",
] as const;

export const CUSTOMER_TEMPLATE_FIELD_SPECS: FormDefaultsFieldSpec[] = [
  ...ID_FIELDS,
  ...NUMBER_FIELDS.map((name) => ({ name, kind: "number" as const })),
  ...CUSTOMER_BOOLEAN_FIELD_NAMES.map((name) => ({ name, kind: "boolean" as const })),
  // A multi-select the modal holds as "0,3,5"; the document holds [0, 3, 5].
  { name: "cusCollectionDays", kind: "numberList" },
];

/** The label each id field's display text is resolved from, for the caller that
 *  has the options loaded. Keyed by field name, as `buildFormDefaults` expects. */
export const CUSTOMER_TEMPLATE_LABELLED_FIELDS = ID_FIELDS.map((spec) => spec.name);

/** The picks worth showing in the prompt before the operator agrees to store them. */
export const CUSTOMER_TEMPLATE_SUMMARY_FIELDS = [
  ["cusAreaName", "Area"],
  ["cusGroupName", "Group"],
  ["cusStateName", "State"],
  ["cusPriceLevelName", "Price Level"],
] as const;
