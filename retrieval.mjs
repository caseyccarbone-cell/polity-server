// Lightweight BM25 retrieval over Book of Order sections. No dependencies.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
export const SECTIONS = JSON.parse(readFileSync(join(here, 'data', 'book_of_order.json'), 'utf8'))
const BY_ID = new Map(SECTIONS.map(s => [s.id, s]))

// Vocabulary the way people actually talk about polity → words the text uses.
const SYNONYMS = {
  com: ['commission', 'ministry', 'presbytery'],
  copm: ['preparation', 'ministry', 'candidate', 'inquirer'],
  cpm: ['preparation', 'ministry', 'candidate', 'inquirer'],
  pnc: ['pastor', 'nominating', 'committee', 'call'],
  pjc: ['permanent', 'judicial', 'commission'],
  cre: ['commissioned', 'ruling', 'elder', 'pastoral', 'service'],
  clp: ['commissioned', 'ruling', 'elder', 'pastoral', 'service'],
  pastor: ['minister', 'word', 'sacrament', 'installed'],
  interim: ['temporary', 'pastoral', 'relationship'],
  'stated supply': ['temporary', 'pastoral', 'relationship'],
  salary: ['terms', 'call', 'compensation'],
  compensation: ['terms', 'call'],
  'terms of call': ['terms', 'call', 'compensation'],
  dissolve: ['dissolution', 'pastoral', 'relationship'],
  dissolution: ['dissolve', 'pastoral', 'relationship'],
  quorum: ['meeting', 'quorum'],
  property: ['property', 'trust', 'encumber', 'sell', 'lease'],
  sell: ['sell', 'property', 'encumber'],
  mortgage: ['encumber', 'property'],
  vote: ['meeting', 'vote', 'majority'],
  'session minutes': ['minutes', 'records', 'session', 'review'],
  minutes: ['minutes', 'records', 'review'],
  budget: ['budget', 'finances', 'treasurer', 'review'],
  audit: ['financial', 'review', 'finances'],
  resign: ['dissolution', 'resignation', 'pastoral'],
  fire: ['dissolution', 'pastoral', 'relationship'],
  discipline: ['discipline', 'offense', 'charge', 'investigating'],
  complaint: ['remedial', 'complaint', 'irregularity', 'delinquency'],
  accusation: ['allegation', 'investigating', 'committee', 'disciplinary'],
  deacon: ['deacon', 'deacons', 'board'],
  elder: ['ruling', 'elder'],
  'teaching elder': ['minister', 'word', 'sacrament'],
  'minister member': ['minister', 'word', 'sacrament', 'presbytery', 'membership'],
  communion: ['lord', 'supper', 'sacrament', 'administered', 'authorized', 'responsibility'],
  eucharist: ['lord', 'supper', 'sacrament', 'administered', 'authorized', 'responsibility'],
  'serve communion': ['lord', 'supper', 'administered', 'authorized', 'responsibility'],
  'home communion': ['lord', 'supper', 'homebound', 'extended', 'serving'],
  baptism: ['baptism', 'sacrament'],
  wedding: ['marriage'],
  marry: ['marriage'],
  funeral: ['death', 'resurrection', 'service'],
  ordain: ['ordination', 'ordained'],
  install: ['installation', 'installed'],
  moderator: ['moderator', 'moderate'],
  clerk: ['clerk', 'stated', 'minutes'],
  'congregational meeting': ['congregation', 'meeting', 'called', 'business'],
  nominating: ['nominating', 'committee', 'election'],
  'validated ministry': ['validated', 'ministry', 'minister'],
  'member at large': ['member', 'large', 'minister'],
  'honorably retired': ['retired', 'honorably', 'minister'],
  'administrative commission': ['administrative', 'commission', 'council'],
  closure: ['dissolve', 'congregation', 'property', 'dismiss'],
  close: ['dissolve', 'congregation'],
  dismiss: ['dismiss', 'dismissal', 'congregation', 'presbytery'],
  leave: ['dismiss', 'dismissal', 'congregation'],
  'per capita': ['per', 'capita', 'apportionment'],
  '1001': ['worshiping', 'communities', 'corporate', 'witness'],
  'new worshiping community': ['worshiping', 'communities', 'corporate', 'witness'],
  'union church': ['union', 'congregation', 'federated'],
  'federated': ['union', 'congregation'],
  'manual of operations': ['manual', 'administrative', 'operations'],
  'sexual misconduct': ['sexual', 'misconduct', 'policy', 'harassment'],
  'child protection': ['child', 'youth', 'vulnerable', 'adult', 'protection', 'policy'],
  background: ['child', 'youth', 'vulnerable', 'adult', 'protection', 'policy'],
  robert: ['parliamentary', 'procedure', 'rules', 'order'],
  roberts: ['parliamentary', 'procedure', 'rules', 'order'],
  'parliamentary': ['parliamentary', 'procedure', 'rules'],
  'inquirer': ['inquirer', 'preparation', 'ministry'],
  'candidate': ['candidate', 'preparation', 'ministry'],
  'exam': ['examination', 'ordination', 'standard'],
  'ordination exams': ['examination', 'standard', 'ordination'],
  'renounce': ['renunciation', 'jurisdiction'],
  'rolls': ['rolls', 'membership', 'register'],
  'inactive': ['rolls', 'membership', 'removed', 'delete'],
  'transfer': ['membership', 'transfer', 'certificate', 'dismiss'],
  'trustees': ['corporation', 'trustees', 'property'],
  'incorporate': ['corporation', 'trustees'],
  'bylaws': ['manual', 'operations', 'administrative', 'parliamentary'],
  'standing rules': ['manual', 'operations', 'administrative'],
  'confidential': ['confidence', 'confidentiality', 'mandatory', 'reporting'],
  'mandatory reporter': ['mandatory', 'reporting', 'abuse', 'confidence'],
  'open meetings': ['open', 'meetings', 'session'],
  'executive session': ['open', 'meetings', 'excused'],
  'ecumenical': ['ecumenical', 'full', 'communion', 'formula', 'agreement'],
  'elca': ['formula', 'agreement', 'full', 'communion', 'ecumenical'],
  'lutheran': ['formula', 'agreement', 'full', 'communion', 'ecumenical'],
}

const STOP = new Set('a an the of to in and or for on with by is are be as at from that this it its into shall may can does do what how when who which whether about if any all one than then there their they them we our you your i me my can could would should'.split(' '))

function tokenize(text) {
  return text.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\-\.]+/g, ' ').split(/\s+/)
    .map(t => t.replace(/^[\.\-]+|[\.\-]+$/g, '')).filter(t => t && !STOP.has(t))
}
function stem(t) {
  return t.replace(/(ations?|ively|ingly|ments?|nesses?|ities|ies|ing|ed|ers?|es|s|ly)$/, m => (t.length - m.length >= 4 ? '' : m))
}

// Build index
const docs = SECTIONS.map(s => {
  const tokens = [...tokenize(s.title), ...tokenize(s.title), ...tokenize(s.title), ...tokenize(s.text)].map(stem)
  const tf = new Map()
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1)
  return { id: s.id, len: tokens.length, tf }
})
const N = docs.length
const avgLen = docs.reduce((a, d) => a + d.len, 0) / N
const df = new Map()
for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1)
const idf = t => Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5))

function expandQuery(q) {
  const lower = q.toLowerCase()
  const extra = []
  for (const [k, v] of Object.entries(SYNONYMS)) if (lower.includes(k)) extra.push(...v)
  return [...tokenize(q), ...extra].map(stem)
}

export function retrieve(query, { k = 12, maxChars = 2600 } = {}) {
  const terms = expandQuery(query)
  const k1 = 1.4, b = 0.75
  const scored = docs.map(d => {
    let s = 0
    for (const t of terms) {
      const f = d.tf.get(t)
      if (!f) continue
      s += idf(t) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / avgLen))
    }
    return [s, d.id]
  }).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0])

  const picked = new Set()
  // Explicit section references in the question always win.
  for (const m of query.matchAll(/\b([FGWD]-\d\.\d{2,4})\b/gi)) picked.add(m[1].toUpperCase())
  for (const [, id] of scored) { if (picked.size >= k) break; picked.add(id) }

  return [...picked].filter(id => BY_ID.has(id)).map(id => {
    const s = BY_ID.get(id)
    const text = s.text.length > maxChars ? s.text.slice(0, maxChars) + ' […]' : s.text
    return { id: s.id, part: s.part, title: s.title, text }
  })
}

export function sectionsToContext(sections) {
  return sections.map(s => `<section id="${s.id}" part="${s.part}" title="${s.title}">\n${s.text}\n</section>`).join('\n\n')
}
