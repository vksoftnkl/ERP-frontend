-- ═══════════════════════════════════════════════════════════════════════════
--  Live sync — till grids + dropdowns + Transaction History (generated
--  2026-10-15 from the dev DB, for the web port of Qt NexERP c77f3f1).
--
--  WHAT: brings 14 configured grids and 5 dropdowns on live up to dev, matched
--  by NAME + device type (ids differ between the databases):
--    grids     POPUP - TXN HISTORY (12-hour "When") · MAIN LIST - TILL COUNTERS /
--              REASONS / DENOMINATIONS / SAFES / SESSIONS / BUSINESS DAYS ·
--              TILL SESSION EVENTS / BILLS / MONEY DOCS / COUNTS · TILL DAY SESSIONS ·
--              TILL APPROVAL RULES / GRANTS
--    dropdowns TILL DEVICES · CASH LEDGERS · TILL REASON LEDGERS · TILL SAFES ·
--              TILL APPROVER USERS
--  A row missing on live is inserted (keeping the dev id when live has it free,
--  so the web's fallback ids stay right); a row present is updated in place and
--  its column list replaced by dev's.
--
--  ORDER: run AFTER the server with the till notes 113 / 114 / 117 migrations is
--  deployed on live. MAIN LIST - TILL SESSIONS and TILL DAY SESSIONS read
--  tcm_receipt_status / tss_force_closed / tss_reopen_count; before those
--  columns exist the guard below stops the script and nothing changes.
--
--  BACK UP FIRST (on the live server):
--    sudo -u postgres pg_dump erp -t fixed.grid_details -t fixed.grid_columns \
--         -t fixed.dropdown_details -t fixed.dropdown_columns \
--         > /root/config-backup-$(date +%Y%m%d%H%M).sql
--  RUN:
--    sudo -u postgres psql erp -v ON_ERROR_STOP=1 -f 2026-10-15-till-grids.sql
--  One transaction: any error rolls the whole sync back.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
BEGIN;

-- ── guard: the server migrations these grids read must be in ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'accounts' AND table_name = 'till_cash_movement'
                    AND column_name = 'tcm_receipt_status') THEN
    RAISE EXCEPTION 'accounts.till_cash_movement.tcm_receipt_status is missing: deploy the server with the till notes 113 migration first. Nothing was changed.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'accounts' AND table_name = 'till_session'
                    AND column_name = 'tss_reopen_count') THEN
    RAISE EXCEPTION 'accounts.till_session.tss_reopen_count is missing: deploy the server with the till notes 117 migration first. Nothing was changed.';
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
CREATE TEMP TABLE sync_dropdown (
  dev_id integer, dropdown_name text, dropdown_device_type text, dropdown_description text, dropdown_sql text,
  dropdown_sort_order text, dropdown_sort_column text, dropdown_completion text, dropdown_sql_regional text,
  dropdown_max_visible_items integer, dropdown_show_header boolean, dropdown_width integer
) ON COMMIT DROP;
CREATE TEMP TABLE sync_dropdown_column (
  dropdown_name text, dropdown_device_type text, dropdown_columns_no integer, dropdown_columns_data_type text,
  dropdown_columns_name text, dropdown_columns_alias text, dropdown_columns_width numeric,
  dropdown_columns_visiblity boolean, dropdown_columns_allignment text, dropdown_columns_filter boolean,
  dropdown_columns_sql_name text
) ON COMMIT DROP;

-- ── grids ─────────────────────────────────────────────────────────────────
INSERT INTO pg_temp.sync_grid (dev_id, grid_name, grid_device_type, grid_description, grid_sort_column, grid_sort_order, grid_sql, grid_status) VALUES
  ('126', 'POPUP - TXN HISTORY', 'Desktop', 'public.txn_status_log — one document''s status trail (who, when, from→to, device, remarks), for TxnHistoryDialog. Params idoc_id / iacc_year / icompany_id. notes 80.', 'tsl_seq_no', 'Ascending', 'SELECT l.tsl_id,
       l.tsl_seq_no,
       initcap(replace(lower(l.tsl_event), ''_'', '' '')) AS tsl_event_text,
       CASE WHEN l.tsl_from_status IS NULL OR l.tsl_from_status = l.tsl_to_status
            THEN l.tsl_to_status
            ELSE l.tsl_from_status || '' → '' || l.tsl_to_status END AS tsl_status_text,
       to_char(l.tsl_changed_on, ''DD-MM-YYYY HH12:MI:SS AM'') AS tsl_changed_at,
       COALESCE(u.usr_login_name, NULLIF(btrim(l.tsl_created_by), ''''), '''') AS tsl_user_name,
       COALESCE(d.dev_device_name, '''') AS tsl_device_name,
       COALESCE(l.tsl_remarks, '''') AS tsl_remarks,
       l.tsl_src_doc_refno,
       l.tsl_src_doc_type
FROM public.txn_status_log l
LEFT JOIN public.user_master   u ON u.usr_id = l.tsl_changed_by
                                AND l.tsl_changed_by <> ''00000000-0000-0000-0000-000000000000''
LEFT JOIN fixed.device_master  d ON d.dev_id = l.tsl_device_id
WHERE l.tsl_src_doc_id::text = ''idoc_id''
  AND l.tsl_acc_year = ''iacc_year''
  AND l.tsl_company_id::text = ''icompany_id''
  AND NOT l.tsl_is_deleted', 't'),
  ('133', 'MAIN LIST - TILL COUNTERS', 'Desktop', 'accounts.till_counter of one branch for the Till Masters screen (menu 275, Counters tab). Live session = OPEN/SUSPENDED/COUNTING/PENDING_APPROVAL, which is what keeps the counter busy.', 'tcn_sort_order', 'Ascending', 'SELECT c.tcn_id, c.tcn_code, c.tcn_name, c.tcn_kind, c.tcn_drawer_mode,
       c.tcn_device_id, COALESCE(d.dev_device_name, '''') AS device_name,
       COALESCE(d.dev_device_type, '''') AS device_type,
       c.tcn_safe_id, COALESCE(s.tsf_code || '' · '' || s.tsf_name, '''') AS safe_name,
       c.tcn_default_float, c.tcn_cash_alert_limit, c.tcn_cash_block_limit, c.tcn_z_last_no,
       c.tcn_requires_session, c.tcn_sort_order, COALESCE(c.tcn_remarks, '''') AS tcn_remarks, c.tcn_is_active,
       COALESCE((SELECT ss.tss_session_no FROM accounts.till_session ss
                  WHERE ss.tss_counter_id = c.tcn_id AND ss.tss_is_deleted = false AND ss.tss_status IN (''OPEN'',''SUSPENDED'',''COUNTING'',''PENDING_APPROVAL'')
                  ORDER BY ss.tss_opened_on DESC LIMIT 1), '''') AS live_session_no,
       COALESCE((SELECT COALESCE(u.usr_full_name, u.usr_login_name) FROM accounts.till_session ss
                   JOIN public.user_master u ON u.usr_id = ss.tss_operator_id
                  WHERE ss.tss_counter_id = c.tcn_id AND ss.tss_is_deleted = false AND ss.tss_status IN (''OPEN'',''SUSPENDED'',''COUNTING'',''PENDING_APPROVAL'')
                  ORDER BY ss.tss_opened_on DESC LIMIT 1), '''') AS live_operator,
       (SELECT count(*) FROM accounts.till_session ss
         WHERE ss.tss_counter_id = c.tcn_id AND ss.tss_is_deleted = false
           AND ss.tss_opened_on > now() - interval ''30 days'') AS sessions_30d,
       COALESCE((SELECT to_char(max(ss.tss_closed_on), ''DD-MM-YYYY HH12:MI AM'') FROM accounts.till_session ss
                  WHERE ss.tss_counter_id = c.tcn_id AND ss.tss_is_deleted = false), '''') AS last_closed
  FROM accounts.till_counter c
  LEFT JOIN fixed.device_master d ON d.dev_id = c.tcn_device_id
  LEFT JOIN accounts.till_safe s ON s.tsf_id = c.tcn_safe_id
 WHERE c.tcn_is_deleted = false
   AND c.tcn_company_id::text = ''icompany_id''
   AND c.tcn_branch_id::text = ''ibranch_id''
   AND (''iinactive'' = ''true'' OR c.tcn_is_active)
 ORDER BY c.tcn_sort_order, c.tcn_code', 't'),
  ('134', 'MAIN LIST - TILL REASONS', 'Desktop', 'accounts.till_reason for the Till Masters screen (menu 275, Reasons tab): shipped rows (company NULL) plus this company''s. overridden = a shipped row this company has its own copy of (same category + code). used_30d / used_amount_30d from till_cash_movement and till_variance.', 'trs_category', 'Ascending', 'SELECT r.trs_id, COALESCE(r.trs_company_id::text, '''') AS trs_company_id, r.trs_category, r.trs_code,
       r.trs_name, r.trs_ledger_id, COALESCE(l.led_name, '''') AS ledger_name,
       r.trs_needs_note, r.trs_needs_ref, r.trs_max_amount, r.trs_sort_order, r.trs_is_active,
       (r.trs_company_id IS NULL) AS shipped,
       (r.trs_company_id IS NULL AND EXISTS (SELECT 1 FROM accounts.till_reason o
                                             WHERE o.trs_company_id::text = ''icompany_id'' AND o.trs_is_deleted = false
                                               AND o.trs_category = r.trs_category
                                               AND upper(o.trs_code) = upper(r.trs_code))) AS overridden,
       (SELECT count(*) FROM accounts.till_cash_movement m
         WHERE m.tcm_reason_id = r.trs_id AND m.tcm_is_deleted = false AND m.tcm_created_on > now() - interval ''30 days'')
     + (SELECT count(*) FROM accounts.till_variance v
         WHERE v.tvr_reason_id = r.trs_id AND v.tvr_is_deleted = false AND v.tvr_created_on > now() - interval ''30 days'') AS used_30d,
       COALESCE((SELECT sum(m.tcm_amount) FROM accounts.till_cash_movement m
                  WHERE m.tcm_reason_id = r.trs_id AND m.tcm_is_deleted = false AND m.tcm_status = ''POSTED''
                    AND m.tcm_created_on > now() - interval ''30 days''), 0) AS used_amount_30d
  FROM accounts.till_reason r
  LEFT JOIN accounts.acc_ledger_master l ON l.led_id = r.trs_ledger_id
 WHERE r.trs_is_deleted = false
   AND (r.trs_company_id IS NULL OR r.trs_company_id::text = ''icompany_id'')
   AND (''icategory'' = '''' OR r.trs_category = ''icategory'')
    
   AND (''iinactive'' = ''true''
        OR (r.trs_is_active
            AND NOT (r.trs_company_id IS NULL AND EXISTS (SELECT 1 FROM accounts.till_reason o
                                                         WHERE o.trs_company_id::text = ''icompany_id'' AND o.trs_is_deleted = false
                                                           AND o.trs_category = r.trs_category
                                                           AND upper(o.trs_code) = upper(r.trs_code)))))
 ORDER BY r.trs_category, r.trs_sort_order, r.trs_code', 't'),
  ('135', 'MAIN LIST - TILL DENOMINATIONS', 'Desktop', 'accounts.till_denomination for the Till Masters screen (menu 275, Denominations tab): shipped rows (company NULL) plus this company''s. used = some till_count_line names it (value / kind / currency lock).', 'tdn_sort_order', 'Ascending', 'SELECT d.tdn_id, COALESCE(d.tdn_company_id::text, '''') AS tdn_company_id, d.tdn_currency, d.tdn_value,
       d.tdn_kind, d.tdn_label, d.tdn_bundle_qty, d.tdn_sort_order,
       COALESCE(to_char(d.tdn_valid_to, ''YYYY-MM-DD''), '''') AS tdn_valid_to, d.tdn_is_active,
       (d.tdn_company_id IS NULL) AS shipped,
       (d.tdn_company_id IS NULL AND EXISTS (SELECT 1 FROM accounts.till_denomination o
                                             WHERE o.tdn_company_id::text = ''icompany_id'' AND o.tdn_is_deleted = false
                                               AND o.tdn_currency = d.tdn_currency AND o.tdn_kind = d.tdn_kind
                                               AND o.tdn_value = d.tdn_value)) AS overridden,
       EXISTS (SELECT 1 FROM accounts.till_count_line x WHERE x.tcl_denomination_id = d.tdn_id) AS used
  FROM accounts.till_denomination d
 WHERE d.tdn_is_deleted = false
   AND (d.tdn_company_id IS NULL OR d.tdn_company_id::text = ''icompany_id'')
    
    
   AND (''iinactive'' = ''true''
        OR (d.tdn_is_active
            AND NOT (d.tdn_company_id IS NULL AND EXISTS (SELECT 1 FROM accounts.till_denomination o
                                                         WHERE o.tdn_company_id::text = ''icompany_id'' AND o.tdn_is_deleted = false
                                                           AND o.tdn_currency = d.tdn_currency AND o.tdn_kind = d.tdn_kind
                                                           AND o.tdn_value = d.tdn_value))))
 ORDER BY d.tdn_currency, d.tdn_sort_order, d.tdn_value DESC', 't'),
  ('136', 'MAIN LIST - TILL SAFES', 'Desktop', 'accounts.till_safe of one branch for the Till Masters screen (menu 275, Safes tab). Balance is derived from POSTED till_cash_movement rows (in: DROP, PICKUP, CLOSE_HANDOVER, SAFE_TRANSFER to it; out: FLOAT_ISSUE, TOP_UP, REMIT, SAFE_TRANSFER from it). Counters = those pointing here, plus those with no safe when this is the default.', 'tsf_code', 'Ascending', 'SELECT s.tsf_id, s.tsf_code, s.tsf_name, s.tsf_ledger_id, COALESCE(l.led_name, '''') AS ledger_name,
       s.tsf_insured_limit, s.tsf_is_default, s.tsf_is_drop_safe, COALESCE(s.tsf_remarks, '''') AS tsf_remarks, s.tsf_is_active,
       COALESCE((SELECT string_agg(c.tcn_code, '' '' ORDER BY c.tcn_sort_order, c.tcn_code)
                   FROM accounts.till_counter c
                  WHERE c.tcn_is_deleted = false AND c.tcn_branch_id = s.tsf_branch_id
                    AND (c.tcn_safe_id = s.tsf_id OR (c.tcn_safe_id IS NULL AND s.tsf_is_default))), '''') AS counter_codes,
       (SELECT count(*) FROM accounts.till_counter c
         WHERE c.tcn_is_deleted = false AND c.tcn_branch_id = s.tsf_branch_id
           AND (c.tcn_safe_id = s.tsf_id OR (c.tcn_safe_id IS NULL AND s.tsf_is_default))) AS counter_count,
       COALESCE((SELECT sum(CASE
                    WHEN m.tcm_kind IN (''D'' || ''ROP'', ''PICKUP'', ''CLOSE_HANDOVER'') AND m.tcm_safe_id = s.tsf_id THEN m.tcm_amount
                    WHEN m.tcm_kind = ''SAFE_TRANSFER'' AND m.tcm_to_safe_id = s.tsf_id THEN m.tcm_amount
                    WHEN m.tcm_kind IN (''FLOAT_ISSUE'', ''TOP_UP'', ''REMIT'', ''SAFE_TRANSFER'') AND m.tcm_safe_id = s.tsf_id THEN -m.tcm_amount
                    ELSE 0 END)
                   FROM accounts.till_cash_movement m
                  WHERE (m.tcm_safe_id = s.tsf_id OR m.tcm_to_safe_id = s.tsf_id)
                    AND m.tcm_status = ''POSTED'' AND m.tcm_is_deleted = false), 0) AS balance,
       COALESCE((SELECT to_char(k.tct_counted_on, ''DD-MM-YYYY HH12:MI AM'') FROM accounts.till_count k
                  WHERE k.tct_safe_id = s.tsf_id AND k.tct_session_id IS NULL AND k.tct_is_deleted = false
                  ORDER BY k.tct_counted_on DESC LIMIT 1), '''') AS last_count,
       COALESCE((SELECT to_char(m.tcm_doc_date, ''DD-MM-YYYY'') || '' · '' || to_char(m.tcm_amount, ''FM99,99,99,990.00'')
                   FROM accounts.till_cash_movement m
                  WHERE m.tcm_safe_id = s.tsf_id AND m.tcm_kind = ''REMIT'' AND m.tcm_status = ''POSTED'' AND m.tcm_is_deleted = false
                  ORDER BY m.tcm_doc_date DESC, m.tcm_created_on DESC LIMIT 1), '''') AS last_remit
  FROM accounts.till_safe s
  LEFT JOIN accounts.acc_ledger_master l ON l.led_id = s.tsf_ledger_id
 WHERE s.tsf_is_deleted = false
   AND s.tsf_company_id::text = ''icompany_id''
   AND s.tsf_branch_id::text = ''ibranch_id''
   AND (''iinactive'' = ''true'' OR s.tsf_is_active)
 ORDER BY s.tsf_code', 't'),
  ('144', 'MAIN LIST - TILL SESSIONS', 'Desktop', 'accounts.till_session of one branch over a business-date range, for the Till Sessions list (S6, menu 273). istatus = a status or ''''; ivariance = SHORT / EXCESS / PENDING / NONE / TO_APPROVE or ''''.', 'tss_opened_on', 'Descending', 'SELECT s.tss_id, s.tss_company_id, s.tss_branch_id, s.tss_acc_year, s.tss_session_no,
       to_char(s.tss_business_date, ''DD-MM-YYYY'') AS business_date, s.tss_opened_on,
       c.tcn_code AS counter_code, c.tcn_name AS counter_name,
       COALESCE(u.usr_full_name, u.usr_login_name) AS cashier,
       to_char(s.tss_opened_on, ''HH12:MI AM'') AS opened_at,
       COALESCE(to_char(s.tss_closed_on, ''HH12:MI AM''), '''') AS closed_at,
       round((extract(epoch FROM (COALESCE(s.tss_closed_on, s.tss_billing_ended_on, now()) - s.tss_opened_on)) / 3600)::numeric, 1) AS hours,
       CASE WHEN s.tss_status = ''CLOSED'' THEN s.tss_bill_count
            ELSE (SELECT count(*) FROM sales.sale_bill b WHERE b.sb_session_id = s.tss_id AND b.sb_is_deleted = false
                     AND b.sb_status = ''POSTED'') END AS bills,
       CASE WHEN s.tss_status = ''CLOSED'' THEN s.tss_net_sales END AS net_sales,
       CASE WHEN s.tss_status = ''CLOSED'' THEN s.tss_cash_expected ELSE (SELECT v.tvr_expected FROM accounts.till_variance v
          WHERE v.tvr_session_id = s.tss_id AND v.tvr_stage <> ''OPEN'' AND v.tvr_tender_type_id = 1
          ORDER BY v.tvr_created_on DESC LIMIT 1) END AS cash_expected,
       CASE WHEN s.tss_status = ''CLOSED'' THEN s.tss_cash_counted ELSE (SELECT v.tvr_counted FROM accounts.till_variance v
          WHERE v.tvr_session_id = s.tss_id AND v.tvr_stage <> ''OPEN'' AND v.tvr_tender_type_id = 1
          ORDER BY v.tvr_created_on DESC LIMIT 1) END AS cash_counted,
       CASE WHEN s.tss_status = ''CLOSED'' THEN s.tss_cash_variance ELSE (SELECT v.tvr_variance FROM accounts.till_variance v
          WHERE v.tvr_session_id = s.tss_id AND v.tvr_stage <> ''OPEN'' AND v.tvr_tender_type_id = 1
          ORDER BY v.tvr_created_on DESC LIMIT 1) END AS cash_variance,
       replace(COALESCE((SELECT v.tvr_treatment FROM accounts.till_variance v
          WHERE v.tvr_session_id = s.tss_id AND v.tvr_stage <> ''OPEN'' AND v.tvr_tender_type_id = 1
          ORDER BY v.tvr_created_on DESC LIMIT 1), ''''), ''WITHIN_TOLERANCE'', ''WITHIN TOL.'') AS treatment,
       concat_ws('' · '',
         CASE WHEN s.tss_count_attempts > 1 THEN ''RECOUNT'' END,
         CASE WHEN s.tss_force_closed THEN ''FORCE CLOSED'' END,
         CASE WHEN s.tss_float_variance <> 0 THEN ''FLOAT '' || to_char(s.tss_float_variance, ''FM999999990.00'') END,
         CASE WHEN s.tss_noncash_variance <> 0 THEN ''NONCASH '' || to_char(s.tss_noncash_variance, ''FM999999990.00'') END,
         CASE WHEN s.tss_reopen_count > 0 THEN ''REOPENED'' END) AS flags,
       COALESCE(s.tss_z_no::text, '''') AS z_no,
       COALESCE((SELECT CASE WHEN bool_or(m.tcm_receipt_status = ''AWAITING'') THEN ''TO APPROVE''
                WHEN bool_or(COALESCE(m.tcm_received_amount, 0) <> m.tcm_amount) THEN ''DIFFERENCE''
                ELSE ''APPROVED'' END
          FROM accounts.till_cash_movement m
         WHERE m.tcm_session_id = s.tss_id AND m.tcm_status = ''POSTED'' AND m.tcm_is_deleted = false
           AND m.tcm_receipt_status IS NOT NULL
        HAVING count(*) > 0), '''') AS cash_receipt,
       replace(s.tss_status, ''_'', '' '') AS status_text, s.tss_status
  FROM accounts.till_session s
  JOIN accounts.till_counter c ON c.tcn_id = s.tss_counter_id
  LEFT JOIN public.user_master u ON u.usr_id = s.tss_operator_id
 WHERE s.tss_is_deleted = false
   AND s.tss_company_id::text = ''icompany_id''
   AND s.tss_branch_id::text = ''ibranch_id''
   AND (NULLIF(''ifrom_date'', '''') IS NULL OR s.tss_business_date::text >= ''ifrom_date'')
   AND (NULLIF(''ito_date'', '''') IS NULL OR s.tss_business_date::text <= ''ito_date'')
   AND (NULLIF(''istatus'', '''') IS NULL OR s.tss_status = ''istatus'')
   AND (NULLIF(''ivariance'', '''') IS NULL
        OR (''ivariance'' = ''SHORT''   AND COALESCE(CASE WHEN s.tss_status = ''CLOSED'' THEN s.tss_cash_variance
                                                      ELSE (SELECT v.tvr_variance FROM accounts.till_variance v
          WHERE v.tvr_session_id = s.tss_id AND v.tvr_stage <> ''OPEN'' AND v.tvr_tender_type_id = 1
          ORDER BY v.tvr_created_on DESC LIMIT 1) END, 0) < 0)
        OR (''ivariance'' = ''EXCESS''  AND COALESCE(CASE WHEN s.tss_status = ''CLOSED'' THEN s.tss_cash_variance
                                                      ELSE (SELECT v.tvr_variance FROM accounts.till_variance v
          WHERE v.tvr_session_id = s.tss_id AND v.tvr_stage <> ''OPEN'' AND v.tvr_tender_type_id = 1
          ORDER BY v.tvr_created_on DESC LIMIT 1) END, 0) > 0)
        OR (''ivariance'' = ''PENDING'' AND (s.tss_status = ''PENDING_APPROVAL'' OR s.tss_variance_status = ''PENDING''))
        OR (''ivariance'' = ''NONE''    AND s.tss_status = ''CLOSED'' AND COALESCE(s.tss_cash_variance, 0) = 0)
        OR (''ivariance'' = ''TO_APPROVE'' AND (SELECT CASE WHEN bool_or(m.tcm_receipt_status = ''AWAITING'') THEN ''TO APPROVE''
                WHEN bool_or(COALESCE(m.tcm_received_amount, 0) <> m.tcm_amount) THEN ''DIFFERENCE''
                ELSE ''APPROVED'' END
          FROM accounts.till_cash_movement m
         WHERE m.tcm_session_id = s.tss_id AND m.tcm_status = ''POSTED'' AND m.tcm_is_deleted = false
           AND m.tcm_receipt_status IS NOT NULL
        HAVING count(*) > 0) = ''TO APPROVE''))
 ORDER BY s.tss_business_date DESC, s.tss_opened_on DESC', 't'),
  ('145', 'TILL SESSION EVENTS', 'Desktop', 'accounts.till_event of one till session, oldest first — the Ctrl+H history of the Till Sessions list (S6). itss_id.', 'tev_event_on', 'Ascending', 'SELECT e.tev_id, e.tev_event_on, to_char(e.tev_event_on, ''HH12:MI:SS AM'') AS te_time,
       e.tev_event_code, COALESCE(e.tev_src_refno, '''') AS te_ref,
       e.tev_amount, COALESCE(u.usr_full_name, u.usr_login_name, '''') AS te_user,
       COALESCE(r.trs_name, '''') AS te_reason,
       COALESCE(e.tev_payload::text, '''') AS te_payload
  FROM accounts.till_event e
  LEFT JOIN public.user_master u ON u.usr_id = e.tev_user_id
  LEFT JOIN accounts.till_reason r ON r.trs_id = e.tev_reason_id
 WHERE e.tev_session_id::text = ''itss_id''
 ORDER BY e.tev_event_on, e.tev_created_on', 't'),
  ('146', 'TILL SESSION BILLS', 'Desktop', 'Bills and returns of one till session for the Session Cockpit (S5) — itss_id. Returns are negative.', 'tb_time', 'Ascending', 'SELECT b.sb_id AS tb_id, ''BILL'' AS tb_kind, b.sb_bill_refno AS tb_refno,
       COALESCE(b.sb_bill_datetime, b.sb_created_on) AS tb_time,
       to_char(COALESCE(b.sb_bill_datetime, b.sb_created_on), ''HH12:MI AM'') AS tb_clock,
       COALESCE(b.sb_cust_name, '''') AS tb_party, b.sb_bill_amt AS tb_amount, b.sb_status AS tb_status
  FROM sales.sale_bill b
 WHERE b.sb_session_id::text = ''itss_id'' AND b.sb_is_deleted = false
UNION ALL
SELECT r.sr_id, ''RETURN'', r.sr_return_refno, r.sr_return_datetime, to_char(r.sr_return_datetime, ''HH12:MI AM''),
       COALESCE(r.sr_cust_name, ''''), -r.sr_return_amt, r.sr_status
  FROM sales.sale_return r
 WHERE r.sr_session_id::text = ''itss_id'' AND r.sr_is_deleted = false
 ORDER BY 4', 't'),
  ('147', 'TILL SESSION MONEY DOCS', 'Desktop', 'The money documents of one till session for the Session Cockpit (S5): its own movements (float, drop, paid in, pickup, top-up, hand-over) and the receipts / payments / expense vouchers posted in it. itss_id.', 'md_time', 'Ascending', 'SELECT m.tcm_id AS md_id, m.tcm_created_on AS md_time, to_char(m.tcm_created_on, ''HH12:MI AM'') AS md_clock,
       m.tcm_doc_no AS md_doc, m.tcm_kind AS md_kind, m.tcm_amount AS md_amount,
       concat_ws('' · '', NULLIF(r.trs_name, ''''), NULLIF(m.tcm_party_name, ''''),
                 CASE WHEN m.tcm_bag_no IS NOT NULL THEN ''bag '' || m.tcm_bag_no || COALESCE('' / '' || m.tcm_seal_no, '''') END) AS md_detail,
       COALESCE(ub.usr_full_name, ub.usr_login_name, m.tcm_created_by, '''') AS md_by,
       COALESCE(uw.usr_full_name, uw.usr_login_name, '''') AS md_witness, m.tcm_status AS md_status
  FROM accounts.till_cash_movement m
  LEFT JOIN accounts.till_reason r ON r.trs_id = m.tcm_reason_id
  LEFT JOIN public.user_master ub ON ub.usr_id = m.tcm_done_by
  LEFT JOIN public.user_master uw ON uw.usr_id = m.tcm_witness_by
 WHERE m.tcm_session_id::text = ''itss_id'' AND m.tcm_is_deleted = false
UNION ALL
SELECT h.avh_voucher_id, h.avh_created_on, to_char(h.avh_created_on, ''HH12:MI AM''),
       COALESCE(h.avh_voucher_refno, h.avh_voucher_no::text), upper(t.vchr_type_name), h.avh_doc_amount,
       COALESCE(l.led_name, ''''), COALESCE(u.usr_full_name, u.usr_login_name, ''''), '''', h.avh_voucher_status
  FROM accounts.acc_voucher_header h
  JOIN accounts.acc_voucher_types t ON t.vchr_type_id = h.avh_voucher_type_id
  LEFT JOIN accounts.acc_ledger_master l ON l.led_id = h.avh_party_id
  LEFT JOIN public.user_master u ON u.usr_id = h.avh_user_id
 WHERE h.avh_session_id::text = ''itss_id'' AND h.avh_is_deleted = false
   AND t.vchr_type_code IN (''Rct'', ''RcpV'', ''Pmt'', ''PmtV'', ''ExpV'', ''ARc'')
 ORDER BY 2', 't'),
  ('148', 'TILL SESSION COUNTS', 'Desktop', 'Every count attempt of one till session (till_count), kept never overwritten — Session Cockpit (S5). itss_id.', 'tct_counted_on', 'Ascending', 'SELECT c.tct_id, c.tct_counted_on, c.tct_attempt_no, c.tct_kind, to_char(c.tct_counted_on, ''HH12:MI AM'') AS tc_clock,
       c.tct_total_counted, c.tct_expected, CASE WHEN c.tct_is_blind THEN ''yes'' ELSE ''no'' END AS tc_blind,
       COALESCE(u.usr_full_name, u.usr_login_name, c.tct_created_by, '''') AS tc_by,
       CASE WHEN c.tct_is_final THEN ''final'' ELSE '''' END AS tc_final
  FROM accounts.till_count c
  LEFT JOIN public.user_master u ON u.usr_id = c.tct_counted_by
 WHERE c.tct_session_id::text = ''itss_id'' AND c.tct_is_deleted = false AND c.tct_kind IN (''OPEN'', ''CLOSE'', ''RECOUNT'')
 ORDER BY c.tct_counted_on', 't'),
  ('149', 'MAIN LIST - TILL BUSINESS DAYS', 'Desktop', 'accounts.till_business_day of one branch over a date range, newest first — the List tab of the Business Day screen (menu 274). Session figures are live sums of the day''s sessions.', 'tbd_business_date', 'Descending', 'SELECT d.tbd_id, d.tbd_company_id, d.tbd_branch_id, d.tbd_acc_year, d.tbd_business_date,
       to_char(d.tbd_business_date, ''DD-MM-YYYY'') AS bd_date, d.tbd_status,
       to_char(d.tbd_opened_on, ''HH12:MI AM'') AS bd_opened, COALESCE(to_char(d.tbd_closed_on, ''HH12:MI AM''), '''') AS bd_closed,
       (SELECT count(*) FROM accounts.till_session s WHERE s.tss_day_id = d.tbd_id AND s.tss_is_deleted = false) AS bd_sessions,
       (SELECT count(*) FROM accounts.till_session s WHERE s.tss_day_id = d.tbd_id AND s.tss_is_deleted = false
           AND s.tss_status = ''CLOSED'') AS bd_closed_sessions,
       (SELECT COALESCE(sum(s.tss_net_sales), 0) FROM accounts.till_session s WHERE s.tss_day_id = d.tbd_id
           AND s.tss_is_deleted = false AND s.tss_status = ''CLOSED'') AS bd_net_sales,
       (SELECT COALESCE(sum(s.tss_cash_variance), 0) FROM accounts.till_session s WHERE s.tss_day_id = d.tbd_id
           AND s.tss_is_deleted = false AND s.tss_status = ''CLOSED'') AS bd_cash_variance,
       COALESCE(d.tbd_z_no::text, '''') AS bd_z, d.tbd_reopen_count
  FROM accounts.till_business_day d
 WHERE d.tbd_is_deleted = false
   AND d.tbd_company_id::text = ''icompany_id''
   AND d.tbd_branch_id::text = ''ibranch_id''
   AND (NULLIF(''ifrom_date'', '''') IS NULL OR d.tbd_business_date::text >= ''ifrom_date'')
   AND (NULLIF(''ito_date'', '''') IS NULL OR d.tbd_business_date::text <= ''ito_date'')
 ORDER BY d.tbd_business_date DESC', 't'),
  ('150', 'TILL DAY SESSIONS', 'Desktop', 'The sessions of one business day for the Business Day screen (menu 274) — the Till Sessions list SQL (grid 144) with the slim S8 column set.', 'tss_opened_on', 'Descending', 'SELECT s.tss_id, s.tss_company_id, s.tss_branch_id, s.tss_acc_year, s.tss_session_no,
       to_char(s.tss_business_date, ''DD-MM-YYYY'') AS business_date, s.tss_opened_on,
       c.tcn_code AS counter_code, c.tcn_name AS counter_name,
       COALESCE(u.usr_full_name, u.usr_login_name) AS cashier,
       to_char(s.tss_opened_on, ''HH12:MI AM'') AS opened_at,
       COALESCE(to_char(s.tss_closed_on, ''HH12:MI AM''), '''') AS closed_at,
       round((extract(epoch FROM (COALESCE(s.tss_closed_on, s.tss_billing_ended_on, now()) - s.tss_opened_on)) / 3600)::numeric, 1) AS hours,
       CASE WHEN s.tss_status = ''CLOSED'' THEN s.tss_bill_count
            ELSE (SELECT count(*) FROM sales.sale_bill b WHERE b.sb_session_id = s.tss_id AND b.sb_is_deleted = false
                     AND b.sb_status = ''POSTED'') END AS bills,
       CASE WHEN s.tss_status = ''CLOSED'' THEN s.tss_net_sales END AS net_sales,
       CASE WHEN s.tss_status = ''CLOSED'' THEN s.tss_cash_expected ELSE (SELECT v.tvr_expected FROM accounts.till_variance v
          WHERE v.tvr_session_id = s.tss_id AND v.tvr_stage <> ''OPEN'' AND v.tvr_tender_type_id = 1
          ORDER BY v.tvr_created_on DESC LIMIT 1) END AS cash_expected,
       CASE WHEN s.tss_status = ''CLOSED'' THEN s.tss_cash_counted ELSE (SELECT v.tvr_counted FROM accounts.till_variance v
          WHERE v.tvr_session_id = s.tss_id AND v.tvr_stage <> ''OPEN'' AND v.tvr_tender_type_id = 1
          ORDER BY v.tvr_created_on DESC LIMIT 1) END AS cash_counted,
       CASE WHEN s.tss_status = ''CLOSED'' THEN s.tss_cash_variance ELSE (SELECT v.tvr_variance FROM accounts.till_variance v
          WHERE v.tvr_session_id = s.tss_id AND v.tvr_stage <> ''OPEN'' AND v.tvr_tender_type_id = 1
          ORDER BY v.tvr_created_on DESC LIMIT 1) END AS cash_variance,
       replace(COALESCE((SELECT v.tvr_treatment FROM accounts.till_variance v
          WHERE v.tvr_session_id = s.tss_id AND v.tvr_stage <> ''OPEN'' AND v.tvr_tender_type_id = 1
          ORDER BY v.tvr_created_on DESC LIMIT 1), ''''), ''WITHIN_TOLERANCE'', ''WITHIN TOL.'') AS treatment,
       concat_ws('' · '',
         CASE WHEN s.tss_count_attempts > 1 THEN ''RECOUNT'' END,
         CASE WHEN s.tss_force_closed THEN ''FORCE CLOSED'' END,
         CASE WHEN s.tss_float_variance <> 0 THEN ''FLOAT '' || to_char(s.tss_float_variance, ''FM999999990.00'') END,
         CASE WHEN s.tss_noncash_variance <> 0 THEN ''NONCASH '' || to_char(s.tss_noncash_variance, ''FM999999990.00'') END,
         CASE WHEN s.tss_reopen_count > 0 THEN ''REOPENED'' END) AS flags,
       COALESCE(s.tss_z_no::text, '''') AS z_no,
       COALESCE((SELECT CASE WHEN bool_or(m.tcm_receipt_status = ''AWAITING'') THEN ''TO APPROVE''
                WHEN bool_or(COALESCE(m.tcm_received_amount, 0) <> m.tcm_amount) THEN ''DIFFERENCE''
                ELSE ''APPROVED'' END
          FROM accounts.till_cash_movement m
         WHERE m.tcm_session_id = s.tss_id AND m.tcm_status = ''POSTED'' AND m.tcm_is_deleted = false
           AND m.tcm_receipt_status IS NOT NULL
        HAVING count(*) > 0), '''') AS cash_receipt,
       replace(s.tss_status, ''_'', '' '') AS status_text, s.tss_status
  FROM accounts.till_session s
  JOIN accounts.till_counter c ON c.tcn_id = s.tss_counter_id
  LEFT JOIN public.user_master u ON u.usr_id = s.tss_operator_id
 WHERE s.tss_is_deleted = false
   AND s.tss_company_id::text = ''icompany_id''
   AND s.tss_branch_id::text = ''ibranch_id''
   AND (NULLIF(''ifrom_date'', '''') IS NULL OR s.tss_business_date::text >= ''ifrom_date'')
   AND (NULLIF(''ito_date'', '''') IS NULL OR s.tss_business_date::text <= ''ito_date'')
   AND (NULLIF(''istatus'', '''') IS NULL OR s.tss_status = ''istatus'')
   AND (NULLIF(''ivariance'', '''') IS NULL
        OR (''ivariance'' = ''SHORT''   AND COALESCE(CASE WHEN s.tss_status = ''CLOSED'' THEN s.tss_cash_variance
                                                      ELSE (SELECT v.tvr_variance FROM accounts.till_variance v
          WHERE v.tvr_session_id = s.tss_id AND v.tvr_stage <> ''OPEN'' AND v.tvr_tender_type_id = 1
          ORDER BY v.tvr_created_on DESC LIMIT 1) END, 0) < 0)
        OR (''ivariance'' = ''EXCESS''  AND COALESCE(CASE WHEN s.tss_status = ''CLOSED'' THEN s.tss_cash_variance
                                                      ELSE (SELECT v.tvr_variance FROM accounts.till_variance v
          WHERE v.tvr_session_id = s.tss_id AND v.tvr_stage <> ''OPEN'' AND v.tvr_tender_type_id = 1
          ORDER BY v.tvr_created_on DESC LIMIT 1) END, 0) > 0)
        OR (''ivariance'' = ''PENDING'' AND (s.tss_status = ''PENDING_APPROVAL'' OR s.tss_variance_status = ''PENDING''))
        OR (''ivariance'' = ''NONE''    AND s.tss_status = ''CLOSED'' AND COALESCE(s.tss_cash_variance, 0) = 0)
        OR (''ivariance'' = ''TO_APPROVE'' AND (SELECT CASE WHEN bool_or(m.tcm_receipt_status = ''AWAITING'') THEN ''TO APPROVE''
                WHEN bool_or(COALESCE(m.tcm_received_amount, 0) <> m.tcm_amount) THEN ''DIFFERENCE''
                ELSE ''APPROVED'' END
          FROM accounts.till_cash_movement m
         WHERE m.tcm_session_id = s.tss_id AND m.tcm_status = ''POSTED'' AND m.tcm_is_deleted = false
           AND m.tcm_receipt_status IS NOT NULL
        HAVING count(*) > 0) = ''TO APPROVE''))
 ORDER BY (COALESCE((SELECT CASE WHEN bool_or(m.tcm_receipt_status = ''AWAITING'') THEN ''TO APPROVE''
                WHEN bool_or(COALESCE(m.tcm_received_amount, 0) <> m.tcm_amount) THEN ''DIFFERENCE''
                ELSE ''APPROVED'' END
          FROM accounts.till_cash_movement m
         WHERE m.tcm_session_id = s.tss_id AND m.tcm_status = ''POSTED'' AND m.tcm_is_deleted = false
           AND m.tcm_receipt_status IS NOT NULL
        HAVING count(*) > 0), '''') = ''TO APPROVE'' OR s.tss_status = ''PENDING_APPROVAL''
           OR s.tss_variance_status = ''PENDING'') DESC,
          s.tss_business_date DESC, s.tss_opened_on DESC', 't'),
  ('151', 'TILL APPROVAL RULES', 'Desktop', 'accounts.till_approval_rule rows a company sees (shipped + company + its branches) for Till Approval Setup (menu 276). The screen resolves branch > company > shipped, latest effective-from.', 'tar_event_code', 'Ascending', 'SELECT r.tar_id, r.tar_company_id, r.tar_branch_id, COALESCE(b.br_name, '''') AS branch_name,
       CASE WHEN r.tar_branch_id IS NOT NULL THEN ''BRANCH'' WHEN r.tar_company_id IS NOT NULL THEN ''COMPANY''
            ELSE ''SHIPPED'' END AS layer,
       r.tar_event_code, r.tar_mode, r.tar_threshold_amount, r.tar_threshold_count, r.tar_threshold_percent,
       r.tar_channel, r.tar_min_role, r.tar_two_person, r.tar_allow_self, r.tar_blocks_till, r.tar_expire_minutes,
       to_char(r.tar_effective_from, ''YYYY-MM-DD'') AS tar_effective_from, COALESCE(r.tar_remarks, '''') AS tar_remarks,
       r.tar_is_active
  FROM accounts.till_approval_rule r
  LEFT JOIN public.branch_master b ON b.br_id = r.tar_branch_id
 WHERE r.tar_is_deleted = false
   AND (r.tar_company_id IS NULL OR r.tar_company_id::text = ''icompany_id'')
 ORDER BY r.tar_event_code, r.tar_effective_from', 't'),
  ('152', 'TILL APPROVAL GRANTS', 'Desktop', 'accounts.till_approval_authority grants that reach a company (company NULL = every company, or the company): the list of Till Approval Authority (menu 285), also read by Till Approval Rules (276) and Who can approve?. icompany_id; iinactive ''true'' = ended / switched-off grants too.', 'taa_user_id', 'Ascending', 'SELECT a.taa_id, a.taa_user_id, COALESCE(NULLIF(u.usr_full_name, ''''), NULLIF(u.usr_display_name, ''''), u.usr_login_name) AS approver,
       COALESCE(u.usr_type, '''') AS user_role, (u.usr_pin_hash IS NOT NULL) AS pin_set,
       a.taa_company_id, COALESCE(c.comp_name, ''(every company)'') AS company_name,
       a.taa_branch_id, COALESCE(b.br_name, ''(every branch)'') AS branch_name,
       a.taa_role, COALESCE(a.taa_event_code, '''') AS taa_event_code,
       COALESCE(a.taa_event_code, ''(every event)'') AS event_label,
       a.taa_max_amount,
       CASE WHEN a.taa_max_amount IS NULL THEN ''no ceiling''
            ELSE to_char(a.taa_max_amount, ''FM99,99,99,99,990.00'') END AS max_label,
       a.taa_can_remote,
       to_char(a.taa_valid_from, ''YYYY-MM-DD'') AS taa_valid_from, COALESCE(to_char(a.taa_valid_to, ''YYYY-MM-DD''), '''') AS taa_valid_to,
       to_char(a.taa_valid_from, ''DD-MM-YYYY'') AS valid_from_label, COALESCE(to_char(a.taa_valid_to, ''DD-MM-YYYY''), '''') AS valid_to_label,
       COALESCE(a.taa_remarks, '''') AS taa_remarks, a.taa_is_active,
       (a.taa_is_active AND (a.taa_valid_to IS NULL OR a.taa_valid_to >= CURRENT_DATE)) AS grant_open,
       CASE WHEN NOT a.taa_is_active THEN ''OFF''
            WHEN a.taa_valid_from > CURRENT_DATE THEN ''FUTURE''
            WHEN a.taa_valid_to < CURRENT_DATE THEN ''ENDED''
            ELSE ''ACTIVE'' END AS grant_status
  FROM accounts.till_approval_authority a
  JOIN public.user_master u ON u.usr_id = a.taa_user_id
  LEFT JOIN public.companys c ON c.comp_id = a.taa_company_id
  LEFT JOIN public.branch_master b ON b.br_id = a.taa_branch_id
 WHERE a.taa_is_deleted = false
   AND (a.taa_company_id IS NULL OR a.taa_company_id::text = ''icompany_id'')
   AND (''iinactive'' = ''true'' OR (a.taa_is_active AND (a.taa_valid_to IS NULL OR a.taa_valid_to >= CURRENT_DATE)))
 ORDER BY 3, a.taa_valid_from', 't');

INSERT INTO pg_temp.sync_grid_column (grid_name, grid_device_type, grid_column_number, grid_column_name, grid_column_width, grid_column_alignment, grid_column_visibility, grid_column_filter, grid_column_condition, grid_column_condition_color, grid_column_group, grid_column_total, grid_column_data_type, grid_column_color, grid_column_notes, grid_column_is_deleted, grid_column_position, grid_column_sql_field_name, grid_column_px) VALUES
  ('POPUP - TXN HISTORY', 'Desktop', '1', '#', '5.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '1.00', 'tsl_id', NULL),
  ('POPUP - TXN HISTORY', 'Desktop', '2', '#', '5.00', 'center', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 'f', '2.00', 'tsl_seq_no', NULL),
  ('POPUP - TXN HISTORY', 'Desktop', '3', 'Event', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '3.00', 'tsl_event_text', NULL),
  ('POPUP - TXN HISTORY', 'Desktop', '4', 'Status', '16.00', 'left', 't', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '4.00', 'tsl_status_text', NULL),
  ('POPUP - TXN HISTORY', 'Desktop', '5', 'When', '17.00', 'left', 't', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '5.00', 'tsl_changed_at', NULL),
  ('POPUP - TXN HISTORY', 'Desktop', '6', 'By', '11.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '6.00', 'tsl_user_name', NULL),
  ('POPUP - TXN HISTORY', 'Desktop', '7', 'Device', '11.00', 'left', 't', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '7.00', 'tsl_device_name', NULL),
  ('POPUP - TXN HISTORY', 'Desktop', '8', 'Remarks', '28.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '8.00', 'tsl_remarks', NULL),
  ('POPUP - TXN HISTORY', 'Desktop', '9', 'Ref No', '10.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '9.00', 'tsl_src_doc_refno', NULL),
  ('POPUP - TXN HISTORY', 'Desktop', '10', 'Doc Type', '10.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '10.00', 'tsl_src_doc_type', NULL),
  ('MAIN LIST - TILL COUNTERS', 'Desktop', '1', '#', '10.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tcn_id', NULL),
  ('MAIN LIST - TILL COUNTERS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '1.00', 'tcn_id', NULL),
  ('MAIN LIST - TILL COUNTERS', 'Desktop', '2', 'Code', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'tcn_code', NULL),
  ('MAIN LIST - TILL COUNTERS', 'Desktop', '2', 'Code', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '2.00', 'tcn_code', NULL),
  ('MAIN LIST - TILL COUNTERS', 'Desktop', '3', 'Name', '16.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '3.00', 'tcn_name', NULL),
  ('MAIN LIST - TILL COUNTERS', 'Desktop', '3', 'Name', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'tcn_name', NULL),
  ('MAIN LIST - TILL COUNTERS', 'Desktop', '4', 'Kind', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'tcn_kind', NULL),
  ('MAIN LIST - TILL COUNTERS', 'Desktop', '4', 'Kind', '9.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '4.00', 'tcn_kind', NULL),
  ('MAIN LIST - TILL COUNTERS', 'Desktop', '5', 'Device', '13.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '5.00', 'device_name', NULL),
  ('MAIN LIST - TILL COUNTERS', 'Desktop', '5', 'Device', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'device_name', NULL),
  ('MAIN LIST - TILL COUNTERS', 'Desktop', '6', 'Drawer', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'tcn_drawer_mode', NULL),
  ('MAIN LIST - TILL COUNTERS', 'Desktop', '6', 'Drawer', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '6.00', 'tcn_drawer_mode', NULL),
  ('MAIN LIST - TILL COUNTERS', 'Desktop', '7', 'Float', '10.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '7.00', 'tcn_default_float', NULL),
  ('MAIN LIST - TILL COUNTERS', 'Desktop', '7', 'Float', '8.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 'f', '7.00', 'tcn_default_float', NULL),
  ('MAIN LIST - TILL COUNTERS', 'Desktop', '8', 'Safe', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '8.00', 'safe_name', NULL),
  ('MAIN LIST - TILL COUNTERS', 'Desktop', '8', 'Live session', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '8.00', 'live_session_no', NULL),
  ('MAIN LIST - TILL COUNTERS', 'Desktop', '9', 'Live session', '11.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '9.00', 'live_session_no', NULL),
  ('MAIN LIST - TILL COUNTERS', 'Desktop', '9', 'Active', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '9.00', 'tcn_is_active', NULL),
  ('MAIN LIST - TILL COUNTERS', 'Desktop', '10', 'Last closed', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '10.00', 'last_closed', NULL),
  ('MAIN LIST - TILL COUNTERS', 'Desktop', '11', 'Active', '6.00', 'center', 't', 'f', NULL, NULL, 'f', 'f', 'Boolean', NULL, NULL, 'f', '11.00', 'tcn_is_active', NULL),
  ('MAIN LIST - TILL REASONS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '1.00', 'trs_id', NULL),
  ('MAIN LIST - TILL REASONS', 'Desktop', '1', '#', '10.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'trs_id', NULL),
  ('MAIN LIST - TILL REASONS', 'Desktop', '2', 'Category', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'trs_category', NULL),
  ('MAIN LIST - TILL REASONS', 'Desktop', '2', 'Category', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '2.00', 'trs_category', NULL),
  ('MAIN LIST - TILL REASONS', 'Desktop', '3', 'Code', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '3.00', 'trs_code', NULL),
  ('MAIN LIST - TILL REASONS', 'Desktop', '3', 'Code', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'trs_code', NULL),
  ('MAIN LIST - TILL REASONS', 'Desktop', '4', 'Name', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'trs_name', NULL),
  ('MAIN LIST - TILL REASONS', 'Desktop', '4', 'Name', '20.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '4.00', 'trs_name', NULL),
  ('MAIN LIST - TILL REASONS', 'Desktop', '5', 'Default ledger', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'ledger_name', NULL),
  ('MAIN LIST - TILL REASONS', 'Desktop', '5', 'Default ledger', '15.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '5.00', 'ledger_name', NULL),
  ('MAIN LIST - TILL REASONS', 'Desktop', '6', 'Note', '5.00', 'center', 't', 'f', NULL, NULL, 'f', 'f', 'Boolean', NULL, NULL, 'f', '6.00', 'trs_needs_note', NULL),
  ('MAIN LIST - TILL REASONS', 'Desktop', '6', 'Cap', '10.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '6.00', 'trs_max_amount', NULL),
  ('MAIN LIST - TILL REASONS', 'Desktop', '7', 'Shipped', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'shipped', NULL),
  ('MAIN LIST - TILL REASONS', 'Desktop', '7', 'Ref', '5.00', 'center', 't', 'f', NULL, NULL, 'f', 'f', 'Boolean', NULL, NULL, 'f', '7.00', 'trs_needs_ref', NULL),
  ('MAIN LIST - TILL REASONS', 'Desktop', '8', 'Cap', '8.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 'f', '8.00', 'trs_max_amount', NULL),
  ('MAIN LIST - TILL REASONS', 'Desktop', '8', 'Active', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '8.00', 'trs_is_active', NULL),
  ('MAIN LIST - TILL REASONS', 'Desktop', '9', 'Shipped', '6.00', 'center', 't', 'f', NULL, NULL, 'f', 'f', 'Boolean', NULL, NULL, 'f', '9.00', 'shipped', NULL),
  ('MAIN LIST - TILL REASONS', 'Desktop', '10', 'Replaced', '6.00', 'center', 't', 'f', NULL, NULL, 'f', 'f', 'Boolean', NULL, NULL, 'f', '10.00', 'overridden', NULL),
  ('MAIN LIST - TILL REASONS', 'Desktop', '11', 'Used 30d', '5.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 'f', '11.00', 'used_30d', NULL),
  ('MAIN LIST - TILL REASONS', 'Desktop', '12', 'Active', '6.00', 'center', 't', 'f', NULL, NULL, 'f', 'f', 'Boolean', NULL, NULL, 'f', '12.00', 'trs_is_active', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '1.00', 'tdn_id', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '1', '#', '10.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tdn_id', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tdn_id', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '2', 'Kind', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'tdn_kind', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '2', 'Currency', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '2.00', 'tdn_currency', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '2', 'Currency', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'tdn_currency', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '3', 'Value', '10.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '3.00', 'tdn_value', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '3', 'Kind', '9.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '3.00', 'tdn_kind', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '3', 'Kind', '9.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'tdn_kind', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '4', 'Label', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'tdn_label', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '4', 'Value', '11.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '4.00', 'tdn_value', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '4', 'Value', '11.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 'f', '4.00', 'tdn_value', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '5', 'Bundle', '10.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '5.00', 'tdn_bundle_qty', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '5', 'Label', '18.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '5.00', 'tdn_label', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '5', 'Label', '18.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'tdn_label', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '6', 'Bundle', '8.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 'f', '6.00', 'tdn_bundle_qty', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '6', 'Bundle', '8.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '6.00', 'tdn_bundle_qty', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '6', 'Sort', '10.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '6.00', 'tdn_sort_order', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '7', 'Valid to', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'tdn_valid_to', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '7', 'Sort', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '7.00', 'tdn_sort_order', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '7', 'Sort', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 'f', '7.00', 'tdn_sort_order', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '8', 'Valid to', '11.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '8.00', 'tdn_valid_to', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '8', 'Valid to', '11.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '8.00', 'tdn_valid_to', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '8', 'Shipped', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '8.00', 'shipped', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '9', 'Active', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '9.00', 'tdn_is_active', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '9', 'Shipped', '7.00', 'center', 't', 'f', NULL, NULL, 'f', 'f', 'Boolean', NULL, NULL, 'f', '9.00', 'shipped', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '9', 'Shipped', '8.00', 'center', 't', 'f', NULL, NULL, 'f', 'f', 'Boolean', NULL, NULL, 't', '9.00', 'shipped', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '10', 'Replaced', '7.00', 'center', 't', 'f', NULL, NULL, 'f', 'f', 'Boolean', NULL, NULL, 'f', '10.00', 'overridden', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '10', 'In use', '8.00', 'center', 't', 'f', NULL, NULL, 'f', 'f', 'Boolean', NULL, NULL, 't', '10.00', 'used', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '11', 'Active', '8.00', 'center', 't', 'f', NULL, NULL, 'f', 'f', 'Boolean', NULL, NULL, 't', '11.00', 'tdn_is_active', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '11', 'In use', '7.00', 'center', 't', 'f', NULL, NULL, 'f', 'f', 'Boolean', NULL, NULL, 'f', '11.00', 'used', NULL),
  ('MAIN LIST - TILL DENOMINATIONS', 'Desktop', '12', 'Active', '7.00', 'center', 't', 'f', NULL, NULL, 'f', 'f', 'Boolean', NULL, NULL, 'f', '12.00', 'tdn_is_active', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tsf_id', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '1.00', 'tsf_id', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '1', '#', '10.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tsf_id', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '2', 'Code', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'tsf_code', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '2', 'Code', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '2.00', 'tsf_code', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '2', 'Code', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'tsf_code', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '3', 'Name', '15.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '3.00', 'tsf_name', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '3', 'Name', '15.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'tsf_name', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '3', 'Name', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'tsf_name', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '4', 'Ledger', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'ledger_name', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '4', 'Ledger', '15.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '4.00', 'ledger_name', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '4', 'Ledger', '15.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'ledger_name', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '5', 'Insured limit', '10.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '5.00', 'tsf_insured_limit', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '5', 'Insured limit', '10.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '5.00', 'tsf_insured_limit', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '5', 'Insured limit', '9.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 'f', '5.00', 'tsf_insured_limit', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '6', 'Default', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'tsf_is_default', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '6', 'Default', '7.00', 'center', 't', 'f', NULL, NULL, 'f', 'f', 'Boolean', NULL, NULL, 't', '6.00', 'tsf_is_default', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '6', 'Default', '7.00', 'center', 't', 'f', NULL, NULL, 'f', 'f', 'Boolean', NULL, NULL, 'f', '6.00', 'tsf_is_default', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '7', 'Counters', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'counter_codes', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '7', 'Drop safe', '7.00', 'center', 't', 'f', NULL, NULL, 'f', 'f', 'Boolean', NULL, NULL, 'f', '7.00', 'tsf_is_drop_safe', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '7', 'Counters', '10.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '7.00', 'counter_count', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '8', 'Counters', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '8.00', 'counter_codes', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '8', 'Balance', '10.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '8.00', 'balance', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '8', 'Balance', '10.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '8.00', 'balance', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '9', 'Balance', '9.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 'f', '9.00', 'balance', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '9', 'Last count', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '9.00', 'last_count', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '10', 'Last count', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '10.00', 'last_count', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '10', 'Last remit', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '10.00', 'last_remit', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '11', 'Last remit', '4.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '11.00', 'last_remit', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '11', 'Active', '6.00', 'center', 't', 'f', NULL, NULL, 'f', 'f', 'Boolean', NULL, NULL, 't', '11.00', 'tsf_is_active', NULL),
  ('MAIN LIST - TILL SAFES', 'Desktop', '12', 'Active', '6.00', 'center', 't', 'f', NULL, NULL, 'f', 'f', 'Boolean', NULL, NULL, 'f', '12.00', 'tsf_is_active', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tss_id', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tss_id', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tss_id', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tss_id', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tss_id', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tss_id', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tss_id', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tss_id', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '1.00', 'tss_id', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tss_id', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tss_id', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '2', 'Session', '9.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'tss_session_no', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '2', 'Session', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'tss_session_no', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '2', 'Session', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '2.00', 'tss_session_no', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '2', 'Session', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'tss_session_no', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '2', 'Session', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'tss_session_no', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '2', 'Session', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'tss_session_no', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '2', 'Session', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'tss_session_no', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '2', 'Session', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'tss_session_no', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '2', 'Session', '9.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'tss_session_no', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '2', 'Session', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'tss_session_no', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '2', 'Session', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'tss_session_no', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '3', 'Date', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'business_date', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '3', 'Date', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'business_date', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '3', 'Date', '6.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'business_date', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '3', 'Date', '6.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'business_date', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '3', 'Date', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'business_date', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '3', 'Date', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'business_date', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '3', 'Date', '6.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'business_date', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '3', 'Date', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'business_date', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '3', 'Date', '6.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'business_date', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '3', 'Date', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'business_date', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '3', 'Date', '6.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '3.00', 'business_date', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '4', 'Counter', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '4.00', 'counter_code', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '4', 'Counter', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'counter_code', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '4', 'Counter', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'counter_code', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '4', 'Counter', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'counter_code', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '4', 'Counter', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'counter_code', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '4', 'Counter', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'counter_code', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '4', 'Counter', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'counter_code', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '4', 'Counter', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'counter_code', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '4', 'Counter', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'counter_code', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '4', 'Counter', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'counter_code', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '4', 'Counter', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'counter_code', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '5', 'Cashier', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'cashier', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '5', 'Cashier', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'cashier', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '5', 'Cashier', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'cashier', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '5', 'Cashier', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'cashier', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '5', 'Cashier', '6.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '5.00', 'cashier', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '5', 'Cashier', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'cashier', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '5', 'Cashier', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'cashier', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '5', 'Cashier', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'cashier', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '5', 'Cashier', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'cashier', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '5', 'Cashier', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'cashier', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '5', 'Cashier', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'cashier', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '6', 'Opened', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'opened_at', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '6', 'Opened', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'opened_at', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '6', 'Opened', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'opened_at', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '6', 'Opened', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '6.00', 'opened_at', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '6', 'Opened', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'opened_at', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '6', 'Opened', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'opened_at', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '6', 'Opened', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'opened_at', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '6', 'Opened', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'opened_at', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '6', 'Opened', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'opened_at', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '6', 'Opened', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'opened_at', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '6', 'Opened', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'opened_at', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '7', 'Closed', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'closed_at', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '7', 'Closed', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'closed_at', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '7', 'Closed', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'closed_at', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '7', 'Closed', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '7.00', 'closed_at', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '7', 'Closed', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'closed_at', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '7', 'Closed', '4.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'closed_at', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '7', 'Closed', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'closed_at', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '7', 'Closed', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'closed_at', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '7', 'Closed', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'closed_at', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '7', 'Closed', '4.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'closed_at', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '7', 'Closed', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'closed_at', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '8', 'Hours', '4.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '8.00', 'hours', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '8', 'Hours', '3.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '8.00', 'hours', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '8', 'Hours', '3.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '8.00', 'hours', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '8', 'Hours', '4.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '8.00', 'hours', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '8', 'Hours', '4.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '8.00', 'hours', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '8', 'Hours', '4.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '8.00', 'hours', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '8', 'Hours', '4.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '8.00', 'hours', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '8', 'Hours', '3.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '8.00', 'hours', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '8', 'Hours', '3.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '8.00', 'hours', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '8', 'Hours', '4.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 'f', '8.00', 'hours', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '8', 'Hours', '4.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '8.00', 'hours', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '9', 'Bills', '3.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '9.00', 'bills', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '9', 'Bills', '4.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '9.00', 'bills', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '9', 'Bills', '3.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '9.00', 'bills', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '9', 'Bills', '4.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '9.00', 'bills', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '9', 'Bills', '3.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '9.00', 'bills', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '9', 'Bills', '3.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '9.00', 'bills', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '9', 'Bills', '3.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '9.00', 'bills', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '9', 'Bills', '3.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '9.00', 'bills', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '9', 'Bills', '3.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '9.00', 'bills', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '9', 'Bills', '3.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 'f', '9.00', 'bills', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '9', 'Bills', '4.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '9.00', 'bills', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '10', 'Net sales', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '10.00', 'net_sales', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '10', 'Net sales', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '10.00', 'net_sales', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '10', 'Net sales', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '10.00', 'net_sales', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '10', 'Net sales', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '10.00', 'net_sales', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '10', 'Net sales', '6.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '10.00', 'net_sales', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '10', 'Net sales', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '10.00', 'net_sales', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '10', 'Net sales', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '10.00', 'net_sales', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '10', 'Net sales', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '10.00', 'net_sales', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '10', 'Net sales', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '10.00', 'net_sales', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '10', 'Net sales', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '10.00', 'net_sales', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '10', 'Net sales', '6.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 'f', '10.00', 'net_sales', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '11', 'Cash exp.', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '11.00', 'cash_expected', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '11', 'Cash exp.', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '11.00', 'cash_expected', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '11', 'Cash exp.', '6.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '11.00', 'cash_expected', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '11', 'Cash exp.', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '11.00', 'cash_expected', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '11', 'Cash exp.', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '11.00', 'cash_expected', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '11', 'Cash exp.', '6.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 'f', '11.00', 'cash_expected', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '11', 'Cash exp.', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '11.00', 'cash_expected', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '11', 'Cash exp.', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '11.00', 'cash_expected', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '11', 'Cash exp.', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '11.00', 'cash_expected', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '11', 'Cash exp.', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '11.00', 'cash_expected', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '11', 'Cash exp.', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '11.00', 'cash_expected', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '12', 'Counted', '6.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '12.00', 'cash_counted', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '12', 'Counted', '6.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 'f', '12.00', 'cash_counted', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '12', 'Counted', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '12.00', 'cash_counted', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '12', 'Counted', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '12.00', 'cash_counted', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '12', 'Counted', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '12.00', 'cash_counted', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '12', 'Counted', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '12.00', 'cash_counted', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '12', 'Counted', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '12.00', 'cash_counted', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '12', 'Counted', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '12.00', 'cash_counted', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '12', 'Counted', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '12.00', 'cash_counted', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '12', 'Counted', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '12.00', 'cash_counted', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '12', 'Counted', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '12.00', 'cash_counted', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '13', 'Variance', '6.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '13.00', 'cash_variance', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '13', 'Variance', '6.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '13.00', 'cash_variance', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '13', 'Variance', '6.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '13.00', 'cash_variance', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '13', 'Variance', '6.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '13.00', 'cash_variance', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '13', 'Variance', '6.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '13.00', 'cash_variance', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '13', 'Variance', '6.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '13.00', 'cash_variance', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '13', 'Variance', '6.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '13.00', 'cash_variance', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '13', 'Variance', '6.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '13.00', 'cash_variance', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '13', 'Variance', '6.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 'f', '13.00', 'cash_variance', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '13', 'Variance', '6.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '13.00', 'cash_variance', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '13', 'Variance', '6.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '13.00', 'cash_variance', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '14', 'Treatment', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '14.00', 'treatment', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '14', 'Treatment', '6.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '14.00', 'treatment', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '14', 'Treatment', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '14.00', 'treatment', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '14', 'Treatment', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '14.00', 'treatment', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '14', 'Treatment', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '14.00', 'treatment', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '14', 'Treatment', '6.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '14.00', 'treatment', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '14', 'Treatment', '6.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '14.00', 'treatment', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '14', 'Treatment', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '14.00', 'treatment', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '14', 'Treatment', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '14.00', 'treatment', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '14', 'Treatment', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '14.00', 'treatment', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '14', 'Treatment', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '14.00', 'treatment', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '15', 'Flags', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '15.00', 'flags', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '15', 'Flags', '4.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '15.00', 'flags', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '15', 'Flags', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '15.00', 'flags', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '15', 'Flags', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '15.00', 'flags', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '15', 'Flags', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '15.00', 'flags', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '15', 'Flags', '5.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '15.00', 'flags', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '15', 'Flags', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '15.00', 'flags', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '15', 'Flags', '4.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '15.00', 'flags', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '15', 'Flags', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '15.00', 'flags', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '15', 'Flags', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '15.00', 'flags', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '15', 'Flags', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '15.00', 'flags', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '16', 'Z', '3.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '16.00', 'z_no', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '16', 'Z', '3.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '16.00', 'z_no', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '16', 'Z', '3.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '16.00', 'z_no', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '16', 'Z', '3.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '16.00', 'z_no', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '16', 'Z', '3.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '16.00', 'z_no', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '16', 'Z', '3.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '16.00', 'z_no', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '16', 'Z', '2.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '16.00', 'z_no', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '16', 'Z', '3.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '16.00', 'z_no', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '16', 'Z', '3.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '16.00', 'z_no', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '16', 'Z', '3.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '16.00', 'z_no', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '16', 'Z', '2.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '16.00', 'z_no', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '17', 'Cash', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '17.00', 'cash_receipt', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '17', 'Status', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '17.00', 'status_text', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '17', 'Cash', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '17.00', 'cash_receipt', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '17', 'Status', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '17.00', 'status_text', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '17', 'Status', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '17.00', 'status_text', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '17', 'Cash', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '17.00', 'cash_receipt', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '17', 'Status', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '17.00', 'status_text', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '17', 'Cash', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '17.00', 'cash_receipt', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '17', 'Cash', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '17.00', 'cash_receipt', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '17', 'Status', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '17.00', 'status_text', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '17', 'Status', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '17.00', 'status_text', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '18', 'Status', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '18.00', 'status_text', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '18', 'Opened on', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '18.00', 'tss_opened_on', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '18', 'Opened on', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '18.00', 'tss_opened_on', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '18', 'Opened on', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '18.00', 'tss_opened_on', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '18', 'Opened on', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '18.00', 'tss_opened_on', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '18', 'Status', '9.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '18.00', 'status_text', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '18', 'Status', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '18.00', 'status_text', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '18', 'Status', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '18.00', 'status_text', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '18', 'Opened on', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '18.00', 'tss_opened_on', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '18', 'Status', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '18.00', 'status_text', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '19', 'Opened on', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '19.00', 'tss_opened_on', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '19', 'Opened on', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '19.00', 'tss_opened_on', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '19', 'Opened on', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '19.00', 'tss_opened_on', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '19', 'Opened on', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '19.00', 'tss_opened_on', NULL),
  ('MAIN LIST - TILL SESSIONS', 'Desktop', '19', 'Opened on', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '19.00', 'tss_opened_on', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '1.00', 'tev_id', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tev_id', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tev_id', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tev_id', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tev_id', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '2', 'Time', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'te_time', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '2', 'Time', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'te_time', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '2', 'Time', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'te_time', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '2', 'Time', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'te_time', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '2', 'Time', '15.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '2.00', 'te_time', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '3', 'Event', '27.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'tev_event_code', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '3', 'Event', '18.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'tev_event_code', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '3', 'Event', '25.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '3.00', 'tev_event_code', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '3', 'Event', '18.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'tev_event_code', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '3', 'Event', '27.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'tev_event_code', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '4', 'Ref', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'te_ref', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '4', 'Ref', '15.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'te_ref', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '4', 'Ref', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'te_ref', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '4', 'Ref', '14.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '4.00', 'te_ref', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '4', 'Ref', '15.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'te_ref', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '5', 'Amount', '12.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 'f', '5.00', 'tev_amount', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '5', 'Amount', '12.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '5.00', 'tev_amount', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '5', 'Amount', '12.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '5.00', 'tev_amount', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '5', 'Amount', '9.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '5.00', 'tev_amount', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '5', 'Amount', '9.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '5.00', 'tev_amount', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '6', 'By', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'te_user', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '6', 'By', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'te_user', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '6', 'By', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'te_user', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '6', 'By', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'te_user', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '6', 'By', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '6.00', 'te_user', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '7', 'Reason', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'te_reason', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '7', 'Reason', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '7.00', 'te_reason', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '7', 'Reason', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'te_reason', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '7', 'Reason', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'te_reason', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '7', 'Reason', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'te_reason', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '8', 'Detail', '11.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '8.00', 'te_payload', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '8', 'Detail', '11.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '8.00', 'te_payload', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '8', 'Detail', '11.00', 'left', 'f', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '8.00', 'te_payload', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '8', 'Detail', '22.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '8.00', 'te_payload', NULL),
  ('TILL SESSION EVENTS', 'Desktop', '8', 'Detail', '22.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '8.00', 'te_payload', NULL),
  ('TILL SESSION BILLS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tb_id', NULL),
  ('TILL SESSION BILLS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '1.00', 'tb_id', NULL),
  ('TILL SESSION BILLS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tb_id', NULL),
  ('TILL SESSION BILLS', 'Desktop', '2', 'Kind', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'tb_kind', NULL),
  ('TILL SESSION BILLS', 'Desktop', '2', 'Kind', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '2.00', 'tb_kind', NULL),
  ('TILL SESSION BILLS', 'Desktop', '2', 'Kind', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'tb_kind', NULL),
  ('TILL SESSION BILLS', 'Desktop', '3', 'Doc', '18.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'tb_refno', NULL),
  ('TILL SESSION BILLS', 'Desktop', '3', 'Doc', '18.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '3.00', 'tb_refno', NULL),
  ('TILL SESSION BILLS', 'Desktop', '3', 'Doc', '18.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'tb_refno', NULL),
  ('TILL SESSION BILLS', 'Desktop', '4', 'Time', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'tb_clock', NULL),
  ('TILL SESSION BILLS', 'Desktop', '4', 'Time', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'tb_clock', NULL),
  ('TILL SESSION BILLS', 'Desktop', '4', 'Time', '13.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '4.00', 'tb_clock', NULL),
  ('TILL SESSION BILLS', 'Desktop', '5', 'Party', '30.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'tb_party', NULL),
  ('TILL SESSION BILLS', 'Desktop', '5', 'Party', '27.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '5.00', 'tb_party', NULL),
  ('TILL SESSION BILLS', 'Desktop', '5', 'Party', '30.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'tb_party', NULL),
  ('TILL SESSION BILLS', 'Desktop', '6', 'Amount', '14.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 'f', '6.00', 'tb_amount', NULL),
  ('TILL SESSION BILLS', 'Desktop', '6', 'Amount', '14.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '6.00', 'tb_amount', NULL),
  ('TILL SESSION BILLS', 'Desktop', '6', 'Amount', '14.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '6.00', 'tb_amount', NULL),
  ('TILL SESSION BILLS', 'Desktop', '7', 'Status', '14.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '7.00', 'tb_status', NULL),
  ('TILL SESSION BILLS', 'Desktop', '7', 'Status', '14.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'tb_status', NULL),
  ('TILL SESSION BILLS', 'Desktop', '7', 'Status', '14.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'tb_status', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'md_id', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '1.00', 'md_id', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'md_id', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'md_id', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '2', 'Doc', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'md_doc', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '2', 'Doc', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'md_doc', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '2', 'Doc', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '2.00', 'md_doc', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '2', 'Doc', '13.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'md_doc', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '3', 'Time', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '3.00', 'md_clock', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '3', 'Time', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'md_clock', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '3', 'Time', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'md_clock', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '3', 'Time', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'md_clock', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '4', 'Kind', '17.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'md_kind', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '4', 'Kind', '15.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '4.00', 'md_kind', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '4', 'Kind', '18.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'md_kind', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '4', 'Kind', '14.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'md_kind', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '5', 'Cash', '12.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '5.00', 'md_amount', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '5', 'Cash', '11.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '5.00', 'md_amount', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '5', 'Cash', '11.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 'f', '5.00', 'md_amount', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '5', 'Cash', '11.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '5.00', 'md_amount', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '6', 'Party / reason', '23.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'md_detail', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '6', 'Party / reason', '21.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '6.00', 'md_detail', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '6', 'Party / reason', '24.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'md_detail', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '6', 'Party / reason', '25.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'md_detail', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '7', 'By', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'md_by', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '7', 'By', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'md_by', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '7', 'By', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '7.00', 'md_by', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '7', 'By', '13.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'md_by', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '8', 'Witness', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '8.00', 'md_witness', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '8', 'Witness', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '8.00', 'md_witness', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '8', 'Witness', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '8.00', 'md_witness', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '8', 'Witness', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '8.00', 'md_witness', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '9', 'Status', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '9.00', 'md_status', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '9', 'Status', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '9.00', 'md_status', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '9', 'Status', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '9.00', 'md_status', NULL),
  ('TILL SESSION MONEY DOCS', 'Desktop', '9', 'Status', '11.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '9.00', 'md_status', NULL),
  ('TILL SESSION COUNTS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tct_id', NULL),
  ('TILL SESSION COUNTS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '1.00', 'tct_id', NULL),
  ('TILL SESSION COUNTS', 'Desktop', '2', 'No', '6.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 'f', '2.00', 'tct_attempt_no', NULL),
  ('TILL SESSION COUNTS', 'Desktop', '2', 'No', '6.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '2.00', 'tct_attempt_no', NULL),
  ('TILL SESSION COUNTS', 'Desktop', '3', 'Kind', '14.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'tct_kind', NULL),
  ('TILL SESSION COUNTS', 'Desktop', '3', 'Kind', '14.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '3.00', 'tct_kind', NULL),
  ('TILL SESSION COUNTS', 'Desktop', '4', 'Time', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'tc_clock', NULL),
  ('TILL SESSION COUNTS', 'Desktop', '4', 'Time', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '4.00', 'tc_clock', NULL),
  ('TILL SESSION COUNTS', 'Desktop', '5', 'Counted', '16.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '5.00', 'tct_total_counted', NULL),
  ('TILL SESSION COUNTS', 'Desktop', '5', 'Counted', '16.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 'f', '5.00', 'tct_total_counted', NULL),
  ('TILL SESSION COUNTS', 'Desktop', '6', 'Expected at count', '16.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '6.00', 'tct_expected', NULL),
  ('TILL SESSION COUNTS', 'Desktop', '6', 'Expected at count', '16.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 'f', '6.00', 'tct_expected', NULL),
  ('TILL SESSION COUNTS', 'Desktop', '7', 'Blind', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'tc_blind', NULL),
  ('TILL SESSION COUNTS', 'Desktop', '7', 'Blind', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '7.00', 'tc_blind', NULL),
  ('TILL SESSION COUNTS', 'Desktop', '8', 'By', '15.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '8.00', 'tc_by', NULL),
  ('TILL SESSION COUNTS', 'Desktop', '8', 'By', '15.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '8.00', 'tc_by', NULL),
  ('TILL SESSION COUNTS', 'Desktop', '9', 'Final', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '9.00', 'tc_final', NULL),
  ('TILL SESSION COUNTS', 'Desktop', '9', 'Final', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '9.00', 'tc_final', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tbd_id', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '1.00', 'tbd_id', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tbd_id', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '2', 'Date', '14.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'bd_date', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '2', 'Date', '14.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '2.00', 'bd_date', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '2', 'Date', '14.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'bd_date', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '3', 'Status', '13.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'tbd_status', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '3', 'Status', '13.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'tbd_status', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '3', 'Status', '13.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '3.00', 'tbd_status', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '4', 'Opened', '9.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '4.00', 'bd_opened', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '4', 'Opened', '9.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'bd_opened', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '4', 'Opened', '9.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'bd_opened', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '5', 'Closed', '9.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '5.00', 'bd_closed', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '5', 'Closed', '9.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'bd_closed', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '5', 'Closed', '9.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'bd_closed', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '6', 'Sessions', '9.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '6.00', 'bd_sessions', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '6', 'Sessions', '9.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '6.00', 'bd_sessions', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '6', 'Sessions', '9.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 'f', '6.00', 'bd_sessions', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '7', 'Closed sessions', '9.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '7.00', 'bd_closed_sessions', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '7', 'Closed sessions', '9.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 'f', '7.00', 'bd_closed_sessions', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '7', 'Closed sessions', '11.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '7.00', 'bd_closed_sessions', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '8', 'Net sales', '12.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '8.00', 'bd_net_sales', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '8', 'Net sales', '11.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '8.00', 'bd_net_sales', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '8', 'Net sales', '11.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 'f', '8.00', 'bd_net_sales', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '9', 'Cash variance', '11.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '9.00', 'bd_cash_variance', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '9', 'Cash variance', '11.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 'f', '9.00', 'bd_cash_variance', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '9', 'Cash variance', '11.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '9.00', 'bd_cash_variance', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '10', 'Store Z', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '10.00', 'bd_z', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '10', 'Store Z', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '10.00', 'bd_z', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '10', 'Store Z', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '10.00', 'bd_z', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '11', 'Reopened', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '11.00', 'tbd_reopen_count', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '11', 'Reopened', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '11.00', 'tbd_reopen_count', NULL),
  ('MAIN LIST - TILL BUSINESS DAYS', 'Desktop', '11', 'Reopened', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 'f', '11.00', 'tbd_reopen_count', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tss_id', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tss_id', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tss_id', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tss_id', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '1.00', 'tss_id', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'tss_id', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '2', 'Session', '15.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'tss_session_no', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '2', 'Session', '15.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'tss_session_no', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '2', 'Session', '15.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'tss_session_no', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '2', 'Session', '13.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'tss_session_no', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '2', 'Session', '15.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'tss_session_no', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '2', 'Session', '15.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '2.00', 'tss_session_no', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '3', 'Cashier', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'cashier', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '3', 'Cashier', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '3.00', 'cashier', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '3', 'Cashier', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'cashier', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '3', 'Cashier', '11.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'cashier', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '3', 'Cashier', '13.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'cashier', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '3', 'Cashier', '13.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'cashier', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '4', 'Counter', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '4.00', 'counter_code', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '4', 'Counter', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'counter_code', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '4', 'Counter', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'counter_code', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '4', 'Counter', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'counter_code', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '4', 'Counter', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'counter_code', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '4', 'Counter', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'counter_code', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '5', 'Opened', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'opened_at', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '5', 'Opened', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'opened_at', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '5', 'Opened', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'opened_at', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '5', 'Opened', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'opened_at', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '5', 'Opened', '6.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'opened_at', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '5', 'Opened', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '5.00', 'opened_at', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '6', 'Closed', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'closed_at', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '6', 'Closed', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'closed_at', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '6', 'Closed', '6.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'closed_at', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '6', 'Closed', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'closed_at', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '6', 'Closed', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '6.00', 'closed_at', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '6', 'Closed', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'closed_at', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '7', 'Bills', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '7.00', 'bills', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '7', 'Bills', '5.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '7.00', 'bills', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '7', 'Bills', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '7.00', 'bills', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '7', 'Bills', '7.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '7.00', 'bills', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '7', 'Bills', '5.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 't', '7.00', 'bills', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '7', 'Bills', '5.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Number', NULL, NULL, 'f', '7.00', 'bills', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '8', 'Cash variance', '12.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '8.00', 'cash_variance', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '8', 'Cash variance', '12.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '8.00', 'cash_variance', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '8', 'Variance', '10.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 'f', '8.00', 'cash_variance', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '8', 'Cash variance', '12.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '8.00', 'cash_variance', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '8', 'Cash variance', '11.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '8.00', 'cash_variance', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '8', 'Variance', '10.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '8.00', 'cash_variance', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '9', 'Treatment', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '9.00', 'treatment', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '9', 'Treatment', '13.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '9.00', 'treatment', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '9', 'Treatment', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '9.00', 'treatment', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '9', 'Treatment', '13.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '9.00', 'treatment', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '9', 'Treatment', '13.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '9.00', 'treatment', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '9', 'Treatment', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '9.00', 'treatment', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '10', 'Status', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '10.00', 'status_text', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '10', 'Status', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '10.00', 'status_text', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '10', 'Cash', '13.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '10.00', 'cash_receipt', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '10', 'Cash', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '10.00', 'cash_receipt', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '10', 'Cash', '13.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '10.00', 'cash_receipt', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '10', 'Cash', '13.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '10.00', 'cash_receipt', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '11', 'Status', '11.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '11.00', 'status_text', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '11', 'Status', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '11.00', 'status_text', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '11', 'Status', '13.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '11.00', 'status_text', NULL),
  ('TILL DAY SESSIONS', 'Desktop', '11', 'Status', '11.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '11.00', 'status_text', NULL),
  ('TILL APPROVAL RULES', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '1.00', 'tar_id', NULL),
  ('TILL APPROVAL RULES', 'Desktop', '2', 'Event', '20.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '2.00', 'tar_event_code', NULL),
  ('TILL APPROVAL RULES', 'Desktop', '3', 'Layer', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '3.00', 'layer', NULL),
  ('TILL APPROVAL RULES', 'Desktop', '4', 'Branch', '15.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '4.00', 'branch_name', NULL),
  ('TILL APPROVAL RULES', 'Desktop', '5', 'Mode', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '5.00', 'tar_mode', NULL),
  ('TILL APPROVAL RULES', 'Desktop', '6', 'Threshold', '10.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 'f', '6.00', 'tar_threshold_amount', NULL),
  ('TILL APPROVAL RULES', 'Desktop', '7', 'Channel', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '7.00', 'tar_channel', NULL),
  ('TILL APPROVAL RULES', 'Desktop', '8', 'Min level', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '8.00', 'tar_min_role', NULL),
  ('TILL APPROVAL RULES', 'Desktop', '9', 'From', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '9.00', 'tar_effective_from', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '1.00', 'taa_id', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'taa_id', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '1', '#', '0.00', 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '1.00', 'taa_id', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '2', 'Approver', '15.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '2.00', 'approver', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '2', 'Approver', '18.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'approver', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '2', 'Approver', '15.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '2.00', 'approver', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '3', 'Company', '14.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'company_name', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '3', 'Level', '11.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '3.00', 'taa_role', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '3', 'Level', '11.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '3.00', 'taa_role', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '4', 'Event', '13.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'event_label', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '4', 'Branch', '14.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '4.00', 'branch_name', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '4', 'Event', '13.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '4.00', 'event_label', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '5', 'Event', '14.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'taa_event_code', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '5', 'Company', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '5.00', 'company_name', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '5', 'Company', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '5.00', 'company_name', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '6', 'Branch', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'branch_name', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '6', 'Level', '12.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '6.00', 'taa_role', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '6', 'Branch', '10.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '6.00', 'branch_name', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '7', 'Max amount', '10.00', 'right', 't', 'f', NULL, NULL, 'f', 'f', 'Currency', NULL, NULL, 't', '7.00', 'taa_max_amount', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '7', 'Max amount', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '7.00', 'max_label', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '7', 'Max amount', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '7.00', 'max_label', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '8', 'Remote', '6.00', 'left', 't', 'f', NULL, NULL, 'f', 'f', 'Boolean', NULL, NULL, 't', '8.00', 'taa_can_remote', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '8', 'Valid from', '8.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '8.00', 'taa_valid_from', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '8', 'Remote', '6.00', 'left', 't', 'f', NULL, NULL, 'f', 'f', 'Boolean', NULL, NULL, 'f', '8.00', 'taa_can_remote', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '9', 'PIN', '5.00', 'left', 't', 'f', NULL, NULL, 'f', 'f', 'Boolean', NULL, NULL, 't', '9.00', 'pin_set', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '9', 'Valid to', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '9.00', 'taa_valid_to', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '9', 'PIN', '5.00', 'left', 't', 'f', NULL, NULL, 'f', 'f', 'Boolean', NULL, NULL, 'f', '9.00', 'pin_set', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '10', 'Valid from', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '10.00', 'valid_from_label', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '10', 'Valid from', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '10.00', 'valid_from_label', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '11', 'Valid to', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '11.00', 'valid_to_label', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '11', 'Valid to', '7.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '11.00', 'valid_to_label', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '12', 'Status', '6.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 't', '12.00', 'grant_status', NULL),
  ('TILL APPROVAL GRANTS', 'Desktop', '12', 'Status', '6.00', 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', '12.00', 'grant_status', NULL);

-- ── dropdowns ─────────────────────────────────────────────────────────────
INSERT INTO pg_temp.sync_dropdown (dev_id, dropdown_name, dropdown_device_type, dropdown_description, dropdown_sql, dropdown_sort_order, dropdown_sort_column, dropdown_completion, dropdown_sql_regional, dropdown_max_visible_items, dropdown_show_header, dropdown_width) VALUES
  ('64', 'TILL DEVICES', 'Desktop', 'Desktop / Mobile devices a till counter may be linked to (never Web, plan-till-counter-claim 7.1): active, not blocked, last seen in this branch (or never), and not linked to ANOTHER counter (ux_tcn_device). Params ibranch_id, icounter_id ('''' for a new counter).', 'SELECT d.dev_id, d.dev_device_name, d.dev_device_type, COALESCE(d.dev_platform, '''') AS dev_platform,
       COALESCE(d.dev_last_ip, '''') AS dev_last_ip
  FROM fixed.device_master d
 WHERE d.dev_is_deleted = false AND d.dev_is_active = true AND d.dev_is_blocked = false
   AND lower(d.dev_device_type) <> ''web''
   AND (d.dev_branch_id IS NULL OR d.dev_branch_id::text = ''ibranch_id'')
   AND NOT EXISTS (SELECT 1 FROM accounts.till_counter c
                    WHERE c.tcn_device_id = d.dev_id AND c.tcn_is_deleted = false
                      AND c.tcn_id::text <> ''icounter_id'')
 ORDER BY d.dev_device_name', 'Ascending', 'dev_device_name', 'dev_device_name', NULL, '10', 't', '0'),
  ('65', 'CASH LEDGERS', 'Desktop', 'CASH-type ledgers (led_ledger_type = CASH) of the company plus shared ones — a till safe''s ledger. Param icompany_id.', 'SELECT l.led_id, l.led_name, g.acc_group_name AS group_name, COALESCE(l.led_short, '''') AS led_short
  FROM accounts.acc_ledger_master l
  JOIN accounts.acc_group_master g ON g.acc_group_id = l.led_group_id
 WHERE l.led_is_deleted = false AND l.led_is_active = true AND l.led_ledger_type = ''CASH''
   AND (l.led_company_id IS NULL OR l.led_company_id::text = ''icompany_id'')
 ORDER BY l.led_name', 'desc', 'led_name', 'led_name', NULL, '10', 't', '0'),
  ('66', 'TILL REASON LEDGERS', 'Desktop', 'EXPENSE and INCOME ledgers of the company plus shared ones — a till reason''s default ledger (EXPENSE / PAID_IN reasons). Param icompany_id.', 'SELECT l.led_id, l.led_name, g.acc_group_name AS group_name, l.led_ledger_type
  FROM accounts.acc_ledger_master l
  JOIN accounts.acc_group_master g ON g.acc_group_id = l.led_group_id
 WHERE l.led_is_deleted = false AND l.led_is_active = true AND l.led_ledger_type IN (''EXPENSE'', ''INCOME'')
   AND (l.led_company_id IS NULL OR l.led_company_id::text = ''icompany_id'')
 ORDER BY l.led_name', 'desc', 'led_name', 'led_name', NULL, '10', 't', '0'),
  ('67', 'TILL SAFES', 'Desktop', 'Active safes of one branch, for a counter''s ''Drops go to''. Params icompany_id, ibranch_id.', 'SELECT s.tsf_id, s.tsf_code || '' · '' || s.tsf_name AS safe_name,
       CASE WHEN s.tsf_is_default THEN ''default'' ELSE '''' END AS safe_default
  FROM accounts.till_safe s
 WHERE s.tsf_is_deleted = false AND s.tsf_is_active = true
   AND s.tsf_company_id::text = ''icompany_id'' AND s.tsf_branch_id::text = ''ibranch_id''
 ORDER BY s.tsf_code', 'desc', 'safe_name', 'safe_name', NULL, '10', 't', '0'),
  ('68', 'TILL APPROVER USERS', 'Desktop', 'Active users of a company (and users with no company) — Add approver in Till Approval Setup (menu 276). Param icompany_id.', 'SELECT u.usr_id, COALESCE(u.usr_full_name, u.usr_display_name, u.usr_login_name) AS usr_name,
       u.usr_login_name, COALESCE(u.usr_type, '''') AS usr_type
  FROM public.user_master u
 WHERE u.usr_is_active = true AND COALESCE(u.usr_is_deleted, false) = false
   AND (u.usr_company_id IS NULL OR u.usr_company_id::text = ''icompany_id'')
 ORDER BY 2', 'desc', 'usr_name', 'usr_name', NULL, '10', 't', '0');

INSERT INTO pg_temp.sync_dropdown_column (dropdown_name, dropdown_device_type, dropdown_columns_no, dropdown_columns_data_type, dropdown_columns_name, dropdown_columns_alias, dropdown_columns_width, dropdown_columns_visiblity, dropdown_columns_allignment, dropdown_columns_filter, dropdown_columns_sql_name) VALUES
  ('TILL DEVICES', 'Desktop', '0', 'text', '#', NULL, '10.00', 'f', NULL, 'f', 'dev_id'),
  ('TILL DEVICES', 'Desktop', '1', 'text', 'Device', NULL, '40.00', 't', NULL, 'f', 'dev_device_name'),
  ('TILL DEVICES', 'Desktop', '2', 'text', 'Type', NULL, '20.00', 't', NULL, 'f', 'dev_device_type'),
  ('TILL DEVICES', 'Desktop', '3', 'text', 'Platform', NULL, '15.00', 't', NULL, 'f', 'dev_platform'),
  ('TILL DEVICES', 'Desktop', '4', 'text', 'Last IP', NULL, '15.00', 't', NULL, 'f', 'dev_last_ip'),
  ('CASH LEDGERS', 'Desktop', '0', 'text', '#', NULL, '0.00', 'f', NULL, 'f', 'led_id'),
  ('CASH LEDGERS', 'Desktop', '1', 'text', 'Ledger', NULL, '65.00', 't', NULL, 't', 'led_name'),
  ('CASH LEDGERS', 'Desktop', '2', 'text', 'Group', NULL, '35.00', 't', NULL, 'f', 'group_name'),
  ('TILL REASON LEDGERS', 'Desktop', '0', 'text', '#', NULL, '0.00', 'f', NULL, 'f', 'led_id'),
  ('TILL REASON LEDGERS', 'Desktop', '1', 'text', 'Ledger', NULL, '50.00', 't', NULL, 't', 'led_name'),
  ('TILL REASON LEDGERS', 'Desktop', '2', 'text', 'Group', NULL, '30.00', 't', NULL, 't', 'group_name'),
  ('TILL REASON LEDGERS', 'Desktop', '3', 'text', 'Type', NULL, '20.00', 't', NULL, 'f', 'led_ledger_type'),
  ('TILL SAFES', 'Desktop', '0', 'text', '#', NULL, '0.00', 'f', NULL, 'f', 'tsf_id'),
  ('TILL SAFES', 'Desktop', '1', 'text', 'Safe', NULL, '70.00', 't', NULL, 't', 'safe_name'),
  ('TILL SAFES', 'Desktop', '2', 'text', 'Default', NULL, '30.00', 't', NULL, 'f', 'safe_default'),
  ('TILL APPROVER USERS', 'Desktop', '0', 'text', '#', NULL, '0.00', 'f', NULL, 'f', 'usr_id'),
  ('TILL APPROVER USERS', 'Desktop', '1', 'text', 'User', NULL, '0.00', 'f', NULL, 'f', 'usr_name'),
  ('TILL APPROVER USERS', 'Desktop', '2', 'text', 'Login', NULL, '70.00', 't', NULL, 't', 'usr_login_name'),
  ('TILL APPROVER USERS', 'Desktop', '3', 'text', 'Role', NULL, '30.00', 't', NULL, 'f', 'usr_type');

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
              g.grid_sql, g.grid_status, false, g.grid_device_type, 'live-sync 2026-10-15', now());
      v_inserted := v_inserted + 1;
      RAISE NOTICE 'grid % "%" inserted', v_id, g.grid_name;
    ELSE
      UPDATE fixed.grid_details
         SET grid_description = g.grid_description, grid_sort_column = g.grid_sort_column,
             grid_sort_order = g.grid_sort_order, grid_sql = g.grid_sql, grid_status = g.grid_status,
             grid_modified_by = 'live-sync 2026-10-15', grid_modified_on = now()
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
           c.grid_column_px, 'live-sync 2026-10-15', now()
      FROM pg_temp.sync_grid_column c
     WHERE c.grid_name = g.grid_name
       AND COALESCE(c.grid_device_type, '') = COALESCE(g.grid_device_type, '');
  END LOOP;
  RAISE NOTICE 'grids: % inserted, % updated', v_inserted, v_updated;
END $$;

SELECT setval('fixed.grid_details_grid_id_seq',
              GREATEST((SELECT COALESCE(max(grid_id), 1) FROM fixed.grid_details),
                       (SELECT last_value FROM fixed.grid_details_grid_id_seq)));

-- ── apply: dropdowns ────────────────────────────────────────────────────────
SELECT setval('fixed.dropdown_details_dropdown_id_seq',
              GREATEST((SELECT COALESCE(max(dropdown_id), 1) FROM fixed.dropdown_details),
                       (SELECT last_value FROM fixed.dropdown_details_dropdown_id_seq)));

DO $$
DECLARE
  d record;
  v_id integer;
  v_inserted int := 0;
  v_updated int := 0;
BEGIN
  FOR d IN SELECT * FROM pg_temp.sync_dropdown ORDER BY dev_id LOOP
    SELECT dropdown_id INTO v_id
      FROM fixed.dropdown_details
     WHERE dropdown_name = d.dropdown_name
       AND COALESCE(dropdown_device_type, '') = COALESCE(d.dropdown_device_type, '')
     ORDER BY dropdown_id
     LIMIT 1;

    IF v_id IS NULL THEN
      v_id := CASE WHEN EXISTS (SELECT 1 FROM fixed.dropdown_details WHERE dropdown_id = d.dev_id)
                   THEN nextval('fixed.dropdown_details_dropdown_id_seq') ELSE d.dev_id END;
      INSERT INTO fixed.dropdown_details (dropdown_id, dropdown_name, dropdown_description, dropdown_sql,
                                          dropdown_sort_order, dropdown_sort_column, dropdown_completion,
                                          dropdown_sql_regional, dropdown_max_visible_items, dropdown_show_header,
                                          dropdown_width, dropdown_device_type, dropdown_created_by,
                                          dropdown_created_on)
      VALUES (v_id, d.dropdown_name, d.dropdown_description, d.dropdown_sql, d.dropdown_sort_order,
              d.dropdown_sort_column, d.dropdown_completion, d.dropdown_sql_regional,
              d.dropdown_max_visible_items, d.dropdown_show_header, d.dropdown_width, d.dropdown_device_type,
              'live-sync 2026-10-15', now());
      v_inserted := v_inserted + 1;
      RAISE NOTICE 'dropdown % "%" inserted', v_id, d.dropdown_name;
    ELSE
      UPDATE fixed.dropdown_details
         SET dropdown_description = d.dropdown_description, dropdown_sql = d.dropdown_sql,
             dropdown_sort_order = d.dropdown_sort_order, dropdown_sort_column = d.dropdown_sort_column,
             dropdown_completion = d.dropdown_completion, dropdown_sql_regional = d.dropdown_sql_regional,
             dropdown_max_visible_items = d.dropdown_max_visible_items,
             dropdown_show_header = d.dropdown_show_header, dropdown_width = d.dropdown_width,
             dropdown_modified_by = 'live-sync 2026-10-15', dropdown_modified_on = now()
       WHERE dropdown_id = v_id;
      DELETE FROM fixed.dropdown_columns WHERE dropdown_columns_dropdown_id = v_id;
      v_updated := v_updated + 1;
      RAISE NOTICE 'dropdown % "%" updated', v_id, d.dropdown_name;
    END IF;

    INSERT INTO fixed.dropdown_columns (dropdown_columns_dropdown_id, dropdown_columns_no,
                                        dropdown_columns_data_type, dropdown_columns_name, dropdown_columns_alias,
                                        dropdown_columns_width, dropdown_columns_visiblity,
                                        dropdown_columns_allignment, dropdown_columns_filter,
                                        dropdown_columns_sql_name, dropdown_columns_created_by,
                                        dropdown_columns_created_on)
    SELECT v_id, c.dropdown_columns_no, c.dropdown_columns_data_type, c.dropdown_columns_name,
           c.dropdown_columns_alias, c.dropdown_columns_width, c.dropdown_columns_visiblity,
           c.dropdown_columns_allignment, c.dropdown_columns_filter, c.dropdown_columns_sql_name,
           'live-sync 2026-10-15', now()
      FROM pg_temp.sync_dropdown_column c
     WHERE c.dropdown_name = d.dropdown_name
       AND COALESCE(c.dropdown_device_type, '') = COALESCE(d.dropdown_device_type, '');
  END LOOP;
  RAISE NOTICE 'dropdowns: % inserted, % updated', v_inserted, v_updated;
END $$;

SELECT setval('fixed.dropdown_details_dropdown_id_seq',
              GREATEST((SELECT COALESCE(max(dropdown_id), 1) FROM fixed.dropdown_details),
                       (SELECT last_value FROM fixed.dropdown_details_dropdown_id_seq)));

-- ── what live has now, for the record ───────────────────────────────────────
SELECT d.grid_id, d.grid_name, count(c.*) AS columns
  FROM fixed.grid_details d
  LEFT JOIN fixed.grid_columns c ON c.grid_id = d.grid_id
 WHERE d.grid_name IN (SELECT grid_name FROM pg_temp.sync_grid) AND NOT d.grid_is_deleted
 GROUP BY 1, 2 ORDER BY 1;
SELECT d.dropdown_id, d.dropdown_name, count(c.*) AS columns
  FROM fixed.dropdown_details d
  LEFT JOIN fixed.dropdown_columns c ON c.dropdown_columns_dropdown_id = d.dropdown_id
 WHERE d.dropdown_name IN (SELECT dropdown_name FROM pg_temp.sync_dropdown)
 GROUP BY 1, 2 ORDER BY 1;

COMMIT;
