const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { PGlite } = require(process.env.NEEDLE_TEST_PGLITE || '@electric-sql/pglite')
const root = path.join(__dirname, '..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const sql = read('supabase/imports/20261027_import_opening_stock.sql')

test('opening import reconciles, reruns without duplicates and rejects conflicts atomically', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;
      CREATE TABLE floors(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text UNIQUE,name text,active boolean DEFAULT true);
      CREATE TABLE profiles(id uuid PRIMARY KEY);
      CREATE TABLE normal_needle_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),item_code text UNIQUE,active boolean DEFAULT true);
      CREATE TABLE idle_needle_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),item_code text UNIQUE,active boolean DEFAULT true);
      CREATE TABLE permissions(id uuid DEFAULT gen_random_uuid(),key text UNIQUE,module text,page text,action text,label text,description text);
      CREATE TABLE roles(id uuid,name text);
      CREATE TABLE role_permissions(role_id uuid,permission_id uuid,UNIQUE(role_id,permission_id));
      CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
    `)
    for (const code of ['A','B','C','D','E','F','G','H','I','J','K','EMB','SMP','TC']) {
      await db.query('INSERT INTO floors(code,name) VALUES($1,$1)', ['FL-' + code])
    }
    for (const kind of ['normal','idle']) {
      await db.query(`INSERT INTO ${kind}_needle_items(item_code) SELECT value->>'item_code' FROM jsonb_array_elements($1::jsonb)`, [read(`src/lib/data/${kind}-needle-seed.json`)])
    }
    await db.exec(read('supabase/migrations/20261023100000_needle_daily_entry_v1.sql'))
    const count = async table => (await db.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n
    const totals = async table => (await db.query(`SELECT count(*)::int n, sum(quantity)::int qty FROM ${table}`)).rows[0]
    await db.exec("UPDATE floors SET active=false WHERE code='FL-TC'")
    await assert.rejects(db.exec(sql), /Missing, inactive or ambiguous floors: FL-TC/)
    await db.exec('ROLLBACK')
    assert.equal(await count('needle_new_transactions'), 0)
    await db.exec("UPDATE floors SET active=true WHERE code='FL-TC'; UPDATE idle_needle_items SET active=false WHERE item_code='IN-003'")
    await assert.rejects(db.exec(sql), /Missing, inactive or ambiguous needle codes/)
    await db.exec('ROLLBACK')
    assert.equal(await count('needle_new_transactions'), 0)
    await db.exec("UPDATE idle_needle_items SET active=true WHERE item_code='IN-003'")

    // Earlier stock on a category processed last must roll back the earlier inserts.
    await db.exec(`INSERT INTO needle_idle_transactions(transaction_date,floor_id,needle_item_id,transaction_type,quantity,notes)
      SELECT DATE '2026-10-26', f.id,n.id,'OPENING',99,'existing' FROM floors f,idle_needle_items n WHERE f.code='FL-A' AND n.item_code='IN-003'`)
    await assert.rejects(db.exec(sql), /Existing earlier movements/)
    await db.exec('ROLLBACK')
    assert.equal(await count('needle_new_transactions'), 0)
    assert.equal(await count('needle_running_transactions'), 0)
    assert.equal(await count('needle_idle_transactions'), 1)
    await db.exec('DELETE FROM needle_idle_transactions')

    // An ordinary receipt on the import date must remain separate from opening stock.
    await db.exec(`INSERT INTO needle_new_transactions(transaction_date,floor_id,needle_item_id,transaction_type,quantity,notes)
      SELECT DATE '2026-10-27',f.id,n.id,'RECEIVE',5,'keep receipt' FROM floors f,normal_needle_items n WHERE f.code='FL-A' AND n.item_code='SN-013'`)
    await db.exec(sql)
    for (const [kind,n,qty] of [['new',185,7404],['running',351,24969],['idle',62,856]]) {
      assert.deepEqual(await totals(`needle_${kind}_transactions`), {n,qty})
    }
    const before = await db.query(`SELECT id,quantity,created_at,updated_at FROM needle_new_transactions ORDER BY id`)
    await db.exec(sql)
    assert.deepEqual((await db.query('SELECT id,quantity,created_at,updated_at FROM needle_new_transactions ORDER BY id')).rows,before.rows)
    assert.deepEqual(await totals('needle_running_transactions'), {n:351,qty:24969})
    assert.deepEqual(await totals('needle_idle_transactions'), {n:62,qty:856})
    assert.equal(await count('normal_needle_items'),358)
    assert.equal(await count('idle_needle_items'),41)
    assert.equal(await count('floors'),14)
    assert.equal(await count('needle_bnr_records'),0)
    assert.equal(await count('needle_daily_sheets'),0)
    const first = (await db.query(`SELECT t.* FROM needle_new_transactions t JOIN floors f ON f.id=t.floor_id JOIN normal_needle_items n ON n.id=t.needle_item_id
      WHERE f.code='FL-A' AND n.item_code='SN-013' AND t.transaction_type='OPENING'`)).rows[0]
    assert.equal(Number(first.quantity),6)
    assert.equal(new Date(first.transaction_date).toISOString().slice(0,10),'2026-10-27')
    assert.match(first.notes,/RUNNING\+NEW!row 2/)
    await db.query('UPDATE needle_new_transactions SET quantity=7 WHERE id=$1',[first.id])
    await assert.rejects(db.exec(sql), /Existing imported NEW record differs/)
    await db.exec('ROLLBACK')
    await db.query('UPDATE needle_new_transactions SET quantity=6 WHERE id=$1',[first.id])
    await db.exec(`INSERT INTO needle_new_transactions(transaction_date,floor_id,needle_item_id,transaction_type,quantity)
      SELECT transaction_date,floor_id,needle_item_id,'OPENING',3 FROM needle_new_transactions WHERE notes='keep receipt'`)
    await assert.rejects(db.exec(sql), /another opening balance/)
    await db.exec('ROLLBACK')
    console.log('Verified 597 opening rows / 33224 PCS, correct categories/date, repeat safety, conflict rollback and preserved receipt.')
  } finally { await db.close() }
})
