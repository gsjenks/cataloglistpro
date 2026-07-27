export interface LessonSection {
  heading: string;
  body: string;
}

export interface KeyTerm {
  term: string;
  definition: string;
}

export interface QuizItem {
  question: string;
  answer: string;
}

export interface Lesson {
  title: string;
  topic: string;
  overview: string;
  readingTimeMinutes: number;
  sections: LessonSection[];
  keyTerms: KeyTerm[];
  videoQueries: string[];
  quiz: QuizItem[];
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
