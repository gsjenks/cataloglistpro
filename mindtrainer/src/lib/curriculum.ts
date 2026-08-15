// The rotating curriculum. One subject per day, cycling deterministically so
// every device shows the same subject on the same date.

export const SUBJECTS = [
  "Technology",
  "History",
  "Literature",
  "Art",
  "Music",
  "Civics",
  "Architecture",
  "Environment",
  "Astronomy",
  "Mathematics",
  "Chemistry",
  "Design",
  "Economics",
  "Construction",
  "Science",
  "Law",
  "Business",
  "Politics",
  "Religion",
  "Critical Thinking",
] as const;

export type Subject = (typeof SUBJECTS)[number];

/** Local calendar date as YYYY-MM-DD (not UTC), used as the lesson key. */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Whole days since the Unix epoch for a given local date. */
function dayNumber(d: Date): number {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.floor(local.getTime() / 86_400_000);
}

/** The subject scheduled for a given date. */
export function subjectForDate(d: Date = new Date()): Subject {
  const idx = ((dayNumber(d) % SUBJECTS.length) + SUBJECTS.length) % SUBJECTS.length;
  return SUBJECTS[idx];
}
