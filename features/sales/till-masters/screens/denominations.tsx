"use client";

/** Denominations (menu 282, Till › Till Masters) — Qt `TillDenominationList` split out of the tabbed Till Masters. */
import { TillMasterList } from "../components/till-master-list";

export default function TillDenominationsScreen() {
  return <TillMasterList kind="denominations" />;
}
