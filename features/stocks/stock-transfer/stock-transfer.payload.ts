/**
 * Godown Transfer / Branch Outward — the draft to the save body and back
 * (Qt `buildPayload` / `buildLines` / `applyHeader` / `applyLines`). Pure.
 *
 * What is NEVER sent: a cost (the engine stamps it and a sent one is stripped),
 * a charge (the server works out Σ (qty + free) × rate and posts it), a status
 * (only the engine writes `svh_status`).
 */
import { addDays } from "@/features/sales/quotation/quotation.utils";
import { cellNumber } from "@/features/stocks/stock-adjustment/stock-adjustment.format";
import {
  blankHandling,
  ensureTrailingBlank,
  isBranch,
  lineFromPayload,
  localTextFromWire,
  rowHasItem,
  stampsOf,
  wireFromLocalText,
} from "./stock-transfer.state";
import type {
  DraftScope,
  Handling,
  Pick,
  SaveTransferDto,
  SaveTransferHeader,
  SaveTransferLine,
  TransferDraft,
  TransferPayload,
  TransferSaveResult,
} from "./stock-transfer.types";

const text = (value: string | null | undefined): string => (value ?? "").trim();

/** An id and a name, or null when the server named nobody. */
function pick(id: string | null | undefined, name: string | null | undefined): Pick | null {
  return id ? { id, text: name ?? "" } : null;
}

function picks(ids: readonly string[] | undefined, names: readonly string[] | undefined): Pick[] {
  return (ids ?? []).map((id, index) => ({ id, text: names?.[index] ?? "" }));
}

export function buildLines(draft: TransferDraft): { lines: SaveTransferLine[]; sentKeys: string[] } {
  const lines: SaveTransferLine[] = [];
  const sentKeys: string[] = [];
  for (const line of draft.lines) {
    if (!rowHasItem(line)) {
      continue;
    }
    sentKeys.push(line.key);
    const factor = Math.max(0.000001, line.toBaseFactor);
    const qty = cellNumber(line.qty);
    const free = cellNumber(line.freeQty);
    const barcode = line.barcode.trim();
    lines.push({
      lineNo: lines.length + 1,
      itemId: line.itemId,
      uomId: line.uomId,
      baseUomId: line.baseUomId,
      toBaseFactor: factor,
      // The SOURCE godown; the destination is the header's.
      godownId: draft.fromGodownId,
      lotId: line.lotId,
      bucket: line.bucket || "SALEABLE",
      qty,
      baseQty: qty * factor,
      ...(free > 0 ? { freeQty: free, freeBaseQty: free * factor } : {}),
      ...(barcode ? { barcode } : {}),
      loadRate: cellNumber(line.loadRate),
      // A despatch carries the loading half only; the receipt keys the
      // unloading (server STOCK_LOADING_WRONG_HALF).
      unloadRate: isBranch(draft) ? 0 : cellNumber(line.unloadRate),
    });
  }
  return { lines, sentKeys };
}

export function buildPayload(draft: TransferDraft): { payload: SaveTransferDto; sentKeys: string[] } {
  const handling = draft.handling;
  const branch = isBranch(draft);
  const load = handling.loadEnabled;
  const unload = !branch && handling.unloadEnabled;
  const header: SaveTransferHeader = {
    ...(draft.svhId ? { svhId: draft.svhId } : {}),
    accYear: draft.accYear,
    companyId: draft.companyId,
    branchId: draft.branchId,
    deviceId: draft.deviceId,
    docDate: draft.docDate,
    fromGodownId: draft.fromGodownId,
    toGodownId: draft.toGodownId,
    // No toBranchId: this branch — the godown-to-godown shape.
    ...(branch ? { toBranchId: draft.toBranchId } : {}),
    ...(!branch && draft.reasonId ? { reasonId: draft.reasonId } : {}),
    ...(text(draft.remarks) ? { remarks: text(draft.remarks) } : {}),
    loadEnabled: load,
    unloadEnabled: unload,
    ...(load
      ? {
          loadDatetime: wireFromLocalText(handling.loadAt),
          loadmanIds: handling.loadmen.map((entry) => entry.id),
          driverId: handling.driver?.id ?? null,
          supervisorId: handling.supervisor?.id ?? null,
          vehicleNo: text(handling.vehicleNo) || null,
        }
      : {}),
    ...(unload
      ? {
          unloadDatetime: wireFromLocalText(handling.unloadAt),
          unloadmanIds: handling.unloadmen.map((entry) => entry.id),
          unloadSupervisorId: handling.unloadSupervisor?.id ?? null,
        }
      : {}),
  };
  const { lines, sentKeys } = buildLines(draft);
  return { payload: { header, lines }, sentKeys };
}

/** The despatch call's own body: the lorry rides along on a branch despatch. */
export function despatchLorry(draft: TransferDraft): { lrNo?: string; vehicleNo?: string; expectedOn?: string } {
  if (!isBranch(draft)) {
    return {};
  }
  return {
    ...(text(draft.lrNo) ? { lrNo: text(draft.lrNo) } : {}),
    ...(text(draft.handling.vehicleNo) ? { vehicleNo: text(draft.handling.vehicleNo) } : {}),
    ...(draft.expectedOn ? { expectedOn: draft.expectedOn } : {}),
  };
}

function handlingFromHeader(header: TransferPayload["header"]): Handling {
  const blank = blankHandling();
  if (!("loadEnabled" in header)) {
    return blank;
  }
  return {
    loadEnabled: Boolean(header.loadEnabled),
    loadAt: localTextFromWire(header.loadDatetime),
    loadmen: picks(header.loadmanIds, header.loadmanNames),
    driver: pick(header.driverId, header.driverName),
    supervisor: pick(header.supervisorId, header.supervisorName),
    vehicleNo: text(header.vehicleNo),
    unloadEnabled: Boolean(header.unloadEnabled),
    unloadAt: localTextFromWire(header.unloadDatetime),
    unloadmen: picks(header.unloadmanIds, header.unloadmanNames),
    unloadSupervisor: pick(header.unloadSupervisorId, header.unloadSupervisorName),
  };
}

/** A loaded document as the draft (Qt `applyHeader` + `applyLines` + `fillTransit`). */
export function draftFromPayload(
  scope: DraftScope,
  mode: TransferDraft["mode"],
  payload: TransferPayload,
  openForEdit: boolean,
): TransferDraft {
  const header = payload.header;
  const transit = payload.transit ?? [];
  const branch = mode === "branch";
  const handling = handlingFromHeader(header);
  const first = branch ? transit[0] : undefined;
  if (first) {
    // The lorry lives on the transit rows (the despatch wrote it there).
    handling.vehicleNo = text(first.vehicleNo) || handling.vehicleNo;
  }
  const status = header.status || "DRAFT";
  const editable = openForEdit && status === "DRAFT";
  const lines = payload.lines.map(lineFromPayload);
  return {
    ...scope,
    accYear: header.accYear || scope.accYear,
    deviceId: header.deviceId || scope.deviceId,
    mode,
    svhId: header.svhId,
    refno: header.refno,
    status,
    viewMode: editable ? "entry" : "browse",
    docDate: text(header.docDate).slice(0, 10),
    fromGodownId: header.fromGodownId ?? "",
    fromGodownName: header.fromGodownName ?? "",
    // FROM is fromGodownId; the TO side comes back as godownId.
    toGodownId: header.godownId ?? "",
    toGodownName: header.godownName ?? "",
    toBranchId: header.toBranchId ?? "",
    toBranchName: header.toBranchName ?? "",
    expectedOn: text(first?.expectedOn).slice(0, 10) || addDays(text(header.docDate).slice(0, 10), 1),
    lrNo: text(first?.lrNo),
    reasonId: header.reasonId ?? "",
    extraReason: header.reasonId ? { id: header.reasonId, name: header.reasonName ?? "" } : null,
    remarks: header.remarks ?? "",
    handling,
    lines: editable ? ensureTrailingBlank(lines) : lines,
    transit,
    serverProblems: {},
    headerProblems: {},
    sentKeys: [],
    hint: "",
    stamps: stampsOf(header),
    notice: "",
    dirty: false,
  };
}

/** The save's answer: the number and the lines' ids, back on the draft. */
export function applySaveResult(
  draft: TransferDraft,
  result: TransferSaveResult,
  sentKeys: readonly string[],
): TransferDraft {
  const header = result.header;
  const ids = new Map<string, string>();
  sentKeys.forEach((key, index) => {
    const id = result.lines?.[index]?.sviId;
    if (id) {
      ids.set(key, id);
    }
  });
  return {
    ...draft,
    svhId: header.svhId,
    refno: header.refno,
    accYear: header.accYear || draft.accYear,
    status: "DRAFT",
    lines: draft.lines.map((line) => (ids.has(line.key) ? { ...line, id: ids.get(line.key) ?? null } : line)),
    stamps: stampsOf(header),
    serverProblems: {},
    headerProblems: {},
    sentKeys: [...sentKeys],
    notice: "",
    dirty: false,
  };
}
