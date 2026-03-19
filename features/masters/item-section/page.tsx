"use client";
import { useEffect, useMemo, useState } from "react";
import CrudMasterPage from "@/components/master/crud-master-page";
import { useApi } from "@/hooks/useApi";
import type {
  ERPDynamicModalField,
  ERPDynamicSelectOption,
} from "@/components/library/ui/dynamic-modal-form";
import styles from "@/app/master/state-master/page.module.scss";
const API_ENDPOINTS = {
  list: "/item-sections/list",
  getById: "/item-sections/get",
  create: "/item-sections/create",
  delete: "/item-sections/delete",
} as const;
const GRID_TABLE_NAME = "item_section_master";
const LOOKUP_KEYS = {
  id: [
    "sec_id",
    "secId",
    "section_id",
    "sectionId",
    "id",
    "_id",
    "its_id",
    "itemsectionid",
    "item_section_id",
    "itemSectionId",
  ],
  code: [
    "sec_code",
    "secCode",
    "sec_alias",
    "sec_short",
    "section_code",
    "sectionCode",
    "code",
    "its_alias",
    "its_short",
    "sectionalias",
    "sectionshort",
  ],
  name: [
    "sec_name",
    "secName",
    "section_name",
    "sectionName",
    "name",
    "its_name",
    "itemsectionname",
    "item_section_name",
    "itemSectionName",
  ],
  short: [
    "sec_short",
    "its_short",
    "short_name",
    "shortName",
    "short",
    "sectionshort",
    "itemsectionshort",
    "item_section_short",
  ],
  alias: [
    "sec_alias",
    "its_alias",
    "alias",
    "section_alias",
    "sectionalias",
    "itemsectionalias",
    "item_section_alias",
  ],
  active: [
    "sec_active",
    "sec_is_active",
    "its_active",
    "active",
    "is_active",
    "isActive",
    "isactive",
    "status",
  ],
  position: ["sec_position", "position", "sec_sort", "its_sort", "sort"],
  description: ["sec_description", "its_description", "description", "desc"],
  array: [
    "data",
    "items",
    "results",
    "rows",
    "list",
    "sections",
    "itemSections",
    "item_sections",
  ],
} as const;
const REQUEST_PAYLOAD_KEYS = {
  id: "sec_id",
  name: "sec_name",
  alias: "sec_alias",
  short: "sec_short",
  description: "sec_description",
  sort: "sec_sort",
} as const;
const SECTION_PARENT_ID_KEYS = [
  "sec_parent_id",
  "section_parent_id",
  "parent_id",
  "parentId",
] as const;
const SECTION_LEVEL_KEYS = ["sec_level", "section_level", "level"] as const;
const SECTION_COLOR_CODE_KEYS = [
  "sec_color_code",
  "section_color_code",
  "color_code",
  "colorCode",
] as const;
const SECTION_ICON_KEYS = ["sec_icon", "section_icon", "icon"] as const;
const SECTION_PHOTO_URL_KEYS = ["sec_photo_url", "section_photo_url", "photo_url", "photoUrl"] as const;
const FILE_CONSTRAINTS = {
  MAX_UPLOAD_IMAGE_BYTES: 5 * 1024 * 1024,
  ALLOWED_MIME_TYPES: [
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
    "image/svg+xml",
  ] as const,
  DEBOUNCE_MS: 300,
} as const;
const SECTION_INITIAL_FORM_VALUES = {
  masterName: "",
  searchCode: "",
  masterAlias: "",
  masterShortName: "",
  position: "0",
  secParentId: "",
  secLevel: "0",  
  secColorCode: "",
  secIcon: "",
  secPhotoUrl: "",
  masterDescription: "",
} as const;
function buildSectionFormFields(sectionOptions: ERPDynamicSelectOption[]): ERPDynamicModalField[] {
  return [
    {
      name: "masterName",
      label: "Item Section Name",
      colSpan:2,
      required: true,
      validation: {
        minLength: 2,
        minLengthMessage: "Item Section Name must be at least 2 characters.",
      },
    },
   
    // {
    //   name: "masterAlias",
    //   label: "Section Alias",
    //   colSpan:2,
    // },
    {
      name: "masterShortName",
      label: "Short Name",
      colSpan:2,
    },
    {
      name: "position",
      label: "Position",
      type: "number",
      colSpan:1,
      min: 0,
      step: 1,
      validation: {
        minMessage: "Sort Order must be 0 or greater.",
      },
    },
    {
      name: "secParentId",
      label: "Parent Section ",
      type: "select",
      colSpan:2,
      searchable: true,
      options: sectionOptions,
    },
    
    {
      name: "secColorCode",
      label: "Color Code",
      type: "color",
      helperText: "Choose a color.",
      controlStyle: { width: "96px", padding: "0.2rem" },
    },
    {
      name: "masterDescription",
      label: "Description",
      colSpan: 2,
    },
    {
      name: "secPhoto",
      label: "Image",
      type: "file",
      accept: "image/*",
      maxFileSizeBytes: FILE_CONSTRAINTS.MAX_UPLOAD_IMAGE_BYTES,
      allowedMimeTypes: [...FILE_CONSTRAINTS.ALLOWED_MIME_TYPES],
      helperText: "Optional. Sent as base64 in sec_photo.",
      colSpan: 2,
    },
  ];
}

function getFirstDefinedValue(
  source: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return undefined;
}

function toDisplayValue(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "object") {
    const nested = value as Record<string, unknown>;
    const fallback = nested.id ?? nested._id ?? nested.value ?? nested.code ?? nested.name;
    if (
      typeof fallback === "string" ||
      typeof fallback === "number" ||
      typeof fallback === "bigint" ||
      typeof fallback === "boolean"
    ) {
      return String(fallback);
    }
  }

  return "";
}

function toInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toReferenceValue(value: string): string {
  const normalized = value.trim();
  return normalized;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read selected image."));
        return;
      }

      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("Unable to read selected image."));
    reader.readAsDataURL(file);
  });
}

function getBase64FromDataUrl(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

function extractRows(payload: unknown, arrayKeys: readonly string[]): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const root = payload as Record<string, unknown>;
  for (const key of arrayKeys) {
    const candidate = root[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }

    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      const nested = candidate as Record<string, unknown>;
      for (const nestedKey of arrayKeys) {
        const nestedCandidate = nested[nestedKey];
        if (Array.isArray(nestedCandidate)) {
          return nestedCandidate;
        }
      }
    }
  }

  return [];
}

function buildSectionOptions(payload: unknown): ERPDynamicSelectOption[] {
  const optionMap = new Map<string, string>();
  const rows = extractRows(payload, LOOKUP_KEYS.array);

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      continue;
    }

    const source = row as Record<string, unknown>;
    const id = toDisplayValue(getFirstDefinedValue(source, LOOKUP_KEYS.id));
    if (!id) {
      continue;
    }

    const name = toDisplayValue(getFirstDefinedValue(source, LOOKUP_KEYS.name));
    const label = name || id;

    if (!optionMap.has(id)) {
      optionMap.set(id, label);
    }
  }

  return Array.from(optionMap.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export default function ItemSectionMasterPage() {
  const { getAll: getSectionOptions } = useApi<unknown>(API_ENDPOINTS.list);
  const [sectionOptions, setSectionOptions] = useState<ERPDynamicSelectOption[]>([]);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const payload = await getSectionOptions({ page: "1", limit: "20" });
        if (mounted) {
          setSectionOptions(buildSectionOptions(payload));
        }
      } catch {
        if (mounted) {
          setSectionOptions([]);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [getSectionOptions]);

  const sectionFormFields = useMemo(
    () => buildSectionFormFields(sectionOptions),
    [sectionOptions],
  );

  return (
    <CrudMasterPage
      title="Item Section"
      entityLabel="item section"
      entityLabelPlural="item sections"
      apiEndpoints={API_ENDPOINTS}
      gridTableName={GRID_TABLE_NAME}
      lookupKeys={LOOKUP_KEYS}
      requestPayloadKeys={REQUEST_PAYLOAD_KEYS}
      styles={styles}
      listTitle="Item Section List"
      createLabel="Add "
      codeColumnHeader="Section Code"
      nameColumnHeader="Section Name"
      nameFieldLabel="Item Section Name"
      nameFieldPlaceholder="Frozen Foods"
      formTitle="Item Section Form"
      formDescription="Create and update item sections."
      customFields={sectionFormFields}
      createInitialValues={SECTION_INITIAL_FORM_VALUES}
      mapFormValues={({ source, defaults }) => {
        const rowSource = source ?? {};
        return {
          ...SECTION_INITIAL_FORM_VALUES,
          masterName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.name)) || defaults.masterName,
          searchCode:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.code)) || defaults.searchCode,
          masterAlias:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.alias)) ||
            defaults.masterAlias,
          masterShortName:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.short)) ||
            defaults.masterShortName,
          position:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.position)) ||
            defaults.position,
          secParentId: toDisplayValue(getFirstDefinedValue(rowSource, SECTION_PARENT_ID_KEYS)),
          secLevel: toDisplayValue(getFirstDefinedValue(rowSource, SECTION_LEVEL_KEYS)) || "0",
          secColorCode: toDisplayValue(getFirstDefinedValue(rowSource, SECTION_COLOR_CODE_KEYS)),
          secIcon: toDisplayValue(getFirstDefinedValue(rowSource, SECTION_ICON_KEYS)),
          secPhotoUrl: toDisplayValue(getFirstDefinedValue(rowSource, SECTION_PHOTO_URL_KEYS)),
          masterDescription:
            toDisplayValue(getFirstDefinedValue(rowSource, LOOKUP_KEYS.description)) ||
            defaults.masterDescription,
        };
      }}
      buildRequestPayload={async ({ values, shouldUpdate, editingItemId, files }) => {
        const sectionName = (values.masterName ?? "").trim();
        const searchCode = (values.searchCode ?? "").trim();
        const sectionAlias = (values.masterAlias ?? "").trim() || searchCode;
        const sectionShort = (values.masterShortName ?? "").trim() || searchCode || sectionAlias;
        const sectionDescription = (values.masterDescription ?? "").trim();
        const sectionSort = toInteger(values.position ?? "", 0);
        const uploadedImage = files.secPhoto;
        const secPhoto =
          uploadedImage && uploadedImage.size > 0
            ? getBase64FromDataUrl(await readFileAsDataUrl(uploadedImage))
            : "";

        return {
          sec_name: sectionName,
          sec_alias: sectionAlias,
          sec_short: sectionShort,
          sec_description: sectionDescription,
          sec_parent_id: toReferenceValue(values.secParentId ?? ""),
          sec_sort: sectionSort,
          sec_position: sectionSort,
          sec_color_code: (values.secColorCode ?? "").trim(),
          sec_icon: (values.secIcon ?? "").trim(),
          sec_photo: secPhoto,
          sec_photo_url: (values.secPhotoUrl ?? "").trim(),
          ...(shouldUpdate && editingItemId !== null ? { sec_id: editingItemId } : {}),
        };
      }}
    />
  );
}
