"""Read the supplied stock workbook and generate a standalone PostgreSQL import."""
import hashlib
import json
import re
import uuid
from collections import Counter
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path('C:/Users/tazzi/Downloads/STOCK -27-10-2026.xlsx')
OUTPUT = ROOT / 'supabase/imports/20261027_import_opening_stock.sql'


def floor_code(label):
    label = label.strip().upper()
    if re.match(r'^[A-K]-FLOOR', label):
        return 'FL-' + label[0]
    for name, code in [('EMB-', 'FL-EMB'), ('SAMPLE-', 'FL-SMP'), ('TRAINING CENTRE', 'FL-TC')]:
        if label.startswith(name):
            return code
    raise ValueError(f'Unmapped floor: {label}')


def extract():
    book = openpyxl.load_workbook(SOURCE, data_only=True, read_only=True)
    records, keys, subtotal_count = [], set(), 0
    for sheet in book:
        assert sheet.title in ('RUNNING+NEW', 'IDLE')
        normal = sheet.title == 'RUNNING+NEW'
        expected = ['FLOOR NAME & LOCATION', 'CATEGORY', 'ITEM CODE', 'NEEDLE TYPE', 'SIZE/DIA', 'BRAND', 'UNIT', 'STOCK'] if normal else ['FLOOR NAME & LOCATION', 'ITEM CODE', 'NEEDLE TYPE', 'SIZE/DIA', 'BRAND', 'TOTAL STOCK']
        assert list(next(sheet.values)) == expected
        subtotals = Counter()
        for rownum, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), 2):
            if not any(value is not None for value in row):
                continue
            label, code, quantity = row[0], row[2 if normal else 1], row[-1]
            if code is None:
                if label == 'Grand Total':
                    assert quantity == sum(subtotals.values()), (sheet.title, rownum, 'grand total')
                else:
                    category = row[1].removesuffix(' Total') if normal else 'IDLE'
                    assert (row[1] if normal else label).endswith(' Total')
                    assert quantity == subtotals[(floor_code(label), category)], (sheet.title, rownum, 'subtotal')
                    subtotal_count += 1
                continue
            category = row[1] if normal else 'IDLE'
            assert category in ('NEW', 'RUNNING', 'IDLE')
            assert re.fullmatch(r'SN-\d+' if normal else r'IN-\d+', code)
            assert isinstance(quantity, (int, float)) and quantity > 0 and quantity == int(quantity)
            if normal:
                assert row[6] == 'PCS'
            floor = floor_code(label)
            key = (category, floor, code)
            assert key not in keys, ('duplicate', sheet.title, rownum, key)
            keys.add(key)
            subtotals[(floor, category)] += quantity
            identifier = str(uuid.uuid5(uuid.NAMESPACE_URL, 'mcderp/opening/2026-10-27/' + '/'.join(key)))
            records.append((category, floor, code, int(quantity), sheet.title, rownum, identifier))
    book.close()
    assert subtotal_count == 41
    assert Counter(row[0] for row in records) == {'NEW': 184, 'RUNNING': 351, 'IDLE': 62}
    assert sum(row[3] for row in records) == 33224
    for label, prefix in [('normal', 'SN'), ('idle', 'IN')]:
        codes = {row['item_code'] for row in json.loads((ROOT / f'src/lib/data/{label}-needle-seed.json').read_text(encoding='utf-8'))}
        assert all(row[2] in codes for row in records if row[2].startswith(prefix))
    return records


def literal(value):
    return str(value) if isinstance(value, int) else "'" + value.replace("'", "''") + "'"


def build():
    records = extract()
    sql = f"""-- Opening stock dated 27 October 2026. Run the ENTIRE file in Supabase SQL Editor.
-- Source: {SOURCE.name}; SHA256: {hashlib.sha256(SOURCE.read_bytes()).hexdigest()}
-- Detail only: subtotal/grand-total rows are excluded and reconciled.
-- NEW: 184 entries / 7399 PCS; RUNNING: 351 / 24969 PCS; IDLE: 62 / 856 PCS.
-- Total: 597 entries / 33224 PCS. No IDLE EMB data exists in the workbook.
-- Requires the separate needle catalogs and daily-entry transaction tables.
-- Inserts OPENING transactions on 2026-10-27 using floor codes and item codes.
-- Existing transactions, BNR, sheets, catalog data and floor selections are retained.
-- No invented employee attribution: created_by/updated_by and daily_sheet_id stay NULL.
-- Repeat-safe: deterministic IDs skip identical imports; changed records abort.
-- Existing earlier movements or other same-date opening records for these items
-- abort the entire import for review rather than silently double-counting stock.
-- Stop concurrent entry/sync while importing; refresh online stock caches afterwards.
-- UI note: current Daily Entry code ignores same-day OPENING in the 27-Oct display;
-- it includes this stock as Previous on 28-Oct. The stored date remains 27-Oct.

BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE public.floors, public.normal_needle_items, public.idle_needle_items IN SHARE MODE;
LOCK TABLE public.needle_new_transactions, public.needle_running_transactions,
           public.needle_idle_transactions IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE opening_stock_source (
  category TEXT NOT NULL CHECK (category IN ('NEW', 'RUNNING', 'IDLE')),
  floor_code TEXT NOT NULL,
  item_code TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  source_sheet TEXT NOT NULL,
  source_row INTEGER NOT NULL,
  transaction_id UUID NOT NULL UNIQUE,
  PRIMARY KEY (category, floor_code, item_code)
) ON COMMIT DROP;

INSERT INTO opening_stock_source VALUES
"""
    sql += ',\n'.join('  (' + ', '.join(literal(v) for v in row) + ')' for row in records) + ';\n'
    sql += """
-- Validate every floor/item before touching the ledgers. Codes must resolve once.
DO $$
DECLARE missing TEXT;
BEGIN
  SELECT string_agg(s.floor_code, ', ' ORDER BY s.floor_code) INTO missing
  FROM (SELECT DISTINCT floor_code FROM opening_stock_source) s
  WHERE (SELECT count(*) FROM public.floors f WHERE f.code = s.floor_code AND f.active) <> 1;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Missing, inactive or ambiguous floors: %', missing; END IF;

  SELECT string_agg(s.category || ':' || s.item_code, ', ' ORDER BY s.category, s.item_code) INTO missing
  FROM (SELECT DISTINCT category, item_code FROM opening_stock_source) s
  WHERE (s.category IN ('NEW','RUNNING') AND
    (SELECT count(*) FROM public.normal_needle_items n WHERE n.item_code = s.item_code AND n.active) <> 1)
    OR (s.category = 'IDLE' AND
    (SELECT count(*) FROM public.idle_needle_items n WHERE n.item_code = s.item_code AND n.active) <> 1);
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Missing, inactive or ambiguous needle codes: %', missing; END IF;
END $$;

CREATE TEMP TABLE opening_stock_resolved ON COMMIT DROP AS
SELECT s.*, f.id AS floor_id, n.id AS needle_item_id,
       'Opening stock import 2026-10-27; STOCK -27-10-2026.xlsx; ' || s.source_sheet || '!row ' || s.source_row AS import_notes
FROM opening_stock_source s
JOIN public.floors f ON f.code = s.floor_code AND f.active
JOIN (
  SELECT id, item_code, 'NORMAL' AS catalog FROM public.normal_needle_items
  UNION ALL SELECT id, item_code, 'IDLE' FROM public.idle_needle_items
) n ON n.item_code = s.item_code
   AND n.catalog = CASE WHEN s.category = 'IDLE' THEN 'IDLE' ELSE 'NORMAL' END;

DO $$
DECLARE category_name TEXT; target_table TEXT; conflict TEXT; inserted_count INTEGER;
BEGIN
  IF (SELECT count(*) FROM opening_stock_resolved) <> 597 THEN
    RAISE EXCEPTION 'Expected 597 fully resolved source entries.';
  END IF;
  FOREACH category_name IN ARRAY ARRAY['NEW', 'RUNNING', 'IDLE'] LOOP
    target_table := 'needle_' || lower(category_name) || '_transactions';

    EXECUTE format($q$
      SELECT s.floor_code || '/' || s.item_code
      FROM opening_stock_resolved s JOIN public.%I t ON t.id = s.transaction_id
      WHERE s.category = $1 AND
        (t.transaction_date, t.floor_id, t.needle_item_id, t.transaction_type, t.quantity, t.notes)
        IS DISTINCT FROM
        (DATE '2026-10-27', s.floor_id, s.needle_item_id, 'OPENING'::text, s.quantity, s.import_notes)
      LIMIT 1$q$, target_table) INTO conflict USING category_name;
    IF conflict IS NOT NULL THEN
      RAISE EXCEPTION 'Existing imported % record differs for %. No changes applied.', category_name, conflict;
    END IF;

    EXECUTE format($q$
      SELECT s.floor_code || '/' || s.item_code
      FROM opening_stock_resolved s JOIN public.%I t
        ON t.floor_id = s.floor_id AND t.needle_item_id = s.needle_item_id
      WHERE s.category = $1 AND (t.transaction_date < DATE '2026-10-27'
        OR (t.transaction_date = DATE '2026-10-27' AND t.transaction_type = 'OPENING' AND t.id <> s.transaction_id))
      LIMIT 1$q$, target_table) INTO conflict USING category_name;
    IF conflict IS NOT NULL THEN
      RAISE EXCEPTION 'Existing earlier movements or another opening balance for % %. Review before importing; no changes applied.', category_name, conflict;
    END IF;

    EXECUTE format($q$
      INSERT INTO public.%I
        (id, transaction_date, floor_id, needle_item_id, transaction_type, quantity, notes)
      SELECT s.transaction_id, DATE '2026-10-27', s.floor_id, s.needle_item_id, 'OPENING', s.quantity, s.import_notes
      FROM opening_stock_resolved s
      WHERE s.category = $1 AND NOT EXISTS (SELECT 1 FROM public.%I t WHERE t.id = s.transaction_id)
    $q$, target_table, target_table) USING category_name;
    GET DIAGNOSTICS inserted_count = ROW_COUNT;
    RAISE NOTICE '%: inserted % opening entries (identical existing entries skipped).', category_name, inserted_count;
  END LOOP;
END $$;

-- Verification: actual imported balances, by floor and category.
SELECT s.category, s.floor_code, count(*) AS opening_entries,
       sum(t.quantity) AS opening_quantity_pcs
FROM opening_stock_resolved s
JOIN (
  SELECT 'NEW' AS category, id, quantity FROM public.needle_new_transactions
  UNION ALL SELECT 'RUNNING', id, quantity FROM public.needle_running_transactions
  UNION ALL SELECT 'IDLE', id, quantity FROM public.needle_idle_transactions
) t ON t.category = s.category AND t.id = s.transaction_id
GROUP BY s.category, s.floor_code ORDER BY s.category, s.floor_code;

COMMIT;
"""
    OUTPUT.write_text(sql, encoding='utf-8')
    print(f'Created {OUTPUT}: {len(records)} opening entries, 33224 PCS; all 41 subtotals reconciled.')


if __name__ == '__main__':
    build()
