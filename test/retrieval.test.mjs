import { retrieve } from '../retrieval.mjs'

const cases = [
  ['Can the session sell the manse without a congregational vote?', ['G-4.0206', 'G-1.0504']],
  ['How much notice is required to call a congregational meeting?', ['G-1.0502', 'G-1.0503']],
  ['Who approves terms of call for an installed pastor?', ['G-2.0804', 'G-3.0307']],
  ['What is the quorum for a session meeting?', ['G-3.0203']],
  ['Can a ruling elder serve communion?', ['G-3.0301', 'W-3.0410']],
  ['How does a pastor resign? dissolution of pastoral relationship', ['G-2.0901', 'G-2.0902']],
  ['Someone filed an accusation against our pastor, what happens next?', ['D-7.0501', 'D-7.0601']],
  ['What are the constitutional questions at ordination?', ['W-4.0404']],
  ['How are commissioned ruling elders authorized?', ['G-2.1001', 'G-2.1002']],
  ['Can presbytery remove an elder from session with an administrative commission?', ['G-3.0109']],
]

let pass = 0
for (const [q, expected] of cases) {
  const ids = retrieve(q).map(s => s.id)
  const hit = expected.some(e => ids.includes(e))
  pass += hit ? 1 : 0
  console.log(hit ? 'PASS' : 'MISS', q, '\n     got', ids.slice(0, 8).join(' '), '\n     want one of', expected.join(' '))
}
console.log(`\n${pass}/${cases.length} queries surfaced an expected section`)
process.exit(pass === cases.length ? 0 : 1)
