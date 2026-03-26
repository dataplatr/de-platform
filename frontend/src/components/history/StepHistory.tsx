import { Trash2, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import type { StepHistoryEntry } from '../../types'
import clsx from 'clsx'

const nodeTypeIcon: Record<string, string> = {
  source: '🗃️',
  filter: '🔽',
  join: '🔗',
  aggregate: '∑',
  select: '📋',
}

const statusIcon = {
  pending: <Clock size={11} className="text-[#dcdcaa]" />,
  applied: <CheckCircle2 size={11} className="text-[#4ec9b0]" />,
  rejected: <XCircle size={11} className="text-[#f44747]" />,
}

function StepEntry({ entry, isSelected, onClick, onDelete }: {
  entry: StepHistoryEntry
  isSelected: boolean
  onClick: () => void
  onDelete: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'group flex items-start gap-2 px-3 py-2 cursor-pointer border-b border-[#2d2d30] hover:bg-[#2d2d30] transition-colors',
        isSelected && 'bg-[#1e3a5f] hover:bg-[#1e3a5f]'
      )}
    >
      {/* Step number + icon */}
      <div className="flex flex-col items-center gap-1 shrink-0">
        <span className="text-sm leading-none">{nodeTypeIcon[entry.nodeType] ?? '•'}</span>
        <span className="text-[10px] text-[#6a6a6a]">#{entry.id.slice(-2)}</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs text-[#cccccc] truncate font-medium">{entry.label}</span>
          {statusIcon[entry.status]}
        </div>
        <p className="text-[11px] text-[#969696] mt-0.5 leading-tight line-clamp-2">{entry.summary}</p>
        <span className="text-[10px] text-[#6a6a6a]">
          {new Date(entry.timestamp).toLocaleTimeString()}
        </span>
      </div>

      {/* Delete */}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="opacity-0 group-hover:opacity-100 icon-button shrink-0"
        title="Remove step"
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}

export function StepHistory() {
  const { stepHistory, selectedNodeId, setSelectedNode, removeNode } = useTransformationStore()

  if (stepHistory.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-[#6a6a6a] p-4">
        <Clock size={18} />
        <p className="text-xs text-center">No steps yet. Add a source table or describe a transformation below.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {stepHistory.map((entry) => (
        <StepEntry
          key={entry.id}
          entry={entry}
          isSelected={selectedNodeId === entry.nodeId}
          onClick={() => setSelectedNode(entry.nodeId)}
          onDelete={() => removeNode(entry.nodeId)}
        />
      ))}
    </div>
  )
}
