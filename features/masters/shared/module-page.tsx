"use client";

import CrudMasterPage from "@/components/master/crud-master-page";
import type { CrudMasterPageProps } from "@/components/master/crud-master-page";
import type { MasterModuleDefinition } from "./types";

export function defineMasterModule<
  TRecord extends Record<string, unknown>,
  TFormValues extends Record<string, string>,
  TPayload extends Record<string, unknown>,
>(definition: MasterModuleDefinition<TRecord, TFormValues, TPayload>) {
  return definition;
}

export default function MasterModulePage<
  TRecord extends Record<string, unknown>,
  TFormValues extends Record<string, string>,
  TPayload extends Record<string, unknown>,
>({
  definition,
}: {
  definition: MasterModuleDefinition<TRecord, TFormValues, TPayload>;
}) {
  return <CrudMasterPage {...(definition as CrudMasterPageProps)} />;
}
