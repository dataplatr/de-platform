import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exportCSV } from '../utils/csvExport'
import type { PreviewResult } from '../types'

// jsdom does not implement URL.createObjectURL — stub it
beforeEach(() => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:mock-url'),
    revokeObjectURL: vi.fn(),
  })
})

const makePreview = (overrides?: Partial<PreviewResult>): PreviewResult => ({
  columns: [
    { name: 'id', type: 'INTEGER' },
    { name: 'name', type: 'VARCHAR' },
  ],
  rows: [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
  ],
  totalRows: 2,
  executionMs: 10,
  ...overrides,
})

describe('exportCSV', () => {
  it('triggers a download anchor click', () => {
    const clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: clickSpy,
    } as unknown as HTMLAnchorElement)

    exportCSV(makePreview())
    expect(clickSpy).toHaveBeenCalledOnce()
  })

  it('uses the provided filename', () => {
    let capturedFilename = ''
    vi.spyOn(document, 'createElement').mockReturnValue({
      get download() {
        return capturedFilename
      },
      set download(v: string) {
        capturedFilename = v
      },
      href: '',
      click: vi.fn(),
    } as unknown as HTMLAnchorElement)

    exportCSV(makePreview(), 'my_export.csv')
    expect(capturedFilename).toBe('my_export.csv')
  })

  it('escapes commas in cell values with double-quotes', () => {
    const blobSpy = vi.fn()
    vi.stubGlobal('Blob', blobSpy)
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: vi.fn(),
    } as unknown as HTMLAnchorElement)

    exportCSV(
      makePreview({
        rows: [{ id: 1, name: 'Smith, John' }],
      })
    )

    const csvContent: string = blobSpy.mock.calls[0][0][0]
    expect(csvContent).toContain('"Smith, John"')
  })

  it('escapes double-quotes in cell values', () => {
    const blobSpy = vi.fn()
    vi.stubGlobal('Blob', blobSpy)
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: vi.fn(),
    } as unknown as HTMLAnchorElement)

    exportCSV(
      makePreview({
        rows: [{ id: 1, name: 'Say "hello"' }],
      })
    )

    const csvContent: string = blobSpy.mock.calls[0][0][0]
    expect(csvContent).toContain('"Say ""hello"""')
  })

  it('renders null/undefined cells as empty strings', () => {
    const blobSpy = vi.fn()
    vi.stubGlobal('Blob', blobSpy)
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: vi.fn(),
    } as unknown as HTMLAnchorElement)

    exportCSV(
      makePreview({
        rows: [{ id: null, name: undefined }],
      })
    )

    const csvContent: string = blobSpy.mock.calls[0][0][0]
    // header row + data row with two empty values
    expect(csvContent).toContain('\n,')
  })
})
