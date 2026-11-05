-- ═══════════════════════════════════════════════════════════════════════════
--  Live sync — grid 187 MAIN LIST - EMPLOYEES (generated 2026-11-05 from the
--  dev DB).
--
--  WHY: the Employee Master list (menu employee, registry key `employeeList`)
--  404s on live with "Grid with id 187 not found". Grid 187 (Qt 091bf5b,
--  2026-10-26) replaced grid 77 in dev and was never copied to live. Live's
--  grid 77 is named "EMPLOYEES MAIN LIST" (edited on live 2026-10-07), so the
--  web's by-name lookup finds nothing and falls back to dev's id 187.
--
--  WHAT: inserts grid 187 + its 11 columns, matched by NAME + device type.
--  Kept at id 187 when free so the web's fallback id names it too; if live
--  already has a "MAIN LIST - EMPLOYEES" Desktop row it is updated in place
--  and its column list replaced. Live grid 77 is NOT touched (the Qt client
--  may still read it).
--
--  Needs employee_master.emp_branch_id / emp_joined_on / emp_employment_type /
--  emp_is_active — all present on live 2026-11-05; the guard stops the script
--  otherwise. The grid SQL is executed once at the end ('iemp_is_deleted' =
--  false) so a statement live cannot run rolls the whole sync back.
--
--  BACK UP FIRST (on the live server):
--    sudo -u postgres pg_dump erp -t fixed.grid_details -t fixed.grid_columns \
--         > /root/config-backup-$(date +%Y%m%d%H%M).sql
--  RUN:
--    sudo -u postgres psql erp -v ON_ERROR_STOP=1 -f 2026-11-05-employee-grid-187.sql
--  One transaction: any error rolls the whole sync back.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on
BEGIN;

-- ── guard: the employee columns the grid reads must be in ──────────────────
DO $$
DECLARE c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['emp_branch_id', 'emp_joined_on', 'emp_employment_type', 'emp_is_active'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'employee_master'
                      AND column_name = c) THEN
      RAISE EXCEPTION 'public.employee_master.% is missing: deploy the server with the employee master migration first. Nothing was changed.', c;
    END IF;
  END LOOP;
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
  ('187', 'MAIN LIST - EMPLOYEES', 'Desktop', 'Employee master list (2026-10-26, replaces grid 77). iemp_is_deleted.', 'emp_name', 'Ascending', 'SELECT e.emp_id, e.emp_code, e.emp_name,
       COALESCE(g.ed_name, '''') AS designation,
       COALESCE(d.edpt_name, '''') AS department,
       COALESCE(b.br_name, '''') AS branch_name,
       COALESCE(e.emp_mobile1, '''') AS emp_mobile1,
       e.emp_joined_on,
       COALESCE(initcap(e.emp_employment_type), '''') AS employment_type,
       COALESCE(initcap(e.emp_status), '''') AS emp_status,
       e.emp_is_active
  FROM public.employee_master e
  LEFT JOIN public.employee_departments d ON d.edpt_id = e.emp_department_id
  LEFT JOIN public.employee_designations g ON g.ed_id = e.emp_designation_id
  LEFT JOIN public.branch_master b ON b.br_id = e.emp_branch_id
 WHERE e.emp_is_deleted::text = ''iemp_is_deleted''
 ORDER BY e.emp_name', 't');

-- ── grid columns ──────────────────────────────────────────────────────────
INSERT INTO pg_temp.sync_grid_column (grid_name, grid_device_type, grid_column_number, grid_column_name, grid_column_width, grid_column_alignment, grid_column_visibility, grid_column_filter, grid_column_condition, grid_column_condition_color, grid_column_group, grid_column_total, grid_column_data_type, grid_column_color, grid_column_notes, grid_column_is_deleted, grid_column_position, grid_column_sql_field_name, grid_column_px) VALUES
  ('MAIN LIST - EMPLOYEES', 'Desktop', 1, '#', 0.00, 'left', 'f', 'f', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', 1.00, 'emp_id', NULL),
  ('MAIN LIST - EMPLOYEES', 'Desktop', 2, 'Code', 7.00, 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', 2.00, 'emp_code', NULL),
  ('MAIN LIST - EMPLOYEES', 'Desktop', 3, 'Employee', 20.00, 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', 3.00, 'emp_name', NULL),
  ('MAIN LIST - EMPLOYEES', 'Desktop', 4, 'Designation', 12.00, 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', 4.00, 'designation', NULL),
  ('MAIN LIST - EMPLOYEES', 'Desktop', 5, 'Department', 12.00, 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', 5.00, 'department', NULL),
  ('MAIN LIST - EMPLOYEES', 'Desktop', 6, 'Branch', 12.00, 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', 6.00, 'branch_name', '260px'),
  ('MAIN LIST - EMPLOYEES', 'Desktop', 7, 'Mobile', 10.00, 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', 7.00, 'emp_mobile1', NULL),
  ('MAIN LIST - EMPLOYEES', 'Desktop', 8, 'Joined', 7.00, 'left', 't', 'f', NULL, NULL, 'f', 'f', 'Date', NULL, NULL, 'f', 8.00, 'emp_joined_on', NULL),
  ('MAIN LIST - EMPLOYEES', 'Desktop', 9, 'Type', 6.00, 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', 9.00, 'employment_type', NULL),
  ('MAIN LIST - EMPLOYEES', 'Desktop', 10, 'Status', 7.00, 'left', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', 10.00, 'emp_status', NULL),
  ('MAIN LIST - EMPLOYEES', 'Desktop', 11, 'Active', 7.00, 'center', 't', 't', NULL, NULL, 'f', 'f', 'Text', NULL, NULL, 'f', 11.00, 'emp_is_active', NULL);

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
     ORDER BY grid_status DESC, grid_id DESC
     LIMIT 1;

    IF v_id IS NULL THEN
      -- The dev id when it is free here, so the web's fallback id names this grid too.
      v_id := CASE WHEN EXISTS (SELECT 1 FROM fixed.grid_details WHERE grid_id = g.dev_id)
                   THEN nextval('fixed.grid_details_grid_id_seq') ELSE g.dev_id END;
      INSERT INTO fixed.grid_details (grid_id, grid_name, grid_description, grid_sort_column, grid_sort_order,
                                      grid_sql, grid_status, grid_is_deleted, grid_device_type,
                                      grid_created_by, grid_created_on)
      VALUES (v_id, g.grid_name, g.grid_description, g.grid_sort_column, g.grid_sort_order,
              g.grid_sql, g.grid_status, false, g.grid_device_type, 'live-sync 2026-11-05', now());
      v_inserted := v_inserted + 1;
      RAISE NOTICE 'grid % "%" inserted', v_id, g.grid_name;
    ELSE
      UPDATE fixed.grid_details
         SET grid_description = g.grid_description, grid_sort_column = g.grid_sort_column,
             grid_sort_order = g.grid_sort_order, grid_sql = g.grid_sql, grid_status = g.grid_status,
             grid_modified_by = 'live-sync 2026-11-05', grid_modified_on = now()
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
           c.grid_column_px, 'live-sync 2026-11-05', now()
      FROM pg_temp.sync_grid_column c
     WHERE c.grid_name = g.grid_name
       AND COALESCE(c.grid_device_type, '') = COALESCE(g.grid_device_type, '');
  END LOOP;
  RAISE NOTICE 'grids: % inserted, % updated', v_inserted, v_updated;
END $$;

SELECT setval('fixed.grid_details_grid_id_seq',
              GREATEST((SELECT COALESCE(max(grid_id), 1) FROM fixed.grid_details),
                       (SELECT last_value FROM fixed.grid_details_grid_id_seq)));

-- ── prove live can run it (the web sends iemp_is_deleted = false) ───────────
DO $$
DECLARE v_sql text; v_rows bigint;
BEGIN
  SELECT replace(grid_sql, '''iemp_is_deleted''', '''false''') INTO v_sql
    FROM fixed.grid_details
   WHERE grid_name = 'MAIN LIST - EMPLOYEES' AND grid_device_type = 'Desktop' AND NOT grid_is_deleted
   ORDER BY grid_id DESC LIMIT 1;
  EXECUTE 'SELECT count(*) FROM (' || v_sql || ') s' INTO v_rows;
  RAISE NOTICE 'MAIN LIST - EMPLOYEES runs: % active employees', v_rows;
END $$;

-- ── what live has now, for the record ───────────────────────────────────────
SELECT d.grid_id, d.grid_name, count(c.*) AS columns
  FROM fixed.grid_details d
  LEFT JOIN fixed.grid_columns c ON c.grid_id = d.grid_id
 WHERE d.grid_name IN (SELECT grid_name FROM pg_temp.sync_grid) AND NOT d.grid_is_deleted
 GROUP BY 1, 2 ORDER BY 1;

COMMIT;
