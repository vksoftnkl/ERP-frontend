"use client";
import { type CSSProperties, useMemo } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useMasterOptions } from "@/features/masters/shared";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/design-system/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
import {
  getFirstDefinedValue,
  toDisplayValue,
  toNullableString,
  toSelectBoolean,
  toUpdateId,
} from "@/app/master/_shared/crud-utils";
import {
  UserMenuTree,
  parseMenuPermissions,
} from "@/features/masters/settings/user-administration/user-menu-tree";
// ── API endpoints ─────────────────────────────────────────────────────────────
const API_ENDPOINTS = {
 list: "/configured-grid-sql/run?grid_id=29",
  getById: "/user-administration/get",
  create: "/user-administration/create",
  delete: "/user-administration/delete",
} as const;
const GRID_TABLE_NAME = "user_master";
const LOOKUP_ENDPOINT = "/master-lookups/name-id/all-accounts-and-masters";
// ── Lookup queries ────────────────────────────────────────────────────────────
const LOOKUP_QUERY_COMPANIES = { module: "companies", limit: "100" } as const;
const LOOKUP_QUERY_BRANCHES = { module: "branches", limit: "100" } as const;
// ── Grid / list key mapping ───────────────────────────────────────────────────
const LOOKUP_KEYS = {
  id: ["usrId", "usr_id", "id", "_id"],
  code: ["usrLoginName", "usr_login_name", "loginName"],
  name: ["usrDisplayName", "usr_display_name", "displayName", "name"],
  short: ["usrEmail", "usr_email", "email"],
  alias: ["usrType", "usr_type", "type"],
  active: ["usrIsActive", "usr_is_active", "isActive", "is_active"],
  position: ["position", "sort"],
  description: ["usrNotes", "usr_notes", "notes"],
  array: ["data", "items", "results", "rows", "list", "users", "user_masters"],
} as const;
// ── Request payload key mapping ───────────────────────────────────────────────
const REQUEST_PAYLOAD_KEYS = {
  id: "usrId",
  name: "usrDisplayName",
  alias: "usrLoginName",
  short: "usrEmail",
  description: "usrNotes",
  sort: "position",
} as const;
// ── UserType enum options ─────────────────────────────────────────────────────
const USER_TYPE_OPTIONS: ERPDynamicSelectOption[] = [
  { value: "", label: "Select User Type" },
  { value: "USER", label: "User" },
  { value: "CASHIER", label: "Cashier" },
  { value: "MANAGER", label: "Manager" },
  { value: "ADMIN", label: "Admin" },
  { value: "VIEWER", label: "Viewer" },
  { value: "SUPER ADMIN", label: "Super Admin " },
  { value: "SYSTEM", label: "System" },
];
// ── Lookup definitions ────────────────────────────────────────────────────────
const COMPANY_LOOKUP_DEFINITION = {
  query: LOOKUP_QUERY_COMPANIES,
  defaultOption: { value: "", label: "Select Company" } as ERPDynamicSelectOption,
  idKeys: ["id", "value"],
  labelKeys: ["name", "label"],
} as const;
const BRANCH_LOOKUP_DEFINITION = {
  query: LOOKUP_QUERY_BRANCHES,
  defaultOption: { value: "", label: "Select Branch" } as ERPDynamicSelectOption,
  idKeys: ["id", "value"],
  labelKeys: ["name", "label"],
} as const;
// ── Field name lists ──────────────────────────────────────────────────────────
const USER_TEXT_FIELD_NAMES = [
  "usrLoginName",
  "usrDisplayName",
  "usrFullName",
  "usrEmail",
  "usrMobileNo",
  "usrAvatarUrl",
  "usrTimezone",
  "usrLanguage",
  "usrType",
  "usrCompanyId",
  "usrBranchId",
  "usrNotes",
] as const;
const USER_BOOLEAN_FIELD_NAMES = [
  "usrMustChangePassword",
  "usrDesktopLogin",
  "usrWebLogin",
  "usrMobileLogin",
  "usrEditDate",
  "usrEditEntry",
  "usrEditRate",
  "usrIsActive",
] as const;
// ── Modal style ───────────────────────────────────────────────────────────────
const USER_MODAL_PANEL_STYLE: CSSProperties = {
  width: "min(92vw, 60rem)",
  height: "78vh",
  maxHeight: "78vh",
};
const CHECKBOX_FIELD_STYLE: CSSProperties = { paddingBlock: "0.45rem" };
const USER_FORM_MODE_FIELD = "__userFormMode";
// ── Initial form values ───────────────────────────────────────────────────────
const USER_INITIAL_FORM_VALUES: Record<string, string> = {
  [USER_FORM_MODE_FIELD]: "create",
  usrLoginName: "",
  usrDisplayName: "",
  usrFullName: "",
  usrEmail: "",
  usrMobileNo: "",
  usrAvatarUrl: "",
  usrPassword: "",
  usrTimezone: "UTC",
  usrLanguage: "en",
  usrType: "USER",
  usrCompanyId: "",
  usrBranchId: "",
  usrMustChangePassword: "false",
  usrDesktopLogin: "true",
  usrWebLogin: "true",
  usrMobileLogin: "false",
  usrEditDate: "false",
  usrEditEntry: "false",
  usrEditRate: "false",
  usrIsActive: "true",
  usrNotes: "",
  usrMenus: "[]",
};
// ── Form field builder ────────────────────────────────────────────────────────
function buildUserFormFields(
  companyOptions: ERPDynamicSelectOption[],
  branchOptions: ERPDynamicSelectOption[],
): ERPDynamicModalField[] {
  return [
    // ── Identity ──────────────────────────────────────────────────────────────
    {
      name: "__heading_identity",
      label: "Identity",
      type: "heading",
    },
    {
      name: "usrLoginName",
      label: "Login Name",
      required: true,
      validation: {
        maxLength: 50,
        maxLengthMessage: "Login name must be at most 50 characters.",
        minLength: 2,
        minLengthMessage: "Login name must be at least 2 characters.",
      },
    },
    {
      name: "usrFullName",
      label: "Full Name",
      validation: {
        maxLength: 150,
        maxLengthMessage: "Full name must be at most 150 characters.",
      },
    },
    {
      name: "usrEmail",
      label: "Email",
      type: "email",
      required: true,
      validation: {
        maxLength: 150,
        maxLengthMessage: "Email must be at most 150 characters.",
      },
    },
    {
      name: "usrMobileNo",
      label: "Mobile No",
      type: "tel",
      validation: {
        maxLength: 20,
        maxLengthMessage: "Mobile No must be at most 20 characters.",
      },
    },
    // ── Security ──────────────────────────────────────────────────────────────
    // {
    //   name: "__heading_security",
    //   label: "Security",
    //   type: "heading",
    // },
    {
      name: "usrPassword",
      label: "Password",
      type: "password",
      // requiredWhen: (values) => values[USER_FORM_MODE_FIELD] !== "update",
      // validation: {
      //   requiredMessage: "Password is required when creating a new user.",
      //   minLength: 6,
      //   minLengthMessage: "Password must be at least 6 characters.",
      // },
    },
    // ── Access ────────────────────────────────────────────────────────────────
    // {
    //   name: "__heading_access",
    //   label: "Company & Branch Access",
    //   type: "heading",
    // },
    {
      name: "usrCompanyId",
      label: "Company",
      type: "select",
      searchable: true,
      options: companyOptions,
    },
    {
      name: "usrType",
      label: "User Type",
      type: "select",
      required: true,
      searchable: false,
      options: USER_TYPE_OPTIONS,
    },
    {
      name: "usrBranchId",
      label: "Branch",
      type: "select",
      searchable: true,
      options: branchOptions,
    },
    // {
    //   name: "usrDisplayName",
    //   label: "Display Name",
    //   // required: true,
    //   validation: {
    //     maxLength: 100,
    //     maxLengthMessage: "Display name must be at most 100 characters.",
    //   },
    // },
    {
      name: "usrMustChangePassword",
      label: "Must Change Password on Next Login",
      type: "checkbox",
      fieldStyle: CHECKBOX_FIELD_STYLE,
    },
    // ── Login channels ────────────────────────────────────────────────────────
    // {
    //   name: "__heading_channels",
    //   label: "Login Channels",
    //   type: "heading",
    // },
    {
      name: "usrDesktopLogin",
      label: "Desktop Login Allowed",
      type: "checkbox",
      fieldStyle: CHECKBOX_FIELD_STYLE,
    },
    {
      name: "usrWebLogin",
      label: "Web Login Allowed",
      type: "checkbox",
      fieldStyle: CHECKBOX_FIELD_STYLE,
    },
    {
      name: "usrMobileLogin",
      label: "Mobile Login Allowed",
      type: "checkbox",
      fieldStyle: CHECKBOX_FIELD_STYLE,
    },
    // ── Legacy permissions ────────────────────────────────────────────────────
    // {
    //   name: "__heading_perms",
    //   label: "Edit Permissions",
    //   type: "heading",
    //   defaultExpanded: false,
    // },
    {
      name: "usrEditDate",
      label: "Allow Edit Date",
      type: "checkbox",
      fieldStyle: CHECKBOX_FIELD_STYLE,
    },
    {
      name: "usrEditEntry",
      label: "Allow Edit Entry",
      type: "checkbox",
      fieldStyle: CHECKBOX_FIELD_STYLE,
    },
    {
      name: "usrEditRate",
      label: "Allow Edit Rate",
      type: "checkbox",
      fieldStyle: CHECKBOX_FIELD_STYLE,
    },
    // ── Locale ────────────────────────────────────────────────────────────────
    // {
    //   name: "__heading_locale",
    //   label: "Locale",
    //   type: "heading",
    //   defaultExpanded: false,
    // },
    // {
    //   name: "usrTimezone",
    //   label: "Timezone",
    //   placeholder: "UTC",
    //   validation: {
    //     maxLength: 60,
    //     maxLengthMessage: "Timezone must be at most 60 characters.",
    //   },
    // },
    // {
    //   name: "usrLanguage",
    //   label: "Language",
    //   placeholder: "en",
    //   validation: {
    //     maxLength: 10,
    //     maxLengthMessage: "Language code must be at most 10 characters.",
    //   },
    // },
    // ── Status & Notes ────────────────────────────────────────────────────────
    // {
    //   name: "__heading_status",
    //   label: "Status & Notes",
    //   type: "heading",
    //   defaultExpanded: false,
    // },
    {
      name: "usrIsActive",
      label: "Active",
      type: "checkbox",
      fieldStyle: CHECKBOX_FIELD_STYLE,
    },
    {
      name: "usrNotes",
      label: "Admin Notes",
    },
    // ── Menu Permissions ──────────────────────────────────────────────────────
    {
      name: "__heading_menus",
      label: "Menu Permissions",
      type: "heading",
      defaultExpanded: false,
      sectionGridColumns: 1,
    },
    {
      name: "usrMenus",
      label: "",
      type: "custom",
      colSpan: 2,
      render: ({ value, setValue, disabled }) => (
        <UserMenuTree value={value} setValue={setValue} disabled={disabled} />
      ),
    },
  ];
}
// ── Value helper ──────────────────────────────────────────────────────────────
function toSnakeCase(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}
function getUserFieldValue(
  source: Record<string, unknown>,
  fieldName: string,
): unknown {
  return getFirstDefinedValue(source, [fieldName, toSnakeCase(fieldName)]);
}
function mapUserFormValues(
  source: Record<string, unknown> | null,
  defaults: Record<string, string>,
): Record<string, string> {
  const rowSource = source ?? {};
  const values: Record<string, string> = {
    ...USER_INITIAL_FORM_VALUES,
    ...defaults,
    [USER_FORM_MODE_FIELD]: "update",
  };
  for (const fieldName of USER_TEXT_FIELD_NAMES) {
    const resolved = toDisplayValue(getUserFieldValue(rowSource, fieldName));
    values[fieldName] = resolved || defaults[fieldName] || "";
  }
  for (const fieldName of USER_BOOLEAN_FIELD_NAMES) {
    const fallback = USER_INITIAL_FORM_VALUES[fieldName] ?? "false";
    values[fieldName] = toSelectBoolean(
      getUserFieldValue(rowSource, fieldName),
      fallback,
    );
  }
  // Never pre-fill the password field
  values.usrPassword = "";
  // Serialize existing menu permissions
  const rawMenus = rowSource.menus ?? rowSource.userMenus;
  if (Array.isArray(rawMenus) && rawMenus.length > 0) {
    const perms = rawMenus.map((m: Record<string, unknown>) => ({
      umMenuId: m.umMenuId,
      umCanView: Boolean(m.umCanView),
      umCanCreate: Boolean(m.umCanCreate),
      umCanEdit: Boolean(m.umCanEdit),
      umCanDelete: Boolean(m.umCanDelete),
      umCanPrint: Boolean(m.umCanPrint),
      umCanExport: Boolean(m.umCanExport),
    }));
    values.usrMenus = JSON.stringify(perms);
  } else {
    values.usrMenus = "[]";
  }
  return values;
}
// ── Page component ────────────────────────────────────────────────────────────
export default function UserAdministrationPage() {
  const { getAll: getCompanyLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { getAll: getBranchLookup } = useApi<unknown>(LOOKUP_ENDPOINT);
  const { options: companyOptions } = useMasterOptions({
    definition: COMPANY_LOOKUP_DEFINITION,
    load: getCompanyLookup,
  });
  const { options: branchOptions } = useMasterOptions({
    definition: BRANCH_LOOKUP_DEFINITION,
    load: getBranchLookup,
  });
  const filteredCompanyOptions = useMemo(
    () => companyOptions.filter((o) => o.value.trim().length > 0),
    [companyOptions],
  );
  const filteredBranchOptions = useMemo(
    () => branchOptions.filter((o) => o.value.trim().length > 0),
    [branchOptions],
  );
  const formFields = useMemo(
    () => buildUserFormFields(filteredCompanyOptions, filteredBranchOptions),
    [filteredCompanyOptions, filteredBranchOptions],
  );
  return (
    <CrudMasterPage
      title="User Administration"
      auditHistory={{ screenName: "User Administration" }}
      entityLabel="user"
      entityLabelPlural="users"
      apiEndpoints={API_ENDPOINTS}
      gridTableName={GRID_TABLE_NAME}
        listResponseStyleArrayKey=""
        gridDetailId={29}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="User List"
      createLabel="Add User"
      codeColumnHeader="Login Name"
      nameColumnHeader="Display Name"
      nameFieldLabel="Display Name"
      nameFieldPlaceholder="John Doe"
      formTitle="User Form"
      formDescription="Create and manage system users along with their login channels and permissions."
      customFields={formFields}
      createInitialValues={USER_INITIAL_FORM_VALUES}
      modalPanelStyle={USER_MODAL_PANEL_STYLE}
      modalFormGridColumns={2}
      modalFormDenseGrid={false}
      modalStackLabels={true}
      modalSectionNavigationMode="tabs"
      modalHideFieldHelperText
      modalHideFieldErrorText
      modalFocusFirstInvalidFieldOnValidationError
      modalEnableArrowKeyFieldNavigation
      mapFormValues={({ source, defaults }) =>
        mapUserFormValues(source, defaults)
      }
      buildRequestPayload={({ values, shouldUpdate, editingItemId }) => {
        const loginName = (values.usrLoginName ?? "").trim();
        const fullName = (values.usrFullName ?? "").trim();
        const displayName =
          (values.usrDisplayName ?? "").trim() || fullName || loginName;
        const payload: Record<string, unknown> = {
          usrLoginName: loginName,
          usrDisplayName: displayName,
          usrFullName: toNullableString(fullName),
          usrEmail: toNullableString(values.usrEmail ?? ""),
          usrMobileNo: toNullableString(values.usrMobileNo ?? ""),
          usrAvatarUrl: toNullableString(values.usrAvatarUrl ?? ""),
          usrTimezone: (values.usrTimezone ?? "").trim() || "UTC",
          usrLanguage: (values.usrLanguage ?? "").trim() || "en",
          usrType: toNullableString(values.usrType ?? ""),
          usrCompanyId: toNullableString(values.usrCompanyId ?? ""),
          usrBranchId: toNullableString(values.usrBranchId ?? ""),
          usrMustChangePassword: (values.usrMustChangePassword ?? "false") === "true",
          usrDesktopLogin: (values.usrDesktopLogin ?? "true") === "true",
          usrWebLogin: (values.usrWebLogin ?? "true") === "true",
          usrMobileLogin: (values.usrMobileLogin ?? "false") === "true",
          usrEditDate: (values.usrEditDate ?? "false") === "true",
          usrEditEntry: (values.usrEditEntry ?? "false") === "true",
          usrEditRate: (values.usrEditRate ?? "false") === "true",
          usrIsActive: (values.usrIsActive ?? "true") === "true",
          usrNotes: toNullableString(values.usrNotes ?? ""),
        };
        // Only include password when provided
        const password = (values.usrPassword ?? "").trim();
        if (password) {
          payload.usrPassword = password;
        }
        // Always include menus (replaces existing on update)
        payload.menus = parseMenuPermissions(values.usrMenus ?? "[]");
        if (shouldUpdate && editingItemId !== null) {
          payload.usrId = toUpdateId(editingItemId);
        }
        return payload;
      }}
    />
  );
}