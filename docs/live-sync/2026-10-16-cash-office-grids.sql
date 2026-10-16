-- ═══════════════════════════════════════════════════════════════════════════
--  Live sync — Cash Office grids (generated 2026-10-16 from the dev DB, for
--  the web port of Qt NexERP c77f3f1..bec3f98, till notes 118).
--
--  WHAT: brings 2 configured grids and 1 dropdown on live up to dev, matched by
--  NAME + device type (ids differ between the databases):
--    grids     TILL REMITTANCES (157) · TILL SAFE BOOK (158) — the Cash Office
--              (menu 287) lists; the web resolves them by name, fallback 157/158
--    dropdowns TILL APPROVER USERS (68) — the Cash Office witness / second person
--              and Business Day's "close with exception" approvers. Same text the
--              server's notes-122 migration writes (blank names → login); here
--              too because 2026-10-15-till-grids.sql carries the OLD text and
--              would undo that migration if it ran after it.
--  A row missing on live is inserted (keeping the dev id when live has it free,
--  so the web's fallback ids stay right); a row present is updated in place and
--  its column list replaced by dev's.
--
--  ORDER: run AFTER the server with the till notes 118 migration
--  (20261015100000_till_safe_notes_118) is deployed on live, and after
--  2026-10-15-till-grids.sql if that one has not run yet. Both grids read the
--  notes-118 columns (tcm_remit_status, tcm_bank_amount …); before they exist
--  the guard below stops the script and nothing changes. Menu 287 itself comes
--  with that migration — nothing to sync for it.
--
--  BACK UP FIRST (on the live server):
--    sudo -u postgres pg_dump erp -t fixed.grid_details -t fixed.grid_columns \
--         -t fixed.dropdown_details -t fixed.dropdown_columns \
--         > /root/config-backup-$(date +%Y%m%d%H%M).sql
--  RUN:
--    sudo -u postgres psql erp -v ON_ERROR_STOP=1 -f 2026-10-16-cash-office-grids.sql
--  One transaction: any error rolls the whole sync back.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
BEGIN;

-- ── guard: the server migration these grids read must be in ──────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'accounts' AND table_name = 'till_cash_movement'
                    AND column_name = 'tcm_remit_status') THEN
    RAISE EXCEPTION 'accounts.till_cash_movement.tcm_remit_status is missing: deploy the server with the till notes 118 migration first. Nothing was changed.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'accounts' AND table_name = 'till_cash_movement'
                    AND column_name = 'tcm_bank_amount') THEN
    RAISE EXCEPTION 'accounts.till_cash_movement.tcm_bank_amount is missing: deploy the server with the till notes 118 migration first. Nothing was changed.';
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
  ('157', 'TILL REMITTANCES', 'Desktop', 'REMIT movements of one branch over a business-date range, newest first — the Remittances tab of the Cash Office (menu 287, till notes 118). istatus = DEPOSITED / IN_TRANSIT / CONFIRMED / VOIDED or ''''.', 'tcm_created_on', 'Descending', 'SELECT m.tcm_id, m.tcm_acc_year, m.tcm_created_on, m.tcm_doc_no,
       to_char(m.tcm_doc_date, ''DD-MM-YYYY'') AS rm_date, sf.tsf_name AS rm_safe,
       CASE m.tcm_remit_mode WHEN ''CIT'' THEN ''CIT agency'' ELSE ''Bank deposit'' END AS rm_mode,
       l.led_name AS rm_bank, concat_ws('' / '', NULLIF(m.tcm_bag_no, ''''), NULLIF(m.tcm_seal_no, '''')) AS rm_bag_seal,
       COALESCE(m.tcm_cit_agency, '''') AS rm_agency, COALESCE(m.tcm_ref_no, '''') AS rm_slip,
       m.tcm_amount AS rm_amount, m.tcm_bank_amount AS rm_credited,
       CASE WHEN m.tcm_status = ''VOIDED'' THEN ''VOIDED'' ELSE replace(m.tcm_remit_status, ''_'', '' '') END AS rm_status,
       CASE WHEN m.tcm_status = ''POSTED'' AND m.tcm_remit_status = ''IN_TRANSIT''
            THEN (now() AT TIME ZONE ''Asia/Kolkata'')::date - m.tcm_doc_date END AS rm_age,
       COALESCE(to_char(m.tcm_bank_date, ''DD-MM-YYYY''), '''') AS rm_bank_date, COALESCE(m.tcm_bank_ref, '''') AS rm_bank_ref,
       COALESCE(u.usr_full_name, u.usr_login_name) AS rm_by,
       m.tcm_remit_status, m.tcm_status
  FROM accounts.till_cash_movement m
  LEFT JOIN accounts.till_safe sf ON sf.tsf_id = m.tcm_safe_id
  LEFT JOIN accounts.acc_ledger_master l ON l.led_id = m.tcm_ledger_id
  LEFT JOIN public.user_master u ON u.usr_id = m.tcm_done_by
 WHERE m.tcm_is_deleted = false AND m.tcm_kind = ''REMIT''
   AND m.tcm_company_id::text = ''icompany_id''
   AND m.tcm_branch_id::text = ''ibranch_id''
   AND (NULLIF(''ifrom_date'', '''') IS NULL OR m.tcm_doc_date::text >= ''ifrom_date'')
   AND (NULLIF(''ito_date'', '''') IS NULL OR m.tcm_doc_date::text <= ''ito_date'')
   AND (NULLIF(''istatus'', '''') IS NULL
        OR CASE WHEN m.tcm_status = ''VOIDED'' THEN ''VOIDED'' ELSE m.tcm_remit_status END = ''istatus'')
 ORDER BY m.tcm_created_on DESC', 'true'),
  ('158', 'TILL SAFE BOOK', 'Desktop', 'Every movement in and out of one safe (isafe_id) since its last SAFE count, newest first — the safe book of the Cash Office (menu 287, till notes 118). Same rules as GET /till/safes/balance.', 'sb_at', 'Descending', 'SELECT f.sb_at, to_char(f.sb_at AT TIME ZONE ''Asia/Kolkata'', ''DD-MM'') AS sb_date,
       to_char(f.sb_at AT TIME ZONE ''Asia/Kolkata'', ''HH12:MI AM'') AS sb_time,
       replace(f.cat, ''_'', '' '') || CASE WHEN f.amt < 0 THEN '' VOID'' ELSE '''' END AS sb_kind,
       f.doc_no AS sb_doc, f.who AS sb_who,
       CASE WHEN f.cat IN (''CLOSE_HANDOVER'', (''DR'' || ''OP''), ''PICKUP'', ''TRANSFER_IN'', ''MONEY_IN'') THEN f.amt END AS sb_in,
       CASE WHEN f.cat IN (''FLOAT_ISSUE'', ''TOP_UP'', ''REMIT'', ''SAFE_TRANSFER'', ''MONEY_OUT'') THEN f.amt END AS sb_out,
       f.cat AS sb_cat
  FROM accounts.till_safe sf
 CROSS JOIN LATERAL (
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
           AND h.avh_is_deleted = false
           AND ((h.avh_voucher_status = ''POSTED'' AND t.td_is_deleted = false AND t.td_is_voided = false)
                OR h.avh_voucher_status = ''CANCELLED'')
           AND x.at IS NOT NULL
      ) f
 WHERE sf.tsf_is_deleted = false
   AND sf.tsf_company_id::text = ''icompany_id''
   AND sf.tsf_branch_id::text = ''ibranch_id''
   AND sf.tsf_id::text = ''isafe_id''
   AND f.sb_at > COALESCE((SELECT max(c.tct_counted_on) FROM accounts.till_count c
                            WHERE c.tct_safe_id = sf.tsf_id AND c.tct_kind = ''SAFE'' AND c.tct_is_deleted = false),
                          ''-infinity''::timestamptz)
 ORDER BY f.sb_at DESC', 'true');

INSERT INTO pg_temp.sync_grid_column (grid_name, grid_device_type, grid_column_number, grid_column_name, grid_column_width, grid_column_alignment, grid_column_visibility, grid_column_filter, grid_column_condition, grid_column_condition_color, grid_column_group, grid_column_total, grid_column_data_type, grid_column_color, grid_column_notes, grid_column_is_deleted, grid_column_position, grid_column_sql_field_name, grid_column_px) VALUES
  ('TILL REMITTANCES', 'Desktop', '1', '#', '0.00', 'left', 'false', 'false', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '1.00', 'tcm_id', NULL),
  ('TILL REMITTANCES', 'Desktop', '2', 'Year', '0.00', 'left', 'false', 'false', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '2.00', 'tcm_acc_year', NULL),
  ('TILL REMITTANCES', 'Desktop', '3', 'Date', '10.00', 'left', 'true', 'true', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '3.00', 'rm_date', NULL),
  ('TILL REMITTANCES', 'Desktop', '4', 'Doc', '13.00', 'left', 'true', 'true', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '4.00', 'tcm_doc_no', NULL),
  ('TILL REMITTANCES', 'Desktop', '5', 'Safe', '11.00', 'left', 'true', 'true', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '5.00', 'rm_safe', NULL),
  ('TILL REMITTANCES', 'Desktop', '6', 'Mode', '11.00', 'left', 'true', 'true', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '6.00', 'rm_mode', NULL),
  ('TILL REMITTANCES', 'Desktop', '7', 'Bank', '14.00', 'left', 'true', 'true', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '7.00', 'rm_bank', NULL),
  ('TILL REMITTANCES', 'Desktop', '8', 'Bag / seal', '11.00', 'left', 'true', 'true', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '8.00', 'rm_bag_seal', NULL),
  ('TILL REMITTANCES', 'Desktop', '9', 'Agency', '11.00', 'left', 'true', 'true', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '9.00', 'rm_agency', NULL),
  ('TILL REMITTANCES', 'Desktop', '10', 'Slip', '9.00', 'left', 'true', 'true', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '10.00', 'rm_slip', NULL),
  ('TILL REMITTANCES', 'Desktop', '11', 'Amount', '11.00', 'right', 'true', 'false', NULL, NULL, 'false', 'false', 'Currency', NULL, NULL, 'false', '11.00', 'rm_amount', NULL),
  ('TILL REMITTANCES', 'Desktop', '12', 'Credited', '11.00', 'right', 'true', 'false', NULL, NULL, 'false', 'false', 'Currency', NULL, NULL, 'false', '12.00', 'rm_credited', NULL),
  ('TILL REMITTANCES', 'Desktop', '13', 'Status', '10.00', 'left', 'true', 'true', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '13.00', 'rm_status', NULL),
  ('TILL REMITTANCES', 'Desktop', '14', 'Age (days)', '7.00', 'right', 'true', 'false', NULL, NULL, 'false', 'false', 'Number', NULL, NULL, 'false', '14.00', 'rm_age', NULL),
  ('TILL REMITTANCES', 'Desktop', '15', 'Bank date', '0.00', 'left', 'false', 'false', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '15.00', 'rm_bank_date', NULL),
  ('TILL REMITTANCES', 'Desktop', '16', 'Bank ref', '0.00', 'left', 'false', 'false', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '16.00', 'rm_bank_ref', NULL),
  ('TILL REMITTANCES', 'Desktop', '17', 'By', '0.00', 'left', 'false', 'false', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '17.00', 'rm_by', NULL),
  ('TILL REMITTANCES', 'Desktop', '18', 'remit', '0.00', 'left', 'false', 'false', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '18.00', 'tcm_remit_status', NULL),
  ('TILL REMITTANCES', 'Desktop', '19', 'st', '0.00', 'left', 'false', 'false', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '19.00', 'tcm_status', NULL),
  ('TILL SAFE BOOK', 'Desktop', '1', '#', '0.00', 'left', 'false', 'false', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'true', '1.00', 'sb_at', NULL),
  ('TILL SAFE BOOK', 'Desktop', '1', '#', '0.00', 'left', 'false', 'false', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '1.00', 'sb_at', NULL),
  ('TILL SAFE BOOK', 'Desktop', '2', 'Date', '7.00', 'left', 'true', 'true', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'true', '2.00', 'sb_date', NULL),
  ('TILL SAFE BOOK', 'Desktop', '2', 'Date', '7.00', 'left', 'true', 'true', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '2.00', 'sb_date', NULL),
  ('TILL SAFE BOOK', 'Desktop', '3', 'Time', '9.00', 'left', 'true', 'true', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'true', '3.00', 'sb_time', NULL),
  ('TILL SAFE BOOK', 'Desktop', '3', 'Time', '9.00', 'left', 'true', 'true', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '3.00', 'sb_time', NULL),
  ('TILL SAFE BOOK', 'Desktop', '4', 'Kind', '17.00', 'left', 'true', 'true', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'true', '4.00', 'sb_kind', NULL),
  ('TILL SAFE BOOK', 'Desktop', '4', 'Kind', '17.00', 'left', 'true', 'true', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '4.00', 'sb_kind', NULL),
  ('TILL SAFE BOOK', 'Desktop', '5', 'Doc', '14.00', 'left', 'true', 'true', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'true', '5.00', 'sb_doc', NULL),
  ('TILL SAFE BOOK', 'Desktop', '5', 'Doc', '14.00', 'left', 'true', 'true', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '5.00', 'sb_doc', NULL),
  ('TILL SAFE BOOK', 'Desktop', '6', 'Session · who', '25.00', 'left', 'true', 'true', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'true', '6.00', 'sb_who', NULL),
  ('TILL SAFE BOOK', 'Desktop', '6', 'Session · who', '25.00', 'left', 'true', 'true', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '6.00', 'sb_who', NULL),
  ('TILL SAFE BOOK', 'Desktop', '7', 'In', '14.00', 'right', 'true', 'false', NULL, NULL, 'false', 'false', 'Currency', NULL, NULL, 'true', '7.00', 'sb_in', NULL),
  ('TILL SAFE BOOK', 'Desktop', '7', 'In', '14.00', 'right', 'true', 'false', NULL, NULL, 'false', 'false', 'Currency', NULL, NULL, 'false', '7.00', 'sb_in', NULL),
  ('TILL SAFE BOOK', 'Desktop', '8', 'Out', '14.00', 'right', 'true', 'false', NULL, NULL, 'false', 'false', 'Currency', NULL, NULL, 'true', '8.00', 'sb_out', NULL),
  ('TILL SAFE BOOK', 'Desktop', '8', 'Out', '14.00', 'right', 'true', 'false', NULL, NULL, 'false', 'false', 'Currency', NULL, NULL, 'false', '8.00', 'sb_out', NULL),
  ('TILL SAFE BOOK', 'Desktop', '9', 'cat', '0.00', 'left', 'false', 'false', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'true', '9.00', 'sb_cat', NULL),
  ('TILL SAFE BOOK', 'Desktop', '9', 'cat', '0.00', 'left', 'false', 'false', NULL, NULL, 'false', 'false', 'Text', NULL, NULL, 'false', '9.00', 'sb_cat', NULL);

-- ── dropdowns ─────────────────────────────────────────────────────────────
INSERT INTO pg_temp.sync_dropdown (dev_id, dropdown_name, dropdown_device_type, dropdown_description, dropdown_sql, dropdown_sort_order, dropdown_sort_column, dropdown_completion, dropdown_sql_regional, dropdown_max_visible_items, dropdown_show_header, dropdown_width) VALUES
  ('68', 'TILL APPROVER USERS', 'Desktop', 'Active users of a company (and users with no company) — Add approver in Till Approval Setup (menu 276). Param icompany_id.', 'SELECT u.usr_id, COALESCE(NULLIF(u.usr_full_name, ''''), NULLIF(u.usr_display_name, ''''), u.usr_login_name) AS usr_name,
       u.usr_login_name, COALESCE(u.usr_type, '''') AS usr_type
  FROM public.user_master u
 WHERE u.usr_is_active = true AND COALESCE(u.usr_is_deleted, false) = false
   AND (u.usr_company_id IS NULL OR u.usr_company_id::text = ''icompany_id'')
 ORDER BY 2', 'desc', 'usr_name', 'usr_name', NULL, '10', 'true', '0');

INSERT INTO pg_temp.sync_dropdown_column (dropdown_name, dropdown_device_type, dropdown_columns_no, dropdown_columns_data_type, dropdown_columns_name, dropdown_columns_alias, dropdown_columns_width, dropdown_columns_visiblity, dropdown_columns_allignment, dropdown_columns_filter, dropdown_columns_sql_name) VALUES
  ('TILL APPROVER USERS', 'Desktop', '0', 'text', '#', NULL, '0.00', 'false', NULL, 'false', 'usr_id'),
  ('TILL APPROVER USERS', 'Desktop', '1', 'text', 'User', NULL, '0.00', 'false', NULL, 'false', 'usr_name'),
  ('TILL APPROVER USERS', 'Desktop', '2', 'text', 'Login', NULL, '70.00', 'true', NULL, 'true', 'usr_login_name'),
  ('TILL APPROVER USERS', 'Desktop', '3', 'text', 'Role', NULL, '30.00', 'true', NULL, 'false', 'usr_type');

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
              g.grid_sql, g.grid_status, false, g.grid_device_type, 'live-sync 2026-10-16', now());
      v_inserted := v_inserted + 1;
      RAISE NOTICE 'grid % "%" inserted', v_id, g.grid_name;
    ELSE
      UPDATE fixed.grid_details
         SET grid_description = g.grid_description, grid_sort_column = g.grid_sort_column,
             grid_sort_order = g.grid_sort_order, grid_sql = g.grid_sql, grid_status = g.grid_status,
             grid_modified_by = 'live-sync 2026-10-16', grid_modified_on = now()
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
           c.grid_column_px, 'live-sync 2026-10-16', now()
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
              'live-sync 2026-10-16', now());
      v_inserted := v_inserted + 1;
      RAISE NOTICE 'dropdown % "%" inserted', v_id, d.dropdown_name;
    ELSE
      UPDATE fixed.dropdown_details
         SET dropdown_description = d.dropdown_description, dropdown_sql = d.dropdown_sql,
             dropdown_sort_order = d.dropdown_sort_order, dropdown_sort_column = d.dropdown_sort_column,
             dropdown_completion = d.dropdown_completion, dropdown_sql_regional = d.dropdown_sql_regional,
             dropdown_max_visible_items = d.dropdown_max_visible_items,
             dropdown_show_header = d.dropdown_show_header, dropdown_width = d.dropdown_width,
             dropdown_modified_by = 'live-sync 2026-10-16', dropdown_modified_on = now()
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
           'live-sync 2026-10-16', now()
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
