/**
 * What identifies ONE customer, and can therefore never be a default for the
 * next one. Ported from the Qt screen's list verbatim, plus the three fields
 * the React form has that it did not (marked below).
 *
 * The regional address block is deliberately NOT here: a branch that bills in
 * Tamil may well want the regional country and state seeded.
 */
export const CUSTOMER_TEMPLATE_EXCLUDED = [
  "cusName",
  "cusShort",
  "cusCode",
  "cusGstNo",
  "cusPanNo",
  "cusAadharNo",
  "cusEcommerceGstin",
  "cusContactPerson",
  "cusTel",
  "cusPhone1",
  "cusPhone2",
  "cusWhatsappNo",
  "cusEmail",
  "cusNotes",
  "cusBirthDate",
  "cusMarriageDate",
  // Not in the Qt list because the Qt form did not carry them, but the same
  // rule: facts about one customer, and the button also works in edit mode
  // (§4.7), where they would otherwise be templated off a real record.
  "cusBilledDate",
  "cusBilledCount",
  "cusGeoLocation",
] as const;
