"use client";

import { useMemo, useState } from "react";
import { useLang } from "@/components/lang-provider";
import { TaskCard } from "@/components/task-card";
import { useTasks } from "@/lib/store";
import { exportTasksCsv } from "@/lib/export";
import type { Priority, Task, TaskStatus, TaskType } from "@/lib/types";
import type { TKey } from "@/lib/i18n";

const TYPES: TaskType[] = [
  "assignment",
  "reading",
  "research",
  "presentation",
  "exam",
  "other",
];
const PRIORITIES: Priority[] = ["low", "medium", "high"];
const FILTERS: (TaskStatus | "all")[] = ["all", "todo", "doing", "done"];

const today = () => new Date().toISOString().slice(0, 10);

export default function TasksPage() {
  const { t, lang } = useLang();
  const { tasks, addTask, updateTask, removeTask, ready } = useTasks();
  const [filter, setFilter] = useState<TaskStatus | "all">("all");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    course: "",
    type: "assignment" as TaskType,
    dueDate: "",
    priority: "medium" as Priority,
    notes: "",
  });

  const stats = useMemo(() => {
    const now = new Date(today());
    const week = new Date(now);
    week.setDate(week.getDate() + 7);

    let done = 0;
    let soon = 0;
    let overdue = 0;
    for (const task of tasks) {
      if (task.status === "done") {
        done++;
        continue;
      }
      if (!task.dueDate) continue;
      const due = new Date(task.dueDate);
      if (due < now) overdue++;
      else if (due <= week) soon++;
    }
    return { total: tasks.length, done, soon, overdue };
  }, [tasks]);

  const visible = useMemo(() => {
    const list = filter === "all" ? tasks : tasks.filter((task) => task.status === filter);
    // Undated tasks sink to the bottom; everything else is earliest-first.
    return [...list].sort((a, b) => {
      if (a.status === "done" && b.status !== "done") return 1;
      if (b.status === "done" && a.status !== "done") return -1;
      if (!a.dueDate) return b.dueDate ? 1 : 0;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    });
  }, [tasks, filter]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim()) return;
    addTask({
      title: draft.title.trim(),
      course: draft.course.trim() || undefined,
      type: draft.type,
      dueDate: draft.dueDate || undefined,
      priority: draft.priority,
      notes: draft.notes.trim() || undefined,
    });
    setDraft({
      title: "",
      course: "",
      type: "assignment",
      dueDate: "",
      priority: "medium",
      notes: "",
    });
    setOpen(false);
  };

  return (
    <main className="page">
      <div className="page-head row-between">
        <div>
          <h1>{t("tasks.title")}</h1>
          <p>{t("tasks.subtitle")}</p>
        </div>
        <div className="row no-print">
          <button type="button" className="button" onClick={() => setOpen((value) => !value)}>
            {open ? t("common.cancel") : `+ ${t("tasks.add")}`}
          </button>
          <button
            type="button"
            className="button button-ghost"
            disabled={!tasks.length}
            onClick={() => exportTasksCsv(tasks, lang)}
          >
            ⤓ {t("tasks.exportCsv")}
          </button>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="value">{stats.total}</div>
          <div className="label">{t("tasks.stats.total")}</div>
        </div>
        <div className="stat">
          <div className="value" style={{ color: "var(--success)" }}>
            {stats.done}
          </div>
          <div className="label">{t("tasks.stats.done")}</div>
        </div>
        <div className="stat">
          <div className="value" style={{ color: "var(--warn)" }}>
            {stats.soon}
          </div>
          <div className="label">{t("tasks.stats.soon")}</div>
        </div>
        <div className="stat">
          <div className="value" style={{ color: "var(--danger)" }}>
            {stats.overdue}
          </div>
          <div className="label">{t("tasks.stats.overdue")}</div>
        </div>
      </div>

      {open && (
        <form className="card" onSubmit={submit} style={{ marginBottom: 18 }}>
          <h2>{t("tasks.new")}</h2>
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="title">{t("tasks.field.title")}</label>
              <input
                id="title"
                type="text"
                required
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="course">{t("tasks.field.course")}</label>
              <input
                id="course"
                type="text"
                value={draft.course}
                onChange={(event) => setDraft({ ...draft, course: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="type">{t("tasks.field.type")}</label>
              <select
                id="type"
                value={draft.type}
                onChange={(event) =>
                  setDraft({ ...draft, type: event.target.value as TaskType })
                }
              >
                {TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`tasks.type.${type}` as TKey)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="due">{t("tasks.field.due")}</label>
              <input
                id="due"
                type="date"
                value={draft.dueDate}
                onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="priority">{t("tasks.field.priority")}</label>
              <select
                id="priority"
                value={draft.priority}
                onChange={(event) =>
                  setDraft({ ...draft, priority: event.target.value as Priority })
                }
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {t(`tasks.priority.${priority}` as TKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="notes">{t("tasks.field.notes")}</label>
            <textarea
              id="notes"
              value={draft.notes}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
            />
            <span className="hint">{t("tasks.field.notesHint")}</span>
          </div>

          <button type="submit" className="button">
            {t("common.save")}
          </button>
        </form>
      )}

      <div className="row no-print" style={{ marginBottom: 14 }}>
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            className="chip"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === "all" ? t("tasks.filter.all") : t(`tasks.status.${value}` as TKey)}
          </button>
        ))}
      </div>

      {!ready ? null : visible.length === 0 ? (
        <div className="empty-state">{t("tasks.empty")}</div>
      ) : (
        visible.map((task: Task) => (
          <TaskCard key={task.id} task={task} onUpdate={updateTask} onRemove={removeTask} />
        ))
      )}
    </main>
  );
}
