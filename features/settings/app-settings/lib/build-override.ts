import type {
  EditableScope,
  EffectiveSetting,
  SaveAppSettingValueDto,
  ScopeTarget,
} from "../types";
import { hasOverrideAtScope } from "./scope";

/**
 * One entry of the `{ data: [...] }` write payload — and the three ways to get
 * it wrong, all of which cost real debugging on the Qt screen and none of which
 * is guessable from the DTOs.
 *
 * **The value is a STRING, whatever the data type.** `asv_value` is a `text`
 * column and the allowed-values trigger compares against a jsonb array of
 * strings, so a number or a boolean is refused outright. `toText` is the only
 * way a value reaches here.
 *
 * **`asvId` goes out ONLY when an override already sits at THIS scope.**
 * `override != null` is not that test: the override showing on the row may sit
 * at a broader layer, and editing narrower has to CREATE a row rather than move
 * that one. Without `asvId` the server upserts on the scope target, which is
 * exactly what creating means here. A client-minted id is by definition one the
 * server cannot find — `{"errors":[{"field":"data[0].asvId","message":"No
 * override found with id …"}]}` — so the key is omitted entirely rather than
 * sent as null.
 *
 * **Exactly ONE scope id, the one the scope names; the others are null.**
 * `ck_asv_scope_ids` is one-id-per-scope on the deployed database, and the
 * server says so plainly: *asvBranchId must be omitted when asvScope is DEVICE
 * — an override carries the id its scope names and nothing else*. (The
 * `10_app_settings.sql` in the share still carries an older cumulative form of
 * that constraint; the deployed one is the authority.)
 *
 * The ids are safe to send on the update path too, where the server checks each
 * one against the stored row and refuses a change: an override returned at this
 * scope was matched on the very id the bar is pointed at, so what is sent is
 * what is stored.
 */
export function buildOverride(
  setting: EffectiveSetting,
  scope: EditableScope,
  target: ScopeTarget,
  text: string,
): SaveAppSettingValueDto {
  const updatingHere = hasOverrideAtScope(setting, scope);
  return {
    ...(updatingHere ? { asvId: setting.override!.asvId } : {}),
    asvSettingKey: setting.asdKey,
    asvScope: scope,
    asvCompanyId: scope === "COMPANY" ? target.companyId : null,
    asvBranchId: scope === "BRANCH" ? target.branchId : null,
    asvDeviceId: scope === "DEVICE" ? target.deviceId : null,
    // This screen never edits a person's own preferences — that belongs in a
    // profile screen, not in an administrator's tool.
    asvUserId: null,
    asvValue: text,
  };
}
