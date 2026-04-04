import { useCallback, useState } from 'react'
import {
  Database, Filter, Merge, BarChart3, Columns2, Wand2, ScanLine, ArrowRightToLine,
} from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import { SourceImportModal } from './SourceImportModal'
import { DEFAULT_CONFIGS, makeNodeId } from '../../constants/nodeDefaults'
import type { TransformNode } from '../../types'

const TOOL_DEFS: {
  type: TransformNode['type']
  label: string
  Icon: React.ComponentType<{ size?: number; className?: string }>
  colorClass: string
}[] = [
  { type: 'filter',      label: 'Filter',      Icon: Filter,           colorClass: 'toolbar-chip-filter'      },
  { type: 'join',        label: 'Join',         Icon: Merge,            colorClass: 'toolbar-chip-join'        },
  { type: 'transform',   label: 'Transform',    Icon: Wand2,            colorClass: 'toolbar-chip-transform'   },
  { type: 'aggregate',   label: 'Aggregate',    Icon: BarChart3,        colorClass: 'toolbar-chip-aggregate'   },
  { type: 'deduplicate', label: 'Deduplicate',  Icon: ScanLine,         colorClass: 'toolbar-chip-deduplicate' },
  { type: 'select',      label: 'Select',       Icon: Columns2,         colorClass: 'toolbar-chip-select'      },
]

/** Set drag data so the canvas can distinguish a tool-drag from a node-drag. */
function onChipDragStart(e: React.DragEvent, type: TransformNode['type'], label: string) {
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData(
    'application/lakeflow-tool',
    JSON.stringify({ type, label }),
  )
}

export function CanvasToolbar() {
  const { addNode, nodes } = useTransformationStore()
  const [showImport, setShowImport] = useState(false)

  const addNodeType = useCallback((type: TransformNode['type']) => {
    if (type === 'source') { setShowImport(true); return }
    const offset = nodes.length * 20
    const baseX: Record<string, number> = {
      filter: 320, join: 540, aggregate: 760, select: 980,
      transform: 200, deduplicate: 420, output: 700,
    }
    addNode({
      id: makeNodeId(),
      type,
      label: type === 'output'
        ? `output_${nodes.filter(n => n.type === 'output').length + 1}`
        : `${type.charAt(0).toUpperCase() + type.slice(1)} ${nodes.filter(n => n.type === type).length + 1}`,
      config: DEFAULT_CONFIGS[type],
      position: { x: (baseX[type] ?? 100) + offset, y: 200 + offset },
    })
  }, [addNode, nodes])

  return (
    <>
      <div className="toolbar-wrap flex items-center gap-1 px-2 py-1 shrink-0">

        {/* Source — no snap-drag, just click */}
        <button
          type="button"
          onClick={() => setShowImport(true)}
          title="Add Source table"
          className="toolbar-chip toolbar-chip-source flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
        >
          <Database size={12} className="shrink-0" />
          <span>Source</span>
        </button>

        <div className="toolbar-divider" />

        {/* Transformation steps — draggable for edge-snap */}
        {TOOL_DEFS.map(({ type, label, Icon, colorClass }) => (
          <button
            key={type}
            type="button"
            draggable
            onDragStart={e => onChipDragStart(e, type, label)}
            onClick={() => addNodeType(type)}
            title={`Add ${label} — drag onto an edge to insert`}
            className={`toolbar-chip ${colorClass} flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-grab active:cursor-grabbing`}
          >
            <Icon size={12} className="shrink-0" />
            <span>{label}</span>
          </button>
        ))}

        <div className="toolbar-divider" />

        {/* Output — draggable for free placement */}
        <button
          type="button"
          draggable
          onDragStart={e => onChipDragStart(e, 'output', 'output')}
          onClick={() => addNodeType('output')}
          title="Add Output — drag to place"
          className="toolbar-chip toolbar-chip-output flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-grab active:cursor-grabbing"
        >
          <ArrowRightToLine size={12} className="shrink-0" />
          <span>Output</span>
        </button>
      </div>

      {showImport && (
        <SourceImportModal onClose={() => setShowImport(false)} />
      )}
    </>
  )
}
