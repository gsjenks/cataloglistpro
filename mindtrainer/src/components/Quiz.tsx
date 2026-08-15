import { useState } from "react";
import type { Lesson } from "../lib/types";
import { Tutor } from "./Tutor";

export function Quiz({
  subject,
  lesson,
  lessonContext,
}: {
  subject: string;
  lesson: Lesson;
  lessonContext: string;
}) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [interactive, setInteractive] = useState(false);

  const toggle = (i: number) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  if (interactive) {
    return (
      <div>
        <button
          className="btn ghost small"
          style={{ marginBottom: 12 }}
          onClick={() => setInteractive(false)}
        >
          ← Back to flashcards
        </button>
        <Tutor
          subject={subject}
          lessonContext={lessonContext}
          starter="Quiz me on today's lesson. Ask me one question at a time, wait for my answer, then tell me how I did before moving on."
        />
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Check your understanding</h2>
      <p className="muted">Tap a card to reveal the answer.</p>

      <div style={{ marginTop: 12 }}>
        {lesson.quiz.map((item, i) => (
          <div key={i} className="flashcard" onClick={() => toggle(i)}>
            <div className="q">{item.question}</div>
            {revealed.has(i) && <div className="a">{item.answer}</div>}
          </div>
        ))}
      </div>

      <button
        className="btn"
        style={{ marginTop: 8 }}
        onClick={() => setInteractive(true)}
      >
        🧠 Quiz me interactively
      </button>
    </div>
  );
}
