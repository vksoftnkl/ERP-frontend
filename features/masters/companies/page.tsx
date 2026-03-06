"use client";

import MasterModulePage from "@/features/masters/shared/module-page";
import { companiesModule } from "./module";

export default function CompaniesFeaturePage() {
  return <MasterModulePage definition={companiesModule} />;
}
