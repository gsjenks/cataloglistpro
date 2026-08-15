# Mind Trainer

A personal daily mind trainer. One hour a day, a rotating subject, and an
interactive AI tutor that teaches something new, explains what you don't
understand, and checks what you've learned.

It's an installable **web app (PWA)** — add it to your phone's home screen or
run it on the desktop. The AI tutor is powered by the **Claude API**; your API
key stays on the server and is never exposed to the browser.

## Features

- **Rotating curriculum** — a different subject each day (Technology, History,
  Literature, Art, Music, Civics, Architecture, Environment, Astronomy,
  Mathematics, Chemistry, Design, Economics, Construction, Science, Law,
  Business, Politics, Religion, Critical Thinking).
- **Learn** — a fresh ~1-hour lesson generated for the day. **Read** it,
  **Listen** to on-device narration, or **Watch** curated videos for the topic.
- **Ask** — an interactive Socratic tutor grounded in today's lesson.
- **Check** — flashcards plus an interactive "quiz me" mode that evaluates your
  answers.
- **Progress** — a daily streak and a log of subjects you've explored.

## Setup

```bash
cd mindtrainer
npm install
cp .env.example .env      # then add your ANTHROPIC_API_KEY
```

Get a key at https://console.anthropic.com. By default the app uses
`claude-opus-5`; set `MODEL=claude-sonnet-5` in `.env` for roughly 5× lower
cost with strong quality.

## Run in development

```bash
npm run dev
```

- Front end: http://localhost:5173 (Vite)
- API server: http://localhost:8787 (Express, holds the key)

Vite proxies `/api/*` to the Express server.

## Build & run for real

```bash
npm run build      # type-checks and builds the PWA into dist/
npm start          # Express serves dist/ AND the API on http://localhost:8787
```

Deploy `npm start` to any Node host (Render, Railway, Fly, a VM). Set
`ANTHROPIC_API_KEY` (and optionally `MODEL`, `PORT`) in the host's environment.
Once served over HTTPS, the browser will offer **Install** / **Add to Home
Screen**.

## How it works

| Piece | What it does |
|---|---|
| `src/lib/curriculum.ts` | Deterministic day → subject rotation. |
| `server/index.mjs` | `POST /api/lesson` (structured lesson) and `POST /api/chat` (streaming tutor). Holds the Claude key. |
| `src/lib/storage.ts` | Caches each day's lesson and tracks the streak in `localStorage` — works offline, no account. |
| `public/sw.js`, `manifest.webmanifest` | Make the app installable with an offline shell. |

## Cost

Each day generates one lesson (cached locally, so it's generated once per day)
plus whatever tutor chat you use. On `claude-sonnet-5` this is a few cents per
day of active use; `claude-opus-5` is higher. The lesson call runs with thinking
disabled and medium effort to keep it fast and cheap.

## Notes / next steps

- The PWA icon is an SVG placeholder (`public/icon.svg`). For the crispest
  app-store/home-screen icons, add 192×192 and 512×512 PNGs and list them in the
  manifest.
- Progress is device-local. Add accounts + a database (e.g. Supabase) to sync
  across devices.
- To package as native iOS/Android apps later, wrap the built site with
  Capacitor.
