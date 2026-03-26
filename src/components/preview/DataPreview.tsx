import { RefreshCw, AlertCircle, Table2 } from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import clsx from 'clsx'

export function DataPreview() {
  const {
    inputPreview, outputPreview, isPreviewLoading,
    bottomPanelTab, setBottomPanelTab,
  } = useTransformationStore()

  const activePreview = bottomPanelTab === 'input' ? inputPreview : outputPreview

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 shrink-0 border-b border-[#3c3c3c] bg-[#252526]">
        <div className="flex items-center">
          <button
            onClick={() => setBottomPanelTab('input')}
            className={clsx(
              'px-3 py-2 text-xs border-b-2 transition-colors',
              bottomPanelTab === 'input'
                ? 'border-[#0e639c] text-[#cccccc]'
                : 'border-transparent text-[#969696] hover:text-[#cccccc]'
            )}
          >
            Input
          </button>
          <button
            onClick={() => setBottomPanelTab('output')}
            className={clsx(
              'px-3 py-2 text-xs border-b-2 transition-colors',
              bottomPanelTab === 'output'
                ? 'border-[#0e639c] text-[#cccccc]'
                : 'border-transparent text-[#969696] hover:text-[#cccccc]'
            )}
          >
            Output
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#6a6a6a]">
          {activePreview && (
            <>
              <span>{activePreview.totalRows.toLocaleString()} rows</span>
              {activePreview.sampled && (
                <span className="bg-[#3a2b1e] text-[#dcdcaa] px-1.5 py-0.5 rounded text-[10px]">
                  sampled
                </span>
              )}
              {activePreview.executionMs !== undefined && (
                <span>{activePreview.executionMs}ms</span>
              )}
            </>
          )}
          <button className="icon-button" title="Refresh preview">
            <RefreshCw size={11} className={isPreviewLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto scrollbar-thin">
        {isPreviewLoading ? (
          <div className="flex items-center justify-center h-full gap-2 text-xs text-[#6a6a6a]">
            <RefreshCw size={13} className="animate-spin" />
            Loading preview…
          </div>
        ) : activePreview ? (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="sticky top-0 bg-[#252526] z-10">
                {activePreview.columns.map((col) => (
                  <th
                    key={col.name}
                    className="text-left px-3 py-1.5 text-[#969696] border-b border-[#3c3c3c] font-normal whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-[#cccccc]">{col.name}</span>
                      <span className="text-[#6a6a6a] text-[10px] font-mono">{col.type.toLowerCase()}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activePreview.rows.map((row, ri) => (
                <tr key={ri} className="hover:bg-[#252526] border-b border-[#2d2d30]">
                  {activePreview.columns.map((col) => (
                    <td
                      key={col.name}
                      className="px-3 py-1 text-[#cccccc] font-mono whitespace-nowrap"
                    >
                      {row[col.name] === null || row[col.name] === undefined
                        ? <span className="text-[#6a6a6a] italic">null</span>
                        : String(row[col.name])
                      }
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-[#6a6a6a]">
            <Table2 size={20} />
            <p className="text-xs">Select a node to preview data</p>
          </div>
        )}
      </div>
    </div>
  )
}
