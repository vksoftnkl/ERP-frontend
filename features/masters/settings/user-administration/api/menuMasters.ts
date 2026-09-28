/**
 * `GET /menu-masters/get?visibleOnly=true` — the tree the Permissions tab
 * paints. Parsed by `domain/menuTree.ts`; nothing else reads the raw shape.
 */
export { useLoadMenuTreeMutation } from "@/store/api/userAdminApi";
export type { MenuTreeNodePayload } from "../domain/wire";
