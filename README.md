# Polity Assistant for Even G2

A Presbyterian polity assistant for Even Realities G2 glasses. Tap the temple, ask a
question out loud, and get a general Book of Order answer with section citations,
followed by a prompt asking for the detail that would sharpen the answer. Tap again
to answer that follow-up and the conversation continues.

```
Glasses mic ──► plugin (phone WebView) ──► server/ ──► speech-to-text
                                              │
Glasses display ◄── paged answer ◄──────── Claude + Book of Order 2025-2027 (BM25 retrieval)
```

```
polity-glasses/
├── plugin/      Even Hub app (Vite + TypeScript + @evenrealities/even_hub_sdk) → .ehpk
├── server/      Node 20+ server, zero dependencies. Holds the API keys and the Book of Order.
│   └── data/book_of_order.json   583 sections (F-, G-, W-, D-) parsed from the 2025-2027 PDF
└── tools/build_index.py          Rebuilds that JSON from `pdftotext -layout` output
```

## 1. Deploy the server (10 minutes)

Any host that runs Node 20+ works: Fly.io, Railway, Render, a VPS. A `Dockerfile` is included.

```bash
cd server
cp .env.example .env        # fill in ANTHROPIC_API_KEY and ONE speech-to-text key
npm start                    # listens on :8787
```

Environment variables:

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Required. |
| `ANTHROPIC_MODEL` | Default `claude-sonnet-4-5`. Any current Claude model string. |
| `DEEPGRAM_API_KEY` **or** `OPENAI_API_KEY` **or** `GROQ_API_KEY` | Speech-to-text. Deepgram recommended (fast, lets us bias toward polity vocabulary). |
| `STT_PROVIDER`, `STT_MODEL` | Optional overrides; auto-detected from which key is set. |
| `APP_TOKEN` | Optional shared secret. If set, the plugin must be built with the same `VITE_APP_TOKEN`. |
| `MOCK_LLM=1` | Dev only: canned answers from retrieval, no Claude call. |

Smoke test:

```bash
curl -s https://YOUR-SERVER/health
curl -s -X POST https://YOUR-SERVER/ask -H 'Content-Type: application/json' \
  -d '{"text":"Who approves terms of call for an installed pastor?"}'
```

The response is `{ transcript, answer, citations[], followUp, history[] }`. Send `history`
back on the next request to continue the conversation.

The server already returns the CORS headers Even's WebView requires (`Access-Control-Allow-Origin: *`,
preflight handled). Serve it over **HTTPS** — the glasses app will not call plain http in production.

## 2. Point the plugin at your server

Two places must match:

1. `plugin/app.json` → `permissions[network].whitelist` — replace `https://polity.example.com`
   with your server origin (scheme + host, no path, no trailing slash).
2. `plugin/.env.local` (copy from `.env.example`) → `VITE_API_BASE=https://your-server`.

The companion screen on the phone also has a **Server** field that overrides the build-time URL
at runtime, but the origin still has to be in the `app.json` whitelist or Even blocks the request.

## 3. Build, test, pack

```bash
cd plugin
npm install
npm run dev                 # Vite dev server on :5173
npm run simulate            # Even Hub simulator pointed at it (no hardware needed)
#   open http://localhost:5173/?q=your+question in the simulator to exercise the answer flow
#   (the simulator has no microphone)
npm run qr                  # QR sideload onto your real glasses with hot reload
npm run pack                # → plugin/polity-assistant.ehpk
```

Upload the `.ehpk` in the Even Hub developer portal as a **private build** to install it on
your own glasses. Public listing goes through Even's review.

## Using it on the glasses

| Gesture | Action |
| --- | --- |
| Tap | Ask a question (starts the mic). Tap again when you're done speaking. |
| Swipe up / down | Previous / next page of the answer |
| Tap on the last page | Answer the follow-up question (mic starts, conversation continues) |
| Long press | New topic (clears the conversation) |
| Double tap | Exit the app |

Recording stops automatically after 30 seconds. Taps shorter than half a second are ignored.

## How answers are produced

1. The server transcribes the audio, then searches `book_of_order.json` with BM25 using the
   whole conversation so far, plus a synonym table for the way Presbyterians actually talk
   ("COM", "PNC", "terms of call", "interim", "manse" …). Any section number spoken aloud is
   always included. Top 12 sections go to Claude.
2. The system prompt (`server/prompt.mjs`) asks for a **general polity answer**: what the
   Constitution provides for this kind of situation, with inline citations, in 2–5 plain-text
   sentences sized for a 576×288 display — then exactly one follow-up question that would
   most change the answer (installed vs. temporary? which council? etc.).
3. The plugin paginates the answer with Even's pixel-accurate `@evenrealities/pretext`
   measurer so pages never clip, and appends the follow-up as the final page.

Edit `prompt.mjs` to change tone or scope. Run `npm run test:retrieval` in `server/` after
touching the synonym table.

## Updating the Book of Order

```bash
pdftotext -layout "Book_of_Order_2027-2029.pdf" boo.txt
python3 tools/build_index.py boo.txt server/data/book_of_order.json
```

The parser looks for section headings like `G-2.0504  Pastoral Relationships` and strips
running headers, footers, and margin references.

## Notes

- Never put API keys in the plugin. Anyone can unzip a released `.ehpk`.
- The answer is general polity guidance, not legal advice; the prompt tells Claude to say so
  where the Constitution defers to civil law.
- `min_app_version` is stamped automatically from the SDK (`--sdk-ver 0.0.16` → Even App 2.2.10+).
