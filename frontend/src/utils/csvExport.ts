import type { PreviewResult } from '../types'

/** Exports a PreviewResult as a CSV file download. */
export function exportCSV(preview: PreviewResult, filename = 'export.csv'): void {
  const header = preview.columns.map((c) => c.name).join(',')
  const rows = preview.rows.map((row) =>
    preview.columns
      .map((c) => {
        const val = row[c.name]
        if (val === null || val === undefined) return ''
        const s = String(val)
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s
      })
      .join(',')
  )
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
