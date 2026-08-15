import { useCallback, useEffect, useMemo, useState } from "react";
import type { Lesson } from "./lib/types";
import { dateKey, subjectForDate } from "./lib/curriculum";
import { fetchLesson } from "./lib/api";
import {
  getCachedLesson,
  getProgress,
  markComplete,
  setCachedLesson,
  type Progress,
} from "./lib/storage";
import { Learn } from "./components/Learn";
import { Tutor } from "./components/Tutor";
import { Quiz } from "./components/Quiz";
import { ProgressView } from "./components/ProgressView";

type Tab = "learn" | "ask" | "check" | "progress";

function lessonToContext(lesson: Lesson): string {
  return [
    `Title: ${lesson.title}`,
    `Overview: ${lesson.overview}`,
    `Sections: ${lesson.sections.map((s) => s.heading).join("; ")}`,
    `Key terms: ${lesson.keyTerms
      .map((t) => `${t.term} — ${t.definition}`)
      .join("; ")}`,
  ].join("\n");
}

export function App() {
  const today = useMemo(() => dateKey(), []);
  const subject = useMemo(() => subjectForDate(), []);

  const [lesson, setLesson] = useState<Lesson | null>(() => getCachedLesson(today));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("learn");
  const [progress, setProgress] = useState<Progress>(() => getProgress());

  const generate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const l = await fetchLesson(subject, today);
      setCachedLesson(today, l);
      setLesson(l);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [subject, today]);

  // Auto-generate today's lesson once if it isn't cached.
  useEffect(() => {
    if (!lesson && !loading && !error) void generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completed = Boolean(progress.completed[today]);
  const onComplete = () => setProgress(markComplete(today, subject));

  const context = lesson ? lessonToContext(lesson) : "";

  return (
    <div className="app">
      <header className="hero">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div className="eyebrow">Today's subject</div>
            <h1>
              <span className="subject">{subject}</span>
            </h1>
          </div>
          <div className="streak" title="Daily streak">
            🔥 {progress.streak}
          </div>
        </div>
      </header>

      {tab === "learn" && (
        <>
          {loading && (
            <div className="center">
              <div className="spinner" />
              <p className="muted">Preparing today's {subject} lesson…</p>
            </div>
          )}
          {error && !loading && (
            <div className="card center">
              <p className="error">{error}</p>
              <button className="btn" onClick={generate}>
                Try again
              </button>
            </div>
          )}
          {lesson && !loading && (
            <Learn lesson={lesson} completed={completed} onComplete={onComplete} />
          )}
        </>
      )}

      {tab === "ask" &&
        (lesson ? (
          <Tutor
            subject={subject}
            lessonContext={context}
            greeting={`Hi! I'm your tutor for today's ${subject} lesson, "${lesson.title}." Ask me anything about it, tell me what's unclear, or ask me to go deeper.`}
          />
        ) : (
          <p className="muted center">Load today's lesson first.</p>
        ))}

      {tab === "check" &&
        (lesson ? (
          <Quiz subject={subject} lesson={lesson} lessonContext={context} />
        ) : (
          <p className="muted center">Load today's lesson first.</p>
        ))}

      {tab === "progress" && <ProgressView progress={progress} />}

      <nav className="nav">
        {(
          [
            ["learn", "📖", "Learn"],
            ["ask", "💬", "Ask"],
            ["check", "🧠", "Check"],
            ["progress", "📈", "Progress"],
          ] as [Tab, string, string][]
        ).map(([id, icon, label]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            <span className="icon">{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}
