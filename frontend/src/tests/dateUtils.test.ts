import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { timeAgo } from '../utils/dateUtils'

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-01-01T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns "just now" for timestamps less than 1 minute ago', () => {
    const iso = new Date(Date.now() - 30_000).toISOString()
    expect(timeAgo(iso)).toBe('just now')
  })

  it('returns minutes ago for timestamps within the last hour', () => {
    const iso = new Date(Date.now() - 15 * 60_000).toISOString()
    expect(timeAgo(iso)).toBe('15m ago')
  })

  it('returns hours ago for timestamps within the last day', () => {
    const iso = new Date(Date.now() - 3 * 3600_000).toISOString()
    expect(timeAgo(iso)).toBe('3h ago')
  })

  it('returns days ago for timestamps older than 24 hours', () => {
    const iso = new Date(Date.now() - 2 * 86_400_000).toISOString()
    expect(timeAgo(iso)).toBe('2d ago')
  })

  it('returns "just now" for a timestamp at exactly now', () => {
    const iso = new Date(Date.now()).toISOString()
    expect(timeAgo(iso)).toBe('just now')
  })
})
