import { describe, expect, it } from "vitest";
import {
  applyPick,
  doesNotResolve,
  fitsLocally,
  groupLabel,
  healthPillText,
  isRowDirty,
  mapHealth,
  needsLabel,
  rowFromPayload,
  serverSentence,
  statusOf,
  toSaveBody,
  usedByLabel,
} from "./domain";
import type { LedgerMapRolePayload } from "./ledger-map.types";

function payload(overrides: Partial<LedgerMapRolePayload> = {}): LedgerMapRolePayload {
  return {
    role: "DISCOUNT_ALLOWED",
    label: "Discount allowed",
    group: "SHARED",
    sortOrder: 220,
    expectedLedgerType: "DISCOUNT",
    expectedDutyHead: null,
    expectedGroupNature: null,
    roleIsActive: true,
    usedBy: ["RECEIPT"],
    almId: "alm-1",
    ledgerId: "led-1",
    ledgerName: "Discount Allowed",
    ledgerIsActive: true,
    ledgerIsDeleted: false,
    isActive: true,
    remarks: null,
    ...overrides,
  };
}

const UNMAPPED = payload({
  almId: null,
  ledgerId: null,
  ledgerName: null,
  ledgerIsActive: null,
  ledgerIsDeleted: null,
  isActive: null,
  remarks: null,
});

describe("rowFromPayload", () => {
  it("reads an unmapped role as unmapped, not as parked or gone", () => {
    const row = rowFromPayload(UNMAPPED);
    expect(row.almId).toBeNull();
    expect(row.ledgerId).toBe("");
    expect(row.isActive).toBe(true);
    expect(row.ledgerIsActive).toBe(true);
    expect(row.ledgerIsDeleted).toBe(false);
    expect(statusOf(row)).toBe("Not mapped");
  });

  it("falls back to the code when the catalogue has no label", () => {
    expect(rowFromPayload(payload({ label: "" })).label).toBe("DISCOUNT_ALLOWED");
  });
});

describe("statusOf", () => {
  it("names the repair, in order: pick, turn on, re-point", () => {
    expect(statusOf(rowFromPayload(payload()))).toBe("Mapped");
    expect(statusOf(rowFromPayload(UNMAPPED))).toBe("Not mapped");
    expect(statusOf(rowFromPayload(payload({ isActive: false })))).toBe("Off");
    expect(statusOf(rowFromPayload(payload({ ledgerIsDeleted: true })))).toBe("Ledger gone");
    expect(statusOf(rowFromPayload(payload({ ledgerIsActive: false })))).toBe("Ledger gone");
  });

  it("only a Mapped row resolves", () => {
    expect(doesNotResolve(rowFromPayload(payload()))).toBe(false);
    expect(doesNotResolve(rowFromPayload(payload({ isActive: false })))).toBe(true);
  });
});

describe("words", () => {
  it("states the three expectations in the order they narrow", () => {
    const row = rowFromPayload(
      payload({ expectedLedgerType: "TAX", expectedDutyHead: "Central Tax", expectedGroupNature: "Liabilities" }),
    );
    expect(needsLabel(row)).toBe("TAX · Central Tax · Liabilities");
    expect(
      needsLabel(rowFromPayload(payload({ expectedLedgerType: null, expectedGroupNature: "Liabilities" }))),
    ).toBe("Liabilities");
    expect(needsLabel(rowFromPayload(payload({ expectedLedgerType: null })))).toBe("any ledger");
  });

  it("labels the server's enums and keeps an unknown one verbatim", () => {
    expect(groupLabel("FUTURE")).toBe("Not yet posted");
    expect(groupLabel("SOMETHING_NEW")).toBe("SOMETHING_NEW");
    expect(usedByLabel(["RECEIPT", "CHEQUE"])).toBe("Receipt, Cheques");
    expect(usedByLabel([])).toBe("nothing posts it yet");
  });
});

describe("fitsLocally", () => {
  const row = rowFromPayload(payload());

  it("refuses a ledger of another type", () => {
    expect(fitsLocally(row, "EXPENSE")).toBe(false);
    expect(fitsLocally(row, "discount")).toBe(true);
  });

  it("does not check an axis the server does not check, nor a type the grid did not say", () => {
    expect(fitsLocally(rowFromPayload(payload({ expectedLedgerType: null })), "PARTY")).toBe(true);
    expect(fitsLocally(row, "")).toBe(true);
  });
});

describe("applyPick", () => {
  it("is not an edit when the role already points at that ledger", () => {
    const row = rowFromPayload(payload());
    expect(applyPick(row, { ledgerId: "led-1", ledgerName: "Discount Allowed", ledgerType: "DISCOUNT" })).toBeNull();
  });

  it("clears a gone ledger's flags — the picker only offers live ones", () => {
    const row = rowFromPayload(payload({ ledgerIsDeleted: true }));
    const picked = applyPick(row, { ledgerId: "led-2", ledgerName: "Rate Difference", ledgerType: "DISCOUNT" });
    expect(picked).toMatchObject({ ledgerId: "led-2", ledgerIsDeleted: false, ledgerIsActive: true });
    expect(statusOf(picked!)).toBe("Mapped");
  });
});

describe("isRowDirty", () => {
  const loaded = rowFromPayload(payload({ remarks: "seeded" }));

  it("is the ledger or the trimmed remark, nothing else", () => {
    expect(isRowDirty({ ...loaded }, loaded)).toBe(false);
    expect(isRowDirty({ ...loaded, remarks: " seeded  " }, loaded)).toBe(false);
    expect(isRowDirty({ ...loaded, remarks: "changed" }, loaded)).toBe(true);
    expect(isRowDirty({ ...loaded, ledgerId: "led-2" }, loaded)).toBe(true);
  });
});

describe("toSaveBody", () => {
  it("carries the almId of a mapped role, echoes isActive and trims the remark", () => {
    const row = { ...rowFromPayload(payload({ isActive: false })), remarks: "  moved  " };
    expect(toSaveBody(row)).toEqual({
      almId: "alm-1",
      role: "DISCOUNT_ALLOWED",
      ledgerId: "led-1",
      isActive: false,
      remarks: "moved",
    });
  });

  it("omits almId for a new mapping and sends a cleared remark as null", () => {
    const row = { ...rowFromPayload(UNMAPPED), ledgerId: "led-9", remarks: "   " };
    const body = toSaveBody(row);
    expect(body).not.toHaveProperty("almId");
    expect(body.remarks).toBeNull();
    expect(body).not.toHaveProperty("almCompanyId");
  });
});

describe("mapHealth", () => {
  it("counts every role that will not post and names the ones a document posts", () => {
    const rows = [
      rowFromPayload(payload()),
      rowFromPayload({ ...UNMAPPED, role: "ROUND_OFF", label: "Round off", usedBy: ["RECEIPT"] }),
      rowFromPayload({ ...UNMAPPED, role: "PURCHASE_RETURN", label: "Purchase return", usedBy: [] }),
    ];
    const health = mapHealth(rows);
    expect(health).toEqual({ total: 3, broken: 2, brokenAndPosted: ["Round off"] });
    expect(healthPillText(health)).toBe("2 WILL NOT POST");
    expect(healthPillText(mapHealth([rows[0]]))).toBe("ALL 1 MAPPED");
  });
});

describe("serverSentence", () => {
  it("prefers the field messages to the envelope", () => {
    const error = {
      status: 409,
      data: {
        success: false,
        message: "That role is already mapped",
        errors: [{ field: "role", message: "DISCOUNT_ALLOWED already has a ledger." }],
      },
    };
    expect(serverSentence(error)).toBe("DISCOUNT_ALLOWED already has a ledger.");
  });

  it("falls back to the envelope, then to the transport error", () => {
    expect(serverSentence({ status: 500, data: { message: "Internal server error" } })).toBe(
      "Internal server error",
    );
    expect(serverSentence({ status: "FETCH_ERROR", error: "TypeError: Failed to fetch" })).toBe(
      "TypeError: Failed to fetch",
    );
    expect(serverSentence(undefined, "nope")).toBe("nope");
  });
});
