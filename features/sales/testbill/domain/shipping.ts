/**
 * Sale Bill — the transport band's rules (§20). Pure: no React, no fetch.
 *
 *  - "Empty Ship To means 'as the bill-to'": the bill-to is shown as grey
 *    placeholders and NEVER written, so opening the popup does not stamp a
 *    ship-to snapshot on every document.
 *  - Two save modes: with the document (flat `sbShip*` on `/create`) while
 *    it is a DRAFT; its own verb (`PUT /bills/transport`) once POSTED and
 *    `locks.editable.transportBand`; locked once an IRN or EWB is generated.
 *  - The summary line beside the Shipping button, which Qt meant to show and
 *    never created.
 *  - State names come from the fixed GST state table (codes 01–38, 97, 99):
 *    dropdown 21 shows only the text it is handed.
 */
import type { TransportBandDto, TransportEndDto } from "@/features/sales/testbill/api/bills";
import type { BillLocks, BillPostingBlock, TransportBand, TransportEnd } from "@/features/sales/testbill/types";
import { emptyTransportEnd, transportBandIsEmpty } from "@/features/sales/testbill/state/factories";

/** The GST state codes, as `fixed.state_codes` carries them. */
export const GST_STATES: ReadonlyArray<{ code: string; name: string }> = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "25", name: "Daman and Diu" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "28", name: "Andhra Pradesh (old)" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
  { code: "99", name: "Centre Jurisdiction" },
];

export function gstStateName(code: string | null | undefined): string {
  const wanted = (code ?? "").trim();
  return GST_STATES.find((state) => state.code === wanted)?.name ?? "";
}

/** The transport modes, `''` = unset (§20.2). */
export const TRANSPORT_MODE_OPTIONS = [
  { value: "", label: "—" },
  { value: "ROAD", label: "Road" },
  { value: "RAIL", label: "Rail" },
  { value: "AIR", label: "Air" },
  { value: "SHIP", label: "Ship" },
] as const;

export type ShippingMode = "document" | "ownVerb" | "declared" | "readOnly";

/**
 * Which save mode the popup is in (§20.3). `declared` wins over everything:
 * once an IRN or an e-way bill is generated, a vehicle change is a Part-B
 * update on the e-way bill, not an edit of the band.
 */
export function shippingModeOf(input: {
  status: string;
  editable: boolean;
  locks: BillLocks | null;
  posting: BillPostingBlock | null;
}): ShippingMode {
  const declared =
    input.locks?.irnLive === true ||
    input.locks?.ewbLive === true ||
    input.posting?.irn.status === "GENERATED" ||
    input.posting?.ewb.status === "GENERATED";
  if (declared) {
    return "declared";
  }
  if (input.status === "POSTED" || input.status === "CANCELLED") {
    return input.locks?.editable.transportBand === true && input.status === "POSTED" ? "ownVerb" : "readOnly";
  }
  return input.editable ? "document" : "readOnly";
}

export type ShippingMood = { tone: "red" | "blue" | "grey" | "amber"; text: string } | null;

/** The mood strip, in priority order (§20.3). */
export function shippingMood(mode: ShippingMode, required: string | null, ewbVehicle: string | null): ShippingMood {
  if (required) {
    return { tone: "red", text: required };
  }
  if (mode === "declared") {
    return {
      tone: "blue",
      text:
        "Declared — locked. A vehicle change is a Part-B update on the e-way bill." +
        (ewbVehicle ? ` Vehicle on the e-way bill: ${ewbVehicle}` : ""),
    };
  }
  if (mode === "readOnly") {
    return { tone: "grey", text: "This bill is read-only — the transport details are shown as saved." };
  }
  if (mode === "ownVerb") {
    return {
      tone: "amber",
      text: "The document is posted — these details save on their own (Save transport, F5). Locked once the e-way bill is generated.",
    };
  }
  return null;
}

/**
 * The summary line beside the Shipping button (§20.3): "to NAME, PLACE ·
 * transporter · VEHICLE · LR n · N km · driver X", or the "not filled" hint.
 */
export function shippingSummary(
  band: TransportBand,
  people: { vehicleNo: string; driverName: string },
): string {
  const parts: string[] = [];
  const to = [band.to.name, band.to.place].filter((value) => (value ?? "").trim()).join(", ");
  if (to) {
    parts.push(`to ${to}`);
  }
  if ((band.transporterName ?? "").trim()) {
    parts.push(band.transporterName!.trim());
  }
  if (people.vehicleNo.trim()) {
    parts.push(people.vehicleNo.trim());
  }
  if ((band.lrNo ?? "").trim()) {
    parts.push(`LR ${band.lrNo!.trim()}`);
  }
  if (band.distanceKm !== null && band.distanceKm > 0) {
    parts.push(`${band.distanceKm} km`);
  }
  if (people.driverName.trim()) {
    parts.push(`driver ${people.driverName.trim()}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "Not filled — opens itself when the e-way rule needs it";
}

/** Ship To is "as the bill-to" while every field is blank. */
export function shipToIsEmpty(end: TransportEnd): boolean {
  return Object.values(end).every((value) => value === null || value === "");
}

/**
 * The Ship To rules when it is NOT empty (§20.2): Name, Address, Place, a
 * 6-digit PIN and a State. GSTIN and Phone are optional. Returns the first
 * refusal, or null.
 */
export function shipToViolation(end: TransportEnd): string | null {
  if (shipToIsEmpty(end)) {
    return null;
  }
  if (!(end.name ?? "").trim()) {
    return "Ship To needs a name.";
  }
  if (!(end.addr ?? "").trim()) {
    return "Ship To needs an address.";
  }
  if (!(end.place ?? "").trim()) {
    return "Ship To needs a place.";
  }
  if (!/^\d{6}$/.test((end.pin ?? "").trim())) {
    return "Ship To needs a 6-digit PIN.";
  }
  if (!(end.stcd ?? "").trim()) {
    return "Ship To needs a state.";
  }
  return null;
}

/** Distance is 0–99999 km, an integer; a blank stays null. */
export function clampDistance(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  return Math.min(99999, Math.max(0, Math.trunc(value)));
}

/**
 * Picking a ship-to site (§20.2): its fields fill the end; its distance is
 * copied only when it is > 0 and the distance box is empty.
 */
export function applyShipToSite(
  band: TransportBand,
  site: {
    saaId: string;
    name: string | null;
    addr: string | null;
    place: string | null;
    pin: string | null;
    stcd: string | null;
    gstin: string | null;
    phone: string | null;
    distanceKm: number | null;
  } | null,
): TransportBand {
  if (!site) {
    return { ...band, to: emptyTransportEnd() };
  }
  const distance =
    (band.distanceKm === null || band.distanceKm === 0) && site.distanceKm !== null && site.distanceKm > 0
      ? clampDistance(site.distanceKm)
      : band.distanceKm;
  return {
    ...band,
    to: {
      godownId: null,
      branchId: null,
      addrId: site.saaId,
      name: site.name,
      addr: site.addr,
      place: site.place,
      pin: site.pin,
      phone: site.phone,
      stcd: site.stcd,
      gstin: site.gstin,
    },
    distanceKm: distance,
  };
}

/**
 * Clear (F7) inside the popup empties the form but keeps the VEHICLE — it is
 * the header's, not the popup's to clear. The vehicle is not on the band at
 * all, so an empty band is the whole answer.
 */
export function clearedBand(): TransportBand {
  return {
    from: emptyTransportEnd(),
    to: emptyTransportEnd(),
    mode: "",
    transporterId: null,
    transporterName: null,
    transporterGstin: null,
    lrNo: null,
    lrDate: null,
    distanceKm: null,
  };
}

function endDto(end: TransportEnd): TransportEndDto | null {
  if (Object.values(end).every((value) => value === null || value === "")) {
    return null;
  }
  const text = (value: string | null, max: number) => {
    const trimmed = (value ?? "").trim();
    return trimmed ? trimmed.slice(0, max) : null;
  };
  return {
    godownId: end.godownId || null,
    branchId: end.branchId || null,
    addrId: end.addrId || null,
    name: text(end.name, 200),
    addr: text(end.addr, 500),
    place: text(end.place, 100),
    pin: text(end.pin, 10),
    phone: text(end.phone, 20),
    stcd: text(end.stcd, 2),
    gstin: text(end.gstin, 15),
  };
}

/**
 * `PUT /bills/transport`'s nested body (§20.3). An all-blank band is sent as
 * blank ends and nulls: unlike `/create`, the PUT CAN clear a posted band —
 * which is the reason it exists.
 */
export function transportBandDto(band: TransportBand): TransportBandDto {
  const text = (value: string | null, max: number) => {
    const trimmed = (value ?? "").trim();
    return trimmed ? trimmed.slice(0, max) : null;
  };
  return {
    direction: "OUTWARD",
    from: endDto(band.from),
    to: endDto(band.to),
    mode: band.mode ? band.mode.toUpperCase().slice(0, 10) : null,
    transporterId: band.transporterId || null,
    transporterName: text(band.transporterName, 200),
    transporterGstin: text(band.transporterGstin, 15),
    lrNo: text(band.lrNo, 50),
    lrDate: band.lrDate || null,
    distanceKm: clampDistance(band.distanceKm),
    remarks: null,
  };
}

export { transportBandIsEmpty };
