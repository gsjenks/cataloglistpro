import { useMemo, useState } from "react";
import type { Lesson } from "../lib/types";
import { speak, stopSpeaking, ttsSupported } from "../lib/tts";

type Mode = "read" | "listen" | "watch";

export function Learn({
  lesson,
  completed,
  onComplete,
}: {
  lesson: Lesson;
  completed: boolean;
  onComplete: () => void;
}) {
  const [mode, setMode] = useState<Mode>("read");
  const [speaking, setSpeaking] = useState(false);
  const [videoIdx, setVideoIdx] = useState(0);

  const fullText = useMemo(
    () =>
      [lesson.overview, ...lesson.sections.map((s) => `${s.heading}. ${s.body}`)].join(
        "\n\n",
      ),
    [lesson],
  );

  const toggleSpeak = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
    } else {
      setSpeaking(true);
      speak(fullText, () => setSpeaking(false));
    }
  };

  const videoSrc = (q: string) =>
    `https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(q)}`;

  return (
    <div>
      <div className="card">
        <div className="muted" style={{ fontSize: 13 }}>
          {lesson.topic} · ~{lesson.readingTimeMinutes} min
        </div>
        <h2>{lesson.title}</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          {lesson.overview}
        </p>

        <div className="subtabs" style={{ marginTop: 14 }}>
          <button className={mode === "read" ? "active" : ""} onClick={() => setMode("read")}>
            📖 Read
          </button>
          <button
            className={mode === "listen" ? "active" : ""}
            onClick={() => setMode("listen")}
          >
            🎧 Listen
          </button>
          <button
            className={mode === "watch" ? "active" : ""}
            onClick={() => setMode("watch")}
          >
            ▶️ Watch
          </button>
        </div>

        {mode === "read" && (
          <div className="prose">
            {lesson.sections.map((s, i) => (
              <div key={i}>
                <h3>{s.heading}</h3>
                <p className="section-body">{s.body}</p>
              </div>
            ))}
          </div>
        )}

        {mode === "listen" && (
          <div>
            {ttsSupported() ? (
              <>
                <button className="btn" onClick={toggleSpeak}>
                  {speaking ? "⏹ Stop" : "▶️ Play narration"}
                </button>
                <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
                  Narrated on your device. Follow along with the Read tab.
                </p>
              </>
            ) : (
              <p className="muted">Narration isn't supported in this browser.</p>
            )}
          </div>
        )}

        {mode === "watch" && (
          <div>
            <div className="pill-row" style={{ marginBottom: 12 }}>
              {lesson.videoQueries.map((q, i) => (
                <button
                  key={i}
                  className={`btn small ${i === videoIdx ? "" : "ghost"}`}
                  onClick={() => setVideoIdx(i)}
                >
                  {q}
                </button>
              ))}
            </div>
            {lesson.videoQueries[videoIdx] && (
              <div className="video-wrap">
                <iframe
                  key={videoIdx}
                  src={videoSrc(lesson.videoQueries[videoIdx])}
                  title="Lesson video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}
            <p className="muted" style={{ fontSize: 13, marginTop: 10 }}>
              Curated YouTube searches for today's topic.
            </p>
          </div>
        )}
      </div>

      {lesson.keyTerms.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Key terms</h3>
          <ul className="terms" style={{ margin: 0, paddingLeft: 18 }}>
            {lesson.keyTerms.map((t, i) => (
              <li key={i}>
                <span className="term">{t.term}</span> — {t.definition}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card center" style={{ padding: 18 }}>
        {completed ? (
          <div className="muted">✅ Completed today. Nice work — see you tomorrow.</div>
        ) : (
          <button className="btn" onClick={onComplete}>
            ✓ Mark today complete
          </button>
        )}
      </div>
    </div>
  );
}
