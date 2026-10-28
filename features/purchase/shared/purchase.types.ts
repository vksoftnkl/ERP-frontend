/**
 * The purchase documents' common shapes — what the shared list and route hand
 * to each document's own entry screen.
 */
import type { ScreenMemoryOption } from "@/lib/use-screen-memory";

/** The five documents of the Purchase menu (Qt `TxnDocTypes::purchase*`). */
export type PurchaseDocType = "invoice" | "order" | "grn" | "return" | "shortage";

/**
 * A stored document's address. Every purchase table is partitioned by
 * accounting year, so the id alone does not find a row: the routes take
 * `<idKey>` + `accYear`; company and branch say whose it is.
 */
export type PurchaseDocKey = {
  id: string;
  companyId: string;
  branchId: string;
  accYear: string;
  refno: string;
  status: string;
};

/** The props every purchase entry screen takes from the shared route. */
export type PurchaseEntryViewProps = {
  /** The document to open; absent = a new one. */
  initialDocument?: PurchaseDocKey;
  /** "browse" opens read-only; "entry" opens for keying (a draft, or a new document). */
  initialMode: "browse" | "entry";
  /** Ctrl+O / the "‹ list" button. */
  onBackToList: () => void;
  /** Screen memory (lib/use-screen-memory): unsaved work survives a menu trip. */
  memory: ScreenMemoryOption;
};

/** The session's tenant — what a NEW document is raised under. */
export type PurchaseScope = {
  companyId: string;
  branchId: string;
  accYear: string;
  /** The registered device (fixed.device_master) signed into the token. */
  deviceId: string;
};
