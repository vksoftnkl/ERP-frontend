-- ═══════════════════════════════════════════════════════════════════════════
--  Live sync — Cash Position + Till Reports tabs 5–7 grids (generated
--  2026-10-19 from the dev DB, for the web port of Qt NexERP 1d3e203..3b5069d,
--  till notes 134).
--
--  WHAT: brings 11 configured grids on live up to dev, matched by NAME +
--  device type (ids differ between the databases):
--    Cash Position (menu 289)        TILL CASH POSITION (170)
--                                    TILL CASH POSITION LIVE (171)
--                                    TILL CASH POSITION EVENTS (172)
--                                    TILL CASH POSITION CASHIERS (173)
--                                    TILL CASH POSITION REVIEWS (174)
--    Till Reports (menu 288),        TILL RPT CASHIER PERFORMANCE (175)
--    Cashier performance /           TILL RPT PERFORMANCE SESSIONS (176)
--    Ledger check /                  TILL RPT LEDGER CHECK (177)
--    Tender reconciliation           TILL RPT LEDGER LEGS (178)
--                                    TILL RPT TENDER RECON (179)
--                                    TILL RPT TENDER ROWS (180)
--  The web resolves each by name, fallback ids 170–180. A row missing on live
--  is inserted (keeping the dev id when live has it free, so the web's
--  fallback ids stay right); a row present is updated in place and its column
--  list replaced by dev's. No dropdown or ui_table changes: the screens'
--  pickers are dropdown 61 and grids 117 / 133 / 136 / 150, already synced.
--
--  ORDER: run AFTER the server with the till notes 134 migration
--  (20261017120000_till_cash_position_notes_134, which adds menu 289 and the
--  HO_REVIEW event) is deployed on live, and after 2026-10-17-till-report-
--  grids.sql. The grids read the notes-118 safe columns, the approval tables,
--  the till_session_review table and the tender-settlement columns; before
--  they exist the guard below stops the script and nothing changes.
--
--  BACK UP FIRST (on the live server):
--    sudo -u postgres pg_dump erp -t fixed.grid_details -t fixed.grid_columns \
--         > /root/config-backup-$(date +%Y%m%d%H%M).sql
--  RUN:
--    sudo -u postgres psql erp -v ON_ERROR_STOP=1 -f 2026-10-19-till-cash-position-grids.sql
--  One transaction: any error rolls the whole sync back.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
BEGIN;

-- ── guard: the server migrations these grids read must be in ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM fixed.menu_master WHERE menu_id = 289 AND menu_name = 'Cash Position') THEN
    RAISE EXCEPTION 'menu 289 "Cash Position" is missing: deploy the server with the till notes 134 migration first. Nothing was changed.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_schema = 'accounts' AND table_name = 'till_session_review') THEN
    RAISE EXCEPTION 'accounts.till_session_review is missing: deploy the server with the till notes 134 migration first. Nothing was changed.';
  END IF;
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
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'accounts' AND table_name = 'acc_tender_detail'
                    AND column_name = 'td_settle_status') THEN
    RAISE EXCEPTION 'accounts.acc_tender_detail.td_settle_status is missing: deploy the server with the tender settlement migration first. Nothing was changed.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'accounts' AND table_name = 'acc_vouchers'
                    AND column_name = 'av_session_id') THEN
    RAISE EXCEPTION 'accounts.acc_vouchers.av_session_id is missing: deploy the server with the till session migrations first. Nothing was changed.';
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
  ('170', 'TILL CASH POSITION', 'Desktop', 'S11 Cash Position: one row per branch with a till counter or safe, as at the end of iday — day status, an older day still open, live sessions, awaiting receipt, safe book and insured limit, oldest safe count, in transit, variance on the day and month to date, approvals waiting, last till activity, HO''s last review, flags.', 'branch_name', 'Ascending', 'SELECT br.br_id AS branch_id, br.br_name AS branch_name,
       COALESCE(dy.tbd_status, ''NOT OPEN'') AS day_status, dy.tbd_id, dy.tbd_acc_year,
       to_char(od.d, ''DD-MM'') AS old_open_day,
       lv.live, lv.over_hours, lv.longest_hours, lv.max_hours,
       COALESCE(aw.awaiting, 0) AS awaiting,
       COALESCE(sb.safe_book, 0) AS safe_book, COALESCE(sb.insured_limit, 0) AS insured_limit,
       sb.safes, sb.oldest_count_on,
       CASE WHEN sb.safes = 0 THEN '''' WHEN sb.oldest_count_on IS NULL THEN ''never''
            WHEN sb.oldest_count_on = g.d THEN ''today'' ELSE to_char(sb.oldest_count_on, ''DD-MM'') END AS safe_count,
       COALESCE(tr.in_transit, 0) AS in_transit, tr.transit_days,
       COALESCE(vt.var_day, 0) AS var_day, COALESCE(vm.var_mtd, 0) AS var_mtd,
       COALESCE(ap.pending, 0) AS approvals,
       la.last_at,
       CASE WHEN la.last_at IS NULL THEN '''' WHEN (la.last_at AT TIME ZONE ''Asia/Kolkata'')::date = g.d THEN to_char(la.last_at AT TIME ZONE ''Asia/Kolkata'', ''HH12:MI AM'')
            ELSE to_char(la.last_at AT TIME ZONE ''Asia/Kolkata'', ''DD-MM HH12:MI AM'') END AS last_activity,
       COALESCE(rv.outcome || '' '' || to_char(rv.reviewed_on AT TIME ZONE ''Asia/Kolkata'', ''DD-MM''), '''') AS last_review,
       concat_ws('' · '',
         CASE WHEN od.d IS NOT NULL THEN ''business day '' || to_char(od.d, ''DD-MM'') || '' is still open'' END,
         CASE WHEN lv.over_hours > 0 THEN lv.over_hours || '' session(s) open '' || lv.longest_hours || '' h (max '' || lv.max_hours || '' h)'' END,
         CASE WHEN sb.safes > 0 AND (sb.oldest_count_on IS NULL OR sb.oldest_count_on < g.d - 1)
              THEN ''safe last counted '' || COALESCE(to_char(sb.oldest_count_on, ''DD-MM''), ''never'') END,
         CASE WHEN tr.transit_days >= 2 THEN to_char(tr.in_transit, ''FM99,99,99,990.00'') || '' in transit for '' || tr.transit_days || '' days'' END,
         CASE WHEN sb.insured_limit > 0 AND sb.safe_book >= sb.insured_limit * 0.95
              THEN ''safe at '' || round(sb.safe_book / sb.insured_limit * 100) || ''% of its insured limit'' END
       ) AS flags
  FROM public.branch_master br
 CROSS JOIN LATERAL (SELECT to_date(''iday'', ''YYYY-MM-DD'') AS d,
                          (to_date(''iday'', ''YYYY-MM-DD'') + 1)::timestamp AT TIME ZONE ''Asia/Kolkata'' AS t1,
                          date_trunc(''month'', to_date(''iday'', ''YYYY-MM-DD''))::date AS m0) g
  LEFT JOIN accounts.till_business_day dy
         ON dy.tbd_branch_id = br.br_id AND dy.tbd_business_date = g.d AND dy.tbd_is_deleted = false
  LEFT JOIN LATERAL (SELECT min(d2.tbd_business_date) AS d FROM accounts.till_business_day d2
                      WHERE d2.tbd_branch_id = br.br_id AND d2.tbd_is_deleted = false AND d2.tbd_business_date < g.d
                        AND (d2.tbd_closed_on IS NULL OR d2.tbd_closed_on >= g.t1)
                        AND d2.tbd_opened_on < g.t1) od ON true
 CROSS JOIN LATERAL (SELECT count(*) AS live,
                            count(*) FILTER (WHERE round((extract(epoch FROM (LEAST(now(), g.t1) - s.tss_opened_on)) / 3600)::numeric, 1) > COALESCE(
         (SELECT NULLIF(v.asv_value, '''')::numeric FROM public.app_setting_value v
           WHERE v.asv_setting_key = ''till.session_max_hours'' AND v.asv_is_deleted = false
             AND ((v.asv_scope = ''BRANCH'' AND v.asv_branch_id = s.tss_branch_id)
                  OR (v.asv_scope = ''COMPANY'' AND v.asv_company_id = s.tss_company_id))
           ORDER BY CASE v.asv_scope WHEN ''BRANCH'' THEN 0 ELSE 1 END LIMIT 1),
         (SELECT NULLIF(d.asd_default_value, '''')::numeric FROM public.app_setting_def d
           WHERE d.asd_key = ''till.session_max_hours'' LIMIT 1), 14)) AS over_hours,
                            max(round((extract(epoch FROM (LEAST(now(), g.t1) - s.tss_opened_on)) / 3600)::numeric, 1)) AS longest_hours,
                            max(COALESCE(
         (SELECT NULLIF(v.asv_value, '''')::numeric FROM public.app_setting_value v
           WHERE v.asv_setting_key = ''till.session_max_hours'' AND v.asv_is_deleted = false
             AND ((v.asv_scope = ''BRANCH'' AND v.asv_branch_id = s.tss_branch_id)
                  OR (v.asv_scope = ''COMPANY'' AND v.asv_company_id = s.tss_company_id))
           ORDER BY CASE v.asv_scope WHEN ''BRANCH'' THEN 0 ELSE 1 END LIMIT 1),
         (SELECT NULLIF(d.asd_default_value, '''')::numeric FROM public.app_setting_def d
           WHERE d.asd_key = ''till.session_max_hours'' LIMIT 1), 14)) AS max_hours
                       FROM accounts.till_session s
                      WHERE s.tss_branch_id = br.br_id AND s.tss_is_deleted = false AND s.tss_status <> ''VOIDED'' AND s.tss_opened_on < g.t1
   AND (s.tss_closed_on IS NULL OR s.tss_closed_on >= g.t1)) lv
 CROSS JOIN LATERAL (SELECT sum(m.tcm_amount) AS awaiting FROM accounts.till_cash_movement m
                      WHERE m.tcm_branch_id = br.br_id AND m.tcm_is_deleted = false AND m.tcm_status = ''POSTED''
                        AND m.tcm_receipt_status IS NOT NULL AND m.tcm_created_on < g.t1
                        AND (m.tcm_received_on IS NULL OR m.tcm_received_on >= g.t1)) aw
 CROSS JOIN LATERAL (
        SELECT count(*) AS safes, sum(bk.book) AS safe_book,
               sum(sf.tsf_insured_limit) FILTER (WHERE sf.tsf_insured_limit > 0) AS insured_limit,
               min((bk.counted_at AT TIME ZONE ''Asia/Kolkata'')::date) AS oldest_count_on
          FROM accounts.till_safe sf
         CROSS JOIN LATERAL (
                SELECT lc.at AS counted_at,
                       COALESCE(lc.total, 0)
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
                                    WHERE f.sb_at > COALESCE(lc.at, ''-infinity''::timestamptz) AND f.sb_at < g.t1), 0) AS book
                  FROM (SELECT 1) one
                  LEFT JOIN LATERAL (SELECT c.tct_total_counted AS total, c.tct_counted_on AS at FROM accounts.till_count c
                                      WHERE c.tct_safe_id = sf.tsf_id AND c.tct_kind = ''SAFE'' AND c.tct_is_deleted = false
                                        AND c.tct_counted_on < g.t1
                                      ORDER BY c.tct_counted_on DESC LIMIT 1) lc ON true) bk
         WHERE sf.tsf_branch_id = br.br_id AND sf.tsf_is_deleted = false AND sf.tsf_is_active = true) sb
 CROSS JOIN LATERAL (SELECT sum(m.tcm_amount) AS in_transit, (g.d - min(m.tcm_doc_date)::date) AS transit_days
                       FROM accounts.till_cash_movement m
                      WHERE m.tcm_branch_id = br.br_id AND m.tcm_kind = ''REMIT'' AND m.tcm_is_deleted = false
                        AND m.tcm_created_on < g.t1 AND (m.tcm_voided_on IS NULL OR m.tcm_voided_on >= g.t1)
                        AND (m.tcm_confirmed_on IS NULL OR m.tcm_confirmed_on >= g.t1)) tr
 CROSS JOIN LATERAL (SELECT sum(cv.tvr_variance) AS var_day FROM accounts.till_session s
                      CROSS JOIN LATERAL (SELECT v.tvr_variance, v.tvr_treatment
                     FROM accounts.till_variance v
                    WHERE v.tvr_session_id = s.tss_id AND v.tvr_stage = ''CLOSE'' AND v.tvr_tender_type_id = 1
                      AND v.tvr_is_deleted = false AND v.tvr_status <> ''REVERSED''
                    ORDER BY v.tvr_created_on DESC LIMIT 1) cv
                      WHERE s.tss_branch_id = br.br_id AND s.tss_is_deleted = false AND s.tss_business_date = g.d) vt
 CROSS JOIN LATERAL (SELECT sum(cv.tvr_variance) AS var_mtd FROM accounts.till_session s
                      CROSS JOIN LATERAL (SELECT v.tvr_variance, v.tvr_treatment
                     FROM accounts.till_variance v
                    WHERE v.tvr_session_id = s.tss_id AND v.tvr_stage = ''CLOSE'' AND v.tvr_tender_type_id = 1
                      AND v.tvr_is_deleted = false AND v.tvr_status <> ''REVERSED''
                    ORDER BY v.tvr_created_on DESC LIMIT 1) cv
                      WHERE s.tss_branch_id = br.br_id AND s.tss_is_deleted = false
                        AND s.tss_business_date >= g.m0 AND s.tss_business_date <= g.d) vm
 CROSS JOIN LATERAL (SELECT count(*) AS pending FROM accounts.till_approval a
                      WHERE a.tap_branch_id = br.br_id AND a.tap_is_deleted = false AND a.tap_requested_on < g.t1
                        AND (a.tap_status = ''PENDING'' OR a.tap_decided_on >= g.t1)
                        AND (a.tap_expires_on IS NULL OR a.tap_expires_on >= LEAST(now(), g.t1))) ap
 CROSS JOIN LATERAL (SELECT max(e.tev_event_on) AS last_at FROM accounts.till_event e
                      WHERE e.tev_branch_id = br.br_id AND e.tev_event_on < g.t1) la
  LEFT JOIN LATERAL (SELECT r.tsr_outcome AS outcome, r.tsr_reviewed_on AS reviewed_on
                       FROM accounts.till_session_review r
                      WHERE r.tsr_branch_id = br.br_id AND r.tsr_reviewed_on < g.t1
                      ORDER BY r.tsr_reviewed_on DESC LIMIT 1) rv ON true
 WHERE br.br_is_deleted = false AND br.br_comp_id::text = ''icompany_id''
   AND (NULLIF(''ibranch_id'', '''') IS NULL OR br.br_id::text = ''ibranch_id'')
   AND (EXISTS (SELECT 1 FROM accounts.till_counter c WHERE c.tcn_branch_id = br.br_id AND c.tcn_is_deleted = false)
        OR EXISTS (SELECT 1 FROM accounts.till_safe f WHERE f.tsf_branch_id = br.br_id AND f.tsf_is_deleted = false))
 ORDER BY br.br_name', true),
  ('171', 'TILL CASH POSITION LIVE', 'Desktop', 'S11 Cash Position: the sessions still holding a drawer at the end of iday, every branch of the company (ibranch_id narrows) — the screen asks /till/sessions/expected for each one''s cash.', 'tss_opened_on', 'Ascending', 'SELECT s.tss_id, s.tss_acc_year, s.tss_branch_id, s.tss_session_no, s.tss_status, s.tss_opened_on,
       COALESCE(u.usr_full_name, u.usr_login_name) AS cashier, c.tcn_code AS counter_code
  FROM accounts.till_session s
 CROSS JOIN LATERAL (SELECT to_date(''iday'', ''YYYY-MM-DD'') AS d,
                          (to_date(''iday'', ''YYYY-MM-DD'') + 1)::timestamp AT TIME ZONE ''Asia/Kolkata'' AS t1,
                          date_trunc(''month'', to_date(''iday'', ''YYYY-MM-DD''))::date AS m0) g
  LEFT JOIN public.user_master u ON u.usr_id = s.tss_operator_id
  LEFT JOIN accounts.till_counter c ON c.tcn_id = s.tss_counter_id
 WHERE s.tss_company_id::text = ''icompany_id''
   AND (NULLIF(''ibranch_id'', '''') IS NULL OR s.tss_branch_id::text = ''ibranch_id'')
   AND s.tss_is_deleted = false AND s.tss_status <> ''VOIDED'' AND s.tss_opened_on < g.t1
   AND (s.tss_closed_on IS NULL OR s.tss_closed_on >= g.t1)
 ORDER BY s.tss_opened_on', true),
  ('172', 'TILL CASH POSITION EVENTS', 'Desktop', 'S11 Cash Position: the exceptions of iday (IST), every branch, newest first — pickups, top-ups, recounts, force closes, reopens, wrong PINs, movement voids, re-tenders, suspends, approval requests.', 'tev_event_on', 'Descending', 'SELECT e.tev_event_on, to_char(e.tev_event_on AT TIME ZONE ''Asia/Kolkata'', ''HH12:MI AM'') AS at_text,
       br.br_name AS branch_name, k.code,
       concat_ws('' — '',
         concat_ws('' '', COALESCE(s.tss_session_no, c.tcn_code), COALESCE(u.usr_full_name, u.usr_login_name)),
         CASE k.code
           WHEN ''PICKUP'' THEN ''pickup''
           WHEN ''TOP_UP'' THEN ''top-up''
           WHEN ''SESSION_RECOUNT'' THEN ''recount''
           WHEN ''SESSION_FORCE_CLOSE'' THEN ''force closed''
           WHEN ''SESSION_REOPEN'' THEN ''reopened''
           WHEN ''PIN_FAIL'' THEN ''wrong PIN''
           WHEN ''MOVEMENT_VOIDED'' THEN ''movement voided''
           WHEN ''RETENDER'' THEN ''re-tendered''
           WHEN ''SESSION_SUSPEND'' THEN ''suspended''
           WHEN ''APPROVAL_REQUESTED'' THEN ''approval asked'' || COALESCE('' ('' || (e.tev_payload->>''event'') || '')'', '''')
           ELSE lower(replace(k.code, ''_'', '' '')) END
         || COALESCE('' '' || to_char(e.tev_amount, ''FM99,99,99,990.00''), '''')) AS what,
       e.tev_amount, e.tev_session_id, s.tss_acc_year
  FROM accounts.till_event e
 CROSS JOIN LATERAL (SELECT to_date(''iday'', ''YYYY-MM-DD'') AS d,
                          (to_date(''iday'', ''YYYY-MM-DD'') + 1)::timestamp AT TIME ZONE ''Asia/Kolkata'' AS t1,
                          date_trunc(''month'', to_date(''iday'', ''YYYY-MM-DD''))::date AS m0) g
  LEFT JOIN accounts.till_session s ON s.tss_id = e.tev_session_id
  LEFT JOIN accounts.till_counter c ON c.tcn_id = COALESCE(e.tev_counter_id, s.tss_counter_id)
  LEFT JOIN public.branch_master br ON br.br_id = e.tev_branch_id
 CROSS JOIN LATERAL (SELECT CASE WHEN e.tev_event_code = ''MOVEMENT_POSTED'' THEN e.tev_payload->>''kind''
                                 ELSE e.tev_event_code END AS code) k
  LEFT JOIN public.user_master u
         ON u.usr_id = CASE WHEN k.code = ''PIN_FAIL'' THEN COALESCE(NULLIF(e.tev_payload->>''witnessBy'', '''')::uuid, e.tev_user_id) ELSE COALESCE(s.tss_operator_id, e.tev_user_id) END
 WHERE e.tev_company_id::text = ''icompany_id''
   AND (NULLIF(''ibranch_id'', '''') IS NULL OR e.tev_branch_id::text = ''ibranch_id'')
   AND (e.tev_event_on AT TIME ZONE ''Asia/Kolkata'')::date = g.d
   AND k.code IN (''PICKUP'', ''TOP_UP'', ''SESSION_RECOUNT'', ''SESSION_FORCE_CLOSE'', ''SESSION_REOPEN'', ''PIN_FAIL'', ''MOVEMENT_VOIDED'', ''RETENDER'', ''SESSION_SUSPEND'', ''NO_SALE'', ''APPROVAL_REQUESTED'')
 ORDER BY e.tev_event_on DESC', true),
  ('173', 'TILL CASH POSITION CASHIERS', 'Desktop', 'S11 Cash Position: month to date (1st of iday''s month → iday), every branch — cashiers with a cash short at the close: sessions, shorts, total short, recovered; worst first.', 'short_total', 'Ascending', 'SELECT u.usr_id AS cashier_id, COALESCE(u.usr_full_name, u.usr_login_name) AS cashier,
       string_agg(DISTINCT br.br_name, '', '') AS stores,
       count(*) AS sessions,
       count(*) FILTER (WHERE cv.tvr_variance < 0) AS shorts,
       COALESCE(sum(cv.tvr_variance) FILTER (WHERE cv.tvr_variance < 0), 0) AS short_total,
       COALESCE(-sum(cv.tvr_variance) FILTER (WHERE cv.tvr_variance < 0 AND cv.tvr_treatment = ''RECOVER''), 0) AS recovered
  FROM accounts.till_session s
 CROSS JOIN LATERAL (SELECT to_date(''iday'', ''YYYY-MM-DD'') AS d,
                          (to_date(''iday'', ''YYYY-MM-DD'') + 1)::timestamp AT TIME ZONE ''Asia/Kolkata'' AS t1,
                          date_trunc(''month'', to_date(''iday'', ''YYYY-MM-DD''))::date AS m0) g
  LEFT JOIN public.user_master u ON u.usr_id = s.tss_operator_id
  LEFT JOIN public.branch_master br ON br.br_id = s.tss_branch_id
  LEFT JOIN LATERAL (SELECT v.tvr_variance, v.tvr_treatment
                     FROM accounts.till_variance v
                    WHERE v.tvr_session_id = s.tss_id AND v.tvr_stage = ''CLOSE'' AND v.tvr_tender_type_id = 1
                      AND v.tvr_is_deleted = false AND v.tvr_status <> ''REVERSED''
                    ORDER BY v.tvr_created_on DESC LIMIT 1) cv ON true
 WHERE s.tss_is_deleted = false AND s.tss_status <> ''VOIDED''
   AND s.tss_company_id::text = ''icompany_id''
   AND (NULLIF(''ibranch_id'', '''') IS NULL OR s.tss_branch_id::text = ''ibranch_id'')
   AND s.tss_business_date >= g.m0 AND s.tss_business_date <= g.d
 GROUP BY u.usr_id, u.usr_full_name, u.usr_login_name
HAVING count(*) FILTER (WHERE cv.tvr_variance < 0) > 0
 ORDER BY 6, 2', true),
  ('174', 'TILL CASH POSITION REVIEWS', 'Desktop', 'S11 Cash Position, Add HO review: one branch''s till_session_review rows up to the end of iday, newest first — what was reviewed (the day or a session), outcome, who, note.', 'tsr_reviewed_on', 'Descending', 'SELECT r.tsr_id, r.tsr_reviewed_on, to_char(r.tsr_reviewed_on AT TIME ZONE ''Asia/Kolkata'', ''DD-MM HH12:MI AM'') AS on_text,
       COALESCE(s.tss_session_no, ''day '' || to_char(d.tbd_business_date, ''DD-MM'')) AS reviewing,
       r.tsr_outcome, COALESCE(u.usr_full_name, u.usr_login_name) AS reviewer, COALESCE(r.tsr_note, '''') AS note
  FROM accounts.till_session_review r
 CROSS JOIN LATERAL (SELECT to_date(''iday'', ''YYYY-MM-DD'') AS d,
                          (to_date(''iday'', ''YYYY-MM-DD'') + 1)::timestamp AT TIME ZONE ''Asia/Kolkata'' AS t1,
                          date_trunc(''month'', to_date(''iday'', ''YYYY-MM-DD''))::date AS m0) g
  LEFT JOIN accounts.till_session s ON s.tss_id = r.tsr_session_id
  LEFT JOIN accounts.till_business_day d ON d.tbd_id = r.tsr_day_id
  LEFT JOIN public.user_master u ON u.usr_id = r.tsr_reviewed_by
 WHERE r.tsr_company_id::text = ''icompany_id'' AND r.tsr_branch_id::text = ''ibranch_id''
   AND r.tsr_reviewed_on < g.t1
 ORDER BY r.tsr_reviewed_on DESC', true),
  ('175', 'TILL RPT CASHIER PERFORMANCE', 'Desktop', 'Till Reports, Cashier performance tab: one row per cashier over a business-date range — sessions, billing hours, posted bills, item lines, items per bill, bills per hour, average bill, minutes between bills, bills cancelled, re-tenders. Bills are those keyed in the cashier''s sessions (sb_session_id).', 'cashier', 'Ascending', 'SELECT u.usr_id AS cashier_id, COALESCE(u.usr_full_name, u.usr_login_name) AS cashier,
       count(*) AS sessions,
       sum(round((extract(epoch FROM (COALESCE(s.tss_billing_ended_on, s.tss_closed_on, now()) - s.tss_opened_on)) / 3600)::numeric, 2)) AS hours,
       sum(bl.bills) AS bills,
       sum(bl.lines) AS lines,
       round(sum(bl.lines)::numeric / NULLIF(sum(bl.bills), 0), 1) AS items_per_bill,
       round(sum(bl.bills)::numeric / NULLIF(sum(round((extract(epoch FROM (COALESCE(s.tss_billing_ended_on, s.tss_closed_on, now()) - s.tss_opened_on)) / 3600)::numeric, 2)), 0), 1) AS bills_per_hour,
       sum(bl.sales) AS sales,
       round(sum(bl.sales) / NULLIF(sum(bl.bills), 0), 2) AS avg_bill,
       round((sum(extract(epoch FROM (bl.last_at - bl.first_at))) FILTER (WHERE bl.bills > 1)
              / NULLIF(sum(bl.bills - 1) FILTER (WHERE bl.bills > 1), 0) / 60)::numeric, 1) AS gap_minutes,
       sum(bl.cancelled) AS cancelled,
       sum(rt.retenders) AS retenders
  FROM accounts.till_session s
  LEFT JOIN public.user_master u ON u.usr_id = s.tss_operator_id
  LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE b.sb_status = ''POSTED'') AS bills,
                          count(*) FILTER (WHERE b.sb_status = ''CANCELLED'') AS cancelled,
                          COALESCE(sum(b.sb_bill_amt) FILTER (WHERE b.sb_status = ''POSTED''), 0) AS sales,
                          min(b.sb_created_on) FILTER (WHERE b.sb_status = ''POSTED'') AS first_at,
                          max(b.sb_created_on) FILTER (WHERE b.sb_status = ''POSTED'') AS last_at,
                          COALESCE(sum((SELECT count(*) FROM sales.sale_bill_item i
                                         WHERE i.sbi_bill_id = b.sb_id AND i.sbi_acc_year = b.sb_acc_year
                                           AND i.sbi_is_deleted = false)) FILTER (WHERE b.sb_status = ''POSTED''), 0) AS lines
                     FROM sales.sale_bill b
                    WHERE b.sb_session_id = s.tss_id AND b.sb_is_deleted = false) bl ON true
  LEFT JOIN LATERAL (SELECT count(*) AS retenders FROM accounts.till_event e
                    WHERE e.tev_session_id = s.tss_id AND e.tev_event_code = ''RETENDER'') rt ON true
 WHERE s.tss_is_deleted = false AND s.tss_status <> ''VOIDED''
   AND s.tss_company_id::text = ''icompany_id''
   AND (NULLIF(''ibranch_id'', '''') IS NULL OR s.tss_branch_id::text = ''ibranch_id'')
   AND s.tss_business_date::text >= ''ifrom_date'' AND s.tss_business_date::text <= ''ito_date''
   AND (NULLIF(''icounter_id'', '''') IS NULL OR s.tss_counter_id::text = ''icounter_id'')
   AND (NULLIF(''ioperator_id'', '''') IS NULL OR s.tss_operator_id::text = ''ioperator_id'')
 GROUP BY u.usr_id, u.usr_full_name, u.usr_login_name
 ORDER BY 2', true),
  ('176', 'TILL RPT PERFORMANCE SESSIONS', 'Desktop', 'Till Reports, Cashier performance tab, lower grid: the same figures per session (the screen sends the picked cashier as ioperator_id), newest first.', 'tss_opened_on', 'Descending', 'SELECT s.tss_id, s.tss_acc_year, s.tss_company_id, s.tss_branch_id, s.tss_session_no,
       to_char(s.tss_business_date, ''DD-MM-YYYY'') AS business_date, c.tcn_code AS counter_code, COALESCE(u.usr_full_name, u.usr_login_name) AS cashier,
       to_char(s.tss_opened_on AT TIME ZONE ''Asia/Kolkata'', ''HH12:MI AM'') AS opened_at,
       round((extract(epoch FROM (COALESCE(s.tss_billing_ended_on, s.tss_closed_on, now()) - s.tss_opened_on)) / 3600)::numeric, 2) AS hours, bl.bills, bl.lines,
       round(bl.lines::numeric / NULLIF(bl.bills, 0), 1) AS items_per_bill,
       round(bl.bills::numeric / NULLIF(round((extract(epoch FROM (COALESCE(s.tss_billing_ended_on, s.tss_closed_on, now()) - s.tss_opened_on)) / 3600)::numeric, 2), 0), 1) AS bills_per_hour,
       bl.sales, round(bl.sales / NULLIF(bl.bills, 0), 2) AS avg_bill,
       CASE WHEN bl.bills > 1
            THEN round((extract(epoch FROM (bl.last_at - bl.first_at)) / (bl.bills - 1) / 60)::numeric, 1) END AS gap_minutes,
       bl.cancelled, rt.retenders, replace(s.tss_status, ''_'', '' '') AS status_text, s.tss_opened_on
  FROM accounts.till_session s
  JOIN accounts.till_counter c ON c.tcn_id = s.tss_counter_id
  LEFT JOIN public.user_master u ON u.usr_id = s.tss_operator_id
  LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE b.sb_status = ''POSTED'') AS bills,
                          count(*) FILTER (WHERE b.sb_status = ''CANCELLED'') AS cancelled,
                          COALESCE(sum(b.sb_bill_amt) FILTER (WHERE b.sb_status = ''POSTED''), 0) AS sales,
                          min(b.sb_created_on) FILTER (WHERE b.sb_status = ''POSTED'') AS first_at,
                          max(b.sb_created_on) FILTER (WHERE b.sb_status = ''POSTED'') AS last_at,
                          COALESCE(sum((SELECT count(*) FROM sales.sale_bill_item i
                                         WHERE i.sbi_bill_id = b.sb_id AND i.sbi_acc_year = b.sb_acc_year
                                           AND i.sbi_is_deleted = false)) FILTER (WHERE b.sb_status = ''POSTED''), 0) AS lines
                     FROM sales.sale_bill b
                    WHERE b.sb_session_id = s.tss_id AND b.sb_is_deleted = false) bl ON true
  LEFT JOIN LATERAL (SELECT count(*) AS retenders FROM accounts.till_event e
                    WHERE e.tev_session_id = s.tss_id AND e.tev_event_code = ''RETENDER'') rt ON true
 WHERE s.tss_is_deleted = false AND s.tss_status <> ''VOIDED''
   AND s.tss_company_id::text = ''icompany_id''
   AND (NULLIF(''ibranch_id'', '''') IS NULL OR s.tss_branch_id::text = ''ibranch_id'')
   AND s.tss_business_date::text >= ''ifrom_date'' AND s.tss_business_date::text <= ''ito_date''
   AND (NULLIF(''icounter_id'', '''') IS NULL OR s.tss_counter_id::text = ''icounter_id'')
   AND (NULLIF(''ioperator_id'', '''') IS NULL OR s.tss_operator_id::text = ''ioperator_id'')
 ORDER BY s.tss_opened_on DESC', true),
  ('177', 'TILL RPT LEDGER CHECK', 'Desktop', 'Till Reports, Ledger check tab: one row per session — the till cash ledger''s legs of the session (the branch''s CASH tender ledger, av_session_id) against what they must come to once it is closed (tss_float_left − the carried-in float). OFF = a posting bug, not a cash problem. idiff = ''1'' lists OFF only. LIVE sessions show what the books hold so far.', 'tss_opened_on', 'Descending', 'SELECT s.tss_id, s.tss_acc_year, s.tss_company_id, s.tss_branch_id, s.tss_session_no,
       to_char(s.tss_business_date, ''DD-MM-YYYY'') AS business_date, c.tcn_code AS counter_code, COALESCE(u.usr_full_name, u.usr_login_name) AS cashier,
       replace(s.tss_status, ''_'', '' '') AS status_text, s.tss_status, s.tss_float_mode,
       s.tss_float_issued, s.tss_float_left,
       COALESCE(lg.books, 0) AS books, COALESCE(lg.legs, 0) AS legs,
       CASE WHEN s.tss_status = ''CLOSED''
            THEN s.tss_float_left - CASE WHEN s.tss_float_mode = ''CARRIED'' THEN s.tss_float_issued ELSE 0 END END AS should,
       CASE WHEN s.tss_status = ''CLOSED''
            THEN COALESCE(lg.books, 0) - (s.tss_float_left
                   - CASE WHEN s.tss_float_mode = ''CARRIED'' THEN s.tss_float_issued ELSE 0 END) END AS diff,
       CASE WHEN s.tss_status <> ''CLOSED'' THEN ''LIVE''
            WHEN abs(COALESCE(lg.books, 0) - (s.tss_float_left
                   - CASE WHEN s.tss_float_mode = ''CARRIED'' THEN s.tss_float_issued ELSE 0 END)) < 0.005 THEN ''OK''
            ELSE ''OFF'' END AS verdict,
       s.tss_opened_on
  FROM accounts.till_session s
  JOIN accounts.till_counter c ON c.tcn_id = s.tss_counter_id
  LEFT JOIN public.user_master u ON u.usr_id = s.tss_operator_id
  LEFT JOIN LATERAL (SELECT sum(v.av_signed_amount) AS books, count(*) AS legs
                       FROM accounts.acc_vouchers v
                      WHERE v.av_session_id = s.tss_id AND v.av_is_deleted = false
                        AND v.av_ledger_id = (SELECT t.tnd_ledger_id FROM accounts.acc_tender_master t
           WHERE t.tnd_type_id = 1 AND t.tnd_company_id = s.tss_company_id
             AND (t.tnd_branch_id = s.tss_branch_id OR t.tnd_branch_id IS NULL)
             AND t.tnd_is_active = true AND t.tnd_is_deleted = false
           ORDER BY (t.tnd_branch_id IS NULL), t.tnd_is_default DESC, t.tnd_display_position, t.tnd_created_on
           LIMIT 1)) lg ON true
 WHERE s.tss_is_deleted = false AND s.tss_status <> ''VOIDED''
   AND s.tss_company_id::text = ''icompany_id''
   AND (NULLIF(''ibranch_id'', '''') IS NULL OR s.tss_branch_id::text = ''ibranch_id'')
   AND s.tss_business_date::text >= ''ifrom_date'' AND s.tss_business_date::text <= ''ito_date''
   AND (NULLIF(''icounter_id'', '''') IS NULL OR s.tss_counter_id::text = ''icounter_id'')
   AND (NULLIF(''ioperator_id'', '''') IS NULL OR s.tss_operator_id::text = ''ioperator_id'')
   AND (NULLIF(''idiff'', '''') IS NULL OR (s.tss_status = ''CLOSED'' AND abs(COALESCE(lg.books, 0) - (s.tss_float_left - CASE WHEN s.tss_float_mode = ''CARRIED'' THEN s.tss_float_issued ELSE 0 END)) >= 0.005))
 ORDER BY (s.tss_status = ''CLOSED'' AND abs(COALESCE(lg.books, 0) - (s.tss_float_left - CASE WHEN s.tss_float_mode = ''CARRIED'' THEN s.tss_float_issued ELSE 0 END)) >= 0.005) DESC, s.tss_opened_on DESC', true),
  ('178', 'TILL RPT LEDGER LEGS', 'Desktop', 'Till Reports, Ledger check tab, lower grid: one session''s legs on the till cash ledger in the order they were written, with a running balance (Dr +).', 'av_created_on', 'Ascending', 'SELECT v.av_id, v.av_created_on, to_char(v.av_created_on AT TIME ZONE ''Asia/Kolkata'', ''DD-MM HH12:MI AM'') AS at_text,
       v.av_voucher_refno AS refno, vt.vchr_type_code AS type_code, vt.vchr_type_name AS type_name,
       v.av_dr_cr AS dr_cr,
       CASE WHEN v.av_signed_amount > 0 THEN v.av_signed_amount END AS dr,
       CASE WHEN v.av_signed_amount < 0 THEN -v.av_signed_amount END AS cr,
       sum(v.av_signed_amount) OVER (ORDER BY v.av_created_on, v.av_voucher_refno, v.av_row_no) AS running,
       COALESCE(v.av_remarks, '''') AS remarks
  FROM accounts.acc_vouchers v
  JOIN accounts.till_session s ON s.tss_id = v.av_session_id
  LEFT JOIN accounts.acc_voucher_types vt ON vt.vchr_type_id = v.av_voucher_type_id
 WHERE v.av_session_id::text = ''itss_id'' AND v.av_is_deleted = false
   AND s.tss_company_id::text = ''icompany_id''
   AND v.av_ledger_id = (SELECT t.tnd_ledger_id FROM accounts.acc_tender_master t
           WHERE t.tnd_type_id = 1 AND t.tnd_company_id = s.tss_company_id
             AND (t.tnd_branch_id = s.tss_branch_id OR t.tnd_branch_id IS NULL)
             AND t.tnd_is_active = true AND t.tnd_is_deleted = false
           ORDER BY (t.tnd_branch_id IS NULL), t.tnd_is_default DESC, t.tnd_display_position, t.tnd_created_on
           LIMIT 1)
 ORDER BY v.av_created_on, v.av_voucher_refno, v.av_row_no', true),
  ('179', 'TILL RPT TENDER RECON', 'Desktop', 'Till Reports, Tender reconciliation tab: one row per session and non-cash tender (card, UPI, wallet, cheque, bank) — expected (Dr − Cr of the session''s tender rows, voided left out), settled (the gross the provider paid, td_settle_amount), MDR, gap, rows pending / failed / not tracked, oldest unsettled age. ipending = ''1'' lists the ones not fully settled.', 'tss_opened_on', 'Descending', 'SELECT s.tss_id, s.tss_acc_year, s.tss_company_id, s.tss_branch_id, s.tss_session_no,
       to_char(s.tss_business_date, ''DD-MM-YYYY'') AS business_date, c.tcn_code AS counter_code, COALESCE(u.usr_full_name, u.usr_login_name) AS cashier,
       y.ttm_type_id AS tender_type_id, y.ttm_display_name AS tender,
       count(*) AS txns,
       sum(CASE WHEN t.td_dr_cr = ''CR'' THEN -t.td_amount ELSE t.td_amount END) AS expected,
       COALESCE(sum(t.td_settle_amount) FILTER (WHERE t.td_settle_status IN (''SETTLED'', ''PARTIAL'')), 0) AS settled,
       COALESCE(sum(t.td_mdr_amt) FILTER (WHERE t.td_settle_status IN (''SETTLED'', ''PARTIAL'')), 0) AS mdr,
       sum(CASE WHEN t.td_dr_cr = ''CR'' THEN -t.td_amount ELSE t.td_amount END)
         - COALESCE(sum(t.td_settle_amount) FILTER (WHERE t.td_settle_status IN (''SETTLED'', ''PARTIAL'')), 0) AS gap,
       count(*) FILTER (WHERE t.td_settle_status IN (''PENDING'', ''PARTIAL'')) AS pending_n,
       count(*) FILTER (WHERE t.td_settle_status = ''FAILED'') AS failed_n,
       count(*) FILTER (WHERE t.td_settle_status = ''NA'') AS not_tracked,
       (current_date - min(t.td_doc_date) FILTER (WHERE t.td_settle_status IN (''PENDING'', ''PARTIAL'', ''FAILED''))) AS oldest_days,
       CASE WHEN count(*) FILTER (WHERE t.td_settle_status = ''FAILED'') > 0 THEN ''FAILED''
            WHEN count(*) FILTER (WHERE t.td_settle_status IN (''PENDING'', ''PARTIAL'')) = 0
                 AND count(*) FILTER (WHERE t.td_settle_status = ''NA'') = count(*) THEN ''NOT TRACKED''
            WHEN count(*) FILTER (WHERE t.td_settle_status IN (''PENDING'', ''PARTIAL'')) = 0 THEN ''SETTLED''
            WHEN count(*) FILTER (WHERE t.td_settle_status IN (''SETTLED'', ''PARTIAL'')) > 0 THEN ''PARTIAL''
            ELSE ''PENDING'' END AS state
  FROM accounts.till_session s
  JOIN accounts.till_counter c ON c.tcn_id = s.tss_counter_id
  LEFT JOIN public.user_master u ON u.usr_id = s.tss_operator_id
  JOIN accounts.acc_tender_detail t ON t.td_session_id = s.tss_id AND t.td_is_deleted = false
                                   AND COALESCE(t.td_is_voided, false) = false
  JOIN accounts.acc_tender_types y ON y.ttm_type_id = t.td_tender_type_id AND y.ttm_type_name IN (''CARD'', ''UPI'', ''WALLET'', ''CHEQUE'', ''BANK'')
 WHERE s.tss_is_deleted = false AND s.tss_status <> ''VOIDED''
   AND s.tss_company_id::text = ''icompany_id''
   AND (NULLIF(''ibranch_id'', '''') IS NULL OR s.tss_branch_id::text = ''ibranch_id'')
   AND s.tss_business_date::text >= ''ifrom_date'' AND s.tss_business_date::text <= ''ito_date''
   AND (NULLIF(''icounter_id'', '''') IS NULL OR s.tss_counter_id::text = ''icounter_id'')
   AND (NULLIF(''ioperator_id'', '''') IS NULL OR s.tss_operator_id::text = ''ioperator_id'')
 GROUP BY s.tss_id, s.tss_acc_year, s.tss_company_id, s.tss_branch_id, s.tss_session_no, s.tss_business_date,
          s.tss_opened_on, c.tcn_code, u.usr_full_name, u.usr_login_name, y.ttm_type_id, y.ttm_display_name
HAVING (NULLIF(''ipending'', '''') IS NULL
        OR count(*) FILTER (WHERE t.td_settle_status IN (''PENDING'', ''PARTIAL'', ''FAILED'')) > 0)
 ORDER BY count(*) FILTER (WHERE t.td_settle_status = ''FAILED'') > 0 DESC, s.tss_opened_on DESC, y.ttm_type_id', true),
  ('180', 'TILL RPT TENDER ROWS', 'Desktop', 'Till Reports, Tender reconciliation tab, lower grid: one session''s tender rows of one tender type — the document, reference, amount and how it settled.', 'td_created_on', 'Ascending', 'SELECT t.td_id, t.td_created_on, to_char(t.td_created_on AT TIME ZONE ''Asia/Kolkata'', ''DD-MM HH12:MI AM'') AS at_text,
       t.td_src_doc_type AS doc_type,
       COALESCE(h.avh_voucher_refno, b.sb_bill_refno, '''') AS doc_refno,
       tm.tnd_name AS tender_name,
       CASE WHEN t.td_dr_cr = ''CR'' THEN -t.td_amount ELSE t.td_amount END AS amount,
       concat_ws('' · '', NULLIF(t.td_ref_no, ''''), NULLIF(''xx'' || t.td_card_last4, ''xx''), NULLIF(t.td_payer_vpa, '''')) AS reference,
       t.td_settle_status AS settle_status,
       to_char(t.td_settled_on, ''DD-MM-YYYY'') AS settled_on, t.td_settle_amount AS settled, t.td_mdr_amt AS mdr,
       COALESCE(t.td_settle_ref_no, '''') AS settle_ref,
       CASE WHEN t.td_settle_status IN (''PENDING'', ''PARTIAL'', ''FAILED'') THEN current_date - t.td_doc_date END AS age_days
  FROM accounts.acc_tender_detail t
  JOIN accounts.till_session s ON s.tss_id = t.td_session_id
  LEFT JOIN accounts.acc_tender_master tm ON tm.tnd_id = t.td_tender_id
  LEFT JOIN accounts.acc_voucher_header h ON h.avh_voucher_id = t.td_voucher_id AND h.avh_acc_year = t.td_acc_year
  LEFT JOIN sales.sale_bill b ON b.sb_id = t.td_src_doc_id AND b.sb_acc_year = t.td_acc_year AND t.td_src_doc_type = ''SALE_BILL''
 WHERE t.td_session_id::text = ''itss_id'' AND t.td_tender_type_id::text = ''itender_type_id''
   AND s.tss_company_id::text = ''icompany_id''
   AND t.td_is_deleted = false AND COALESCE(t.td_is_voided, false) = false
 ORDER BY t.td_created_on', true);

-- ── grid columns ──────────────────────────────────────────────────────────
INSERT INTO pg_temp.sync_grid_column (grid_name, grid_device_type, grid_column_number, grid_column_name, grid_column_width, grid_column_alignment, grid_column_visibility, grid_column_filter, grid_column_condition, grid_column_condition_color, grid_column_group, grid_column_total, grid_column_data_type, grid_column_color, grid_column_notes, grid_column_is_deleted, grid_column_position, grid_column_sql_field_name, grid_column_px) VALUES
  ('TILL CASH POSITION', 'Desktop', 1, '#', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 1.00, 'branch_id', NULL),
  ('TILL CASH POSITION', 'Desktop', 2, 'Store', 12.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 2.00, 'branch_name', NULL),
  ('TILL CASH POSITION', 'Desktop', 3, 'Day', 6.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 3.00, 'day_status', NULL),
  ('TILL CASH POSITION', 'Desktop', 4, 'Day id', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 4.00, 'tbd_id', NULL),
  ('TILL CASH POSITION', 'Desktop', 5, 'Day year', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 5.00, 'tbd_acc_year', NULL),
  ('TILL CASH POSITION', 'Desktop', 6, 'Old day open', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 6.00, 'old_open_day', NULL),
  ('TILL CASH POSITION', 'Desktop', 7, 'Live', 3.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 7.00, 'live', NULL),
  ('TILL CASH POSITION', 'Desktop', 8, 'Over hours', 0.00, 'right', false, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 8.00, 'over_hours', NULL),
  ('TILL CASH POSITION', 'Desktop', 9, 'Longest h', 0.00, 'right', false, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 9.00, 'longest_hours', NULL),
  ('TILL CASH POSITION', 'Desktop', 10, 'Max h', 0.00, 'right', false, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 10.00, 'max_hours', NULL),
  ('TILL CASH POSITION', 'Desktop', 11, 'Awaiting receipt', 8.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 11.00, 'awaiting', NULL),
  ('TILL CASH POSITION', 'Desktop', 12, 'Safe (book)', 8.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 12.00, 'safe_book', NULL),
  ('TILL CASH POSITION', 'Desktop', 13, 'Insured limit', 0.00, 'right', false, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 13.00, 'insured_limit', NULL),
  ('TILL CASH POSITION', 'Desktop', 14, 'Safes', 0.00, 'right', false, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 14.00, 'safes', NULL),
  ('TILL CASH POSITION', 'Desktop', 15, 'Counted on', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 15.00, 'oldest_count_on', NULL),
  ('TILL CASH POSITION', 'Desktop', 16, 'Safe count', 6.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 16.00, 'safe_count', NULL),
  ('TILL CASH POSITION', 'Desktop', 17, 'In transit', 8.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 17.00, 'in_transit', NULL),
  ('TILL CASH POSITION', 'Desktop', 18, 'Transit days', 0.00, 'right', false, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 18.00, 'transit_days', NULL),
  ('TILL CASH POSITION', 'Desktop', 19, 'Var. today', 7.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 19.00, 'var_day', NULL),
  ('TILL CASH POSITION', 'Desktop', 20, 'Var. MTD', 7.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 20.00, 'var_mtd', NULL),
  ('TILL CASH POSITION', 'Desktop', 21, 'Approvals', 5.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 21.00, 'approvals', NULL),
  ('TILL CASH POSITION', 'Desktop', 22, 'Last at', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 22.00, 'last_at', NULL),
  ('TILL CASH POSITION', 'Desktop', 23, 'Last activity', 7.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 23.00, 'last_activity', NULL),
  ('TILL CASH POSITION', 'Desktop', 24, 'HO review', 7.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 24.00, 'last_review', NULL),
  ('TILL CASH POSITION', 'Desktop', 25, 'Flags', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 25.00, 'flags', NULL),
  ('TILL CASH POSITION LIVE', 'Desktop', 1, '#', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 1.00, 'tss_id', NULL),
  ('TILL CASH POSITION LIVE', 'Desktop', 2, 'Year', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 2.00, 'tss_acc_year', NULL),
  ('TILL CASH POSITION LIVE', 'Desktop', 3, 'Branch', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 3.00, 'tss_branch_id', NULL),
  ('TILL CASH POSITION LIVE', 'Desktop', 4, 'Session', 8.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 4.00, 'tss_session_no', NULL),
  ('TILL CASH POSITION LIVE', 'Desktop', 5, 'Status', 6.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 5.00, 'tss_status', NULL),
  ('TILL CASH POSITION LIVE', 'Desktop', 6, 'Opened', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 6.00, 'tss_opened_on', NULL),
  ('TILL CASH POSITION LIVE', 'Desktop', 7, 'Cashier', 8.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 7.00, 'cashier', NULL),
  ('TILL CASH POSITION LIVE', 'Desktop', 8, 'Counter', 5.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 8.00, 'counter_code', NULL),
  ('TILL CASH POSITION EVENTS', 'Desktop', 1, '#', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 1.00, 'tev_event_on', NULL),
  ('TILL CASH POSITION EVENTS', 'Desktop', 2, 'Time', 5.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 2.00, 'at_text', NULL),
  ('TILL CASH POSITION EVENTS', 'Desktop', 3, 'Store', 8.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 3.00, 'branch_name', NULL),
  ('TILL CASH POSITION EVENTS', 'Desktop', 4, 'Code', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 4.00, 'code', NULL),
  ('TILL CASH POSITION EVENTS', 'Desktop', 5, 'What', 20.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 5.00, 'what', NULL),
  ('TILL CASH POSITION EVENTS', 'Desktop', 6, 'Amount', 0.00, 'right', false, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 6.00, 'tev_amount', NULL),
  ('TILL CASH POSITION EVENTS', 'Desktop', 7, 'Session', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 7.00, 'tev_session_id', NULL),
  ('TILL CASH POSITION EVENTS', 'Desktop', 8, 'Year', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 8.00, 'tss_acc_year', NULL),
  ('TILL CASH POSITION CASHIERS', 'Desktop', 1, '#', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 1.00, 'cashier_id', NULL),
  ('TILL CASH POSITION CASHIERS', 'Desktop', 2, 'Cashier', 8.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 2.00, 'cashier', NULL),
  ('TILL CASH POSITION CASHIERS', 'Desktop', 3, 'Store', 8.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 3.00, 'stores', NULL),
  ('TILL CASH POSITION CASHIERS', 'Desktop', 4, 'Sessions', 4.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 4.00, 'sessions', NULL),
  ('TILL CASH POSITION CASHIERS', 'Desktop', 5, 'Shorts', 4.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 5.00, 'shorts', NULL),
  ('TILL CASH POSITION CASHIERS', 'Desktop', 6, 'Total', 6.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 6.00, 'short_total', NULL),
  ('TILL CASH POSITION CASHIERS', 'Desktop', 7, 'Recovered', 6.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 7.00, 'recovered', NULL),
  ('TILL CASH POSITION REVIEWS', 'Desktop', 1, '#', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 1.00, 'tsr_id', NULL),
  ('TILL CASH POSITION REVIEWS', 'Desktop', 2, 'At', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 2.00, 'tsr_reviewed_on', NULL),
  ('TILL CASH POSITION REVIEWS', 'Desktop', 3, 'On', 7.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 3.00, 'on_text', NULL),
  ('TILL CASH POSITION REVIEWS', 'Desktop', 4, 'Reviewing', 7.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 4.00, 'reviewing', NULL),
  ('TILL CASH POSITION REVIEWS', 'Desktop', 5, 'Outcome', 7.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 5.00, 'tsr_outcome', NULL),
  ('TILL CASH POSITION REVIEWS', 'Desktop', 6, 'By', 6.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 6.00, 'reviewer', NULL),
  ('TILL CASH POSITION REVIEWS', 'Desktop', 7, 'Note', 14.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 7.00, 'note', NULL),
  ('TILL RPT CASHIER PERFORMANCE', 'Desktop', 1, '#', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 1.00, 'cashier_id', NULL),
  ('TILL RPT CASHIER PERFORMANCE', 'Desktop', 2, 'Cashier', 10.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 2.00, 'cashier', NULL),
  ('TILL RPT CASHIER PERFORMANCE', 'Desktop', 3, 'Sessions', 5.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 3.00, 'sessions', NULL),
  ('TILL RPT CASHIER PERFORMANCE', 'Desktop', 4, 'Hours', 5.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 4.00, 'hours', NULL),
  ('TILL RPT CASHIER PERFORMANCE', 'Desktop', 5, 'Bills', 5.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 5.00, 'bills', NULL),
  ('TILL RPT CASHIER PERFORMANCE', 'Desktop', 6, 'Lines', 5.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 6.00, 'lines', NULL),
  ('TILL RPT CASHIER PERFORMANCE', 'Desktop', 7, 'Items / bill', 6.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 7.00, 'items_per_bill', NULL),
  ('TILL RPT CASHIER PERFORMANCE', 'Desktop', 8, 'Bills / hour', 6.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 8.00, 'bills_per_hour', NULL),
  ('TILL RPT CASHIER PERFORMANCE', 'Desktop', 9, 'Sales', 9.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 9.00, 'sales', NULL),
  ('TILL RPT CASHIER PERFORMANCE', 'Desktop', 10, 'Average bill', 7.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 10.00, 'avg_bill', NULL),
  ('TILL RPT CASHIER PERFORMANCE', 'Desktop', 11, 'Min. between bills', 7.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 11.00, 'gap_minutes', NULL),
  ('TILL RPT CASHIER PERFORMANCE', 'Desktop', 12, 'Cancelled', 5.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 12.00, 'cancelled', NULL),
  ('TILL RPT CASHIER PERFORMANCE', 'Desktop', 13, 'Re-tenders', 5.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 13.00, 'retenders', NULL),
  ('TILL RPT PERFORMANCE SESSIONS', 'Desktop', 1, '#', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 1.00, 'tss_id', NULL),
  ('TILL RPT PERFORMANCE SESSIONS', 'Desktop', 2, 'Year', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 2.00, 'tss_acc_year', NULL),
  ('TILL RPT PERFORMANCE SESSIONS', 'Desktop', 3, 'Company', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 3.00, 'tss_company_id', NULL),
  ('TILL RPT PERFORMANCE SESSIONS', 'Desktop', 4, 'Branch', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 4.00, 'tss_branch_id', NULL),
  ('TILL RPT PERFORMANCE SESSIONS', 'Desktop', 5, 'Session', 8.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 5.00, 'tss_session_no', NULL),
  ('TILL RPT PERFORMANCE SESSIONS', 'Desktop', 6, 'Date', 6.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 6.00, 'business_date', NULL),
  ('TILL RPT PERFORMANCE SESSIONS', 'Desktop', 7, 'Counter', 5.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 7.00, 'counter_code', NULL),
  ('TILL RPT PERFORMANCE SESSIONS', 'Desktop', 8, 'Cashier', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 8.00, 'cashier', NULL),
  ('TILL RPT PERFORMANCE SESSIONS', 'Desktop', 9, 'Opened', 5.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 9.00, 'opened_at', NULL),
  ('TILL RPT PERFORMANCE SESSIONS', 'Desktop', 10, 'Hours', 4.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 10.00, 'hours', NULL),
  ('TILL RPT PERFORMANCE SESSIONS', 'Desktop', 11, 'Bills', 4.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 11.00, 'bills', NULL),
  ('TILL RPT PERFORMANCE SESSIONS', 'Desktop', 12, 'Lines', 4.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 12.00, 'lines', NULL),
  ('TILL RPT PERFORMANCE SESSIONS', 'Desktop', 13, 'Items / bill', 5.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 13.00, 'items_per_bill', NULL),
  ('TILL RPT PERFORMANCE SESSIONS', 'Desktop', 14, 'Bills / hour', 5.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 14.00, 'bills_per_hour', NULL),
  ('TILL RPT PERFORMANCE SESSIONS', 'Desktop', 15, 'Sales', 8.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 15.00, 'sales', NULL),
  ('TILL RPT PERFORMANCE SESSIONS', 'Desktop', 16, 'Average bill', 6.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 16.00, 'avg_bill', NULL),
  ('TILL RPT PERFORMANCE SESSIONS', 'Desktop', 17, 'Min. between bills', 6.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 17.00, 'gap_minutes', NULL),
  ('TILL RPT PERFORMANCE SESSIONS', 'Desktop', 18, 'Cancelled', 4.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 18.00, 'cancelled', NULL),
  ('TILL RPT PERFORMANCE SESSIONS', 'Desktop', 19, 'Re-tenders', 4.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 19.00, 'retenders', NULL),
  ('TILL RPT PERFORMANCE SESSIONS', 'Desktop', 20, 'Status', 6.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 20.00, 'status_text', NULL),
  ('TILL RPT PERFORMANCE SESSIONS', 'Desktop', 21, 'At', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 21.00, 'tss_opened_on', NULL),
  ('TILL RPT LEDGER CHECK', 'Desktop', 1, '#', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 1.00, 'tss_id', NULL),
  ('TILL RPT LEDGER CHECK', 'Desktop', 2, 'Year', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 2.00, 'tss_acc_year', NULL),
  ('TILL RPT LEDGER CHECK', 'Desktop', 3, 'Company', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 3.00, 'tss_company_id', NULL),
  ('TILL RPT LEDGER CHECK', 'Desktop', 4, 'Branch', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 4.00, 'tss_branch_id', NULL),
  ('TILL RPT LEDGER CHECK', 'Desktop', 5, 'Session', 8.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 5.00, 'tss_session_no', NULL),
  ('TILL RPT LEDGER CHECK', 'Desktop', 6, 'Date', 6.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 6.00, 'business_date', NULL),
  ('TILL RPT LEDGER CHECK', 'Desktop', 7, 'Counter', 5.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 7.00, 'counter_code', NULL),
  ('TILL RPT LEDGER CHECK', 'Desktop', 8, 'Cashier', 8.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 8.00, 'cashier', NULL),
  ('TILL RPT LEDGER CHECK', 'Desktop', 9, 'Status', 6.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 9.00, 'status_text', NULL),
  ('TILL RPT LEDGER CHECK', 'Desktop', 10, 'Code', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 10.00, 'tss_status', NULL),
  ('TILL RPT LEDGER CHECK', 'Desktop', 11, 'Float', 5.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 11.00, 'tss_float_mode', NULL),
  ('TILL RPT LEDGER CHECK', 'Desktop', 12, 'Issued', 6.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 12.00, 'tss_float_issued', NULL),
  ('TILL RPT LEDGER CHECK', 'Desktop', 13, 'Float left', 6.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 13.00, 'tss_float_left', NULL),
  ('TILL RPT LEDGER CHECK', 'Desktop', 14, 'Books', 7.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 14.00, 'books', NULL),
  ('TILL RPT LEDGER CHECK', 'Desktop', 15, 'Should be', 7.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 15.00, 'should', NULL),
  ('TILL RPT LEDGER CHECK', 'Desktop', 16, 'Difference', 7.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 16.00, 'diff', NULL),
  ('TILL RPT LEDGER CHECK', 'Desktop', 17, 'Legs', 4.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 17.00, 'legs', NULL),
  ('TILL RPT LEDGER CHECK', 'Desktop', 18, 'Check', 5.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 18.00, 'verdict', NULL),
  ('TILL RPT LEDGER CHECK', 'Desktop', 19, 'At', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 19.00, 'tss_opened_on', NULL),
  ('TILL RPT LEDGER LEGS', 'Desktop', 1, '#', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 1.00, 'av_id', NULL),
  ('TILL RPT LEDGER LEGS', 'Desktop', 2, 'At', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 2.00, 'av_created_on', NULL),
  ('TILL RPT LEDGER LEGS', 'Desktop', 3, 'When', 6.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 3.00, 'at_text', NULL),
  ('TILL RPT LEDGER LEGS', 'Desktop', 4, 'Voucher', 6.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 4.00, 'refno', NULL),
  ('TILL RPT LEDGER LEGS', 'Desktop', 5, 'Type', 4.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 5.00, 'type_code', NULL),
  ('TILL RPT LEDGER LEGS', 'Desktop', 6, 'Type name', 8.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 6.00, 'type_name', NULL),
  ('TILL RPT LEDGER LEGS', 'Desktop', 7, 'Dr/Cr', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 7.00, 'dr_cr', NULL),
  ('TILL RPT LEDGER LEGS', 'Desktop', 8, 'Dr', 6.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 8.00, 'dr', NULL),
  ('TILL RPT LEDGER LEGS', 'Desktop', 9, 'Cr', 6.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 9.00, 'cr', NULL),
  ('TILL RPT LEDGER LEGS', 'Desktop', 10, 'Running', 7.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 10.00, 'running', NULL),
  ('TILL RPT LEDGER LEGS', 'Desktop', 11, 'Remarks', 14.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 11.00, 'remarks', NULL),
  ('TILL RPT TENDER RECON', 'Desktop', 1, '#', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 1.00, 'tss_id', NULL),
  ('TILL RPT TENDER RECON', 'Desktop', 2, 'Year', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 2.00, 'tss_acc_year', NULL),
  ('TILL RPT TENDER RECON', 'Desktop', 3, 'Company', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 3.00, 'tss_company_id', NULL),
  ('TILL RPT TENDER RECON', 'Desktop', 4, 'Branch', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 4.00, 'tss_branch_id', NULL),
  ('TILL RPT TENDER RECON', 'Desktop', 5, 'Session', 8.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 5.00, 'tss_session_no', NULL),
  ('TILL RPT TENDER RECON', 'Desktop', 6, 'Date', 6.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 6.00, 'business_date', NULL),
  ('TILL RPT TENDER RECON', 'Desktop', 7, 'Counter', 5.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 7.00, 'counter_code', NULL),
  ('TILL RPT TENDER RECON', 'Desktop', 8, 'Cashier', 8.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 8.00, 'cashier', NULL),
  ('TILL RPT TENDER RECON', 'Desktop', 9, 'Type', 0.00, 'right', false, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 9.00, 'tender_type_id', NULL),
  ('TILL RPT TENDER RECON', 'Desktop', 10, 'Tender', 6.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 10.00, 'tender', NULL),
  ('TILL RPT TENDER RECON', 'Desktop', 11, 'Txns', 4.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 11.00, 'txns', NULL),
  ('TILL RPT TENDER RECON', 'Desktop', 12, 'Expected', 7.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 12.00, 'expected', NULL),
  ('TILL RPT TENDER RECON', 'Desktop', 13, 'Settled', 7.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 13.00, 'settled', NULL),
  ('TILL RPT TENDER RECON', 'Desktop', 14, 'MDR', 5.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 14.00, 'mdr', NULL),
  ('TILL RPT TENDER RECON', 'Desktop', 15, 'Gap', 6.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 15.00, 'gap', NULL),
  ('TILL RPT TENDER RECON', 'Desktop', 16, 'Pending', 4.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 16.00, 'pending_n', NULL),
  ('TILL RPT TENDER RECON', 'Desktop', 17, 'Failed', 4.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 17.00, 'failed_n', NULL),
  ('TILL RPT TENDER RECON', 'Desktop', 18, 'Not tracked', 4.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 18.00, 'not_tracked', NULL),
  ('TILL RPT TENDER RECON', 'Desktop', 19, 'Oldest (days)', 5.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 19.00, 'oldest_days', NULL),
  ('TILL RPT TENDER RECON', 'Desktop', 20, 'State', 7.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 20.00, 'state', NULL),
  ('TILL RPT TENDER ROWS', 'Desktop', 1, '#', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 1.00, 'td_id', NULL),
  ('TILL RPT TENDER ROWS', 'Desktop', 2, 'At', 0.00, 'left', false, false, NULL, NULL, false, false, 'Text', NULL, NULL, false, 2.00, 'td_created_on', NULL),
  ('TILL RPT TENDER ROWS', 'Desktop', 3, 'When', 6.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 3.00, 'at_text', NULL),
  ('TILL RPT TENDER ROWS', 'Desktop', 4, 'Doc', 6.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 4.00, 'doc_type', NULL),
  ('TILL RPT TENDER ROWS', 'Desktop', 5, 'No.', 6.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 5.00, 'doc_refno', NULL),
  ('TILL RPT TENDER ROWS', 'Desktop', 6, 'Tender', 6.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 6.00, 'tender_name', NULL),
  ('TILL RPT TENDER ROWS', 'Desktop', 7, 'Amount', 6.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 7.00, 'amount', NULL),
  ('TILL RPT TENDER ROWS', 'Desktop', 8, 'Reference', 10.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 8.00, 'reference', NULL),
  ('TILL RPT TENDER ROWS', 'Desktop', 9, 'Settlement', 5.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 9.00, 'settle_status', NULL),
  ('TILL RPT TENDER ROWS', 'Desktop', 10, 'Settled on', 5.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 10.00, 'settled_on', NULL),
  ('TILL RPT TENDER ROWS', 'Desktop', 11, 'Settled', 6.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 11.00, 'settled', NULL),
  ('TILL RPT TENDER ROWS', 'Desktop', 12, 'MDR', 4.00, 'right', true, false, NULL, NULL, false, false, 'Currency', NULL, NULL, false, 12.00, 'mdr', NULL),
  ('TILL RPT TENDER ROWS', 'Desktop', 13, 'Settle ref', 6.00, 'left', true, true, NULL, NULL, false, false, 'Text', NULL, NULL, false, 13.00, 'settle_ref', NULL),
  ('TILL RPT TENDER ROWS', 'Desktop', 14, 'Age (days)', 4.00, 'right', true, false, NULL, NULL, false, false, 'Number', NULL, NULL, false, 14.00, 'age_days', NULL);

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
              g.grid_sql, g.grid_status, false, g.grid_device_type, 'live-sync 2026-10-19', now());
      v_inserted := v_inserted + 1;
      RAISE NOTICE 'grid % "%" inserted', v_id, g.grid_name;
    ELSE
      UPDATE fixed.grid_details
         SET grid_description = g.grid_description, grid_sort_column = g.grid_sort_column,
             grid_sort_order = g.grid_sort_order, grid_sql = g.grid_sql, grid_status = g.grid_status,
             grid_modified_by = 'live-sync 2026-10-19', grid_modified_on = now()
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
           c.grid_column_px, 'live-sync 2026-10-19', now()
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

