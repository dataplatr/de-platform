import { useState } from 'react'
import { GripHorizontal } from 'lucide-react'
import { TransformationCanvas } from '../canvas/TransformationCanvas'
import { CanvasToolbar } from '../canvas/CanvasToolbar'
import { ChatPromptBar } from '../canvas/ChatPromptBar'
import { DataPreview } from '../preview/DataPreview'

const MIN_CANVAS_HEIGHT = 180
const MIN_PREVIEW_HEIGHT = 80
const DEFAULT_PREVIEW_HEIGHT = 200

export function CenterPanel() {
  const [previewHeight, setPreviewHeight] = useState(DEFAULT_PREVIEW_HEIGHT)
  const [isDragging, setIsDragging] = useState(false)

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    const startY = e.clientY
    const startHeight = previewHeight

    const onMouseMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY
      setPreviewHeight(Math.max(MIN_PREVIEW_HEIGHT, Math.min(startHeight + delta, window.innerHeight - MIN_CANVAS_HEIGHT)))
    }
    const onMouseUp = () => {
      setIsDragging(false)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar — always visible above canvas */}
      <CanvasToolbar />

      {/* Canvas area */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <TransformationCanvas />
        <ChatPromptBar />
      </div>

      {/* Vertical resize handle */}
      <div
        className={`flex items-center justify-center h-1.5 border-t border-b border-[#3c3c3c] cursor-row-resize shrink-0 hover:bg-[#3c3c3c] transition-colors ${isDragging ? 'bg-[#3c3c3c]' : 'bg-[#1e1e1e]'}`}
        onMouseDown={handleDividerMouseDown}
      >
        <GripHorizontal size={12} className="text-[#6a6a6a]" />
      </div>

      {/* Preview panel */}
      {/* eslint-disable-next-line react/forbid-component-props */}
      <div className="shrink-0 border-t border-[#3c3c3c] overflow-hidden" style={{ height: previewHeight }}>
        <DataPreview />
      </div>
    </div>
  )
}
