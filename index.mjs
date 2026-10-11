// Polity Assistant server — the only origin the glasses plugin talks to.
// POST /ask  { audio?: base64 WAV, text?: string, history?: Turn[] }
//        ->  { transcript, answer, citations, followUp, history }
// GET  /health
import { createServer } from 'node:http'
import { retrieve, sectionsToContext } from './retrieval.mjs'
import { transcribe } from './stt.mjs'
import { SYSTEM_PROMPT } from './prompt.mjs'

const PORT = Number(process.env.PORT || 8787)
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5'
const APP_TOKEN = process.env.APP_TOKEN || ''          // optional shared secret
const MAX_HISTORY_TURNS = 12                            // user+assistant messages kept
const MAX_BODY = 8 * 1024 * 1024

if (!process.env.ANTHROPIC_API_KEY) console.warn('WARNING: ANTHROPIC_API_KEY not set')

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

function send(res, status, body) {
  const data = typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json; charset=utf-8' })
  res.end(data)
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > MAX_BODY) throw Object.assign(new Error('Body too large'), { status: 413 })
    chunks.push(c)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
}

async function askClaude(question, history, sections) {
  if (process.env.MOCK_LLM === '1') {
    const ids = sections.slice(0, 3).map(s => s.id)
    return {
      answer: `(Mock) The Book of Order addresses this mainly in ${ids.join(', ')}. ${sections[0]?.title ?? ''}: ${sections[0]?.text.slice(0, 260) ?? ''}`,
      citations: ids,
      followUp: 'Which council is acting here, the session or the presbytery?',
    }
  }
  const context = sectionsToContext(sections)
  const messages = [
    ...history.slice(-MAX_HISTORY_TURNS).map(t => ({ role: t.role, content: t.content })),
    { role: 'user', content: `<book_of_order>\n${context}\n</book_of_order>\n\nQuestion: ${question}` },
  ]
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      temperature: 0.2,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages,
    }),
  })
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const json = await res.json()
  const text = json.content?.map(c => c.text ?? '').join('') ?? ''
  return parseAnswer(text)
}

function parseAnswer(text) {
  const m = text.match(/\{[\s\S]*\}/)
  if (m) {
    try {
      const o = JSON.parse(m[0])
      return {
        answer: String(o.answer ?? '').trim(),
        citations: Array.isArray(o.citations) ? o.citations.map(String) : [],
        followUp: String(o.follow_up ?? o.followUp ?? '').trim(),
      }
    } catch { /* fall through */ }
  }
  // Model didn't return JSON — salvage plain text.
  const citations = [...new Set([...text.matchAll(/\b[FGWD]-\d\.\d{2,4}\b/g)].map(x => x[0]))]
  return { answer: text.trim(), citations, followUp: 'Can you tell me more about the specific situation?' }
}

async function handleAsk(req, res) {
  if (APP_TOKEN && req.headers.authorization !== `Bearer ${APP_TOKEN}`) return send(res, 401, { error: 'unauthorized' })
  const body = await readJson(req)
  const history = Array.isArray(body.history)
    ? body.history.filter(t => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string')
    : []

  let question = typeof body.text === 'string' ? body.text.trim() : ''
  if (!question && body.audio) {
    const wav = Buffer.from(body.audio, 'base64')
    question = await transcribe(wav)
    if (!question) return send(res, 200, {
      transcript: '', answer: "I didn't catch that. Please tap and ask again, speaking a little closer to the glasses.",
      citations: [], followUp: 'What is your polity question?', history,
    })
  }
  if (!question) return send(res, 400, { error: 'Provide text or audio' })

  // Retrieve against the whole conversation so follow-ups keep the original topic in view.
  const topic = [...history.filter(t => t.role === 'user').map(t => t.content), question].join(' ')
  const sections = retrieve(topic, { k: 12 })
  const out = await askClaude(question, history, sections)

  const newHistory = [
    ...history,
    { role: 'user', content: question },
    { role: 'assistant', content: `${out.answer}\n\nFollow-up: ${out.followUp}` },
  ].slice(-MAX_HISTORY_TURNS)

  send(res, 200, { transcript: question, ...out, history: newHistory, sections: sections.map(s => s.id) })
}

createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end() }
    const url = new URL(req.url, 'http://x')
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, model: MODEL })
    if (req.method === 'POST' && url.pathname === '/ask') return await handleAsk(req, res)
    send(res, 404, { error: 'not found' })
  } catch (err) {
    console.error(err)
    send(res, err.status || 500, { error: err.message || 'server error' })
  }
}).listen(PORT, () => console.log(`polity-server listening on :${PORT} (model ${MODEL})`))
