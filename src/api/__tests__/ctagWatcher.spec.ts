import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createCtagWatcher } from '../ctagWatcher'

describe('createCtagWatcher', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('reports changed, added and removed collections, not the baseline', async () => {
    const ctags = [
      new Map([
        ['a/', '1'],
        ['b/', '1'],
      ]),
      new Map([
        ['a/', '2'],
        ['c/', '1'],
      ]),
    ]
    let i = 0
    const onChange = vi.fn<(changed: string[]) => void>()
    const watcher = createCtagWatcher({
      fetchCtags: async () => ctags[Math.min(i++, ctags.length - 1)]!,
      onChange,
      intervalMs: 1000,
    })

    await watcher.check() // baseline
    expect(onChange).not.toHaveBeenCalled()

    await watcher.check()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![0].sort()).toEqual(['a/', 'b/', 'c/'])

    await watcher.check() // nothing new
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('polls on the interval and on focus/visibility, and stops cleanly', async () => {
    const fetchCtags = vi.fn<() => Promise<Map<string, string>>>(async () => new Map())
    const watcher = createCtagWatcher({
      fetchCtags,
      onChange: vi.fn<() => void>(),
      intervalMs: 1000,
    })
    watcher.start()
    await vi.advanceTimersByTimeAsync(2500)
    expect(fetchCtags).toHaveBeenCalledTimes(2)

    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchCtags).toHaveBeenCalledTimes(3)

    watcher.stop()
    await vi.advanceTimersByTimeAsync(5000)
    window.dispatchEvent(new Event('focus'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchCtags).toHaveBeenCalledTimes(3)
  })

  it('routes fetch failures to onError and keeps going', async () => {
    const onError = vi.fn<(err: unknown) => void>()
    let fail = true
    const watcher = createCtagWatcher({
      fetchCtags: async () => {
        if (fail) throw new Error('boom')
        return new Map()
      },
      onChange: vi.fn<() => void>(),
      onError,
    })
    await watcher.check()
    expect(onError).toHaveBeenCalledOnce()
    fail = false
    await expect(watcher.check()).resolves.toBeUndefined()
  })
})
