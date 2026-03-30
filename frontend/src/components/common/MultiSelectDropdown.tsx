import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Search, X } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  accent?: string   // tailwind text color, e.g. 'text-[#9cdcfe]'
}

export function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder = 'Select columns…',
  accent = 'text-[#9cdcfe]',
}: Props) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)

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

  const toggle    = useCallback((name: string) => {
    onChange(selected.includes(name) ? selected.filter(s => s !== name) : [...selected, name])
  }, [selected, onChange])
  const selectAll = useCallback(() => onChange([...options]), [options, onChange])
  const clearAll  = useCallback(() => onChange([]), [onChange])

  const filtered = query.trim()
    ? options.filter(o => o.toLowerCase().includes(query.toLowerCase()))
    : options

  const label = selected.length === 0
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
        onClick={() => setOpen(o => !o)}
        className={clsx(
          'w-full flex items-center justify-between gap-1 px-2 py-1.5 rounded text-xs',
          'bg-[#2d2d30] border border-[#3c3c3c] hover:border-[#6a6a6a] transition-colors',
          open && 'border-[#0e639c]'
        )}
      >
        <span className={clsx('truncate', selected.length === 0 ? 'text-[#6a6a6a]' : accent)}>
          {label}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {selected.length > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); clearAll() }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); clearAll() } }}
              className="text-[#6a6a6a] hover:text-[#cccccc] p-0.5 rounded"
              title="Clear selection"
            >
              <X size={10} />
            </span>
          )}
          <ChevronDown size={12} className={clsx('text-[#6a6a6a] transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-0.5 bg-[#252526] border border-[#3c3c3c] rounded shadow-xl overflow-hidden">
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[#3c3c3c]">
            <Search size={11} className="text-[#6a6a6a] shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search…"
              aria-label="Search columns"
              className="flex-1 bg-transparent text-[11px] text-[#cccccc] outline-none placeholder-[#4a4a4a]"
            />
          </div>

          <div className="flex items-center gap-2 px-2 py-1 border-b border-[#2d2d30]">
            <button type="button" onClick={selectAll} className="text-[10px] text-[#4fc1ff] hover:underline">All</button>
            <span className="text-[#3c3c3c]">·</span>
            <button type="button" onClick={clearAll}  className="text-[10px] text-[#969696] hover:underline">None</button>
            <span className="text-[10px] text-[#6a6a6a] ml-auto">{selected.length}/{options.length}</span>
          </div>

          <div className="max-h-48 overflow-y-auto scrollbar-thin">
            {filtered.length === 0 ? (
              <p className="text-[11px] text-[#6a6a6a] px-3 py-2 italic">No matches</p>
            ) : filtered.map(opt => {
              const on = selected.includes(opt)
              return (
                <label key={opt} className={clsx(
                  'flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-colors',
                  on ? 'bg-[#1e3a5f]/30 hover:bg-[#1e3a5f]/50' : 'hover:bg-[#2d2d30]'
                )}>
                  <input type="checkbox" checked={on} onChange={() => toggle(opt)}
                    className="accent-[#0e639c] cursor-pointer shrink-0" />
                  <span className={clsx('text-[11px] font-mono truncate', on ? accent : 'text-[#969696]')}>
                    {opt}
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
