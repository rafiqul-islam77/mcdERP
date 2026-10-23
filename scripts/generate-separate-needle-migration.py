"""Read both source workbooks and generate the explicit catalog reset migration."""
import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
NAME = "20261023000002_reset_separate_needle_catalogs.sql"


def text(value):
    if value is None:
        return None
    return str(value).strip()


def number(value, scale):
    if value is None:
        return None
    result = Decimal(str(value))
    assert result.is_finite() and result >= 0, f"Invalid price: {value}"
    return result.quantize(Decimal(scale), rounding=ROUND_HALF_UP)


def read_items(filename, prefix):
    book = openpyxl.load_workbook(ROOT / 'Excel' / filename, data_only=True, read_only=True)
    sheet = book['UNIT PRICE']
    header = next(sheet.values)
    expected = ['DRISCRIPTION ITEM', 'ITEM CODE']
    if prefix == 'SN':
        expected.append('ITEM CODE TAC INVENTORY')
    expected += ['NEEDLE TYPE', 'SIZE/DIA', 'BRAND', 'UNIT PRICE (BDT)', 'UNIT PRICE (USD)']
    assert list(header[:len(expected)]) == expected, f"Unexpected headers: {filename}"
    items, codes = [], set()
    for row in sheet.iter_rows(min_row=2, values_only=True):
        if not any(value is not None for value in row):
            continue
        if prefix == 'SN':
            description, code, tac, kind, size, brand, bdt, usd = row[:8]
        else:
            description, code, kind, size, brand, bdt, usd = row[:7]
            tac = None
        assert text(code).startswith(prefix) and code not in codes, f"Wrong/duplicate code: {code}"
        assert all(text(value) for value in [description, code, kind, brand])
        codes.add(code)
        # Excel computes zero for USD when its BDT input is blank. Preserve the
        # missing price instead of presenting that dependent value as a real zero.
        if bdt is None:
            assert usd in (None, 0)
            usd = None
        else:
            divisor = Decimal('122.6') if prefix == 'SN' else Decimal('110')
            assert usd is not None and abs(Decimal(str(usd)) - Decimal(str(bdt)) / divisor) < Decimal('0.00000001')
        items.append(dict(zip(
            ['description_item', 'item_code', 'tac_inventory_item_code', 'needle_type',
             'size_dia', 'brand', 'unit_price_bdt', 'unit_price_usd', 'active'],
            [text(description), text(code), text(tac), text(kind), text(size), text(brand),
             number(bdt, '0.000001'), number(usd, '0.00000001'), True],
        )))
    book.close()
    assert len(items) == (358 if prefix == 'SN' else 41)
    return items


def literal(value):
    if value is None:
        return 'NULL'
    if value is True:
        return 'true'
    if isinstance(value, Decimal):
        return str(value)
    return "'" + value.replace("'", "''") + "'"


def catalog_sql(kind, prefix, source, items):
    master = f'{kind}_needle_items'
    assignments = f'{kind}_needle_floor_assignments'
    return f"""
-- {len(items)} {kind} items from Excel/{source}, UNIT PRICE.
CREATE TABLE public.{master} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description_item TEXT NOT NULL,
  item_code TEXT NOT NULL UNIQUE CHECK (item_code = upper(btrim(item_code)) AND item_code LIKE '{prefix}%'),
  tac_inventory_item_code TEXT,
  needle_type TEXT NOT NULL,
  size_dia TEXT,
  brand TEXT NOT NULL,
  unit_price_bdt NUMERIC(18,6) CHECK (unit_price_bdt >= 0),
  unit_price_usd NUMERIC(18,8) CHECK (unit_price_usd >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_{master}_brand ON public.{master}(brand);
CREATE INDEX idx_{master}_type ON public.{master}(needle_type);
CREATE TRIGGER trg_{master}_updated_at BEFORE UPDATE ON public.{master}
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.{assignments} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  needle_item_id UUID NOT NULL REFERENCES public.{master}(id) ON DELETE CASCADE,
  floor_id UUID NOT NULL REFERENCES public.floors(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (needle_item_id, floor_id)
);
CREATE INDEX idx_{assignments}_floor ON public.{assignments}(floor_id);
CREATE TRIGGER trg_{assignments}_updated_at BEFORE UPDATE ON public.{assignments}
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.{master} ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.{assignments} ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all ON public.{master} FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_read ON public.{master} FOR SELECT TO authenticated USING (true);
CREATE POLICY service_role_all ON public.{assignments} FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY authenticated_read ON public.{assignments} FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.{master}, public.{assignments} TO authenticated;
GRANT ALL ON public.{master}, public.{assignments} TO service_role;

-- One transaction for replacing an item's selections, including an empty set.
-- A wrong-catalog item ID or invalid floor fails before any changes commit.
CREATE OR REPLACE FUNCTION public.set_{kind}_needle_floors(p_item_id UUID, p_floor_ids UUID[])
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM 1 FROM public.{master} WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Needle does not exist in the {kind} catalog.';
  END IF;
  DELETE FROM public.{assignments} WHERE needle_item_id = p_item_id;
  INSERT INTO public.{assignments}(needle_item_id, floor_id)
  SELECT p_item_id, floor_id FROM (SELECT DISTINCT unnest(coalesce(p_floor_ids, '{{}}'::UUID[])) AS floor_id) AS chosen;
END;
$$;
REVOKE ALL ON FUNCTION public.set_{kind}_needle_floors(UUID, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_{kind}_needle_floors(UUID, UUID[]) TO service_role;

INSERT INTO public.{master} (
  description_item, item_code, tac_inventory_item_code, needle_type, size_dia,
  brand, unit_price_bdt, unit_price_usd, active
) VALUES
""" + ',\n'.join('  (' + ', '.join(literal(value) for value in item.values()) + ')' for item in items) + f""";

INSERT INTO public.{assignments}(needle_item_id, floor_id)
SELECT needle.id, floor.id FROM public.{master} AS needle
CROSS JOIN public.floors AS floor WHERE floor.active = true;
"""


def build():
    normal = read_items('unitPrice.xlsx', 'SN')
    idle = read_items('IdleNeedleUnitPrice.xlsx', 'IN')
    sql = """-- Explicit reset requested by the owner: remove existing needle catalogs and
-- assignments, then rebuild separate normal and idle catalogs from Excel.
-- RUN ONCE on the existing ERP database after the foundational migrations.
-- Rerunning intentionally resets all needle data again, including manual edits.
-- Users, roles, floors, floor locations, and audit logs are not deleted.
-- All active floors are selected for each imported needle at seed time.
-- 59 normal prices and 2 sizes are missing in the source and remain NULL.
-- No CASCADE on DROP: unexpected dependencies abort instead of being removed.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.floors') IS NULL THEN
    RAISE EXCEPTION 'Run the ERP foundational migrations first.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.floors WHERE active = true) THEN
    RAISE EXCEPTION 'Create or enable floors before resetting needle catalogs.';
  END IF;
END;
$$;

DROP TABLE IF EXISTS public.needle_floor_assignments;
DROP TABLE IF EXISTS public.needle_items;
DROP TABLE IF EXISTS public.normal_needle_floor_assignments;
DROP TABLE IF EXISTS public.idle_needle_floor_assignments;
DROP TABLE IF EXISTS public.normal_needle_items;
DROP TABLE IF EXISTS public.idle_needle_items;
"""
    permissions = (ROOT / 'supabase/migrations/20241001000008_needle_master.sql').read_text(encoding='utf-8')
    start = permissions.index('INSERT INTO public.permissions')
    end = permissions.index(';', permissions.index('INSERT INTO public.role_permissions', start)) + 1
    sql += '\n' + permissions[start:end] + '\n'
    sql += catalog_sql('normal', 'SN', 'unitPrice.xlsx', normal)
    sql += catalog_sql('idle', 'IN', 'IdleNeedleUnitPrice.xlsx', idle)
    sql += """
NOTIFY pgrst, 'reload schema';

SELECT 'normal' AS catalog, count(*) AS items,
       (SELECT count(*) FROM public.normal_needle_floor_assignments) AS floor_assignments
FROM public.normal_needle_items
UNION ALL
SELECT 'idle', count(*), (SELECT count(*) FROM public.idle_needle_floor_assignments)
FROM public.idle_needle_items;

COMMIT;
"""
    (ROOT / 'supabase' / 'migrations' / NAME).write_text(sql, encoding='utf-8')
    # These source-derived datasets are only for the explicit seed command, never
    # for substituting rows when a page's database table is empty/unavailable.
    for label, items in [('normal', normal), ('idle', idle)]:
        output = [{key: float(value) if isinstance(value, Decimal) else value
                   for key, value in item.items()} for item in items]
        (ROOT / 'src' / 'lib' / 'data' / f'{label}-needle-seed.json').write_text(
            json.dumps(output, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(f'Generated {NAME}: {len(normal)} normal, {len(idle)} idle. Missing values preserved.')


if __name__ == '__main__':
    build()
