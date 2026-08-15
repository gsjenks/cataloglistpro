# Mind Trainer

A personal daily mind trainer. One hour a day, a rotating subject, and an
interactive AI tutor that teaches something new, explains what you don't
understand, and checks what you've learned.

It's an installable **web app (PWA)** — add it to your phone's home screen. The
AI tutor is powered by the **Claude API**, and **your API key stays on the
server** — it is never exposed to the browser.

## Features

- **Rotating curriculum** — a different subject each day (Technology, History,
  Literature, Art, Music, Civics, Architecture, Environment, Astronomy,
  Mathematics, Chemistry, Design, Economics, Construction, Science, Law,
  Business, Politics, Religion, Critical Thinking).
- **Learn** — a fresh ~1-hour lesson generated for the day: **Read** it,
  **Listen** to on-device narration, or **Watch** curated videos for the topic.
- **Ask** — an interactive Socratic tutor grounded in today's lesson.
- **Check** — flashcards plus an interactive "quiz me" mode that grades answers.
- **Progress** — a daily streak and a log of subjects explored.

## Put it on your phone

Because the key stays server-side, the app runs as a small Node service. Host it
once, then open the link on your phone and install it. **Render** has a free
tier and can deploy straight from GitHub in a phone browser:

1. Create your **Anthropic API key** at console.anthropic.com (this powers the
   tutor; usage is billed to your Anthropic account).
2. Go to **render.com**, sign in with **GitHub**.
3. **New → Web Service**, and pick this repo (`gsjenks/cataloglistpro`).
4. Set these fields:
   - **Root Directory:** `mindtrainer`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm run serve`
   - **Branch:** `claude/mind-trainer` (or `main` once it's merged)
5. Under **Environment**, add a variable:
   - `ANTHROPIC_API_KEY` = your key
   - *(optional)* `MODEL` = `claude-sonnet-5` for ~5× lower cost
6. **Create Web Service.** Render builds it and gives you an
   `https://…onrender.com` link.
7. Open that link on your phone → menu → **Add to Home Screen**.

The same works on **Railway**, **Fly.io**, or any Node host: build with
`npm run build`, start with `npm run serve`, and set `ANTHROPIC_API_KEY` in the
host's environment. (Note: Render's free tier sleeps when idle, so the first
open after a while takes ~30 seconds to wake.)

## Run it locally (optional, needs a computer)

```bash
cd mindtrainer
npm install
cp .env.example .env      # add ANTHROPIC_API_KEY (and optionally MODEL)
npm run dev               # front end on http://localhost:5173, API on :8787
```

Build and serve the production bundle from one server:

```bash
npm start                 # builds, then serves dist/ + the API on :8787
```

## Cost

Each day generates one lesson (cached, so once per day) plus any tutor chat you
use. On `claude-sonnet-5` that's a few cents per day of active use; `claude-opus-5`
(the default) is higher quality and higher cost. The lesson call runs with
thinking off and medium effort to stay fast and cheap.

## How it works

| Piece | What it does |
|---|---|
| `src/lib/curriculum.ts` | Deterministic day → subject rotation. |
| `server/index.mjs` | Holds the Claude key. `POST /api/lesson` (structured lesson) and `POST /api/chat` (streaming tutor); serves the built app in production. |
| `src/lib/api.ts` | Browser calls `/api/*` — it never sees the key. |
| `src/lib/storage.ts` | Caches each day's lesson and the streak in `localStorage`. |
| `public/sw.js`, `manifest.webmanifest` | Make the app installable with an offline shell. |

## Notes / next steps

- The PWA icon is an SVG placeholder (`public/icon.svg`); add 192/512 PNGs for
  the crispest home-screen icon.
- Progress is device-local. Add accounts + a database to sync across devices.
- To ship as native iOS/Android apps later, wrap the built site with Capacitor.
