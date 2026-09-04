import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { EFFORT, MODEL, errorKey, getClient } from "@/lib/claude";
import { ROLE, systemPrompt } from "@/lib/prompts";
import type { Lang } from "@/lib/i18n";
import type { Task } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

const PlanSchema = z.object({
  plan: z
    .string()
    .describe("A short paragraph (3-5 sentences) on how to approach the work."),
  subtasks: z
    .array(
      z.object({
        title: z.string().describe("One concrete, checkable step."),
        hours: z.number().describe("Realistic hours of focused work."),
        target: z
          .string()
          .describe("Suggested date to finish this step, as YYYY-MM-DD."),
      }),
    )
    .describe("5-10 steps in the order they should be done."),
  risks: z
    .array(z.string())
    .describe("2-4 things likely to go wrong or be underestimated."),
});

export async function POST(request: Request) {
  const body = (await request.json()) as { task: Task; lang: Lang };
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
    const response = await getClient().messages.parse({
      model: MODEL,
      max_tokens: 16000,
      output_config: {
        effort: EFFORT,
        format: zodOutputFormat(PlanSchema),
      },
      system,
      messages: [{ role: "user", content: prompt }],
    });

    if (!response.parsed_output) {
      return Response.json({ error: "error.generic" }, { status: 502 });
    }
    return Response.json(response.parsed_output);
  } catch (err) {
    console.error("[study-buddy] plan failed:", err);
    return Response.json({ error: errorKey(err) }, { status: 500 });
  }
}
