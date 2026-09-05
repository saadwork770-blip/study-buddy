import type { Lang } from "./i18n";

/** One piece of a message: text, an inlined file, or one hosted by Google. */
export type AiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { fileData: { mimeType: string; fileUri: string } };

/** A file the browser uploaded straight to the Gemini Files API. */
export interface Attachment {
  name: string;
  mimeType: string;
  size: number;
  /** Google-hosted file URI, for anything Gemini reads natively. */
  fileUri?: string;
  /** Text extracted in the browser instead (.docx, plain text). */
  text?: string;
}

/** Gemini names the assistant role "model". */
export interface AiMessage {
  role: "user" | "model";
  parts: AiPart[];
}

export type TaskType =
  | "assignment"
  | "reading"
  | "exam"
  | "research"
  | "presentation"
  | "other";
export type Priority = "low" | "medium" | "high";
export type TaskStatus = "todo" | "doing" | "done";

export interface SubTask {
  id: string;
  title: string;
  done: boolean;
  hours?: number;
  /** ISO date (YYYY-MM-DD) suggested by the planner. */
  target?: string;
}

export interface Task {
  id: string;
  title: string;
  course?: string;
  type: TaskType;
  dueDate?: string;
  priority: Priority;
  status: TaskStatus;
  notes?: string;
  subtasks: SubTask[];
  /** Narrative plan produced by the AI breakdown. */
  plan?: string;
  risks?: string[];
  createdAt: string;
}

export type LibraryKind = "summary" | "research" | "chat" | "plan";

export interface Source {
  title: string;
  url: string;
}

export interface LibraryItem {
  id: string;
  kind: LibraryKind;
  title: string;
  /** Markdown body. */
  content: string;
  lang: Lang;
  sources?: Source[];
  createdAt: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** One line of the NDJSON stream the API routes emit. */
export type StreamEvent =
  | { type: "status"; label: string }
  | { type: "text"; text: string }
  | { type: "sources"; sources: Source[] }
  /** Which provider and model actually answered, when it was not the primary. */
  | { type: "served"; provider: string; model?: string }
  /** What this turn learned about who is out of allowance, for the browser to remember. */
  | { type: "cooldowns"; cooldowns: Record<string, { until: number; reason: string }> }
  /** Every provider tried and why each refused, shown when they all did. */
  | { type: "attempts"; attempts: { provider: string; reason: string }[] }
  | { type: "error"; message: string }
  | { type: "done" };

export interface TaskPlan {
  plan: string;
  subtasks: { title: string; hours?: number; target?: string }[];
  risks?: string[];
}
