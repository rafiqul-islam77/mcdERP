const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')
function moduleFrom(file, deps = {}) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, console: { warn() {}, error() {} }, require: name => deps[name] || require(name) })
  return exports
}
function setup({cap=100,missing=false,empty=false,fail=false,denied=false}={}) {
  const calls=[]
  const floors=Array.from({length:14},(_,i)=>({id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`,active:true}))
  const tables={floors}
  for(const [kind,prefix,count] of [['normal','SN',151],['idle','IN',41]]) {
    tables[`${kind}_needle_items`]=empty?[]:Array.from({length:count},(_,i)=>({id:`${kind}-${i}`,item_code:`${prefix}-${String(i).padStart(3,'0')}`,description_item:'Needle',brand:kind,needle_type:kind,size_dia:null,unit_price_bdt:null,unit_price_usd:null,active:true}))
    tables[`${kind}_needle_floor_assignments`]=tables[`${kind}_needle_items`].flatMap(item=>floors.map(floor=>({needle_item_id:item.id,floor_id:floor.id})))
    tables[`${kind}_needle_floor_assignments`].pop()
  }
  const admin={
    from(table) {
      calls.push(table)
      assert.ok(table in tables, `Unexpected/shared table ${table}`)
      let start=0,end=Infinity,single=false,op='read',payload,filters=[]
      const q={select(){return q},eq(k,v){filters.push([k,v]);return q},order(){return q},range(a,b){start=a;end=b;return q},
        maybeSingle(){single=true;return q},single(){single=true;return q},
        insert(p){op='insert';payload=p;return q},update(p){op='update';payload=p;return q},delete(){op='delete';return q},
        upsert(p,options){assert.ok(options.onConflict.includes('needle_item_id,floor_id'));assert.ok(!('needle_group' in p));op='insert';payload=p;return q},
        then(resolve,reject){
          if(missing && table!=='floors') return Promise.resolve({data:null,error:{code:'PGRST205'}}).then(resolve,reject)
          if(fail && table!=='floors' && (op!=='read'||start>0)) return Promise.resolve({data:null,error:{message:'Database unavailable'}}).then(resolve,reject)
          let rows=tables[table].filter(row=>filters.every(([k,v])=>row[k]===v))
          if(op==='insert'){rows=[{id:'created',...payload}];tables[table].push(...rows)}
          if(op==='update') rows.forEach(row=>Object.assign(row,payload))
          if(op==='delete') tables[table]=tables[table].filter(row=>!rows.includes(row))
          return Promise.resolve({data:single?(rows[0]||null):rows.slice(start,Math.min(end+1,start+cap)),error:null}).then(resolve,reject)
        },
      };return q
    },
    async rpc(name,payload){calls.push(name);return {data:null,error:fail?{message:'Floor failed'}:null}},
  }
  const actions=moduleFrom('src/app/actions/needle.ts',{
    '@/lib/supabase/admin':{getAdminClient:()=>admin},
    '@/lib/auth':{requireActiveAccount:async()=>({isSiteAdmin:!denied,profile:{id:'actor'}})},
    '@/lib/permissions':{hasPermission:async()=>false},
    '@/lib/audit':{createAuditLog:async()=>{}},
    '@/lib/validation/schemas':moduleFrom('src/lib/validation/schemas.ts'),
    '@/lib/needles/catalogs':moduleFrom('src/lib/needles/catalogs.ts'),
    'next/cache':{revalidatePath(){}},
  })
  return {actions,calls,tables,floors}
}
for(const [group,kind,prefix,count] of [['needle','normal','SN',151],['ideal_needle','idle','IN',41]]) {
  test(`${group}: paginated reads isolate records, filters, assignments and missing prices`,async()=>{
    const {actions,calls}=setup({cap:37})
    const result=await actions.getNeedleMasterDataAction({needleGroup:group})
    assert.equal(result.success,true)
    assert.equal(result.data.items.length,count)
    assert.equal(result.data.items.at(-1).floor_ids.length,13)
    assert.ok(result.data.items.slice(0,-1).every(i=>i.floor_ids.length===14))
    assert.ok(result.data.items.every(i=>i.item_code.startsWith(prefix)&&i.unit_price_bdt===null&&i.size_dia===''))
    assert.equal(Array.from(result.data.distinctBrands).join(','),kind)
    assert.ok(calls.every(t=>t==='floors'||t.startsWith(kind+'_')))
  })
  test(`${group}: empty or missing tables never substitute the other workbook`,async()=>{
    for(const options of [{empty:true},{missing:true}]){
      const {actions}=setup(options)
      const result=await actions.getNeedleMasterDataAction({needleGroup:group})
      assert.equal(result.success,true)
      assert.equal(result.data.items.length,0)
      assert.equal(result.data.dbReady,!options.missing)
    }
  })
  test(`${group}: mutation routes and code validation`,async()=>{
    const {actions,calls,tables,floors}=setup()
    const base={item_id:kind+'-0',needle_group:group}
    const result=await actions.inlineUpdateNeedleCellAction({...base,field:'brand',value:'EDITED'})
    assert.equal(result.success,true)
    assert.equal(tables[`${kind}_needle_items`][0].brand,'EDITED')
    assert.equal((await actions.inlineUpdateNeedleCellAction({...base,field:'item_code',value:prefix==='SN'?'IN-900':'SN-900'})).success,false)
    assert.equal((await actions.inlineUpdateNeedleCellAction({...base,field:'unit_price_bdt',value:-1})).success,false)
    assert.equal((await actions.inlineUpdateNeedleCellAction({...base,field:'unit_price_bdt',value:''})).success,true)
    assert.equal((await actions.toggleNeedleFloorAction({...base,floor_id:floors[0].id,checked:false})).success,true)
    assert.equal((await actions.toggleNeedleFloorAction({...base,floor_id:floors[0].id,checked:true})).success,true)
    assert.equal((await actions.bulkSetNeedleFloorsAction({...base,floor_ids:[]})).success,true)
    assert.ok(calls.includes(`set_${kind}_needle_floors`))
    const payload={description_item:'Needle',item_code:prefix+'-NEW',needle_type:'DBX',size_dia:'12',brand:'ORGAN',unit_price_bdt:null,unit_price_usd:null,floor_ids:[floors[0].id],needle_group:group}
    assert.equal((await actions.createNeedleAction(payload)).success,true)
    assert.equal((await actions.createNeedleAction({...payload,item_code:prefix==='SN'?'IN-NEW':'SN-NEW'})).success,false)
    const other=kind==='normal'?'idle':'normal'
    assert.equal((await actions.deleteNeedleAction({...base,item_id:other+'-0'})).success,false)
    assert.equal(tables[other+'_needle_items'].length,kind==='normal'?41:151)
    assert.equal((await actions.deleteNeedleAction(base)).success,true)
    assert.ok(calls.every(t=>t.startsWith(kind+'_')||t===`set_${kind}_needle_floors`))
  })
  test(`${group}: read and write failures do not report success`,async()=>{
    const {actions,floors}=setup({fail:true})
    const base={item_id:kind+'-0',needle_group:group}
    assert.equal((await actions.getNeedleMasterDataAction({needleGroup:group})).success,false)
    assert.equal((await actions.toggleNeedleFloorAction({...base,floor_id:floors[0].id,checked:true})).success,false)
    assert.equal((await actions.toggleNeedleFloorAction({...base,floor_id:floors[0].id,checked:false})).success,false)
    assert.equal((await actions.bulkSetNeedleFloorsAction({...base,floor_ids:[]})).success,false)
    assert.equal((await actions.inlineUpdateNeedleCellAction({...base,field:'brand',value:'x'})).success,false)
    assert.equal((await actions.deleteNeedleAction(base)).success,false)
  })
}
test('permissions are checked before any catalog reads or writes',async()=>{
  const {actions,calls}=setup({denied:true})
  assert.equal((await actions.getNeedleMasterDataAction({needleGroup:'needle'})).success,false)
  assert.equal((await actions.deleteNeedleAction({needle_group:'ideal_needle',item_id:'idle-0'})).success,false)
  assert.equal(calls.length,0)
})
