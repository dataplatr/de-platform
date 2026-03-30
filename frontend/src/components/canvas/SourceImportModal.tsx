/**
 * SourceImportModal
 *
 * Architecture note (for future scale-up):
 *  - "Local" tab uploads through our FastAPI → server disk → DuckDB.
 *    Future: swap upload target to S3/Databricks DBFS/Snowflake stage and
 *    point DuckDB at the object-store path, so our server never touches the bytes.
 *  - "Databricks" / "Snowflake" tabs will use a connection-string approach:
 *    backend registers a DuckDB extension (delta, arrow_scan, snowflake connector)
 *    and the canvas Source node carries the connection ref instead of a file path.
 */
import { useCallback, useRef, useState } from 'react'
import { X, Upload, FileSpreadsheet, Loader2 } from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import { api } from '../../services/api'
import type { ColumnType } from '../../types'
import clsx from 'clsx'

type Tab = 'local' | 'databricks' | 'snowflake'

const makeId = () => `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

const MAX_WARN_MB = 100

interface Props {
  onClose: () => void
  /** If provided the node lands at this canvas position */
  position?: { x: number; y: number }
}

export function SourceImportModal({ onClose, position }: Props) {
  const { addNode, nodes, setDatabaseTree, setConnected } = useTransformationStore()

  const [tab, setTab] = useState<Tab>('local')
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Only CSV files are supported right now.')
      return
    }
    const sizeMB = file.size / 1_048_576
    if (sizeMB > MAX_WARN_MB) {
      setError(`File is ${sizeMB.toFixed(0)} MB. Large files may be slow — consider pre-filtering.`)
      // Don't block — let user proceed
    } else {
      setError(null)
    }

    setUploading(true)
    try {
      const { data } = await api.uploadCSV(file)
      // data = { table_name, row_count, columns: [{name, type, nullable}] }

      // Refresh the DB tree so the navigator shows the new table
      try {
        const treeRes = await api.getDbTree()
        setDatabaseTree(treeRes.data)
        setConnected(true)
      } catch { /* non-fatal */ }

      // Add a Source node to the canvas
      const pos = position ?? { x: 200 + nodes.filter(n => n.type === 'source').length * 60, y: 200 }
      addNode({
        id: makeId(),
        type: 'source',
        label: data.table_name,
        tableRef: data.table_name,
        columns: (data.columns as { name: string; type: string; nullable: boolean }[]).map(c => ({
          name: c.name,
          type: c.type as ColumnType,
          nullable: c.nullable,
        })),
        config: null,
        position: pos,
      })

      onClose()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Upload failed'
      setError(msg)
    } finally {
      setUploading(false)
    }
  }, [addNode, nodes, position, onClose, setDatabaseTree, setConnected])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const onDragLeave = useCallback(() => setDragging(false), [])

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }, [handleFile])

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-[480px] bg-[#252526] border border-[#3c3c3c] rounded-lg shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#3c3c3c]">
          <span className="text-sm font-semibold text-[#cccccc]">Add Source</span>
          <button type="button" onClick={onClose} className="icon-button">
            <X size={14} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#3c3c3c]">
          {([
            { id: 'local',       label: 'Local File',  disabled: false },
            { id: 'databricks',  label: 'Databricks',  disabled: true  },
            { id: 'snowflake',   label: 'Snowflake',   disabled: true  },
          ] as { id: Tab; label: string; disabled: boolean }[]).map(t => (
            <button
              key={t.id}
              type="button"
              disabled={t.disabled}
              onClick={() => !t.disabled && setTab(t.id)}
              className={clsx(
                'relative flex items-center gap-1.5 px-4 py-2 text-xs border-b-2 transition-colors',
                tab === t.id
                  ? 'border-[#0e639c] text-[#cccccc]'
                  : 'border-transparent text-[#6a6a6a]',
                t.disabled ? 'cursor-not-allowed' : 'hover:text-[#969696]'
              )}
            >
              {t.label}
              {t.disabled && (
                <span className="text-[9px] bg-[#3c3c3c] text-[#6a6a6a] px-1 py-0.5 rounded uppercase">Soon</span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="p-4">
          {tab === 'local' && (
            <div className="flex flex-col gap-3">
              {/* Drag & drop zone */}
              <div
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onClick={() => fileRef.current?.click()}
                className={clsx(
                  'flex flex-col items-center justify-center gap-2 h-36 rounded-lg border-2 border-dashed cursor-pointer transition-colors',
                  dragging
                    ? 'border-[#4fc1ff] bg-[#1e3a5f]/30'
                    : 'border-[#3c3c3c] hover:border-[#6a6a6a] hover:bg-[#2d2d30]'
                )}
              >
                {uploading ? (
                  <>
                    <Loader2 size={24} className="text-[#4fc1ff] animate-spin" />
                    <span className="text-xs text-[#969696]">Uploading…</span>
                  </>
                ) : (
                  <>
                    <div className={clsx(
                      'w-10 h-10 rounded-full flex items-center justify-center',
                      dragging ? 'bg-[#1e3a5f]' : 'bg-[#2d2d30]'
                    )}>
                      {dragging
                        ? <Upload size={18} className="text-[#4fc1ff]" />
                        : <FileSpreadsheet size={18} className="text-[#dcdcaa]" />
                      }
                    </div>
                    <p className="text-xs text-[#969696]">
                      {dragging ? 'Drop CSV to import' : 'Drag & drop CSV here, or click to browse'}
                    </p>
                    <p className="text-[11px] text-[#4a4a4a]">Supported: .csv · Max recommended: 100 MB</p>
                  </>
                )}
              </div>

              <input
                ref={fileRef}
                type="file"
                accept=".csv"
                onChange={onFileChange}
                className="hidden"
                aria-label="Upload CSV file"
              />

              {error && (
                <p className="text-[11px] text-[#dcdcaa] bg-[#3a2b1e] border border-[#5a4b2e] rounded px-3 py-2">
                  ⚠ {error}
                </p>
              )}

              {/* Info note */}
              <div className="text-[11px] text-[#4a4a4a] bg-[#1e1e1e] border border-[#2d2d30] rounded px-3 py-2 leading-relaxed">
                <span className="text-[#6a6a6a] font-semibold">How it works:</span> The CSV is registered as a DuckDB table
                in-memory for this session. In production, data will be staged directly
                to your compute platform (Databricks/Snowflake) — the canvas stays the same.
              </div>
            </div>
          )}

          {tab === 'databricks' && (
            <div className="flex flex-col items-center gap-3 py-8 text-[#6a6a6a]">
              <span className="text-2xl">🧱</span>
              <p className="text-sm text-[#969696] font-medium">Databricks connector coming soon</p>
              <p className="text-xs text-center max-w-xs">
                Connect to Unity Catalog or DBFS. Delta tables and notebooks will appear in the Sources panel.
              </p>
            </div>
          )}

          {tab === 'snowflake' && (
            <div className="flex flex-col items-center gap-3 py-8 text-[#6a6a6a]">
              <span className="text-2xl">❄️</span>
              <p className="text-sm text-[#969696] font-medium">Snowflake connector coming soon</p>
              <p className="text-xs text-center max-w-xs">
                Browse Snowflake databases directly. Transformations push down to Snowflake compute.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
