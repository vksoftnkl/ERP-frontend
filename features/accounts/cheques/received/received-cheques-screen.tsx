"use client";

/**
 * Received Cheques — menu 51.
 *
 * The register of every cheque the receipt screen (menu 99) took in, and the
 * six moves each one can make: deposit, clear, bounce, re-present, replace,
 * return / cancel. The screen is the shared cheque register handed the
 * received vocabulary; Issued Cheques (menu 52) will be the same screen with
 * the issued one.
 */
import { ChequeRegisterScreen } from "../components/cheque-register-screen";
import { RECEIVED_VOCABULARY } from "../domain/vocabulary";

export default function ReceivedChequesScreen() {
  return <ChequeRegisterScreen words={RECEIVED_VOCABULARY} />;
}
