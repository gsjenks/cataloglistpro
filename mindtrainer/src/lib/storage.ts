// Local-only persistence: cached daily lessons plus the learning streak.
// Everything lives in localStorage so the app works offline and needs no
// account. (A future version can sync this to a backend.)

import type { Lesson } from "./types";
import { dateKey } from "./curriculum";

const LESSON_PREFIX = "mt:lesson:";
const PROGRESS_KEY = "mt:progress";

export interface Progress {
  streak: number;
  lastCompleted: string | null; // dateKey of the last completed day
  completed: Record<string, string>; // dateKey -> subject
}

export function getCachedLesson(key: string): Lesson | null {
  try {
    const raw = localStorage.getItem(LESSON_PREFIX + key);
    return raw ? (JSON.parse(raw) as Lesson) : null;
  } catch {
    return null;
  }
}

export function setCachedLesson(key: string, lesson: Lesson): void {
  try {
    localStorage.setItem(LESSON_PREFIX + key, JSON.stringify(lesson));
  } catch {
    /* storage full or unavailable — non-fatal */
  }
}

export function getProgress(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return JSON.parse(raw) as Progress;
  } catch {
    /* fall through to default */
  }
  return { streak: 0, lastCompleted: null, completed: {} };
}

function save(p: Progress): void {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
}

function isYesterday(prev: string, today: string): boolean {
  const [py, pm, pd] = prev.split("-").map(Number);
  const d = new Date(py, pm - 1, pd);
  d.setDate(d.getDate() + 1);
  return dateKey(d) === today;
}

/** Mark a subject complete for a date; updates the streak. Returns new progress. */
export function markComplete(key: string, subject: string): Progress {
  const p = getProgress();
  if (p.completed[key]) return p; // already counted today

  if (p.lastCompleted && isYesterday(p.lastCompleted, key)) {
    p.streak += 1;
  } else if (p.lastCompleted === key) {
    // same day, no change
  } else {
    p.streak = 1;
  }
  p.lastCompleted = key;
  p.completed[key] = subject;
  save(p);
  return p;
}
