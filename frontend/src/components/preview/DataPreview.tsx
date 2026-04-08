import { useCallback } from 'react'
import { RefreshCw, Table2, Download } from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import clsx from 'clsx'
import { exportCSV } from '../../utils/csvExport'

export function DataPreview() {
  const {
    inputPreview,
    outputPreview,
    isPreviewLoading,
    bottomPanelTab,
    setBottomPanelTab,
    pipelineName,
  } = useTransformationStore()

  const activePreview = bottomPanelTab === 'input' ? inputPreview : outputPreview

  const handleExport = useCallback(() => {
    if (!activePreview) return
    const name = `${pipelineName.replace(/\s+/g, '_')}_${bottomPanelTab}.csv`
    exportCSV(activePreview, name)
  }, [activePreview, pipelineName, bottomPanelTab])

  return (
    <div className="preview-panel flex flex-col h-full border-t border-theme">
      {/* Header */}
      <div className="preview-header flex items-center justify-between px-3 shrink-0 border-b border-theme">
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setBottomPanelTab('input')}
            className={clsx(
              'preview-tab px-3 py-2 text-xs',
              bottomPanelTab === 'input' && 'active'
            )}
          >
            Input
          </button>
          <button
            type="button"
            onClick={() => setBottomPanelTab('output')}
            className={clsx(
              'preview-tab px-3 py-2 text-xs',
              bottomPanelTab === 'output' && 'active'
            )}
          >
            Output
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted">
          {activePreview && (
            <>
              <span>{activePreview.totalRows.toLocaleString()} rows</span>
              {activePreview.sampled && (
                <span className="bg-elevated border border-theme text-warning px-1.5 py-0.5 rounded text-[10px]">
                  sampled
                </span>
              )}
              {activePreview.executionMs !== undefined && (
                <span>{activePreview.executionMs}ms</span>
              )}
              <button
                type="button"
                onClick={handleExport}
                title="Export as CSV"
                className="csv-export-btn flex items-center gap-1 px-2 py-0.5 rounded text-[10px]"
              >
                <Download size={10} />
                CSV
              </button>
            </>
          )}
          <button type="button" className="icon-button" title="Refresh preview">
            <RefreshCw size={11} className={isPreviewLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto scrollbar-thin">
        {isPreviewLoading ? (
          <div className="flex items-center justify-center h-full gap-2 text-xs text-muted">
            <RefreshCw size={13} className="animate-spin" />
            Loading preview…
          </div>
        ) : activePreview ? (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="preview-th sticky top-0 z-10">
                {activePreview.columns.map((col) => (
                  <th
                    key={col.name}
                    className="preview-th text-left px-3 py-1.5 border-b border-theme font-normal whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-primary">{col.name}</span>
                      <span className="text-muted text-[10px] font-mono">
                        {col.type.toLowerCase()}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activePreview.rows.map((row, ri) => (
                <tr key={ri} className="preview-tr border-b border-theme">
                  {activePreview.columns.map((col) => (
                    <td key={col.name} className="preview-td px-3 py-1 font-mono whitespace-nowrap">
                      {row[col.name] === null || row[col.name] === undefined ? (
                        <span className="text-muted italic">null</span>
                      ) : (
                        String(row[col.name])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="preview-empty flex flex-col items-center justify-center h-full gap-2">
            <Table2 size={20} />
            <p className="text-xs">Select a node and click Preview</p>
          </div>
        )}
      </div>
    </div>
  )
}
