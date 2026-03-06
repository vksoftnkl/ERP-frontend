"use client";

import MasterModulePage from "@/features/masters/shared/module-page";
import { stateModule } from "./module";

export default function StateMasterFeaturePage() {
  return <MasterModulePage definition={stateModule} />;
}
