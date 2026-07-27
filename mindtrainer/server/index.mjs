// Mind Trainer server.
//
// Holds the Anthropic API key (never sent to the browser) and exposes two
// endpoints:
//   POST /api/lesson  -> generate today's structured ~1-hour lesson
//   POST /api/chat    -> streaming Socratic tutor (SSE)
//
// In production it also serves the built PWA from ../dist.

import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

// --- Tiny .env loader (avoids a dependency) ---------------------------------
function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

const MODEL = process.env.MODEL || "claude-opus-5";
const PORT = Number(process.env.PORT) || 8787;

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    "\n[mindtrainer] ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.\n",
  );
}

// Constructed lazily so the server still boots when the key is absent
// (the SDK constructor throws on a missing key).
let _client = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set on the server.");
  }
  if (!_client) _client = new Anthropic();
  return _client;
}

const app = express();
app.use(express.json({ limit: "1mb" }));

// --- Lesson schema (structured output) --------------------------------------
const LESSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "topic",
    "overview",
    "readingTimeMinutes",
    "sections",
    "keyTerms",
    "videoQueries",
    "quiz",
  ],
  properties: {
    title: { type: "string" },
    topic: { type: "string" },
    overview: { type: "string" },
    readingTimeMinutes: { type: "integer" },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "body"],
        properties: {
          heading: { type: "string" },
          body: { type: "string" },
        },
      },
    },
    keyTerms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["term", "definition"],
        properties: {
          term: { type: "string" },
          definition: { type: "string" },
        },
      },
    },
    videoQueries: { type: "array", items: { type: "string" } },
    quiz: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "answer"],
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
        },
      },
    },
  },
};

// POST /api/lesson  { subject, dateISO }
app.post("/api/lesson", async (req, res) => {
  const { subject, dateISO } = req.body ?? {};
  if (!subject || !dateISO) {
    return res.status(400).json({ error: "subject and dateISO are required" });
  }

  const system = [
    `You are an expert personal tutor building a single, focused, roughly one-hour self-study lesson.`,
    `Subject for today (${dateISO}): ${subject}.`,
    `Teach the learner something genuinely new, specific, and interesting within this subject — not a broad survey. Pick a fresh angle so lessons vary day to day.`,
    `Audience: a curious, intelligent adult with no special background. Define any jargon in plain language, use concrete examples and analogies, and build ideas up step by step.`,
    `Aim for 4-6 substantial sections that together take about an hour to read and absorb. Provide 4-8 key terms, two YouTube search queries a learner could watch to go deeper, and 4-6 self-check questions with model answers.`,
  ].join("\n");

  try {
    const response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "disabled" }, // fast, deterministic structured output
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: LESSON_SCHEMA },
      },
      system,
      messages: [
        {
          role: "user",
          content: `Create today's lesson on ${subject}.`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) throw new Error("No text content returned");
    const lesson = JSON.parse(textBlock.text);
    res.json(lesson);
  } catch (err) {
    const msg = err?.message || String(err);
    console.error("[/api/lesson]", msg);
    if (msg.includes("ANTHROPIC_API_KEY")) {
      return res.status(503).json({
        error: "The server has no Anthropic API key. Add ANTHROPIC_API_KEY to mindtrainer/.env and restart.",
      });
    }
    res.status(502).json({ error: "Could not generate the lesson. Please try again." });
  }
});

// POST /api/chat  { subject, lessonContext, messages: [{role, content}], starter? }
// Streams the tutor's reply as Server-Sent Events: { text } deltas, then [DONE].
app.post("/api/chat", async (req, res) => {
  const { subject, lessonContext, messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages are required" });
  }

  const system = [
    `You are a warm, encouraging personal tutor helping the learner understand today's lesson.`,
    `Subject: ${subject || "general knowledge"}.`,
    lessonContext ? `Here is the lesson the learner just read:\n${lessonContext}` : "",
    `Your job: answer their questions clearly; explain anything they don't understand using simple language, examples, and analogies; and when it helps, check their understanding by asking a focused follow-up question.`,
    `When the learner answers a question, tell them specifically what they got right and gently correct any mistakes. Keep replies concise and conversational — a few short paragraphs at most.`,
    `Stay within the scope of the lesson and the subject. Do not include internal or system XML tags in your response.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const stream = getClient().messages.stream({
      model: MODEL,
      max_tokens: 4000,
      thinking: { type: "disabled" },
      output_config: { effort: "medium" },
      system,
      messages: messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? ""),
      })),
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        send({ text: event.delta.text });
      }
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("[/api/chat]", err?.message || err);
    send({ error: "The tutor is unavailable right now. Please try again." });
    res.write("data: [DONE]\n\n");
    res.end();
  }
});

// --- Static PWA (production) -------------------------------------------------
const dist = path.join(ROOT, "dist");
const hasDist = fs.existsSync(path.join(dist, "index.html"));

if (hasDist) {
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
} else {
  // The app hasn't been built yet. Instead of a bare "Cannot GET /", explain
  // exactly what to do so a wrong port / missing build is obvious.
  app.get("*", (_req, res) => {
    res.status(200).type("html").send(`<!doctype html>
<meta charset="utf-8" />
<title>Mind Trainer — not built yet</title>
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:12vh auto;padding:0 20px;color:#0f172a;line-height:1.6">
  <h1 style="color:#2563eb">Mind Trainer</h1>
  <p>The app hasn't been built, so there's nothing to serve on this port yet.</p>
  <p><b>To develop:</b> run <code>npm run dev</code> and open
     <a href="http://localhost:5173">http://localhost:5173</a> (not this port).</p>
  <p><b>To run the built app:</b> run <code>npm start</code>
     (it builds first), then reload this page.</p>
</div>`);
  });
}

app.listen(PORT, () => {
  console.log(`[mindtrainer] listening on http://localhost:${PORT}  (model: ${MODEL})`);
  if (!hasDist) {
    console.log(
      `[mindtrainer] No build found. For development open http://localhost:5173 (npm run dev), or run 'npm start' to build and serve here.`,
    );
  }
});
