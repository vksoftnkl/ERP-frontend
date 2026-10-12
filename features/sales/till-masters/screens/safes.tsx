"use client";

/** Till Safes (menu 280, Till › Till Masters) — Qt `TillSafeList` split out of the tabbed Till Masters. */
import { TillMasterList } from "../components/till-master-list";

export default function TillSafesScreen() {
  return <TillMasterList kind="safes" />;
}
