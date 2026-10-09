/**
 * `GET /menu-masters/get?visibleOnly=false` — the tree the Permissions tab
 * paints, hidden menus included. Parsed by `domain/menuTree.ts`; nothing else reads the raw shape.
 */
export { useLoadMenuTreeMutation } from "@/store/api/userAdminApi";
export type { MenuTreeNodePayload } from "../domain/wire";
