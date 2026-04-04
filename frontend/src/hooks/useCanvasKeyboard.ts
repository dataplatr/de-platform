/**
 * Canvas keyboard shortcuts.
 *
 * Ctrl/Cmd + Z       → Undo
 * Ctrl/Cmd + Shift+Z → Redo
 * Ctrl/Cmd + Y       → Redo (alternate)
 * Ctrl/Cmd + C       → Copy selected node(s)
 * Ctrl/Cmd + V       → Paste copied node(s) (offset +40,+40)
 * Ctrl/Cmd + D       → Duplicate selected node
 *
 * ReactFlow already handles Delete/Backspace via deleteKeyCode prop.
 * We do NOT intercept those — they go through onNodesChange 'remove'.
 */
import { useEffect } from 'react'
import { useTransformationStore } from '../store/transformationStore'
import { makeNodeId } from '../constants/nodeDefaults'
import type { TransformNode } from '../types'

export function useCanvasKeyboard() {
  const {
    nodes, edges, selectedNodeId,
    undo, redo,
    clipboard, setClipboard,
    addNode, batchUpdate,
  } = useTransformationStore()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey
      if (!meta) return

      // Never fire inside an input / textarea / contenteditable
      const tag = (e.target as HTMLElement)?.tagName
      const editable = (e.target as HTMLElement)?.isContentEditable
      if (tag === 'INPUT' || tag === 'TEXTAREA' || editable) return

      const key = e.key.toLowerCase()

      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }

      if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redo()
        return
      }

      if (key === 'c') {
        e.preventDefault()
        if (!selectedNodeId) return
        const node = nodes.find(n => n.id === selectedNodeId)
        if (node) setClipboard([node])
        return
      }

      if (key === 'v') {
        e.preventDefault()
        if (clipboard.length === 0) return
        // Paste each clipboard node with a position offset
        const OFFSET = 40
        const newNodes: TransformNode[] = clipboard.map(n => ({
          ...n,
          id: makeNodeId(),
          label: `${n.label} (copy)`,
          position: { x: n.position.x + OFFSET, y: n.position.y + OFFSET },
        }))
        // Each paste goes through addNode so history captures it
        newNodes.forEach(n => addNode(n))
        // Update clipboard positions so repeated Ctrl+V staggers correctly
        setClipboard(newNodes)
        return
      }

      if (key === 'd') {
        e.preventDefault()
        if (!selectedNodeId) return
        const node = nodes.find(n => n.id === selectedNodeId)
        if (!node) return
        addNode({
          ...node,
          id: makeNodeId(),
          label: `${node.label} copy`,
          position: { x: node.position.x + 40, y: node.position.y + 40 },
        })
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [nodes, edges, selectedNodeId, undo, redo, clipboard, setClipboard, addNode, batchUpdate])
}
