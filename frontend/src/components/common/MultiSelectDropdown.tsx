import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  accent?: string
}

export function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder = 'Select columns…',
  accent = 'text-[var(--accent-fg)]',
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  const toggle = useCallback(
    (name: string) => {
      onChange(selected.includes(name) ? selected.filter((s) => s !== name) : [...selected, name])
    },
    [selected, onChange]
  )
  const selectAll = useCallback(() => onChange([...options]), [options, onChange])
  const clearAll = useCallback(() => onChange([]), [onChange])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options
  }, [options, query])

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === options.length
        ? `All (${options.length})`
        : selected.length <= 2
          ? selected.join(', ')
          : `${selected.length} of ${options.length} selected`

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'w-full flex items-center justify-between gap-1 px-2 py-1.5 rounded text-xs',
          'bg-elevated border border-theme hover:border-[var(--text-3)] transition-colors',
          open && 'border-[var(--accent)]'
        )}
      >
        <span className={clsx('truncate', selected.length === 0 ? 'text-muted' : accent)}>
          {label}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {selected.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation()
                clearAll()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation()
                  clearAll()
                }
              }}
              className="text-muted hover:text-primary p-0.5 rounded"
              title="Clear selection"
            >
              <X size={10} />
            </span>
          )}
          <ChevronDown
            size={12}
            className={clsx('text-muted transition-transform', open && 'rotate-180')}
          />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-0.5 bg-surface border border-theme rounded shadow-xl overflow-hidden">
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-theme">
            <Search size={11} className="text-muted shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              aria-label="Search columns"
              className="flex-1 bg-transparent text-[11px] text-primary outline-none placeholder-[var(--text-3)]"
            />
          </div>

          <div className="flex items-center gap-2 px-2 py-1 border-b border-theme">
            <button
              type="button"
              onClick={selectAll}
              className="text-[10px] text-[var(--accent-fg)] hover:underline"
            >
              All
            </button>
            <span className="text-muted">·</span>
            <button
              type="button"
              onClick={clearAll}
              className="text-[10px] text-secondary hover:underline"
            >
              None
            </button>
            <span className="text-[10px] text-muted ml-auto">
              {selected.length}/{options.length}
            </span>
          </div>

          <div className="max-h-48 overflow-y-auto scrollbar-thin">
            {filtered.length === 0 ? (
              <p className="text-[11px] text-muted px-3 py-2 italic">No matches</p>
            ) : (
              filtered.map((opt) => {
                const on = selected.includes(opt)
                return (
                  <label
                    key={opt}
                    className={clsx(
                      'flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors',
                      on
                        ? 'bg-[var(--selected-bg)] hover:bg-[var(--selected-bg)]'
                        : 'hover:bg-elevated'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(opt)}
                      className="accent-[var(--accent)] cursor-pointer shrink-0"
                    />
                    <span
                      className={clsx(
                        'text-[11px] font-mono truncate',
                        on ? accent : 'text-secondary'
                      )}
                    >
                      {opt}
                    </span>
                  </label>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
