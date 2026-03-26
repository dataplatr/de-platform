import { useState } from 'react'
import Editor from '@monaco-editor/react'
import { Copy, Maximize2, Minimize2, Code2 } from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'

export function SqlViewer() {
  const { generatedSQL, isSqlViewExpanded, toggleSqlView } = useTransformationStore()
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (!generatedSQL) return
    navigator.clipboard.writeText(generatedSQL).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const placeholder = `-- Generated SQL will appear here
-- Select a node on the canvas to view its SQL`

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#3c3c3c] bg-[#252526] shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-[#969696]">
          <Code2 size={12} />
          <span>Generated SQL</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            disabled={!generatedSQL}
            className="icon-button text-[10px]"
            title="Copy SQL"
          >
            {copied ? (
              <span className="text-[#4ec9b0] text-[10px]">Copied!</span>
            ) : (
              <Copy size={11} />
            )}
          </button>
          <button
            onClick={toggleSqlView}
            className="icon-button"
            title={isSqlViewExpanded ? 'Collapse' : 'Expand'}
          >
            {isSqlViewExpanded ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
          </button>
        </div>
      </div>

      {/* Monaco editor */}
      <div className="flex-1 overflow-hidden">
        <Editor
          language="sql"
          value={generatedSQL || placeholder}
          theme="vs-dark"
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 11,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            folding: false,
            lineDecorationsWidth: 0,
            lineNumbersMinChars: 3,
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
            padding: { top: 8, bottom: 8 },
            renderLineHighlight: 'none',
          }}
        />
      </div>
    </div>
  )
}
