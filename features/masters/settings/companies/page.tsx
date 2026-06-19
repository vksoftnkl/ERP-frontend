"use client";

import MasterModulePage from "@/features/masters/shared/module-page";
import { useCompaniesModule } from "./module";

export default function CompaniesFeaturePage() {
  const companiesModule = useCompaniesModule();

  return <MasterModulePage definition={companiesModule} />;
}
