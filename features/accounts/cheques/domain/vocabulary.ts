/**
 * The only thing that differs between Received Cheques (menu 51) and Issued
 * Cheques (menu 52): the words.
 *
 * It is one table read two ways (`apd_tra_type` R or P). We DEPOSIT a cheque
 * we received and PRESENT one we issued; the party is who it came FROM or who
 * it went TO. The state machine, the row and the actions never look at this —
 * the screen passes it to the components that print words.
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

export const ISSUED_VOCABULARY: ChequeVocabulary = {
  traType: "P",
  menuId: 52,
  title: "Issued Cheques",
  subtitle: "Cheques we have written: present them, and record what the bank says",
  depositVerb: "Present",
  partyLabel: "Issued to",
  emptyText: "No cheque matches these filters.",
};
