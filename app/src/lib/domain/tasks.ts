import { toDay } from './dates';
import type { Task, TaskPriority } from './types';

const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, normal: 1, low: 2 };

export type DueState = 'overdue' | 'today' | 'upcoming' | 'none' | 'done';

export function dueState(t: Pick<Task, 'dueAt' | 'status'>, today: string): DueState {
  if (t.status === 'done') return 'done';
  if (!t.dueAt) return 'none';
  const d = t.dueAt.slice(0, 10);
  return d < today ? 'overdue' : d === today ? 'today' : 'upcoming';
}

/** Orden de trabajo: abiertas primero, vencidas arriba, luego por fecha y prioridad. */
export function sortTasks(tasks: readonly Task[], today: string): Task[] {
  const stateRank: Record<DueState, number> = { overdue: 0, today: 1, upcoming: 2, none: 3, done: 4 };
  return [...tasks].sort((a, b) => {
    const sa = stateRank[dueState(a, today)];
    const sb = stateRank[dueState(b, today)];
    if (sa !== sb) return sa - sb;
    const da = a.dueAt ?? '9999';
    const db = b.dueAt ?? '9999';
    if (da !== db) return da < db ? -1 : 1;
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  });
}

export function taskCounts(tasks: readonly Task[], today = toDay(new Date())) {
  const c = { overdue: 0, today: 0, upcoming: 0, none: 0, done: 0 };
  for (const t of tasks) c[dueState(t, today)]++;
  return { ...c, open: tasks.length - c.done };
}
