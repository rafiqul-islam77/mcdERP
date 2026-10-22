const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

// Execute the real server actions without a Next.js server or live credentials.
function loadModule(relativePath, dependencies) {
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    require(name) {
      if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`)
      return dependencies[name]
    },
  })
  return exports
}

const schemas = loadModule('src/lib/validation/schemas.ts', { zod: require('zod') })

function setup(resolveEmployeeId) {
  const tokenCalls = []
  const actions = loadModule('src/app/actions/auth.ts', {
    '@/lib/supabase/server': {},
    '@/lib/supabase/admin': {},
    '@/lib/auth': { resolveEmployeeId },
    '@/lib/tokens': {
      async verifyToken(...args) {
        tokenCalls.push(args)
        return { valid: true, tokenId: 'test-token' }
      },
    },
    '@/lib/audit': { createAuditLog: async () => {} },
    '@/lib/validation/schemas': schemas,
    'next/navigation': {},
  })
  const fields = new FormData()
  fields.set('employeeId', 'MCD-1255')
  fields.set('token', 'ABCD-EFGH')
  fields.set('password', 'test-password')
  return { actions, fields, tokenCalls }
}

for (const [action, purpose] of [
  ['verifyActivationTokenAction', 'activation'],
  ['verifyRecoveryTokenAction', 'recovery'],
]) {
  test(`${purpose}: database failure returns a form error without checking a token`, async () => {
    const { actions, fields, tokenCalls } = setup(async () => {
      throw new Error('Employee lookup unavailable')
    })
    const result = await actions[action](fields)
    assert.equal(result.success, false)
    assert.match(result.error, /temporarily unavailable/)
    assert.equal(result.data, undefined)
    assert.equal(tokenCalls.length, 0)
  })

  test(`${purpose}: unknown employee retains the generic credential error`, async () => {
    const { actions, fields, tokenCalls } = setup(async () => null)
    const result = await actions[action](fields)
    assert.equal(result.success, false)
    assert.equal(result.error, 'Invalid Employee ID or token.')
    assert.equal(tokenCalls.length, 0)
  })

  test(`${purpose}: successful lookup verifies the token for the right purpose`, async () => {
    const { actions, fields, tokenCalls } = setup(async () => ({
      id: 'test-user', email: 'test@example.com', accountState: 'pending_activation',
    }))
    const result = await actions[action](fields)
    assert.equal(result.success, true)
    assert.equal(result.data.userId, 'test-user')
    assert.equal(result.data.tokenId, 'test-token')
    assert.deepEqual(tokenCalls, [['test-user', 'ABCD-EFGH', purpose]])
  })
}

test('login: database failure returns a form error', async () => {
  const { actions, fields } = setup(async () => { throw new Error('Employee lookup unavailable') })
  const result = await actions.loginAction(null, fields)
  assert.equal(result.success, false)
  assert.match(result.error, /temporarily unavailable/)
})
