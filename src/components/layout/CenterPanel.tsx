import { useState } from 'react'
import { TransformationCanvas } from '../canvas/TransformationCanvas'
import { ChatPromptBar } from '../canvas/ChatPromptBar'
import { DataPreview } from '../preview/DataPreview'
import { GripHorizontal } from 'lucide-react'

const MIN_CANVAS_HEIGHT = 200
const MIN_PREVIEW_HEIGHT = 100
const DEFAULT_PREVIEW_HEIGHT = 220

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
      const newHeight = Math.max(MIN_PREVIEW_HEIGHT, Math.min(startHeight + delta, window.innerHeight - MIN_CANVAS_HEIGHT))
      setPreviewHeight(newHeight)
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
      {/* Canvas area — takes remaining space */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        <TransformationCanvas />
        <ChatPromptBar />
      </div>

      {/* Resize divider */}
      <div
        className={`flex items-center justify-center h-1.5 bg-[#1e1e1e] border-t border-b border-[#3c3c3c] cursor-row-resize shrink-0 hover:bg-[#3c3c3c] transition-colors ${isDragging ? 'bg-[#3c3c3c]' : ''}`}
        onMouseDown={handleDividerMouseDown}
      >
        <GripHorizontal size={12} className="text-[#6a6a6a]" />
      </div>

      {/* Preview panel — resizable from bottom */}
      <div
        className="shrink-0 border-t border-[#3c3c3c] overflow-hidden"
        style={{ height: previewHeight }}
      >
        <DataPreview />
      </div>
    </div>
  )
}
