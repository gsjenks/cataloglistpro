# Mind Trainer

A personal daily mind trainer. One hour a day, a rotating subject, and an
interactive AI tutor that teaches something new, explains what you don't
understand, and checks what you've learned.

It's a **self-contained static web app (PWA)** — no backend server. It talks to
the **Claude API** directly from your browser using an Anthropic API key you
enter once, stored only on your device. That means you can host it on any static
host and **install it on your phone**.

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
- **Installable** — Add to Home Screen for an app-like experience.

## Put it on your phone (no computer needed)

You deploy it once from a hosting website, then open it on your phone. Using
**Vercel** (all steps work in a phone browser):

1. Go to **vercel.com** and sign in with your GitHub account.
2. **Add New → Project**, and import this repository (`gsjenks/cataloglistpro`).
3. Set **Root Directory** to **`mindtrainer`**. It auto-detects Vite; the
   included `vercel.json` handles routing.
4. If this code is on a branch (e.g. `claude/mind-trainer`), pick that branch as
   the production branch, or merge it to `main` first.
5. **Deploy.** Vercel gives you an `https://…vercel.app` URL.
6. Open that URL on your phone. On first launch, paste your **Anthropic API
   key** (get one at console.anthropic.com). It's saved on your device.
7. In your browser menu choose **Add to Home Screen** to install it.

**Netlify** works the same way: New site → import from Git → set **Base
directory** to `mindtrainer` (the included `netlify.toml` does the rest).

## Run it locally (optional, needs a computer)

```bash
cd mindtrainer
npm install
npm run dev        # open http://localhost:5173, paste your key on first launch
npm run build      # produces the static site in dist/
npm run preview    # serve the built site locally
```

## About your API key & cost

- The key lives only in your browser's local storage on the device you enter it
  on. It is sent only to Anthropic, in the calls the app makes for you.
- Each day generates one lesson (cached locally, so once per day) plus any tutor
  chat you use. On **Sonnet 5** that's a few cents per day of active use; **Opus
  5** (the default) is higher quality and higher cost. Switch models any time
  via the ⚙️ Settings button.

## How it works

| Piece | What it does |
|---|---|
| `src/lib/curriculum.ts` | Deterministic day → subject rotation. |
| `src/lib/api.ts` | Calls Claude directly from the browser (structured lesson + streaming tutor). |
| `src/lib/settings.ts` | Stores the API key and model choice on the device. |
| `src/lib/storage.ts` | Caches each day's lesson and tracks the streak in `localStorage`. |
| `public/sw.js`, `manifest.webmanifest` | Make the app installable with an offline shell. |

## Notes / next steps

- The PWA icon is an SVG placeholder (`public/icon.svg`); add 192/512 PNGs for
  the crispest home-screen icon.
- Progress is device-local. Add accounts + a database to sync across devices.
- To ship as native iOS/Android apps later, wrap the built site with Capacitor.
