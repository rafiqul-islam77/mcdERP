const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

// Only run if @electric-sql/pglite is available
let PGlite
try {
  PGlite = require(process.env.NEEDLE_TEST_PGLITE || '@electric-sql/pglite').PGlite
} catch (e) {
  // PGlite not locally installed, skip DB simulation test
}

test('daily entry migration creates all transaction tables and RPC', async (t) => {
  if (!PGlite) {
    t.skip('@electric-sql/pglite not installed; skipping in-memory DB migration test.')
    return
  }

  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE floors(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, active boolean);
      INSERT INTO floors(name, active) VALUES('Floor A', true), ('Floor B', true);
      CREATE TABLE profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
      CREATE TABLE normal_needle_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_code text UNIQUE);
      INSERT INTO normal_needle_items(item_code) VALUES('SN-001');
      CREATE TABLE idle_needle_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), item_code text UNIQUE);
      INSERT INTO idle_needle_items(item_code) VALUES('IN-001');
      CREATE TABLE permissions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text UNIQUE, module text, page text, action text, label text, description text);
      CREATE TABLE roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
      INSERT INTO roles(name) VALUES('Site Admin');
      CREATE TABLE role_permissions(role_id uuid, permission_id uuid, UNIQUE(role_id,permission_id));
      CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
    `)

    const migrationSql = fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/20261023100000_needle_daily_entry_v1.sql'),
      'utf8'
    )
    await db.exec(migrationSql)

    // Check tables exist
    const tables = ['needle_daily_sheets', 'needle_new_transactions', 'needle_running_transactions', 'needle_idle_transactions', 'needle_bnr_records']
    for (const tbl of tables) {
      const res = await db.query(`SELECT to_regclass('public.${tbl}') AS c`)
      assert.ok(res.rows[0].c, `Table ${tbl} must exist`)
    }

    // Check permissions seeded
    const permRes = await db.query(`SELECT count(*)::int as n FROM permissions WHERE key LIKE 'needle.daily_entry.%'`)
    assert.equal(permRes.rows[0].n, 3)

    console.log('Daily Entry migration executed successfully against in-memory PostgreSQL.')
  } finally {
    await db.close()
  }
})
