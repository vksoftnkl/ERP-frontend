import { describe, expect, it } from "vitest";
import { emptyTransportBand, emptyTransportEnd } from "../state/factories";
import {
  applyShipToSite,
  clampDistance,
  clearedBand,
  gstStateName,
  shipToIsEmpty,
  shipToViolation,
  shippingModeOf,
  shippingMood,
  shippingSummary,
  transportBandDto,
} from "./shipping";
import type { BillLocks } from "../types";

const locks = (patch: Partial<BillLocks> = {}): BillLocks => ({
  returns: 0,
  allocations: 0,
  dayClosed: false,
  irnLive: false,
  ewbLive: false,
  irnCancelWindowUntil: null,
  ewbValidUpto: null,
  editable: { document: false, transportBand: true },
  ...patch,
});

describe("shipping (§20)", () => {
  it("names GST states from the fixed table", () => {
    expect(gstStateName("33")).toBe("Tamil Nadu");
    expect(gstStateName("99")).toBe("Centre Jurisdiction");
    expect(gstStateName("00")).toBe("");
  });

  it("picks the save mode: document on a draft, own verb on a posted bill, declared once GST is live", () => {
    expect(shippingModeOf({ status: "DRAFT", editable: true, locks: null, posting: null })).toBe("document");
    expect(shippingModeOf({ status: "DRAFT", editable: false, locks: null, posting: null })).toBe("readOnly");
    expect(shippingModeOf({ status: "POSTED", editable: false, locks: locks(), posting: null })).toBe("ownVerb");
    expect(shippingModeOf({ status: "POSTED", editable: false, locks: locks({ editable: { document: false, transportBand: false } }), posting: null })).toBe("readOnly");
    expect(shippingModeOf({ status: "POSTED", editable: false, locks: locks({ ewbLive: true }), posting: null })).toBe("declared");
    expect(shippingModeOf({ status: "CANCELLED", editable: false, locks: locks(), posting: null })).toBe("readOnly");
  });

  it("the mood strip runs required → declared → read-only → own verb", () => {
    expect(shippingMood("document", "Fill the band", null)?.tone).toBe("red");
    expect(shippingMood("declared", null, "TN01AB1234")?.text).toContain("TN01AB1234");
    expect(shippingMood("readOnly", null, null)?.tone).toBe("grey");
    expect(shippingMood("ownVerb", null, null)?.tone).toBe("amber");
    expect(shippingMood("document", null, null)).toBeNull();
  });

  it("the summary line names the ship-to, transporter, vehicle, LR, distance and driver", () => {
    const band = { ...emptyTransportBand(), to: { ...emptyTransportEnd(), name: "ACME", place: "Salem" }, transporterName: "VRL", lrNo: "77", distanceKm: 120 };
    expect(shippingSummary(band, { vehicleNo: "TN01AB1234", driverName: "Kumar" })).toBe("to ACME, Salem · VRL · TN01AB1234 · LR 77 · 120 km · driver Kumar");
    expect(shippingSummary(emptyTransportBand(), { vehicleNo: "", driverName: "" })).toContain("Not filled");
  });

  it("empty Ship To means 'as the bill-to'; a filled one needs name, address, place, a 6-digit PIN and a state", () => {
    expect(shipToIsEmpty(emptyTransportEnd())).toBe(true);
    expect(shipToViolation(emptyTransportEnd())).toBeNull();
    const partial = { ...emptyTransportEnd(), name: "ACME" };
    expect(shipToViolation(partial)).toMatch(/address/);
    const full = { ...emptyTransportEnd(), name: "ACME", addr: "1 Road", place: "Salem", pin: "63600", stcd: "33" };
    expect(shipToViolation(full)).toMatch(/PIN/);
    expect(shipToViolation({ ...full, pin: "636001" })).toBeNull();
  });

  it("a picked site fills the end and copies its distance only into an empty box", () => {
    const site = { saaId: "s1", name: "Site", addr: "A", place: "P", pin: "636001", stcd: "33", gstin: null, phone: null, distanceKm: 40 };
    const fresh = applyShipToSite(emptyTransportBand(), site);
    expect(fresh.to.addrId).toBe("s1");
    expect(fresh.distanceKm).toBe(40);
    const keyed = applyShipToSite({ ...emptyTransportBand(), distanceKm: 12 }, site);
    expect(keyed.distanceKm).toBe(12);
    expect(applyShipToSite(fresh, null).to.name).toBeNull();
  });

  it("clamps the distance to 0–99999 and Clear keeps nothing on the band", () => {
    expect(clampDistance(-4)).toBe(0);
    expect(clampDistance(123456)).toBe(99999);
    expect(clampDistance(12.7)).toBe(12);
    expect(clampDistance(null)).toBeNull();
    expect(clearedBand().transporterId).toBeNull();
  });

  it("the PUT body nests the ends, upper-cases the mode and sends blank ends as null", () => {
    const dto = transportBandDto({
      ...emptyTransportBand(),
      to: { ...emptyTransportEnd(), name: "ACME", stcd: "33" },
      mode: "road",
      distanceKm: 30,
      lrNo: " 77 ",
    });
    expect(dto.direction).toBe("OUTWARD");
    expect(dto.from).toBeNull();
    expect(dto.to).toMatchObject({ name: "ACME", stcd: "33" });
    expect(dto.mode).toBe("ROAD");
    expect(dto.lrNo).toBe("77");
    expect(dto.distanceKm).toBe(30);
    expect(dto.remarks).toBeNull();
  });
});
