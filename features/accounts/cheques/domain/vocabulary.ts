/**
 * The received register's words.
 *
 * It was meant to be the only thing that differed between Received Cheques
 * (menu 51) and Issued Cheques (menu 52). It is not: the issued side has its
 * own server module (`/issued-cheques` — bare keys, single-cheque verbs, no
 * deposit, no summary route) and so its own screen, under `../issued/`, which
 * reuses this register's pieces rather than this vocabulary.
 */
export type ChequeVocabulary = {
  /** `apd_tra_type`. */
  traType: "R" | "P";
  menuId: number;
  title: string;
  subtitle: string;
  /** The bulk verb: "Deposit" / "Present". */
  depositVerb: string;
  /** Its past tense, for the pill and the tile: "With bank". */
  partyLabel: string;
  /** Printed on the empty register. */
  emptyText: string;
};

export const RECEIVED_VOCABULARY: ChequeVocabulary = {
  traType: "R",
  menuId: 51,
  title: "Received Cheques",
  subtitle: "Cheques taken in on receipts: bank them, and record what the bank says",
  depositVerb: "Deposit",
  partyLabel: "Received from",
  emptyText: "No cheque matches these filters.",
};
