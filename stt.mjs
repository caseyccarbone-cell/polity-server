// Speech-to-text. Input is a WAV buffer (PCM s16le, 16 kHz, mono) from the glasses.
// Provider chosen by STT_PROVIDER: "deepgram" | "openai" | "groq". Keys from env.

export async function transcribe(wav, env = process.env) {
  const provider = (env.STT_PROVIDER || (env.DEEPGRAM_API_KEY ? 'deepgram' : env.GROQ_API_KEY ? 'groq' : 'openai')).toLowerCase()
  switch (provider) {
    case 'deepgram': return deepgram(wav, env)
    case 'groq': return whisperCompatible(wav, env.GROQ_API_KEY, 'https://api.groq.com/openai/v1', env.STT_MODEL || 'whisper-large-v3-turbo')
    case 'openai': return whisperCompatible(wav, env.OPENAI_API_KEY, 'https://api.openai.com/v1', env.STT_MODEL || 'gpt-4o-mini-transcribe')
    default: throw new Error(`Unknown STT_PROVIDER ${provider}`)
  }
}

const POLITY_HINTS = 'Presbyterian, presbytery, session, Book of Order, ruling elder, deacon, Committee on Ministry, Permanent Judicial Commission, terms of call, congregational meeting, moderator, stated clerk, General Assembly, synod, ordination, installation, dissolution, administrative commission'

async function deepgram(wav, env) {
  if (!env.DEEPGRAM_API_KEY) throw new Error('DEEPGRAM_API_KEY not set')
  const params = new URLSearchParams({
    model: env.STT_MODEL || 'nova-3', smart_format: 'true', language: 'en', punctuate: 'true',
    keyterm: POLITY_HINTS,
  })
  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: 'POST',
    headers: { Authorization: `Token ${env.DEEPGRAM_API_KEY}`, 'Content-Type': 'audio/wav' },
    body: wav,
  })
  if (!res.ok) throw new Error(`Deepgram ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  return json?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? ''
}

async function whisperCompatible(wav, key, base, model) {
  if (!key) throw new Error('STT API key not set')
  const form = new FormData()
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'question.wav')
  form.append('model', model)
  form.append('language', 'en')
  form.append('prompt', POLITY_HINTS)
  const res = await fetch(`${base}/audio/transcriptions`, {
    method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
  })
  if (!res.ok) throw new Error(`STT ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  return (json.text ?? '').trim()
}
