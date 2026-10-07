"use client";

/**
 * The provider dialog's lists, column by column — the grid SQL's own field
 * names (grids 128–130) and the endpoint /get's `fieldMaps[]`.
 */
import type { ReactNode } from "react";
import type { GstColumn } from "../components/gst-table";
import { ActivePill, EnvironmentPill, Pill } from "../components/controls";
import { toBool } from "../domain/part-form";
import type { GstGridRow } from "../gst.types";
import styles from "../gst.module.scss";

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function yesNo(value: unknown): string {
  return toBool(value) ? "Yes" : "No";
}

function count(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/** A path the provider has not confirmed yet cannot work (notes 79 §6). */
export function isUnconfirmedPath(path: unknown): boolean {
  return text(path).toUpperCase().includes("CONFIRM-PATH");
}

function muted(children: ReactNode): ReactNode {
  return <span className={styles.muted}>{children}</span>;
}

export const SERVICE_COLUMNS: readonly GstColumn<GstGridRow>[] = [
  { key: "gps_service", header: "Service" },
  { key: "gps_environment", header: "Environment", render: (row) => <EnvironmentPill environment={text(row.gps_environment)} /> },
  { key: "gps_base_url", header: "Base URL" },
  { key: "gps_auth_scheme", header: "Auth" },
  {
    key: "gps_token_ttl_minutes",
    header: "Token",
    align: "right",
    render: (row) => (text(row.gps_token_ttl_minutes) ? `${text(row.gps_token_ttl_minutes)} m` : ""),
  },
  { key: "gps_payload_encryption", header: "Encryption" },
  {
    key: "endpoint_count",
    header: "Endpoints",
    align: "right",
    render: (row) =>
      count(row.endpoint_count) > 0 ? (
        String(count(row.endpoint_count))
      ) : (
        <span className={styles.verifiedNever}>none yet</span>
      ),
  },
  { key: "gps_is_active", header: "Active", render: (row) => <ActivePill active={toBool(row.gps_is_active)} /> },
];

export const ENDPOINT_COLUMNS: readonly GstColumn<GstGridRow>[] = [
  { key: "gpe_action", header: "Action" },
  { key: "gpe_http_method", header: "Method" },
  {
    key: "gpe_path_template",
    header: "Path",
    render: (row) =>
      isUnconfirmedPath(row.gpe_path_template) ? (
        <Pill tone="amber" title={text(row.gpe_path_template)}>
          path not confirmed
        </Pill>
      ) : (
        `${text(row.gpe_path_template)}${text(row.gpe_query_template)}`
      ),
  },
  {
    key: "gpe_is_idempotent",
    header: "Idempotent",
    align: "center",
    render: (row) =>
      toBool(row.gpe_is_idempotent) ? <span className={styles.verifiedOk}>Yes</span> : "No",
  },
  { key: "field_map_count", header: "Field maps", align: "right", render: (row) => String(count(row.field_map_count)) },
  {
    key: "gpe_timeout_ms",
    header: "Timeout",
    align: "right",
    render: (row) => (text(row.gpe_timeout_ms) ? `${text(row.gpe_timeout_ms)} ms` : muted("service")),
  },
  { key: "gpe_is_active", header: "Active", render: (row) => <ActivePill active={toBool(row.gpe_is_active)} /> },
];

export const ERROR_MAP_COLUMNS: readonly GstColumn<GstGridRow>[] = [
  {
    key: "gem_service",
    header: "Service",
    render: (row) => (text(row.gem_service) === "(all)" ? muted("(all)") : text(row.gem_service)),
  },
  { key: "gem_their_code", header: "Their code" },
  { key: "gem_our_code", header: "Our code" },
  {
    key: "gem_treat_as",
    header: "Treat as",
    render: (row) => {
      const treatAs = text(row.gem_treat_as);
      return treatAs === "SUCCESS" ? <Pill tone="green">SUCCESS</Pill> : treatAs;
    },
  },
  { key: "gem_is_retryable", header: "Retry", align: "center", render: (row) => yesNo(row.gem_is_retryable) },
  { key: "gem_should_reauth", header: "Re-auth", align: "center", render: (row) => yesNo(row.gem_should_reauth) },
  { key: "gem_recovery_action", header: "Recovery" },
  { key: "gem_message", header: "Message" },
];

export const FIELD_MAP_COLUMNS: readonly GstColumn<Record<string, unknown>>[] = [
  { key: "gfmDirection", header: "Direction" },
  { key: "gfmOurField", header: "Our field" },
  { key: "gfmTheirPath", header: "Their path" },
  { key: "gfmTargetColumn", header: "Target column" },
  { key: "gfmTransform", header: "Transform" },
  { key: "gfmIsRequired", header: "Required", align: "center", render: (row) => yesNo(row.gfmIsRequired) },
];
