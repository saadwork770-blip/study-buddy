"use client";

import { useCallback, useEffect, useState } from "react";
import type { LibraryItem, Task } from "./types";

const KEYS = {
  tasks: "sb.tasks",
  library: "sb.library",
  lang: "sb.lang",
  theme: "sb.theme",
} as const;

export const uid = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * localStorage-backed state. Everything the student writes stays in their own
 * browser — there is no account and no server-side database.
 */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setValue(read<T>(key, initial));
    setReady(true);
    // `initial` is a literal at every call site; re-reading on identity changes
    // would clobber state on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota exceeded or storage disabled — keep the in-memory state working.
    }
  }, [key, value, ready]);

  return [value, setValue, ready] as const;
}

export function useTasks() {
  const [tasks, setTasks, ready] = usePersistentState<Task[]>(KEYS.tasks, []);

  const addTask = useCallback(
    (task: Omit<Task, "id" | "createdAt" | "subtasks" | "status">) => {
      const created: Task = {
        ...task,
        id: uid(),
        status: "todo",
        subtasks: [],
        createdAt: new Date().toISOString(),
      };
      setTasks((current) => [created, ...current]);
      return created;
    },
    [setTasks],
  );

  const updateTask = useCallback(
    (id: string, patch: Partial<Task>) =>
      setTasks((current) =>
        current.map((task) => (task.id === id ? { ...task, ...patch } : task)),
      ),
    [setTasks],
  );

  const removeTask = useCallback(
    (id: string) => setTasks((current) => current.filter((task) => task.id !== id)),
    [setTasks],
  );

  return { tasks, setTasks, addTask, updateTask, removeTask, ready };
}

export function useLibrary() {
  const [items, setItems, ready] = usePersistentState<LibraryItem[]>(KEYS.library, []);

  const saveItem = useCallback(
    (item: Omit<LibraryItem, "id" | "createdAt">) => {
      const created: LibraryItem = {
        ...item,
        id: uid(),
        createdAt: new Date().toISOString(),
      };
      setItems((current) => [created, ...current]);
      return created;
    },
    [setItems],
  );

  const removeItem = useCallback(
    (id: string) => setItems((current) => current.filter((item) => item.id !== id)),
    [setItems],
  );

  return { items, setItems, saveItem, removeItem, ready };
}

export interface Backup {
  app: "study-buddy";
  version: 1;
  exportedAt: string;
  tasks: Task[];
  library: LibraryItem[];
}

export function readBackup(): Backup {
  return {
    app: "study-buddy",
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks: read<Task[]>(KEYS.tasks, []),
    library: read<LibraryItem[]>(KEYS.library, []),
  };
}

/** Merges a backup into local storage, skipping ids that already exist. */
export function applyBackup(backup: Backup) {
  const tasks = read<Task[]>(KEYS.tasks, []);
  const library = read<LibraryItem[]>(KEYS.library, []);
  const taskIds = new Set(tasks.map((task) => task.id));
  const itemIds = new Set(library.map((item) => item.id));

  const mergedTasks = [
    ...(backup.tasks ?? []).filter((task) => task?.id && !taskIds.has(task.id)),
    ...tasks,
  ];
  const mergedLibrary = [
    ...(backup.library ?? []).filter((item) => item?.id && !itemIds.has(item.id)),
    ...library,
  ];

  window.localStorage.setItem(KEYS.tasks, JSON.stringify(mergedTasks));
  window.localStorage.setItem(KEYS.library, JSON.stringify(mergedLibrary));
}

export const STORAGE_KEYS = KEYS;
