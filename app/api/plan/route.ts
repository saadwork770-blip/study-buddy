import { attachmentParts, errorKey, generateJson } from "@/lib/ai";
import { ROLE, systemPrompt } from "@/lib/prompts";
import type { Lang } from "@/lib/i18n";
import type { Attachment, Task, TaskPlan } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/** OpenAPI-subset schema Gemini validates its JSON output against. */
const PLAN_SCHEMA = {
  type: "object",
  properties: {
    plan: {
      type: "string",
      description: "A short paragraph (3-5 sentences) on how to approach the work.",
    },
    subtasks: {
      type: "array",
      description: "5-10 steps in the order they should be done.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "One concrete, checkable step." },
          hours: { type: "number", description: "Realistic hours of focused work." },
          target: { type: "string", description: "Date to finish this step, YYYY-MM-DD." },
        },
        required: ["title", "hours", "target"],
      },
    },
    risks: {
      type: "array",
      description: "2-4 things likely to go wrong or be underestimated.",
      items: { type: "string" },
    },
  },
  required: ["plan", "subtasks", "risks"],
};

export async function POST(request: Request) {
  const body = (await request.json()) as {
    task: Task;
    lang: Lang;
    attachments?: Attachment[];
  };
  const lang: Lang = body.lang === "en" ? "en" : "ar";
  const task = body.task;
  const today = new Date().toISOString().slice(0, 10);

  const system = [
    systemPrompt(lang, ROLE.planner),
    "",
    `Today is ${today}.`,
    "Schedule backwards from the due date, leave slack before it, and never place a step in the past.",
    "If there is no due date, schedule from today at a sustainable pace.",
    "Write every title, plan sentence and risk in the student's language; dates stay in YYYY-MM-DD.",
  ].join("\n");

  const prompt = [
    `Title: ${task.title}`,
    task.course ? `Course: ${task.course}` : "",
    `Type: ${task.type}`,
    `Priority: ${task.priority}`,
    task.dueDate ? `Due: ${task.dueDate}` : "Due: not set",
    task.notes ? `Brief / requirements:\n${task.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const plan = await generateJson<TaskPlan>(
      system,
      prompt,
      PLAN_SCHEMA,
      attachmentParts(body.attachments),
    );
    if (!plan) return Response.json({ error: "error.generic" }, { status: 502 });
    return Response.json(plan);
  } catch (err) {
    console.error("[study-buddy] plan failed:", err);
    return Response.json({ error: errorKey(err) }, { status: 500 });
  }
}
