const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
let PGlite
try {
  PGlite = require(process.env.NEEDLE_TEST_PGLITE || '@electric-sql/pglite').PGlite
} catch {
  // @electric-sql/pglite is optional test dependency
}
const sql = fs.readFileSync(path.join(__dirname, '../supabase/migrations/20261023000002_reset_separate_needle_catalogs.sql'), 'utf8')

test('reset, workbook seeds, separate catalogs, floor RPCs and access controls', { skip: !PGlite }, async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE floors(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), active boolean);
      INSERT INTO floors(active) SELECT true FROM generate_series(1,14);
      INSERT INTO floors(active) VALUES(false);
      CREATE TABLE permissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text UNIQUE, module text, page text, action text, label text, description text);
      CREATE TABLE roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
      INSERT INTO roles(name) VALUES('Site Admin');
      CREATE TABLE role_permissions(role_id uuid, permission_id uuid, UNIQUE(role_id,permission_id));
      CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
      CREATE TABLE needle_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_code text);
      INSERT INTO needle_items(item_code) VALUES('SN-OLD'),('IN-OLD');
      CREATE TABLE needle_floor_assignments(id uuid, needle_item_id uuid REFERENCES needle_items(id));
    `)
    // Preflight failure must leave the old catalog intact.
    await db.exec('UPDATE floors SET active=false')
    await assert.rejects(db.exec(sql), /Create or enable floors/)
    await db.exec('ROLLBACK')
    assert.equal((await db.query('SELECT count(*)::int AS n FROM needle_items')).rows[0].n, 2)
    await db.exec('UPDATE floors SET active=true WHERE id IN (SELECT id FROM floors LIMIT 14)')
    await db.exec(sql)
    assert.equal((await db.query("SELECT to_regclass('needle_items') AS old")).rows[0].old, null)
    for (const [kind, count, prefix] of [['normal',358,'SN'], ['idle',41,'IN']]) {
      const rows = (await db.query(`SELECT description_item,item_code,tac_inventory_item_code,needle_type,size_dia,brand,unit_price_bdt,unit_price_usd,active FROM ${kind}_needle_items ORDER BY item_code`)).rows
      const source = JSON.parse(fs.readFileSync(path.join(__dirname, `../src/lib/data/${kind}-needle-seed.json`), 'utf8')).sort((a,b) => a.item_code.localeCompare(b.item_code))
      for (const row of rows) {
        for (const price of ['unit_price_bdt','unit_price_usd']) if (row[price] !== null) row[price] = Number(row[price])
      }
      assert.deepEqual(rows, source, 'every seeded field agrees with the workbook-derived source')
      assert.equal(rows.length, count)
      assert.ok(rows.every(row => row.item_code.startsWith(prefix)))
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${kind}_needle_floor_assignments`)).rows[0].n, count*14)
      assert.equal((await db.query(`SELECT count(*)::int AS n FROM ${kind}_needle_floor_assignments a JOIN floors f ON f.id=a.floor_id WHERE NOT f.active`)).rows[0].n, 0)
      await assert.rejects(db.exec(`UPDATE ${kind}_needle_items SET item_code='${prefix === 'SN' ? 'IN' : 'SN'}-WRONG' WHERE item_code='${prefix}-001'`), /check constraint/)
    }
    assert.equal((await db.query('SELECT count(*)::int AS n FROM normal_needle_items WHERE unit_price_bdt IS NULL AND unit_price_usd IS NULL')).rows[0].n,59)
    assert.equal((await db.query('SELECT count(*)::int AS n FROM normal_needle_items WHERE size_dia IS NULL')).rows[0].n,2)
    const normal = (await db.query('SELECT id FROM normal_needle_items LIMIT 1')).rows[0].id
    const idle = (await db.query('SELECT id FROM idle_needle_items LIMIT 1')).rows[0].id
    const floor = (await db.query('SELECT id FROM floors WHERE active LIMIT 1')).rows[0].id
    const countLinks = async () => (await db.query('SELECT count(*)::int AS n FROM normal_needle_floor_assignments WHERE needle_item_id=$1',[normal])).rows[0].n
    await db.exec('SET ROLE service_role')
    await db.query('SELECT set_normal_needle_floors($1,$2)', [normal, [floor,floor]])
    assert.equal(await countLinks(),1)
    await assert.rejects(db.query('SELECT set_normal_needle_floors($1,$2)', [normal,['00000000-0000-0000-0000-000000000000']]), /foreign key/)
    assert.equal(await countLinks(),1, 'failed replacement rolls back deletion')
    await assert.rejects(db.query('SELECT set_normal_needle_floors($1,$2)', [idle,[]]), /does not exist in the normal catalog/)
    await db.query('SELECT set_normal_needle_floors($1,$2)', [normal,[]])
    assert.equal(await countLinks(),0)
    await db.exec('RESET ROLE; SET ROLE authenticated')
    assert.equal((await db.query('SELECT count(*)::int AS n FROM idle_needle_items')).rows[0].n,41)
    await assert.rejects(db.exec('DELETE FROM idle_needle_items'), /permission denied/)
    await assert.rejects(db.query('SELECT set_idle_needle_floors($1,$2)', [idle,[]]), /permission denied/)
    await db.exec('RESET ROLE; SET ROLE anon')
    await assert.rejects(db.exec('SELECT * FROM normal_needle_items'), /permission denied/)
    await db.exec('RESET ROLE')
    await db.query('DELETE FROM normal_needle_items WHERE id=$1',[normal])
    assert.equal((await db.query('SELECT count(*)::int AS n FROM idle_needle_items')).rows[0].n,41)
    assert.equal((await db.query('SELECT count(*)::int AS n FROM idle_needle_floor_assignments')).rows[0].n,574)
    // A deliberate second reset recreates exactly the workbook catalogs and selections.
    await db.exec(sql)
    assert.equal((await db.query('SELECT count(*)::int AS n FROM normal_needle_floor_assignments')).rows[0].n,5012)
    console.log('Validated 358 normal + 41 idle records, all 5586 floor selections, isolation and rollback.')
  } finally { await db.close() }
})
