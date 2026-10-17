-- ═══════════════════════════════════════════════════════════════════════════
--  Live sync — Till Reports grids (generated 2026-10-17 from the dev DB, for
--  the web port of Qt NexERP 425fa80..1d3e203, till notes 133).
--
--  WHAT: brings 11 configured grids on live up to dev, matched by NAME +
--  device type (ids differ between the databases) — the four tabs of Till
--  Reports (menu 288): cashier variance, exceptions, approver activity, safe
--  book. The web resolves each by name, fallback ids 159–169:
--              TILL RPT CASHIER VARIANCE (159)
--              TILL RPT CASHIER SESSIONS (160)
--              TILL RPT EXCEPTIONS (161)
--              TILL RPT EXCEPTION HOURS (162)
--              TILL RPT EXCEPTION EVENTS (163)
--              TILL RPT APPROVERS (164)
--              TILL RPT APPROVER DECISIONS (165)
--              TILL RPT UNDECIDED (166)
--              TILL RPT SAFE DAYS (167)
--              TILL RPT SAFE DAY LINES (168)
--              TILL RPT PEOPLE (169)
--  A row missing on live is inserted (keeping the dev id when live has it free,
--  so the web's fallback ids stay right); a row present is updated in place and
--  its column list replaced by dev's. No dropdown changes: the screen's pickers
--  are grids 133 / 136 / 157 and dropdown 61, already synced.
--
--  ORDER: run AFTER the server with the till notes 133 migration
--  (20261017110000_till_reports_menu_notes_133, which adds menu 288) is
--  deployed on live, and after 2026-10-15-till-grids.sql and
--  2026-10-16-cash-office-grids.sql if those have not run yet. The grids read
--  the notes-118 safe columns (tcm_remit_status, tsf_insured_limit) and the
--  approval tables (till_approval, till_approval_authority); before they exist
--  the guard below stops the script and nothing changes.
--
--  BACK UP FIRST (on the live server):
--    sudo -u postgres pg_dump erp -t fixed.grid_details -t fixed.grid_columns \
--         > /root/config-backup-$(date +%Y%m%d%H%M).sql
--  RUN:
--    sudo -u postgres psql erp -v ON_ERROR_STOP=1 -f 2026-10-17-till-report-grids.sql
--  One transaction: any error rolls the whole sync back.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
BEGIN;

-- ── guard: the server migrations these grids read must be in ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'accounts' AND table_name = 'till_cash_movement'
                    AND column_name = 'tcm_remit_status') THEN
    RAISE EXCEPTION 'accounts.till_cash_movement.tcm_remit_status is missing: deploy the server with the till notes 118 migration first. Nothing was changed.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'accounts' AND table_name = 'till_safe'
                    AND column_name = 'tsf_insured_limit') THEN
    RAISE EXCEPTION 'accounts.till_safe.tsf_insured_limit is missing: deploy the server with the till notes 118 migration first. Nothing was changed.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'accounts' AND table_name = 'till_approval') THEN
    RAISE EXCEPTION 'accounts.till_approval is missing: deploy the server with the till approval migrations first. Nothing was changed.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'accounts' AND table_name = 'till_approval_authority') THEN
    RAISE EXCEPTION 'accounts.till_approval_authority is missing: deploy the server with the till approval migrations first. Nothing was changed.';
  END IF;
END $$;

CREATE TEMP TABLE sync_grid (
  dev_id bigint, grid_name text, grid_device_type text, grid_description text, grid_sort_column text,
  grid_sort_order text, grid_sql text, grid_status boolean
) ON COMMIT DROP;
CREATE TEMP TABLE sync_grid_column (
  grid_name text, grid_device_type text, grid_column_number integer, grid_column_name text,
  grid_column_width numeric, grid_column_alignment text, grid_column_visibility boolean,
  grid_column_filter boolean, grid_column_condition text, grid_column_condition_color text,
  grid_column_group boolean, grid_column_total boolean, grid_column_data_type text, grid_column_color text,
  grid_column_notes text, grid_column_is_deleted boolean, grid_column_position numeric,
  grid_column_sql_field_name text, grid_column_px text
) ON COMMIT DROP;

-- ── grids ─────────────────────────────────────────────────────────────────
INSERT INTO pg_temp.sync_grid (dev_id, grid_name, grid_device_type, grid_description, grid_sort_column, grid_sort_order, grid_sql, grid_status) VALUES
  ('159', 'TILL RPT CASHIER VARIANCE', 'Desktop', 'Till Reports, Cashier variance tab: one row per cashier over a business-date range — sessions, hours, net sales, shorts / excesses (any cash difference at close), recounts, force closes, card/UPI gaps, pending, treatments. inoncash = ''1'' adds the non-cash gap to the net variance.', 'cashier', 'Ascending', 'SELECT u.usr_id AS cashier_id, COALESCE(u.usr_full_name, u.usr_login_name) AS cashier,
       count(*) AS sessions,
       sum(round((extract(epoch FROM (COALESCE(s.tss_closed_on, s.tss_billing_ended_on, now()) - s.tss_opened_on)) / 3600)::numeric, 1)) AS hours,
       sum(CASE WHEN s.tss_status = ''CLOSED'' THEN s.tss_net_sales ELSE 0 END) AS net_sales,
       count(*) FILTER (WHERE cv.tvr_variance < 0) AS short_n,
       sum(cv.tvr_variance) FILTER (WHERE cv.tvr_variance < 0) AS short_amt,
       count(*) FILTER (WHERE cv.tvr_variance > 0) AS excess_n,
       sum(cv.tvr_variance) FILTER (WHERE cv.tvr_variance > 0) AS excess_amt,
       COALESCE(sum(cv.tvr_variance), 0)
         + CASE WHEN ''inoncash'' = ''1'' THEN COALESCE(sum(s.tss_noncash_variance), 0) ELSE 0 END AS net_variance,
       round((COALESCE(sum(cv.tvr_variance), 0)
               + CASE WHEN ''inoncash'' = ''1'' THEN COALESCE(sum(s.tss_noncash_variance), 0) ELSE 0 END)
             / NULLIF(sum(CASE WHEN s.tss_status = ''CLOSED'' THEN s.tss_net_sales ELSE 0 END), 0) * 100000, 2) AS per_lakh,
       sum(GREATEST(s.tss_count_attempts - 1, 0)) AS recounts,
       count(*) FILTER (WHERE s.tss_force_closed) AS force_closed,
       sum(s.tss_noncash_variance) FILTER (WHERE s.tss_noncash_variance <> 0) AS noncash_gap,
       count(*) FILTER (WHERE cv.tvr_treatment = ''PENDING'') AS pending,
       concat_ws('' · '',
         ''PENDING '' || NULLIF(count(*) FILTER (WHERE cv.tvr_treatment = ''PENDING''), 0),
         ''EXPENSE '' || NULLIF(count(*) FILTER (WHERE cv.tvr_treatment = ''EXPENSE''), 0),
         ''RECOVER '' || NULLIF(count(*) FILTER (WHERE cv.tvr_treatment = ''RECOVER''), 0),
         ''SUSPENSE '' || NULLIF(count(*) FILTER (WHERE cv.tvr_treatment = ''SUSPENSE''), 0),
         ''RETENDERED '' || NULLIF(count(*) FILTER (WHERE cv.tvr_treatment = ''RETENDERED''), 0),
         ''WITHIN TOL. '' || NULLIF(count(*) FILTER (WHERE cv.tvr_treatment = ''WITHIN_TOLERANCE'' AND cv.tvr_variance <> 0), 0)
       ) AS treatments
  FROM accounts.till_session s
  LEFT JOIN public.user_master u ON u.usr_id = s.tss_operator_id
  LEFT JOIN LATERAL (SELECT v.tvr_expected, v.tvr_counted, v.tvr_variance, v.tvr_treatment, v.tvr_decided_by,
                          v.tvr_notes
                     FROM accounts.till_variance v
                    WHERE v.tvr_session_id = s.tss_id AND v.tvr_stage = ''CLOSE'' AND v.tvr_tender_type_id = 1
                      AND v.tvr_is_deleted = false AND v.tvr_status <> ''REVERSED''
                    ORDER BY v.tvr_created_on DESC LIMIT 1) cv ON true
 WHERE s.tss_is_deleted = false AND s.tss_status <> ''VOIDED''
   AND s.tss_company_id::text = ''icompany_id''
   AND (NULLIF(''ibranch_id'', '''') IS NULL OR s.tss_branch_id::text = ''ibranch_id'')
   AND s.tss_business_date::text >= ''ifrom_date'' AND s.tss_business_date::text <= ''ito_date''
   AND (NULLIF(''icounter_id'', '''') IS NULL OR s.tss_counter_id::text = ''icounter_id'')
   AND (NULLIF(''ioperator_id'', '''') IS NULL OR s.tss_operator_id::text = ''ioperator_id'')
 GROUP BY u.usr_id, u.usr_full_name, u.usr_login_name
 ORDER BY 2', true),
  ('160', 'TILL RPT CASHIER SESSIONS', 'Desktop', 'Till Reports, Cashier variance tab, lower grid: every session of the filter (the screen sends the picked cashier as ioperator_id), newest first, with its cash expected / counted / variance, attempts, treatment and who decided it.', 'tss_opened_on', 'Descending', 'SELECT s.tss_id, s.tss_acc_year, s.tss_company_id, s.tss_branch_id, s.tss_session_no,
       to_char(s.tss_business_date, ''DD-MM-YYYY'') AS business_date, c.tcn_code AS counter_code,
       COALESCE(u.usr_full_name, u.usr_login_name) AS cashier, round((extract(epoch FROM (COALESCE(s.tss_closed_on, s.tss_billing_ended_on, now()) - s.tss_opened_on)) / 3600)::numeric, 1) AS hours,
       CASE WHEN s.tss_status = ''CLOSED'' THEN s.tss_net_sales END AS net_sales,
       CASE WHEN s.tss_status = ''CLOSED'' THEN s.tss_cash_expected ELSE cv.tvr_expected END AS cash_expected,
       CASE WHEN s.tss_status = ''CLOSED'' THEN s.tss_cash_counted ELSE cv.tvr_counted END AS cash_counted,
       CASE WHEN s.tss_status = ''CLOSED'' THEN s.tss_cash_variance ELSE cv.tvr_variance END AS cash_variance,
       s.tss_count_attempts AS attempts,
       replace(COALESCE(cv.tvr_treatment, ''''), ''WITHIN_TOLERANCE'', ''WITHIN TOL.'') AS treatment,
       COALESCE(du.usr_full_name, du.usr_login_name, '''') AS decided_by,
       concat_ws('' · '', CASE WHEN s.tss_force_closed THEN ''FORCE CLOSED'' END, NULLIF(cv.tvr_notes, '''')) AS note,
       replace(s.tss_status, ''_'', '' '') AS status_text, s.tss_opened_on
  FROM accounts.till_session s
  JOIN accounts.till_counter c ON c.tcn_id = s.tss_counter_id
  LEFT JOIN public.user_master u ON u.usr_id = s.tss_operator_id
  LEFT JOIN LATERAL (SELECT v.tvr_expected, v.tvr_counted, v.tvr_variance, v.tvr_treatment, v.tvr_decided_by,
                          v.tvr_notes
                     FROM accounts.till_variance v
                    WHERE v.tvr_session_id = s.tss_id AND v.tvr_stage = ''CLOSE'' AND v.tvr_tender_type_id = 1
                      AND v.tvr_is_deleted = false AND v.tvr_status <> ''REVERSED''
                    ORDER BY v.tvr_created_on DESC LIMIT 1) cv ON true
  LEFT JOIN public.user_master du ON du.usr_id = cv.tvr_decided_by
 WHERE s.tss_is_deleted = false AND s.tss_status <> ''VOIDED''
   AND s.tss_company_id::text = ''icompany_id''
   AND (NULLIF(''ibranch_id'', '''') IS NULL OR s.tss_branch_id::text = ''ibranch_id'')
   AND s.tss_business_date::text >= ''ifrom_date'' AND s.tss_business_date::text <= ''ito_date''
   AND (NULLIF(''icounter_id'', '''') IS NULL OR s.tss_counter_id::text = ''icounter_id'')
   AND (NULLIF(''ioperator_id'', '''') IS NULL OR s.tss_operator_id::text = ''ioperator_id'')
 ORDER BY s.tss_business_date DESC, s.tss_opened_on DESC', true),
  ('161', 'TILL RPT EXCEPTIONS', 'Desktop', 'Till Reports, Exceptions tab: one row per person, the count of each exception (till_event) in the range. A PIN_FAIL is the person whose PIN was wrong; every other event is the session''s cashier.', 'person', 'Ascending', 'SELECT u.usr_id AS person_id, COALESCE(u.usr_full_name, u.usr_login_name) AS person,
       count(*) FILTER (WHERE x.code = ''PICKUP'') AS pickups,
       count(*) FILTER (WHERE x.code = ''TOP_UP'') AS top_ups,
       count(*) FILTER (WHERE x.code = ''SESSION_RECOUNT'') AS recounts,
       count(*) FILTER (WHERE x.code = ''SESSION_FORCE_CLOSE'') AS force_closed,
       count(*) FILTER (WHERE x.code = ''SESSION_REOPEN'') AS reopens,
       count(*) FILTER (WHERE x.code = ''PIN_FAIL'') AS pin_fails,
       count(*) FILTER (WHERE x.code = ''MOVEMENT_VOIDED'') AS movement_voids,
       count(*) FILTER (WHERE x.code = ''RETENDER'') AS retenders,
       count(*) FILTER (WHERE x.code = ''SESSION_SUSPEND'') AS suspends,
       count(*) FILTER (WHERE x.code = ''OVER_MAX_HOURS'') AS over_hours,
       count(*) FILTER (WHERE x.code = ''NO_SALE'') AS no_sales,
       count(*) AS total
  FROM public.user_master u
 CROSS JOIN LATERAL (SELECT k.code, e.tev_event_on AS at, e.tev_session_id AS sid, e.tev_amount AS amount, e.tev_src_refno AS ref,
               e.tev_reason_id AS reason_id, e.tev_device_id AS device_id, e.tev_payload AS payload,
               e.tev_user_id AS actor_id
          FROM accounts.till_event e
          LEFT JOIN accounts.till_session s ON s.tss_id = e.tev_session_id
         CROSS JOIN LATERAL (SELECT CASE WHEN e.tev_event_code = ''MOVEMENT_POSTED'' THEN e.tev_payload->>''kind''
                                         ELSE e.tev_event_code END AS code) k
         WHERE e.tev_company_id::text = ''icompany_id''
           AND (NULLIF(''ibranch_id'', '''') IS NULL OR e.tev_branch_id::text = ''ibranch_id'')
           AND (e.tev_event_on AT TIME ZONE ''Asia/Kolkata'')::date::text >= ''ifrom_date'' AND (e.tev_event_on AT TIME ZONE ''Asia/Kolkata'')::date::text <= ''ito_date''
           AND (NULLIF(''icounter_id'', '''') IS NULL OR COALESCE(e.tev_counter_id, s.tss_counter_id)::text = ''icounter_id'')
           AND k.code IN (''PICKUP'', ''TOP_UP'', ''SESSION_RECOUNT'', ''SESSION_FORCE_CLOSE'', ''SESSION_REOPEN'', ''PIN_FAIL'', ''MOVEMENT_VOIDED'', ''RETENDER'', ''SESSION_SUSPEND'', ''NO_SALE'')
           AND CASE WHEN k.code = ''PIN_FAIL'' THEN e.tev_user_id ELSE COALESCE(s.tss_operator_id, e.tev_user_id) END = u.usr_id
        UNION ALL
        SELECT ''OVER_MAX_HOURS'', s.tss_opened_on, s.tss_id, NULL::numeric, s.tss_session_no, NULL::uuid, s.tss_device_id,
               jsonb_build_object(''hours'', round((extract(epoch FROM (COALESCE(s.tss_closed_on, s.tss_billing_ended_on, now()) - s.tss_opened_on)) / 3600)::numeric, 1), ''max'', COALESCE(
         (SELECT NULLIF(v.asv_value, '''')::numeric FROM public.app_setting_value v
           WHERE v.asv_setting_key = ''till.session_max_hours'' AND v.asv_is_deleted = false
             AND ((v.asv_scope = ''BRANCH'' AND v.asv_branch_id = s.tss_branch_id)
                  OR (v.asv_scope = ''COMPANY'' AND v.asv_company_id = s.tss_company_id))
           ORDER BY CASE v.asv_scope WHEN ''BRANCH'' THEN 0 ELSE 1 END LIMIT 1),
         (SELECT NULLIF(d.asd_default_value, '''')::numeric FROM public.app_setting_def d
           WHERE d.asd_key = ''till.session_max_hours'' LIMIT 1), 14)), s.tss_operator_id
          FROM accounts.till_session s
         WHERE s.tss_is_deleted = false AND s.tss_status <> ''VOIDED''
   AND s.tss_company_id::text = ''icompany_id''
   AND (NULLIF(''ibranch_id'', '''') IS NULL OR s.tss_branch_id::text = ''ibranch_id'')
   AND s.tss_business_date::text >= ''ifrom_date'' AND s.tss_business_date::text <= ''ito_date''
   AND (NULLIF(''icounter_id'', '''') IS NULL OR s.tss_counter_id::text = ''icounter_id'') AND s.tss_operator_id = u.usr_id
           AND round((extract(epoch FROM (COALESCE(s.tss_closed_on, s.tss_billing_ended_on, now()) - s.tss_opened_on)) / 3600)::numeric, 1) > COALESCE(
         (SELECT NULLIF(v.asv_value, '''')::numeric FROM public.app_setting_value v
           WHERE v.asv_setting_key = ''till.session_max_hours'' AND v.asv_is_deleted = false
             AND ((v.asv_scope = ''BRANCH'' AND v.asv_branch_id = s.tss_branch_id)
                  OR (v.asv_scope = ''COMPANY'' AND v.asv_company_id = s.tss_company_id))
           ORDER BY CASE v.asv_scope WHEN ''BRANCH'' THEN 0 ELSE 1 END LIMIT 1),
         (SELECT NULLIF(d.asd_default_value, '''')::numeric FROM public.app_setting_def d
           WHERE d.asd_key = ''till.session_max_hours'' LIMIT 1), 14)) x
 WHERE (NULLIF(''ioperator_id'', '''') IS NULL OR u.usr_id::text = ''ioperator_id'') AND (NULLIF(''ievent'', '''') IS NULL OR x.code = ''ievent'')
 GROUP BY u.usr_id, u.usr_full_name, u.usr_login_name
 ORDER BY 2', true),
  ('162', 'TILL RPT EXCEPTION HOURS', 'Desktop', 'Till Reports, Exceptions tab, by-hour strip: the same exceptions counted by hour of day (IST, 0–23).', 'hr', 'Ascending', 'SELECT extract(hour FROM (x.at AT TIME ZONE ''Asia/Kolkata''))::int AS hr, count(*) AS events
  FROM public.user_master u
 CROSS JOIN LATERAL (SELECT k.code, e.tev_event_on AS at, e.tev_session_id AS sid, e.tev_amount AS amount, e.tev_src_refno AS ref,
               e.tev_reason_id AS reason_id, e.tev_device_id AS device_id, e.tev_payload AS payload,
               e.tev_user_id AS actor_id
          FROM accounts.till_event e
          LEFT JOIN accounts.till_session s ON s.tss_id = e.tev_session_id
         CROSS JOIN LATERAL (SELECT CASE WHEN e.tev_event_code = ''MOVEMENT_POSTED'' THEN e.tev_payload->>''kind''
                                         ELSE e.tev_event_code END AS code) k
         WHERE e.tev_company_id::text = ''icompany_id''
           AND (NULLIF(''ibranch_id'', '''') IS NULL OR e.tev_branch_id::text = ''ibranch_id'')
           AND (e.tev_event_on AT TIME ZONE ''Asia/Kolkata'')::date::text >= ''ifrom_date'' AND (e.tev_event_on AT TIME ZONE ''Asia/Kolkata'')::date::text <= ''ito_date''
           AND (NULLIF(''icounter_id'', '''') IS NULL OR COALESCE(e.tev_counter_id, s.tss_counter_id)::text = ''icounter_id'')
           AND k.code IN (''PICKUP'', ''TOP_UP'', ''SESSION_RECOUNT'', ''SESSION_FORCE_CLOSE'', ''SESSION_REOPEN'', ''PIN_FAIL'', ''MOVEMENT_VOIDED'', ''RETENDER'', ''SESSION_SUSPEND'', ''NO_SALE'')
           AND CASE WHEN k.code = ''PIN_FAIL'' THEN e.tev_user_id ELSE COALESCE(s.tss_operator_id, e.tev_user_id) END = u.usr_id
        UNION ALL
        SELECT ''OVER_MAX_HOURS'', s.tss_opened_on, s.tss_id, NULL::numeric, s.tss_session_no, NULL::uuid, s.tss_device_id,
               jsonb_build_object(''hours'', round((extract(epoch FROM (COALESCE(s.tss_closed_on, s.tss_billing_ended_on, now()) - s.tss_opened_on)) / 3600)::numeric, 1), ''max'', COALESCE(
         (SELECT NULLIF(v.asv_value, '''')::numeric FROM public.app_setting_value v
           WHERE v.asv_setting_key = ''till.session_max_hours'' AND v.asv_is_deleted = false
             AND ((v.asv_scope = ''BRANCH'' AND v.asv_branch_id = s.tss_branch_id)
                  OR (v.asv_scope = ''COMPANY'' AND v.asv_company_id = s.tss_company_id))
           ORDER BY CASE v.asv_scope WHEN ''BRANCH'' THEN 0 ELSE 1 END LIMIT 1),
         (SELECT NULLIF(d.asd_default_value, '''')::numeric FROM public.app_setting_def d
           WHERE d.asd_key = ''till.session_max_hours'' LIMIT 1), 14)), s.tss_operator_id
          FROM accounts.till_session s
         WHERE s.tss_is_deleted = false AND s.tss_status <> ''VOIDED''
   AND s.tss_company_id::text = ''icompany_id''
   AND (NULLIF(''ibranch_id'', '''') IS NULL OR s.tss_branch_id::text = ''ibranch_id'')
   AND s.tss_business_date::text >= ''ifrom_date'' AND s.tss_business_date::text <= ''ito_date''
   AND (NULLIF(''icounter_id'', '''') IS NULL OR s.tss_counter_id::text = ''icounter_id'') AND s.tss_operator_id = u.usr_id
           AND round((extract(epoch FROM (COALESCE(s.tss_closed_on, s.tss_billing_ended_on, now()) - s.tss_opened_on)) / 3600)::numeric, 1) > COALESCE(
         (SELECT NULLIF(v.asv_value, '''')::numeric FROM public.app_setting_value v
           WHERE v.asv_setting_key = ''till.session_max_hours'' AND v.asv_is_deleted = false
             AND ((v.asv_scope = ''BRANCH'' AND v.asv_branch_id = s.tss_branch_id)
                  OR (v.asv_scope = ''COMPANY'' AND v.asv_company_id = s.tss_company_id))
           ORDER BY CASE v.asv_scope WHEN ''BRANCH'' THEN 0 ELSE 1 END LIMIT 1),
         (SELECT NULLIF(d.asd_default_value, '''')::numeric FROM public.app_setting_def d
           WHERE d.asd_key = ''till.session_max_hours'' LIMIT 1), 14)) x
 WHERE (NULLIF(''ioperator_id'', '''') IS NULL OR u.usr_id::text = ''ioperator_id'') AND (NULLIF(''ievent'', '''') IS NULL OR x.code = ''ievent'')
 GROUP BY 1
 ORDER BY 1', true),
  ('163', 'TILL RPT EXCEPTION EVENTS', 'Desktop', 'Till Reports, Exceptions tab, event list: the exceptions themselves, newest first. ihour = '''' or 0–23.', 'at', 'Descending', 'SELECT x.at, to_char(x.at AT TIME ZONE ''Asia/Kolkata'', ''DD-MM-YYYY HH12:MI AM'') AS at_text,
       COALESCE(s.tss_session_no, '''') AS session_no, s.tss_id, s.tss_acc_year, s.tss_company_id, s.tss_branch_id,
       COALESCE(c.tcn_code, '''') AS counter_code, COALESCE(u.usr_full_name, u.usr_login_name) AS person,
       x.code AS event_code, x.amount,
       concat_ws('' · '', NULLIF(r.trs_name, ''''), NULLIF(x.ref, ''''), x.payload->>''event'',
                 CASE WHEN x.code = ''OVER_MAX_HOURS''
                      THEN (x.payload->>''hours'') || '' h open (limit '' || (x.payload->>''max'') || '')'' END,
                 CASE WHEN x.actor_id IS DISTINCT FROM u.usr_id
                      THEN ''by '' || COALESCE(au.usr_full_name, au.usr_login_name) END) AS detail,
       COALESCE(d.dev_device_name, '''') AS device
  FROM public.user_master u
 CROSS JOIN LATERAL (SELECT k.code, e.tev_event_on AS at, e.tev_session_id AS sid, e.tev_amount AS amount, e.tev_src_refno AS ref,
               e.tev_reason_id AS reason_id, e.tev_device_id AS device_id, e.tev_payload AS payload,
               e.tev_user_id AS actor_id
          FROM accounts.till_event e
          LEFT JOIN accounts.till_session s ON s.tss_id = e.tev_session_id
         CROSS JOIN LATERAL (SELECT CASE WHEN e.tev_event_code = ''MOVEMENT_POSTED'' THEN e.tev_payload->>''kind''
                                         ELSE e.tev_event_code END AS code) k
         WHERE e.tev_company_id::text = ''icompany_id''
           AND (NULLIF(''ibranch_id'', '''') IS NULL OR e.tev_branch_id::text = ''ibranch_id'')
           AND (e.tev_event_on AT TIME ZONE ''Asia/Kolkata'')::date::text >= ''ifrom_date'' AND (e.tev_event_on AT TIME ZONE ''Asia/Kolkata'')::date::text <= ''ito_date''
           AND (NULLIF(''icounter_id'', '''') IS NULL OR COALESCE(e.tev_counter_id, s.tss_counter_id)::text = ''icounter_id'')
           AND k.code IN (''PICKUP'', ''TOP_UP'', ''SESSION_RECOUNT'', ''SESSION_FORCE_CLOSE'', ''SESSION_REOPEN'', ''PIN_FAIL'', ''MOVEMENT_VOIDED'', ''RETENDER'', ''SESSION_SUSPEND'', ''NO_SALE'')
           AND CASE WHEN k.code = ''PIN_FAIL'' THEN e.tev_user_id ELSE COALESCE(s.tss_operator_id, e.tev_user_id) END = u.usr_id
        UNION ALL
        SELECT ''OVER_MAX_HOURS'', s.tss_opened_on, s.tss_id, NULL::numeric, s.tss_session_no, NULL::uuid, s.tss_device_id,
               jsonb_build_object(''hours'', round((extract(epoch FROM (COALESCE(s.tss_closed_on, s.tss_billing_ended_on, now()) - s.tss_opened_on)) / 3600)::numeric, 1), ''max'', COALESCE(
         (SELECT NULLIF(v.asv_value, '''')::numeric FROM public.app_setting_value v
           WHERE v.asv_setting_key = ''till.session_max_hours'' AND v.asv_is_deleted = false
             AND ((v.asv_scope = ''BRANCH'' AND v.asv_branch_id = s.tss_branch_id)
                  OR (v.asv_scope = ''COMPANY'' AND v.asv_company_id = s.tss_company_id))
           ORDER BY CASE v.asv_scope WHEN ''BRANCH'' THEN 0 ELSE 1 END LIMIT 1),
         (SELECT NULLIF(d.asd_default_value, '''')::numeric FROM public.app_setting_def d
           WHERE d.asd_key = ''till.session_max_hours'' LIMIT 1), 14)), s.tss_operator_id
          FROM accounts.till_session s
         WHERE s.tss_is_deleted = false AND s.tss_status <> ''VOIDED''
   AND s.tss_company_id::text = ''icompany_id''
   AND (NULLIF(''ibranch_id'', '''') IS NULL OR s.tss_branch_id::text = ''ibranch_id'')
   AND s.tss_business_date::text >= ''ifrom_date'' AND s.tss_business_date::text <= ''ito_date''
   AND (NULLIF(''icounter_id'', '''') IS NULL OR s.tss_counter_id::text = ''icounter_id'') AND s.tss_operator_id = u.usr_id
           AND round((extract(epoch FROM (COALESCE(s.tss_closed_on, s.tss_billing_ended_on, now()) - s.tss_opened_on)) / 3600)::numeric, 1) > COALESCE(
         (SELECT NULLIF(v.asv_value, '''')::numeric FROM public.app_setting_value v
           WHERE v.asv_setting_key = ''till.session_max_hours'' AND v.asv_is_deleted = false
             AND ((v.asv_scope = ''BRANCH'' AND v.asv_branch_id = s.tss_branch_id)
                  OR (v.asv_scope = ''COMPANY'' AND v.asv_company_id = s.tss_company_id))
           ORDER BY CASE v.asv_scope WHEN ''BRANCH'' THEN 0 ELSE 1 END LIMIT 1),
         (SELECT NULLIF(d.asd_default_value, '''')::numeric FROM public.app_setting_def d
           WHERE d.asd_key = ''till.session_max_hours'' LIMIT 1), 14)) x
  LEFT JOIN accounts.till_session s ON s.tss_id = x.sid
  LEFT JOIN accounts.till_counter c ON c.tcn_id = s.tss_counter_id
  LEFT JOIN accounts.till_reason r ON r.trs_id = x.reason_id
  LEFT JOIN public.user_master au ON au.usr_id = x.actor_id
  LEFT JOIN fixed.device_master d ON d.dev_id = x.device_id
 WHERE (NULLIF(''ioperator_id'', '''') IS NULL OR u.usr_id::text = ''ioperator_id'') AND (NULLIF(''ievent'', '''') IS NULL OR x.code = ''ievent'')
   AND (NULLIF(''ihour'', '''') IS NULL OR extract(hour FROM (x.at AT TIME ZONE ''Asia/Kolkata''))::int::text = ''ihour'')
 ORDER BY x.at DESC', true),
  ('164', 'TILL RPT APPROVERS', 'Desktop', 'Till Reports, Approver activity tab: one row per approver — till_approval decided in the range: approved / recount / rejected, amounts, own-session decisions, median wait, by event. Level = the approver''s active 285 grants (SUPER ADMIN = implicit HO FINANCE).', 'approver', 'Ascending', 'SELECT u.usr_id AS approver_id, COALESCE(u.usr_full_name, u.usr_login_name) AS approver,
       COALESCE(NULLIF(concat_ws('' / '',
         CASE WHEN u.usr_type = ''SUPER ADMIN'' THEN ''HO FINANCE'' END,
         (SELECT string_agg(DISTINCT replace(g.taa_role, ''_'', '' ''), '' / '')
            FROM accounts.till_approval_authority g
           WHERE g.taa_user_id = u.usr_id AND g.taa_is_deleted = false AND g.taa_is_active
             AND (g.taa_company_id IS NULL OR g.taa_company_id::text = ''icompany_id''))), ''''), ''—'') AS level,
       count(*) AS decided,
       count(*) FILTER (WHERE a.tap_status = ''APPROVED'') AS approved,
       count(*) FILTER (WHERE CASE WHEN a.tap_status = ''APPROVED'' THEN ''APPROVED''
                  WHEN a.tap_rule_snapshot->>''decision'' = ''RECOUNT'' THEN ''RECOUNT'' ELSE ''REJECTED'' END = ''RECOUNT'') AS recounts,
       count(*) FILTER (WHERE CASE WHEN a.tap_status = ''APPROVED'' THEN ''APPROVED''
                  WHEN a.tap_rule_snapshot->>''decision'' = ''RECOUNT'' THEN ''RECOUNT'' ELSE ''REJECTED'' END = ''REJECTED'') AS rejected,
       sum(abs(a.tap_amount)) FILTER (WHERE a.tap_status = ''APPROVED'') AS amount_approved,
       max(abs(a.tap_amount)) FILTER (WHERE a.tap_status = ''APPROVED'') AS largest,
       count(*) FILTER (WHERE a.tap_decided_by = s.tss_operator_id) AS own_session,
       CASE WHEN (percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (a.tap_decided_on - a.tap_requested_on)) / 60)) IS NULL THEN ''''
            WHEN (percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (a.tap_decided_on - a.tap_requested_on)) / 60)) < 60 THEN round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (a.tap_decided_on - a.tap_requested_on)) / 60)))::int || '' min''
            ELSE floor((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (a.tap_decided_on - a.tap_requested_on)) / 60)) / 60)::int || '' h '' || (round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (a.tap_decided_on - a.tap_requested_on)) / 60)))::int % 60) || '' min'' END AS median_wait,
       (SELECT string_agg(q.ev || '' '' || q.n, '' · '' ORDER BY q.n DESC, q.ev)
          FROM (SELECT a2.tap_event_code AS ev, count(*) AS n FROM accounts.till_approval a2
                 WHERE a2.tap_is_deleted = false AND a2.tap_company_id::text = ''icompany_id''
   AND (NULLIF(''ibranch_id'', '''') IS NULL OR a2.tap_branch_id::text = ''ibranch_id'')
   AND (NULLIF(''icounter_id'', '''') IS NULL OR a2.tap_counter_id::text = ''icounter_id'')
   AND (NULLIF(''ioperator_id'', '''') IS NULL OR a2.tap_requested_by::text = ''ioperator_id'') AND (a2.tap_decided_on AT TIME ZONE ''Asia/Kolkata'')::date::text >= ''ifrom_date'' AND (a2.tap_decided_on AT TIME ZONE ''Asia/Kolkata'')::date::text <= ''ito_date'' AND a2.tap_decided_by = u.usr_id
                 GROUP BY 1) q) AS by_event
  FROM accounts.till_approval a
  JOIN public.user_master u ON u.usr_id = a.tap_decided_by
  LEFT JOIN accounts.till_session s ON s.tss_id = a.tap_session_id
 WHERE a.tap_is_deleted = false AND a.tap_company_id::text = ''icompany_id''
   AND (NULLIF(''ibranch_id'', '''') IS NULL OR a.tap_branch_id::text = ''ibranch_id'')
   AND (NULLIF(''icounter_id'', '''') IS NULL OR a.tap_counter_id::text = ''icounter_id'')
   AND (NULLIF(''ioperator_id'', '''') IS NULL OR a.tap_requested_by::text = ''ioperator_id'') AND (a.tap_decided_on AT TIME ZONE ''Asia/Kolkata'')::date::text >= ''ifrom_date'' AND (a.tap_decided_on AT TIME ZONE ''Asia/Kolkata'')::date::text <= ''ito_date''
   AND (NULLIF(''iapprover_id'', '''') IS NULL OR a.tap_decided_by::text = ''iapprover_id'')
 GROUP BY u.usr_id, u.usr_full_name, u.usr_login_name, u.usr_type
 ORDER BY 2', true),
  ('165', 'TILL RPT APPROVER DECISIONS', 'Desktop', 'Till Reports, Approver activity tab, lower grid: the decisions of the range (iapprover_id = '''' for everyone), newest first: event, session / document, requester, amount, decision, wait, channel, own.', 'tap_decided_on', 'Descending', 'SELECT a.tap_id, a.tap_decided_on, to_char(a.tap_decided_on AT TIME ZONE ''Asia/Kolkata'', ''DD-MM-YYYY HH12:MI AM'') AS decided_at,
       a.tap_event_code AS event_code, COALESCE(a.tap_src_refno, s.tss_session_no, '''') AS ref,
       s.tss_id, s.tss_acc_year, s.tss_company_id, s.tss_branch_id,
       COALESCE(ru.usr_full_name, ru.usr_login_name, '''') AS requested_by,
       COALESCE(u.usr_full_name, u.usr_login_name) AS approver, abs(a.tap_amount) AS amount,
       CASE WHEN a.tap_status = ''APPROVED'' THEN ''APPROVED''
                  WHEN a.tap_rule_snapshot->>''decision'' = ''RECOUNT'' THEN ''RECOUNT'' ELSE ''REJECTED'' END AS decision,
       CASE WHEN (extract(epoch FROM (a.tap_decided_on - a.tap_requested_on)) / 60) IS NULL THEN ''''
            WHEN (extract(epoch FROM (a.tap_decided_on - a.tap_requested_on)) / 60) < 60 THEN round((extract(epoch FROM (a.tap_decided_on - a.tap_requested_on)) / 60))::int || '' min''
            ELSE floor((extract(epoch FROM (a.tap_decided_on - a.tap_requested_on)) / 60) / 60)::int || '' h '' || (round((extract(epoch FROM (a.tap_decided_on - a.tap_requested_on)) / 60))::int % 60) || '' min'' END AS wait,
       replace(COALESCE(a.tap_channel, ''''), ''_'', '' '') AS channel,
       CASE WHEN a.tap_decided_by = s.tss_operator_id THEN ''OWN'' ELSE '''' END AS own,
       COALESCE(a.tap_decision_note, '''') AS note
  FROM accounts.till_approval a
  JOIN public.user_master u ON u.usr_id = a.tap_decided_by
  LEFT JOIN public.user_master ru ON ru.usr_id = a.tap_requested_by
  LEFT JOIN accounts.till_session s ON s.tss_id = a.tap_session_id
 WHERE a.tap_is_deleted = false AND a.tap_company_id::text = ''icompany_id''
   AND (NULLIF(''ibranch_id'', '''') IS NULL OR a.tap_branch_id::text = ''ibranch_id'')
   AND (NULLIF(''icounter_id'', '''') IS NULL OR a.tap_counter_id::text = ''icounter_id'')
   AND (NULLIF(''ioperator_id'', '''') IS NULL OR a.tap_requested_by::text = ''ioperator_id'') AND (a.tap_decided_on AT TIME ZONE ''Asia/Kolkata'')::date::text >= ''ifrom_date'' AND (a.tap_decided_on AT TIME ZONE ''Asia/Kolkata'')::date::text <= ''ito_date''
   AND (NULLIF(''iapprover_id'', '''') IS NULL OR a.tap_decided_by::text = ''iapprover_id'')
 ORDER BY a.tap_decided_on DESC', true),
  ('166', 'TILL RPT UNDECIDED', 'Desktop', 'Till Reports, Approver activity tab, the ''not decided'' band: requests of the range still PENDING or EXPIRED (never decided), newest first.', 'tap_requested_on', 'Descending', 'SELECT a.tap_id, a.tap_requested_on, a.tap_status, a.tap_event_code AS event_code,
       COALESCE(a.tap_src_refno, s.tss_session_no, '''') AS ref, COALESCE(c.tcn_code, '''') AS counter_code,
       abs(a.tap_amount) AS amount, COALESCE(ru.usr_full_name, ru.usr_login_name, '''') AS requested_by,
       to_char(a.tap_requested_on AT TIME ZONE ''Asia/Kolkata'', ''DD-MM-YYYY HH12:MI AM'') AS requested_at,
       CASE WHEN (extract(epoch FROM (COALESCE(CASE WHEN a.tap_status = ''EXPIRED'' THEN a.tap_expires_on END, now()) - a.tap_requested_on)) / 60) IS NULL THEN ''''
            WHEN (extract(epoch FROM (COALESCE(CASE WHEN a.tap_status = ''EXPIRED'' THEN a.tap_expires_on END, now()) - a.tap_requested_on)) / 60) < 60 THEN round((extract(epoch FROM (COALESCE(CASE WHEN a.tap_status = ''EXPIRED'' THEN a.tap_expires_on END, now()) - a.tap_requested_on)) / 60))::int || '' min''
            ELSE floor((extract(epoch FROM (COALESCE(CASE WHEN a.tap_status = ''EXPIRED'' THEN a.tap_expires_on END, now()) - a.tap_requested_on)) / 60) / 60)::int || '' h '' || (round((extract(epoch FROM (COALESCE(CASE WHEN a.tap_status = ''EXPIRED'' THEN a.tap_expires_on END, now()) - a.tap_requested_on)) / 60))::int % 60) || '' min'' END AS waited
  FROM accounts.till_approval a
  LEFT JOIN public.user_master ru ON ru.usr_id = a.tap_requested_by
  LEFT JOIN accounts.till_session s ON s.tss_id = a.tap_session_id
  LEFT JOIN accounts.till_counter c ON c.tcn_id = COALESCE(a.tap_counter_id, s.tss_counter_id)
 WHERE a.tap_is_deleted = false AND a.tap_company_id::text = ''icompany_id''
   AND (NULLIF(''ibranch_id'', '''') IS NULL OR a.tap_branch_id::text = ''ibranch_id'')
   AND (NULLIF(''icounter_id'', '''') IS NULL OR a.tap_counter_id::text = ''icounter_id'')
   AND (NULLIF(''ioperator_id'', '''') IS NULL OR a.tap_requested_by::text = ''ioperator_id'') AND a.tap_status IN (''PENDING'', ''EXPIRED'')
   AND (a.tap_requested_on AT TIME ZONE ''Asia/Kolkata'')::date::text >= ''ifrom_date'' AND (a.tap_requested_on AT TIME ZONE ''Asia/Kolkata'')::date::text <= ''ito_date''
   AND (''iapprover_id'' = ''iapprover_id'')
 ORDER BY a.tap_requested_on DESC', true),
  ('167', 'TILL RPT SAFE DAYS', 'Desktop', 'Till Reports, Safe book tab: one safe (isafe_id), one row per day of the range — opening, cash from tills, floats / top-ups out, remitted, other, book closing, the day''s SAFE count and its difference, bags awaiting, bag differences, insured limit. Cash Office flow rules (grid 158), all time.', 'day', 'Ascending', 'SELECT g.d::date AS day, to_char(g.d, ''DD-MM-YYYY'') AS day_text, op.opening,
       COALESCE(fl.from_tills, 0) AS from_tills, -COALESCE(fl.floats_out, 0) AS floats_out,
       -COALESCE(fl.topups_out, 0) AS topups_out, -COALESCE(fl.remitted, 0) AS remitted,
       COALESCE(fl.other, 0) AS other,
       op.opening + COALESCE(fl.net, 0) AS book_closing,
       cnt.counted, cnt.diff,
       (SELECT count(*) FROM accounts.till_cash_movement m
         WHERE m.tcm_safe_id = sf.tsf_id AND m.tcm_is_deleted = false AND m.tcm_status = ''POSTED''
           AND m.tcm_receipt_status = ''AWAITING'' AND m.tcm_created_on >= b.t0 AND m.tcm_created_on < b.t1) AS bags_awaiting,
       (SELECT sum(m.tcm_received_amount - m.tcm_amount) FROM accounts.till_cash_movement m
         WHERE m.tcm_safe_id = sf.tsf_id AND m.tcm_is_deleted = false AND m.tcm_status = ''POSTED''
           AND m.tcm_receipt_status = ''RECEIVED'' AND m.tcm_received_amount <> m.tcm_amount
           AND m.tcm_received_on >= b.t0 AND m.tcm_received_on < b.t1) AS bag_diff,
       CASE WHEN sf.tsf_insured_limit > 0
                 AND op.opening + COALESCE(fl.from_tills, 0) + GREATEST(COALESCE(fl.other, 0), 0) > sf.tsf_insured_limit
            THEN ''OVER LIMIT'' ELSE '''' END AS limit_flag,
       sf.tsf_insured_limit
  FROM accounts.till_safe sf
 CROSS JOIN LATERAL generate_series(to_date(''ifrom_date'', ''YYYY-MM-DD''), to_date(''ito_date'', ''YYYY-MM-DD''),
                                    interval ''1 day'') g(d)
 CROSS JOIN LATERAL (SELECT (g.d::date)::timestamp AT TIME ZONE ''Asia/Kolkata'' AS t0,
                          (g.d::date + 1)::timestamp AT TIME ZONE ''Asia/Kolkata'' AS t1) b
 CROSS JOIN LATERAL (
        SELECT COALESCE(lc.total, 0)
               + COALESCE((SELECT sum(CASE WHEN f.cat IN (''CLOSE_HANDOVER'', (''DR'' || ''OP''), ''PICKUP'', ''TRANSFER_IN'', ''MONEY_IN'') THEN f.amt WHEN f.cat IN (''FLOAT_ISSUE'', ''TOP_UP'', ''REMIT'', ''SAFE_TRANSFER'', ''MONEY_OUT'') THEN -f.amt ELSE 0 END) FROM (
        SELECT m.tcm_kind::text AS cat, x.at AS sb_at, x.amt, m.tcm_doc_no AS doc_no,
               concat_ws('' · '', s.tss_session_no, COALESCE(u.usr_full_name, u.usr_login_name)) AS who
          FROM accounts.till_cash_movement m
          LEFT JOIN accounts.till_session s ON s.tss_id = m.tcm_session_id
          LEFT JOIN public.user_master u ON u.usr_id = COALESCE(s.tss_operator_id, m.tcm_done_by)
         CROSS JOIN LATERAL (VALUES (m.tcm_created_on, m.tcm_amount),
                                    (m.tcm_voided_on, -m.tcm_amount)) AS x(at, amt)
         WHERE m.tcm_safe_id = sf.tsf_id AND m.tcm_is_deleted = false AND m.tcm_receipt_status IS NULL
           AND m.tcm_kind IN (''CLOSE_HANDOVER'', (''DR'' || ''OP''), ''PICKUP'', ''FLOAT_ISSUE'', ''TOP_UP'', ''REMIT'',
                              ''SAFE_TRANSFER'', ''EXCHANGE'')
           AND x.at IS NOT NULL
        UNION ALL
        SELECT m.tcm_kind::text, m.tcm_received_on, m.tcm_received_amount, m.tcm_doc_no,
               concat_ws('' · '', s.tss_session_no, COALESCE(u.usr_full_name, u.usr_login_name))
          FROM accounts.till_cash_movement m
          LEFT JOIN accounts.till_session s ON s.tss_id = m.tcm_session_id
          LEFT JOIN public.user_master u ON u.usr_id = s.tss_operator_id
         WHERE m.tcm_safe_id = sf.tsf_id AND m.tcm_is_deleted = false AND m.tcm_status = ''POSTED''
           AND m.tcm_receipt_status = ''RECEIVED''
        UNION ALL
        SELECT ''TRANSFER_IN'', x.at, x.amt, m.tcm_doc_no, f2.tsf_name
          FROM accounts.till_cash_movement m
          LEFT JOIN accounts.till_safe f2 ON f2.tsf_id = m.tcm_safe_id
         CROSS JOIN LATERAL (VALUES (m.tcm_created_on, m.tcm_amount),
                                    (m.tcm_voided_on, -m.tcm_amount)) AS x(at, amt)
         WHERE m.tcm_to_safe_id = sf.tsf_id AND m.tcm_kind = ''SAFE_TRANSFER'' AND m.tcm_is_deleted = false
           AND x.at IS NOT NULL
        UNION ALL
        SELECT CASE t.td_dr_cr WHEN ''DR'' THEN ''MONEY_IN'' ELSE ''MONEY_OUT'' END, x.at, x.amt,
               h.avh_voucher_refno, l.led_name
          FROM accounts.acc_tender_detail t
          JOIN accounts.acc_voucher_header h ON h.avh_voucher_id = t.td_voucher_id
          LEFT JOIN accounts.acc_ledger_master l ON l.led_id = h.avh_party_id
         CROSS JOIN LATERAL (VALUES
               (COALESCE(h.avh_posted_on, h.avh_created_on), t.td_total_amt),
               (CASE WHEN h.avh_voucher_status = ''CANCELLED'' THEN h.avh_status_on END, -t.td_total_amt)) AS x(at, amt)
         WHERE t.td_tender_ledger_id = sf.tsf_ledger_id AND t.td_tender_type_id = 1
           AND t.td_src_doc_type <> ''VOUCHER''
           AND h.avh_is_deleted = false
           AND ((h.avh_voucher_status = ''POSTED'' AND t.td_is_deleted = false AND t.td_is_voided = false)
                OR h.avh_voucher_status = ''CANCELLED'')
           AND x.at IS NOT NULL) f
                            WHERE f.sb_at > COALESCE(lc.at, ''-infinity''::timestamptz) AND f.sb_at < b.t0), 0) AS opening
          FROM (SELECT 1) one
          LEFT JOIN LATERAL (SELECT c.tct_total_counted AS total, c.tct_counted_on AS at FROM accounts.till_count c
                              WHERE c.tct_safe_id = sf.tsf_id AND c.tct_kind = ''SAFE'' AND c.tct_is_deleted = false
                                AND c.tct_counted_on < b.t0
                              ORDER BY c.tct_counted_on DESC LIMIT 1) lc ON true) op
 CROSS JOIN LATERAL (
        SELECT sum(f.amt) FILTER (WHERE f.cat IN (''CLOSE_HANDOVER'', (''DR'' || ''OP''), ''PICKUP'')) AS from_tills,
               sum(f.amt) FILTER (WHERE f.cat = ''FLOAT_ISSUE'') AS floats_out,
               sum(f.amt) FILTER (WHERE f.cat = ''TOP_UP'') AS topups_out,
               sum(f.amt) FILTER (WHERE f.cat = ''REMIT'') AS remitted,
               sum(CASE WHEN f.cat IN (''CLOSE_HANDOVER'', (''DR'' || ''OP''), ''PICKUP'', ''TRANSFER_IN'', ''MONEY_IN'') THEN f.amt WHEN f.cat IN (''FLOAT_ISSUE'', ''TOP_UP'', ''REMIT'', ''SAFE_TRANSFER'', ''MONEY_OUT'') THEN -f.amt ELSE 0 END) FILTER (WHERE f.cat IN (''TRANSFER_IN'', ''MONEY_IN'', ''SAFE_TRANSFER'', ''MONEY_OUT'')) AS other,
               sum(CASE WHEN f.cat IN (''CLOSE_HANDOVER'', (''DR'' || ''OP''), ''PICKUP'', ''TRANSFER_IN'', ''MONEY_IN'') THEN f.amt WHEN f.cat IN (''FLOAT_ISSUE'', ''TOP_UP'', ''REMIT'', ''SAFE_TRANSFER'', ''MONEY_OUT'') THEN -f.amt ELSE 0 END) AS net
          FROM (
        SELECT m.tcm_kind::text AS cat, x.at AS sb_at, x.amt, m.tcm_doc_no AS doc_no,
               concat_ws('' · '', s.tss_session_no, COALESCE(u.usr_full_name, u.usr_login_name)) AS who
          FROM accounts.till_cash_movement m
          LEFT JOIN accounts.till_session s ON s.tss_id = m.tcm_session_id
          LEFT JOIN public.user_master u ON u.usr_id = COALESCE(s.tss_operator_id, m.tcm_done_by)
         CROSS JOIN LATERAL (VALUES (m.tcm_created_on, m.tcm_amount),
                                    (m.tcm_voided_on, -m.tcm_amount)) AS x(at, amt)
         WHERE m.tcm_safe_id = sf.tsf_id AND m.tcm_is_deleted = false AND m.tcm_receipt_status IS NULL
           AND m.tcm_kind IN (''CLOSE_HANDOVER'', (''DR'' || ''OP''), ''PICKUP'', ''FLOAT_ISSUE'', ''TOP_UP'', ''REMIT'',
                              ''SAFE_TRANSFER'', ''EXCHANGE'')
           AND x.at IS NOT NULL
        UNION ALL
        SELECT m.tcm_kind::text, m.tcm_received_on, m.tcm_received_amount, m.tcm_doc_no,
               concat_ws('' · '', s.tss_session_no, COALESCE(u.usr_full_name, u.usr_login_name))
          FROM accounts.till_cash_movement m
          LEFT JOIN accounts.till_session s ON s.tss_id = m.tcm_session_id
          LEFT JOIN public.user_master u ON u.usr_id = s.tss_operator_id
         WHERE m.tcm_safe_id = sf.tsf_id AND m.tcm_is_deleted = false AND m.tcm_status = ''POSTED''
           AND m.tcm_receipt_status = ''RECEIVED''
        UNION ALL
        SELECT ''TRANSFER_IN'', x.at, x.amt, m.tcm_doc_no, f2.tsf_name
          FROM accounts.till_cash_movement m
          LEFT JOIN accounts.till_safe f2 ON f2.tsf_id = m.tcm_safe_id
         CROSS JOIN LATERAL (VALUES (m.tcm_created_on, m.tcm_amount),
                                    (m.tcm_voided_on, -m.tcm_amount)) AS x(at, amt)
         WHERE m.tcm_to_safe_id = sf.tsf_id AND m.tcm_kind = ''SAFE_TRANSFER'' AND m.tcm_is_deleted = false
           AND x.at IS NOT NULL
        UNION ALL
        SELECT CASE t.td_dr_cr WHEN ''DR'' THEN ''MONEY_IN'' ELSE ''MONEY_OUT'' END, x.at, x.amt,
               h.avh_voucher_refno, l.led_name
          FROM accounts.acc_tender_detail t
          JOIN accounts.acc_voucher_header h ON h.avh_voucher_id = t.td_voucher_id
          LEFT JOIN accounts.acc_ledger_master l ON l.led_id = h.avh_party_id
         CROSS JOIN LATERAL (VALUES
               (COALESCE(h.avh_posted_on, h.avh_created_on), t.td_total_amt),
               (CASE WHEN h.avh_voucher_status = ''CANCELLED'' THEN h.avh_status_on END, -t.td_total_amt)) AS x(at, amt)
         WHERE t.td_tender_ledger_id = sf.tsf_ledger_id AND t.td_tender_type_id = 1
           AND t.td_src_doc_type <> ''VOUCHER''
           AND h.avh_is_deleted = false
           AND ((h.avh_voucher_status = ''POSTED'' AND t.td_is_deleted = false AND t.td_is_voided = false)
                OR h.avh_voucher_status = ''CANCELLED'')
           AND x.at IS NOT NULL) f
         WHERE f.sb_at >= b.t0 AND f.sb_at < b.t1) fl
  LEFT JOIN LATERAL (
        SELECT (array_agg(c.tct_total_counted ORDER BY c.tct_counted_on DESC))[1] AS counted,
               sum(c.tct_total_counted - COALESCE(c.tct_expected, c.tct_total_counted)) AS diff
          FROM accounts.till_count c
         WHERE c.tct_safe_id = sf.tsf_id AND c.tct_kind = ''SAFE'' AND c.tct_is_deleted = false
           AND c.tct_counted_on >= b.t0 AND c.tct_counted_on < b.t1) cnt ON true
 WHERE sf.tsf_is_deleted = false AND sf.tsf_company_id::text = ''icompany_id''
   AND (NULLIF(''ibranch_id'', '''') IS NULL OR sf.tsf_branch_id::text = ''ibranch_id'')
   AND sf.tsf_id::text = ''isafe_id''
   AND (''icounter_id'' = ''icounter_id'') AND (''ioperator_id'' = ''ioperator_id'')
 ORDER BY g.d', true),
  ('168', 'TILL RPT SAFE DAY LINES', 'Desktop', 'Till Reports, Safe book tab, the day''s lines: every flow of one safe (isafe_id) on one day (iday, ISO) plus that day''s SAFE counts (their difference), oldest first, with the running balance from the day''s opening.', 'sb_at', 'Ascending', 'SELECT f.sb_at, to_char(f.sb_at AT TIME ZONE ''Asia/Kolkata'', ''HH12:MI AM'') AS at_text, f.doc_no,
       replace(f.cat, ''_'', '' '') || CASE WHEN f.amt < 0 AND f.cat <> ''SAFE_COUNT'' THEN '' VOID'' ELSE '''' END AS kind,
       f.cat, COALESCE(f.who, '''') AS who,
       CASE WHEN f.signed > 0 THEN f.signed END AS money_in,
       CASE WHEN f.signed < 0 THEN -f.signed END AS money_out,
       op.opening + sum(f.signed) OVER (ORDER BY f.sb_at, f.doc_no ROWS UNBOUNDED PRECEDING) AS balance,
       op.opening
  FROM accounts.till_safe sf
 CROSS JOIN LATERAL (SELECT to_date(''iday'', ''YYYY-MM-DD'') AS d) g
 CROSS JOIN LATERAL (SELECT (g.d::date)::timestamp AT TIME ZONE ''Asia/Kolkata'' AS t0,
                          (g.d::date + 1)::timestamp AT TIME ZONE ''Asia/Kolkata'' AS t1) b
 CROSS JOIN LATERAL (
        SELECT COALESCE(lc.total, 0)
               + COALESCE((SELECT sum(CASE WHEN f.cat IN (''CLOSE_HANDOVER'', (''DR'' || ''OP''), ''PICKUP'', ''TRANSFER_IN'', ''MONEY_IN'') THEN f.amt WHEN f.cat IN (''FLOAT_ISSUE'', ''TOP_UP'', ''REMIT'', ''SAFE_TRANSFER'', ''MONEY_OUT'') THEN -f.amt ELSE 0 END) FROM (
        SELECT m.tcm_kind::text AS cat, x.at AS sb_at, x.amt, m.tcm_doc_no AS doc_no,
               concat_ws('' · '', s.tss_session_no, COALESCE(u.usr_full_name, u.usr_login_name)) AS who
          FROM accounts.till_cash_movement m
          LEFT JOIN accounts.till_session s ON s.tss_id = m.tcm_session_id
          LEFT JOIN public.user_master u ON u.usr_id = COALESCE(s.tss_operator_id, m.tcm_done_by)
         CROSS JOIN LATERAL (VALUES (m.tcm_created_on, m.tcm_amount),
                                    (m.tcm_voided_on, -m.tcm_amount)) AS x(at, amt)
         WHERE m.tcm_safe_id = sf.tsf_id AND m.tcm_is_deleted = false AND m.tcm_receipt_status IS NULL
           AND m.tcm_kind IN (''CLOSE_HANDOVER'', (''DR'' || ''OP''), ''PICKUP'', ''FLOAT_ISSUE'', ''TOP_UP'', ''REMIT'',
                              ''SAFE_TRANSFER'', ''EXCHANGE'')
           AND x.at IS NOT NULL
        UNION ALL
        SELECT m.tcm_kind::text, m.tcm_received_on, m.tcm_received_amount, m.tcm_doc_no,
               concat_ws('' · '', s.tss_session_no, COALESCE(u.usr_full_name, u.usr_login_name))
          FROM accounts.till_cash_movement m
          LEFT JOIN accounts.till_session s ON s.tss_id = m.tcm_session_id
          LEFT JOIN public.user_master u ON u.usr_id = s.tss_operator_id
         WHERE m.tcm_safe_id = sf.tsf_id AND m.tcm_is_deleted = false AND m.tcm_status = ''POSTED''
           AND m.tcm_receipt_status = ''RECEIVED''
        UNION ALL
        SELECT ''TRANSFER_IN'', x.at, x.amt, m.tcm_doc_no, f2.tsf_name
          FROM accounts.till_cash_movement m
          LEFT JOIN accounts.till_safe f2 ON f2.tsf_id = m.tcm_safe_id
         CROSS JOIN LATERAL (VALUES (m.tcm_created_on, m.tcm_amount),
                                    (m.tcm_voided_on, -m.tcm_amount)) AS x(at, amt)
         WHERE m.tcm_to_safe_id = sf.tsf_id AND m.tcm_kind = ''SAFE_TRANSFER'' AND m.tcm_is_deleted = false
           AND x.at IS NOT NULL
        UNION ALL
        SELECT CASE t.td_dr_cr WHEN ''DR'' THEN ''MONEY_IN'' ELSE ''MONEY_OUT'' END, x.at, x.amt,
               h.avh_voucher_refno, l.led_name
          FROM accounts.acc_tender_detail t
          JOIN accounts.acc_voucher_header h ON h.avh_voucher_id = t.td_voucher_id
          LEFT JOIN accounts.acc_ledger_master l ON l.led_id = h.avh_party_id
         CROSS JOIN LATERAL (VALUES
               (COALESCE(h.avh_posted_on, h.avh_created_on), t.td_total_amt),
               (CASE WHEN h.avh_voucher_status = ''CANCELLED'' THEN h.avh_status_on END, -t.td_total_amt)) AS x(at, amt)
         WHERE t.td_tender_ledger_id = sf.tsf_ledger_id AND t.td_tender_type_id = 1
           AND t.td_src_doc_type <> ''VOUCHER''
           AND h.avh_is_deleted = false
           AND ((h.avh_voucher_status = ''POSTED'' AND t.td_is_deleted = false AND t.td_is_voided = false)
                OR h.avh_voucher_status = ''CANCELLED'')
           AND x.at IS NOT NULL) f
                            WHERE f.sb_at > COALESCE(lc.at, ''-infinity''::timestamptz) AND f.sb_at < b.t0), 0) AS opening
          FROM (SELECT 1) one
          LEFT JOIN LATERAL (SELECT c.tct_total_counted AS total, c.tct_counted_on AS at FROM accounts.till_count c
                              WHERE c.tct_safe_id = sf.tsf_id AND c.tct_kind = ''SAFE'' AND c.tct_is_deleted = false
                                AND c.tct_counted_on < b.t0
                              ORDER BY c.tct_counted_on DESC LIMIT 1) lc ON true) op
 CROSS JOIN LATERAL (
        SELECT f.cat, f.sb_at, f.amt, f.doc_no, f.who, CASE WHEN f.cat IN (''CLOSE_HANDOVER'', (''DR'' || ''OP''), ''PICKUP'', ''TRANSFER_IN'', ''MONEY_IN'') THEN f.amt WHEN f.cat IN (''FLOAT_ISSUE'', ''TOP_UP'', ''REMIT'', ''SAFE_TRANSFER'', ''MONEY_OUT'') THEN -f.amt ELSE 0 END AS signed FROM (
        SELECT m.tcm_kind::text AS cat, x.at AS sb_at, x.amt, m.tcm_doc_no AS doc_no,
               concat_ws('' · '', s.tss_session_no, COALESCE(u.usr_full_name, u.usr_login_name)) AS who
          FROM accounts.till_cash_movement m
          LEFT JOIN accounts.till_session s ON s.tss_id = m.tcm_session_id
          LEFT JOIN public.user_master u ON u.usr_id = COALESCE(s.tss_operator_id, m.tcm_done_by)
         CROSS JOIN LATERAL (VALUES (m.tcm_created_on, m.tcm_amount),
                                    (m.tcm_voided_on, -m.tcm_amount)) AS x(at, amt)
         WHERE m.tcm_safe_id = sf.tsf_id AND m.tcm_is_deleted = false AND m.tcm_receipt_status IS NULL
           AND m.tcm_kind IN (''CLOSE_HANDOVER'', (''DR'' || ''OP''), ''PICKUP'', ''FLOAT_ISSUE'', ''TOP_UP'', ''REMIT'',
                              ''SAFE_TRANSFER'', ''EXCHANGE'')
           AND x.at IS NOT NULL
        UNION ALL
        SELECT m.tcm_kind::text, m.tcm_received_on, m.tcm_received_amount, m.tcm_doc_no,
               concat_ws('' · '', s.tss_session_no, COALESCE(u.usr_full_name, u.usr_login_name))
          FROM accounts.till_cash_movement m
          LEFT JOIN accounts.till_session s ON s.tss_id = m.tcm_session_id
          LEFT JOIN public.user_master u ON u.usr_id = s.tss_operator_id
         WHERE m.tcm_safe_id = sf.tsf_id AND m.tcm_is_deleted = false AND m.tcm_status = ''POSTED''
           AND m.tcm_receipt_status = ''RECEIVED''
        UNION ALL
        SELECT ''TRANSFER_IN'', x.at, x.amt, m.tcm_doc_no, f2.tsf_name
          FROM accounts.till_cash_movement m
          LEFT JOIN accounts.till_safe f2 ON f2.tsf_id = m.tcm_safe_id
         CROSS JOIN LATERAL (VALUES (m.tcm_created_on, m.tcm_amount),
                                    (m.tcm_voided_on, -m.tcm_amount)) AS x(at, amt)
         WHERE m.tcm_to_safe_id = sf.tsf_id AND m.tcm_kind = ''SAFE_TRANSFER'' AND m.tcm_is_deleted = false
           AND x.at IS NOT NULL
        UNION ALL
        SELECT CASE t.td_dr_cr WHEN ''DR'' THEN ''MONEY_IN'' ELSE ''MONEY_OUT'' END, x.at, x.amt,
               h.avh_voucher_refno, l.led_name
          FROM accounts.acc_tender_detail t
          JOIN accounts.acc_voucher_header h ON h.avh_voucher_id = t.td_voucher_id
          LEFT JOIN accounts.acc_ledger_master l ON l.led_id = h.avh_party_id
         CROSS JOIN LATERAL (VALUES
               (COALESCE(h.avh_posted_on, h.avh_created_on), t.td_total_amt),
               (CASE WHEN h.avh_voucher_status = ''CANCELLED'' THEN h.avh_status_on END, -t.td_total_amt)) AS x(at, amt)
         WHERE t.td_tender_ledger_id = sf.tsf_ledger_id AND t.td_tender_type_id = 1
           AND t.td_src_doc_type <> ''VOUCHER''
           AND h.avh_is_deleted = false
           AND ((h.avh_voucher_status = ''POSTED'' AND t.td_is_deleted = false AND t.td_is_voided = false)
                OR h.avh_voucher_status = ''CANCELLED'')
           AND x.at IS NOT NULL) f
         WHERE f.sb_at >= b.t0 AND f.sb_at < b.t1
        UNION ALL
        SELECT ''SAFE_COUNT'', c.tct_counted_on, c.tct_total_counted - COALESCE(c.tct_expected, c.tct_total_counted),
               ''count '' || c.tct_attempt_no, COALESCE(cu.usr_full_name, cu.usr_login_name),
               c.tct_total_counted - COALESCE(c.tct_expected, c.tct_total_counted)
          FROM accounts.till_count c
          LEFT JOIN public.user_master cu ON cu.usr_id = c.tct_counted_by
         WHERE c.tct_safe_id = sf.tsf_id AND c.tct_kind = ''SAFE'' AND c.tct_is_deleted = false
           AND c.tct_counted_on >= b.t0 AND c.tct_counted_on < b.t1) f
 WHERE sf.tsf_is_deleted = false AND sf.tsf_company_id::text = ''icompany_id''
   AND (NULLIF(''ibranch_id'', '''') IS NULL OR sf.tsf_branch_id::text = ''ibranch_id'')
   AND sf.tsf_id::text = ''isafe_id''
 ORDER BY f.sb_at, f.doc_no', true),
  ('169', 'TILL RPT PEOPLE', 'Desktop', 'Till Reports pickers: the people met in the company''s till data — irole CASHIER (session cashiers) or APPROVER (people who decided an approval). ibranch_id '''' = every branch.', 'person', 'Ascending', 'SELECT u.usr_id AS person_id, COALESCE(u.usr_full_name, u.usr_login_name) AS person, u.usr_login_name, u.usr_type
  FROM public.user_master u
 WHERE (''irole'' = ''CASHIER'' AND EXISTS (
            SELECT 1 FROM accounts.till_session s
             WHERE s.tss_operator_id = u.usr_id AND s.tss_is_deleted = false AND s.tss_company_id::text = ''icompany_id''
               AND (NULLIF(''ibranch_id'', '''') IS NULL OR s.tss_branch_id::text = ''ibranch_id'')))
    OR (''irole'' = ''APPROVER'' AND EXISTS (
            SELECT 1 FROM accounts.till_approval a
             WHERE a.tap_decided_by = u.usr_id AND a.tap_is_deleted = false AND a.tap_company_id::text = ''icompany_id''
               AND (NULLIF(''ibranch_id'', '''') IS NULL OR a.tap_branch_id::text = ''ibranch_id'')))
 ORDER BY 2', true);

INSERT INTO pg_temp.sync_grid_column (grid_name, grid_device_type, grid_column_number, grid_column_name, grid_column_width, grid_column_alignment, grid_column_visibility, grid_column_filter, grid_column_condition, grid_column_condition_color, grid_column_group, grid_column_total, grid_column_data_type, grid_column_color, grid_column_notes, grid_column_is_deleted, grid_column_position, grid_column_sql_field_name, grid_column_px) VALUES
  ('TILL RPT CASHIER VARIANCE', 'Desktop', '1', '#', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '1.0', 'cashier_id', NULL),
  ('TILL RPT CASHIER VARIANCE', 'Desktop', '2', 'Cashier', '9.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '2.0', 'cashier', NULL),
  ('TILL RPT CASHIER VARIANCE', 'Desktop', '3', 'Sessions', '5.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '3.0', 'sessions', NULL),
  ('TILL RPT CASHIER VARIANCE', 'Desktop', '4', 'Hours', '4.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '4.0', 'hours', NULL),
  ('TILL RPT CASHIER VARIANCE', 'Desktop', '5', 'Net sales', '8.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '5.0', 'net_sales', NULL),
  ('TILL RPT CASHIER VARIANCE', 'Desktop', '6', 'Short', '4.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '6.0', 'short_n', NULL),
  ('TILL RPT CASHIER VARIANCE', 'Desktop', '7', 'Short ₹', '7.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '7.0', 'short_amt', NULL),
  ('TILL RPT CASHIER VARIANCE', 'Desktop', '8', 'Excess', '4.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '8.0', 'excess_n', NULL),
  ('TILL RPT CASHIER VARIANCE', 'Desktop', '9', 'Excess ₹', '6.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '9.0', 'excess_amt', NULL),
  ('TILL RPT CASHIER VARIANCE', 'Desktop', '10', 'Net variance', '7.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '10.0', 'net_variance', NULL),
  ('TILL RPT CASHIER VARIANCE', 'Desktop', '11', 'Per ₹1L', '5.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '11.0', 'per_lakh', NULL),
  ('TILL RPT CASHIER VARIANCE', 'Desktop', '12', 'Recounts', '5.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '12.0', 'recounts', NULL),
  ('TILL RPT CASHIER VARIANCE', 'Desktop', '13', 'Force closed', '6.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '13.0', 'force_closed', NULL),
  ('TILL RPT CASHIER VARIANCE', 'Desktop', '14', 'Non-cash gap', '7.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '14.0', 'noncash_gap', NULL),
  ('TILL RPT CASHIER VARIANCE', 'Desktop', '15', 'Pending', '5.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '15.0', 'pending', NULL),
  ('TILL RPT CASHIER VARIANCE', 'Desktop', '16', 'Treatment', '16.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '16.0', 'treatments', NULL),
  ('TILL RPT CASHIER SESSIONS', 'Desktop', '1', '#', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '1.0', 'tss_id', NULL),
  ('TILL RPT CASHIER SESSIONS', 'Desktop', '2', 'Year', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '2.0', 'tss_acc_year', NULL),
  ('TILL RPT CASHIER SESSIONS', 'Desktop', '3', 'Co', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '3.0', 'tss_company_id', NULL),
  ('TILL RPT CASHIER SESSIONS', 'Desktop', '4', 'Br', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '4.0', 'tss_branch_id', NULL),
  ('TILL RPT CASHIER SESSIONS', 'Desktop', '5', 'Session', '10.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '5.0', 'tss_session_no', NULL),
  ('TILL RPT CASHIER SESSIONS', 'Desktop', '6', 'Date', '7.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '6.0', 'business_date', NULL),
  ('TILL RPT CASHIER SESSIONS', 'Desktop', '7', 'Counter', '5.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '7.0', 'counter_code', NULL),
  ('TILL RPT CASHIER SESSIONS', 'Desktop', '8', 'Cashier', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '8.0', 'cashier', NULL),
  ('TILL RPT CASHIER SESSIONS', 'Desktop', '9', 'Hours', '4.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '9.0', 'hours', NULL),
  ('TILL RPT CASHIER SESSIONS', 'Desktop', '10', 'Net sales', '8.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '10.0', 'net_sales', NULL),
  ('TILL RPT CASHIER SESSIONS', 'Desktop', '11', 'Cash expected', '8.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '11.0', 'cash_expected', NULL),
  ('TILL RPT CASHIER SESSIONS', 'Desktop', '12', 'Counted', '8.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '12.0', 'cash_counted', NULL),
  ('TILL RPT CASHIER SESSIONS', 'Desktop', '13', 'Variance', '7.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '13.0', 'cash_variance', NULL),
  ('TILL RPT CASHIER SESSIONS', 'Desktop', '14', 'Attempts', '5.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '14.0', 'attempts', NULL),
  ('TILL RPT CASHIER SESSIONS', 'Desktop', '15', 'Treatment', '8.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '15.0', 'treatment', NULL),
  ('TILL RPT CASHIER SESSIONS', 'Desktop', '16', 'Decided by', '9.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '16.0', 'decided_by', NULL),
  ('TILL RPT CASHIER SESSIONS', 'Desktop', '17', 'Note', '14.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '17.0', 'note', NULL),
  ('TILL RPT CASHIER SESSIONS', 'Desktop', '18', 'Status', '7.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '18.0', 'status_text', NULL),
  ('TILL RPT CASHIER SESSIONS', 'Desktop', '19', 'Opened on', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '19.0', 'tss_opened_on', NULL),
  ('TILL RPT EXCEPTIONS', 'Desktop', '1', '#', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '1.0', 'person_id', NULL),
  ('TILL RPT EXCEPTIONS', 'Desktop', '2', 'Cashier', '10.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '2.0', 'person', NULL),
  ('TILL RPT EXCEPTIONS', 'Desktop', '3', 'Pickups', '6.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '3.0', 'pickups', NULL),
  ('TILL RPT EXCEPTIONS', 'Desktop', '4', 'Top-ups', '6.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '4.0', 'top_ups', NULL),
  ('TILL RPT EXCEPTIONS', 'Desktop', '5', 'Recounts', '6.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '5.0', 'recounts', NULL),
  ('TILL RPT EXCEPTIONS', 'Desktop', '6', 'Force closed', '7.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '6.0', 'force_closed', NULL),
  ('TILL RPT EXCEPTIONS', 'Desktop', '7', 'Reopens', '6.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '7.0', 'reopens', NULL),
  ('TILL RPT EXCEPTIONS', 'Desktop', '8', 'PIN fails', '6.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '8.0', 'pin_fails', NULL),
  ('TILL RPT EXCEPTIONS', 'Desktop', '9', 'Movement voids', '8.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '9.0', 'movement_voids', NULL),
  ('TILL RPT EXCEPTIONS', 'Desktop', '10', 'Re-tenders', '7.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '10.0', 'retenders', NULL),
  ('TILL RPT EXCEPTIONS', 'Desktop', '11', 'Suspends', '6.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '11.0', 'suspends', NULL),
  ('TILL RPT EXCEPTIONS', 'Desktop', '12', 'Over max hours', '8.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '12.0', 'over_hours', NULL),
  ('TILL RPT EXCEPTIONS', 'Desktop', '13', 'No sale', '6.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '13.0', 'no_sales', NULL),
  ('TILL RPT EXCEPTIONS', 'Desktop', '14', 'Total', '6.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '14.0', 'total', NULL),
  ('TILL RPT EXCEPTION HOURS', 'Desktop', '1', 'Hour', '50.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '1.0', 'hr', NULL),
  ('TILL RPT EXCEPTION HOURS', 'Desktop', '2', 'Events', '50.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '2.0', 'events', NULL),
  ('TILL RPT EXCEPTION EVENTS', 'Desktop', '1', '#', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '1.0', 'at', NULL),
  ('TILL RPT EXCEPTION EVENTS', 'Desktop', '2', 'When', '12.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '2.0', 'at_text', NULL),
  ('TILL RPT EXCEPTION EVENTS', 'Desktop', '3', 'Session', '10.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '3.0', 'session_no', NULL),
  ('TILL RPT EXCEPTION EVENTS', 'Desktop', '4', 'sid', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '4.0', 'tss_id', NULL),
  ('TILL RPT EXCEPTION EVENTS', 'Desktop', '5', 'Year', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '5.0', 'tss_acc_year', NULL),
  ('TILL RPT EXCEPTION EVENTS', 'Desktop', '6', 'Co', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '6.0', 'tss_company_id', NULL),
  ('TILL RPT EXCEPTION EVENTS', 'Desktop', '7', 'Br', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '7.0', 'tss_branch_id', NULL),
  ('TILL RPT EXCEPTION EVENTS', 'Desktop', '8', 'Counter', '6.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '8.0', 'counter_code', NULL),
  ('TILL RPT EXCEPTION EVENTS', 'Desktop', '9', 'Cashier', '9.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '9.0', 'person', NULL),
  ('TILL RPT EXCEPTION EVENTS', 'Desktop', '10', 'Event', '13.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '10.0', 'event_code', NULL),
  ('TILL RPT EXCEPTION EVENTS', 'Desktop', '11', 'Amount', '8.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '11.0', 'amount', NULL),
  ('TILL RPT EXCEPTION EVENTS', 'Desktop', '12', 'Detail', '30.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '12.0', 'detail', NULL),
  ('TILL RPT EXCEPTION EVENTS', 'Desktop', '13', 'Device', '12.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '13.0', 'device', NULL),
  ('TILL RPT APPROVERS', 'Desktop', '1', '#', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '1.0', 'approver_id', NULL),
  ('TILL RPT APPROVERS', 'Desktop', '2', 'Approver', '10.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '2.0', 'approver', NULL),
  ('TILL RPT APPROVERS', 'Desktop', '3', 'Level (grant)', '10.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '3.0', 'level', NULL),
  ('TILL RPT APPROVERS', 'Desktop', '4', 'Decided', '6.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '4.0', 'decided', NULL),
  ('TILL RPT APPROVERS', 'Desktop', '5', 'Approved', '6.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '5.0', 'approved', NULL),
  ('TILL RPT APPROVERS', 'Desktop', '6', 'Recount', '6.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '6.0', 'recounts', NULL),
  ('TILL RPT APPROVERS', 'Desktop', '7', 'Rejected', '6.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '7.0', 'rejected', NULL),
  ('TILL RPT APPROVERS', 'Desktop', '8', 'Amount approved', '9.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '8.0', 'amount_approved', NULL),
  ('TILL RPT APPROVERS', 'Desktop', '9', 'Largest', '8.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '9.0', 'largest', NULL),
  ('TILL RPT APPROVERS', 'Desktop', '10', 'Own session', '7.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '10.0', 'own_session', NULL),
  ('TILL RPT APPROVERS', 'Desktop', '11', 'Median wait', '7.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '11.0', 'median_wait', NULL),
  ('TILL RPT APPROVERS', 'Desktop', '12', 'By event', '19.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '12.0', 'by_event', NULL),
  ('TILL RPT APPROVER DECISIONS', 'Desktop', '1', '#', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '1.0', 'tap_id', NULL),
  ('TILL RPT APPROVER DECISIONS', 'Desktop', '2', 'on', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '2.0', 'tap_decided_on', NULL),
  ('TILL RPT APPROVER DECISIONS', 'Desktop', '3', 'Decided', '12.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '3.0', 'decided_at', NULL),
  ('TILL RPT APPROVER DECISIONS', 'Desktop', '4', 'Event', '11.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '4.0', 'event_code', NULL),
  ('TILL RPT APPROVER DECISIONS', 'Desktop', '5', 'Session / doc', '10.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '5.0', 'ref', NULL),
  ('TILL RPT APPROVER DECISIONS', 'Desktop', '6', 'sid', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '6.0', 'tss_id', NULL),
  ('TILL RPT APPROVER DECISIONS', 'Desktop', '7', 'Year', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '7.0', 'tss_acc_year', NULL),
  ('TILL RPT APPROVER DECISIONS', 'Desktop', '8', 'Co', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '8.0', 'tss_company_id', NULL),
  ('TILL RPT APPROVER DECISIONS', 'Desktop', '9', 'Br', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '9.0', 'tss_branch_id', NULL),
  ('TILL RPT APPROVER DECISIONS', 'Desktop', '10', 'Requested by', '9.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '10.0', 'requested_by', NULL),
  ('TILL RPT APPROVER DECISIONS', 'Desktop', '11', 'Approver', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '11.0', 'approver', NULL),
  ('TILL RPT APPROVER DECISIONS', 'Desktop', '12', 'Amount', '8.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '12.0', 'amount', NULL),
  ('TILL RPT APPROVER DECISIONS', 'Desktop', '13', 'Decision', '8.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '13.0', 'decision', NULL),
  ('TILL RPT APPROVER DECISIONS', 'Desktop', '14', 'Wait', '7.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '14.0', 'wait', NULL),
  ('TILL RPT APPROVER DECISIONS', 'Desktop', '15', 'Channel', '7.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '15.0', 'channel', NULL),
  ('TILL RPT APPROVER DECISIONS', 'Desktop', '16', 'Own', '4.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '16.0', 'own', NULL),
  ('TILL RPT APPROVER DECISIONS', 'Desktop', '17', 'Note', '26.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '17.0', 'note', NULL),
  ('TILL RPT UNDECIDED', 'Desktop', '1', '#', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '1.0', 'tap_id', NULL),
  ('TILL RPT UNDECIDED', 'Desktop', '2', 'on', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '2.0', 'tap_requested_on', NULL),
  ('TILL RPT UNDECIDED', 'Desktop', '3', 'Status', '10.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '3.0', 'tap_status', NULL),
  ('TILL RPT UNDECIDED', 'Desktop', '4', 'Event', '15.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '4.0', 'event_code', NULL),
  ('TILL RPT UNDECIDED', 'Desktop', '5', 'Session / doc', '14.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '5.0', 'ref', NULL),
  ('TILL RPT UNDECIDED', 'Desktop', '6', 'Counter', '8.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '6.0', 'counter_code', NULL),
  ('TILL RPT UNDECIDED', 'Desktop', '7', 'Amount', '12.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '7.0', 'amount', NULL),
  ('TILL RPT UNDECIDED', 'Desktop', '8', 'Requested by', '14.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '8.0', 'requested_by', NULL),
  ('TILL RPT UNDECIDED', 'Desktop', '9', 'Requested', '15.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '9.0', 'requested_at', NULL),
  ('TILL RPT UNDECIDED', 'Desktop', '10', 'Waited', '12.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '10.0', 'waited', NULL),
  ('TILL RPT SAFE DAYS', 'Desktop', '1', '#', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '1.0', 'day', NULL),
  ('TILL RPT SAFE DAYS', 'Desktop', '2', 'Date', '7.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '2.0', 'day_text', NULL),
  ('TILL RPT SAFE DAYS', 'Desktop', '3', 'Opening', '8.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '3.0', 'opening', NULL),
  ('TILL RPT SAFE DAYS', 'Desktop', '4', 'From tills', '8.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '4.0', 'from_tills', NULL),
  ('TILL RPT SAFE DAYS', 'Desktop', '5', 'Floats out', '7.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '5.0', 'floats_out', NULL),
  ('TILL RPT SAFE DAYS', 'Desktop', '6', 'Top-ups out', '7.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '6.0', 'topups_out', NULL),
  ('TILL RPT SAFE DAYS', 'Desktop', '7', 'Remitted', '8.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '7.0', 'remitted', NULL),
  ('TILL RPT SAFE DAYS', 'Desktop', '8', 'Other', '6.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '8.0', 'other', NULL),
  ('TILL RPT SAFE DAYS', 'Desktop', '9', 'Book closing', '8.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '9.0', 'book_closing', NULL),
  ('TILL RPT SAFE DAYS', 'Desktop', '10', 'Safe count', '8.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '10.0', 'counted', NULL),
  ('TILL RPT SAFE DAYS', 'Desktop', '11', 'Difference', '6.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '11.0', 'diff', NULL),
  ('TILL RPT SAFE DAYS', 'Desktop', '12', 'Bags awaiting', '6.0', 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, '12.0', 'bags_awaiting', NULL),
  ('TILL RPT SAFE DAYS', 'Desktop', '13', 'Bag diff.', '6.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '13.0', 'bag_diff', NULL),
  ('TILL RPT SAFE DAYS', 'Desktop', '14', 'Limit', '7.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '14.0', 'limit_flag', NULL),
  ('TILL RPT SAFE DAYS', 'Desktop', '15', 'limit', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '15.0', 'tsf_insured_limit', NULL),
  ('TILL RPT SAFE DAY LINES', 'Desktop', '1', '#', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '1.0', 'sb_at', NULL),
  ('TILL RPT SAFE DAY LINES', 'Desktop', '2', 'Time', '9.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '2.0', 'at_text', NULL),
  ('TILL RPT SAFE DAY LINES', 'Desktop', '3', 'Doc', '11.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '3.0', 'doc_no', NULL),
  ('TILL RPT SAFE DAY LINES', 'Desktop', '4', 'Kind', '17.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '4.0', 'kind', NULL),
  ('TILL RPT SAFE DAY LINES', 'Desktop', '5', 'cat', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '5.0', 'cat', NULL),
  ('TILL RPT SAFE DAY LINES', 'Desktop', '6', 'Session · who', '22.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '6.0', 'who', NULL),
  ('TILL RPT SAFE DAY LINES', 'Desktop', '7', 'In', '13.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '7.0', 'money_in', NULL),
  ('TILL RPT SAFE DAY LINES', 'Desktop', '8', 'Out', '13.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '8.0', 'money_out', NULL),
  ('TILL RPT SAFE DAY LINES', 'Desktop', '9', 'Balance', '15.0', 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '9.0', 'balance', NULL),
  ('TILL RPT SAFE DAY LINES', 'Desktop', '10', 'Opening', '0.0', 'right', false, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, '10.0', 'opening', NULL),
  ('TILL RPT PEOPLE', 'Desktop', '1', '#', '0.0', 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, '1.0', 'person_id', NULL),
  ('TILL RPT PEOPLE', 'Desktop', '2', 'Name', '50.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '2.0', 'person', NULL),
  ('TILL RPT PEOPLE', 'Desktop', '3', 'Login', '30.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '3.0', 'usr_login_name', NULL),
  ('TILL RPT PEOPLE', 'Desktop', '4', 'Type', '20.0', 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, '4.0', 'usr_type', NULL);

-- ── apply: grids ────────────────────────────────────────────────────────────
-- The sequence first: a live sequence behind max(grid_id) would hand out a
-- taken id.
SELECT setval('fixed.grid_details_grid_id_seq',
              GREATEST((SELECT COALESCE(max(grid_id), 1) FROM fixed.grid_details),
                       (SELECT last_value FROM fixed.grid_details_grid_id_seq)));

DO $$
DECLARE
  g record;
  v_id bigint;
  v_inserted int := 0;
  v_updated int := 0;
BEGIN
  FOR g IN SELECT * FROM pg_temp.sync_grid ORDER BY dev_id LOOP
    SELECT grid_id INTO v_id
      FROM fixed.grid_details
     WHERE grid_name = g.grid_name
       AND COALESCE(grid_device_type, '') = COALESCE(g.grid_device_type, '')
       AND NOT grid_is_deleted
     ORDER BY grid_status DESC, grid_id
     LIMIT 1;

    IF v_id IS NULL THEN
      -- The dev id when it is free here, so the web's fallback id names this grid too.
      v_id := CASE WHEN EXISTS (SELECT 1 FROM fixed.grid_details WHERE grid_id = g.dev_id)
                   THEN nextval('fixed.grid_details_grid_id_seq') ELSE g.dev_id END;
      INSERT INTO fixed.grid_details (grid_id, grid_name, grid_description, grid_sort_column, grid_sort_order,
                                      grid_sql, grid_status, grid_is_deleted, grid_device_type,
                                      grid_created_by, grid_created_on)
      VALUES (v_id, g.grid_name, g.grid_description, g.grid_sort_column, g.grid_sort_order,
              g.grid_sql, g.grid_status, false, g.grid_device_type, 'live-sync 2026-10-17', now());
      v_inserted := v_inserted + 1;
      RAISE NOTICE 'grid % "%" inserted', v_id, g.grid_name;
    ELSE
      UPDATE fixed.grid_details
         SET grid_description = g.grid_description, grid_sort_column = g.grid_sort_column,
             grid_sort_order = g.grid_sort_order, grid_sql = g.grid_sql, grid_status = g.grid_status,
             grid_modified_by = 'live-sync 2026-10-17', grid_modified_on = now()
       WHERE grid_id = v_id;
      DELETE FROM fixed.grid_columns WHERE grid_id = v_id;
      v_updated := v_updated + 1;
      RAISE NOTICE 'grid % "%" updated', v_id, g.grid_name;
    END IF;

    INSERT INTO fixed.grid_columns (grid_id, grid_column_number, grid_column_name, grid_column_width,
                                    grid_column_alignment, grid_column_visibility, grid_column_filter,
                                    grid_column_condition, grid_column_condition_color, grid_column_group,
                                    grid_column_total, grid_column_data_type, grid_column_color, grid_column_notes,
                                    grid_column_is_deleted, grid_column_position, grid_column_sql_field_name,
                                    grid_column_px, grid_column_created_by, grid_column_created_on)
    SELECT v_id, c.grid_column_number, c.grid_column_name, c.grid_column_width, c.grid_column_alignment,
           c.grid_column_visibility, c.grid_column_filter, c.grid_column_condition, c.grid_column_condition_color,
           c.grid_column_group, c.grid_column_total, c.grid_column_data_type, c.grid_column_color,
           c.grid_column_notes, c.grid_column_is_deleted, c.grid_column_position, c.grid_column_sql_field_name,
           c.grid_column_px, 'live-sync 2026-10-17', now()
      FROM pg_temp.sync_grid_column c
     WHERE c.grid_name = g.grid_name
       AND COALESCE(c.grid_device_type, '') = COALESCE(g.grid_device_type, '');
  END LOOP;
  RAISE NOTICE 'grids: % inserted, % updated', v_inserted, v_updated;
END $$;

SELECT setval('fixed.grid_details_grid_id_seq',
              GREATEST((SELECT COALESCE(max(grid_id), 1) FROM fixed.grid_details),
                       (SELECT last_value FROM fixed.grid_details_grid_id_seq)));

-- ── what live has now, for the record ───────────────────────────────────────
SELECT d.grid_id, d.grid_name, count(c.*) AS columns
  FROM fixed.grid_details d
  LEFT JOIN fixed.grid_columns c ON c.grid_id = d.grid_id
 WHERE d.grid_name IN (SELECT grid_name FROM pg_temp.sync_grid) AND NOT d.grid_is_deleted
 GROUP BY 1, 2 ORDER BY 1;

COMMIT;
