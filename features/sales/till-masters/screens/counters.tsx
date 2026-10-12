"use client";

/** Till Counters (menu 275, Till › Till Masters) — Qt `TillCounterList` split out of the tabbed Till Masters. */
import { TillMasterList } from "../components/till-master-list";

export default function TillCountersScreen() {
  return <TillMasterList kind="counters" />;
}
