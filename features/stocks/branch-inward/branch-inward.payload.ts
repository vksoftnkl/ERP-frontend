/**
 * The save and post bodies (Qt `buildPayload` / `postReceipt`). The header
 * carries BOTH godowns copied from the despatch — the header check wants them,
 * the matcher uses each line's godown, which is the DESTINATION here.
 *
 * Never sent: a total. The server computes and posts the unloading charge
 * when the receipt posts.
 */
import { EPS } from "./branch-inward.constants";
import { localToIso, lineQty, num } from "./branch-inward.state";
import type { InwardDraft } from "./branch-inward.types";

export type ReceiveLineDto = {
  lineNo: number;
  itemId: string;
  uomId: string;
  baseUomId: string;
  toBaseFactor: number;
  godownId: string;
  lotId: string;
  bucket: string;
  qty: number;
  baseQty: number;
  unloadRate: number;
};

export type ReceiveSaveDto = {
  header: Record<string, unknown>;
  lines: ReceiveLineDto[];
};

export type BuiltReceipt = {
  dto: ReceiveSaveDto;
  /** Payload line index -> the line key sent, to tint the line the server names. */
  sentKeys: string[];
};

export function buildPayload(draft: InwardDraft): BuiltReceipt {
  const header: Record<string, unknown> = {
    ...(draft.svhId ? { svhId: draft.svhId } : {}),
    accYear: draft.accYear,
    companyId: draft.companyId,
    branchId: draft.branchId,
    deviceId: draft.deviceId,
    docDate: draft.docDate,
    fromGodownId: draft.fromGodownId,
    toGodownId: draft.toGodownId,
    linkSrcDocId: draft.outId,
    linkSrcAccYear: draft.outAccYear,
    unloadEnabled: draft.unloadEnabled,
  };
  const remarks = draft.remarks.trim();
  if (remarks) {
    header.remarks = remarks;
  }
  if (draft.unloadEnabled) {
    header.unloadDatetime = localToIso(draft.unloadAt);
    header.unloadmanIds = draft.unloadmen.map((man) => man.id);
    header.unloadSupervisorId = draft.unloadSupervisor?.id ?? null;
  }

  const lines: ReceiveLineDto[] = [];
  const sentKeys: string[] = [];
  for (const line of draft.lines) {
    const qty = lineQty(line);
    if (qty <= EPS) {
      continue; // what never arrived gets no line
    }
    sentKeys.push(line.key);
    lines.push({
      lineNo: lines.length + 1,
      itemId: line.itemId,
      uomId: line.baseUomId,
      baseUomId: line.baseUomId,
      toBaseFactor: 1,
      // The DESTINATION godown — the transit row's, never picked.
      godownId: line.toGodownId,
      lotId: line.lotId,
      bucket: line.bucket,
      qty,
      baseQty: qty,
      // A rate keyed and then un-ticked is not a charge: nothing is unloaded.
      unloadRate: draft.unloadEnabled ? num(line.unloadRate) : 0,
    });
  }
  return { dto: { header, lines }, sentKeys };
}

export type ReceivePostDto = { svhId: string; accYear: string; companyId: string; branchId: string };

export function buildPostBody(draft: InwardDraft): ReceivePostDto {
  return { svhId: draft.svhId, accYear: draft.accYear, companyId: draft.companyId, branchId: draft.branchId };
}
