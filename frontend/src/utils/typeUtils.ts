/**
 * Maps a DuckDB type string to a frontend ColumnType.
 * Previously duplicated in AppShell.tsx (normalizeType).
 */
export function normalizeColumnType(duckType: string): string {
  const t = duckType.toUpperCase()
  if (t.includes('INT'))                                                    return 'INTEGER'
  if (t.includes('FLOAT') || t.includes('DOUBLE') || t.includes('DECIMAL') || t.includes('NUMERIC')) return 'FLOAT'
  if (t.includes('VARCHAR') || t.includes('TEXT') || t.includes('CHAR'))   return 'VARCHAR'
  if (t.includes('BOOL'))                                                   return 'BOOLEAN'
  if (t.includes('TIMESTAMP'))                                              return 'TIMESTAMP'
  if (t === 'DATE')                                                         return 'DATE'
  return 'UNKNOWN'
}
