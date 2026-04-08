import { useState, useRef, useCallback } from 'react'

/**
 * Generic panel-resize hook.
 * Returns a size + a mousedown handler.
 * Pass `inverted=true` when dragging toward negative X/Y should GROW the panel
 * (e.g. right panel's left edge, or SQL panel's top edge).
 */
export function useResize(
  initial: number,
  min: number,
  max: number,
  axis: 'x' | 'y' = 'x',
  inverted = false
) {
  const [size, setSize] = useState(initial)
  const sizeRef = useRef(size)
  sizeRef.current = size

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startPos = axis === 'x' ? e.clientX : e.clientY
      const startSize = sizeRef.current

      const onMouseMove = (ev: MouseEvent) => {
        const current = axis === 'x' ? ev.clientX : ev.clientY
        const delta = inverted ? startPos - current : current - startPos
        setSize(Math.max(min, Math.min(max, startSize + delta)))
      }

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove)
        window.removeEventListener('mouseup', onMouseUp)
      }

      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
    },
    [axis, inverted, min, max]
  )

  return { size, onMouseDown }
}
