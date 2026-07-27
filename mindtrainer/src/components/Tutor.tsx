import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../lib/types";
import { streamChat } from "../lib/api";

export function Tutor({
  subject,
  lessonContext,
  starter,
  greeting,
}: {
  subject: string;
  lessonContext: string;
  /** If set, this user message is sent automatically when the tutor opens. */
  starter?: string;
  /** A local opening line from the tutor (not sent to the model). */
  greeting?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(
    greeting ? [{ role: "assistant", content: greeting }] : [],
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const scrollDown = () =>
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 30);

  const send = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setError(null);

    // Build the conversation the model sees (exclude the local greeting).
    const history = messages.filter(
      (m) => !(m.role === "assistant" && m.content === greeting),
    );
    const forModel: ChatMessage[] = [...history, { role: "user", content: trimmed }];

    setMessages((prev) => [
      ...prev,
      { role: "user", content: trimmed },
      { role: "assistant", content: "" },
    ]);
    setInput("");
    setBusy(true);
    scrollDown();

    try {
      await streamChat({ subject, lessonContext, messages: forModel }, (delta) => {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: copy[copy.length - 1].content + delta,
          };
          return copy;
        });
        scrollDown();
      });
    } catch {
      setError("The tutor is unavailable right now. Please try again.");
      // Drop the empty assistant bubble.
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setBusy(false);
    }
  };

  // Auto-send the starter once.
  useEffect(() => {
    if (starter && !startedRef.current) {
      startedRef.current = true;
      void send(starter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starter]);

  return (
    <div className="card">
      <div className="chat">
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role === "user" ? "user" : "tutor"}`}>
            {m.content || (busy && i === messages.length - 1 ? "…" : "")}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="error" style={{ marginTop: 10 }}>
          {error}
        </p>
      )}

      <div className="composer">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send(input);
          }}
          placeholder="Ask anything, or answer the tutor…"
          disabled={busy}
        />
        <button className="btn" onClick={() => send(input)} disabled={busy || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
