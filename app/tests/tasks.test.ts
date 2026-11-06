import { describe, expect, it } from 'vitest';
import { dueState, sortTasks, taskCounts } from '@/lib/domain/tasks';
import type { Task } from '@/lib/domain/types';

const t = (id: string, dueAt: string | undefined, priority: Task['priority'] = 'normal', status: Task['status'] = 'pending'): Task => ({
  id, organizationId: 'cardys_fiat', title: id, priority, status, dueAt, createdAt: '2026-11-01T00:00:00Z',
});
const today = '2026-11-06';

describe('tareas', () => {
  it('estado de vencimiento', () => {
    expect(dueState(t('a', '2026-11-05T10:00:00Z'), today)).toBe('overdue');
    expect(dueState(t('b', '2026-11-06T23:00:00Z'), today)).toBe('today');
    expect(dueState(t('c', '2026-11-08'), today)).toBe('upcoming');
    expect(dueState(t('d', undefined), today)).toBe('none');
    expect(dueState(t('e', '2026-11-01', 'high', 'done'), today)).toBe('done');
  });
  it('ordena vencidas primero, luego fecha y prioridad, completadas al final', () => {
    const order = sortTasks(
      [t('done', '2026-11-01', 'high', 'done'), t('later', '2026-11-09'), t('todayLow', '2026-11-06', 'low'), t('todayHigh', '2026-11-06', 'high'), t('late', '2026-11-02'), t('nodate', undefined)],
      today,
    ).map((x) => x.id);
    expect(order).toEqual(['late', 'todayHigh', 'todayLow', 'later', 'nodate', 'done']);
  });
  it('cuenta abiertas y vencidas', () => {
    const c = taskCounts([t('a', '2026-11-01'), t('b', '2026-11-06'), t('c', undefined, 'low', 'done')], today);
    expect(c).toMatchObject({ overdue: 1, today: 1, done: 1, open: 2 });
  });
});
