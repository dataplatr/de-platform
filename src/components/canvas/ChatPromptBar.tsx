import { useState, useRef, type KeyboardEvent } from 'react'
import { Send, Sparkles, Loader2 } from 'lucide-react'
import { useTransformationStore } from '../../store/transformationStore'
import clsx from 'clsx'

const PLACEHOLDER_EXAMPLES = [
  'Filter to closed deals in Q4 2025…',
  'Join orders with customers on customer_id…',
  'Sum revenue by region and product category…',
  'Add a filter where status = "active"…',
]

export function ChatPromptBar() {
  const [input, setInput] = useState('')
  const { isChatLoading, addChatMessage, setChatLoading } = useTransformationStore()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const placeholderIdx = Math.floor(Date.now() / 10000) % PLACEHOLDER_EXAMPLES.length

  const handleSubmit = async () => {
    const trimmed = input.trim()
    if (!trimmed || isChatLoading) return

    const userMsg = {
      id: `msg-${Date.now()}`,
      role: 'user' as const,
      content: trimmed,
      timestamp: new Date().toISOString(),
    }
    addChatMessage(userMsg)
    setInput('')
    setChatLoading(true)

    // TODO: call backend /api/chat in later iteration
    // Simulated response for now
    setTimeout(() => {
      addChatMessage({
        id: `msg-${Date.now()}-reply`,
        role: 'assistant',
        content: `I'll generate a transformation for: "${trimmed}". This will be connected to the backend in the next iteration.`,
        timestamp: new Date().toISOString(),
      })
      setChatLoading(false)
    }, 800)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="border-t border-[#3c3c3c] bg-[#252526] shrink-0 px-3 py-2">
      <div className={clsx(
        'flex items-end gap-2 bg-[#1e1e1e] border rounded-md px-3 py-2 transition-colors',
        'border-[#3c3c3c] focus-within:border-[#0e639c]'
      )}>
        <Sparkles size={14} className="text-[#4fc1ff] shrink-0 mb-0.5" />
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={PLACEHOLDER_EXAMPLES[placeholderIdx]}
          rows={1}
          disabled={isChatLoading}
          className="flex-1 bg-transparent text-xs text-[#cccccc] placeholder-[#6a6a6a] outline-none resize-none leading-5 max-h-24 overflow-y-auto scrollbar-thin disabled:opacity-50"
          style={{ minHeight: '20px' }}
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isChatLoading}
          className={clsx(
            'shrink-0 mb-0.5 p-1 rounded transition-colors',
            input.trim() && !isChatLoading
              ? 'text-[#4fc1ff] hover:bg-[#3c3c3c]'
              : 'text-[#6a6a6a] cursor-not-allowed'
          )}
          title="Send (Enter)"
        >
          {isChatLoading
            ? <Loader2 size={14} className="animate-spin" />
            : <Send size={14} />
          }
        </button>
      </div>
      <div className="mt-1 text-[10px] text-[#6a6a6a] text-right">
        Enter to send · Shift+Enter for new line
      </div>
    </div>
  )
}
