import type { Progress } from "../lib/storage";

export function ProgressView({ progress }: { progress: Progress }) {
  const days = Object.entries(progress.completed).sort((a, b) =>
    a[0] < b[0] ? 1 : -1,
  );

  const subjectCounts = days.reduce<Record<string, number>>((acc, [, subj]) => {
    acc[subj] = (acc[subj] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <div className="card center">
        <div style={{ fontSize: 44 }}>🔥</div>
        <div style={{ fontSize: 32, fontWeight: 800 }}>{progress.streak}</div>
        <div className="muted">day streak</div>
        <div className="muted" style={{ marginTop: 6 }}>
          {days.length} lesson{days.length === 1 ? "" : "s"} completed
        </div>
      </div>

      {Object.keys(subjectCounts).length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Subjects explored</h3>
          <div className="pill-row">
            {Object.entries(subjectCounts).map(([subj, n]) => (
              <span
                key={subj}
                className="streak"
                style={{ boxShadow: "none" }}
              >
                {subj} · {n}
              </span>
            ))}
          </div>
        </div>
      )}

      {days.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Recent</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {days.slice(0, 14).map(([date, subj]) => (
              <li key={date}>
                <span className="muted">{date}</span> — {subj}
              </li>
            ))}
          </ul>
        </div>
      )}

      {days.length === 0 && (
        <p className="muted center">
          Complete today's lesson to start your streak.
        </p>
      )}
    </div>
  );
}
