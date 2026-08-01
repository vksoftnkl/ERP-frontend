import { ERPDynamicSelectOption } from "@/components/design-system";
export  const COLLECTION_DAY_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
  { value: "7", label: "Sunday" },
];
// Same values as COLLECTION_DAY_OPTIONS with abbreviated labels, for the
// inline Mon–Sun checkbox row the legacy entry screens use.
export const COLLECTION_DAY_SHORT_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "1", label: "Mon" },
  { value: "2", label: "Tue" },
  { value: "3", label: "Wed" },
  { value: "4", label: "Thu" },
  { value: "5", label: "Fri" },
  { value: "6", label: "Sat" },
  { value: "7", label: "Sun" },
];
export const GST_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "REGULAR", label: "Regular" },
  { value: "COMPOSITION", label: "Composition" },
  { value: "UNREGISTERED", label: "Unregistered" },
];