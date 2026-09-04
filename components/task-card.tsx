"use client";

import { useState } from "react";
import { useLang } from "./lang-provider";
import { Markdown } from "./markdown";
import { uid } from "@/lib/store";
import { type ExportFormat, exportPayload, taskToMarkdown } from "@/lib/export";
import type { Task, TaskPlan, TaskStatus } from "@/lib/types";
import type { TKey } from "@/lib/i18n";

const STATUS_ORDER: TaskStatus[] = ["todo", "doing", "done"];

/** Human-readable distance to the due date, plus the badge tone to use. */
function dueLabel(dueDate: string | undefined, t: (key: TKey, vars?: Record<string, number>) => string) {
  if (!dueDate) return { text: t("tasks.due.none"), tone: "" };
  const today = new Date(new Date().toISOString().slice(0, 10));
  const due = new Date(dueDate);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (days < 0) return { text: t("tasks.due.overdue"), tone: "badge-danger" };
  if (days === 0) return { text: t("tasks.due.today"), tone: "badge-danger" };
  if (days === 1) return { text: t("tasks.due.tomorrow"), tone: "badge-warn" };
  if (days <= 7) return { text: t("tasks.due.days", { n: days }), tone: "badge-warn" };
  return { text: dueDate, tone: "" };
}

interface Props {
  task: Task;
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onRemove: (id: string) => void;
}

export function TaskCard({ task, onUpdate, onRemove }: Props) {
  const { t, lang } = useLang();
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const due = dueLabel(task.dueDate, t as never);
  const doneCount = task.subtasks.filter((sub) => sub.done).length;
  const progress = task.subtasks.length
    ? Math.round((doneCount / task.subtasks.length) * 100)
    : 0;

  const breakdown = async () => {
    setPlanning(true);
    setError(null);
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, lang }),
      });
      const body = (await response.json()) as TaskPlan & { error?: string };
      if (!response.ok || body.error) throw new Error(body.error ?? "error.generic");

      onUpdate(task.id, {
        plan: body.plan,
        risks: body.risks ?? [],
        subtasks: (body.subtasks ?? []).map((sub) => ({
          id: uid(),
          title: sub.title,
          hours: sub.hours,
          target: sub.target,
          done: false,
        })),
      });
      setExpanded(true);
    } catch (err) {
      const key = (err as Error)?.message;
      setError(key?.startsWith("error.") ? key : "error.generic");
    } finally {
      setPlanning(false);
    }
  };

  const toggleSubtask = (id: string) =>
    onUpdate(task.id, {
      subtasks: task.subtasks.map((sub) =>
        sub.id === id ? { ...sub, done: !sub.done } : sub,
      ),
    });

  const exportTask = (format: ExportFormat) =>
    exportPayload(format, {
      title: task.title,
      markdown: taskToMarkdown(task, lang),
      lang,
    });

  const hasDetail = Boolean(task.plan || task.subtasks.length || task.risks?.length);

  return (
    <article className={task.status === "done" ? "task done" : "task"}>
      <div className="row-between">
        <h3 className="task-title">{task.title}</h3>
        <div className="row no-print">
          <div className="segmented">
            {STATUS_ORDER.map((status) => (
              <button
                key={status}
                type="button"
                aria-pressed={task.status === status}
                onClick={() => onUpdate(task.id, { status })}
              >
                {t(`tasks.status.${status}` as TKey)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="task-meta">
        {task.course && <span className="badge badge-accent">{task.course}</span>}
        <span className="badge">{t(`tasks.type.${task.type}` as TKey)}</span>
        <span
          className={
            task.priority === "high"
              ? "badge badge-danger"
              : task.priority === "medium"
                ? "badge badge-warn"
                : "badge"
          }
        >
          {t(`tasks.priority.${task.priority}` as TKey)}
        </span>
        <span className={`badge ${due.tone}`}>🗓 {due.text}</span>
        {task.subtasks.length > 0 && (
          <span className="badge badge-success">
            {doneCount}/{task.subtasks.length}
          </span>
        )}
      </div>

      {task.subtasks.length > 0 && (
        <div className="progress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
      )}

      {task.notes && !hasDetail && (
        <p className="small muted" style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
          {task.notes}
        </p>
      )}

      {error && (
        <div className="alert alert-error" style={{ marginTop: 10 }}>
          {t(error as TKey)}
        </div>
      )}

      <div className="row no-print" style={{ marginTop: 11 }}>
        <button
          type="button"
          className="button button-ghost button-sm"
          onClick={breakdown}
          disabled={planning}
        >
          {planning ? `✦ ${t("tasks.breakdown.running")}` : `✦ ${t("tasks.breakdown")}`}
        </button>

        {hasDetail && (
          <button
            type="button"
            className="button button-ghost button-sm"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "▴" : "▾"} {t("tasks.plan")}
          </button>
        )}

        <button
          type="button"
          className="button button-ghost button-sm"
          onClick={() => void exportTask("docx")}
        >
          ⤓ Word
        </button>
        <button
          type="button"
          className="button button-ghost button-sm"
          onClick={() => exportTask("pdf")}
        >
          🖨 PDF
        </button>

        <span className="spacer" />

        <button
          type="button"
          className="button button-danger button-sm"
          onClick={() => {
            if (window.confirm(t("tasks.deleteConfirm"))) onRemove(task.id);
          }}
        >
          {t("tasks.delete")}
        </button>
      </div>

      {expanded && hasDetail && (
        <div style={{ marginTop: 14 }}>
          {task.plan && <Markdown text={task.plan} />}

          {task.subtasks.length > 0 && (
            <>
              <strong className="small">{t("tasks.subtasks")}</strong>
              <ul className="subtasks">
                {task.subtasks.map((sub) => (
                  <li key={sub.id}>
                    <input
                      type="checkbox"
                      checked={sub.done}
                      onChange={() => toggleSubtask(sub.id)}
                      aria-label={sub.title}
                    />
                    <span className={sub.done ? "checked" : ""}>
                      {sub.title}
                      {(sub.hours || sub.target) && (
                        <span className="tiny muted">
                          {" "}
                          — {sub.hours ? `${sub.hours} ${t("tasks.hours")}` : ""}
                          {sub.hours && sub.target ? " · " : ""}
                          {sub.target ?? ""}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {!!task.risks?.length && (
            <div style={{ marginTop: 12 }}>
              <strong className="small">{t("tasks.risks")}</strong>
              <ul className="small muted" style={{ paddingInlineStart: 20, marginTop: 6 }}>
                {task.risks.map((risk, index) => (
                  <li key={index}>{risk}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
