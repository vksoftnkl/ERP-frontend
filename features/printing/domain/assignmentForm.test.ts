import { describe, expect, it } from "vitest";

import {
  ASSIGNMENT_PRINTER_NAME_MAX,
  ASSIGNMENT_REMARKS_MAX,
  assignmentFormFrom,
  buildAssignmentBody,
  everyCompanyAssignment,
  templatesForScope,
  validateAssignmentForm,
  type AssignmentForm,
} from "./assignmentForm";
import type {
  PrintTemplateAssignmentPayload,
  PrintTemplatePayload,
} from "../types/printing";

const COMPANY = "019c8ea6-19e9-78a8-b15f-749e1cde7292";
const OTHER = "019cc7fc-3547-74a6-b65b-179b9db989a6";

function row(overrides: Partial<PrintTemplateAssignmentPayload> = {}) {
  return {
    ptaId: "pta-1",
    ptaCompanyId: COMPANY,
    ptaBranchId: null,
    ptaDeviceId: null,
    ptaPurposeId: "p1",
    ptaTemplateId: "t1",
    ptaTemplateCompanyKey: COMPANY,
    ptaTemplateIsShipped: false,
    ptaOutputMode: "PRINT",
    ptaPrinterId: null,
    ptaPrinterName: null,
    ptaCopies: null,
    ptaScope: "COMPANY",
    ptaRemarks: null,
    ptaIsActive: true,
    ptaIsDeleted: false,
    ptaCreatedOn: "2026-08-27T00:00:00.000Z",
    ...overrides,
  } as PrintTemplateAssignmentPayload;
}

function form(overrides: Partial<AssignmentForm> = {}): AssignmentForm {
  return {
    ...assignmentFormFrom(null, { ptaCompanyId: COMPANY, ptaPurposeId: "p1" }),
    ptaTemplateId: "t1",
    ...overrides,
  };
}

function template(overrides: Partial<PrintTemplatePayload> = {}) {
  return {
    ptlId: "t1",
    ptlCompanyId: COMPANY,
    ptlPurposeId: "p1",
    ptlCode: "INVOICE_A4",
    ptlName: "Invoice A4",
    ptlIsActive: true,
    ptlIsDeleted: false,
    ptlSortOrder: 100,
    ptlCreatedOn: "2026-08-27T00:00:00.000Z",
    ...overrides,
  } as PrintTemplatePayload;
}

/**
 * The rule that costs the most when it is wrong, because the request SUCCEEDS
 * in the shape that is wrong and 400s in the shape that reads correct.
 */
describe("ptaCompanyId is always a key in the body", () => {
  it("states null for the every-company rung rather than omitting it", () => {
    const body = buildAssignmentBody(form({ ptaCompanyId: null }), null);

    expect("ptaCompanyId" in body).toBe(true);
    expect(body.ptaCompanyId).toBeNull();
    // The distinction the server actually makes: JSON.stringify keeps null and
    // drops undefined, and an omitted company is refused rather than defaulted.
    expect(JSON.parse(JSON.stringify(body))).toHaveProperty(
      "ptaCompanyId",
      null,
    );
  });

  it("survives the round trip that a conditional spread would not", () => {
    // The shape a form actually produces, and the reason the helper exists.
    const companyId: string | null = null;
    const spread = { ...(companyId ? { ptaCompanyId: companyId } : {}) };
    expect(JSON.parse(JSON.stringify(spread))).not.toHaveProperty(
      "ptaCompanyId",
    );
    expect(
      JSON.parse(
        JSON.stringify(
          everyCompanyAssignment({ ptaPurposeId: "p1", ptaTemplateId: "t1" }),
        ),
      ),
    ).toHaveProperty("ptaCompanyId", null);
  });

  it("sends the company itself on every narrower rung", () => {
    expect(buildAssignmentBody(form(), null).ptaCompanyId).toBe(COMPANY);
  });
});

describe("every nullable field is stated, because the server merges by key presence", () => {
  it("sends an explicit null for each cleared field", () => {
    const body = buildAssignmentBody(form(), row());

    // Omitting any of these would mean "leave it alone", which is a different
    // request from "clear it" and indistinguishable in the result.
    for (const key of [
      "ptaBranchId",
      "ptaDeviceId",
      "ptaPrinterId",
      "ptaPrinterName",
      "ptaCopies",
      "ptaRemarks",
    ]) {
      expect(body).toHaveProperty(key, null);
    }
  });

  it("never sends ptaTemplateCompanyKey", () => {
    // The server reads the owner off the template. A caller free to state it is
    // free to state the wrong one, and the cross-company lock rests on it.
    expect(buildAssignmentBody(form(), row())).not.toHaveProperty(
      "ptaTemplateCompanyKey",
    );
  });
});

describe("the printer is one answer or none, never two", () => {
  it("clears the profile when the mode moved to a bare queue name", () => {
    const editing = row({ ptaPrinterId: "prf-1" });
    const body = buildAssignmentBody(
      form({ printerMode: "NAME", ptaPrinterName: "  HP-Front  " }),
      editing,
    );

    // Leaving the old id on the row would trip ck_pta_printer_one_of — or
    // worse, print to the profile while the form says otherwise.
    expect(body.ptaPrinterId).toBeNull();
    expect(body.ptaPrinterName).toBe("HP-Front");
  });

  it("keeps the id already on the row when the mode is the profile", () => {
    const body = buildAssignmentBody(
      form({ printerMode: "PROFILE" }),
      row({ ptaPrinterId: "prf-1" }),
    );

    expect(body.ptaPrinterId).toBe("prf-1");
    expect(body.ptaPrinterName).toBeNull();
  });

  it("clears both for the counter's default", () => {
    const body = buildAssignmentBody(
      form({ printerMode: "DEFAULT" }),
      row({ ptaPrinterId: "prf-1" }),
    );

    expect(body.ptaPrinterId).toBeNull();
    expect(body.ptaPrinterName).toBeNull();
  });

  it("reads the mode back off whichever column the row has set", () => {
    expect(assignmentFormFrom(row({ ptaPrinterId: "prf-1" })).printerMode).toBe(
      "PROFILE",
    );
    expect(
      assignmentFormFrom(row({ ptaPrinterName: "HP-Front" })).printerMode,
    ).toBe("NAME");
    expect(assignmentFormFrom(row()).printerMode).toBe("DEFAULT");
  });
});

describe("create and update are not symmetric", () => {
  it("omits ptaIsActive on create, because false there writes a deleted row", () => {
    // The service reads ptaIsActive: false as isDeleted, so a row created
    // inactive is created already soft deleted and never appears again.
    expect(
      buildAssignmentBody(form({ ptaIsActive: false }), null),
    ).not.toHaveProperty("ptaIsActive");
  });

  it("sends it on update, where it means what it says", () => {
    expect(
      buildAssignmentBody(form({ ptaIsActive: false }), row()),
    ).toHaveProperty("ptaIsActive", false);
  });

  it("carries ptaId only when editing", () => {
    expect(buildAssignmentBody(form(), row())).toHaveProperty("ptaId", "pta-1");
    expect(buildAssignmentBody(form(), null)).not.toHaveProperty("ptaId");
  });
});

describe("blank copies is not one copy", () => {
  it("sends null so the purpose's own count is used", () => {
    expect(
      buildAssignmentBody(form({ ptaCopies: "" }), null).ptaCopies,
    ).toBeNull();
  });

  it("sends the override as a number", () => {
    expect(buildAssignmentBody(form({ ptaCopies: "3" }), null).ptaCopies).toBe(
      3,
    );
  });
});

describe("the picker offers only what the scope may name", () => {
  const templates = [
    template({ ptlId: "own", ptlCode: "B_OWN", ptlCompanyId: COMPANY }),
    template({ ptlId: "shipped", ptlCode: "A_SHIPPED", ptlCompanyId: null }),
    template({ ptlId: "theirs", ptlCode: "C_THEIRS", ptlCompanyId: OTHER }),
  ];

  it("gives a company its own designs and the shipped ones, never another's", () => {
    const offered = templatesForScope(templates, COMPANY).map(
      (item) => item.ptlId,
    );

    expect(offered).toContain("own");
    expect(offered).toContain("shipped");
    expect(offered).not.toContain("theirs");
  });

  it("gives the every-company rung shipped designs only", () => {
    // ck_pta_template_scope: a global row naming a private design would print
    // one company's logo and address on every other company's paper.
    expect(
      templatesForScope(templates, null).map((item) => item.ptlId),
    ).toEqual(["shipped"]);
  });

  it("sorts by code so the list is stable between renders", () => {
    expect(
      templatesForScope(templates, COMPANY).map((item) => item.ptlCode),
    ).toEqual(["A_SHIPPED", "B_OWN"]);
  });

  /**
   * The one rule here that NO CONSTRAINT BACKS.
   *
   * A design carries the purpose it was written for, and its datasets read that
   * document. Assigning the Delivery Slip purpose an Invoice design saves
   * clean — there is no foreign key, no CHECK, nothing — and then prints the
   * wrong document at a till, long after the screen was closed. The picker is
   * the only place this is ever caught, which is why it is tested like a
   * constraint rather than like a convenience.
   */
  describe("and only the designs written for the purpose", () => {
    const mixed = [
      template({ ptlId: "invoice", ptlCode: "A_INV", ptlPurposeId: "p1" }),
      template({ ptlId: "slip", ptlCode: "B_SLIP", ptlPurposeId: "p2" }),
      template({ ptlId: "shipped-slip", ptlCode: "C_SLIP", ptlPurposeId: "p2", ptlCompanyId: null }),
    ];

    it("drops a design written for a different purpose", () => {
      expect(templatesForScope(mixed, COMPANY, "p1").map((item) => item.ptlId)).toEqual([
        "invoice",
      ]);
    });

    it("keeps the shipped and the owned design of the right purpose together", () => {
      expect(templatesForScope(mixed, COMPANY, "p2").map((item) => item.ptlId)).toEqual([
        "slip",
        "shipped-slip",
      ]);
    });

    it("still refuses another company's design of the right purpose", () => {
      const theirs = [template({ ptlId: "theirs", ptlPurposeId: "p1", ptlCompanyId: OTHER })];
      expect(templatesForScope(theirs, COMPANY, "p1")).toEqual([]);
    });

    it("keeps every design when no purpose has been chosen yet", () => {
      // The form opens with ptaPurposeId "", and an empty picker at that moment
      // would read as "there are no designs" rather than "say what it prints".
      expect(templatesForScope(mixed, COMPANY, "").map((item) => item.ptlId).sort()).toEqual(
        ["invoice", "shipped-slip", "slip"],
      );
    });
  });
});

describe("what the form refuses before the round trip", () => {
  it("asks for the branch a counter belongs to, against the branch field", () => {
    const errors = validateAssignmentForm(form({ ptaDeviceId: "d1" }));

    // Reported against what is MISSING: the operator named the counter on
    // purpose, and it is the branch they have to supply.
    expect(errors.ptaBranchId).toMatch(/branch/i);
    expect(errors.ptaCompanyId).toBeUndefined();
  });

  it("asks for the company a branch belongs to", () => {
    expect(
      validateAssignmentForm(form({ ptaCompanyId: null, ptaBranchId: "b1" }))
        .ptaCompanyId,
    ).toMatch(/company/i);
  });

  it("requires a purpose and a design", () => {
    const errors = validateAssignmentForm(
      form({ ptaPurposeId: "", ptaTemplateId: "" }),
    );

    expect(errors.ptaPurposeId).toBeTruthy();
    expect(errors.ptaTemplateId).toBeTruthy();
  });

  it("requires a queue name once that is the chosen mode", () => {
    expect(
      validateAssignmentForm(
        form({ printerMode: "NAME", ptaPrinterName: "   " }),
      ).ptaPrinterName,
    ).toBeTruthy();
    expect(
      validateAssignmentForm(
        form({
          printerMode: "NAME",
          ptaPrinterName: "x".repeat(ASSIGNMENT_PRINTER_NAME_MAX + 1),
        }),
      ).ptaPrinterName,
    ).toMatch(/characters/);
  });

  it("holds copies to 1..9 and lets blank through", () => {
    expect(
      validateAssignmentForm(form({ ptaCopies: "0" })).ptaCopies,
    ).toBeTruthy();
    expect(
      validateAssignmentForm(form({ ptaCopies: "10" })).ptaCopies,
    ).toBeTruthy();
    expect(
      validateAssignmentForm(form({ ptaCopies: "2.5" })).ptaCopies,
    ).toBeTruthy();
    expect(
      validateAssignmentForm(form({ ptaCopies: "" })).ptaCopies,
    ).toBeUndefined();
    expect(
      validateAssignmentForm(form({ ptaCopies: "9" })).ptaCopies,
    ).toBeUndefined();
  });

  it("holds remarks to the column width", () => {
    expect(
      validateAssignmentForm(
        form({ ptaRemarks: "x".repeat(ASSIGNMENT_REMARKS_MAX + 1) }),
      ).ptaRemarks,
    ).toMatch(/characters/);
  });

  it("passes a coherent row on every rung", () => {
    expect(validateAssignmentForm(form({ ptaCompanyId: null }))).toEqual({});
    expect(validateAssignmentForm(form())).toEqual({});
    expect(validateAssignmentForm(form({ ptaBranchId: "b1" }))).toEqual({});
    expect(
      validateAssignmentForm(form({ ptaBranchId: "b1", ptaDeviceId: "d1" })),
    ).toEqual({});
  });
});

describe("the form a row opens with says what the row says", () => {
  it("round-trips an edited row back to the same body", () => {
    const editing = row({
      ptaBranchId: "b1",
      ptaCopies: 3,
      ptaRemarks: "counter 1 only",
    });
    const body = buildAssignmentBody(assignmentFormFrom(editing), editing);

    expect(body).toMatchObject({
      ptaId: editing.ptaId,
      ptaCompanyId: COMPANY,
      ptaBranchId: "b1",
      ptaCopies: 3,
      ptaRemarks: "counter 1 only",
      ptaOutputMode: "PRINT",
    });
  });

  it("keeps a prefilled null company as the widest rung", () => {
    // undefined means "the caller did not say"; null is a deliberate answer.
    expect(
      assignmentFormFrom(null, { ptaCompanyId: null }).ptaCompanyId,
    ).toBeNull();
    expect(assignmentFormFrom(null, {}).ptaCompanyId).toBeNull();
    expect(
      assignmentFormFrom(null, { ptaCompanyId: COMPANY }).ptaCompanyId,
    ).toBe(COMPANY);
  });
});
