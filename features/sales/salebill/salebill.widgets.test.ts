/**
 * Sale Bill Entry — the widget-master field bridge.
 *
 * The header panel's Visible Settings dialog matches each configured
 * `fixed.form_field.field_name` against `SALE_BILL_HEADER_FIELD_NAMES` on a
 * case-insensitive name. That makes the bridge a pair of lists in two
 * repositories, and drift between them is SILENT in both directions:
 *
 *  - a name the client does not know is listed in the dialog but greys out as
 *    "not on form" and controls nothing;
 *  - a field the client knows with no row in the config simply stays visible
 *    under its shipped label, so nobody notices it became unconfigurable.
 *
 * Neither breaks the screen, which is exactly why neither gets reported. The
 * seeded list is therefore written out below and asserted against the map — the
 * same guard the grid-22 column test provides for `fixed.ui_table_columns`.
 */
import { describe, expect, it } from "vitest";
import {
  QUOTATION_HEADER_FIELD_NAMES,
  QUOTATION_TERMS_FIELD_NAMES,
} from "@/features/sales/quotation/quotation.constants";
import {
  SALE_BILL_CREDIT_FIELD_KEYS,
  SALE_BILL_HEADER_FIELD_NAMES,
  SALE_BILL_TERMS_FIELD_NAMES,
  SALE_BILL_WIDGET_MENU_ID,
  SALE_BILL_WIDGET_PLATFORM,
} from "./salebill.constants";

/**
 * `field_name`, verbatim and in position order, from
 * `prisma/seed/Sale_Bill_Widget_Config_Menu12.sql` — section `SaleBill`.
 */
const SEEDED_HEADER_FIELDS = [
  "Existing Customer",
  "Customer Name",
  "Address",
  "Place",
  "Phone",
  "GSTIN",
  "Customer State",
  "POS State Code",
  "Bill No",
  "Ref No",
  "Bill Date",
  "Document Type",
  "Term",
  "Due Days",
  "Due Date",
  "Price Level",
  "Freight",
  "Load",
  "Unload",
  "Promo",
  "Salesman",
  "Agent",
  "Driver",
  "Loadman",
  "Packed By",
  "Supervisor",
  "Vehicle No",
  "Contact Person",
  "Contact No",
  "Loyalty",
  "Commission",
  "Outstanding",
  "Overdue",
  "Overdue By",
  "Credit Limit",
  "Available",
];

/** The same, for section `SaleBill-terms`. */
const SEEDED_TERMS_FIELDS = ["Remarks", "Payment Terms", "Delivery Terms", "Other Terms"];

describe("the screen's widget-master identity", () => {
  it("is menu 12 on the Web platform", () => {
    // Menu 12 is "Sales Entry" (Ctrl+S) in `fixed.menu_master`. The platform is
    // checked server-side against a CASE-SENSITIVE enum, so "web" would 400.
    expect(SALE_BILL_WIDGET_MENU_ID).toBe("12");
    expect(SALE_BILL_WIDGET_PLATFORM).toBe("Web");
  });
});

describe("the header field bridge", () => {
  it("maps exactly the fields the seed configures", () => {
    expect(Object.values(SALE_BILL_HEADER_FIELD_NAMES).sort()).toEqual(
      [...SEEDED_HEADER_FIELDS].sort(),
    );
  });

  it("maps exactly the terms fields the seed configures", () => {
    expect(Object.values(SALE_BILL_TERMS_FIELD_NAMES).sort()).toEqual(
      [...SEEDED_TERMS_FIELDS].sort(),
    );
  });

  it("gives every key a distinct name", () => {
    // Two keys on one name would make hiding one hide both — and the dialog
    // would show a single checkbox for what the operator sees as two fields.
    const names = Object.values(SALE_BILL_HEADER_FIELD_NAMES);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps the names distinct case-insensitively, because the match is", () => {
    const lowered = Object.values(SALE_BILL_HEADER_FIELD_NAMES).map((name) =>
      name.toLowerCase(),
    );
    expect(new Set(lowered).size).toBe(lowered.length);
  });

  it("never collides a header name with a terms name", () => {
    // Both sections' rows are resolved into ONE map keyed by lowercased name, so
    // a name used in both panels would let the Terms row's visibility decide the
    // header field's.
    const header = new Set(
      Object.values(SALE_BILL_HEADER_FIELD_NAMES).map((name) => name.toLowerCase()),
    );
    for (const name of Object.values(SALE_BILL_TERMS_FIELD_NAMES)) {
      expect(header.has(name.toLowerCase())).toBe(false);
    }
  });
});

describe("the credit column's bridge", () => {
  it("maps every credit row's shipped label to a real field key", () => {
    // The credit block is the sale ORDER's component and addresses its rows by
    // LABEL, knowing nothing about this screen's key vocabulary. This is the
    // indirection between the two, and a typo in it silently makes one row
    // unconfigurable — it would fall back to "visible" and nobody would notice.
    for (const [label, key] of Object.entries(SALE_BILL_CREDIT_FIELD_KEYS)) {
      expect(SALE_BILL_HEADER_FIELD_NAMES[key]).toBe(label);
    }
  });

  it("covers all five rows the block renders", () => {
    expect(Object.keys(SALE_BILL_CREDIT_FIELD_KEYS).sort()).toEqual(
      ["Available", "Credit Limit", "Outstanding", "Overdue", "Overdue By"].sort(),
    );
  });
});

describe("matching is case-insensitive, which is what makes a hand-keyed config work", () => {
  it("resolves the names the Widget Master UI title-cases", () => {
    // A config keyed by hand through the Widget Master stores what it was given,
    // and that UI title-cases: "Gstin" for GSTIN, "Pos State Code" for POS State
    // Code. The client lowercases both sides before matching, so those rows still
    // control their fields — this pins that the shipped names differ ONLY in case
    // from what a hand-keyed config produces.
    const shipped = new Set(
      Object.values(SALE_BILL_HEADER_FIELD_NAMES).map((name) => name.toLowerCase()),
    );
    for (const handKeyed of ["Gstin", "Pos State Code", "Existing Customer", "Packed By"]) {
      expect(shipped.has(handKeyed.toLowerCase())).toBe(true);
    }
  });
});

describe("shared vocabulary with the quotation", () => {
  it("names a field the two screens have in common the same way", () => {
    // An operator who has configured one sales screen should recognise the next,
    // so the bill borrows the quotation's names wherever the field is the same
    // one. This pins that: renaming either side of a shared field is a decision,
    // not a typo.
    const shared = [
      "existingCustomer",
      "customerName",
      "address",
      "place",
      "phone",
      "gstin",
      "posStateCode",
      "salesman",
      "agent",
      "contactPerson",
      "contactNo",
      "freight",
      "load",
      "unload",
      "promo",
      "priceLevel",
    ] as const;
    for (const key of shared) {
      expect(SALE_BILL_HEADER_FIELD_NAMES[key]).toBe(QUOTATION_HEADER_FIELD_NAMES[key]);
    }
  });

  it("shares the whole Terms vocabulary, because it is the same panel", () => {
    // The bill renders the quotation's own `TermsBlock`, so the four keys and
    // their names have to agree or the component would read a config that does
    // not describe it.
    expect(SALE_BILL_TERMS_FIELD_NAMES).toEqual(QUOTATION_TERMS_FIELD_NAMES);
  });

  it("does NOT borrow a name for a field the quotation does not have", () => {
    // The bill's own fields — the term, the due period, the people, the
    // customer/POS state split — must not be silently aliased onto a
    // quotation field that means something else.
    const billOnly = ["billNo", "billType", "dueDays", "dueDate", "customerState", "driver"] as const;
    const quotationNames = new Set(
      Object.values(QUOTATION_HEADER_FIELD_NAMES).map((name) => name.toLowerCase()),
    );
    for (const key of billOnly) {
      expect(quotationNames.has(SALE_BILL_HEADER_FIELD_NAMES[key].toLowerCase())).toBe(false);
    }
  });
});
