import { describe, expect, it } from "vitest";
import {
  buildEmptyGiftForm,
  buildEmptyPartyRow,
  buildEmptyPointForm,
  buildEmptySchemeForm,
  buildGiftRequest,
  buildPartyRequest,
  buildPointRequest,
  buildSchemeRequest,
  createGiftRow,
  createPartyRow,
  createPointRow,
  mapGiftToForm,
  mapPointToForm,
  mapSchemeToForm,
  shouldPersistGiftRow,
  shouldPersistPartyRow,
  shouldPersistPointRow,
} from "./promotion-loyalty-points.builders";
import type {
  EditableGiftRow,
  EditablePartyRow,
  EditablePointRow,
  SchemeFormState,
} from "./promotion-loyalty-points.local-types";
import type {
  LoyaltyGiftPayload,
  LoyaltyPartyPayload,
  LoyaltyPointPayload,
  LoyaltySchemePayload,
} from "./promotion-loyalty-points.types";

const GROUP_ID = "123e4567-e89b-42d3-a456-426614174000";

const partyPayload = (over: Partial<LoyaltyPartyPayload> = {}): LoyaltyPartyPayload => ({
  lps_id: "p1",
  lps_ls_id: "s1",
  lps_slno: 1,
  lps_scope_type: "CUSTOMER_GROUP",
  lps_scope_id: GROUP_ID,
  lps_is_exclude: false,
  lps_notes: null,
  lps_is_active: true,
  lps_is_deleted: false,
  lps_sync_date: null,
  lps_created_on: "2024-01-01",
  lps_created_by: null,
  lps_updated_on: null,
  lps_updated_by: null,
  ...over,
});

const pointPayload = (over: Partial<LoyaltyPointPayload> = {}): LoyaltyPointPayload => ({
  lspt_id: "pt1",
  lspt_ls_id: "s1",
  lspt_slno: 2,
  lspt_item_id: "i1",
  lspt_unit_id: null,
  lspt_exceeds: 100,
  lspt_each: 10,
  lspt_factor: 1.5,
  lspt_points: 5,
  lspt_notes: null,
  lspt_is_active: true,
  lspt_is_deleted: false,
  lspt_sync_date: null,
  lspt_created_on: "2024-01-01",
  lspt_created_by: null,
  lspt_updated_on: null,
  lspt_updated_by: null,
  ...over,
});

const giftPayload = (over: Partial<LoyaltyGiftPayload> = {}): LoyaltyGiftPayload => ({
  lsg_id: "g1",
  lsg_ls_id: "s1",
  lsg_slno: 3,
  lsg_item_id: "i1",
  lsg_unit_id: "u1",
  lsg_item_qty: 2,
  lsg_redeem_points: 50,
  lsg_repeat: true,
  lsg_notes: "gift",
  lsg_is_active: true,
  lsg_is_deleted: false,
  lsg_sync_date: null,
  lsg_created_on: "2024-01-01",
  lsg_created_by: null,
  lsg_updated_on: null,
  lsg_updated_by: null,
  ...over,
});

const schemePayload = (over: Partial<LoyaltySchemePayload> = {}): LoyaltySchemePayload => ({
  ls_id: "s1",
  ls_code: null,
  ls_name: "Spring",
  ls_type: "BOTH",
  ls_status: "ACTIVE",
  ls_auto_apply: false,
  ls_apply_on: "ITEM_QTY",
  ls_calc_on_amount_type: "GROSS_AMOUNT",
  ls_bill_type: "CASH",
  ls_cust_type: "CUSTOMER",
  ls_item_type: "ITEM",
  ls_start_date: "2024-01-01T00:00:00.000Z",
  ls_end_date: "31/12/2024",
  ls_valid_from_time: "09:30:00",
  ls_valid_to_time: null,
  ls_valid_weekdays: "MON,TUE",
  ls_comp_id: "c1",
  ls_branch_id: null,
  ls_include_tax_for_points: true,
  ls_rounding_method: "CEIL",
  ls_recur_apl: false,
  ls_bal_apl: false,
  ls_allow_point_redeem: true,
  ls_allow_gift_redeem: true,
  ls_redeem_value_per_point: 0.5,
  ls_min_redeem_points: 10,
  ls_max_redeem_points_per_bill: 200,
  ls_max_redeem_percent_per_bill: 25,
  ls_redeem_min_bill_amount: 0,
  ls_points_valid_days: 365,
  ls_expiry_basis: "EARN_DATE",
  ls_remarks: null,
  ls_is_active: true,
  ls_is_deleted: false,
  ls_sync_date: null,
  ls_created_on: "2024-01-01",
  ls_created_by: null,
  ls_updated_on: null,
  ls_updated_by: null,
  ls_approved_on: null,
  ls_approved_by: null,
  parties: [],
  points: [],
  gifts: [],
  ...over,
});

const partyRow = (over: Partial<EditablePartyRow> = {}): EditablePartyRow => ({
  ...partyPayload(),
  _rowKey: "k",
  ...over,
});

const pointRow = (over: Partial<EditablePointRow> = {}): EditablePointRow => ({
  ...buildEmptyPointForm(),
  _rowKey: "k",
  ...over,
});

const giftRow = (over: Partial<EditableGiftRow> = {}): EditableGiftRow => ({
  ...buildEmptyGiftForm(),
  _rowKey: "k",
  ...over,
});

describe("scheme form", () => {
  it("starts from the first option of every choice list and the given company and branch", () => {
    const form = buildEmptySchemeForm("c1", "b1");
    expect(form).toMatchObject({
      ls_id: "",
      ls_type: "REDEEM",
      ls_status: "DRAFT",
      ls_apply_on: "BILL_AMOUNT",
      ls_calc_on_amount_type: "NET_AMOUNT",
      ls_bill_type: "ALL",
      ls_cust_type: "ALL",
      ls_item_type: "ALL",
      ls_rounding_method: "FLOOR",
      ls_comp_id: "c1",
      ls_branch_id: "b1",
      ls_auto_apply: true,
      ls_is_active: true,
      ls_allow_point_redeem: false,
      ls_allow_gift_redeem: false,
    });
  });

  it("defaults the expiry basis to NONE rather than the first option", () => {
    expect(buildEmptySchemeForm("", "").ls_expiry_basis).toBe("NONE");
  });

  it("maps a server scheme to form strings, normalising dates, times and nulls", () => {
    const form = mapSchemeToForm(schemePayload());
    expect(form.ls_code).toBe("");
    expect(form.ls_start_date).toBe("2024-01-01");
    expect(form.ls_end_date).toBe("2024-12-31");
    expect(form.ls_valid_from_time).toBe("09:30");
    expect(form.ls_valid_to_time).toBe("");
    expect(form.ls_valid_weekdays).toBe("MON,TUE");
    expect(form.ls_branch_id).toBe("");
    expect(form.ls_remarks).toBe("");
    expect(form.ls_redeem_value_per_point).toBe("0.5");
    expect(form.ls_min_redeem_points).toBe("10");
    expect(form.ls_redeem_min_bill_amount).toBe("0");
    expect(form.ls_points_valid_days).toBe("365");
  });

  it("stringifies numeric fields that arrive from the server as strings", () => {
    const form = mapSchemeToForm(
      schemePayload({ ls_redeem_value_per_point: "1.25" as unknown as number }),
    );
    expect(form.ls_redeem_value_per_point).toBe("1.25");
  });
});

describe("buildSchemeRequest", () => {
  const baseForm = (over: Partial<SchemeFormState> = {}): SchemeFormState => ({
    ...buildEmptySchemeForm("c1", ""),
    ls_name: "  Spring  ",
    ls_start_date: "01/01/2024",
    ls_end_date: "2024-12-31",
    ...over,
  });

  it("omits ls_id for a new scheme and includes it when editing", () => {
    expect("ls_id" in buildSchemeRequest(baseForm(), [])).toBe(false);
    expect(buildSchemeRequest(baseForm({ ls_id: "s1" }), []).ls_id).toBe("s1");
  });

  it("trims the name, nulls blank optional text and normalises dates", () => {
    const req = buildSchemeRequest(baseForm({ ls_code: "  ", ls_remarks: " ", ls_valid_weekdays: "" }), []);
    expect(req.ls_name).toBe("Spring");
    expect(req.ls_code).toBeNull();
    expect(req.ls_remarks).toBeNull();
    expect(req.ls_valid_weekdays).toBeNull();
    expect(req.ls_branch_id).toBeNull();
    expect(req.ls_start_date).toBe("2024-01-01");
    expect(req.ls_end_date).toBe("2024-12-31");
  });

  it("sends time-of-day fields only when filled", () => {
    const blank = buildSchemeRequest(baseForm(), []);
    expect("ls_valid_from_time" in blank).toBe(false);
    expect("ls_valid_to_time" in blank).toBe(false);
    const filled = buildSchemeRequest(
      baseForm({ ls_valid_from_time: "09:00", ls_valid_to_time: "18:30" }),
      [],
    );
    expect(filled.ls_valid_from_time).toBe("09:00");
    expect(filled.ls_valid_to_time).toBe("18:30");
  });

  it("converts blank or invalid redeem numbers to zero", () => {
    const req = buildSchemeRequest(
      baseForm({
        ls_redeem_value_per_point: "",
        ls_min_redeem_points: "abc",
        ls_max_redeem_points_per_bill: " 150 ",
        ls_max_redeem_percent_per_bill: "12.5",
        ls_redeem_min_bill_amount: "",
        ls_points_valid_days: "",
      }),
      [],
    );
    expect(req.ls_redeem_value_per_point).toBe(0);
    expect(req.ls_min_redeem_points).toBe(0);
    expect(req.ls_max_redeem_points_per_bill).toBe(150);
    expect(req.ls_max_redeem_percent_per_bill).toBe(12.5);
    expect(req.ls_redeem_min_bill_amount).toBe(0);
    expect(req.ls_points_valid_days).toBe(0);
  });

  it("keeps only persistable party rows and stamps them with the scheme's customer scope", () => {
    const kept = partyRow({ lps_id: "", lps_scope_id: ` ${GROUP_ID} `, lps_scope_type: "CUSTOMER_GROUP" });
    const blank = partyRow({ lps_id: "", lps_scope_id: "", lps_notes: null });
    const req = buildSchemeRequest(baseForm({ ls_cust_type: "CUSTOMER" }), [kept, blank]);
    expect(req.parties).toHaveLength(1);
    expect(req.parties?.[0]).toMatchObject({
      lps_scope_type: "CUSTOMER",
      lps_scope_id: GROUP_ID,
    });
  });

  it("keeps each party row's own scope type when the scheme is not customer-scoped", () => {
    const row = partyRow({ lps_scope_type: "CUSTOMER_GROUP" });
    const req = buildSchemeRequest(baseForm({ ls_cust_type: "ALL" }), [row]);
    expect(req.parties?.[0].lps_scope_type).toBe("CUSTOMER_GROUP");
  });
});

describe("point rows", () => {
  it("builds an empty active point form", () => {
    expect(buildEmptyPointForm()).toEqual({
      lspt_id: "",
      lspt_slno: "",
      lspt_item_id: "",
      lspt_unit_id: "",
      lspt_exceeds: "",
      lspt_each: "",
      lspt_factor: "",
      lspt_points: "",
      lspt_notes: "",
      lspt_is_active: true,
    });
  });

  it("maps a server point to form strings with nulls as blanks", () => {
    expect(mapPointToForm(pointPayload())).toEqual({
      lspt_id: "pt1",
      lspt_slno: "2",
      lspt_item_id: "i1",
      lspt_unit_id: "",
      lspt_exceeds: "100",
      lspt_each: "10",
      lspt_factor: "1.5",
      lspt_points: "5",
      lspt_notes: "",
      lspt_is_active: true,
    });
  });

  it("builds a point request, omitting id and serial when blank and defaulting numbers to zero", () => {
    const req = buildPointRequest("s1", buildEmptyPointForm());
    expect(req).toEqual({
      lspt_ls_id: "s1",
      lspt_item_id: null,
      lspt_unit_id: null,
      lspt_exceeds: 0,
      lspt_each: 0,
      lspt_factor: 0,
      lspt_points: 0,
      lspt_notes: null,
      lspt_is_active: true,
    });
  });

  it("builds a point request from a filled form", () => {
    const req = buildPointRequest("s1", {
      lspt_id: "pt1",
      lspt_slno: " 4 ",
      lspt_item_id: " i1 ",
      lspt_unit_id: "u1",
      lspt_exceeds: "100",
      lspt_each: "10.5",
      lspt_factor: "2",
      lspt_points: "7",
      lspt_notes: " note ",
      lspt_is_active: false,
    });
    expect(req).toEqual({
      lspt_id: "pt1",
      lspt_ls_id: "s1",
      lspt_slno: 4,
      lspt_item_id: "i1",
      lspt_unit_id: "u1",
      lspt_exceeds: 100,
      lspt_each: 10.5,
      lspt_factor: 2,
      lspt_points: 7,
      lspt_notes: "note",
      lspt_is_active: false,
    });
  });

  it("creates a new editable point row flagged as new, and an existing one keyed by its id", () => {
    const fresh = createPointRow();
    expect(fresh._isNew).toBe(true);
    expect(fresh._saving).toBe(false);
    expect(fresh._rowKey).toMatch(/^new-point-\d+-/);
    const existing = createPointRow(pointPayload());
    expect(existing._isNew).toBe(false);
    expect(existing._rowKey).toBe("pt1");
    expect(existing.lspt_points).toBe("5");
  });

  it("gives distinct keys to rows created back to back", () => {
    expect(createPointRow()._rowKey).not.toBe(createPointRow()._rowKey);
  });

  it("persists saved rows, and new rows only once something is entered", () => {
    expect(shouldPersistPointRow(pointRow({ lspt_id: "pt1" }))).toBe(true);
    expect(shouldPersistPointRow(pointRow())).toBe(false);
    expect(shouldPersistPointRow(pointRow({ lspt_item_id: " " }))).toBe(false);
    expect(shouldPersistPointRow(pointRow({ lspt_item_id: "i1" }))).toBe(true);
    expect(shouldPersistPointRow(pointRow({ lspt_unit_id: "u1" }))).toBe(true);
    expect(shouldPersistPointRow(pointRow({ lspt_notes: "n" }))).toBe(true);
    expect(shouldPersistPointRow(pointRow({ lspt_exceeds: "0" }))).toBe(true);
    expect(shouldPersistPointRow(pointRow({ lspt_each: "1" }))).toBe(true);
    expect(shouldPersistPointRow(pointRow({ lspt_factor: "1" }))).toBe(true);
    expect(shouldPersistPointRow(pointRow({ lspt_points: "1" }))).toBe(true);
    expect(shouldPersistPointRow(pointRow({ lspt_is_active: false }))).toBe(true);
  });
});

describe("gift rows", () => {
  it("builds an empty active gift form", () => {
    expect(buildEmptyGiftForm()).toEqual({
      lsg_id: "",
      lsg_slno: "",
      lsg_item_id: "",
      lsg_unit_id: "",
      lsg_item_qty: "",
      lsg_redeem_points: "",
      lsg_repeat: false,
      lsg_notes: "",
      lsg_is_active: true,
    });
  });

  it("maps a server gift to form strings", () => {
    expect(mapGiftToForm(giftPayload({ lsg_notes: null }))).toEqual({
      lsg_id: "g1",
      lsg_slno: "3",
      lsg_item_id: "i1",
      lsg_unit_id: "u1",
      lsg_item_qty: "2",
      lsg_redeem_points: "50",
      lsg_repeat: true,
      lsg_notes: "",
      lsg_is_active: true,
    });
  });

  it("defaults a blank gift quantity to 1 and redeem points to 0", () => {
    const req = buildGiftRequest("s1", buildEmptyGiftForm());
    expect(req).toEqual({
      lsg_ls_id: "s1",
      lsg_item_id: "",
      lsg_unit_id: "",
      lsg_item_qty: 1,
      lsg_redeem_points: 0,
      lsg_repeat: false,
      lsg_notes: null,
      lsg_is_active: true,
    });
  });

  it("builds a gift request from a filled form", () => {
    const req = buildGiftRequest("s1", {
      lsg_id: "g1",
      lsg_slno: "3",
      lsg_item_id: " i1 ",
      lsg_unit_id: " u1 ",
      lsg_item_qty: "2.5",
      lsg_redeem_points: "50",
      lsg_repeat: true,
      lsg_notes: " hi ",
      lsg_is_active: false,
    });
    expect(req).toEqual({
      lsg_id: "g1",
      lsg_ls_id: "s1",
      lsg_slno: 3,
      lsg_item_id: "i1",
      lsg_unit_id: "u1",
      lsg_item_qty: 2.5,
      lsg_redeem_points: 50,
      lsg_repeat: true,
      lsg_notes: "hi",
      lsg_is_active: false,
    });
  });

  it("creates new and existing editable gift rows", () => {
    const fresh = createGiftRow();
    expect(fresh._isNew).toBe(true);
    expect(fresh._rowKey).toMatch(/^new-gift-\d+-/);
    const existing = createGiftRow(giftPayload());
    expect(existing._isNew).toBe(false);
    expect(existing._rowKey).toBe("g1");
  });

  it("persists saved rows, and new rows only once something is entered", () => {
    expect(shouldPersistGiftRow(giftRow({ lsg_id: "g1" }))).toBe(true);
    expect(shouldPersistGiftRow(giftRow())).toBe(false);
    expect(shouldPersistGiftRow(giftRow({ lsg_item_id: "i1" }))).toBe(true);
    expect(shouldPersistGiftRow(giftRow({ lsg_unit_id: "u1" }))).toBe(true);
    expect(shouldPersistGiftRow(giftRow({ lsg_notes: "n" }))).toBe(true);
    expect(shouldPersistGiftRow(giftRow({ lsg_item_qty: "1" }))).toBe(true);
    expect(shouldPersistGiftRow(giftRow({ lsg_redeem_points: "0" }))).toBe(true);
    expect(shouldPersistGiftRow(giftRow({ lsg_repeat: true }))).toBe(true);
    expect(shouldPersistGiftRow(giftRow({ lsg_is_active: false }))).toBe(true);
  });
});

describe("party rows", () => {
  it("builds an empty party row with the next serial and default scope", () => {
    const row = buildEmptyPartyRow();
    expect(row).toMatchObject({
      lps_id: "",
      lps_slno: 1,
      lps_scope_type: "CUSTOMER_GROUP",
      lps_scope_id: "",
      lps_is_exclude: false,
      lps_is_active: true,
      lps_is_deleted: false,
    });
    expect(row._rowKey).toMatch(/^party-\d+-/);
    expect(buildEmptyPartyRow(5, "CUSTOMER")).toMatchObject({ lps_slno: 5, lps_scope_type: "CUSTOMER" });
  });

  it("keys a server party row by its id, falling back to a generated key", () => {
    expect(createPartyRow(partyPayload())._rowKey).toBe("p1");
    expect(createPartyRow(partyPayload({ lps_id: "" }))._rowKey).toMatch(/^party-\d+-/);
  });

  it("builds a party request, trimming scope id and notes", () => {
    const req = buildPartyRequest(partyRow({ lps_scope_id: ` ${GROUP_ID} `, lps_notes: " n " }));
    expect(req).toEqual({
      lps_id: "p1",
      lps_slno: 1,
      lps_scope_type: "CUSTOMER_GROUP",
      lps_scope_id: GROUP_ID,
      lps_is_exclude: false,
      lps_notes: "n",
      lps_is_active: true,
    });
  });

  it("omits the id for new rows, nulls blank notes and adds the scheme id when given", () => {
    const req = buildPartyRequest(partyRow({ lps_id: "", lps_notes: "  " }), "s9");
    expect("lps_id" in req).toBe(false);
    expect(req.lps_ls_id).toBe("s9");
    expect(req.lps_notes).toBeNull();
    expect("lps_ls_id" in buildPartyRequest(partyRow())).toBe(false);
  });

  it("lets an explicit scope type override the row's own", () => {
    expect(buildPartyRequest(partyRow(), undefined, "CUSTOMER").lps_scope_type).toBe("CUSTOMER");
  });

  it("persists saved party rows, and new rows only once something is entered", () => {
    const fresh = (over: Partial<EditablePartyRow>) =>
      partyRow({ lps_id: "", lps_scope_id: "", lps_notes: null, ...over });
    expect(shouldPersistPartyRow(partyRow())).toBe(true);
    expect(shouldPersistPartyRow(fresh({}))).toBe(false);
    expect(shouldPersistPartyRow(fresh({ lps_scope_id: "  " }))).toBe(false);
    expect(shouldPersistPartyRow(fresh({ lps_notes: "  " }))).toBe(false);
    expect(shouldPersistPartyRow(fresh({ lps_scope_id: GROUP_ID }))).toBe(true);
    expect(shouldPersistPartyRow(fresh({ lps_is_exclude: true }))).toBe(true);
    expect(shouldPersistPartyRow(fresh({ lps_notes: "n" }))).toBe(true);
    expect(shouldPersistPartyRow(fresh({ lps_is_active: false }))).toBe(true);
  });
});
