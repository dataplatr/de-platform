import { useCallback, useState } from 'react'
import { useTransformationStore } from '../../store/transformationStore'
import { SourceImportModal } from './SourceImportModal'
import { DEFAULT_CONFIGS, makeNodeId } from '../../constants/nodeDefaults'
import { TOOLBAR_STEP_DEFS } from '../../constants/nodeMetadata'
import type { TransformNode } from '../../types'

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
        {/* Source */}
        <button
          type="button"
          onClick={() => setShowImport(true)}
          title="Add Source table"
          className="toolbar-btn-source flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors"
        >
          <span>🗃️</span>
          <span>Source</span>
        </button>

        <div className="toolbar-divider" />

        {/* Transformation steps */}
        {TOOLBAR_STEP_DEFS.map(({ type, label, icon }) => (
          <button
            key={type}
            type="button"
            onClick={() => addNodeType(type)}
            title={`Add ${label} step`}
            className={`toolbar-btn-${type} flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors`}
          >
            <span>{icon}</span>
            <span>{label}</span>
          </button>
        ))}

        <div className="toolbar-divider" />

        {/* Output */}
        <button
          type="button"
          onClick={() => addNodeType('output')}
          title="Add Output (target table)"
          className="toolbar-btn-output flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors"
        >
          <span>🎯</span>
          <span>Output</span>
        </button>
      </div>

      {showImport && (
        <SourceImportModal onClose={() => setShowImport(false)} />
      )}
    </>
  )
}
