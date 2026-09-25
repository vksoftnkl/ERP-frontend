/**
 * Sale Bill — the GST actions (§21): e-invoice, e-way bill and the Part-B
 * vehicle update. The routes are not on the test box (404, §27 GST-404); the
 * screen calls them and shows the server's answer. Facade over the injected
 * endpoints, for the same reason as `api/bills.ts`.
 */
export {
  useGenerateEinvoiceMutation,
  useGenerateEwaybillMutation,
  useUpdateEwaybillVehicleMutation,
} from "@/store/api/saleBillApi";
export type { GstGenerateDto, GstVehicleDto } from "@/store/api/saleBillApi";
