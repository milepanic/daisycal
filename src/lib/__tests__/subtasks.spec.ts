import { describe, expect, it } from 'vitest'

import type { Task } from '@/api/ical'
import { descendantsOf, nestTasks, subtaskProgress } from '../subtasks'

const t = (uid: string, parentUid: string | null = null, completed = false) =>
  ({ uid, parentUid, completed, summary: uid }) as Task

describe('subtasks', () => {
  it('puts subtasks right under their parent and keeps the order within a level', () => {
    const list = [t('a'), t('b'), t('a2', 'a'), t('a1', 'a'), t('a1x', 'a1'), t('orphan', 'gone')]
    expect(nestTasks(list).map((n) => `${'-'.repeat(n.depth)}${n.task.uid}`)).toEqual([
      'a',
      '-a2',
      '-a1',
      '--a1x',
      'b',
      'orphan',
    ])
  })

  it('survives loops in broken data', () => {
    const list = [t('x', 'y'), t('y', 'x'), t('self', 'self')]
    expect(
      nestTasks(list)
        .map((n) => n.task.uid)
        .sort(),
    ).toEqual(['self', 'x', 'y'])
  })

  it('finds all descendants and counts direct subtasks', () => {
    const list = [t('a'), t('a1', 'a', true), t('a2', 'a'), t('a1x', 'a1')]
    expect(descendantsOf('a', list).map((x) => x.uid)).toEqual(['a1', 'a2', 'a1x'])
    expect(subtaskProgress('a', list)).toEqual({ done: 1, total: 2 })
    expect(subtaskProgress('a2', list)).toBeNull()
  })
})
