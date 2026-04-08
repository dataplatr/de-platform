import { useEffect, useRef } from 'react'
import clsx from 'clsx'

export interface MenuItem {
  label: string
  icon?: string
  onClick: () => void
  danger?: boolean
  separator?: boolean
  disabled?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent | KeyboardEvent) => {
      if ('key' in e && e.key !== 'Escape') return
      onClose()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [onClose])

  // Clamp to viewport
  const clampedX = Math.min(x, window.innerWidth - 220)
  const clampedY = Math.min(y, window.innerHeight - items.length * 32 - 16)

  return (
    <div
      ref={ref}
      className="ctx-menu fixed z-50 rounded py-1 min-w-[190px] text-xs"
      style={{ left: clampedX, top: clampedY }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return <div key={i} className="ctx-menu-sep h-px my-1" />
        }
        return (
          <button
            key={i}
            type="button"
            disabled={item.disabled}
            onClick={() => {
              item.onClick()
              onClose()
            }}
            className={clsx(
              'w-full flex items-center gap-2.5 px-3 py-1.5 text-left transition-colors',
              item.danger ? 'ctx-menu-danger' : 'ctx-menu-item',
              item.disabled && 'opacity-40 cursor-not-allowed pointer-events-none'
            )}
          >
            {item.icon && <span className="w-4 text-center shrink-0">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
