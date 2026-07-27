// Talks to Claude directly from the browser, using the key stored on this
// device. No backend server involved — this makes the app a pure static site
// you can host anywhere and install on your phone.

import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, Lesson } from "./types";
import { getApiKey, getModel } from "./settings";

export class NoKeyError extends Error {
  constructor() {
    super("No API key set.");
    this.name = "NoKeyError";
  }
}

function client(): Anthropic {
  const apiKey = getApiKey();
  if (!apiKey) throw new NoKeyError();
  // Personal, single-user app: the user supplies and owns the key, so calling
  // Anthropic directly from the browser is acceptable here.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

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
        properties: { heading: { type: "string" }, body: { type: "string" } },
      },
    },
    keyTerms: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["term", "definition"],
        properties: { term: { type: "string" }, definition: { type: "string" } },
      },
    },
    videoQueries: { type: "array", items: { type: "string" } },
    quiz: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "answer"],
        properties: { question: { type: "string" }, answer: { type: "string" } },
      },
    },
  },
};

/** Generate today's structured lesson. */
export async function fetchLesson(subject: string, dateISO: string): Promise<Lesson> {
  const c = client();

  const system = [
    `You are an expert personal tutor building a single, focused, roughly one-hour self-study lesson.`,
    `Subject for today (${dateISO}): ${subject}.`,
    `Teach the learner something genuinely new, specific, and interesting within this subject — not a broad survey. Pick a fresh angle so lessons vary day to day.`,
    `Audience: a curious, intelligent adult with no special background. Define any jargon in plain language, use concrete examples and analogies, and build ideas up step by step.`,
    `Aim for 4-6 substantial sections that together take about an hour to read and absorb. Provide 4-8 key terms, two YouTube search queries a learner could watch to go deeper, and 4-6 self-check questions with model answers.`,
  ].join("\n");

  // Cast to any: some params (output_config, thinking) are newer than the
  // installed SDK's TypeScript types, but the API accepts them.
  const params = {
    model: getModel(),
    max_tokens: 16000,
    thinking: { type: "disabled" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: LESSON_SCHEMA },
    },
    system,
    messages: [{ role: "user", content: `Create today's lesson on ${subject}.` }],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming;

  const res = await c.messages.create(params);
  const block = res.content.find((b) => b.type === "text") as
    | { type: "text"; text: string }
    | undefined;
  if (!block) throw new Error("The model returned no lesson text.");
  return JSON.parse(block.text) as Lesson;
}

/** Stream a tutor reply, calling onDelta with each chunk. */
export async function streamChat(
  params: { subject: string; lessonContext: string; messages: ChatMessage[] },
  onDelta: (text: string) => void,
): Promise<string> {
  const c = client();

  const system = [
    `You are a warm, encouraging personal tutor helping the learner understand today's lesson.`,
    `Subject: ${params.subject || "general knowledge"}.`,
    params.lessonContext ? `Here is the lesson the learner just read:\n${params.lessonContext}` : "",
    `Your job: answer their questions clearly; explain anything they don't understand using simple language, examples, and analogies; and when it helps, check their understanding by asking a focused follow-up question.`,
    `When the learner answers a question, tell them specifically what they got right and gently correct any mistakes. Keep replies concise and conversational — a few short paragraphs at most.`,
    `Stay within the scope of the lesson and the subject. Do not include internal or system XML tags in your response.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const req = {
    model: getModel(),
    max_tokens: 4000,
    thinking: { type: "disabled" },
    output_config: { effort: "medium" },
    system,
    messages: params.messages.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
  } as unknown as Anthropic.MessageCreateParamsStreaming;

  let full = "";
  const stream = c.messages.stream(req);
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      full += event.delta.text;
      onDelta(event.delta.text);
    }
  }
  return full;
}
